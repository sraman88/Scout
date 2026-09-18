import { toTag, searchDevTo, searchHuggingFace, searchGitLab, searchFreeSources } from "../src/lib/freeSources.js";

/* These read real third-party JSON, so the tests pin the SHAPE handling: what
   happens with the fields those APIs actually return, and what happens when one
   is down. The live endpoints could not be reached from the build environment,
   which makes the shape handling the part worth locking down. */

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};

// Swap global fetch for a stub returning a canned payload.
const withFetch = async (payload, fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => (payload instanceof Error
    ? Promise.reject(payload)
    : { ok: true, status: 200, json: async () => payload });
  try { return await fn(); } finally { globalThis.fetch = real; }
};

// --- tags --------------------------------------------------------------------
{
  check("takes the distinctive word from a skill phrase", toTag("Apache Kafka") === "kafka", toTag("Apache Kafka"));
  check("passes a single word through", toTag("kubernetes") === "kubernetes");
  check("keeps c# and c++ intact", toTag("c#") === "c#" && toTag("c++") === "c++", [toTag("c#"), toTag("c++")]);
  check("empty in, empty out", toTag("") === "" && toTag(null) === "");
}

// --- dev.to ------------------------------------------------------------------
{
  const posts = [
    { title: "Kafka at scale", url: "https://dev.to/asha/kafka", user: { username: "asha", name: "Asha Rao" } },
    { title: "More Kafka", url: "https://dev.to/asha/more", user: { username: "asha", name: "Asha Rao" } },
    { title: "Streams", url: "https://dev.to/ravi/streams", user: { username: "ravi", name: "Ravi" } },
    { title: "No user", url: "x" },
  ];
  const people = await withFetch(posts, () => searchDevTo({ skill: "Apache Kafka" }));
  check("one row per author, not per post", people.length === 2, people.map((p) => p.username));
  check("carries a profile url and the post as evidence", people[0].profile_url === "https://dev.to/asha" && people[0].evidence_url === "https://dev.to/asha/kafka", people[0]);
  check("skips posts with no author", !people.some((p) => !p.username));
  check("an empty skill costs no request", (await searchDevTo({ skill: "" })).length === 0);
}

// --- Hugging Face ------------------------------------------------------------
{
  const models = [
    { modelId: "asha/bert-hindi", downloads: 900 },
    { modelId: "asha/bert-tamil", downloads: 400 },
    { modelId: "bert-base-uncased" }, // owned by HF itself — no author
    { id: "ravi/ner-model" },
  ];
  const people = await withFetch(models, () => searchHuggingFace({ skill: "bert" }));
  check("one row per author", people.length === 2, people.map((p) => p.username));
  check("ignores models with no owner namespace", !people.some((p) => p.username === "bert-base-uncased"), people);
  check("links the model as evidence", people[0].evidence_url.includes("asha/bert-hindi"), people[0]);
}

// --- GitLab ------------------------------------------------------------------
{
  const projects = [
    { name_with_namespace: "Asha / kafka-tools", web_url: "https://gitlab.com/asha/kafka-tools", star_count: 12, description: "tools", namespace: { kind: "user", path: "asha", name: "Asha" } },
    { web_url: "https://gitlab.com/acme/kafka", star_count: 90, namespace: { kind: "group", path: "acme", name: "Acme" } },
    { web_url: "https://gitlab.com/asha/other", namespace: { kind: "user", path: "asha", name: "Asha" } },
  ];
  const people = await withFetch(projects, () => searchGitLab({ skill: "kafka" }));
  // A group namespace is a company, not a person.
  check("only personal namespaces are people", people.length === 1 && people[0].username === "asha", people);
  check("carries stars and the project as evidence", people[0].stars === 12 && people[0].evidence_url.includes("kafka-tools"), people[0]);
}

// --- isolation ---------------------------------------------------------------
{
  // One dead source must not cost the others their results.
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("gitlab")) throw new Error("gitlab down");
    return { ok: true, status: 200, json: async () => [] };
  };
  const out = await searchFreeSources({ skill: "kafka" });
  globalThis.fetch = real;
  check("every source reports separately", out.length === 3, out.map((o) => o.id));
  check("a failing source is reported, not thrown", out.find((o) => o.id === "gitlab").error === "gitlab down", out);
  check("the others still answer", out.filter((o) => !o.error).length === 2, out);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
