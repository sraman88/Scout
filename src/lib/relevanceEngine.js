// lib/relevanceEngine.js
// -----------------------------------------------------------------------------
// The spine. One role taxonomy + one spec shape that every tab derives from:
//
//   senseFamily(text)      -> which craft is this? (drives "Sales only scouts Sales")
//   buildSpec({...})       -> the canonical {family, company, answers, titles, ...}
//   buildQuery(spec)       -> boolean + Apify/Apollo params + which sources to hit
//   gateSources(spec)      -> the ranked "where to look" (feeds the intake map)
//   prefilter(profile,spec)-> cheap deterministic relevance gate BEFORE the LLM
//   tierOf(title)          -> org tier, shared by the card + company map
//
// Pipeline the tabs compose:
//   sense -> buildSpec -> buildQuery -> [Apify/SERP fetch] -> prefilter (free)
//         -> scoreBatch (lib/scoreProfile.js, LLM, only on survivors) -> cards
// The prefilter is what keeps the LLM bill sane: it culls obvious misses for
// nothing, so you only pay to score real candidates.
// -----------------------------------------------------------------------------

export const DEFAULT_LOCATIONS = ["India", "Bengaluru", "Mumbai", "Pune", "Gurgaon", "Hyderabad", "Chennai", "Noida"];

// --- Role taxonomy. Data-driven so adding a family is a config edit. ---------
export const FAMILIES = {
  sales: {
    label: "Sales",
    lexicon: ["sales", "account executive", "account manager", "business development", "quota", "bdr", "sdr", "revenue", "territory", "relationship manager", "key account"],
    titles: ["account executive", "enterprise account executive", "sales manager", "regional sales manager", "business development manager", "key account manager", "territory manager", "inside sales", "sales development representative"],
    variants: ["ae", "bdm", "asm", "area sales manager", "rsm", "kam", "nsm", "national sales manager", "zonal sales manager", "relationship manager", "sdr", "bdr"],
    sources: [
      { id: "linkedin", label: "LinkedIn / Sales Navigator", weight: 5, why: "Current & alumni sellers at the target's competitors." },
      { id: "community", label: "RepVue + Bravado", weight: 4, why: "Sales communities with verified comp and attainment." },
      { id: "serp", label: "Award / President's Club mentions", weight: 3, why: "Public quota-attainment proof." },
      { id: "referral", label: "Ecosystem referrals", weight: 2, why: "The target's partner/SI network." },
    ],
    weights: { title: 0.4, skills: 0.25, seniority: 0.2, location: 0.15 },
  },
  engineering: {
    label: "Engineering",
    lexicon: ["engineer", "developer", "backend", "frontend", "fullstack", "sde", "golang", "kubernetes", "python", "java", "react", "devops", "sre", "software"],
    titles: ["software engineer", "senior software engineer", "backend engineer", "frontend engineer", "full stack engineer", "staff engineer", "principal engineer", "engineering manager", "sre", "devops engineer", "data engineer", "ml engineer"],
    variants: ["sde", "sde 2", "sde 3", "tech lead", "sdet", "ic", "platform engineer"],
    sources: [
      { id: "github", label: "GitHub", weight: 5, why: "Top contributors in the target stack — code you can verify." },
      { id: "stackoverflow", label: "StackOverflow + dev.to", weight: 4, why: "Depth and writing that show how they think." },
      { id: "conf", label: "Conference CFPs / talks", weight: 3, why: "Speakers skew senior and reachable." },
      { id: "linkedin", label: "LinkedIn", weight: 2, why: "Cross-check; weak for engineers who don't optimise profiles." },
    ],
    weights: { title: 0.3, skills: 0.4, seniority: 0.2, location: 0.1 },
  },
  marketing: {
    label: "Marketing",
    lexicon: ["marketing", "growth", "demand gen", "performance marketing", "product marketing", "pmm", "brand", "content", "seo", "digital marketing", "campaign"],
    titles: ["marketing manager", "growth marketing manager", "performance marketing manager", "product marketing manager", "demand generation manager", "brand manager", "content marketing manager", "digital marketing manager"],
    variants: ["pmm", "growth lead", "demand gen", "cmo", "vp marketing", "head of marketing"],
    sources: [
      { id: "linkedin", label: "LinkedIn", weight: 5, why: "Current role + campaign history at comparable companies." },
      { id: "serp", label: "Portfolio / campaign write-ups", weight: 4, why: "Public proof of work — launches, case studies." },
      { id: "community", label: "Marketing communities", weight: 3, why: "Off-LinkedIn practitioners and referrals." },
    ],
    weights: { title: 0.4, skills: 0.3, seniority: 0.2, location: 0.1 },
  },
  hr: {
    label: "HR",
    lexicon: ["human resources", "talent acquisition", "recruiter", "hrbp", "people operations", "compensation", "learning and development", "hr generalist", "people partner"],
    titles: ["talent acquisition specialist", "recruiter", "hr business partner", "people operations manager", "hr manager", "hr generalist", "compensation and benefits manager", "learning and development manager"],
    variants: ["hrbp", "ta", "tag", "people partner", "chro", "vp hr", "head of hr"],
    sources: [
      { id: "linkedin", label: "LinkedIn", weight: 5, why: "Primary graph for HR practitioners." },
      { id: "serp", label: "HR communities / events", weight: 3, why: "Speakers and community leads." },
    ],
    weights: { title: 0.45, skills: 0.25, seniority: 0.2, location: 0.1 },
  },
  techsupport: {
    label: "Tech Support",
    lexicon: ["technical support", "support engineer", "customer support", "application support", "product support", "helpdesk", "service desk", "technical account manager", "l1", "l2", "l3", "customer success engineer"],
    titles: ["technical support engineer", "support engineer", "application support engineer", "product support specialist", "technical account manager", "customer success engineer", "service desk analyst"],
    variants: ["tam", "l1 support", "l2 support", "l3 support", "helpdesk", "cse"],
    sources: [
      { id: "linkedin", label: "LinkedIn", weight: 5, why: "Current role and product/tooling exposure." },
      { id: "github", label: "GitHub / forums", weight: 3, why: "For support roles that touch code and debugging." },
      { id: "serp", label: "Product community answers", weight: 3, why: "People who publicly solve the product's problems." },
    ],
    weights: { title: 0.4, skills: 0.3, seniority: 0.2, location: 0.1 },
  },
  finance: {
    label: "Finance",
    lexicon: ["finance", "financial analyst", "fp&a", "controller", "accountant", "chartered accountant", "treasury", "audit", "accounts payable", "accounts receivable"],
    titles: ["financial analyst", "fp&a analyst", "finance manager", "controller", "accountant", "chartered accountant", "treasury analyst", "internal auditor"],
    variants: ["ca", "fpna", "ap", "ar", "cfo", "vp finance", "head of finance"],
    sources: [
      { id: "linkedin", label: "LinkedIn", weight: 5, why: "Primary graph for finance professionals." },
      { id: "serp", label: "ICAI / professional bodies", weight: 3, why: "For CA and audit credential verification." },
    ],
    weights: { title: 0.45, skills: 0.25, seniority: 0.2, location: 0.1 },
  },
};

