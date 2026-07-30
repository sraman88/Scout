import { useState } from "react";
import { T } from "../theme.js";

export function Card({ title, accent = T.cyan, children, style }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.cyanDim}`, borderRadius: 12, padding: 18, marginBottom: 14, position: "relative", backdropFilter: "blur(6px)", overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      {title && <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: accent, marginBottom: 14, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}><Dot color={accent} /> {title}</div>}
      {children}
    </div>
  );
}

export function Dot({ color = T.cyan }) { return <span style={{ display: "inline-block", width: 6, height: 6, background: color, borderRadius: 999, boxShadow: `0 0 8px ${color}`, animation: "pulse 1.6s ease-in-out infinite" }} />; }
export function Badge({ color = T.cyan, children }) { return <span style={{ padding: "2px 7px", borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}55`, fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>{children}</span>; }
export function Pill({ color = T.cyan, children }) { return <span style={{ display: "inline-block", padding: "4px 10px", background: `${color}11`, color, border: `1px solid ${color}44`, borderRadius: 999, fontSize: 12, fontWeight: 500, marginRight: 6, marginBottom: 6, fontFamily: T.mono }}>{children}</span>; }
export function Pills({ items, color }) { return <div style={{ display: "flex", flexWrap: "wrap" }}>{(items || []).map((it, i) => <Pill key={i} color={color}>{it}</Pill>)}</div>; }
export function FieldLabel({ children, style }) { return <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 2, color: T.text3, textTransform: "uppercase", marginBottom: 6, ...style }}>{children}</div>; }
export function TextInput(props) { return <input {...props} style={{ width: "100%", padding: "10px 12px", background: T.fieldBg, color: T.fieldText, border: `1px solid ${T.cyanDim}`, borderRadius: 7, fontFamily: T.body, fontSize: 14, ...props.style }} />; }
export function TextArea(props) { return <textarea {...props} style={{ width: "100%", padding: "10px 12px", background: T.fieldBg, color: T.fieldText, border: `1px solid ${T.cyanDim}`, borderRadius: 7, fontFamily: T.body, fontSize: 14, resize: "vertical", lineHeight: 1.5, ...props.style }} />; }
export function Row({ children, style }) { const arr = Array.isArray(children) ? children.filter(Boolean) : [children]; return <div style={{ display: "grid", gridTemplateColumns: `repeat(${arr.length}, 1fr)`, gap: 10, ...style }}>{children}</div>; }
export function Field({ children }) { return <div>{children}</div>; }

export function Stat({ label, children, color = T.cyan }) {
  return (
    <div style={{ padding: "10px 12px", background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 7, minHeight: 64, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.text3, letterSpacing: 2 }}>{label}</div>
      <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 700, color, marginTop: 4 }}>{children}</div>
    </div>
  );
}

export function PrimaryBtn({ children, onClick, disabled, style }) {
  return <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "12px 18px", background: disabled ? T.text4 : `linear-gradient(90deg, ${T.cyan}, ${T.purple})`, color: T.bg, border: "none", borderRadius: 8, fontFamily: T.mono, fontSize: 12, fontWeight: 800, letterSpacing: 2, cursor: disabled ? "not-allowed" : "pointer", boxShadow: disabled ? "none" : `0 4px 18px rgba(0,229,255,0.25)`, ...style }}>{children}</button>;
}

export function MicroBtn({ children, onClick, color = T.cyan, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: "6px 11px", background: `${color}11`, color, border: `1px solid ${color}55`, borderRadius: 6, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}

export function SourceBtn({ active, onClick, children }) {
  return <button onClick={onClick} style={{ padding: "10px 14px", background: active ? `${T.cyan}22` : "transparent", color: active ? T.cyan : T.text2, border: `1px solid ${active ? T.cyan : T.cyanDim}`, borderRadius: 7, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>{children}</button>;
}

export function CopyBtn({ text, large }) {
  const [done, setDone] = useState(false);
  return <button onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard denied */ } }} style={{ padding: large ? "8px 14px" : "5px 10px", background: done ? T.green : "transparent", color: done ? T.bg : T.cyan, border: `1px solid ${done ? T.green : T.cyanDim}`, borderRadius: 6, fontFamily: T.mono, fontSize: large ? 11 : 10, fontWeight: 700, letterSpacing: 1.5 }}>{done ? "✓ COPIED" : "📋 COPY"}</button>;
}

export function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 10px" }}>
      <div style={{ flex: 1, height: 1, background: T.cyanDim }} />
      {label && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 2 }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: T.cyanDim }} />
    </div>
  );
}

export function ErrBox({ children }) { return <div style={{ marginTop: 12, padding: "10px 14px", background: `${T.red}11`, border: `1px solid ${T.red}66`, borderRadius: 7, color: T.red, fontFamily: T.mono, fontSize: 12, lineHeight: 1.5 }}>{children}</div>; }
export function Empty({ label }) { return <div style={{ padding: 30, textAlign: "center", color: T.text3, fontFamily: T.mono, fontSize: 12, letterSpacing: 1.5 }}>{label}</div>; }
export function LoadingPulse() { return <div style={{ padding: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}><div style={{ width: 32, height: 32, border: `2px solid ${T.cyanDim}`, borderTopColor: T.cyan, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><div style={{ fontFamily: T.mono, fontSize: 11, color: T.text3, letterSpacing: 2 }}>SCANNING...</div></div>; }
export function Footer() { return <div style={{ marginTop: 30, textAlign: "center", fontFamily: T.mono, fontSize: 10, color: T.text4, letterSpacing: 2 }}>SCOUT v3.1 · LINKS ONLY · NO DATA STORED · BUILT FOR RECRUITERS WHO HUNT</div>; }
