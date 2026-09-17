import { buildDocQuery, classify, findCandidateDocs, scoreDoc, matchesName, confidenceLabel, DOC_TYPES } from "../src/lib/docFinder.js";

/* The SERP returns whatever Google had — and for a person's name plus "resume",
   what Google has is mostly NOT that person's CV. These cover the junk that was
   actually reaching cards (delegate lists, template farms, scraped reposts,
   company brochures) alongside the real CVs that must still get through. */

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};
const who = { name: "Asha Rao", org: "Freshworks", role: "implementation consultant" };

// --- query -------------------------------------------------------------------
{
  const q = buildDocQuery("Asha Rao", { org: "Freshworks" });
  check("quotes the name and the company", q.includes('"Asha Rao"') && q.includes('"Freshworks"'), q);
  check("asks for every document extension", Object.values(DOC_TYPES).flatMap((t) => t.ext).every((e) => q.includes(`filetype:${e}`)), q);
  check("excludes the resume-template industry", q.includes("-sample") && q.includes("-template") && q.includes("-format"), q);

  const narrow = buildDocQuery("Asha Rao", { types: ["pdf"] });
  check("narrows to the requested types", narrow.includes("filetype:pdf") && !narrow.includes("filetype:docx"), narrow);
  check("omits an unknown company cleanly", !narrow.includes('""'), narrow);
}

// --- name matching -----------------------------------------------------------
{
  check("matches a hyphenated filename", matchesName("asha-rao-resume.pdf", "Asha Rao") === "full");
  check("matches camel case and underscores", matchesName("AshaRao_CV.docx", "Asha Rao") === "full");
  check("matches surname-first", matchesName("Rao,Asha.pdf", "Asha Rao") === "full");
  check("scattered tokens are only a partial match", matchesName("Asha K. Rao annual note", "Asha Rao") === "partial");
  check("a different person does not match", matchesName("ravi-kumar-cv.pdf", "Asha Rao") === false);
  // Short tokens inside longer words were the false-positive engine: "li" in "public".
  check("two-letter names never match on substrings", matchesName("republic-notice.pdf", "Li Xu") === false);
}

// --- the junk that was reaching cards ----------------------------------------
{
  const junk = [
    ["a delegate list that happens to contain the name",
      { url: "https://iitb.ac.in/files/list-of-participants-2024.pdf", title: "List of Participants 2024", snippet: "Asha Rao, Ravi Kumar, Priya S..." }],
    ["a scraped repost on an aggregator",
      { url: "https://www.scribd.com/doc/123/asha-rao-resume.pdf", title: "Asha Rao Resume", snippet: "" }],
    ["a resume template farm",
      { url: "https://zety.com/sample-resume-format.pdf", title: "Resume Sample Format", snippet: "e.g. Asha Rao" }],
    ["a company brochure that names an employee",
      { url: "https://freshworks.com/brochure.pdf", title: "Freshworks Company Brochure", snippet: "contact Asha Rao for details" }],
    ["a merit list",
      { url: "https://univ.ac.in/merit-list-2024.pdf", title: "Merit List 2024", snippet: "Asha Rao 87%" }],
    ["someone else's CV entirely",
      { url: "https://example.com/ravi-kumar-cv.pdf", title: "Ravi Kumar — CV", snippet: "Implementation consultant at Freshworks" }],
  ];
  for (const [label, row] of junk) {
    const v = scoreDoc(row, who);
    check(`drops ${label}`, v.keep === false, v);
  }
}

// --- the real CVs that must still get through --------------------------------
{
  const real = [
    ["a self-hosted CV", { url: "https://ashararao.io/asha-rao-cv.pdf", title: "Asha Rao — Curriculum Vitae", snippet: "Implementation consultant at Freshworks" }],
    ["a bare filename on a personal site", { url: "https://x.github.io/u/AshaRao_Resume.pdf", title: "Resume", snippet: "Asha Rao, Bengaluru" }],
    ["a portfolio deck", { url: "https://asha.dev/Asha-Rao-Portfolio.pptx", title: "Asha Rao Portfolio", snippet: "selected work" }],
  ];
  for (const [label, row] of real) {
    const v = scoreDoc(row, who);
    check(`keeps ${label}`, v.keep === true, v);
    check(`  ...and says why for ${label}`, v.why.length > 0, v.why);
  }
}

// A name only in the body text means the document MENTIONS them, not that it is
// theirs — the single rule that stops most of the random documents.
{
  const v = scoreDoc({ url: "https://conf.org/programme.pdf", title: "Conference Programme", snippet: "Keynote by Asha Rao of Freshworks" }, who);
  check("a name only in the snippet is not authorship", v.keep === false, v);
}

// --- confidence --------------------------------------------------------------
{
  const strong = scoreDoc({ url: "https://asha.io/asha-rao-cv.pdf", title: "Asha Rao — CV", snippet: "Freshworks" }, who);
  const weaker = scoreDoc({ url: "https://x.io/AshaRao_Resume.pdf", title: "Resume", snippet: "" }, who);
  check("a filename + title + org match scores higher than a bare filename", strong.confidence > weaker.confidence, { strong, weaker });
  check("labels scale with confidence", confidenceLabel(0.9) === "strong" && confidenceLabel(0.7) === "likely" && confidenceLabel(0.5) === "possible");
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
    { url: "https://asha.io/asha-rao-cv.pdf", title: "Asha Rao — CV", snippet: "Freshworks implementation consultant" },
    { url: "https://asha.io/asha-rao-cv.pdf", title: "same file again", snippet: "" },
    { url: "https://iitb.ac.in/list-of-participants.pdf", title: "List of Participants", snippet: "Asha Rao" },
    { url: "https://linkedin.com/in/asha", title: "LinkedIn", snippet: "Asha Rao" },
    { url: "https://x.io/AshaRao_Resume.pdf", title: "Resume", snippet: "Asha Rao" },
    { url: "", title: "nothing", snippet: "" },
  ];
  const docs = await findCandidateDocs("Asha Rao", { org: "Freshworks" }, { serpFetch });
  check("keeps only verified files, once each", docs.length === 2, docs);
  check("strongest evidence sorts first", docs[0].confidence >= docs[1].confidence, docs.map((d) => d.confidence));
  check("each doc carries a confidence label and reasons", docs.every((d) => d.label && d.why.length), docs);

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
