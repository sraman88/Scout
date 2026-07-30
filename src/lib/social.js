import { proxyFetch } from "./proxyFetch.js";

export async function redditLookup(username) {
  const out = { found: false, karma: null, age: null, subs: [], recent_posts: [], url: `https://www.reddit.com/user/${username}/` };
  try {
    const aboutRaw = await proxyFetch(`https://www.reddit.com/user/${username}/about.json`);
    const about = JSON.parse(aboutRaw);
    if (about?.data?.name) {
      out.found = true;
      out.karma = (about.data.link_karma || 0) + (about.data.comment_karma || 0);
      out.age = new Date(about.data.created_utc * 1000).getFullYear();
    }
    try {
      const submittedRaw = await proxyFetch(`https://www.reddit.com/user/${username}/submitted.json?limit=20`);
      const submitted = JSON.parse(submittedRaw);
      const subs = new Set();
      const posts = [];
      (submitted.data?.children || []).forEach((c) => {
        subs.add(c.data.subreddit);
        posts.push({ title: c.data.title, sub: c.data.subreddit, url: `https://reddit.com${c.data.permalink}`, score: c.data.score, time: new Date(c.data.created_utc * 1000).toLocaleDateString() });
      });
      out.subs = Array.from(subs).slice(0, 10);
      out.recent_posts = posts.slice(0, 5);
    } catch { /* submitted-posts fetch failed */ }
  } catch { /* about.json fetch failed */ }
  return out;
}

export async function devtoLookup(username) {
  const out = { found: false, posts: [], url: `https://dev.to/${username}` };
  try {
    const r = await fetch(`https://dev.to/api/articles?username=${encodeURIComponent(username)}&per_page=5`);
    if (!r.ok) return out;
    const data = await r.json();
    if (Array.isArray(data) && data.length > 0) {
      out.found = true;
      out.posts = data.map((p) => ({ title: p.title, url: p.url, time: new Date(p.published_at).toLocaleDateString(), reactions: p.public_reactions_count }));
    }
  } catch { /* dev.to API unavailable */ }
  return out;
}

export function buildXRayQuery(site, { profQuery, mustHave, ghLocation, ghExpYears }) {
  const skills = profQuery || (mustHave || []).slice(0, 3).join(" ");
  const loc = ghLocation;
  let q = `site:${site}`;
  if (site.includes("linkedin")) q += "/in";
  if (skills) q += " " + skills.split(/\s+/).filter(Boolean).slice(0, 4).map((s) => `"${s}"`).join(" ");
  if (loc) q += ` "${loc}"`;
  if (ghExpYears) q += ` "${ghExpYears}+ years"`;
  return q;
}

/* Google dork-style search links for platforms with no free, ToS-compliant
   lookup API (Facebook, Instagram, X/Twitter profile-by-username). These are
   plain search-link generators — nothing is fetched from those sites directly. */
export function buildEmailXRays(username, fullName) {
  const u = (username || "").trim(), n = (fullName || "").trim();
  const q = [];
  if (u) {
    q.push({ label: "username + common email domains", query: `"${u}" ("@gmail.com" OR "@outlook.com" OR "@yahoo.com" OR "@hotmail.com" OR "@protonmail.com")` });
    q.push({ label: "LinkedIn profile", query: `site:linkedin.com/in "${u}"` });
    q.push({ label: "X / Twitter profile", query: `(site:twitter.com/${u} OR site:x.com/${u})` });
    q.push({ label: "Facebook profile", query: `site:facebook.com "${u}"` });
    q.push({ label: "Instagram profile", query: `site:instagram.com "${u}"` });
    q.push({ label: "Reddit mentions", query: `site:reddit.com "${u}"` });
    q.push({ label: "Twitter / X mentions", query: `(site:twitter.com OR site:x.com) "${u}"` });
    q.push({ label: "Dev.to / Hashnode / Medium", query: `(site:dev.to OR site:hashnode.com OR site:medium.com OR site:substack.com) "${u}"` });
    q.push({ label: "Mastodon / Bluesky", query: `(site:mastodon.social OR site:bsky.app) "${u}"` });
    q.push({ label: "Personal sites / blogs", query: `"${u}" ("about me" OR "contact" OR "@") -site:github.com -site:linkedin.com` });
  }
  if (n) {
    q.push({ label: "full name + email", query: `"${n}" ("@gmail.com" OR "@outlook.com" OR "contact me" OR "email me")` });
    q.push({ label: "name + LinkedIn", query: `site:linkedin.com/in "${n}"` });
    q.push({ label: "name + Facebook", query: `site:facebook.com "${n}"` });
    q.push({ label: "name + Instagram", query: `site:instagram.com "${n}"` });
    q.push({ label: "name + AmbitionBox / Naukri (India)", query: `(site:ambitionbox.com OR site:naukri.com) "${n}"` });
  }
  return q;
}
