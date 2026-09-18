// lib/docFinder.js
// -----------------------------------------------------------------------------
// Find a candidate's own public documents — CV, portfolio, deck — with a SERP
// filetype query, then PROVE each hit belongs to that candidate before showing
// it.
//
// The proving is the whole job. `"Asha Rao" "Freshworks" (resume OR cv)
// filetype:pdf` returns any PDF that merely mentions those words: conference
// programmes, delegate lists, company brochures, university merit lists, and an
// entire industry of "resume sample/template/format" sites. Shipping those as
// "this candidate's CV" is worse than showing nothing, because it invites the
// recruiter to act on a document about somebody else.
//
// So a result is kept only when the candidate's own NAME is in the filename or
// the title — how people actually name a CV they published — and it survives
// the junk filters below. Everything kept carries a confidence and the reason
// it scored, so the card can show its work rather than asserting.
//
// Runs on demand (one candidate, one click), never as a batch over every
// result: a SERP call per profile would multiply the Apify bill by the size of
// the result set for documents most candidates don't have.
// -----------------------------------------------------------------------------
import { searchWeb } from "./serp.js";

export const DOC_TYPES = {
  pdf: { label: "PDF", ext: ["pdf"] },
  doc: { label: "Word", ext: ["doc", "docx"] },
  ppt: { label: "Slides", ext: ["ppt", "pptx"] },
};

/* Sites that host other people's documents in bulk. A CV genuinely published
   by the candidate does not live here, but scraped copies and template farms
   do — and they rank well, which is why they kept surfacing. */
const AGGREGATOR_HOSTS = [
  "scribd.com", "slideshare.net", "coursehero.com", "studocu.com", "docplayer.net",
  "pdfcoffee.com", "vdocuments.net", "dokumen.pub", "123dok.com", "idoc.pub",
  "academia.edu", "researchgate.net", "yumpu.com", "fliphtml5.com", "calameo.com",
  "resume.io", "novoresume.com", "zety.com", "naukri.com", "indeed.com", "livecareer.com",
];

/* Document KINDS that are never one person's CV, however well the name matches
   — a delegate list contains hundreds of real names, which is precisely how a
   name-matching filter gets fooled. */
const LISTING_PATTERNS = /\b(list of|name list|merit list|selected candidates|shortlist(ed)?|participants?|attendees?|delegates?|speakers? list|directory|roll (no|number)|admit card|result sheet|marks? sheet|gazette|notification|tender|circular|minutes|agenda|syllabus|prospectus|proceedings|newsletter|annual report|brochure|price list|catalogue|catalog)\b/i;

/* The resume-template industry. These pages are ABOUT resumes, not someone's. */
const TEMPLATE_PATTERNS = /\b(sample|template|format|example|guide|how to write|writing tips|blank|fillable|cover letter template)\b/i;

/* Words that mark a document as a personal career document. */
const CV_VOCAB = /\b(resume|resum|cv|curriculum vitae|curriculumvitae|portfolio|biodata|bio-data)\b/i;

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/* Name tokens worth matching on. Initials and one-letter particles match far
   too much ("li" inside "public"), so only tokens of 3+ characters count. */
export function nameTokens(name) {
  return words(name).filter((w) => w.length >= 3);
}

/* Does this text carry the candidate's name? Separator-insensitive, because a
   published CV is called asha-rao-resume.pdf, AshaRao_CV.docx or Rao,Asha.pdf.
   Both orders count: surname-first filenames are as common as given-name-first. */
export function matchesName(haystack, name) {
  const toks = nameTokens(name);
  if (!toks.length) return false;
  const flat = norm(haystack);
  if (!flat) return false;
  const joined = toks.join("");
  const reversed = [...toks].reverse().join("");
  if (toks.length > 1 && (flat.includes(joined) || flat.includes(reversed))) return "full";
  // Every token present but scattered — weaker, and single-token names (one
  // word, e.g. a mononym) can only ever reach this level.
  return toks.every((t) => flat.includes(t)) ? "partial" : false;
}

export function buildDocQuery(name, { org = "", types = ["pdf", "doc", "ppt"] } = {}) {
  const exts = types.flatMap((t) => DOC_TYPES[t]?.ext || []);
  const filetype = "(" + exts.map((e) => `filetype:${e}`).join(" OR ") + ")";
  const who = [`"${name}"`, org && `"${org}"`].filter(Boolean).join(" ");
  /* The negative terms carry real weight: "resume sample/template/format" is a
     whole content industry that outranks actual people. The role is left out
     of the query on purpose — unquoted role words steered Google toward job
     ads; it is used for scoring instead. */
  return `${who} (resume OR cv OR "curriculum vitae" OR portfolio) ${filetype} -sample -template -format -"cover letter"`.trim();
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

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const fileOf = (url) => { try { return decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); } catch { return String(url).split("/").pop() || ""; } };

