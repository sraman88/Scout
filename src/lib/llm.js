import { ENV_GROQ, ENV_GEMINI } from "../theme.js";
import { getStoredKey } from "./storage.js";
import { fetchWithTimeout } from "./http.js";

/* Model resolution.

   Both providers retire model names on their own schedule, and both used to be
   hardcoded here — so scoring broke twice for the same reason: first Gemini
   ("gemini-1.5-flash is not found for API version v1beta"), then Groq
   ("llama-3.3-70b-versatile does not exist or you do not have access to it").

   So neither name is hardcoded now. Each provider is asked which models the
   user's key can actually use, the best available is picked and cached for the
   session, and a model-not-found reply re-resolves once and retries. A user
   can still pin one explicitly via the `groq_model` / `gemini_model` setting. */

export function safeParseJSON(text) {
  if (!text) throw new Error("Empty response from LLM");
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); }
  catch (err) { throw new Error(`Bad JSON from LLM: ${err.message}\n\nRaw: ${text.slice(0, 400)}`, { cause: err }); }
}

const _model = { groq: null, gemini: null };

/* Exported for tests, and so a caller can force re-resolution. */
export function resetModelCache(provider) {
  if (provider) _model[provider] = null;
  else { _model.groq = null; _model.gemini = null; }
}

const isModelMissing = (status, body) =>
  status === 404 || /model_not_found|does not exist|not found for api version/i.test(String(body));

function pickModel(available, { preferred, exclude, prefer }) {
  const usable = available.filter((m) => !exclude.test(m));
  return preferred.find((m) => usable.includes(m))
    || usable.find((m) => prefer.test(m))
    || usable[0]
    || null;
}

// --- Groq (OpenAI-compatible) ------------------------------------------------
const GROQ_PREFERRED = [
  "llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.1-8b-instant",
];
// whisper = audio, guard = moderation-only; neither can answer a chat prompt.
const GROQ_EXCLUDE = /whisper|tts|guard|embed|vision|distil/i;

async function listGroqModels(key) {
  try {
    const res = await fetchWithTimeout("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` }, timeoutMs: 10000,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).filter((m) => m.active !== false).map((m) => String(m.id || "")).filter(Boolean);
  } catch { return []; }
}

async function resolveGroqModel(key) {
  if (_model.groq) return _model.groq;
  const pinned = getStoredKey("groq_model");
  if (pinned) { _model.groq = pinned.trim(); return _model.groq; }

  const available = await listGroqModels(key);
  _model.groq = pickModel(available, { preferred: GROQ_PREFERRED, exclude: GROQ_EXCLUDE, prefer: /instruct|versatile|instant/i })
    || GROQ_PREFERRED[0];
  return _model.groq;
}

export async function callGroq(messages, opts = {}) {
  const key = getStoredKey("groq") || ENV_GROQ;
  if (!key) throw new Error("Groq key missing — open Settings (⚙) to enter it");

  const send = (model) => fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    timeoutMs: 30000,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  let model = await resolveGroqModel(key);
  let res = await send(model);

  if (!res.ok) {
    const body = await res.text();
    if (isModelMissing(res.status, body)) {
      resetModelCache("groq");
      const available = await listGroqModels(key);
      const next = pickModel(available, { preferred: GROQ_PREFERRED, exclude: GROQ_EXCLUDE, prefer: /instruct|versatile|instant/i });
      if (next && next !== model) {
        _model.groq = next;
        model = next;
        res = await send(model);
      }
    }
    if (!res.ok) {
      const finalBody = res.bodyUsed ? body : await res.text();
      throw new Error(`Groq ${res.status} (${model}): ${String(finalBody).slice(0, 160)}`);
    }
  }

  const data = await res.json();
  const out = data.choices?.[0]?.message?.content || "";
  return opts.json ? safeParseJSON(out) : out;
}

// --- Gemini ------------------------------------------------------------------
const GEMINI_PREFERRED = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
const GEMINI_EXCLUDE = /embedding|vision|aqa|imagen|veo|tts/i;

async function listGeminiModels(key) {
  try {
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { timeoutMs: 10000 });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter(Boolean);
  } catch { return []; }
}

async function resolveGeminiModel(key) {
  if (_model.gemini) return _model.gemini;
  const pinned = getStoredKey("gemini_model");
  if (pinned) { _model.gemini = pinned.trim(); return _model.gemini; }

  const available = await listGeminiModels(key);
  _model.gemini = pickModel(available, { preferred: GEMINI_PREFERRED, exclude: GEMINI_EXCLUDE, prefer: /flash/i })
    || GEMINI_PREFERRED[0];
  return _model.gemini;
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
  const send = (model) => fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), timeoutMs: 30000 }
  );

  let model = await resolveGeminiModel(key);
  let res = await send(model);

  if (!res.ok) {
    const errBody = await res.text();
    if (isModelMissing(res.status, errBody)) {
      resetModelCache("gemini");
      const available = await listGeminiModels(key);
      const next = pickModel(available, { preferred: GEMINI_PREFERRED, exclude: GEMINI_EXCLUDE, prefer: /flash/i });
      if (next && next !== model) {
        _model.gemini = next;
        model = next;
        res = await send(model);
      }
    }
    if (!res.ok) {
      const finalBody = res.bodyUsed ? errBody : await res.text();
      throw new Error(`Gemini ${res.status} (${model}): ${String(finalBody).slice(0, 160)}`);
    }
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
      }
      return await callGemini(`${system}\n\n---\n\n${user}`, opts);
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
