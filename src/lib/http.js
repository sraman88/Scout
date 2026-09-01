/* Every remote call in Scout goes through here.

   Without an abort signal a stalled source hangs the whole search: the page
   sat on "Searching…" indefinitely because Promise.all only settles when the
   slowest fetch does, and none of them had a deadline. */

export const DEFAULT_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(url, { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`, { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJSON(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* Bounded-concurrency map. scoreBatch used to fire one LLM call per surviving
   candidate all at once, which rate-limits on free tiers and makes scoring
   feel like it hangs; a small pool is both faster in practice and kinder. */
export async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
