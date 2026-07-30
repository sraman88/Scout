import { useState } from "react";
import { T } from "../theme.js";
import { Card, FieldLabel, TextArea, TextInput, MicroBtn, PrimaryBtn, ErrBox, Empty, LoadingPulse, Row, Pills, Divider, CopyBtn } from "../components/ui.jsx";

export function JDIntelTab({ jdMode, setJdMode, jd, setJd, jdUrl, setJdUrl, jdLoading, jdResult, jdError, analyseJD, setTab, updateCtxField, updateJdField }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Card title="JD INPUT" accent={T.cyan}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <ModeChip active={jdMode === "paste"} onClick={() => setJdMode("paste")} label="✎ PASTE JD" />
          <ModeChip active={jdMode === "url"} onClick={() => setJdMode("url")} label="🔗 FROM URL" />
        </div>
        {jdMode === "paste" ? (
          <>
            <FieldLabel>Paste the JD text</FieldLabel>
            <TextArea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste full JD..." rows={12} />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <MicroBtn onClick={() => setJd("")} color={T.text3}>CLEAR</MicroBtn>
              <MicroBtn onClick={async () => { try { setJd(await navigator.clipboard.readText()); } catch { /* clipboard denied */ } }} color={T.purple}>📋 PASTE FROM CLIPBOARD</MicroBtn>
            </div>
          </>
        ) : (
          <>
            <FieldLabel>Careers page or LinkedIn job URL</FieldLabel>
            <TextInput value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} placeholder="https://careers.company.com/jobs/123" />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <MicroBtn onClick={() => setJdUrl("")} color={T.text3}>CLEAR</MicroBtn>
              <MicroBtn onClick={async () => { try { setJdUrl(await navigator.clipboard.readText()); } catch { /* clipboard denied */ } }} color={T.purple}>📋 PASTE FROM CLIPBOARD</MicroBtn>
            </div>
            <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(255,184,0,0.06)", border: `1px solid rgba(255,184,0,0.2)`, borderRadius: 8, color: T.amber, fontSize: 12, fontFamily: T.mono, lineHeight: 1.5 }}>
              <strong>NOTE:</strong> SCOUT tries 3 CORS proxies in sequence. LinkedIn job pages usually block fetching — copy JD text and use Paste mode if URL fails. Works well on: Lever, Greenhouse, Workday, AshbyHQ, company careers pages.
            </div>
          </>
        )}
        <PrimaryBtn onClick={analyseJD} disabled={jdLoading} style={{ marginTop: 14 }}>{jdLoading ? "ANALYSING..." : "→ ANALYSE JD"}</PrimaryBtn>
        {jdError && <ErrBox>{jdError}</ErrBox>}
      </Card>

      <Card title="STRUCTURED INTEL (click any to edit)" accent={T.purple}>
        {!jdResult && !jdLoading && <Empty label="Run analysis to see structured intel" />}
        {jdLoading && <LoadingPulse />}
        {jdResult && (
          <div>
            <Row>
              <EditableStat label="ROLE" value={jdResult.role_title} onSave={(v) => { updateJdField("role_title", v); updateCtxField("role", v); }} />
              <EditableStat label="LEVEL" value={jdResult.seniority} onSave={(v) => { updateJdField("seniority", v); updateCtxField("seniority", v); }} />
              <EditableStat label="EXP YRS" value={jdResult.experience_years} onSave={(v) => { updateJdField("experience_years", v); updateCtxField("experience_years", v); }} />
            </Row>
            <Row>
              <EditableStat label="LOCATION" value={jdResult.location} onSave={(v) => { updateJdField("location", v); updateCtxField("location", v); }} />
              <EditableStat label="LANGUAGE" value={jdResult.primary_language} onSave={(v) => { updateJdField("primary_language", v); updateCtxField("language", v); }} />
            </Row>
            <FieldLabel style={{ marginTop: 14 }}>MUST HAVE</FieldLabel>
            <Pills items={jdResult.must_have || []} color={T.cyan} />
            <FieldLabel style={{ marginTop: 12 }}>NICE TO HAVE</FieldLabel>
            <Pills items={jdResult.nice_to_have || []} color={T.amber} />
            {jdResult.pool_note && <div style={{ marginTop: 14, padding: 12, background: T.bg3, borderRadius: 8, border: `1px solid ${T.cyanDim}`, fontSize: 14, color: T.text2 }}><span style={{ color: T.cyan, fontWeight: 600 }}>POOL: </span>{jdResult.pool_note}</div>}
            <Divider label="QUICK ACTIONS" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <MicroBtn onClick={() => setTab("profiles")} color={T.cyan}>→ FIND PROFILES</MicroBtn>
              <MicroBtn onClick={() => setTab("email")} color={T.green}>→ EMAIL + SOCIAL</MicroBtn>
            </div>
          </div>
        )}
      </Card>

      {jdResult?.search_strings && Object.keys(jdResult.search_strings).length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="BOOLEAN + X-RAY STRINGS (all variants)" accent={T.green}>
            <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 10, marginBottom: 12, letterSpacing: 1.5 }}>Copy any string and paste into LinkedIn, Google, GitHub search, or your ATS.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 10 }}>
              {Object.entries(jdResult.search_strings).map(([k, v]) => {
                const value = typeof v === "string" ? v : String(v || "");
                return (
                  <div key={k} style={{ padding: 12, background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
                      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.green, letterSpacing: 1.5, fontWeight: 700 }}>{k.toUpperCase().replace(/_/g, " ")}</span>
                      <CopyBtn text={value} />
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 12, color: T.text, wordBreak: "break-word", lineHeight: 1.5 }}>{value || <span style={{ color: T.red }}>(empty — LLM returned no value)</span>}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {jdResult?.synonyms && Object.keys(jdResult.synonyms).length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="SYNONYM MAP" accent={T.amber}>
            {Object.entries(jdResult.synonyms).map(([skill, syns]) => {
              const list = Array.isArray(syns) ? syns : typeof syns === "string" ? [syns] : Object.keys(syns || {});
              return (
                <div key={skill} style={{ marginBottom: 8 }}>
                  <span style={{ color: T.cyan, fontFamily: T.mono, fontWeight: 600, marginRight: 8 }}>{skill}:</span>
                  <span style={{ color: T.text2, fontSize: 14 }}>{list.join(", ")}</span>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}

function ModeChip({ active, onClick, label }) {
  return <button onClick={onClick} style={{ padding: "8px 14px", background: active ? T.cyan : "transparent", color: active ? T.bg : T.text2, border: `1px solid ${active ? T.cyan : T.cyanDim}`, borderRadius: 6, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>{label}</button>;
}

function EditableStat({ label, value, onSave }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(value || "");
  return (
    <div style={{ padding: "10px 12px", background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 7, minHeight: 64, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.text3, letterSpacing: 2 }}>{label}</div>
      {edit ? (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft); setEdit(false); } if (e.key === "Escape") setEdit(false); }} onBlur={() => { onSave(draft); setEdit(false); }} style={{ background: "transparent", color: T.cyan, border: `1px solid ${T.cyan}`, borderRadius: 4, padding: "4px 6px", fontFamily: T.display, fontSize: 16, fontWeight: 700, marginTop: 4 }} />
      ) : (
        <div onClick={() => { setDraft(value || ""); setEdit(true); }} style={{ fontFamily: T.display, fontSize: 18, fontWeight: 700, color: T.cyan, marginTop: 4, cursor: "pointer" }} title="Click to edit">{value || "—"} <span style={{ color: T.text4, fontSize: 11 }}>✎</span></div>
      )}
    </div>
  );
}
