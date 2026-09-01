import { llmCall, resetModelCache, activeProvider } from "../src/lib/llm.js";
import { hydrateCache, resetCache } from "../src/lib/storage.js";

/* "Let the app choose what service it wants to use" — provider "auto" should
   use whatever actually answers, remember it, and switch on failure. */

function res(status, payload) {
  let used = false;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return { ok: status >= 200 && status < 300, status,
    get bodyUsed() { return used; },
    async text() { used = true; return body; },
    async json() { used = true; return JSON.parse(body); } };
}
const groqList = (ids) => res(200, { data: ids.map((id) => ({ id, active: true })) });
const geminiList = (ids) => res(200, { models: ids.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ["generateContent"] })) });
const groqOk = (t) => res(200, { choices: [{ message: { content: t } }] });
const geminiOk = (t) => res(200, { candidates: [{ content: { parts: [{ text: t }] } }] });
const DEAD = '{"error":{"code":"model_not_found","message":"does not exist"}}';

let hits = [];
async function run(name, keys, handler, assert, provider = "auto") {
  resetCache(); resetModelCache();
  hydrateCache(keys);
  hits = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const which = u.includes("groq.com") ? "groq" : "gemini";
    if (u.includes("/models?") || u.endsWith("/v1/models")) { hits.push(`${which}:list`); return handler(u, which, null); }
    hits.push(which);
    return handler(u, which, init);
  };
  let result = null, error = null;
  try { result = await llmCall(provider, "sys", "usr"); } catch (e) { error = e; }
  const ok = assert({ result, error, hits });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log("      hits:", JSON.stringify(hits), "err:", error?.message);
  return ok;
}

const r = [];

r.push(await run("auto uses the only configured provider",
  { gemini: "g" },
  (u, which) => which === "gemini"
    ? (u.includes("/models?") ? geminiList(["gemini-2.5-flash"]) : geminiOk("from gemini"))
    : res(500, "should not be called"),
  ({ result, hits }) => result === "from gemini" && !hits.some((h) => h.startsWith("groq"))));

r.push(await run("auto falls through to the other provider when one is exhausted",
  { groq: "k", gemini: "g" },
  (u, which) => {
    if (which === "groq") return u.endsWith("/v1/models") ? groqList(["llama-3.3-70b-versatile"]) : res(404, DEAD);
    return u.includes("/models?") ? geminiList(["gemini-2.5-flash"]) : geminiOk("gemini saved it");
  },
  ({ result }) => result === "gemini saved it"));

r.push(await run("auto remembers the provider that worked",
  { groq: "k", gemini: "g" },
  (u, which) => which === "groq"
    ? (u.endsWith("/v1/models") ? groqList(["llama-3.1-8b-instant"]) : groqOk("groq ok"))
    : geminiOk("gemini ok"),
  ({ result }) => result === "groq ok" && activeProvider() === "groq"));

r.push(await run("an explicit choice is still honoured first",
  { groq: "k", gemini: "g" },
  (u, which) => which === "gemini"
    ? (u.includes("/models?") ? geminiList(["gemini-2.0-flash"]) : geminiOk("explicit gemini"))
    : groqOk("groq"),
  ({ result, hits }) => result === "explicit gemini" && hits[0].startsWith("gemini"),
  "gemini"));

r.push(await run("no keys at all gives a clear message",
  {},
  () => res(500, "unused"),
  ({ error }) => /No LLM key configured/.test(error?.message || "")));

console.log(`\n${r.filter(Boolean).length}/${r.length} passed`);
process.exit(r.every(Boolean) ? 0 : 1);
