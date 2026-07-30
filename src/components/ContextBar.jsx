import { useState } from "react";
import { T } from "../theme.js";
import { miniBtn } from "./styleHelpers.js";

export function ContextBar({ ctx, picked, resetCtx, clearPicked, updateCtxField }) {
  const hasCtx = ctx.role || ctx.must_have.length;
  if (!hasCtx && !picked) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "12px 14px", background: `linear-gradient(90deg, rgba(0,229,255,0.06), rgba(168,85,247,0.04))`, border: `1px solid ${T.cyanDim}`, borderRadius: 10, marginBottom: 18, fontFamily: T.mono, fontSize: 11 }}>
      <span style={{ color: T.cyan, fontWeight: 700, letterSpacing: 2 }}>● CONTEXT (CLICK ANY TO EDIT)</span>
      {hasCtx && (
        <>
          <EditableTag label="ROLE" value={ctx.role} onSave={(v) => updateCtxField("role", v)} />
          <EditableTag label="LVL" value={ctx.seniority} onSave={(v) => updateCtxField("seniority", v)} />
          <EditableTag label="EXP" value={ctx.experience_years} onSave={(v) => updateCtxField("experience_years", v)} suffix="y" />
          <EditableTag label="LOC" value={ctx.location} onSave={(v) => updateCtxField("location", v)} />
          <EditableTag label="LANG" value={ctx.language} onSave={(v) => updateCtxField("language", v)} />
          <EditableSkills label="SKILLS" items={ctx.must_have} onSave={(arr) => updateCtxField("must_have", arr)} color={T.green} />
        </>
      )}
      {picked && <Tag label="CANDIDATE" value={picked.username || picked.name} color={T.purple} />}
      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
        {hasCtx && <button onClick={resetCtx} style={miniBtn(T.red)}>CLEAR JD</button>}
        {picked && <button onClick={clearPicked} style={miniBtn(T.amber)}>CLEAR CANDIDATE</button>}
      </div>
    </div>
  );
}

export function EditableTag({ label, value, onSave, color = T.cyan, suffix = "" }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(value || "");
  if (edit) {
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft); setEdit(false); } if (e.key === "Escape") setEdit(false); }} onBlur={() => { onSave(draft); setEdit(false); }} style={{ background: T.bg, color, border: `1px solid ${color}`, borderRadius: 5, padding: "3px 7px", fontFamily: T.mono, fontSize: 11, width: 140 }} />
      </span>
    );
  }
  return (
    <button onClick={() => { setDraft(value || ""); setEdit(true); }} title="Click to edit" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", background: T.bg, border: `1px solid ${color}33`, borderRadius: 6, cursor: "pointer" }}>
      <span style={{ color: T.text3, fontSize: 9, letterSpacing: 1.5 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontFamily: T.mono, fontSize: 11 }}>{value ? value + suffix : <span style={{ color: T.text4 }}>—</span>}</span>
      <span style={{ color: T.text4, fontSize: 9 }}>✎</span>
    </button>
  );
}

export function EditableSkills({ label, items, onSave, color }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState((items || []).join(", "));
  if (edit) {
    return (
      <span>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft.split(",").map((s) => s.trim()).filter(Boolean)); setEdit(false); } if (e.key === "Escape") setEdit(false); }} onBlur={() => { onSave(draft.split(",").map((s) => s.trim()).filter(Boolean)); setEdit(false); }} style={{ background: T.bg, color, border: `1px solid ${color}`, borderRadius: 5, padding: "3px 7px", fontFamily: T.mono, fontSize: 11, width: 320 }} placeholder="comma-separated skills" />
      </span>
    );
  }
  return (
    <button onClick={() => { setDraft((items || []).join(", ")); setEdit(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", background: T.bg, border: `1px solid ${color}33`, borderRadius: 6, cursor: "pointer" }}>
      <span style={{ color: T.text3, fontSize: 9, letterSpacing: 1.5 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontFamily: T.mono, fontSize: 11 }}>{items.length} loaded</span>
      <span style={{ color: T.text4, fontSize: 9 }}>✎</span>
    </button>
  );
}

export function Tag({ label, value, color = T.cyan }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", background: T.bg, border: `1px solid ${color}33`, borderRadius: 6 }}>
      <span style={{ color: T.text3, fontSize: 9, letterSpacing: 1.5 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontFamily: T.mono, fontSize: 11 }}>{value || "—"}</span>
    </span>
  );
}
