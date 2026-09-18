// lib/serp.js
// -----------------------------------------------------------------------------
// One search interface, several interchangeable backends.
//
// Scout used to reach the web through exactly one paid vendor: the Apify Google
// actor. Without that token, every non-technical search — HR, sales, finance,
// marketing, the families that live on LinkedIn — had no usable source at all.
// That is a single point of both failure and billing.
//
// Backends are tried in order of what the user has configured, best first, and
// each one normalises to the same {url, title, snippet} row so callers never
// know or care which answered:
//
//   1. Brave Search API   — a real SERP API, needs a key (~$5/1000 queries)
//   2. SearXNG            — self-hosted, unlimited, needs a URL you run
//   3. Keyless engines    — DuckDuckGo Lite + Mojeek through the CORS proxies
//   4. Apify Google actor — the original path, now last rather than only
//
// The keyless tier is always present, so Scout works with no search key at all.
// Apify sits last on purpose: it still works, but nothing depends on it.
// -----------------------------------------------------------------------------
import { getStoredKey } from "./storage.js";
import { proxyFetch } from "./proxyFetch.js";
import { fetchWithTimeout } from "./http.js";

/* A normalised result row. Every backend produces these and nothing else. */
const row = (url, title, snippet, via) => ({ url: String(url || ""), title: String(title || ""), snippet: String(snippet || ""), via });

