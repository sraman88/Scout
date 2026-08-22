// api/xray.js — Vercel serverless function (Node 18+)
// -----------------------------------------------------------------------------
// Why this exists: Apollo/Cognism/ZoomInfo etc. don't allow browser-origin
// calls (CORS) and calling them client-side would expose a paid data key.
// So the SCOUT client calls THIS same-origin endpoint, and this forwards to the
// provider. BYOK is preserved: the user's provider key arrives per-request in
// the `x-provider-key` header and is forwarded once — never stored, never logged.
//
// Data minimization (DPDP): we return only the fields an org map needs and do
// NOT call Apollo's enrichment endpoint, so no emails/phones are pulled.
// -----------------------------------------------------------------------------

const APOLLO_URL = "https://api.apollo.io/api/v1/mixed_people/api_search";

// --- Provider adapter --------------------------------------------------------
// Swap this one function to change data providers. Everything else is generic.
function toApolloBody(q, page) {
  const body = { page, per_page: Math.min(q.perPage || 100, 100) };
  if (q.companyDomain) body.q_organization_domains_list = [q.companyDomain];
  else if (q.companyName) body.q_organization_keyword_tags = [q.companyName];
  if (Array.isArray(q.titles) && q.titles.length) body.person_titles = q.titles;
  if (Array.isArray(q.seniorities) && q.seniorities.length) body.person_seniorities = q.seniorities;
  if (Array.isArray(q.locations) && q.locations.length) body.person_locations = q.locations;
  return body;
}

// Keep only what a map needs. No contact enrichment.
function slimPerson(p) {
  return {
    id: p.id || null,
    name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || null,
    title: p.title || null,
    seniority: p.seniority || null,
    city: p.city || null,
    state: p.state || null,
    country: p.country || null,
    linkedin: p.linkedin_url || null,
    org: (p.organization && p.organization.name) || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const key = req.headers["x-provider-key"];
  if (!key) {
    return res.status(400).json({ error: "Missing x-provider-key header (BYOK)" });
  }

  const q = (typeof req.body === "string" ? safeJson(req.body) : req.body) || {};
  if (!q.companyDomain && !q.companyName) {
    return res.status(400).json({ error: "Provide companyDomain or companyName" });
  }

  const maxPages = Math.min(q.maxPages || 3, 10); // credit guardrail
  let page = 1;
  const all = [];
  let pagination = null;

  try {
    for (let i = 0; i < maxPages; i++) {
      const r = await fetch(APOLLO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": key,
        },
        body: JSON.stringify(toApolloBody(q, page)),
      });

      if (!r.ok) {
        const detail = await r.text();
        return res.status(r.status).json({ error: "Provider error", detail });
      }

      const data = await r.json();
      (data.people || []).forEach((p) => all.push(slimPerson(p)));
      pagination = data.pagination || null;

      const totalPages = (pagination && pagination.total_pages) || 1;
      if (page >= totalPages) break;
      page += 1;
    }

    return res.status(200).json({ people: all, pagination, count: all.length });
  } catch (e) {
    return res.status(500).json({ error: "Proxy failure", detail: String(e) });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
