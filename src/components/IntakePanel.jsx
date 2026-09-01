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
};
const fallbackQs = [{ id: "exp", label: "Experience", type: "single", opts: ["0–3y", "3–6y", "6–10y", "10y+"] }];

export default function IntakePanel({ family = "sales", rawString = "", callModel, onSpec, onRun }) {
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
  useEffect(() => { onSpec?.(spec); }, [spec]);

  return (
    <div className="panel">
      <div className="ph">Smart intake <span style={{ fontWeight: 500, color: "var(--ink-soft)", fontSize: 13 }}>— fortify the search</span></div>
      <div className="psub">A few answers lift relevance more than a longer string.</div>
      <div className="sensed"><span className="d" />Sensed a {FAMILIES[family]?.label || "Sales"} role</div>

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
        <button className="btn" onClick={() => onRun?.(spec, buildQuery(spec), gateSources(spec))}>Run search</button>
      </div>
    </div>
  );
}
