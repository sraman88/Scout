// lib/companyIntel.js
// -----------------------------------------------------------------------------
// Checkable facts about a company, scrubbed from public sources.
//
// The company map used to assert things it could not support: an org tree that
// wore the company's name but was drawn from a hardcoded taxonomy, headcounts
// that were really "however many rows the scraper returned before its cap", and
// a "hiring" badge with nothing behind it. This module exists to supply facts
// that come with a citation, so the panel can show evidence instead of claims.
//
// Every source here is public, unauthenticated and CORS-open:
//   Wikidata     — headcount (dated), HQ, industry, founding year, website
//   Hacker News  — recent public signal: funding, layoffs, launches
//   Job boards   — real open roles, which is the only honest basis for "hiring"
//
// Each source is isolated: one being down or wrong costs its own row and
// nothing else. Everything returns a `source` URL so a recruiter can check it.
// -----------------------------------------------------------------------------
import { fetchWithTimeout } from "./http.js";

const TIMEOUT = 12000;

async function getJson(url) {
  const res = await fetchWithTimeout(url, { timeoutMs: TIMEOUT, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return res.json();
}

const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
const norm = (s) => slugify(s);

// --- Wikidata -----------------------------------------------------------------
/* Wikidata is the only free source that gives a headcount WITH A DATE. That
   date is the whole point: "12,000 employees" is meaningless without knowing
   whether it is from this year or from 2016. */
const WD = "https://www.wikidata.org/w/api.php";
const P = { employees: "P1128", hq: "P159", industry: "P452", founded: "P571", website: "P856", country: "P17" };

const claimValue = (entity, prop) => entity?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value ?? null;

/* An employee count carries a point-in-time qualifier (P585). Prefer the most
   recent statement rather than whichever happens to be first. */
export function pickEmployeeCount(entity) {
  const claims = entity?.claims?.[P.employees] || [];
  let best = null;
  for (const c of claims) {
    const amount = Number(String(c?.mainsnak?.datavalue?.value?.amount || "").replace("+", ""));
    if (!isFinite(amount) || !amount) continue;
    const when = c?.qualifiers?.P585?.[0]?.datavalue?.value?.time || "";
    const year = Number(String(when).match(/(\d{4})/)?.[1]) || 0;
    if (!best || year > best.year) best = { count: amount, year };
  }
  return best;
}

export async function wikidataCompany(name) {
  const q = String(name || "").trim();
  if (!q) return null;
  // origin=* is MediaWiki's documented way to get an anonymous CORS response.
  const found = await getJson(`${WD}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&origin=*&limit=5&type=item`);
  const hit = (found?.search || [])[0];
  if (!hit?.id) return null;

  const detail = await getJson(`${WD}?action=wbgetentities&ids=${hit.id}&format=json&origin=*&props=claims%7Clabels%7Cdescriptions&languages=en`);
  const entity = detail?.entities?.[hit.id];
  if (!entity) return null;

  const employees = pickEmployeeCount(entity);
  const founded = claimValue(entity, P.founded)?.time;
  return {
    id: hit.id,
    label: hit.label || q,
    description: hit.description || entity?.descriptions?.en?.value || "",
    employees: employees?.count ?? null,
    employeesAsOf: employees?.year ?? null,
    founded: founded ? Number(String(founded).match(/(\d{4})/)?.[1]) || null : null,
    website: claimValue(entity, P.website) || "",
    source: `https://www.wikidata.org/wiki/${hit.id}`,
    /* A name search can land on the wrong entity entirely — "Apollo" is a
       dozen things. Flagged rather than hidden, so the panel can say so. */
    confident: norm(hit.label) === norm(q),
  };
}

// --- Hacker News --------------------------------------------------------------
/* Recent public signal. For a recruiter this is genuinely actionable: a layoff
   thread means talent is available now; a funding round means they are about to
   out-bid you. */
const SIGNAL = /\b(layoffs?|laid off|lay(s|ing)? off|acquisitions?|acquir(e|es|ed|ing)|funding|fundraise|rais(e|es|ed|ing)\b|series [a-f]\b|ipo\b|shut(s|ting)? down|hiring freeze|restructur\w*|merger|wind(s|ing)? down|down ?sizing)/i;

export async function hackerNewsSignals(name, { limit = 5 } = {}) {
  const q = String(name || "").trim();
  if (!q) return [];
  const data = await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=20`);
  const rows = [];
  for (const h of data?.hits || []) {
    const title = String(h.title || "");
    if (!title) continue;
    // The query is loose, so require the company name in the title itself.
    if (!norm(title).includes(norm(q))) continue;
    rows.push({
      title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
      when: h.created_at ? String(h.created_at).slice(0, 10) : "",
      points: h.points || 0,
      notable: SIGNAL.test(title),
    });
    if (rows.length >= limit * 3) break;
  }
  // Signal-bearing stories first, then most recent.
  rows.sort((a, b) => (b.notable - a.notable) || String(b.when).localeCompare(String(a.when)));
  return rows.slice(0, limit);
}

// --- Job boards ---------------------------------------------------------------
/* The only honest basis for saying a company is hiring: their own careers feed.
   Greenhouse and Lever are the two boards that expose public JSON.
   A board slug is GUESSED from the company name, which risks reading a
   different company's jobs, so the board's own name is checked against the one
   we asked for and a mismatch is discarded — the same rule that stops a
   candidate being credited with a stranger's GitHub. */
export async function greenhouseJobs(name) {
  const slug = slugify(name);
  if (!slug) return null;
  const board = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}`);
  if (!board?.name || norm(board.name) !== norm(name)) return null; // wrong company's board
  const jobs = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  return {
    board: "Greenhouse",
    company: board.name,
    total: Number(jobs?.meta?.total ?? (jobs?.jobs || []).length) || 0,
    jobs: (jobs?.jobs || []).map((j) => ({ title: j.title, location: j.location?.name || "", url: j.absolute_url })),
    source: `https://boards.greenhouse.io/${slug}`,
  };
}

export async function leverJobs(name) {
  const slug = slugify(name);
  if (!slug) return null;
  const jobs = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!Array.isArray(jobs) || !jobs.length) return null;
  return {
    board: "Lever",
    company: name,
    total: jobs.length,
    jobs: jobs.map((j) => ({ title: j.text, location: j.categories?.location || "", url: j.hostedUrl })),
    source: `https://jobs.lever.co/${slug}`,
    /* Lever exposes no board-owner name to verify the slug against, so this
       cannot be confirmed the way Greenhouse can. */
    unverified: true,
  };
}

