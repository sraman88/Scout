import { ENV_GROQ, ENV_GEMINI } from "../theme.js";
import { getStoredKey } from "./storage.js";

export function safeParseJSON(text) {
  if (!text) throw new Error("Empty response from LLM");
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); }
  catch (err) { throw new Error(`Bad JSON from LLM: ${err.message}\n\nRaw: ${text.slice(0, 400)}`, { cause: err }); }
}

export async function callGroq(messages, opts = {}) {
  const key = getStoredKey("groq") || ENV_GROQ;
  if (!key) throw new Error("Groq key missing — open Settings (⚙) to enter it");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Groq ${res.status}: ${t.slice(0, 200)}`); }
  const data = await res.json();
  const out = data.choices?.[0]?.message?.content || "";
  return opts.json ? safeParseJSON(out) : out;
}

export async function callGemini(prompt, opts = {}) {
  const key = getStoredKey("gemini") || ENV_GEMINI;
  if (!key) throw new Error("Gemini key missing — open Settings (⚙) to enter it");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`); }
  const data = await res.json();
  const out = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return opts.json ? safeParseJSON(out) : out;
}

export async function llmCall(provider, system, user, opts = {}) {
  const order = provider === "gemini" ? ["gemini", "groq"] : ["groq", "gemini"];
  let lastErr = null;
  for (const prov of order) {
    try {
      if (prov === "groq") {
        return await callGroq([{ role: "system", content: system }, { role: "user", content: user }], opts);
      } else {
        return await callGemini(`${system}\n\n---\n\n${user}`, opts);
      }
    } catch (e) {
      lastErr = e;
      const hasGroq = getStoredKey("groq") || ENV_GROQ;
      const hasGem = getStoredKey("gemini") || ENV_GEMINI;
      if (prov === "groq" && !hasGem) break;
      if (prov === "gemini" && !hasGroq) break;
    }
  }
  throw lastErr || new Error("No LLM provider available");
}
