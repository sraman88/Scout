import { buildDocQuery, classify, findCandidateDocs, DOC_TYPES } from "../src/lib/docFinder.js";

/* The SERP returns whatever Google had — pages, duplicates, files behind query
   strings. What reaches a card must be files only, once each, typed correctly,
   because the preview picks its viewer off `type`. */

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};

// --- query -------------------------------------------------------------------
{
  const q = buildDocQuery("Asha Rao", { org: "Freshworks", role: "support engineer" });
  check("quotes the name and the company", q.includes('"Asha Rao"') && q.includes('"Freshworks"'), q);
  check("asks for every document extension", Object.values(DOC_TYPES).flatMap((t) => t.ext).every((e) => q.includes(`filetype:${e}`)), q);

  const narrow = buildDocQuery("Asha Rao", { types: ["pdf"] });
  check("narrows to the requested types", narrow.includes("filetype:pdf") && !narrow.includes("filetype:docx"), narrow);
  check("omits an unknown company cleanly", !narrow.includes('""'), narrow);
}

// --- classification ----------------------------------------------------------
{
  check("types a plain PDF", classify("https://x.com/cv.pdf") === "pdf");
  check("ignores case and query strings", classify("https://x.com/CV.PDF?dl=1") === "pdf");
  check("types Word and PowerPoint", classify("https://x.com/a.docx") === "doc" && classify("https://x.com/a.ppt") === "ppt");
  check("a web page is not a document", classify("https://linkedin.com/in/asha") === "other");
  check("survives a missing url", classify() === "other" && classify(null) === "other");
}

// --- the fetch ---------------------------------------------------------------
{
  const serpFetch = async () => [
    { url: "https://x.com/asha-cv.pdf", title: "Asha Rao — CV" },
    { url: "https://x.com/asha-cv.pdf", title: "same file again" },
    { url: "https://linkedin.com/in/asha", title: "LinkedIn" },
    { url: "https://x.com/deck.pptx" },
    { url: "" },
  ];
  const docs = await findCandidateDocs("Asha Rao", {}, { serpFetch });
  check("keeps files only, once each", docs.length === 2, docs);
  check("carries type and title through", docs[0].type === "pdf" && docs[0].title === "Asha Rao — CV", docs[0]);
  check("falls back to the url when a title is missing", docs[1].title === "https://x.com/deck.pptx", docs[1]);

  check("a nameless candidate costs no search", (await findCandidateDocs("", {}, { serpFetch: () => { throw new Error("should not run"); } })).length === 0);
  check("an empty SERP is an empty list", (await findCandidateDocs("Asha", {}, { serpFetch: async () => null })).length === 0);
}

// A failing SERP must surface: the card turns it into a visible message rather
// than an empty result that reads as "this person has no CV".
{
  let err = null;
  try { await findCandidateDocs("Asha", {}, { serpFetch: async () => { throw new Error("Apify token missing"); } }); } catch (e) { err = e; }
  check("a search failure is reported, not swallowed", /Apify token missing/.test(err?.message || ""), err?.message);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
