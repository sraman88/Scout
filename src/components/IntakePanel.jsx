import { useState, useMemo, useEffect, useCallback } from "react";
import { buildSpec, buildQuery, gateSources, resolveCompetitors, FAMILIES } from "../lib/relevanceEngine.js";

// IntakePanel — themed to scout-theme.css. Receives the sensed `family` from the
// page (which does the search/sensing) and produces the canonical spec.
// Question ids ARE the contract with engine buildSpec (stack/vertical/domain/
// signals/level). callModel is your grounded competitor caller (optional).
const QUESTIONS = {
  sales: [
    { id: "quota", label: "Quota-carrying?", type: "single", opts: ["Yes", "No", "Player-coach"] },
    { id: "segment", label: "Segment", type: "multi", opts: ["SMB", "Mid-market", "Enterprise", "Strategic"] },
    { id: "motion", label: "Motion", type: "single", opts: ["Hunter", "Farmer", "Hybrid"] },
    { id: "signals", label: "Must-have signals", type: "multi", opts: ["President’s Club", "Salesforce", "0→1"] },
  ],
  engineering: [
    { id: "level", label: "Level", type: "single", opts: ["Junior", "Mid", "Senior", "Staff+"] },
    { id: "stack", label: "Primary stack", type: "multi", opts: ["Go", "Java", "Python", "Node", "Rust"] },
    { id: "oss", label: "Open-source", type: "single", opts: ["Must-have", "Nice-to-have", "Ignore"] },
    { id: "domain", label: "Domain", type: "multi", opts: ["Payments", "Infra", "ML", "Frontend", "Security"] },
  ],
  hr: [
    { id: "level", label: "Level", type: "single", opts: ["Junior", "Mid", "Senior", "Staff+"] },
    { id: "domain", label: "HR specialism", type: "multi", opts: ["Talent acquisition", "HRBP", "Comp & benefits", "L&D", "Payroll", "Employee relations"] },
    { id: "vertical", label: "Industry background", type: "multi", opts: ["IT services", "Product / SaaS", "Manufacturing", "BFSI", "Startup"] },
    { id: "signals", label: "Must-have signals", type: "multi", opts: ["Campus hiring", "Leadership hiring", "ATS ownership", "HR analytics"] },
  ],
  marketing: [
    { id: "level", label: "Level", type: "single", opts: ["Junior", "Mid", "Senior", "Staff+"] },
    { id: "domain", label: "Focus", type: "multi", opts: ["Demand gen", "Product marketing", "Brand", "Content", "SEO", "Performance"] },
    { id: "vertical", label: "Industry", type: "multi", opts: ["B2B SaaS", "D2C", "Fintech", "E-commerce"] },
    { id: "signals", label: "Must-have signals", type: "multi", opts: ["Pipeline ownership", "Budget ownership", "0→1 launch"] },
  ],
  techsupport: [
    { id: "level", label: "Support tier", type: "single", opts: ["L1", "L2", "L3", "TAM"] },
    { id: "stack", label: "Tooling", type: "multi", opts: ["Zendesk", "Salesforce", "Jira", "SQL", "Linux"] },
    { id: "domain", label: "Product type", type: "multi", opts: ["SaaS", "Infra", "Payments", "Hardware"] },
    { id: "signals", label: "Must-have signals", type: "multi", opts: ["Enterprise accounts", "On-call", "Escalation ownership"] },
  ],
  finance: [
    { id: "level", label: "Level", type: "single", opts: ["Junior", "Mid", "Senior", "Staff+"] },
    { id: "domain", label: "Specialism", type: "multi", opts: ["FP&A", "Controllership", "Audit", "Treasury", "Taxation"] },
    { id: "vertical", label: "Industry", type: "multi", opts: ["Product / SaaS", "BFSI", "Manufacturing", "Consulting"] },
    { id: "signals", label: "Must-have signals", type: "multi", opts: ["CA / CPA", "Listed-company reporting", "ERP migration"] },
  ],
};
const fallbackQs = [{ id: "exp", label: "Experience", type: "single", opts: ["0–3y", "3–6y", "6–10y", "10y+"] }];

export default function IntakePanel({ family = "sales", rawString = "", callModel, onSpec, onRun, onFamilyChange, busy = false, sensing = false, derived = null }) {
  const [answers, setAnswers] = useState({});
  const [company, setCompany] = useState("");
  const [competitors, setCompetitors] = useState([]);
  const qs = QUESTIONS[family] || fallbackQs;

  const toggle = (q, o) => setAnswers((a) => {
    if (q.type === "multi") { const arr = a[q.id] || []; return { ...a, [q.id]: arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o] }; }
    return { ...a, [q.id]: a[q.id] === o ? undefined : o };
  });

  const findCompetitors = useCallback(async () => {
    if (!company.trim()) return;
    const { competitors: c } = await resolveCompetitors(company, { callModel, region: "India" });
    setCompetitors(c);
  }, [company, callModel]);

  const spec = useMemo(
    () => buildSpec({ rawString, family, company, answers, competitors }),
    [rawString, family, company, answers, competitors]
  );
  /* Deliberately keyed on `spec` alone — callers often pass an inline arrow as
     onSpec, and including it here would re-fire every render. */
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  useEffect(() => { onSpec?.(spec); }, [spec]);

  return (
    <div className="panel">
      <div className="ph">Smart intake <span style={{ fontWeight: 500, color: "var(--ink-soft)", fontSize: 13 }}>— fortify the search</span></div>
      <div className="psub">A few answers lift relevance more than a longer string.</div>
      <div className="sensedrow">
        <div className="sensed">
          <span className="d" />
          {sensing ? "Reading the role…" : `Sensed a ${FAMILIES[family]?.label || "Sales"} role`}
          {derived?.role_title && !sensing ? <em>· {derived.role_title}</em> : null}
        </div>
        <label className="famswap">
          Not right?
          <select value={family} onChange={(e) => onFamilyChange?.(e.target.value)}>
            {Object.entries(FAMILIES).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
          </select>
        </label>
      </div>

      <div className="qgrid">
        {qs.map((q) => (
          <div className="q" key={q.id}>
            <div className="lab">{q.label} <span className="pk">{q.type === "multi" ? "select any" : "pick one"}</span></div>
            <div className="chips">
              {q.opts.map((o) => {
                const on = q.type === "multi" ? (answers[q.id] || []).includes(o) : answers[q.id] === o;
                return <button key={o} className={"chip" + (on ? " on" : "")} onClick={() => toggle(q, o)}>{o}</button>;
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="intake-foot">
        <div className="cfield">
          <input placeholder="Hiring for… e.g. Salesforce (unlocks competitor sourcing)"
            value={company} onChange={(e) => setCompany(e.target.value)} onBlur={findCompetitors} />
        </div>
        <button className="btn" disabled={busy} onClick={() => onRun?.(spec, buildQuery(spec), gateSources(spec))}>
          {busy ? "Searching…" : "Run search"}
        </button>
      </div>
    </div>
  );
}
