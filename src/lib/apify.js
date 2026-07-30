import { getStoredKey } from "./storage.js";

/* Different actors return plain strings for things like "location" while
   others (e.g. harvestapi) return a nested object ({ parsed: {...}, ... }).
   Rendering an object directly as JSX crashes the whole app with no error
   boundary, so every field that ends up as display text goes through this
   first to guarantee a string. */
function asText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    return v.text || v.linkedinText || v.name || v.city || v.title || v.parsed?.text || "";
  }
  return "";
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

export async function scrapeLinkedInProfile(profileInput) {
  const token = getStoredKey("apify");
  if (!token) throw new Error("Apify token missing — open Settings and add it");
  const actor = (getStoredKey("apify_profile_actor") || "dev_fusion~linkedin-profile-scraper").trim();
  /* Accept either a full LinkedIn URL or just a username */
  let url = profileInput.trim();
  if (!url.startsWith("http")) {
    url = `https://www.linkedin.com/in/${url.replace(/^@/, "").replace(/\/$/, "")}`;
  }
  /* Different profile actors expect different input shapes */
  const inputVariants = [
    { profileUrls: [url] },
    { profileScraperMode: "Short", profiles: [url] },
    { urls: [url] },
    { startUrls: [{ url }] },
    { linkedinProfileUrls: [url] },
    { url },
    { username: url.split("/in/")[1]?.replace(/\/$/, "") || url },
  ];
  let lastErr = null;
  for (const input of inputVariants) {
    try {
      const apiUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${token}&timeout=120`;
      const res = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 401) throw new Error("Apify token rejected — check the token in Settings");
        if (res.status === 404) throw new Error(`Actor "${actor}" not found — verify the ID in Settings`);
        lastErr = new Error(`Apify ${res.status}: ${t.slice(0, 200)}`);
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { lastErr = new Error("Apify returned no data — try a different input format or check the profile URL"); continue; }
      const item = data[0];
      /* Normalise across actor output shapes. Every text field is passed
         through asText() and every list field through asArray() since
         different actors (dev_fusion, harvestapi, ...) disagree on both
         field names and value shapes for the same concept. */
      const name = asText(item.fullName) || asText(item.name)
        || [item.firstName, item.lastName].filter(Boolean).join(" ") || "";
      return {
        name,
        firstName: item.firstName || "",
        lastName: item.lastName || "",
        headline: asText(item.headline) || asText(item.summary) || asText(item.title) || "",
        location: asText(item.location) || asText(item.geoLocation) || asText(item.city) || asText(item.jobLocation) || "",
        currentCompany: asText(item.currentCompany) || asText(item.company) || asText(item.companyName)
          || asText(item.currentPosition?.companyName) || asText(item.currentPosition?.company)
          || asText(item.experience?.[0]?.companyName) || asText(item.experiences?.[0]?.companyName) || "",
        currentTitle: asText(item.currentPosition?.position) || asText(item.currentPosition?.title) || asText(item.jobTitle)
          || asText(item.experience?.[0]?.position) || asText(item.experience?.[0]?.title)
          || asText(item.experiences?.[0]?.jobTitle) || "",
        email: item.email || item.emailAddress || item.personalEmail || item.workEmail || "",
        emails: [item.email, item.emailAddress, item.personalEmail, item.workEmail, ...asArray(item.emails)].filter(Boolean),
        phone: item.phone || item.phoneNumber || item.mobileNumber || "",
        profileUrl: item.profileUrl || item.linkedinUrl || item.url || url,
        connections: item.connections || item.connectionsCount || 0,
        followers: item.followers || item.followersCount || item.followerCount || 0,
        experience: asArray(item.experiences).length ? item.experiences : asArray(item.experience).length ? item.experience : asArray(item.positions),
        education: asArray(item.educations).length ? item.educations : asArray(item.education).length ? item.education : asArray(item.schools),
        skills: asArray(item.skills),
        languages: asArray(item.languages),
        certifications: asArray(item.certifications),
        about: asText(item.about) || asText(item.summary) || asText(item.description) || "",
        pictureUrl: item.pictureUrl || item.profilePicture || item.avatar || item.photo || "",
        raw: item,
      };
    } catch (e) {
      lastErr = e;
      if (e.message.includes("token") || e.message.includes("not found")) throw e;
    }
  }
  throw lastErr || new Error("All Apify input variants failed — the profile actor may need a different input format");
}
