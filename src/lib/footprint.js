// lib/footprint.js
// -----------------------------------------------------------------------------
// Where else does this person exist?
//
// One username, checked across the platforms where professionals actually leave
// work behind. A LinkedIn profile is a claim; a Kaggle competition record, a
// published npm package or three years of Stack Overflow answers are evidence
// somebody else can verify.
//
// Site selection and probe shape follow the approach of the WhatsMyName project
// (github.com/WebBreacher/WhatsMyName, CC BY-SA 4.0), which maintains a
// community dataset of 700+ sites. We deliberately do NOT ship all 700: this is
// a static browser app, nearly every one of those checks is cross-origin, and
// the ones without CORS have to be funnelled through the three public proxies
// in proxyFetch.js. Several hundred proxied requests per candidate would be
// slow, rate-limited and rude. So this is a curated subset, weighted toward
// sites that (a) have a real JSON API, and (b) say something about how someone
// works rather than who they follow.
//
// Everything here reads only public, unauthenticated endpoints — the same pages
// an anonymous visitor sees.
// -----------------------------------------------------------------------------
import { proxyFetch } from "./proxyFetch.js";
import { ghHeaders } from "./github.js";
import { getStoredKey } from "./storage.js";
import { relayAllowed } from "./serp.js";

/* kind: code | writing | community | data | design
   direct:true  -> the endpoint sends CORS headers, so fetch() works from the
                   browser. Fast, and the majority of what we check.
   direct:false -> HTML only, routed through proxyFetch. Slower, best-effort. */
export const SITES = [
  { id: "github", label: "GitHub", kind: "code", direct: true,
    url: (u) => `https://api.github.com/users/${u}`, profile: (u) => `https://github.com/${u}`,
    headers: () => ghHeaders(),
    detail: (d) => [d.name, d.public_repos != null ? `${d.public_repos} repos` : null, d.followers ? `${d.followers} followers` : null].filter(Boolean).join(" · ") },

  { id: "gitlab", label: "GitLab", kind: "code", direct: true,
    url: (u) => `https://gitlab.com/api/v4/users?username=${u}`, profile: (u) => `https://gitlab.com/${u}`,
    found: (d) => Array.isArray(d) && d.length > 0,
    detail: (d) => d[0]?.name || "" },

  { id: "stackoverflow", label: "Stack Overflow", kind: "community", direct: true,
    url: (u) => `https://api.stackexchange.com/2.3/users?inname=${u}&site=stackoverflow&order=desc&sort=reputation`,
    profile: (u) => `https://stackoverflow.com/users?tab=Reputation&filter=all&search=${u}`,
    found: (d) => Array.isArray(d?.items) && d.items.length > 0,
    detail: (d) => { const i = d.items[0]; return `${i.display_name} · ${i.reputation?.toLocaleString()} rep`; },
    profileFrom: (d) => d.items?.[0]?.link },

  { id: "npm", label: "npm", kind: "code", direct: true,
    url: (u) => `https://registry.npmjs.org/-/user/org.couchdb.user:${u}`, profile: (u) => `https://www.npmjs.com/~${u}`,
    found: (d) => !!d?.name, detail: () => "publishes packages" },

  { id: "huggingface", label: "Hugging Face", kind: "data", direct: true,
    url: (u) => `https://huggingface.co/api/users/${u}/overview`, profile: (u) => `https://huggingface.co/${u}`,
    found: (d) => !!d?.user, detail: (d) => d.fullname || "ML models / datasets" },

  { id: "devto", label: "dev.to", kind: "writing", direct: true,
    url: (u) => `https://dev.to/api/articles?username=${u}&per_page=3`, profile: (u) => `https://dev.to/${u}`,
    found: (d) => Array.isArray(d) && d.length > 0,
    detail: (d) => `${d.length === 3 ? "3+" : d.length} post${d.length === 1 ? "" : "s"} · latest: ${d[0]?.title?.slice(0, 48) || ""}` },

  { id: "codeforces", label: "Codeforces", kind: "community", direct: true,
    url: (u) => `https://codeforces.com/api/user.info?handles=${u}`, profile: (u) => `https://codeforces.com/profile/${u}`,
    found: (d) => d?.status === "OK" && d.result?.length,
    detail: (d) => { const r = d.result[0]; return [r.rank, r.rating && `rating ${r.rating}`].filter(Boolean).join(" · "); } },

  { id: "dockerhub", label: "Docker Hub", kind: "code", direct: true,
    url: (u) => `https://hub.docker.com/v2/users/${u}/`, profile: (u) => `https://hub.docker.com/u/${u}`,
    found: (d) => !!d?.username, detail: () => "publishes images" },

  { id: "hackernews", label: "Hacker News", kind: "community", direct: true,
    url: (u) => `https://hacker-news.firebaseio.com/v0/user/${u}.json`, profile: (u) => `https://news.ycombinator.com/user?id=${u}`,
    found: (d) => !!d?.id, detail: (d) => `${d.karma ?? 0} karma${d.created ? ` · since ${new Date(d.created * 1000).getFullYear()}` : ""}` },

  { id: "reddit", label: "Reddit", kind: "community", direct: false,
    url: (u) => `https://www.reddit.com/user/${u}/about.json`, profile: (u) => `https://www.reddit.com/user/${u}/`,
    found: (d) => !!d?.data?.name,
    detail: (d) => `${(d.data.link_karma || 0) + (d.data.comment_karma || 0)} karma` },

  { id: "kaggle", label: "Kaggle", kind: "data", direct: false, html: true,
    url: (u) => `https://www.kaggle.com/${u}`, profile: (u) => `https://www.kaggle.com/${u}`,
    foundHtml: (t, u) => new RegExp(`"userName"\\s*:\\s*"${u}"`, "i").test(t) || t.includes(`/${u}/competitions`),
    detail: () => "competitions / notebooks" },

  { id: "medium", label: "Medium", kind: "writing", direct: false, html: true,
    url: (u) => `https://medium.com/feed/@${u}`, profile: (u) => `https://medium.com/@${u}`,
    foundHtml: (t) => t.includes("<rss") && t.includes("<item>"), detail: () => "publishes articles" },

  { id: "behance", label: "Behance", kind: "design", direct: false, html: true,
    url: (u) => `https://www.behance.net/${u}`, profile: (u) => `https://www.behance.net/${u}`,
    foundHtml: (t, u) => t.toLowerCase().includes(`behance.net/${u.toLowerCase()}`), detail: () => "design portfolio" },

  { id: "dribbble", label: "Dribbble", kind: "design", direct: false, html: true,
    url: (u) => `https://dribbble.com/${u}`, profile: (u) => `https://dribbble.com/${u}`,
    foundHtml: (t, u) => t.toLowerCase().includes(`dribbble.com/${u.toLowerCase()}`), detail: () => "design portfolio" },

  { id: "pypi", label: "PyPI", kind: "code", direct: false, html: true,
    url: (u) => `https://pypi.org/user/${u}/`, profile: (u) => `https://pypi.org/user/${u}/`,
    foundHtml: (t) => t.includes("package-snippet") || t.includes("Packages"), detail: () => "publishes packages" },

  { id: "speakerdeck", label: "Speaker Deck", kind: "writing", direct: false, html: true,
    url: (u) => `https://speakerdeck.com/${u}`, profile: (u) => `https://speakerdeck.com/${u}`,
    foundHtml: (t, u) => t.toLowerCase().includes(`speakerdeck.com/${u.toLowerCase()}`), detail: () => "conference talks" },
];

