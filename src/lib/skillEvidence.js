// lib/skillEvidence.js
// -----------------------------------------------------------------------------
// Turn claimed skills into evidenced ones.
//
// A CV asserts. Public code demonstrates. For any candidate with a GitHub
// account, the repos they actually wrote are free, checkable proof of which of
// the JD's skills they have really touched — and, just as usefully, which ones
// they claim with nothing behind them.
//
// This is the thing a LinkedIn search or a boolean string fundamentally cannot
// do: LinkedIn shows what someone says about themselves.
//
// Evidence is deliberately conservative. Absence of public code is NOT evidence
// of absence — most good engineers write their best work in private repos — so
// an unevidenced skill is reported as "no public signal", never as a negative.
// -----------------------------------------------------------------------------
import { ghHeaders } from "./github.js";

/* Maps a JD skill to what it looks like in a repository.
   The distinction that matters:
     language  — this language IS the skill. Writing Go proves Go.
     langHint  — the language a framework usually appears in. It CORROBORATES a
                 named match but never proves one on its own: a repo being
                 written in JavaScript does not mean the author knows React, and
                 treating it as proof would "evidence" React, Node and
                 TypeScript for every JS repo on the account.
     text      — named in the repo name, description or topics. Always proof. */
const SKILL_SIGNALS = {
  kafka: { text: ["kafka", "confluent", "kstream"] },
  kubernetes: { text: ["kubernetes", "k8s", "helm", "kubectl", "operator"] },
  docker: { text: ["docker", "container", "compose"] },
  terraform: { language: ["HCL"], text: ["terraform", "pulumi"] },
  react: { langHint: ["JavaScript", "TypeScript"], text: ["react", "next.js", "nextjs", "jsx"] },
  typescript: { language: ["TypeScript"] },
  javascript: { language: ["JavaScript"] },
  node: { langHint: ["JavaScript", "TypeScript"], text: ["node", "express", "nestjs", "fastify"] },
  go: { language: ["Go"] },
  golang: { language: ["Go"] },
  rust: { language: ["Rust"] },
  python: { language: ["Python"] },
  java: { language: ["Java"] },
  spring: { langHint: ["Java"], text: ["spring", "springboot"] },
  kotlin: { language: ["Kotlin"] },
  swift: { language: ["Swift"] },
  scala: { language: ["Scala"] },
  ruby: { language: ["Ruby"] },
  rails: { langHint: ["Ruby"], text: ["rails"] },
  php: { language: ["PHP"] },
  laravel: { langHint: ["PHP"], text: ["laravel", "symfony"] },
  "c#": { language: ["C#"] },
  ".net": { langHint: ["C#"], text: ["dotnet", ".net", "asp.net"] },
  "c++": { language: ["C++"] },
  sql: { language: ["PLpgSQL", "TSQL", "SQL"], text: ["sql", "postgres", "mysql", "database"] },
  postgres: { text: ["postgres", "postgresql", "pgsql"] },
  mongodb: { text: ["mongo", "mongodb"] },
  redis: { text: ["redis"] },
  elasticsearch: { text: ["elasticsearch", "opensearch", "elastic"] },
  spark: { langHint: ["Scala", "Python"], text: ["spark", "pyspark", "databricks"] },
  airflow: { langHint: ["Python"], text: ["airflow", "dagster", "prefect"] },
  dbt: { text: ["dbt"] },
  aws: { text: ["aws", "lambda", "s3", "ec2", "cdk"] },
  azure: { text: ["azure"] },
  gcp: { text: ["gcp", "bigquery", "google-cloud"] },
  ml: { langHint: ["Python", "Jupyter Notebook"], text: ["machine-learning", "deep-learning", "pytorch", "tensorflow", "sklearn", "scikit"] },
  pytorch: { text: ["pytorch", "torch"] },
  tensorflow: { text: ["tensorflow", "keras"] },
  llm: { text: ["llm", "gpt", "rag", "langchain", "embedding", "openai", "prompt"] },
  graphql: { text: ["graphql", "apollo"] },
  grpc: { text: ["grpc", "protobuf"] },
  android: { langHint: ["Kotlin", "Java"], text: ["android"] },
  ios: { langHint: ["Swift", "Objective-C"], text: ["ios", "swiftui"] },
  devops: { langHint: ["HCL", "Shell"], text: ["jenkins", "ci-cd", "devops", "github-actions"] },
};