// --- Sensing -----------------------------------------------------------------
// Deterministic first. Returns confidence so the UI can offer "not X? switch",
// and exposes a tie-break hook for the LLM when two families are close.
export function senseFamily(text, { llmTieBreak } = {}) {
  const s = " " + String(text || "").toLowerCase() + " ";
  const scores = {};
  for (const [id, f] of Object.entries(FAMILIES)) {
    let n = 0;
    for (const k of f.lexicon) if (s.includes(k)) n += 1;
    for (const t of f.titles) if (s.includes(t)) n += 2; // full title = stronger signal
    scores[id] = n;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  const total = ranked.reduce((sum, [, v]) => sum + v, 0);
  if (!top || top[1] === 0) return { family: null, confidence: 0, scores };
  const confidence = +(top[1] / total).toFixed(2);
  // Close call -> let the caller's LLM decide, if provided.  // <-- WIRE
  if (second && top[1] - second[1] <= 1 && typeof llmTieBreak === "function") {
    return { family: top[0], confidence, scores, contested: [top[0], second[0]] };
  }
  return { family: top[0], confidence, scores };
}

// --- Spec: the one object every tab shares -----------------------------------
export function buildSpec({ rawString = "", family, company = "", answers = {}, competitors = [] } = {}) {
  const fam = family || senseFamily(rawString).family || "sales";
  const skills = [
    ...(answers.stack || []),
    ...(answers.vertical || []),
    ...(answers.domain || []),
  ].map((x) => String(x).toLowerCase());
  const mustHaves = (answers.signals || []).map((x) => String(x));
  return {
    family: fam,
    company: company.trim(),
    answers,
    titles: expandTitles(fam),
    skills,
    mustHaves,
    seniorities: senioritiesFrom(answers),
    locations: DEFAULT_LOCATIONS.slice(),
    competitors,
    weights: FAMILIES[fam].weights,
  };
}

export function expandTitles(family) {
  const f = FAMILIES[family] || FAMILIES.sales;
  return [...new Set([...f.titles, ...f.variants])];
}

function senioritiesFrom(answers = {}) {
  const map = { Junior: ["entry"], Mid: ["senior"], Senior: ["senior"], "Staff+": ["senior", "director"] };
  if (answers.level && map[answers.level]) return map[answers.level];
  return []; // otherwise let titles carry seniority
}

// --- Query: boolean + structured params for the sourcing layer ---------------
export function buildQuery(spec) {
  const f = FAMILIES[spec.family] || FAMILIES.sales;
  const orG = (arr) => "(" + arr.join(" OR ") + ")";
  const parts = [orG(f.titles.map((t) => `"${t}"`))];
  if (spec.skills.length) parts.push(orG(spec.skills));
  spec.mustHaves.forEach((m) => parts.push(`"${m}"`));
  parts.push(orG(spec.locations));
  let boolean = parts.join(" AND ");
  const comps = spec.competitors && spec.competitors.length ? spec.competitors : competitorsFallback(spec.company);
  if (spec.company) boolean += ` AND currentCompany:${orG(comps)}`;
  boolean += " NOT intern";

  return {
    boolean,
    // Shape matches api/xray.js so the same proxy serves this. `competitors`
    // is the list to actually source FROM (loop the proxy over them).
    query: {
      companyName: spec.company || undefined,
      titles: spec.titles,
      seniorities: spec.seniorities,
      locations: spec.locations,
      competitors: spec.company ? comps : [],
    },
    sources: gateSources(spec).map((s) => s.id),
  };
}

// --- Competitor resolution: grounded LLM, cached, with graceful fallback -----
// A hardcoded map can't be accurate. Instead resolve via an injected, WEB-
// GROUNDED model (Gemini w/ Google Search, or Perplexity Sonar — see
// lib/groundedModel.js). Grounding matters: an ungrounded model recites stale
// rivals from training data. Results are cached per company (persist the cache
// in Firestore to make it free across sessions).
const _competitorCache = new Map();

export async function resolveCompetitors(company, { callModel, industry = "", region = "India", max = 6, cache = _competitorCache } = {}) {
  const key = String(company || "").trim().toLowerCase();
  if (!key) return { competitors: [], source: "empty" };
  if (cache.has(key)) return { competitors: cache.get(key), source: "cache" };
  if (typeof callModel !== "function") return { competitors: competitorsFallback(company), source: "fallback" }; // <-- WIRE a grounded model

  const prompt =
    `List the ${max} closest DIRECT competitors of "${company}"` +
    (industry ? ` in ${industry}` : "") +
    (region ? `, for hiring/sourcing in ${region}` : "") +
    `. Only real, currently-operating companies a recruiter would realistically poach talent from. ` +
    `Return ONLY a JSON array of company names, most-direct first — no prose, no code fences.`;

  try {
    const raw = await callModel(prompt);
    const list = parseCompanies(raw, company, max);
    if (list.length) { cache.set(key, list); return { competitors: list, source: "llm" }; }
    return { competitors: competitorsFallback(company), source: "empty_result" };
  } catch {
    return { competitors: competitorsFallback(company), source: "error" };
  }
}

function parseCompanies(raw, self, max) {
  let text = String(raw).replace(/```json|```/g, "").trim();
  const m = text.match(/\[[\s\S]*\]/);
  let arr = [];
  if (m) { try { arr = JSON.parse(m[0]); } catch { /* fall through */ } }
  if (!Array.isArray(arr) || !arr.length) {
    arr = text.split(/[\n,]+/).map((s) => s.replace(/^[-*\d.\s]+/, "").trim()); // salvage a non-JSON reply
  }
  const selfL = String(self).trim().toLowerCase();
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))]
    .filter((s) => s.toLowerCase() !== selfL && s.length < 60)
    .slice(0, max);
}

