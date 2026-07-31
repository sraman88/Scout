import { getStoredKey } from "./storage.js";
import { asText, asArray } from "./normalize.js";

async function runActor(actor, token, input, timeout = 90) {
  const apiUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${token}&timeout=${timeout}`;
  const res = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 401) throw new Error("Apify token rejected — check the token in Settings");
    if (res.status === 404) throw new Error(`Actor "${actor}" not found — verify the ID in Settings`);
    throw new Error(`Apify ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

/* Real LinkedIn candidate search (by keyword/title/location), not a
   single-profile lookup — used to auto-populate the Profiles tab from a
   parsed JD. Same account token as the profile-scraper actor; different
   actor since search and single-profile lookup are separate Apify actors. */
export async function searchLinkedInCandidates({ query, location, maxItems = 20 }) {
  const token = getStoredKey("apify");
  if (!token) throw new Error("Apify token missing — open Settings to enable live LinkedIn search");
  const actor = (getStoredKey("apify_search_actor") || "harvestapi~linkedin-profile-search").trim();
  const input = {
    searchQuery: query || "",
    locations: location ? [location] : [],
    profileScraperMode: "Short",
    maxItems,
  };
  const data = await runActor(actor, token, input, 120);
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => !item.error && item.succeeded !== false)
    .map((item) => {
      const name = asText(item.fullName) || [item.firstName, item.lastName].filter(Boolean).join(" ") || asText(item.headline) || "LinkedIn profile";
      return {
        source: "linkedin",
        username: item.publicIdentifier || (item.linkedinUrl || "").split("/in/")[1]?.replace(/\/$/, "") || "",
        name,
        bio: asText(item.headline),
        profile_url: item.linkedinUrl || item.profileUrl || "",
        location: asText(item.location) || asText(item.geoLocation) || "",
        avatar_url: item.photo || item.pictureUrl || item.profilePicture || "",
        followers: item.connectionsCount || item.followersCount || item.followerCount || 0,
        company: asText(item.currentPosition?.companyName) || asText(item.currentPosition?.company)
          || asText(item.experience?.[0]?.companyName) || asText(item.experiences?.[0]?.companyName) || "",
      };
    })
    .filter((p) => p.name || p.profile_url);
}

/* Real Google SERP scrape (title/url/snippet), not just a copyable X-ray
   search string — used alongside GitHub/LinkedIn results so "Google" is an
   actual data source in the combined feed instead of a link to click. */
export async function searchGoogleResults({ query, maxResults = 10 }) {
  const token = getStoredKey("apify");
  if (!token) throw new Error("Apify token missing — open Settings to enable live Google search");
  const actor = (getStoredKey("apify_google_actor") || "apify~google-search-scraper").trim();
  const input = { queries: query || "", maxPagesPerQuery: 1, countryCode: "in" };
  const data = await runActor(actor, token, input, 90);
  if (!Array.isArray(data) || data.length === 0) return [];
  const organic = asArray(data[0]?.organicResults);
  return organic.slice(0, maxResults).map((r) => ({
    source: "google",
    name: asText(r.title) || asText(r.displayedUrl) || "Google result",
    bio: asText(r.description),
    profile_url: r.url || "",
  }));
}
