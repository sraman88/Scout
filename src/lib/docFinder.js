// lib/docFinder.js
// -----------------------------------------------------------------------------
// Find a candidate's own public documents — CV, portfolio, deck — with a SERP
// filetype query. This is the cheapest evidence there is: a PDF the candidate
// published themselves says more than any scraped bio, and costs one search.
//
// Runs on demand (one candidate, one click), never as a batch over every
// result: a SERP call per profile would multiply the Apify bill by the size of
// the result set for documents most candidates don't have.
// -----------------------------------------------------------------------------
import { searchGoogleResults } from "./apifySearch.js";

export const DOC_TYPES = {
  pdf: { label: "PDF", ext: ["pdf"] },
  doc: { label: "Word", ext: ["doc", "docx"] },
  ppt: { label: "Slides", ext: ["ppt", "pptx"] },
};

export function buildDocQuery(name, { org = "", role = "", types = ["pdf", "doc", "ppt"] } = {}) {
  const exts = types.flatMap((t) => DOC_TYPES[t]?.ext || []);
  const filetype = "(" + exts.map((e) => `filetype:${e}`).join(" OR ") + ")";
  const who = [`"${name}"`, org && `"${org}"`, role].filter(Boolean).join(" ");
  return `${who} (resume OR cv OR portfolio OR profile) ${filetype}`.trim();
}

// Type from the URL, since SERP results carry no MIME. Query strings and
// fragments are common on file links, so match the extension, not the tail.
export function classify(url = "") {
  const u = String(url).toLowerCase();
  if (/\.pdf(\?|#|$)/.test(u)) return "pdf";
  if (/\.docx?(\?|#|$)/.test(u)) return "doc";
  if (/\.pptx?(\?|#|$)/.test(u)) return "ppt";
  return "other";
}

/* The default SERP is the Apify Google actor the rest of the app already uses,
   so this needs no extra key. `serpFetch` stays injectable for tests and for
   swapping in another SERP source. */
const apifySerp = async (query) => {
  const rows = await searchGoogleResults({ query, maxResults: 10 });
  return rows.map((r) => ({ url: r.profile_url, title: r.name }));
};

export async function findCandidateDocs(name, ctx = {}, { serpFetch = apifySerp } = {}) {
  if (!name || typeof serpFetch !== "function") return [];
  const results = await serpFetch(buildDocQuery(name, ctx));
  const seen = new Set();
  const docs = [];
  for (const r of results || []) {
    const url = r?.url;
    if (!url || seen.has(url)) continue;
    const type = classify(url);
    if (type === "other") continue; // the SERP returns pages too; keep files only
    seen.add(url);
    docs.push({ url, title: r.title || url, type });
  }
  return docs;
}
