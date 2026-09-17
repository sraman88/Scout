import { evidenceFor, repoEvidences, summarise } from "../src/lib/skillEvidence.js";

/* The claim this feature makes — "they have really done this" — is only worth
   anything if it is hard to fool and honest about what it doesn't know. These
   cover both: what counts as proof, and what must never read as a negative. */

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};

const ago = (years) => new Date(Date.now() - years * 365.25 * 24 * 3600 * 1000).toISOString();
const repo = (over = {}) => ({ name: "thing", description: "", topics: [], language: null, stargazers_count: 0, pushed_at: ago(0.1), html_url: "https://github.com/x/thing", fork: false, ...over });

// --- what counts as proof ----------------------------------------------------
{
  check("the repo language proves the language", !!repoEvidences(repo({ language: "Go" }), "go"));
  check("a named topic proves a tool", !!repoEvidences(repo({ topics: ["kafka", "streaming"] }), "kafka"));
  check("the description proves a tool", !!repoEvidences(repo({ description: "Kafka consumer for orders" }), "kafka"));
  check("the repo name proves a tool", !!repoEvidences(repo({ name: "terraform-modules" }), "terraform"));
  check("an unrelated repo proves nothing", repoEvidences(repo({ language: "Ruby", name: "blog" }), "kafka") === null);
  // A repo both written in Go AND naming Go is stronger evidence than one that
  // merely happens to be written in it.
  check("a named match is distinguished from a bare language match",
    repoEvidences(repo({ language: "Go", name: "go-kafka-relay" }), "go").includes("named")
    && !repoEvidences(repo({ language: "Go", name: "blog" }), "go").includes("named"),
    { named: repoEvidences(repo({ language: "Go", name: "go-kafka-relay" }), "go"), bare: repoEvidences(repo({ language: "Go", name: "blog" }), "go") });
  check("an unmapped skill still matches on its own name", !!repoEvidences(repo({ name: "svelte-ui" }), "svelte"));

  /* Caught against real API data: a repo's LANGUAGE proved every framework
     written in that language, so one JavaScript repo "evidenced" React, Node
     and TypeScript at once. A framework must be named; the language only
     corroborates. */
  check("a framework is not proved by its language alone", repoEvidences(repo({ language: "JavaScript", name: "scout", description: "recruiting tool" }), "react") === null);
  check("...nor is Node", repoEvidences(repo({ language: "JavaScript", name: "scout" }), "node") === null);
  check("...but the language itself still is", !!repoEvidences(repo({ language: "JavaScript", name: "scout" }), "javascript"));
  check("a named framework is evidence, and says which language", repoEvidences(repo({ language: "JavaScript", name: "react-dashboard" }), "react") === "react-dashboard — named, in JavaScript");
  check("Java does not prove Spring", repoEvidences(repo({ language: "Java", name: "utils" }), "spring") === null);
  check("Python does not prove ML", repoEvidences(repo({ language: "Python", name: "scripts" }), "ml") === null);
  // Single characters would match almost any description.
  check("a one-character skill cannot match loosely", repoEvidences(repo({ description: "a project" }), "x") === null);
}

// --- crossing skills against repos -------------------------------------------
{
  const repos = [
    repo({ name: "kafka-relay", language: "Go", topics: ["kafka"], stargazers_count: 12, pushed_at: ago(0.2) }),
    repo({ name: "go-utils", language: "Go", pushed_at: ago(0.5) }),
    repo({ name: "old-spark-jobs", language: "Scala", description: "spark pipelines", pushed_at: ago(4) }),
  ];
  const rows = evidenceFor(["kafka", "go", "spark", "kubernetes"], repos);
  const by = Object.fromEntries(rows.map((r) => [r.skill, r]));

  check("evidences a skill with proof", by.kafka.evidenced && by.kafka.proof.length > 0, by.kafka);
  check("counts every repo that evidences a skill", by.go.repos === 2, by.go);
  check("sums stars across evidencing repos", by.kafka.stars === 12, by.kafka);
  check("marks an old-only skill stale", by.spark.evidenced && by.spark.stale === true, by.spark);
  check("recent work is not stale", by.kafka.stale === false, by.kafka);
  check("an unevidenced skill is reported, not dropped", by.kubernetes.evidenced === false && by.kubernetes.note === "no public signal", by.kubernetes);
  check("every requested skill gets a row", rows.length === 4);
  check("proof is capped at three links", evidenceFor(["go"], Array(9).fill(repo({ language: "Go" })))[0].proof.length === 3);
}

// --- honesty -----------------------------------------------------------------
{
  // The single most important behaviour: absence of public code must never be
  // presented as absence of the skill.
  const rows = evidenceFor(["kafka", "kubernetes"], []);
  check("no repos means no evidence, not a negative verdict", rows.every((r) => r.evidenced === false && r.note === "no public signal"), rows);
  check("the summary says so plainly", summarise(rows) === "No public code for the skills this role asks for.", summarise(rows));

  const mixed = evidenceFor(["go", "spark"], [
    repo({ language: "Go", pushed_at: ago(0.1) }),
    repo({ name: "spark-old", description: "spark", pushed_at: ago(5) }),
  ]);
  check("the summary separates fresh evidence from stale", /only in older repos/.test(summarise(mixed)), summarise(mixed));
  check("an empty skill list summarises to nothing", summarise([]) === "");
}

// --- recency phrasing --------------------------------------------------------
{
  const fresh = evidenceFor(["go"], [repo({ language: "Go", pushed_at: ago(0.02) })])[0];
  const months = evidenceFor(["go"], [repo({ language: "Go", pushed_at: ago(0.5) })])[0];
  const years = evidenceFor(["go"], [repo({ language: "Go", pushed_at: ago(3) })])[0];
  check("describes recent work as this month", /this month/.test(fresh.note), fresh.note);
  check("describes months", /months ago/.test(months.note), months.note);
  check("does not say '1 months ago'", !/\b1 months\b/.test(evidenceFor(["go"], [repo({ language: "Go", pushed_at: ago(0.1) })])[0].note), evidenceFor(["go"], [repo({ language: "Go", pushed_at: ago(0.1) })])[0].note);
  check("describes years", /years ago/.test(years.note), years.note);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
