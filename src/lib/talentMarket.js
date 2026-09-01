import { safeParseJSON } from "./llm.js";
import { getStoredKey } from "./storage.js";
import { ENV_GEMINI } from "../theme.js";
import { geminiGroundedWithSources } from "./groundedModel.js";

/* Market intelligence for the role being hired, rather than for a company the
   recruiter already typed.

   Both answers are produced by a WEB-GROUNDED model and returned with the
   citations behind them. That matters most for pay: levels.fyi and AmbitionBox
   have no public API, forbid scraping in their terms, and are JS-rendered
   behind CORS — so Scout does not scrape them. It asks a grounded model, then
   shows the source links so every figure can be checked at origin instead of
   being taken on trust. Numbers move; a citation with a date is honest, a bare
   number is not. */

export function getGroundedModel() {
  const provider = getStoredKey("competitor_provider") || "gemini";
  if (provider !== "gemini") return null; // Perplexity/custom are CORS-blocked in the browser
  const key = getStoredKey("gemini") || ENV_GEMINI;
  return key ? geminiGroundedWithSources(key) : null;
}

const PEERS_PROMPT = `You are a talent-market analyst. Given a role a company is hiring for, list the organisations whose people are the closest TALENT MATCH — the places a recruiter would realistically source this exact profile from.

Judge by talent overlap, not by product-market competition: same craft, comparable scale and complexity, similar tooling and ways of working, same geography. A company can be a business rival and still be a poor talent match, and vice-versa.

Return STRICT JSON only, no markdown:
{
  "peers": [
    {"company":"Name","why":"under 12 words on the talent overlap","equivalentTitle":"what they call this role","hiring":true}
  ],
  "pools": ["short phrase describing a non-obvious talent pool, e.g. 'Big-4 HR advisory practices'"]
}
Rules: 8-12 real, currently-operating companies for the stated region. "hiring" is true only if you found evidence of a live or recent opening for this craft. Never invent companies.`;

const SALARY_PROMPT = `You are a compensation analyst. Report the current market pay for the role described.

Prefer sources in this order: levels.fyi, AmbitionBox, Glassdoor, Payscale, credible salary reports. Use the local convention for the region (India: INR lakhs per annum, "LPA"; US: USD base).

Return STRICT JSON only, no markdown:
{
  "currency":"INR",
  "unit":"LPA",
  "asOf":"2026 or the period the data covers",
  "bands":[
    {"level":"Mid","title":"Employee Relations Manager","years":"4-7","min":18,"max":28,"median":22,"note":"under 10 words"}
  ],
  "topPayers":[{"company":"Name","range":"28-40 LPA"}],
  "caveat":"one sentence on how reliable this is for the region"
}
Rules: 3-5 bands lowest first. min/max/median are NUMBERS in the stated unit, never strings or ranges. If you cannot find real data for the region, return "bands":[] rather than guessing.`;

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

function describe({ role, family, skills = [], location, company, level }) {
  return [
    `Role: ${role || family || "unspecified"}`,
    family ? `Function: ${family}` : "",
    level ? `Level: ${level}` : "",
    skills.length ? `Key skills/specialisms: ${skills.slice(0, 6).join(", ")}` : "",
    `Region: ${location || "India"}`,
    company ? `Hiring company (exclude it from peers): ${company}` : "",
  ].filter(Boolean).join("\n");
}

export async function resolveTalentPeers(spec, { callModel } = {}) {
  const model = callModel || getGroundedModel();
  if (!model) throw new Error("No grounded model configured — add a Gemini key in Settings.");

  const { text, sources } = await model(`${PEERS_PROMPT}\n\n---\n\n${describe(spec)}`);
  const out = safeParseJSON(text);
  const self = String(spec.company || "").trim().toLowerCase();

  return {
    peers: (Array.isArray(out.peers) ? out.peers : [])
      .filter((p) => p?.company && String(p.company).trim().toLowerCase() !== self)
      .map((p) => ({
        company: String(p.company).trim(),
        why: String(p.why || "").trim(),
        equivalentTitle: String(p.equivalentTitle || "").trim(),
        hiring: !!p.hiring,
      }))
      .slice(0, 12),
    pools: (Array.isArray(out.pools) ? out.pools : []).map(String).slice(0, 5),
    sources,
  };
}

export async function resolveSalaryBands(spec, { callModel } = {}) {
  const model = callModel || getGroundedModel();
  if (!model) throw new Error("No grounded model configured — add a Gemini key in Settings.");

  const { text, sources } = await model(`${SALARY_PROMPT}\n\n---\n\n${describe(spec)}`);
  const out = safeParseJSON(text);

  const bands = (Array.isArray(out.bands) ? out.bands : [])
    .map((b) => ({
      level: String(b.level || "").trim(),
      title: String(b.title || "").trim(),
      years: String(b.years || "").trim(),
      min: num(b.min), max: num(b.max), median: num(b.median),
      note: String(b.note || "").trim(),
    }))
    .filter((b) => b.level && (b.min !== null || b.max !== null));

  return {
    currency: String(out.currency || "INR"),
    unit: String(out.unit || "LPA"),
    asOf: String(out.asOf || "").trim(),
    bands,
    topPayers: (Array.isArray(out.topPayers) ? out.topPayers : [])
      .filter((t) => t?.company && t?.range)
      .map((t) => ({ company: String(t.company).trim(), range: String(t.range).trim() }))
      .slice(0, 6),
    caveat: String(out.caveat || "").trim(),
    sources,
  };
}

/* Widest band across the set — used to scale the bar chart. */
export const salaryExtent = (bands) => {
  const lo = Math.min(...bands.map((b) => b.min ?? b.median ?? Infinity));
  const hi = Math.max(...bands.map((b) => b.max ?? b.median ?? -Infinity));
  return isFinite(lo) && isFinite(hi) && hi > lo ? { lo, hi } : null;
};