const competitorsFallback = (company) => [`${String(company).trim()} competitors`];

// --- Source gating: the ranked "where to look" -------------------------------
export function gateSources(spec) {
  const f = FAMILIES[spec.family] || FAMILIES.sales;
  const a = spec.answers || {};
  let sources = f.sources.map((s) => ({ ...s }));
  // Answer-aware nudges: OSS must-have lifts GitHub; quota lifts award mentions.
  if (spec.family === "engineering" && a.oss === "Must-have") {
    sources = sources.map((s) => (s.id === "github" ? { ...s, weight: s.weight + 2 } : s));
  }
  if (spec.family === "sales" && (a.quota === "Yes" || (a.signals || []).includes("President's Club"))) {
    sources = sources.map((s) => (s.id === "serp" ? { ...s, weight: s.weight + 1 } : s));
  }
  return sources.sort((x, y) => y.weight - x.weight);
}

// --- Tier normalization: shared by the card + company map --------------------
const TIER_RULES = [
  [/(chief|cxo|\bcfo\b|\bcto\b|\bceo\b|\bchro\b|founder|owner|president(?!'s))/i, "Leadership"],
  [/(vp|vice president|head of|director)/i, "Directors"],
  [/(manager|lead|principal|staff)/i, "Managers"],
  [/(senior|sr\.?|specialist|analyst|engineer|executive|associate|representative)/i, "Individual Contributors"],
];
export function tierOf(titleOrSeniority = "") {
  const s = String(titleOrSeniority);
  for (const [re, tier] of TIER_RULES) if (re.test(s)) return tier;
  return "Unclassified";
}

// --- Deterministic prefilter: the free relevance gate ------------------------
// Returns {keep, prescore 0..1, reasons[]}. Run on EVERY scraped profile; only
// send survivors to the LLM scorer. Unspecified criteria don't penalise.
export function prefilter(profile, spec, threshold = 0.35) {
  const title = String(profile.title || "").toLowerCase();
  const hay = (title + " " + (profile.summary || "") + " " + (profile.skills || []).join(" ")).toLowerCase();
  const w = spec.weights;
  const reasons = [];

  // title
  let titleScore = 0;
  if (spec.titles.some((t) => title.includes(t.toLowerCase()))) { titleScore = 1; reasons.push("title match"); }
  else if (spec.titles.some((t) => t.split(" ").some((word) => word.length > 3 && title.includes(word)))) { titleScore = 0.6; reasons.push("partial title"); }

  // skills / must-haves
  let skillScore = 1;
  const wanted = [...spec.skills, ...spec.mustHaves.map((m) => m.toLowerCase())];
  if (wanted.length) {
    const hits = wanted.filter((k) => hay.includes(k));
    skillScore = hits.length / wanted.length;
    if (hits.length) reasons.push(`${hits.length}/${wanted.length} skills`);
  }

  // seniority (via tier)
  let senScore = 1;
  if (spec.seniorities.length) {
    const tier = tierOf(profile.title);
    const wantSenior = spec.seniorities.includes("director") || spec.seniorities.includes("senior");
    const isSenior = ["Leadership", "Directors", "Managers"].includes(tier) || /senior|staff|principal/i.test(title);
    senScore = wantSenior === isSenior ? 1 : 0.4;
  }

  // location
  let locScore = 1;
  const loc = String(profile.location || profile.city || profile.country || "").toLowerCase();
  if (spec.locations.length && loc) {
    locScore = spec.locations.some((l) => loc.includes(l.toLowerCase())) ? 1 : 0.3;
    if (locScore === 1) reasons.push("in-region");
  }

  const prescore = +(titleScore * w.title + skillScore * w.skills + senScore * w.seniority + locScore * w.location).toFixed(3);
  // Relevance gate: location + seniority defaults alone must never keep a
  // profile. Require a real title or skill hit, or it's out whatever the score.
  const skillHit = wanted.length > 0 && wanted.some((k) => hay.includes(k));
  const relevant = titleScore > 0 || skillHit;
  return { keep: relevant && prescore >= threshold, prescore, reasons };
}

// Deterministic-only ranking (no LLM) — a fast first pass or offline fallback.
export function rankLocal(profiles, spec, threshold = 0.35) {
  return profiles
    .map((p) => ({ ...p, pre: prefilter(p, spec, threshold) }))
    .filter((p) => p.pre.keep)
    .sort((a, b) => b.pre.prescore - a.pre.prescore);
}
