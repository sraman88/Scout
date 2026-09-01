import { getStoredKey } from "./storage.js";
import { ghEmailLookup } from "./github.js";
import { redditLookup, devtoLookup, buildEmailXRays } from "./social.js";
import { hnUserLookup } from "./hackernews.js";
import { scrapeLinkedInProfile } from "./apify.js";

/* Extracted from the old dedicated Email + Social tab's findEmail/
   enrichViaApify — same branching logic, now returns data directly instead
   of setting tab-local state, so any candidate card can call it inline. */
export async function revealContact(candidate) {
  if (candidate.source === "linkedin" && candidate.profile_url && getStoredKey("apify")) {
    const profile = await scrapeLinkedInProfile(candidate.profile_url);
    return {
      emails: profile.emails || [],
      phone: profile.phone || "",
      social_handles: [],
      xrays: buildEmailXRays(candidate.username || profile.name, profile.name || candidate.name),
      via: "apify",
    };
  }

  const u = (candidate.username || "").trim();
  if (!u) throw new Error("Not enough info to look up contact details for this candidate.");

  const [gh, rd, dv, hn] = await Promise.all([
    ghEmailLookup(u).catch((e) => ({ emails: [], profile: null, error: e.message })),
    redditLookup(u), devtoLookup(u), hnUserLookup(u),
  ]);

  const social_handles = [];
  if (gh.profile) social_handles.push({ platform: "GitHub", handle: `@${gh.profile.login}`, url: gh.profile.html_url, verified: true });
  if (gh.profile?.twitter_username) social_handles.push({ platform: "Twitter/X", handle: `@${gh.profile.twitter_username}`, url: `https://x.com/${gh.profile.twitter_username}`, verified: true });
  if (gh.profile?.blog) social_handles.push({ platform: "Website", handle: gh.profile.blog, url: gh.profile.blog.startsWith("http") ? gh.profile.blog : `https://${gh.profile.blog}`, verified: true });
  if (rd.found) social_handles.push({ platform: "Reddit", handle: `u/${u}`, url: rd.url, verified: true });
  if (dv.found) social_handles.push({ platform: "Dev.to", handle: `@${u}`, url: dv.url, verified: true });
  if (hn.found) social_handles.push({ platform: "Hacker News", handle: u, url: hn.url, verified: true });

  return {
    emails: gh.emails || [],
    phone: "",
    social_handles,
    xrays: buildEmailXRays(u, candidate.name),
    via: "github",
  };
}
