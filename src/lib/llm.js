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

/* Models this key was offered but cannot actually call.

   Groq's /v1/models advertises `llama-3.3-70b-versatile` to keys that get a
   403/404 when they try to use it. The first version of this fix re-resolved
   against that same list, picked the same model, saw it was unchanged and gave
   up — so the identical error came back. A model that fails is now blocked for
   the session and resolution moves down the list. */
const _bad = { groq: new Set(), gemini: new Set() };

/* Exported for tests, and so a caller can force re-resolution. */
export function resetModelCache(provider) {
  const clear = (p) => {
    _model[p] = null;
    _bad[p].clear();
    if (p === "groq") _groqListed = null; else _geminiListed = null;
  };
  if (provider) clear(provider);
  else { clear("groq"); clear("gemini"); _lastGood = null; }
}

const isModelMissing = (status, body) =>
  status === 404 || status === 403 ||
  /model_not_found|does not exist|not found for api version|do not have access|decommissioned|deprecated/i.test(String(body));

const isJsonModeUnsupported = (body) =>
  /response_format|json_object|json_schema|responsemimetype/i.test(String(body));

/* Candidate order, minus the unusable classes and anything already proven bad.

   When the key's model listing came back, trust it: only preferred names that
   are actually offered, then the rest of the listing. When listing failed
   (bad key, endpoint down) fall back to the preferred names blind, so we can
   still walk down to something that works. */
function candidates(provider, available, { preferred, exclude, prefer }) {
  const pool = available.length
    ? [...preferred.filter((m) => available.includes(m)), ...available.filter((m) => prefer.test(m)), ...available]
    : [...preferred];
  const seen = new Set();
  return pool.filter((m) => {
    if (!m || seen.has(m) || exclude.test(m) || _bad[provider].has(m)) return false;
    seen.add(m);
    return true;
  });
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

const GROQ_OPTS = { preferred: GROQ_PREFERRED, exclude: GROQ_EXCLUDE, prefer: /instruct|versatile|instant/i };

let _groqListed = null;
async function groqCandidates(key) {
  const pinned = getStoredKey("groq_model");
  if (pinned && !_bad.groq.has(pinned.trim())) return [pinned.trim()];
  if (!_groqListed) _groqListed = await listGroqModels(key);
  return candidates("groq", _groqListed, GROQ_OPTS);
}

export async function callGroq(messages, opts = {}) {
  const key = getStoredKey("groq") || ENV_GROQ;
  if (!key) throw new Error("Groq key missing — open Settings (⚙) to enter it");

  const send = (model, json) => fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    timeoutMs: 30000,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, messages,
      temperature: opts.temperature ?? 0.3,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  const pool = await groqCandidates(key);
  if (!pool.length) throw new Error("Groq: no usable model for this key — check the key, or pin one via the groq_model setting");

  let lastErr = "";
  // Cached winner first, then walk the list; each failure is remembered.
  const order = _model.groq && !_bad.groq.has(_model.groq) ? [_model.groq, ...pool.filter((m) => m !== _model.groq)] : pool;

  for (const model of order.slice(0, 4)) {
    let res = await send(model, opts.json);

    if (!res.ok) {
      const body = await res.text();
      // Model exists but won't do JSON mode — retry it as plain text; the
      // parser already tolerates prose-wrapped JSON.
      if (opts.json && isJsonModeUnsupported(body)) {
        res = await send(model, false);
        if (!res.ok) { lastErr = `${res.status} (${model}): ${(await res.text()).slice(0, 140)}`; _bad.groq.add(model); continue; }
      } else if (isModelMissing(res.status, body)) {
        _bad.groq.add(model);
        lastErr = `${res.status} (${model}): ${body.slice(0, 140)}`;
        continue; // try the next candidate
      } else {
        throw new Error(`Groq ${res.status} (${model}): ${body.slice(0, 160)}`);
      }
    }

    const data = await res.json();
    const out = data.choices?.[0]?.message?.content || "";
    _model.groq = model;
    return opts.json ? safeParseJSON(out) : out;
  }

  throw new Error(`Groq: every candidate model was rejected. Last: ${lastErr}`);
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

const GEMINI_OPTS = { preferred: GEMINI_PREFERRED, exclude: GEMINI_EXCLUDE, prefer: /flash/i };

let _geminiListed = null;
async function geminiCandidates(key) {
  const pinned = getStoredKey("gemini_model");
  if (pinned && !_bad.gemini.has(pinned.trim())) return [pinned.trim()];
  if (!_geminiListed) _geminiListed = await listGeminiModels(key);
  return candidates("gemini", _geminiListed, GEMINI_OPTS);
}

export async function callGemini(prompt, opts = {}) {
  const key = getStoredKey("gemini") || ENV_GEMINI;
  if (!key) throw new Error("Gemini key missing — open Settings (⚙) to enter it");

  const send = (model, json) => fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST", headers: { "Content-Type": "application/json" }, timeoutMs: 30000,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.3,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    }
  );

  const pool = await geminiCandidates(key);
  if (!pool.length) throw new Error("Gemini: no usable model for this key — check the key, or pin one via the gemini_model setting");

  let lastErr = "";
  const order = _model.gemini && !_bad.gemini.has(_model.gemini) ? [_model.gemini, ...pool.filter((m) => m !== _model.gemini)] : pool;

  for (const model of order.slice(0, 4)) {
    let res = await send(model, opts.json);

    if (!res.ok) {
      const body = await res.text();
      if (opts.json && isJsonModeUnsupported(body)) {
        res = await send(model, false);
        if (!res.ok) { lastErr = `${res.status} (${model}): ${(await res.text()).slice(0, 140)}`; _bad.gemini.add(model); continue; }
      } else if (isModelMissing(res.status, body)) {
        _bad.gemini.add(model);
        lastErr = `${res.status} (${model}): ${body.slice(0, 140)}`;
        continue;
      } else {
        throw new Error(`Gemini ${res.status} (${model}): ${body.slice(0, 160)}`);
      }
    }

    const data = await res.json();
    const out = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    _model.gemini = model;
    return opts.json ? safeParseJSON(out) : out;
  }

  throw new Error(`Gemini: every candidate model was rejected. Last: ${lastErr}`);
}

const hasKey = (p) => (p === "groq" ? getStoredKey("groq") || ENV_GROQ : getStoredKey("gemini") || ENV_GEMINI);

/* The provider that last answered successfully. In "auto" the app just uses
   whichever service is actually working rather than making the user pick, and
   sticks with it until it fails. */
let _lastGood = null;
export const activeProvider = () => _lastGood;

export async function llmCall(provider, system, user, opts = {}) {
  const configured = ["groq", "gemini"].filter(hasKey);
  if (!configured.length) throw new Error("No LLM key configured — open Settings (⚙) to add a Groq or Gemini key");

  let order;
  if (provider === "groq" || provider === "gemini") {
    order = [provider, ...configured.filter((p) => p !== provider)]; // explicit choice first, other as fallback
  } else {
    order = _lastGood ? [_lastGood, ...configured.filter((p) => p !== _lastGood)] : configured;
  }
  order = order.filter(hasKey);

  let lastErr = null;
  for (const prov of order) {
    try {
      const out = prov === "groq"
        ? await callGroq([{ role: "system", content: system }, { role: "user", content: user }], opts)
        : await callGemini(`${system}\n\n---\n\n${user}`, opts);
      _lastGood = prov;
      return out;
    } catch (e) {
      lastErr = e;
      if (prov === _lastGood) _lastGood = null; // stop preferring a provider that just failed
    }
  }
  throw lastErr || new Error("No LLM provider available");
}
