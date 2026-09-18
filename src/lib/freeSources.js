// lib/freeSources.js
// -----------------------------------------------------------------------------
// Candidate sources that cost nothing and need no vendor.
//
// For engineering roles, LinkedIn is not the only place people are findable —
// it is just the place they describe themselves. These sources find people by
// what they PUBLISHED, which is both free and better evidence:
//
//   dev.to        — who writes about this technology
//   Hugging Face  — who publishes models and datasets in this area
//   GitLab        — who maintains projects on this topic (the half of the
//                   open-source world that isn't on GitHub)
//
// GitHub and Stack Overflow are already first-class elsewhere in the app; these
// fill the gaps around them. All three are public, unauthenticated JSON APIs.
//
// This does NOT help the non-technical crafts — HR, sales, finance and
// marketing people do not publish packages, and for them the LinkedIn X-ray in
// xraySearch.js remains the keyless path. That limitation is real and is why
// this is additive rather than a replacement.
// -----------------------------------------------------------------------------
import { fetchWithTimeout } from "./http.js";

const TIMEOUT = 12000;

async function getJson(url) {
  const res = await fetchWithTimeout(url, { timeoutMs: TIMEOUT, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return res.json();
}

/* A skill phrase like "Apache Kafka" is not a tag. Tags are single lowercase
   tokens, so take the most distinctive word. */
export function toTag(skill = "") {
  // Guard first: String(null) is "null", which would have queried dev.to for a
  // tag literally called "null".
  if (!skill) return "";
  const words = String(skill).toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
  if (!words.length) return "";
  const skip = new Set(["apache", "the", "and", "for", "with", "js", "framework", "library"]);
  return (words.find((w) => w.length > 2 && !skip.has(w)) || words[0]).replace(/[^a-z0-9+#]/g, "");
}

/* dev.to — people who write about a technology. Authorship of an article about
   Kafka is a much stronger signal than the word "Kafka" on a profile. */
export async function searchDevTo({ skill, limit = 10 } = {}) {
  const tag = toTag(skill);
  if (!tag) return [];
  const posts = await getJson(`https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=${Math.min(30, limit * 3)}`);
  const byUser = new Map();
  for (const p of Array.isArray(posts) ? posts : []) {
    const u = p?.user?.username;
    if (!u || byUser.has(u)) continue;
    byUser.set(u, {
      source: "devto",
      username: u,
      name: p.user.name || u,
      bio: `Writes about ${tag}`,
      summary: p.title || "",
      profile_url: `https://dev.to/${u}`,
      evidence_url: p.url || "",
      location: "",
      via: "devto",
    });
    if (byUser.size >= limit) break;
  }
  return [...byUser.values()];
}

/* Hugging Face — authors of models and datasets. The highest-signal free source
   for ML hiring: publishing a model is a working artefact, not a claim. */
export async function searchHuggingFace({ skill, limit = 10 } = {}) {
  const q = String(skill || "").trim();
  if (!q) return [];
  const models = await getJson(`https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=${Math.min(50, limit * 4)}&sort=downloads`);
  const byUser = new Map();
  for (const m of Array.isArray(models) ? models : []) {
    // modelId is "author/name"; models with no slash are owned by HF itself.
    const author = String(m?.modelId || m?.id || "").split("/")[0];
    if (!author || author === m?.modelId || byUser.has(author)) continue;
    byUser.set(author, {
      source: "huggingface",
      username: author,
      name: author,
      bio: `Publishes ML models (${q})`,
      summary: m.modelId || "",
      profile_url: `https://huggingface.co/${author}`,
      evidence_url: `https://huggingface.co/${m.modelId || m.id}`,
      location: "",
      via: "huggingface",
    });
    if (byUser.size >= limit) break;
  }
  return [...byUser.values()];
}

/* GitLab — the projects GitHub search never sees. Verified to send
   access-control-allow-origin:*, so it works from the browser directly. */
export async function searchGitLab({ skill, limit = 10 } = {}) {
  const q = String(skill || "").trim();
  if (!q) return [];
  const projects = await getJson(`https://gitlab.com/api/v4/projects?search=${encodeURIComponent(q)}&per_page=${Math.min(50, limit * 3)}&order_by=star_count&sort=desc`);
  const byUser = new Map();
  for (const p of Array.isArray(projects) ? projects : []) {
    const ns = p?.namespace;
    // Only personal namespaces are people; a group namespace is a company.
    if (!ns || ns.kind !== "user" || byUser.has(ns.path)) continue;
    byUser.set(ns.path, {
      source: "gitlab",
      username: ns.path,
      name: ns.name || ns.path,
      bio: `Maintains ${q} projects on GitLab`,
      summary: p.description || p.name_with_namespace || "",
      profile_url: `https://gitlab.com/${ns.path}`,
      evidence_url: p.web_url || "",
      stars: p.star_count || 0,
      location: "",
      via: "gitlab",
    });
    if (byUser.size >= limit) break;
  }
  return [...byUser.values()];
}

export const FREE_SOURCES = [
  { id: "devto", label: "dev.to", run: searchDevTo },
  { id: "huggingface", label: "Hugging Face", run: searchHuggingFace },
  { id: "gitlab", label: "GitLab", run: searchGitLab },
];

/* Run them all for one skill. Each failure is isolated and reported rather than
   thrown, because one dead endpoint must not cost the others. */
export async function searchFreeSources({ skill, only = null, limit = 10 } = {}) {
  const picked = only ? FREE_SOURCES.filter((s) => only.includes(s.id)) : FREE_SOURCES;
  const out = await Promise.all(picked.map(async (s) => {
    try { return { id: s.id, label: s.label, people: await s.run({ skill, limit }) }; }
    catch (e) { return { id: s.id, label: s.label, people: [], error: e.message || String(e) }; }
  }));
  return out;
}