const TIMEOUT_MS = 9000;

async function checkDirect(site, username) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(site.url(username), { headers: site.headers?.() || {}, signal: controller.signal });
    if (!res.ok) return { found: false };
    const data = await res.json();
    const found = site.found ? site.found(data) : !!data;
    if (!found) return { found: false };
    return { found: true, detail: safeDetail(site, data), url: site.profileFrom?.(data) || site.profile(username) };
  } catch { return { found: false, unchecked: true }; }
  finally { clearTimeout(timer); }
}

async function checkProxied(site, username) {
  try {
    const text = await proxyFetch(site.url(username));
    if (site.html) {
      return site.foundHtml(text, username)
        ? { found: true, detail: safeDetail(site), url: site.profile(username) }
        : { found: false };
    }
    const data = JSON.parse(text);
    const found = site.found ? site.found(data) : !!data;
    return found ? { found: true, detail: safeDetail(site, data), url: site.profile(username) } : { found: false };
  } catch { return { found: false, unchecked: true }; }
}

/* A site's own detail formatter runs over data we did not write. One malformed
   response must not take the whole panel down with it. */
function safeDetail(site, data) {
  try { return site.detail?.(data) || ""; } catch { return ""; }
}

/* Check every site at once and report each outcome separately.
   `unchecked` is distinct from `found:false` on purpose: a proxy that timed out
   is not evidence the account doesn't exist, and saying so would be a lie the
   recruiter can't see through. */
export async function findFootprint(username, { only = null, onResult, read = getStoredKey } = {}) {
  const u = String(username || "").trim().replace(/^@/, "");
  if (!u || /\s/.test(u)) return [];
  const sites = only ? SITES.filter((s) => only.includes(s.id)) : SITES;

  /* The non-CORS sites are reached through the public relays, which means the
     relay operator learns that someone is looking up this person. That is a
     lookup of a named individual, so it is opt-in — the direct sites, which are
     the majority, still run either way. */
  const mayRelay = relayAllowed(read);

  return Promise.all(sites.map(async (site) => {
    if (!site.direct && !mayRelay) {
      const row = { id: site.id, label: site.label, kind: site.kind, profile: site.profile(u), found: false, skipped: "needs the public relay" };
      onResult?.(row);
      return row;
    }
    const outcome = site.direct ? await checkDirect(site, u) : await checkProxied(site, u);
    const row = { id: site.id, label: site.label, kind: site.kind, profile: site.profile(u), ...outcome };
    onResult?.(row);
    return row;
  }));
}

export const foundOnly = (rows = []) => rows.filter((r) => r.found);
