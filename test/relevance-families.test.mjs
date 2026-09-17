import { senseFamily, buildSpec, prefilter, crossFamilyVeto, FAMILIES, EXPERIENCE_BANDS, INDIA_CITIES } from "../src/lib/relevanceEngine.js";

/* The three families added in v3.5 (Development, Consulting, Implementation)
   sit right next to families that already existed, so the risk they carry is
   regression: an engineering search that stops returning engineers, or a
   developer culled as "the wrong craft". These cover both directions, plus the
   experience range and the location picker the intake now feeds in. */

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};

// --- sensing still lands where it used to ------------------------------------
{
  const eng = senseFamily("Senior Software Engineer — backend, Go, Kubernetes, distributed systems");
  check("an engineering JD still senses engineering", eng.family === "engineering", eng);

  const hr = senseFamily("Talent acquisition partner, HRBP, campus hiring, ATS ownership");
  check("an HR JD still senses HR", hr.family === "hr", hr);

  const sales = senseFamily("Enterprise Account Executive, quota carrying, SMB to mid-market territory");
  check("a sales JD still senses sales", sales.family === "sales", sales);
}

// --- and the new families are reachable --------------------------------------
{
  const dev = senseFamily("Software Developer — full stack, Java and Node, product engineering");
  check("a developer JD senses development", dev.family === "development", dev);

  const con = senseFamily("SAP Functional Consultant — ERP advisory, client engagements");
  check("a consulting JD senses consulting", con.family === "consulting", con);

  const impl = senseFamily("Implementation Consultant — customer onboarding, rollout and migration");
  check("an implementation JD senses implementation", impl.family === "implementation", impl);

  check("all nine families are exported", Object.keys(FAMILIES).length === 9, Object.keys(FAMILIES));
}

// --- the compatibility guard: adjacent crafts must not cull each other -------
{
  check("a developer survives an engineering search", crossFamilyVeto("Software Developer", "engineering") === false);
  check("an engineer survives a development search", crossFamilyVeto("Backend Engineer", "development") === false);
  check("an implementation consultant survives a consulting search", crossFamilyVeto("Implementation Consultant", "consulting") === false);

  // ...while the guard it was bolted onto still does its job.
  check("a software engineer is still culled from an HR search", crossFamilyVeto("Machine Learning Engineer", "hr") === true);
  check("a recruiter is still culled from an engineering search", crossFamilyVeto("Talent Acquisition Specialist", "engineering") === true);
}

{
  const eng = buildSpec({ family: "engineering", answers: {} });
  check("the engineering prefilter keeps a developer", prefilter({ title: "Senior Software Developer", skills: ["java"] }, eng).keep);
}

// --- experience: a stated range demotes, an unstated one never judges --------
{
  const spec = buildSpec({ family: "engineering", answers: { exp: "6-10y" } });
  check("a preset band becomes a range", spec.experience?.min === 6 && spec.experience?.max === 10, spec.experience);

  const inRange = prefilter({ title: "Software Engineer", experienceYears: 8 }, spec);
  const outOfRange = prefilter({ title: "Software Engineer", experienceYears: 1 }, spec);
  check("in-range experience is noted", inRange.reasons.includes("exp fit"), inRange.reasons);
  check("out-of-range experience demotes rather than culls", outOfRange.prescore < inRange.prescore && outOfRange.keep === inRange.keep, { inRange, outOfRange });

  const unknown = prefilter({ title: "Software Engineer" }, spec);
  check("a profile with no years stated is not penalised", unknown.prescore === inRange.prescore, { unknown, inRange });
}

{
  const manual = buildSpec({ family: "engineering", answers: { exp: "0-3y", expMin: "4", expMax: "7" } });
  check("manual entry overrides the preset band", manual.experience.min === 4 && manual.experience.max === 7, manual.experience);

  const openEnded = buildSpec({ family: "engineering", answers: { expMin: "12" } });
  check("a min alone means 'at least'", openEnded.experience.min === 12 && openEnded.experience.max === 99, openEnded.experience);

  const none = buildSpec({ family: "engineering", answers: {} });
  check("no answer means no range", none.experience === null, none.experience);
  check("every band parses", Object.values(EXPERIENCE_BANDS).every(([a, b]) => a < b));
}

// --- location: picked cities win, the defaults are only a fallback -----------
{
  const picked = buildSpec({ family: "sales", answers: { locations: ["Pune", "Kochi"] } });
  check("picked cities become the spec's locations", picked.locations.join(",") === "Pune,Kochi", picked.locations);

  const unpicked = buildSpec({ family: "sales", answers: {} });
  check("picking nothing falls back to all-India defaults", unpicked.locations.length > 2 && unpicked.locations[0] === "India", unpicked.locations);
  check("the picker offers cities", INDIA_CITIES.includes("Bengaluru") && INDIA_CITIES.includes("Remote (India)"));
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
