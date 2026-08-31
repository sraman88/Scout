import React, { useState, useMemo, useCallback } from "react";
import { senseFamily, buildSpec, buildQuery, gateSources, resolveCompetitors, FAMILIES } from "../lib/relevanceEngine.js";

// IntakePanel — the real intake, importing the engine instead of duplicating it.
// Emits the canonical spec so the profiles tab can run buildQuery -> fetch ->
// prefilter -> scoreBatch off it.
//   <IntakePanel callModel={geminiGrounded(settings.geminiKey)} onSpec={setSpec} />
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
  React.useEffect(() => { if (spec) onSpec?.(spec); }, [spec, onSpec]);
  React.useEffect(() => { if (query) onQuery?.(query); }, [query, onQuery]);

  if (!family) {
    return (
      <div style={S.wrap}>
        <div style={S.bar}>
          <input style={S.input} value={raw} onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder={'e.g. ("account executive" OR "sales manager") AND SaaS AND (Mumbai OR Pune)'} />
          <button style={S.go} onClick={start}>Sense</button>
        </div>
        <div style={S.empty}>Enter a search to begin.</div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.bar}>
        <input style={S.input} value={raw} onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()} />
        <button style={S.go} onClick={start}>Re-sense</button>
      </div>

      <div style={S.detected}>
        <span style={S.dot} />Sensed <b>&nbsp;{FAMILIES[family].label}</b>.
        <select style={S.switch} value={family} onChange={(e) => { setFamily(e.target.value); setAnswers({}); }}>
          {Object.entries(FAMILIES).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
        </select>
      </div>

      <div style={S.companyRow}>
        <div style={{ flex: 1 }}>
          <div style={S.qlab}>Hiring for <span style={S.hint}>unlocks competitor sourcing</span></div>
          <input style={S.cinput} value={company} placeholder="e.g. Salesforce"
            onChange={(e) => setCompany(e.target.value)} onBlur={findCompetitors} />
        </div>
        <button style={S.findBtn} onClick={findCompetitors} disabled={resolving || !company.trim()}>
          {resolving ? "…" : "↻ competitors"}
        </button>
      </div>
      {competitors.length > 0 && (
        <div style={S.compRow}>{competitors.map((c) => <span key={c} style={S.comp}>{c}</span>)}</div>
      )}

      {(QUESTIONS[family] || []).map((q) => {
        const cur = answers[q.id];
        return (
          <div key={q.id} style={S.q}>
            <div style={S.qlab}>{q.label} <span style={S.pick}>{q.type === "multi" ? "select any" : "pick one"}</span>{q.req && <span style={S.req}>recommended</span>}</div>
            <div style={S.chips}>
              {q.opts.map((o) => {
                const on = q.type === "multi" ? (cur || []).includes(o) : cur === o;
                return <button key={o} onClick={() => toggle(q)(o)} style={{ ...S.chip, ...(on ? S.chipOn : {}) }}>{o}</button>;
              })}
            </div>
          </div>
        );
      })}

      <div style={S.out}>
        <div style={S.oh}>Refined search</div>
        <div style={S.boolean}>{query?.boolean}</div>
      </div>
      <div style={S.out}>
        <div style={S.oh}>Where to look</div>
        {sources.map((s) => (
          <div key={s.id} style={S.chan}>
            <b>{s.label}</b><span style={S.why}>{s.why}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const S = {
  wrap: { fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: "#000", maxWidth: 560 },
  bar: { display: "flex", gap: 8, marginBottom: 14 },
  input: { flex: 1, fontSize: 14, padding: "11px 13px", border: "1px solid #E4E2DA", borderRadius: 10 },
  go: { fontWeight: 600, padding: "0 18px", border: "none", borderRadius: 10, background: "#000", color: "#fff", cursor: "pointer" },
  empty: { fontSize: 13, color: "#8A867C", fontStyle: "italic" },
  detected: { display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 8, background: "#EAF4EF", fontSize: 13.5, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "#0B6E4F" },
  switch: { marginLeft: "auto", fontSize: 12, border: "1px solid #E4E2DA", borderRadius: 6, padding: "3px 6px" },
  companyRow: { display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 8 },
  qlab: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  hint: { fontWeight: 400, fontSize: 11, color: "#8A867C", marginLeft: 6 },
  pick: { fontWeight: 500, fontSize: 11, color: "#8A867C", marginLeft: 6 },
  req: { color: "#9A6B00", fontWeight: 500, fontSize: 11.5, marginLeft: 6 },
  cinput: { width: "100%", fontSize: 14, padding: "9px 11px", border: "1px solid #E4E2DA", borderRadius: 8 },
  findBtn: { fontSize: 12.5, fontWeight: 600, padding: "9px 12px", border: "1px solid #E4E2DA", borderRadius: 8, background: "#fff", cursor: "pointer", whiteSpace: "nowrap" },
  compRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  comp: { fontSize: 11.5, padding: "2px 9px", borderRadius: 999, background: "#EAF4EF", color: "#0B6E4F", fontWeight: 500 },
  q: { marginBottom: 16 },
  chips: { display: "flex", flexWrap: "wrap", gap: 7 },
  chip: { fontFamily: "inherit", fontSize: 12.5, padding: "6px 12px", border: "1px solid #E4E2DA", borderRadius: 999, background: "#fff", cursor: "pointer", color: "#000" },
  chipOn: { background: "#000", color: "#fff", borderColor: "#000" },
  out: { marginTop: 18 },
  oh: { fontSize: 12, fontWeight: 700, color: "#8A867C", marginBottom: 8 },
  boolean: { fontSize: 13, lineHeight: 1.6, background: "#F6F5F0", border: "1px solid #E4E2DA", borderRadius: 8, padding: "12px 14px", wordBreak: "break-word" },
  chan: { border: "1px solid #E4E2DA", borderRadius: 8, padding: "10px 12px", marginBottom: 8, fontSize: 13 },
  why: { color: "#55524B", marginLeft: 8 },
};
