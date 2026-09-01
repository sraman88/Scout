import { fetchWithTimeout, fetchJSON } from "./http.js";
import { proxyFetch } from "./proxyFetch.js";

/* Hacker News returns STORIES, not people.

   This used to be mapped straight into the candidate feed with `name` set to
   the story title, so "Ask HN: How can a senior software engineer shift to a
   low-level job" showed up as a 100%-match candidate. Stories are genuinely
   useful sourcing leads — hiring threads, "who wants to be hired", people
   describing their own stack — but they are leads, not profiles, so they get
   their own shape and their own section in the UI. */
export async function searchHackerNewsLeads({ query, mustHave, limit = 6 }) {
  const q = query || (mustHave || []).join(" ") || "engineer";
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${limit}`;

  /* Algolia's HN endpoint is CORS-blocked from some networks, which killed
     this source outright. Fall back to the same proxy chain the JD fetcher
     uses rather than dropping the section. */
  let data;
  try {
    data = await fetchJSON(url, { timeoutMs: 10000 });
  } catch {
    data = JSON.parse(await proxyFetch(url));
  }

  return (data.hits || []).slice(0, limit).map((h) => ({
    id: String(h.objectID),
    title: h.title || "Untitled thread",
    author: h.author || "",
    points: h.points ?? 0,
    comments: h.num_comments ?? 0,
    createdAt: h.created_at || "",
    articleUrl: h.url || "",
    hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
    snippet: (h.story_text || h._highlightResult?.story_text?.value || "")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
  }));
}

export async function hnUserLookup(username) {
  const u = encodeURIComponent(username);
  const out = { found: false, karma: null, recent: [], url: `https://news.ycombinator.com/user?id=${u}` };
  try {
    const data = await fetchJSON(`https://hacker-news.firebaseio.com/v0/user/${u}.json`, { timeoutMs: 8000 });
    if (data && data.id) {
      out.found = true;
      out.karma = data.karma;
      for (const id of (data.submitted || []).slice(0, 5)) {
        try {
          const res = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeoutMs: 6000 });
          if (!res.ok) continue;
          const item = await res.json();
          if (item) out.recent.push({
            title: item.title || (item.text || "").replace(/<[^>]+>/g, "").slice(0, 80),
            url: `https://news.ycombinator.com/item?id=${id}`,
            time: new Date(item.time * 1000).toLocaleDateString(),
            type: item.type,
          });
        } catch { /* item fetch failed, skip */ }
      }
    }
  } catch { /* user endpoint unavailable */ }
  return out;
}
