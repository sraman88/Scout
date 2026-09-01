import { callGroq, resetModelCache } from "../src/lib/llm.js";
import { hydrateCache, resetCache } from "../src/lib/storage.js";

/* Mocked Response, faithful about bodyUsed since llm.js branches on it. */
function res(status, payload) {
  let used = false;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    get bodyUsed() { return used; },
    async text() { used = true; return body; },
    async json() { used = true; return JSON.parse(body); },
  };
}

const modelList = (ids) => res(200, { object: "list", data: ids.map((id) => ({ id, active: true })) });
const chatOk = (text) => res(200, { choices: [{ message: { content: text } }] });
const NOT_FOUND = JSON.stringify({ error: { message: "The model `x` does not exist or you do not have access to it.", code: "model_not_found" } });

let calls = [];
function install(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const model = init?.body ? JSON.parse(init.body).model : null;
    calls.push({ url: u, model });
    return handler(u, model);
  };
}

async function run(name, handler, assert) {
  resetCache(); resetModelCache();
  hydrateCache({ groq: "test-key" });
  install(handler);
  let result = null, error = null;
  try { result = await callGroq([{ role: "user", content: "hi" }]); }
  catch (e) { error = e; }
  const ok = assert({ result, error, calls });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log("      calls:", JSON.stringify(calls.map((c) => c.model ?? c.url.split("/").pop())), "err:", error?.message);
  return ok;
}

const results = [];

// 1. Picks the top preferred model that the key actually has.
results.push(await run("picks preferred model from the live list",
  (u) => u.endsWith("/models")
    ? modelList(["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "whisper-large-v3"])
    : chatOk("hello"),
  ({ result, calls }) => result === "hello" && calls.some((c) => c.model === "llama-3.3-70b-versatile")));

// 2. THE REPORTED BUG: chosen model 404s -> re-resolve -> retry -> succeed.
results.push(await run("recovers from model_not_found and retries",
  (() => {
    let listed = 0;
    return (u, model) => {
      if (u.endsWith("/models")) {
        listed++;
        // First listing still advertises the model; by the retry it's gone.
        return listed === 1
          ? modelList(["llama-3.3-70b-versatile", "openai/gpt-oss-120b"])
          : modelList(["openai/gpt-oss-120b", "llama-3.1-8b-instant"]);
      }
      return model === "llama-3.3-70b-versatile" ? res(404, NOT_FOUND) : chatOk("recovered");
    };
  })(),
  ({ result, calls }) => result === "recovered" && calls.filter((c) => c.model).length === 2
    && calls.at(-1).model === "openai/gpt-oss-120b"));

// 3. Never selects audio/moderation-only models.
results.push(await run("excludes whisper and guard models",
  (u) => u.endsWith("/models")
    ? modelList(["whisper-large-v3", "meta-llama/llama-guard-4-12b", "qwen/qwen3-32b"])
    : chatOk("ok"),
  ({ result, calls }) => result === "ok" && calls.at(-1).model === "qwen/qwen3-32b"));

// 4. Models endpoint unavailable -> still attempts, and the error names the model.
results.push(await run("surfaces a named model when listing fails",
  (u) => u.endsWith("/models") ? res(401, "bad key") : res(404, NOT_FOUND),
  ({ error }) => !!error && /Groq 404 \(/.test(error.message)));

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