/* Score one result against the candidate. Returns {confidence, why[], keep}.
   The filename is weighted hardest: a person naming a file after themselves is
   the strongest available signal of authorship, whereas a name in the body of
   a document only proves the document mentions them. */
export function scoreDoc({ url = "", title = "", snippet = "" }, { name, org = "", role = "" } = {}) {
  const why = [];
  const host = hostOf(url);
  const file = fileOf(url);
  const haystack = `${title} ${snippet}`;

  if (AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
    return { confidence: 0, keep: false, why: [`${host} republishes other people's documents`] };
  }
  if (LISTING_PATTERNS.test(haystack) || LISTING_PATTERNS.test(file)) {
    return { confidence: 0, keep: false, why: ["reads as a list or notice, not one person's CV"] };
  }
  if (TEMPLATE_PATTERNS.test(haystack) || TEMPLATE_PATTERNS.test(file)) {
    return { confidence: 0, keep: false, why: ["a resume template or sample, not a person"] };
  }

  const inFile = matchesName(file, name);
  const inTitle = matchesName(title, name);
  const inSnippet = matchesName(snippet, name);

  let confidence = 0;
  if (inFile === "full") { confidence += 0.55; why.push("named in the filename"); }
  else if (inFile === "partial") { confidence += 0.3; why.push("filename carries the name"); }
  if (inTitle === "full") { confidence += 0.3; why.push("named in the title"); }
  else if (inTitle === "partial") { confidence += 0.15; why.push("title carries the name"); }
  if (!inFile && !inTitle && inSnippet) { confidence += 0.1; why.push("mentioned in the text"); }

  if (CV_VOCAB.test(file)) { confidence += 0.2; why.push("filename says CV"); }
  else if (CV_VOCAB.test(haystack)) { confidence += 0.1; why.push("reads as a CV"); }

  if (org && norm(haystack).includes(norm(org))) { confidence += 0.1; why.push(`mentions ${org}`); }
  const roleHits = words(role).filter((w) => w.length > 3 && words(haystack).includes(w));
  if (roleHits.length) { confidence += 0.05; why.push("role words match"); }

  confidence = Math.min(1, +confidence.toFixed(2));

  /* The gate: the name must be in the filename or the title. A name that only
     appears in the snippet means the document mentions this person — a list, a
     programme, an author credit — not that it is theirs. That single rule is
     what stops the random documents. */
  const authored = inFile !== false || inTitle !== false;
  return { confidence, keep: authored && confidence >= 0.5, why };
}

export const confidenceLabel = (c) => (c >= 0.8 ? "strong" : c >= 0.65 ? "likely" : "possible");

/* Goes through lib/serp.js, so a CV lookup works on whichever backend the user
   has — Brave, a self-hosted SearXNG, the keyless engines, or Apify. It used to
   call the Apify actor directly, which meant no token, no CV search.
   `serpFetch` stays injectable for tests and for swapping in another source. */
/* Marked sensitive: this query always carries a named individual and usually
   their employer, so it must not be relayed through a public CORS proxy unless
   the user has opted in. See RELAY_OPT_IN in lib/serp.js. */
const defaultSerp = async (query) => (await searchWeb(query, { count: 15, sensitive: true })).rows;

export async function findCandidateDocs(name, ctx = {}, { serpFetch = defaultSerp } = {}) {
  if (!name || typeof serpFetch !== "function") return [];
  const results = await serpFetch(buildDocQuery(name, ctx));
  const seen = new Set();
  const docs = [];
  for (const r of results || []) {
    const url = r?.url;
    if (!url || seen.has(url)) continue;
    const type = classify(url);
    if (type === "other") continue; // the SERP returns pages too; keep files only
    const verdict = scoreDoc({ url, title: r.title, snippet: r.snippet }, { name, ...ctx });
    if (!verdict.keep) continue;
    seen.add(url);
    docs.push({
      url, type,
      title: r.title || fileOf(url) || url,
      confidence: verdict.confidence,
      label: confidenceLabel(verdict.confidence),
      why: verdict.why,
    });
  }
  // Best evidence first, so the strongest match is the one they click.
  return docs.sort((a, b) => b.confidence - a.confidence);
}
