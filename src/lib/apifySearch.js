import { getStoredKey } from "./storage.js";
import { asText, asArray } from "./normalize.js";

/* Different harvestapi actors validate profileScraperMode against different
   enum formats — one wants the plain label ("Short"), another wants the
   pricing-suffixed label ("Short ($4 per 1k)") — confirmed by two different
   400 "invalid-input" responses quoting different allowed-value lists for
   the same-named field on different actors. Rather than hardcode a value
   per actor (which could drift again if harvestapi changes either schema),
   try both and let whichever the actor actually accepts win. */
const PROFILE_MODE_VARIANTS = ["Short", "Short ($4 per 1k)"];

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

/* Runs an actor whose input includes a profileScraperMode field, retrying
   with each known-good variant until one is accepted. */
async function runActorWithModeFallback(actor, token, baseInput, timeout) {
  let lastErr;
  for (const mode of PROFILE_MODE_VARIANTS) {
    try {
      return await runActor(actor, token, { ...baseInput, profileScraperMode: mode }, timeout);
    } catch (e) {
      lastErr = e;
      if (!String(e.message).includes("profileScraperMode")) throw e;
    }
  }
  throw lastErr;
}

/* Real LinkedIn candidate search (by keyword/title/location), not a
   single-profile lookup — used to auto-populate the Profiles tab from a
   parsed JD. Same account token as the profile-scraper actor; different
   actor since search and single-profile lookup are separate Apify actors. */
export async function searchLinkedInCandidates({ query, location, maxItems = 20, timeout = 90 }) {
  const token = getStoredKey("apify");
  if (!token) throw new Error("Apify token missing — open Settings to enable live LinkedIn search");
  const actor = (getStoredKey("apify_search_actor") || "harvestapi~linkedin-profile-search").trim();
  const input = {
    searchQuery: query || "",
    locations: location ? [location] : [],
    maxItems,
  };
  const data = await runActorWithModeFallback(actor, token, input, timeout);
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

function guessCompanyInput(companyDomain, companyName) {
  if (companyName && companyName.trim()) return companyName.trim();
  if (companyDomain && companyDomain.trim()) {
    const slug = companyDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0];
    return `https://www.linkedin.com/company/${slug}`;
  }
  return "";
}

/* Company org-mapping (who works at a target company), replacing the earlier
   Apollo-based /api/xray endpoint — Apollo's free plan has no API search
   access at all (confirmed via their own API_INACCESSIBLE error), while this
   Apify actor works with the same token already used for LinkedIn candidate
   search above, at a fraction of the cost. Runs entirely client-side, so
   (unlike the Apollo proxy) it also works with `npm run dev` locally. */
export async function searchCompanyEmployees({ companyDomain, companyName, titles, locations, maxItems = 50 }) {
  const token = getStoredKey("apify");
  if (!token) throw new Error("Apify token missing — open Settings to enable Company X-Ray");
  const actor = (getStoredKey("apify_company_actor") || "harvestapi~linkedin-company-employees").trim();
  const company = guessCompanyInput(companyDomain, companyName);
  if (!company) throw new Error("Provide a company domain or name");
  const input = {
    companies: [company],
    jobTitles: asArray(titles),
    locations: asArray(locations),
    maxItems,
  };
  const data = await runActorWithModeFallback(actor, token, input, 90);
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => !item.error && item.succeeded !== false)
    .map((item) => {
      const name = asText(item.fullName) || [item.firstName, item.lastName].filter(Boolean).join(" ") || "";
      return {
        id: item.publicIdentifier || item.linkedinUrl || name,
        name: name || "—",
        title: asText(item.headline) || asText(item.currentPosition?.position) || "",
        seniority: item.seniorityLevel || item.seniority || "",
        city: "",
        state: "",
        country: asText(item.location) || asText(item.geoLocation) || "",
        org: asText(item.currentPosition?.companyName) || company,
        linkedin: item.linkedinUrl || "",
      };
    })
    .filter((p) => p.name !== "—" || p.linkedin);
}

/* Fetches a URL through a real headless browser (handles JS-rendered career
   pages that the plain CORS-proxy chain in proxyFetch.js can't see) and
   returns clean extracted text. Used as a fallback when the free CORS-proxy
   fetch fails or comes back with too little content. */
export async function fetchUrlContent(url) {
  const token = getStoredKey("apify");
  if (!token) throw new Error("Apify token missing — open Settings to enable browser-based URL fetching");
  const actor = (getStoredKey("apify_browser_actor") || "apify~rag-web-browser").trim();
  const data = await runActor(actor, token, { query: url }, 60);
  if (!Array.isArray(data) || data.length === 0) throw new Error("Apify browser fetch returned no content for this URL");
  const text = asText(data[0]?.markdown) || asText(data[0]?.text);
  if (!text) throw new Error("Apify browser fetch returned an empty page");
  return text;
}
