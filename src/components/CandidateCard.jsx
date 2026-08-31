import { T } from "../theme.js";
import { Badge } from "./ui.jsx";

// CandidateCard — the editorial dossier card, as a component.
// Feed it a profile enriched by lib/scoreProfile.js:
//   profile = {
//     name, title, org, location, avatarUrl?, linkedinUrn?, url?,
//     match: { score, tier, reason, matched:[], missed:[] },   // from scoreProfile
//     sources: [{ id:"linkedin"|"github"|"cv", label, url?, stars? }],
//     cv?: { name, url, pages },
//     contact?: { email?, phone? },
//   }
// The raw LinkedIn URN is used only to build the profile URL — never shown.

const BADGE_COLOR = { linkedin: T.purple, github: T.cyan, google: T.amber, cv: T.text3 };
const TIER_COLOR = { Strong: T.green, Good: T.cyan, Maybe: T.amber, Weak: T.red, Unscored: T.text3 };

export default function CandidateCard({ profile = {}, onSave, onOpen, onEmail }) {
  const m = profile.match || {};
  const openUrl = profile.url || (profile.linkedinUrn ? `https://www.linkedin.com/in/${profile.linkedinUrn}` : null);
  const loc = profile.location || [profile.city, profile.country].filter(Boolean).join(", ");
  const tierColor = TIER_COLOR[m.tier] || T.text3;

  return (
    <article style={{ background: T.panel, border: `1px solid ${T.cyanDim}`, borderRadius: 12, padding: "18px 18px 14px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${tierColor}, transparent)` }} />
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {profile.avatarUrl
          ? <img src={profile.avatarUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: `1px solid ${T.cyanDim}`, flex: "0 0 48px" }} />
          : <div style={{ width: 48, height: 48, borderRadius: 8, background: T.bg3, border: `1px solid ${T.cyanDim}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.cyan, fontFamily: T.display, fontWeight: 700, fontSize: 18, flex: "0 0 48px" }}>{(profile.name || "?").slice(0, 1).toUpperCase()}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 17, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.name || "—"}</div>
          {(profile.title || profile.org) && <div style={{ fontSize: 13, color: T.text2, marginTop: 2 }}>{[profile.title, profile.org].filter(Boolean).join(", ")}</div>}
          {loc && <div style={{ fontSize: 11, color: T.text3, marginTop: 2, fontFamily: T.mono }}>📍 {loc}</div>}
        </div>
        {typeof m.score === "number" && (
          <div style={{ textAlign: "right", flex: "0 0 auto" }}>
            <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 700, color: tierColor, lineHeight: 1 }}>{m.score}%</div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.text4, marginTop: 2 }}>{m.tier || "match"}</div>
          </div>
        )}
      </div>

      {m.reason && (
        <>
          <div style={{ height: 1, background: T.cyanDim, margin: "14px 0" }} />
          <div style={{ fontSize: 13, lineHeight: 1.5, color: T.text2 }}>
            <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 10, color: tierColor, letterSpacing: 1, marginRight: 8 }}>WHY THIS PROFILE</span>
            {m.reason}
          </div>
        </>
      )}
      {(m.matched?.length || m.missed?.length) ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {(m.matched || []).map((t) => <span key={"m" + t} style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: `${T.green}15`, color: T.green, border: `1px solid ${T.green}33`, fontFamily: T.mono }}>{t}</span>)}
          {(m.missed || []).map((t) => <span key={"x" + t} style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: T.bg3, color: T.text4, border: `1px solid ${T.cyanDim}`, fontFamily: T.mono, textDecoration: "line-through" }}>{t}</span>)}
        </div>
      ) : null}

      {profile.sources?.length ? (
        <>
          <div style={{ height: 1, background: T.cyanDim, margin: "14px 0" }} />
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 1.5, marginBottom: 8 }}>FOUND ON</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {profile.sources.map((s, i) => (
              <a key={i} href={s.url || "#"} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "4px 10px", border: `1px solid ${T.cyanDim}`, borderRadius: 8, textDecoration: "none", color: T.text }}>
                <Badge color={BADGE_COLOR[s.id] || T.cyan}>{(s.label || s.id || "").slice(0, 2).toUpperCase()}</Badge>
                {s.label || s.id}
                {typeof s.stars === "number" && <span style={{ color: T.amber, fontWeight: 700 }}>★ {s.stars}</span>}
              </a>
            ))}
          </div>
        </>
      ) : null}

      {profile.cv ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, padding: "10px 12px", border: `1px solid ${T.cyanDim}`, borderRadius: 8, background: T.bg3 }}>
          <div style={{ width: 30, height: 40, background: T.bg2, border: `1px solid ${T.cyanDim}`, borderRadius: 3, flex: "0 0 30px" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.cv.name}</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 1 }}>{profile.cv.pages ? `${profile.cv.pages} pages · ` : ""}found via Google</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {profile.cv.url && <a href={profile.cv.url} target="_blank" rel="noreferrer" title="Preview" style={{ width: 30, height: 30, border: `1px solid ${T.cyanDim}`, borderRadius: 7, background: T.bg2, display: "grid", placeItems: "center", color: T.text2, textDecoration: "none" }}>◎</a>}
          </div>
        </div>
      ) : null}

      {(profile.contact?.email || profile.contact?.phone !== undefined) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14, fontSize: 12 }}>
          {profile.contact?.email
            ? <span style={{ color: T.text2 }}>✉ {profile.contact.email}</span>
            : <span style={{ color: T.text4 }}>✉ no email found</span>}
          {profile.contact?.phone
            ? <span style={{ color: T.text2 }}>☎ {profile.contact.phone}</span>
            : <span style={{ color: T.text4 }}>☎ no phone found</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={() => onOpen?.(profile, openUrl)} style={{ flex: 1, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1, borderRadius: 8, padding: "9px 14px", cursor: "pointer", border: "none", background: `linear-gradient(90deg, ${T.cyan}, ${T.purple})`, color: T.bg }}>OPEN PROFILE</button>
        <button onClick={() => onEmail?.(profile)} style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1, borderRadius: 8, padding: "9px 14px", cursor: "pointer", border: `1px solid ${T.greenDim}`, background: `${T.green}11`, color: T.green }}>EMAIL + SOCIAL</button>
        <button onClick={() => onSave?.(profile)} style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1, borderRadius: 8, padding: "9px 14px", cursor: "pointer", border: `1px solid ${T.cyanDim}`, background: T.bg3, color: T.text2 }}>★ SAVE</button>
      </div>
    </article>
  );
}
