import { fetchWithTimeout } from "./http.js";
/* corsproxy.io led this list until it began rejecting keyless requests
   ("keyless_legacy_url", HTTP 403), which silently broke JD-link fetching.
   r.jina.ai leads now: keyless, and it returns readable extracted text
   instead of raw HTML — which is what the JD parser actually wants. */
const PROXIES = [
  (u) => `https://r.jina.ai/${u}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

export async function proxyFetch(url) {
  let lastErr = null;
  for (const p of PROXIES) {
    try {
      const res = await fetchWithTimeout(p(url), { timeoutMs: 12000 });
      if (!res.ok) { lastErr = new Error(`Proxy ${res.status}`); continue; }
      const txt = await res.text();
      if (!txt || txt.length < 50) { lastErr = new Error("Empty response"); continue; }
      return txt;
    } catch (e) { lastErr = e; continue; }
  }
  throw lastErr || new Error("All CORS proxies failed");
}
