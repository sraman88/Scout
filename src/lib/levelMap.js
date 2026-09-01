import { llmCall } from "./llm.js";

/* Cross-company level equivalence.

   The org tree alone doesn't answer the question a recruiter actually asks:
   "who at another company is doing this same job under a different title?"
   A Strategic Sales Executive at OpenText maps to an Enterprise AE at Oracle;
   an SDE-3 at Amazon maps to a Senior Engineer almost everywhere else. This
   resolves that mapping for the target role against its peer companies, with
   the typical years of experience for each rung. */

const SYSTEM = `You are a recruiting market-mapping expert. Given a target company, a role family and a role title, return the equivalent job titles at comparable companies, plus the typical experience band for each level.
Return STRICT JSON only, no markdown:
{
  "anchor": {"company":"...","title":"...","level":"IC3 / Senior","years":"6-9"},
  "equivalents": [
    {"company":"Oracle","title":"Enterprise Account Executive","years":"7-10","note":"same quota band, larger territory"}
  ],
  "ladder": [
    {"level":"Entry","titles":"Associate AE, BDR","years":"0-2"},
    {"level":"Mid","titles":"Account Executive","years":"3-5"}
  ]
}
Rules: 5-7 equivalents at REAL, currently-operating companies a recruiter would realistically poach from in the given region. Ladder must be 4-5 rungs, lowest first. Years are ranges like "3-5". Keep notes under 12 words. Never invent companies.`;

export async function resolveLevelMap({ company, family, roleTitle, region = "India", provider } = {}) {
  const target = String(company || "").trim();
  if (!target) throw new Error("Enter a company first — the mapping is relative to it.");

  const user = [
    `Target company: ${target}`,
    `Role family: ${family || "unspecified"}`,
    roleTitle ? `Role title: ${roleTitle}` : "",
    `Region: ${region}`,
  ].filter(Boolean).join("\n");

  const out = await llmCall(provider, SYSTEM, user, { json: true, temperature: 0.2 });
  return {
    anchor: out.anchor || null,
    equivalents: Array.isArray(out.equivalents) ? out.equivalents.filter((e) => e?.company && e?.title) : [],
    ladder: Array.isArray(out.ladder) ? out.ladder.filter((l) => l?.level) : [],
  };
}

/* A LinkedIn people-search URL for a title at a company — lets every node in
   the mapping link straight to real people, with no API cost. */
export function peopleSearchUrl(title, company, location = "India") {
  const q = [title, company, location].filter(Boolean).map((s) => `"${s}"`).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in ${q}`)}`;
}
