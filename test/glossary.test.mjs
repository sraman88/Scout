import { detectTerms, GLOSSARY, getTerm } from "../src/lib/glossary.js";

/* Detection runs over free-text JDs, so the risk is a term firing on ordinary
   prose ("we are going to can the plan") or a term from the wrong craft
   hijacking the panel (an event pipeline is not a sales funnel). */

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};
const labels = (text, opts) => detectTerms(text, opts).map((t) => t.label);

// --- the corpus itself -------------------------------------------------------
{
  check("every entry has what/where/screen", GLOSSARY.every((t) => t.what && t.where && t.screen?.length), GLOSSARY.filter((t) => !(t.what && t.where && t.screen?.length)).map((t) => t.id));
  check("every entry has a family and kind", GLOSSARY.every((t) => t.family && t.kind));
  check("ids are unique", new Set(GLOSSARY.map((t) => t.id)).size === GLOSSARY.length);
  check("covers every craft the engine senses", ["engineering", "sales", "hr", "finance", "marketing", "consulting", "implementation", "development"].every((f) => GLOSSARY.some((t) => t.family === f)));
  check("related ids point at real entries", GLOSSARY.flatMap((t) => t.related || []).every((r) => GLOSSARY.some((t) => t.id === r)), GLOSSARY.flatMap((t) => t.related || []).filter((r) => !GLOSSARY.some((t) => t.id === r)));
  check("getTerm finds and misses cleanly", getTerm("kafka")?.label === "Apache Kafka" && getTerm("nope") === null);
}

// --- detection across crafts -------------------------------------------------
{
  check("finds engineering terms", labels("Own our event pipeline built on Kafka, Go microservices on Kubernetes in AWS.").includes("Apache Kafka"));
  check("finds sales terms", labels("Quota carrying AE, MEDDIC, President's Club.").includes("MEDDIC / MEDDPICC"));
  check("finds HR terms", labels("HRBP owning attrition and POSH compliance.").includes("HRBP"));
  check("finds finance terms", labels("CA qualified, month end close, Ind AS reporting.").includes("Ind AS / IFRS / GAAP"));
  check("finds implementation terms", labels("Own go live, cutover and hypercare for ERP rollouts.").includes("Go-live / cutover"));
}

// --- what must NOT fire ------------------------------------------------------
{
  check("ordinary prose matches nothing", labels("We are going to can the old plan. Candidates can apply.").length === 0, labels("We are going to can the old plan. Candidates can apply."));
  check("substrings never match", labels("HTML and CSS only.").length === 0, labels("HTML and CSS only."));
  check("a term ending a sentence is still found", labels("We provision with Terraform.").includes("Terraform / IaC"));
  check("punctuation inside a term is preserved", labels("Strong C# and .NET Core.").includes(".NET / C#"));
}

// --- ambiguity across crafts -------------------------------------------------
{
  const eng = "Own our event pipeline built on Kafka.";
  check("an engineering pipeline is not a sales funnel", !labels(eng, { family: "engineering" }).includes("Pipeline / funnel"), labels(eng, { family: "engineering" }));
  check("...but a sales pipeline still is", labels("Own pipeline generation and quota.", { family: "sales" }).includes("Pipeline / funnel"));
  check("'go live' does not mean the Go language", !labels("Manage go live and cutover.", { family: "implementation" }).includes("Go (Golang)"));
  check("...but Go the language survives in its own craft", labels("Go microservices on Kubernetes.", { family: "engineering" }).includes("Go (Golang)"));
  check("with no family given, nothing is dropped", labels(eng).includes("Pipeline / funnel"));
}

// --- ordering and limits -----------------------------------------------------
{
  const ordered = labels("Own our event pipeline built on Kafka, with microservices and REST APIs.", { family: "engineering" });
  check("a named technology leads a broad concept", ordered.indexOf("Apache Kafka") < ordered.indexOf("Microservices"), ordered);
  check("honours the limit", detectTerms("kafka kubernetes aws terraform postgres redis docker react node go", { limit: 3 }).length === 3);
  check("empty text finds nothing", labels("") .length === 0 && labels(null).length === 0);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
