import { T, COUNTRIES, ENV_GROQ, ENV_GH, ENV_GEMINI } from "../theme.js";
import { getStoredKey } from "../lib/storage.js";
import { useAuth } from "../lib/authContext.js";

export function Header({ provider, setProvider, country, setCountry, openSettings }) {
  const hasGroq = !!(getStoredKey("groq") || ENV_GROQ);
  const hasGemini = !!(getStoredKey("gemini") || ENV_GEMINI);
  const hasGH = !!(getStoredKey("github") || ENV_GH);
  const { user, signOut } = useAuth();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${T.cyan}, ${T.purple})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.display, fontWeight: 800, fontSize: 22, color: T.bg, boxShadow: `0 0 24px rgba(0,229,255,0.35)` }}>S</div>
        <div>
          <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 26, letterSpacing: 1.5, color: T.text }}>SCOUT</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 2, color: T.text3, textTransform: "uppercase" }}>Sourcing Engine v3.1</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, padding: 3, background: T.bg2, border: `1px solid ${T.cyanDim}`, borderRadius: 7 }}>
          <button onClick={() => setProvider("groq")} style={{ padding: "5px 9px", background: provider === "groq" ? T.cyan : "transparent", color: provider === "groq" ? T.bg : T.text2, border: "none", borderRadius: 5, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>GROQ {hasGroq ? "●" : "○"}</button>
          <button onClick={() => setProvider("gemini")} style={{ padding: "5px 9px", background: provider === "gemini" ? T.cyan : "transparent", color: provider === "gemini" ? T.bg : T.text2, border: "none", borderRadius: 5, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>GEMINI {hasGemini ? "●" : "○"}</button>
        </div>
        <select value={country} onChange={(e) => setCountry(e.target.value)} style={{ padding: "7px 10px", background: T.bg2, color: T.cyan, border: `1px solid ${T.cyanDim}`, borderRadius: 7, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
        </select>
        <button onClick={openSettings} style={{ padding: "7px 12px", background: T.bg2, color: T.text, border: `1px solid ${T.cyanDim}`, borderRadius: 7, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>⚙ SETTINGS {!hasGH ? "(GH ⚠)" : ""}</button>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px 4px 4px", background: T.bg2, border: `1px solid ${T.cyanDim}`, borderRadius: 7 }}>
            {user.photoURL
              ? <img src={user.photoURL} alt="" style={{ width: 22, height: 22, borderRadius: 999 }} />
              : <div style={{ width: 22, height: 22, borderRadius: 999, background: T.cyanDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.cyan }}>{(user.email || "?").slice(0, 1).toUpperCase()}</div>}
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.text2, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
            <button onClick={() => signOut()} style={{ background: "transparent", border: "none", color: T.text3, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1 }} title="Sign out">SIGN OUT</button>
          </div>
        )}
      </div>
    </div>
  );
}