const dedupe = (rows) => {
  const seen = new Set();
  return rows.filter((r) => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
};

// --- 1. Brave -----------------------------------------------------------------
export async function braveSearch(query, { key, count = 15 } = {}) {
  const res = await fetchWithTimeout(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    { timeoutMs: 15000, headers: { Accept: "application/json", "X-Subscription-Token": key } }
  );
  if (res.status === 401 || res.status === 403) throw new Error("Brave rejected the key — check it in Settings.");
  if (res.status === 429) throw new Error("Brave rate limit reached for this key.");
  if (!res.ok) throw new Error(`Brave returned ${res.status}`);
  const data = await res.json();
  return (data?.web?.results || []).map((r) => row(r.url, r.title, r.description, "brave"));
}

// --- 2. SearXNG ---------------------------------------------------------------
/* Any SearXNG instance with the JSON format enabled. Self-hosted means no key,
   no quota and no vendor — at the cost of running it. */
export async function searxngSearch(query, { baseUrl, count = 15 } = {}) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${base}/search?q=${encodeURIComponent(query)}&format=json`, { timeoutMs: 15000 });
  if (!res.ok) throw new Error(`SearXNG returned ${res.status} — is the JSON format enabled?`);
  const data = await res.json();
  return (data?.results || []).slice(0, count).map((r) => row(r.url, r.title, r.content, "searxng"));
}

// --- 3. Keyless engines -------------------------------------------------------
/* Scraped through the same public text proxies the JD fetcher uses. Lower yield
   and more fragile than an API — a layout change breaks a parser — so two
   engines run in parallel and a failure in one is survivable. */

/* DuckDuckGo Lite, via r.jina.ai, arrives as markdown: "1.[Title](url)" then
   the snippet. This parser has been in production on the LinkedIn X-ray. */
const DDG_ENTRY = /^\d+\.\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\n([\s\S]*?)(?=\n\d+\.\[|\n*$)/gm;

export function parseDdgLite(text) {
  const out = [];
  for (const m of String(text || "").matchAll(DDG_ENTRY)) {
    const url = unwrapDdg(m[2]);
    if (!url) continue;
    out.push(row(url, m[1], (m[3] || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim(), "ddg"));
  }
  return out;
}

/* DDG wraps outbound links in a redirect carrying the real target in ?uddg=. */
export function unwrapDdg(href) {
  try {
    const u = new URL(href);
    const real = u.searchParams.get("uddg");
    const out = real ? decodeURIComponent(real) : href;
    /* The unwrapped target comes from a scraped page, and generalising this
       away from the old LinkedIn-only filter dropped its implicit scheme check.
       Results become hrefs, so only http(s) may pass. */
    return /^https?:\/\//i.test(out) ? out : "";
  } catch { return ""; }
}

/* Mojeek has its own index rather than reselling Bing or Google, so it fails
   independently of DDG — which is the point of running both. Its results come
   back as markdown links through the same text proxy. */
const MOJEEK_ENTRY = /\[([^\]]{3,})\]\((https?:\/\/[^)\s]+)\)/g;
const MOJEEK_CHROME = /mojeek|\/search\?|^https?:\/\/(www\.)?mojeek\.com/i;

export function parseMojeek(text) {
  const out = [];
  for (const m of String(text || "").matchAll(MOJEEK_ENTRY)) {
    const url = m[2];
    if (MOJEEK_CHROME.test(url)) continue; // the engine's own nav links
    out.push(row(url, m[1].trim(), "", "mojeek"));
  }
  return out;
}

export async function keylessSearch(query, { fetchText = proxyFetch, engines = ["ddg", "mojeek"] } = {}) {
  const jobs = [];
  if (engines.includes("ddg")) {
    jobs.push(fetchText(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`).then(parseDdgLite).catch(() => []));
  }
  if (engines.includes("mojeek")) {
    jobs.push(fetchText(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`).then(parseMojeek).catch(() => []));
  }
  const batches = await Promise.all(jobs);
  return dedupe(batches.flat());
}

// --- 4. Apify (unchanged behaviour, now merely one option) --------------------
async function apifySearch(query, { count = 15 } = {}) {
  const { searchGoogleResults } = await import("./apifySearch.js");
  const rows = await searchGoogleResults({ query, maxResults: count });
  return rows.map((r) => row(r.profile_url, r.name, r.bio, "apify"));
}

/* The keyless tier reaches the engines through the public CORS relays in
   proxyFetch.js — r.jina.ai, allorigins, codetabs — which means the QUERY TEXT
   is visible to whoever runs them. For a role title that is unremarkable. For a
   query naming a private individual ("Asha Rao" "Freshworks" resume) it is
   personal data handed to an unvetted third party, which a recruiting product
   should not do silently: under DPDP and GDPR that relay is a processor nobody
   agreed to. So a search can declare itself sensitive, and sensitive searches
   skip the relays unless the user has explicitly opted in. */
export const RELAY_OPT_IN = "allow_public_relay";

/* True when the user has accepted that the relay operators see the query.
   Any lookup keyed on a PERSON — their name, handle or profile — must consult
   this before reaching for proxyFetch. */
export const relayAllowed = (read = getStoredKey) => read(RELAY_OPT_IN) === "1";

export function availableBackends(read = getStoredKey, { sensitive = false } = {}) {
  const out = [];
  if (read("brave_key")) out.push({ id: "brave", label: "Brave Search API" });
  if (read("searxng_url")) out.push({ id: "searxng", label: "SearXNG" });
  // Direct, contracted or self-hosted backends above; public relays below.
  if (!sensitive || relayAllowed(read)) out.push({ id: "keyless", label: "DuckDuckGo + Mojeek" });
  if (read("apify")) out.push({ id: "apify", label: "Apify Google actor" });
  return out;
}

/* Run the query against the best available backend, falling through on failure.
   Returns {rows, via, tried} so a caller can report which backend answered
   rather than silently returning fewer results. */
export async function searchWeb(query, { count = 15, read = getStoredKey, impls = {}, sensitive = false } = {}) {
  if (!String(query || "").trim()) return { rows: [], via: null, tried: [] };

  const run = {
    brave: () => (impls.brave || braveSearch)(query, { key: read("brave_key"), count }),
    searxng: () => (impls.searxng || searxngSearch)(query, { baseUrl: read("searxng_url"), count }),
    keyless: () => (impls.keyless || keylessSearch)(query, {}),
    apify: () => (impls.apify || apifySearch)(query, { count }),
    ...(impls.extra || {}),
  };

  const backends = availableBackends(read, { sensitive });
  /* Nothing left once the relays are excluded: say so instead of quietly
     returning no results, which would read as "this person has no CV". */
  if (!backends.length) {
    throw new Error(
      "This search names a person, so Scout won't send it through the public relays. " +
      "Add a Brave key, a SearXNG URL or an Apify token in Settings — or allow the public relay there if you accept that those operators see the query."
    );
  }

  const tried = [];
  let lastErr = null;
  for (const backend of backends) {
    try {
      const rows = await run[backend.id]();
      tried.push({ id: backend.id, count: rows.length });
      if (rows.length) return { rows: dedupe(rows).slice(0, count), via: backend.id, tried };
    } catch (e) {
      lastErr = e;
      tried.push({ id: backend.id, error: e.message || String(e) });
    }
  }
  /* Every backend empty is a real answer; every backend throwing is not, and
     the caller needs to know the difference. */
  if (tried.every((t) => t.error)) throw lastErr || new Error("No search backend available");
  return { rows: [], via: null, tried };
}
