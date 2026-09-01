import { llmCall } from "./llm.js";

/* Turns raw Hacker News threads into recruiter-readable leads: what the thread
   actually is, and whether there are sourceable people in it. One LLM call for
   the whole batch rather than one per lead. Falls back to the raw snippet when
   no model is configured, so the section still renders something useful. */

const SYSTEM = `You summarise Hacker News threads for a technical recruiter who is sourcing candidates.
For each numbered thread return an object with:
  "i": the thread's number,
  "summary": ONE sentence (max 25 words) saying what the thread is about,
  "value": ONE short phrase on its sourcing value, e.g. "hiring thread — candidates in comments", "technical discussion — identifies experts", "no sourcing value",
  "people": true only if the thread plausibly contains individual people to source (hiring/who-wants-to-be-hired/show-off threads), else false.
Return STRICT JSON only: {"leads":[{"i":0,"summary":"...","value":"...","people":true}]}`;

export async function summarizeLeads(leads, { provider } = {}) {
  if (!leads?.length) return leads;
  const fallback = () => leads.map((l) => ({ ...l, summary: l.snippet || "", value: "", people: null }));

  const prompt = leads
    .map((l, i) => `${i}. TITLE: ${l.title}\n   POINTS: ${l.points} · COMMENTS: ${l.comments}\n   TEXT: ${(l.snippet || "").slice(0, 300) || "(link-only post)"}`)
    .join("\n\n");

  try {
    const out = await llmCall(provider, SYSTEM, prompt, { json: true, temperature: 0.2 });
    const byIndex = new Map((out.leads || []).map((r) => [Number(r.i), r]));
    return leads.map((l, i) => {
      const r = byIndex.get(i);
      return r
        ? { ...l, summary: r.summary || l.snippet || "", value: r.value || "", people: !!r.people }
        : { ...l, summary: l.snippet || "", value: "", people: null };
    });
  } catch {
    return fallback();
  }
}
