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

// Gemini + Google Search grounding. You already hold a Gemini key, so this is
// ZERO new keys. Browser-callable, like your current Gemini calls.
export function geminiGrounded(apiKey, model = "gemini-2.5-flash") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  return async (prompt) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }], // <- grounding
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
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
