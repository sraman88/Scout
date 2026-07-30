import { getStoredKey } from "./storage.js";

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
      /* Normalise across actor output shapes */
      return {
        name: item.fullName || item.name || item.firstName + " " + item.lastName || "",
        firstName: item.firstName || "",
        lastName: item.lastName || "",
        headline: item.headline || item.summary || item.title || "",
        location: item.location || item.geoLocation || item.city || "",
        currentCompany: item.currentCompany || item.company || item.currentPosition?.company || item.experience?.[0]?.companyName || "",
        currentTitle: item.currentPosition?.title || item.experience?.[0]?.title || item.jobTitle || "",
        email: item.email || item.emailAddress || item.personalEmail || item.workEmail || "",
        emails: [item.email, item.emailAddress, item.personalEmail, item.workEmail, ...(item.emails || [])].filter(Boolean),
        phone: item.phone || item.phoneNumber || item.mobileNumber || "",
        profileUrl: item.profileUrl || item.linkedinUrl || item.url || url,
        connections: item.connections || item.connectionsCount || 0,
        followers: item.followers || item.followersCount || 0,
        experience: item.experience || item.positions || [],
        education: item.education || item.schools || [],
        skills: item.skills || [],
        languages: item.languages || [],
        certifications: item.certifications || [],
        about: item.about || item.summary || item.description || "",
        pictureUrl: item.pictureUrl || item.profilePicture || item.avatar || "",
        raw: item,
      };
    } catch (e) {
      lastErr = e;
      if (e.message.includes("token") || e.message.includes("not found")) throw e;
    }
  }
  throw lastErr || new Error("All Apify input variants failed — the profile actor may need a different input format");
}
