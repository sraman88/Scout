// lib/termInsight.js
// Explains a term the curated glossary doesn't carry. The glossary answers
// instantly and for free; this is the long tail — a niche framework, a vendor
// product, an acronym specific to one industry.
//
// Cached per term for the session, because the answer never changes within one
// and a recruiter clicking around a JD would otherwise pay for the same
// explanation repeatedly.
import { llmCall, safeParseJSON } from "./llm.js";
import { getStoredKey } from "./storage.js";

const _cache = new Map();

const SYSTEM = `You explain hiring jargon to a recruiter who is NOT technical and is screening candidates today.
Answer ONLY as JSON: {"label","what","where","screen":["..."],"related":["..."]}
- what: 1-2 sentences, plain English, no jargon used to explain jargon.
- where: why a company pays for this skill, and what kind of company uses it.
- screen: 2-3 CONCRETE things the recruiter can look for on a CV or ask on a call to tell real experience from a buzzword. Phrase them so they can be read out verbatim.
- related: up to 3 adjacent terms.
If the term is not a real skill, tool or hiring concept, return {"label":"","what":""} and nothing else.`;

export async function explainTerm(term, { role = "", provider } = {}) {
  const key = String(term || "").trim().toLowerCase();
  if (!key) return null;
  if (_cache.has(key)) return _cache.get(key);
  if (!getStoredKey("groq") && !getStoredKey("gemini")) {
    throw new Error("Add a Groq or Gemini key in Settings to explain terms Scout doesn't already know.");
  }

  const out = await llmCall(
    provider || getStoredKey("provider_pref") || "auto",
    SYSTEM,
    `Term: ${term}${role ? `\nSeen in a job description for: ${role}` : ""}`,
    { temperature: 0.2, maxTokens: 500 }
  );
  const parsed = safeParseJSON(out);
  if (!parsed?.what) { _cache.set(key, null); return null; }

  const insight = {
    id: `llm:${key}`,
    label: parsed.label || term,
    kind: "term",
    what: parsed.what,
    where: parsed.where || "",
    screen: Array.isArray(parsed.screen) ? parsed.screen.slice(0, 3) : [],
    related: Array.isArray(parsed.related) ? parsed.related.slice(0, 3) : [],
    generated: true, // the UI says so — a generated explanation is not curated
  };
  _cache.set(key, insight);
  return insight;
}

export const _resetInsightCache = () => _cache.clear();
