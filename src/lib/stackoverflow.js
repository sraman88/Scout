export async function searchStackOverflow({ ghLanguage, profQuery }) {
  let tag = (ghLanguage || profQuery.split(/\s+/)[0] || "javascript").toLowerCase().trim();
  const tagMap = { js: "javascript", ts: "typescript", py: "python", node: "node.js", react: "reactjs", vue: "vue.js" };
  tag = tagMap[tag] || tag;
  const url = `https://api.stackexchange.com/2.3/tags/${encodeURIComponent(tag)}/top-answerers/all_time?site=stackoverflow&pagesize=20`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`StackOverflow ${res.status} — tag "${tag}" may not exist. Try a different language.`);
  const data = await res.json();
  if (data.error_id) throw new Error(`SO API: ${data.error_message || "tag not found"}`);
  if (!data.items || data.items.length === 0) throw new Error(`No top answerers found for tag "${tag}"`);
  return data.items.slice(0, 12).map((it) => ({
    source: "stackoverflow", username: String(it.user?.user_id || ""),
    name: (it.user?.display_name || "").replace(/&#39;/g, "'"),
    bio: `Score ${it.score} · Posts ${it.post_count} · Tag: ${tag}`,
    profile_url: it.user?.link || "", avatar_url: it.user?.profile_image,
  }));
}
