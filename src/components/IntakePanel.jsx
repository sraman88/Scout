import { useState, useEffect, useMemo, useCallback } from "react";
import { T } from "../theme.js";
import { senseFamily, buildSpec, buildQuery, gateSources, resolveCompetitors, FAMILIES } from "../lib/relevanceEngine.js";
import { Card, FieldLabel, TextInput, PrimaryBtn, MicroBtn, Pill } from "./ui.jsx";
import { chip } from "./styleHelpers.js";

// IntakePanel — the real intake, importing the engine instead of duplicating it.
// Emits the canonical spec so a results tab can run buildQuery -> fetch ->
// prefilter -> scoreBatch off it.
//   <IntakePanel callModel={getCompetitorModel()} onSpec={setSpec} onQuery={setQuery} />
//
// Question ids below ARE the contract with engine buildSpec(): it reads
// answers.stack / vertical / domain / signals / level. Keep them aligned.
const QUESTIONS = {
  sales: [
    { id: "quota", label: "Quota-carrying?", req: true, type: "single", opts: ["Yes", "No", "Player-coach"] },
    { id: "motion", label: "Sales motion", type: "single", opts: ["Hunter (new logo)", "Farmer (expansion)", "Hybrid / full-cycle"] },
    { id: "segment", label: "Segment", type: "multi", opts: ["SMB", "Mid-market", "Enterprise", "Strategic"] },
    { id: "exp", label: "Experience", type: "single", opts: ["0–3y", "3–6y", "6–10y", "10y+"] },
    { id: "vertical", label: "Vertical", type: "multi", opts: ["SaaS", "Fintech", "Cybersecurity", "Martech", "Infra"] },
    { id: "signals", label: "Must-have signals", type: "multi", opts: ["President's Club", "Salesforce", "Named-account exp", "0→1 startup"] },
  ],
  engineering: [
    { id: "level", label: "Level", req: true, type: "single", opts: ["Junior", "Mid", "Senior", "Staff+"] },
    { id: "stack", label: "Primary stack", type: "multi", opts: ["Go", "Java", "Python", "Node", "Rust"] },
    { id: "oss", label: "Open-source signal", type: "single", opts: ["Must-have", "Nice-to-have", "Ignore"] },
    { id: "domain", label: "Domain", type: "multi", opts: ["Payments", "Infra", "ML", "Frontend", "Security"] },
    { id: "exp", label: "Experience", type: "single", opts: ["0–3y", "3–6y", "6–10y", "10y+"] },
  ],
  marketing: [{ id: "exp", label: "Experience", type: "single", opts: ["0–3y", "3–6y", "6–10y", "10y+"] }],
  hr: [{ id: "exp", label: "Experience", type: "single", opts: ["0–3y", "3–6y", "6–10y", "10y+"] }],
  techsupport: [{ id: "exp", label: "Experience", type: "single", opts: ["0–3y", "3–6y", "6–10y", "10y+"] }],
  finance: [{ id: "exp", label: "Experience", type: "single", opts: ["0–3y", "3–6y", "6–10y", "10y+"] }],
};

