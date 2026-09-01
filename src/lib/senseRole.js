import { llmCall } from "./llm.js";
import { senseFamily } from "./relevanceEngine.js";

/* LLM role understanding, extracted from the old Smart Insights panel so the
   one-page flow can use it directly.

   senseFamily() counts keywords and is instant and free, but it reads a JD
   literally — "we're hiring an HR lead for our engineering org" trips every
   engineering token. This reads the text in context and says what is actually
   being hired for, which is the difference between an HR search and a page of
   software engineers. Falls back to the deterministic sense whenever the model
   is unavailable or returns something unusable, so sourcing never hard-fails
   on a missing key. */

const SPEC_SYSTEM_PROMPT = `You are SCOUT's role-understanding engine. Given a recruiter's raw input — could be a few keywords or a full job description — extract structured hiring intent using full context and judgment, not keyword counting. Return STRICT JSON only, no markdown:
{
  "family": "sales|engineering|marketing|hr|techsupport|finance",
  "role_title": "canonical job title, e.g. Senior Account Executive",
  "seniority": "junior|mid|senior|lead|director|executive",
  "must_have": ["skill or signal", "..."],
  "nice_to_have": ["skill or signal", "..."],
  "location": "city, country — empty string if not mentioned",
  "company": "company name if the text names who they're hiring for — empty string otherwise"
}
Pick the family for the role BEING HIRED, not the department it supports: "HR business partner for the engineering org" is hr, not engineering. Never guess a company that isn't explicitly named.`;

export const LEVEL_MAP = { junior: "Junior", mid: "Mid", senior: "Senior", lead: "Staff+", director: "Staff+", executive: "Staff+" };

const VALID = new Set(["sales", "engineering", "marketing", "hr", "techsupport", "finance"]);

export async function deriveRole(text, { provider } = {}) {
  const local = senseFamily(text || "");
  const fallback = { family: local.family || "sales", confidence: local.confidence, source: "keywords", derived: null };
  if (!text || text.trim().length < 15) return fallback;

  try {
    const out = await llmCall(provider, SPEC_SYSTEM_PROMPT, text, { json: true, temperature: 0.15 });
    if (!out || !VALID.has(out.family)) return fallback;
    return { family: out.family, confidence: 1, source: "llm", derived: out };
  } catch {
    return fallback; // no key / rate-limited / offline — keyword sense still works
  }
}
