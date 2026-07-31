import { ENV_GH } from "../theme.js";
import { getStoredKey } from "./storage.js";

export function ghHeaders() {
  const tok = getStoredKey("github") || ENV_GH;
  const h = { Accept: "application/vnd.github+json" };
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

export async function searchGitHubUsers({ ghLanguage, ghLocation, ghMinFollowers, ghExpYears }) {
  let q = "type:user";
  if (ghLanguage) q += ` language:${ghLanguage.replace(/\s/g, "")}`;
  if (ghLocation) q += ` location:"${ghLocation}"`;
  if (ghMinFollowers) q += ` followers:>=${ghMinFollowers}`;
  if (ghExpYears) {
    const y = parseInt(ghExpYears, 10);
    if (y > 0) {
      const cut = new Date(); cut.setFullYear(cut.getFullYear() - y);
      q += ` created:<${cut.toISOString().slice(0, 10)}`;
    }
  }
  const url = `https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=20&sort=followers`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    if (res.status === 403) throw new Error("GitHub rate-limited. Add a GitHub token in Settings (⚙) to get 5000 req/hour instead of 60.");
    throw new Error(`GitHub ${res.status}`);
  }
  const data = await res.json();
  const items = data.items || [];
  const enriched = await Promise.all(items.slice(0, 12).map(async (u) => {
    try {
      const r = await fetch(`https://api.github.com/users/${encodeURIComponent(u.login)}`, { headers: ghHeaders() });
      if (!r.ok) return null;
      const p = await r.json();
      return {
        source: "github", username: p.login, name: p.name || p.login,
        bio: p.bio || "", profile_url: p.html_url, location: p.location || "",
        company: p.company || "", blog: p.blog || "", twitter: p.twitter_username || "",
        followers: p.followers, following: p.following, public_repos: p.public_repos,
        created_at: p.created_at, avatar_url: p.avatar_url,
      };
    } catch { return null; }
  }));
  return enriched.filter(Boolean);
}

export async function ghEmailLookup(username) {
  const found = new Set();
  let profile = null;
  const u = encodeURIComponent(username);
  try {
    const r = await fetch(`https://api.github.com/users/${u}`, { headers: ghHeaders() });
    if (r.ok) {
      profile = await r.json();
      if (profile.email && !profile.email.includes("noreply")) found.add(profile.email);
    } else if (r.status === 404) throw new Error(`GitHub user "${username}" not found`);
    else if (r.status === 403) throw new Error("GitHub rate-limited. Add a token in Settings.");
  } catch (e) { if (!profile) throw e; }
  try {
    const r = await fetch(`https://api.github.com/users/${u}/events/public?per_page=100`, { headers: ghHeaders() });
    if (r.ok) {
      const events = await r.json();
      events.forEach((ev) => {
        if (ev.type === "PushEvent" && ev.payload?.commits) {
          ev.payload.commits.forEach((c) => {
            const em = c.author?.email;
            if (em && !em.includes("noreply")) found.add(em);
          });
        }
      });
    }
  } catch { /* events endpoint unavailable */ }
  try {
    const rr = await fetch(`https://api.github.com/users/${u}/repos?sort=updated&per_page=5`, { headers: ghHeaders() });
    if (rr.ok) {
      const repos = await rr.json();
      for (const repo of repos.slice(0, 5)) {
        try {
          const cr = await fetch(`https://api.github.com/repos/${u}/${encodeURIComponent(repo.name)}/commits?author=${u}&per_page=3`, { headers: ghHeaders() });
          if (!cr.ok) continue;
          const commits = await cr.json();
          commits.forEach((c) => {
            const em = c.commit?.author?.email;
            if (em && !em.includes("noreply")) found.add(em);
          });
        } catch { /* commit fetch failed, skip repo */ }
      }
    }
  } catch { /* repos endpoint unavailable */ }
  return { emails: Array.from(found), profile };
}