export default function IntakePanel({ callModel, onSpec, onQuery }) {
  const [raw, setRaw] = useState("");
  const [family, setFamily] = useState(null);
  const [company, setCompany] = useState("");
  const [answers, setAnswers] = useState({});
  const [competitors, setCompetitors] = useState([]);
  const [resolving, setResolving] = useState(false);

  const start = () => {
    const r = senseFamily(raw);
    setFamily(r.family || "sales");
    setAnswers({});
    setCompetitors([]);
  };

  const toggle = (q) => (o) => setAnswers((a) => {
    if (q.type === "multi") {
      const arr = a[q.id] || [];
      return { ...a, [q.id]: arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o] };
    }
    return { ...a, [q.id]: a[q.id] === o ? undefined : o };
  });

  const findCompetitors = useCallback(async () => {
    if (!company.trim()) return;
    setResolving(true);
    try {
      const { competitors: c } = await resolveCompetitors(company, { callModel, region: "India" });
      setCompetitors(c);
    } finally { setResolving(false); }
  }, [company, callModel]);

  // Everything below derives from the engine — one source of truth.
  const spec = useMemo(
    () => (family ? buildSpec({ rawString: raw, family, company, answers, competitors }) : null),
    [family, raw, company, answers, competitors]
  );
  const query = useMemo(() => (spec ? buildQuery(spec) : null), [spec]);
  const sources = useMemo(() => (spec ? gateSources(spec) : []), [spec]);

  // Push spec/query up whenever they change.
  useEffect(() => { if (spec) onSpec?.(spec); }, [spec, onSpec]);
  useEffect(() => { if (query) onQuery?.(query); }, [query, onQuery]);

  if (!family) {
    return (
      <Card title="SMART INTAKE" accent={T.cyan}>
        <FieldLabel>Describe who you're hiring</FieldLabel>
        <div style={{ display: "flex", gap: 8 }}>
          <TextInput value={raw} onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder={'e.g. ("account executive" OR "sales manager") AND SaaS AND (Mumbai OR Pune)'} />
          <PrimaryBtn onClick={start} style={{ width: "auto", padding: "10px 20px" }}>SENSE</PrimaryBtn>
        </div>
        <div style={{ marginTop: 10, color: T.text3, fontFamily: T.mono, fontSize: 12, fontStyle: "italic" }}>Enter a search to begin.</div>
      </Card>
    );
  }

  return (
    <Card title="SMART INTAKE" accent={T.cyan}>
      <div style={{ display: "flex", gap: 8 }}>
        <TextInput value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} />
        <PrimaryBtn onClick={start} style={{ width: "auto", padding: "10px 20px" }}>RE-SENSE</PrimaryBtn>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: `${T.green}11`, border: `1px solid ${T.green}44`, marginTop: 12, marginBottom: 16, fontFamily: T.mono, fontSize: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
        <span style={{ color: T.text2 }}>Sensed <b style={{ color: T.text }}>{FAMILIES[family].label}</b></span>
        <select value={family} onChange={(e) => { setFamily(e.target.value); setAnswers({}); }} style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 11, background: T.fieldBg, color: T.fieldText, border: `1px solid ${T.cyanDim}`, borderRadius: 6, padding: "4px 8px" }}>
          {Object.entries(FAMILIES).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>HIRING FOR <span style={{ color: T.text4, textTransform: "none" }}>(unlocks competitor sourcing)</span></FieldLabel>
          <TextInput value={company} placeholder="e.g. Salesforce" onChange={(e) => setCompany(e.target.value)} onBlur={findCompetitors} />
        </div>
        <MicroBtn onClick={findCompetitors} color={T.amber} disabled={resolving || !company.trim()}>{resolving ? "…" : "↻ COMPETITORS"}</MicroBtn>
      </div>
      {competitors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {competitors.map((c) => <Pill key={c} color={T.amber}>{c}</Pill>)}
        </div>
      )}

      {(QUESTIONS[family] || []).map((q) => {
        const cur = answers[q.id];
        return (
          <div key={q.id} style={{ marginBottom: 16 }}>
            <FieldLabel>{q.label} <span style={{ color: T.text4, textTransform: "none" }}>{q.type === "multi" ? "select any" : "pick one"}</span>{q.req && <span style={{ color: T.amber, textTransform: "none" }}> · recommended</span>}</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {q.opts.map((o) => {
                const on = q.type === "multi" ? (cur || []).includes(o) : cur === o;
                return <button key={o} onClick={() => toggle(q)(o)} style={chip(on ? T.cyan : T.text3)}>{o}</button>;
              })}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 18 }}>
        <FieldLabel>REFINED SEARCH</FieldLabel>
        <div style={{ fontFamily: T.mono, fontSize: 12, lineHeight: 1.6, background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 8, padding: "12px 14px", wordBreak: "break-word", color: T.text2 }}>{query?.boolean}</div>
      </div>
      <div style={{ marginTop: 18 }}>
        <FieldLabel>WHERE TO LOOK</FieldLabel>
        {sources.map((s) => (
          <div key={s.id} style={{ border: `1px solid ${T.cyanDim}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, fontSize: 13 }}>
            <b style={{ color: T.text }}>{s.label}</b><span style={{ color: T.text3, marginLeft: 8 }}>{s.why}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
