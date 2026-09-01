import { useState } from "react";
import "./scout-theme.css";
import { senseFamily } from "../lib/relevanceEngine.js";
import IntakePanel from "./IntakePanel";
import CandidateCard from "./CandidateCard";
import CompanyMap from "./CompanyMap";

// ScoutPage — the single-page shell. Mounts search -> smart intake -> profiles
// -> company map, all on one screen. Sample data below renders it identical to
// the mockup out of the box; swap the marked blocks for your real data.
//   search (kw/jd/paste) -> senseFamily -> IntakePanel -> onRun(spec,query)
//   -> your Apify fetch + prefilter + scoreBatch -> setResults(CandidateCard[])

const HINTS = {
  kw: "Boolean supported — strings, parentheses, AND / OR / NOT.",
  jd: "Works on Lever, Greenhouse, Workday, Ashby, careers pages. LinkedIn job links → use Paste.",
  paste: "Paste raw JD text — Scout parses it into a role spec and pre-fills intake.",
};

// --- sample data (replace with real results / map) ---------------------------
const SAMPLE_RESULTS = [
  { name: "Vaishnavi Katkar", title: "Enterprise Sales Manager", org: "CloudCo", location: "Mumbai, India",
    match: { score: 96, reason: "Quota-carrying enterprise seller, in-region, 3 of 4 target skills.", matched: ["Enterprise", "SaaS", "Quota"], missed: ["Cyber"] },
    sources: [{ id: "linkedin", label: "LinkedIn" }] },
  { name: "Rahul Deshpande", title: "Regional Sales Manager", org: "PayU", location: "Pune, India",
    match: { score: 92, reason: "Hunter profile with named-account wins; President’s Club 2024 on record.", matched: ["Hunter", "President’s Club", "Mid-market"], missed: [] },
    sources: [{ id: "linkedin", label: "LinkedIn" }, { id: "cv", label: "CV" }] },
  { name: "Ananya Rao", title: "Account Executive", org: "Freshworks", location: "Bengaluru, India",
    match: { score: 89, reason: "Strong SaaS AE; enterprise motion emerging, no President’s Club signal yet.", matched: ["SaaS", "Enterprise"], missed: ["President’s Club"] },
    sources: [{ id: "linkedin", label: "LinkedIn" }] },
];
const SAMPLE_TREE = {
  role: "VP Sales, India", meta: "1 · leadership", head: true,
  children: [
    { role: "Director — West", meta: "Mumbai", children: [{ role: "RSM", meta: "6 AEs" }, { role: "RSM", meta: "5 AEs" }] },
    { role: "Director — South", meta: "Bengaluru", children: [{ role: "RSM", meta: "7 AEs" }, { role: "RSM", meta: "4 AEs" }] },
  ],
};
const SAMPLE_LEVELS = [
  { label: "VP / Head", value: "1–2" }, { label: "Director", value: "4" },
  { label: "RSM / Manager", value: "~12" }, { label: "AE", band: "₹18–34L" }, { label: "BDR / SDR", band: "₹8–15L" },
];

export default function ScoutPage() {
  const [mode, setMode] = useState("kw");
  const [raw, setRaw] = useState("");
  const [family, setFamily] = useState(null);
  const [results, setResults] = useState(SAMPLE_RESULTS); // replace via onRun
  const [count, setCount] = useState(18);

  const run = () => setFamily(senseFamily(raw).family || "sales");

  // Wire your pipeline here: buildQuery -> Apify -> prefilter -> scoreBatch.
  const onRun = async (spec /*, query, sources */) => {
    // const scored = await runYourPipeline(query);
    // setResults(scored); setCount(scored.length);
  };

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">S<span>C</span>OUT</div>
        <div className="tag">Sourcing intelligence · one screen</div>
      </div>

      <div className="steps">
        <div className={"stp" + (raw ? " on" : "")}><span className="n">1</span>Search</div><span className="arw">→</span>
        <div className={"stp" + (family ? " on" : "")}><span className="n">2</span>Smart intake</div><span className="arw">→</span>
        <div className={"stp" + (results.length ? " on" : "")}><span className="n">3</span>Profiles</div>
      </div>

      {/* STEP 1 — unified search */}
      <div className="panel">
        <div className="modes">
          {["kw", "jd", "paste"].map((mm) => (
            <button key={mm} className={mode === mm ? "on" : ""} onClick={() => setMode(mm)}>
              {mm === "kw" ? "Keyword" : mm === "jd" ? "JD link" : "Paste JD"}
            </button>
          ))}
        </div>
        <div className="searchrow">
          {mode === "paste"
            ? <textarea rows={3} placeholder="Paste the job description here…" value={raw} onChange={(e) => setRaw(e.target.value)} />
            : <input placeholder={mode === "kw" ? '("enterprise account executive" OR "sales manager") AND SaaS AND (Mumbai OR Pune)' : "https://boards.greenhouse.io/acme/jobs/12345"}
                value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />}
          <button className="btn" onClick={run}>{mode === "kw" ? "Find" : mode === "jd" ? "Fetch JD" : "Parse"}</button>
        </div>
        <div className="hintline">{HINTS[mode]}</div>
      </div>

      {/* STEP 2 — smart intake */}
      {family && <IntakePanel family={family} rawString={raw} onRun={onRun} />}

      {/* STEP 3 — profiles */}
      {results.length > 0 && (
        <>
          <div className="rescount"><b>{count}</b> profiles · sorted by match</div>
          <div className="grid">{results.map((p, i) => <CandidateCard key={i} profile={p} />)}</div>
        </>
      )}

      {/* Company map */}
      <CompanyMap title="Company mapping — Salesforce, India Sales" tree={SAMPLE_TREE} levels={SAMPLE_LEVELS} />
    </div>
  );
}
