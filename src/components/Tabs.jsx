import { T } from "../theme.js";

export function Tabs({ tab, setTab, ctx, picked }) {
  const tabs = [
    { k: "jd", label: "JD INTEL", badge: ctx.role ? "●" : "" },
    { k: "profiles", label: "PROFILES", badge: ctx.must_have.length ? "●" : "" },
    { k: "email", label: "EMAIL + SOCIAL", badge: picked ? "●" : "" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, padding: 6, background: T.panel, border: `1px solid ${T.cyanDim}`, borderRadius: 12, backdropFilter: "blur(8px)", marginBottom: 14, flexWrap: "wrap" }}>
      {tabs.map((t) => {
        const active = tab === t.k;
        return (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: "1 1 130px", padding: "12px 10px", background: active ? `linear-gradient(180deg, rgba(0,229,255,0.18), rgba(0,229,255,0.06))` : "transparent", border: active ? `1px solid ${T.cyan}` : `1px solid transparent`, borderRadius: 8, color: active ? T.cyan : T.text2, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, boxShadow: active ? `inset 0 0 18px rgba(0,229,255,0.08)` : "none" }}>{t.label}{t.badge && <span style={{ marginLeft: 6, color: active ? T.cyan : T.green, fontSize: 9 }}>{t.badge}</span>}</button>
        );
      })}
    </div>
  );
}
