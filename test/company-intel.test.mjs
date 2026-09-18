import { pickEmployeeCount, matchRoles, wikidataCompany, hackerNewsSignals, greenhouseJobs, companyIntel } from "../src/lib/companyIntel.js";

/* This module exists so the map can CITE instead of assert, so the tests are
   about not overclaiming: dating a headcount, refusing a job board that belongs
   to a different company, and reporting which sources were actually reached. */

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};

const stubFetch = (routes) => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    for (const [frag, payload] of Object.entries(routes)) {
      if (u.includes(frag)) {
        if (payload instanceof Error) throw payload;
        if (payload === 404) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => payload };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return () => { globalThis.fetch = real; };
};

// --- headcount must carry its date ------------------------------------------
{
  const entity = { claims: { P1128: [
    { mainsnak: { datavalue: { value: { amount: "+4000" } } }, qualifiers: { P585: [{ datavalue: { value: { time: "+2016-01-01T00:00:00Z" } } }] } },
    { mainsnak: { datavalue: { value: { amount: "+6500" } } }, qualifiers: { P585: [{ datavalue: { value: { time: "+2024-01-01T00:00:00Z" } } }] } },
  ] } };
  const best = pickEmployeeCount(entity);
  // "4,000 employees" from 2016 presented as current is exactly the kind of
  // confident-but-stale figure this panel is being fixed to stop showing.
  check("takes the most recent headcount, not the first", best.count === 6500 && best.year === 2024, best);
  check("no claims means no number", pickEmployeeCount({}) === null && pickEmployeeCount(null) === null);
  check("ignores an unparseable amount", pickEmployeeCount({ claims: { P1128: [{ mainsnak: { datavalue: { value: { amount: "many" } } } }] } }) === null);
}

// --- Wikidata identity -------------------------------------------------------
{
  const restore = stubFetch({
    wbsearchentities: { search: [{ id: "Q42", label: "Freshworks", description: "software company" }] },
    wbgetentities: { entities: { Q42: { claims: {
      P1128: [{ mainsnak: { datavalue: { value: { amount: "+5000" } } }, qualifiers: { P585: [{ datavalue: { value: { time: "+2023-01-01T00:00:00Z" } } }] } }],
      P571: [{ mainsnak: { datavalue: { value: { time: "+2010-01-01T00:00:00Z" } } } }],
      P856: [{ mainsnak: { datavalue: { value: "https://freshworks.com" } } }],
    } } } },
  });
  const out = await wikidataCompany("Freshworks");
  restore();
  check("reads headcount, founding year and site", out.employees === 5000 && out.founded === 2010 && out.website === "https://freshworks.com", out);
  check("dates the headcount", out.employeesAsOf === 2023, out);
  check("always cites the entity", out.source === "https://www.wikidata.org/wiki/Q42", out.source);
  check("an exact name match is confident", out.confident === true);
}
{
  // "Apollo" is a dozen companies; a loose match must be flagged, not hidden.
  const restore = stubFetch({
    wbsearchentities: { search: [{ id: "Q9", label: "Apollo Global Management", description: "asset manager" }] },
    wbgetentities: { entities: { Q9: { claims: {} } } },
  });
  const out = await wikidataCompany("Apollo");
  restore();
  check("a loose name match is flagged as unconfident", out.confident === false, out);
  check("missing claims are null, not guessed", out.employees === null && out.founded === null, out);
}

// --- job boards: never show another company's roles --------------------------
{
  const restore = stubFetch({
    "boards/freshworks/jobs": { jobs: [{ title: "Account Executive", location: { name: "Chennai" }, absolute_url: "u" }], meta: { total: 1 } },
    "boards/freshworks": { name: "Freshworks" },
  });
  const out = await greenhouseJobs("Freshworks");
  restore();
  check("reads a matching board", out.total === 1 && out.company === "Freshworks", out);
}
{
  const restore = stubFetch({ "boards/apollo": { name: "Apollo Endosurgery" } });
  const out = await greenhouseJobs("Apollo");
  restore();
  // The slug is guessed from the name, so a different owner must be discarded —
  // the same rule that stops a candidate being credited with a stranger's work.
  check("discards a board owned by a different company", out === null);
}

// --- craft matching ----------------------------------------------------------
{
  const board = { jobs: [
    { title: "Enterprise Account Executive", url: "1" },
    { title: "Senior Backend Engineer", url: "2" },
    { title: "Account Manager", url: "3" },
  ] };
  check("matches open roles to the craft", matchRoles(board, ["account executive"]).length === 1);
  check("ignores short noise titles", matchRoles(board, ["ae", "x"]).length === 0);
  check("no board means no matches", matchRoles(null, ["account executive"]).length === 0);
}

// --- signals -----------------------------------------------------------------
{
  const restore = stubFetch({ "hn.algolia.com": { hits: [
    { title: "Unrelated story about databases", objectID: "1", created_at: "2026-01-01" },
    { title: "Freshworks announces layoffs", objectID: "2", created_at: "2025-06-01", points: 40 },
    { title: "Freshworks ships a feature", objectID: "3", created_at: "2026-02-01", points: 5 },
  ] } });
  const out = await hackerNewsSignals("Freshworks");
  restore();
  check("keeps only stories naming the company", out.length === 2, out.map((s) => s.title));
  check("surfaces the notable signal first", out[0].notable === true && /layoffs/.test(out[0].title), out[0]);
  check("always links the discussion", out.every((s) => s.discussion.includes("news.ycombinator.com")));
}

// --- the combined call reports its own coverage ------------------------------
{
  const restore = stubFetch({
    wbsearchentities: new Error("wikidata down"),
    "hn.algolia.com": { hits: [] },
    "boards-api": 404,
    "api.lever.co": 404,
  });
  const out = await companyIntel("Freshworks", { titles: ["account executive"] });
  restore();
  check("one dead source does not sink the call", out !== null && out.company === "Freshworks");
  check("reports every source it checked", out.checked.length === 4, out.checked);
  check("names the one that failed", out.checked.find((c) => c.source === "wikidata").error === "wikidata down", out.checked);
  check("an empty name costs no request", (await companyIntel("")) === null);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
