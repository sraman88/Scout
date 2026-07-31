export async function searchHackerNews({ profQuery, mustHave }) {
  const q = profQuery || (mustHave || []).join(" ") || "engineer";
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=15`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const data = await res.json();
  return (data.hits || []).slice(0, 12).map((h) => ({
    source: "hn", username: h.author || "", name: h.title || "Who's hiring",
    bio: (h.story_text || "").replace(/<[^>]+>/g, " ").slice(0, 220),
    profile_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
  }));
}

export async function hnUserLookup(username) {
  const u = encodeURIComponent(username);
  const out = { found: false, karma: null, recent: [], url: `https://news.ycombinator.com/user?id=${u}` };
  try {
    const r = await fetch(`https://hacker-news.firebaseio.com/v0/user/${u}.json`);
    if (!r.ok) return out;
    const data = await r.json();
    if (data && data.id) {
      out.found = true;
      out.karma = data.karma;
      const items = (data.submitted || []).slice(0, 5);
      for (const id of items) {
        try {
          const ir = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          if (!ir.ok) continue;
          const item = await ir.json();
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