/* Open roles matching the craft being hired for — the number that makes
   "they're hiring" checkable instead of asserted. */
export function matchRoles(board, titles = []) {
  if (!board?.jobs?.length) return [];
  const needles = titles.map(norm).filter((t) => t.length > 3);
  if (!needles.length) return [];
  return board.jobs.filter((j) => needles.some((n) => norm(j.title).includes(n)));
}

// --- one call for the panel ---------------------------------------------------
export async function companyIntel(name, { titles = [] } = {}) {
  const company = String(name || "").trim();
  if (!company) return null;

  const settle = async (label, fn) => {
    try { return { label, value: await fn() }; }
    catch (e) { return { label, value: null, error: e.message || String(e) }; }
  };

  const [wd, hn, gh, lv] = await Promise.all([
    settle("wikidata", () => wikidataCompany(company)),
    settle("hn", () => hackerNewsSignals(company)),
    settle("greenhouse", () => greenhouseJobs(company)),
    settle("lever", () => leverJobs(company)),
  ]);

  const board = gh.value || lv.value || null;
  const openForCraft = matchRoles(board, titles);

  return {
    company,
    facts: wd.value,
    signals: hn.value || [],
    board,
    openForCraft,
    /* What was actually checked, so the panel can report its own coverage
       rather than implying it looked everywhere. */
    checked: [wd, hn, gh, lv].map((r) => ({ source: r.label, ok: !r.error && !!r.value, error: r.error || null })),
  };
}
