import { llmCall } from "./llm.js";
import { getStoredKey } from "./storage.js";
import { rankLocal } from "./relevanceEngine.js";
import { mapPool } from "./http.js";

/* Completes the pipeline relevanceEngine.js documents:
   sense -> buildSpec -> buildQuery -> [fetch] -> prefilter (free)
         -> scoreBatch (here, LLM, only on survivors) -> cards
   One LLM call per surviving candidate, scoring against the spec's titles/
   skills/must-haves/competitors. Returns exactly the shape CandidateCard.jsx
   already expects as `profile.match`. */
export async function scoreProfile(profile, spec, { provider } = {}) {
  const prov = provider || getStoredKey("provider_pref") || "auto";
  const prompt = `SPEC:
Role family: ${spec.family}
Titles wanted: ${(spec.titles || []).slice(0, 12).join(", ") || "none specified"}
Skills / vertical: ${(spec.skills || []).join(", ") || "none specified"}
Must-have signals: ${(spec.mustHaves || []).join(", ") || "none"}
Target company or competitors to source from: ${(spec.competitors || []).join(", ") || spec.company || "none"}
Locations: ${(spec.locations || []).join(", ") || "any"}

CANDIDATE:
Name: ${profile.name || "unknown"}
Title / headline: ${profile.title || profile.bio || "unknown"}
Company: ${profile.org || profile.company || "unknown"}
Location: ${profile.location || "unknown"}
Source: ${profile.source || "unknown"}
Bio/summary: ${(profile.summary || profile.bio || "").slice(0, 400)}`;

  const out = await llmCall(
    prov,
    'You are a recruiting analyst scoring a sourced candidate against a hiring spec. Be honest and specific, never inflate a score to be encouraging. Return STRICT JSON only, no markdown, no commentary: {"score": 0-100, "tier": "Strong|Good|Maybe|Weak", "reason": "1-2 sentences citing specific matched or missing signals", "matched": ["short strings"], "missed": ["short strings"]}',
    prompt,
    { json: true, temperature: 0.2 }
  );

  const score = Math.max(0, Math.min(100, Math.round(Number(out.score) || 0)));
  return {
    score,
    tier: out.tier || tierFromScore(score),
    reason: out.reason || "",
    matched: Array.isArray(out.matched) ? out.matched : [],
    missed: Array.isArray(out.missed) ? out.missed : [],
  };
}

function tierFromScore(score) {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 35) return "Maybe";
  return "Weak";
}

/* Runs the free deterministic prefilter first (culls obvious misses for
   nothing) then LLM-scores only the survivors, in parallel. One candidate's
   scoring failure never drops it — falls back to a prescore-derived,
   clearly-labelled "Unscored" tier instead. */
/* Scores at most `max` survivors, `concurrency` at a time.

   This previously fired every survivor at the LLM simultaneously via
   Promise.all, which rate-limits on free tiers and makes the whole search look
   hung. The prefilter already ranks by prescore, so capping takes the best
   candidates rather than an arbitrary slice; anything beyond the cap still
   renders, carrying its deterministic score. */
export async function scoreBatch(profiles, spec, opts = {}) {
  const { max = 24, concurrency = 4 } = opts;
  const survivors = rankLocal(profiles, spec, opts.threshold);
  const head = survivors.slice(0, max);
  const tail = survivors.slice(max).map((p) => ({ ...p, match: deterministicMatch(p, "Beyond the scoring cap — deterministic pre-filter score.") }));

  const scored = await mapPool(head, concurrency, async (p) => {
    try {
      return { ...p, match: await scoreProfile(p, spec, opts) };
    } catch (e) {
      return { ...p, match: deterministicMatch(p, `LLM scoring failed (${e.message || e}) — showing the deterministic pre-filter score instead.`) };
    }
  });

  return [...scored, ...tail].sort((a, b) => (b.match.score || 0) - (a.match.score || 0));
}

function deterministicMatch(p, reason) {
  return {
    score: Math.round((p.pre?.prescore || 0) * 100),
    tier: "Unscored",
    reason,
    matched: p.pre?.reasons || [],
    missed: [],
  };
}
