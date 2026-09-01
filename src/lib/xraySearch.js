import { proxyFetch } from "./proxyFetch.js";

/* Keyless LinkedIn X-ray.

   LinkedIn and Google both run through Apify, so without that token every
   non-technical search (HR, sales, finance, marketing) had NO usable source
   and returned "No candidates came back from any source" — the very families
   that live on LinkedIn were the ones that couldn't search it.

   DuckDuckGo Lite is scrapable through the same text proxy the JD fetcher
   uses, and site:linkedin.com/in returns real people with names, headlines
   and profile URLs. Lower yield than the paid actor, but free, and it makes
   the product work with only an LLM key. */

/* DDG handles OR-groups badly — one combined query returned 2 results where
   the same titles asked separately returned 6 each. So: one query per title,
   run in parallel, merged. */
export function buildXrayQuery({ title, location = "", extra = [] }) {
  const parts = ["site:linkedin.com/in", `"${title}"`];
  for (const e of extra.filter(Boolean).slice(0, 2)) parts.push(`"${e}"`);
  if (location) parts.push(location);
  return parts.join(" ");
}

const ENTRY = /^\d+\.\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\n([\s\S]*?)(?=\n\d+\.\[|\n*$)/gm;

/* LinkedIn's country subdomain is the only location signal an X-ray gives us.
   Guessing beyond that would feed the prefilter a location the profile never
   claimed, so anything else stays blank. */
const COUNTRY = {
  in: "India", uk: "United Kingdom", ae: "United Arab Emirates", sg: "Singapore",
  au: "Australia", ca: "Canada", de: "Germany", fr: "France", nl: "Netherlands",
  ie: "Ireland", za: "South Africa", my: "Malaysia", ph: "Philippines",
};

function realUrl(href) {
  try {
    const uddg = new URL(href).searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return /linkedin\.com\/in\//i.test(href) ? href : "";
  } catch { return ""; }
}

const ROLE_WORDS = /\b(hr|human|resources|manager|partner|director|senior|lead|head|specialist|executive|officer|analyst|consultant|recruiter|engineer|business)\b/i;

/* Some results title themselves with the job, not the person ("Senior HR
   Business Partner @ Amazon"). The profile slug still carries the real name,
   so fall back to it and drop the role words people append to their handle. */
function nameFromSlug(username) {
  return username
    .replace(/-?\b(hr|human-?resources|business-?partner|manager|director|recruiter|official)\b/gi, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function splitTitle(raw, username) {
  const cleaned = String(raw).replace(/\s*[-|–—]\s*LinkedIn.*$/i, "").trim();
  const bits = cleaned.split(/\s+[-–—|]\s+/);
  let name = (bits.shift() || "").trim();
  const headline = bits.join(" · ").trim();

  const looksLikeTitle = ROLE_WORDS.test(name) || name.includes("@");
  if (looksLikeTitle) {
    const fromSlug = nameFromSlug(username);
    if (fromSlug && fromSlug.split(" ").length <= 4) return { name: fromSlug, headline: headline || cleaned };
  }
  return { name, headline };
}

function parse(text) {
  const out = [];
  for (const m of text.matchAll(ENTRY)) {
    const url = realUrl(m[2]);
    if (!url || !/linkedin\.com\/in\//i.test(url)) continue;

    const username = (url.split("/in/")[1] || "").replace(/[/?#].*$/, "");
    if (!username) continue;

    const { name, headline } = splitTitle(m[1], username);
    const snippet = (m[3] || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    const host = (url.match(/https?:\/\/([a-z]{2})\.linkedin\.com/i) || [])[1]?.toLowerCase();

    out.push({
      source: "linkedin",
      username,
      name: (name || username).replace(/[‎‏‪-‮]/g, "").trim(),
      bio: headline || snippet.slice(0, 140),
      summary: snippet.slice(0, 400),
      profile_url: url.startsWith("http") ? url : `https://${url}`,
      location: COUNTRY[host] || "",
      via: "xray",
    });
  }
  return out;
}

export async function searchLinkedInXray({ titles = [], location = "", extra = [], limit = 15 }) {
  const picks = titles.filter(Boolean).slice(0, 3);
  if (!picks.length) return [];

  const batches = await Promise.all(picks.map(async (title) => {
    try {
      return parse(await proxyFetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(buildXrayQuery({ title, location, extra }))}`));
    } catch {
      return []; // one blocked query shouldn't sink the rest
    }
  }));

  const seen = new Set();
  const merged = [];
  for (const p of batches.flat()) {
    if (seen.has(p.username)) continue;
    seen.add(p.username);
    merged.push(p);
    if (merged.length >= limit) break;
  }
  return merged;
}
