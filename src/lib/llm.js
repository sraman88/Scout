import { ENV_GROQ, ENV_GEMINI } from "../theme.js";
import { getStoredKey } from "./storage.js";
import { fetchWithTimeout } from "./http.js";

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
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    timeoutMs: 30000,
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

/* Gemini model resolution.

   This used to hardcode `gemini-1.5-flash`, which Google retired — every
   scoring call then failed with a 404 telling us to call ListModels. So we do
   exactly that: try the current preferred names, and if none are served to
   this key, ask the API which models it actually has and pick a flash-class
   one that supports generateContent. The winner is cached for the session, so
   this survives the next retirement without another code change. */
const GEMINI_PREFERRED = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
let _geminiModel = null;

async function listGeminiModels(key) {
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { timeoutMs: 10000 });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    .filter(Boolean);
}

async function resolveGeminiModel(key) {
  if (_geminiModel) return _geminiModel;
  const pinned = getStoredKey("gemini_model");
  if (pinned) { _geminiModel = pinned.trim(); return _geminiModel; }

  const available = await listGeminiModels(key);
  if (available.length) {
    const pick =
      GEMINI_PREFERRED.find((m) => available.includes(m)) ||
      available.find((m) => /flash/i.test(m) && !/(vision|embedding|thinking)/i.test(m)) ||
      available.find((m) => /gemini/i.test(m) && !/(vision|embedding)/i.test(m));
    if (pick) { _geminiModel = pick; return pick; }
  }
  _geminiModel = GEMINI_PREFERRED[0]; // nothing listed — try the newest and let the error surface
  return _geminiModel;
}

async function geminiGenerate(model, key, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  return fetchWithTimeout(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), timeoutMs: 30000,
  });
}

export async function callGemini(prompt, opts = {}) {
  const key = getStoredKey("gemini") || ENV_GEMINI;
  if (!key) throw new Error("Gemini key missing — open Settings (⚙) to enter it");
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  let model = await resolveGeminiModel(key);
  let res = await geminiGenerate(model, key, body);

  // Model retired or not served to this key — re-resolve once against ListModels.
  if (res.status === 404) {
    _geminiModel = null;
    const available = await listGeminiModels(key);
    const next = GEMINI_PREFERRED.find((m) => available.includes(m)) || available.find((m) => /flash/i.test(m));
    if (next && next !== model) {
      _geminiModel = next;
      model = next;
      res = await geminiGenerate(model, key, body);
    }
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status} (${model}): ${t.slice(0, 160)}`);
  }
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
