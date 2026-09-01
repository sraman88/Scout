import { callGemini, resetModelCache } from "../src/lib/llm.js";
import { hydrateCache, resetCache } from "../src/lib/storage.js";

function res(status, payload) {
  let used = false;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return { ok: status >= 200 && status < 300, status,
    get bodyUsed() { return used; },
    async text() { used = true; return body; },
    async json() { used = true; return JSON.parse(body); } };
}
const list = (ids) => res(200, { models: ids.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ["generateContent"] })) });
const gen = (t) => res(200, { candidates: [{ content: { parts: [{ text: t }] } }] });
const RETIRED = JSON.stringify({ error: { code: 404, message: "models/gemini-1.5-flash is not found for API version v1beta" } });

let calls = [];
async function run(name, handler, assert) {
  resetCache(); resetModelCache(); hydrateCache({ gemini: "k" });
  calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    const m = u.match(/models\/([^:?]+):generateContent/);
    calls.push(m ? m[1] : "LIST");
    return handler(u, m?.[1]);
  };
  let result = null, error = null;
  try { result = await callGemini("hi"); } catch (e) { error = e; }
  const ok = assert({ result, error, calls });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log("      calls:", JSON.stringify(calls), "err:", error?.message);
  return ok;
}

const r = [];
r.push(await run("picks a live flash model",
  (u) => u.includes("/models?") ? list(["gemini-2.0-flash", "gemini-2.5-flash", "text-embedding-004"]) : gen("hi there"),
  ({ result, calls }) => result === "hi there" && calls.at(-1) === "gemini-2.5-flash"));

r.push(await run("recovers when the cached model is retired",
  (() => { let n = 0; return (u, model) => {
    if (u.includes("/models?")) { n++; return n === 1 ? list(["gemini-2.5-flash", "gemini-2.0-flash"]) : list(["gemini-2.0-flash"]); }
    return model === "gemini-2.5-flash" ? res(404, RETIRED) : gen("recovered");
  }; })(),
  ({ result, calls }) => result === "recovered" && calls.at(-1) === "gemini-2.0-flash"));

r.push(await run("excludes embedding models",
  (u) => u.includes("/models?") ? list(["text-embedding-004", "imagen-3.0", "gemini-flash-latest"]) : gen("ok"),
  ({ result, calls }) => result === "ok" && calls.at(-1) === "gemini-flash-latest"));

console.log(`\n${r.filter(Boolean).length}/${r.length} passed`);
process.exit(r.every(Boolean) ? 0 : 1);
