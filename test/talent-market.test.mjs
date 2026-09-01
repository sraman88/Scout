import { resolveTalentPeers, resolveSalaryBands, salaryExtent } from "../src/lib/talentMarket.js";

/* The grounded model returns prose-wrapped JSON of varying quality. These
   cover what actually goes wrong: the hiring company appearing in its own peer
   list, salary figures arriving as strings or ranges, and a model that admits
   it found nothing (which must stay empty rather than be filled with guesses). */

const model = (payload, sources = [{ title: "levels.fyi", uri: "https://levels.fyi/x" }]) =>
  async () => ({ text: typeof payload === "string" ? payload : JSON.stringify(payload), sources });

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};

// --- peers -------------------------------------------------------------------
{
  const out = await resolveTalentPeers(
    { role: "Employee Relations Manager", family: "HR", location: "India", company: "OpenText" },
    { callModel: model({
      peers: [
        { company: "OpenText", why: "same company", equivalentTitle: "ER Manager", hiring: true },
        { company: "SAP", why: "comparable ER function", equivalentTitle: "People Relations Lead", hiring: true },
        { company: "Infosys", why: "large IR practice", equivalentTitle: "IR Manager", hiring: false },
        { company: "", why: "blank", equivalentTitle: "x" },
      ],
      pools: ["Big-4 HR advisory practices"],
    }) }
  );
  check("drops the hiring company from its own peer list", !out.peers.some((p) => p.company === "OpenText"), out.peers.map((p) => p.company));
  check("keeps real peers and their equivalent titles", out.peers.length === 2 && out.peers[0].equivalentTitle === "People Relations Lead", out.peers);
  check("carries the hiring flag", out.peers[0].hiring === true && out.peers[1].hiring === false);
  check("passes citations through", out.sources[0].uri === "https://levels.fyi/x");
  check("keeps non-obvious pools", out.pools[0].startsWith("Big-4"));
}

// --- salary ------------------------------------------------------------------
{
  const out = await resolveSalaryBands(
    { role: "Employee Relations Manager", location: "India" },
    { callModel: model(`Here is what I found:\n\`\`\`json\n${JSON.stringify({
      currency: "INR", unit: "LPA", asOf: "2026",
      bands: [
        { level: "Junior", title: "ER Executive", years: "1-3", min: 6, max: 11, median: 8 },
        { level: "Mid", title: "ER Manager", years: "4-7", min: 18, max: 28, median: 22 },
        { level: "Bad", title: "no numbers", min: "eighteen", max: null },
      ],
      topPayers: [{ company: "Google", range: "35-50 LPA" }, { company: "", range: "" }],
      caveat: "Sample sizes are small outside metros.",
    })}\n\`\`\``) }
  );
  check("parses JSON out of prose and code fences", out.bands.length === 2, out.bands);
  check("drops bands with unusable figures", !out.bands.some((b) => b.level === "Bad"));
  check("keeps numeric min/max/median", out.bands[1].min === 18 && out.bands[1].max === 28 && out.bands[1].median === 22);
  check("keeps unit and period", out.unit === "LPA" && out.asOf === "2026");
  check("drops empty top payers", out.topPayers.length === 1 && out.topPayers[0].company === "Google");
}

// A model that finds nothing must stay empty rather than invent figures.
{
  const out = await resolveSalaryBands({ role: "Obscure role", location: "Antarctica" }, { callModel: model({ currency: "USD", bands: [] }) });
  check("reports no data rather than guessing", out.bands.length === 0);
}

// --- chart scaling -----------------------------------------------------------
{
  const e = salaryExtent([{ min: 6, max: 11 }, { min: 18, max: 28 }]);
  check("computes the extent for bar scaling", e.lo === 6 && e.hi === 28, e);
  check("returns null when a single band cannot be scaled", salaryExtent([{ min: 5, max: 5 }]) === null);
}

// --- no model configured -----------------------------------------------------
{
  let err = null;
  try { await resolveTalentPeers({ role: "x" }, { callModel: null }); } catch (e) { err = e; }
  check("fails clearly when no grounded model is configured", /Gemini key/.test(err?.message || ""), err?.message);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
