const PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

export async function proxyFetch(url) {
  let lastErr = null;
  for (const p of PROXIES) {
    try {
      const res = await fetch(p(url));
      if (!res.ok) { lastErr = new Error(`Proxy ${res.status}`); continue; }
      const txt = await res.text();
      if (!txt || txt.length < 50) { lastErr = new Error("Empty response"); continue; }
      return txt;
    } catch (e) { lastErr = e; continue; }
  }
  throw lastErr || new Error("All CORS proxies failed");
}