const lc = (s) => String(s || "").toLowerCase();
const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

/* One page of public repos is enough: 100 repos sorted by last push covers any
   realistic candidate's active work, in a single request. */
export async function fetchRepos(username, { fetchImpl = fetch } = {}) {
  const u = encodeURIComponent(String(username || "").trim());
  if (!u) return [];
  const r = await fetchImpl(`https://api.github.com/users/${u}/repos?per_page=100&sort=pushed&type=owner`, { headers: ghHeaders() });
  if (r.status === 404) throw new Error(`GitHub user "${username}" not found`);
  if (r.status === 403) throw new Error("GitHub rate-limited — add a token in Settings to lift 60/hr to 5,000/hr.");
  if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
  const repos = await r.json();
  return Array.isArray(repos) ? repos.filter((x) => !x.fork) : []; // forks are not authorship
}

/* Does one repo evidence one skill? Returns the reason, or null. */
export function repoEvidences(repo, skill) {
  const key = lc(skill);
  const sig = SKILL_SIGNALS[key] || {};
  const haystack = [repo.name, repo.description, ...(repo.topics || [])].map(lc).join(" ");
  const textNeedles = sig.text || [key];
  const named = textNeedles.some((n) => n.length > 1 && haystack.includes(n));

  // The language IS the skill.
  if (sig.language?.includes(repo.language)) {
    return named ? `${repo.name} — named, written in ${repo.language}` : `${repo.name} — written in ${repo.language}`;
  }
  // Named outright. A matching langHint corroborates it, but is never proof alone.
  if (named) {
    return sig.langHint?.includes(repo.language)
      ? `${repo.name} — named, in ${repo.language}`
      : `${repo.name} — named in the repo`;
  }
  return null;
}

/* Cross the JD's skills against the candidate's public repos.
   Returns one row per skill: evidenced (with proof and recency) or not. */
export function evidenceFor(skills = [], repos = []) {
  const now = Date.now();
  return skills.filter(Boolean).map((skill) => {
    const hits = [];
    for (const repo of repos) {
      const why = repoEvidences(repo, skill);
      if (why) hits.push({ repo, why, pushed: Date.parse(repo.pushed_at || repo.updated_at || 0) || 0 });
    }
    if (!hits.length) return { skill, evidenced: false, repos: 0, note: "no public signal" };

    hits.sort((a, b) => b.pushed - a.pushed);
    const latest = hits[0];
    const years = latest.pushed ? (now - latest.pushed) / MS_PER_YEAR : null;
    const stars = hits.reduce((n, h) => n + (h.repo.stargazers_count || 0), 0);
    return {
      skill,
      evidenced: true,
      repos: hits.length,
      stars,
      lastTouched: latest.pushed || null,
      /* Recency is the honest qualifier: three repos last touched in 2019 is a
         different claim from three touched last month. */
      stale: years != null && years > 2,
      note: years == null ? `${hits.length} public repo${hits.length === 1 ? "" : "s"}`
        : `${hits.length} public repo${hits.length === 1 ? "" : "s"}, last touched ${describeAge(years)}`,
      proof: hits.slice(0, 3).map((h) => ({ why: h.why, url: h.repo.html_url })),
    };
  });
}

function describeAge(years) {
  if (years < 0.09) return "this month";
  if (years < 1) {
    const m = Math.max(1, Math.round(years * 12));
    return `${m} month${m === 1 ? "" : "s"} ago`;
  }
  return `${years < 1.5 ? "a year" : `${Math.round(years)} years`} ago`;
}

/* A headline for the card: what the public record supports, in one line. */
export function summarise(rows = []) {
  const yes = rows.filter((r) => r.evidenced);
  const fresh = yes.filter((r) => !r.stale);
  if (!rows.length) return "";
  if (!yes.length) return "No public code for the skills this role asks for.";
  return `${fresh.length || yes.length} of ${rows.length} required skills show in public code${fresh.length < yes.length ? ` (${yes.length - fresh.length} only in older repos)` : ""}.`;
}

export async function skillEvidence(username, skills = [], { fetchImpl } = {}) {
  const repos = await fetchRepos(username, { fetchImpl });
  const rows = evidenceFor(skills, repos);
  return { username, repoCount: repos.length, rows, summary: summarise(rows) };
}
