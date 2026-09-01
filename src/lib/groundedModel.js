// lib/groundedModel.js
// -----------------------------------------------------------------------------
// Adapters that turn a BYOK key into a `callModel(prompt) => Promise<string>`
// for WEB-GROUNDED lookups (competitor resolution). Grounding is the whole
// point here: an ungrounded model recites stale rivals from training data,
// which is exactly the inaccuracy we're removing.
//
// Wire whichever the user picked in Settings, then hand it to the engine:
//   import { geminiGrounded, perplexity } from "./groundedModel";
//   import { resolveCompetitors } from "./relevanceEngine";
//   const callModel = settings.competitorModel.provider === "perplexity"
//     ? perplexity(settings.competitorModel.apiKey)
//     : geminiGrounded(settings.geminiKey);              // reuses existing key
//   const { competitors } = await resolveCompetitors(company, { callModel, industry, region:"India" });
// -----------------------------------------------------------------------------

/* Gemini + Google Search grounding. You already hold a Gemini key, so this is
   ZERO new keys. Browser-callable, like the other Gemini calls.

   Model names are not pinned to one string here for the same reason they are
   not pinned in llm.js — Google retires them and every call 404s. */
const GROUNDED_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

async function callGrounded(apiKey, prompt, preferred) {
  const tried = [];
  for (const model of [preferred, ...GROUNDED_MODELS].filter((m, i, a) => m && a.indexOf(m) === i)) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }], // <- grounding
      }),
    });
    if (r.ok) return r.json();
    const body = await r.text();
    tried.push(model);
    if (!(r.status === 404 || r.status === 403 || /not found|does not exist/i.test(body))) {
      throw new Error(`Gemini ${r.status} (${model}): ${body.slice(0, 160)}`);
    }
  }
  throw new Error(`Gemini: no grounded model available (tried ${tried.join(", ")})`);
}

const textOf = (data) => (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");

/* The citations behind a grounded answer. Surfacing these is what makes
   figures like salary bands checkable rather than something the model
   asserted — the recruiter can open the source and see the number. */
function sourcesOf(data) {
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set();
  return chunks
    .map((c) => ({ title: c.web?.title || "", uri: c.web?.uri || "" }))
    .filter((s) => s.uri && !seen.has(s.uri) && seen.add(s.uri))
    .slice(0, 8);
}

export function geminiGrounded(apiKey, model) {
  return async (prompt) => textOf(await callGrounded(apiKey, prompt, model));
}

/* Same call, but keeps the citations alongside the answer. */
export function geminiGroundedWithSources(apiKey, model) {
  return async (prompt) => {
    const data = await callGrounded(apiKey, prompt, model);
    return { text: textOf(data), sources: sourcesOf(data) };
  };
}

// Perplexity Sonar — purpose-built for grounded answers with citations,
// OpenAI-compatible. New key. Perplexity blocks browser CORS, so call this
// from a serverless route (e.g. /api/competitors) rather than the client.
export function perplexity(apiKey, model = "sonar") {
  return async (prompt) => {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!r.ok) throw new Error(`Perplexity ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return data.choices?.[0]?.message?.content || "";
  };
}

// Any OpenAI-compatible grounded endpoint (e.g. a gateway). Provide baseURL.
export function openAICompatible(apiKey, { baseURL, model }) {
  return async (prompt) => {
    const r = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2 }),
    });
    if (!r.ok) throw new Error(`Model ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return data.choices?.[0]?.message?.content || "";
  };
}
