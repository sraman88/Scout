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

export default function CandidateCard({ profile = {}, onSave, onOpen, onEmail }) {
  const m = profile.match || {};
  const openUrl = profile.url || (profile.linkedinUrn ? `https://www.linkedin.com/in/${profile.linkedinUrn}` : null);
  const loc = profile.location || [profile.city, profile.country].filter(Boolean).join(", ");

  return (
    <article style={S.card}>
      <div style={S.head}>
        {profile.avatarUrl
          ? <img src={profile.avatarUrl} alt="" style={S.avatar} />
          : <div style={S.avatar} />}
        <div style={S.id}>
          <div style={S.name}>{profile.name || "—"}</div>
          {(profile.title || profile.org) && (
            <div style={S.role}>{[profile.title, profile.org].filter(Boolean).join(", ")}</div>
          )}
          {loc && <div style={S.loc}>📍 {loc}</div>}
        </div>
        {typeof m.score === "number" && (
          <div style={S.score}><div style={S.pct}>{m.score}%</div><div style={S.slab}>match</div></div>
        )}
      </div>

      {m.reason && (
        <>
          <div style={S.rule} />
          <div style={S.why}><span style={S.marker}>Why this profile</span>{m.reason}</div>
        </>
      )}
      {(m.matched?.length || m.missed?.length) ? (
        <div style={S.tags}>
          {(m.matched || []).map((t) => <span key={"m" + t} style={S.tag}>{t}</span>)}
          {(m.missed || []).map((t) => <span key={"x" + t} style={{ ...S.tag, ...S.miss }}>{t}</span>)}
        </div>
      ) : null}

      {profile.sources?.length ? (
        <>
          <div style={S.rule} />
          <div style={S.slabel}>Found on</div>
          <div style={S.sources}>
            {profile.sources.map((s, i) => (
              <a key={i} href={s.url || "#"} target="_blank" rel="noreferrer" style={S.src}>
                <span style={{ ...S.badge, ...(BADGE[s.id] || {}) }}>{LETTER[s.id] || "•"}</span>
                {s.label || s.id}
                {typeof s.stars === "number" && <span style={S.stars}>★ {s.stars}</span>}
              </a>
            ))}
          </div>
        </>
      ) : null}

      {profile.cv ? (
        <div style={S.cv}>
          <div style={S.thumb} />
          <div style={S.cvMeta}>
            <div style={S.cvName}>{profile.cv.name}</div>
            <div style={S.cvSub}>{profile.cv.pages ? `${profile.cv.pages} pages · ` : ""}found via Google</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {profile.cv.url && <a style={S.icb} href={profile.cv.url} target="_blank" rel="noreferrer" title="Preview">◎</a>}
            {profile.cv.url && <a style={S.icb} href={profile.cv.url} download title="Download">↓</a>}
          </div>
        </div>
      ) : null}

      {(profile.contact?.email || profile.contact?.phone !== undefined) && (
        <div style={S.contact}>
          {profile.contact?.email
            ? <span style={S.ct}>✉ {profile.contact.email}</span>
            : <span style={{ ...S.ct, ...S.missing }}>✉ no email found</span>}
          {profile.contact?.phone
            ? <span style={S.ct}>☎ {profile.contact.phone}</span>
            : <span style={{ ...S.ct, ...S.missing }}>☎ no phone found</span>}
        </div>
      )}

      <div style={S.actions}>
        <button style={{ ...S.btn, ...S.primary }} onClick={() => onOpen?.(profile, openUrl)}>Open profile</button>
        <button style={S.btn} onClick={() => onEmail?.(profile)}>Email + social</button>
        <button style={S.btn} onClick={() => onSave?.(profile)}>★ Save</button>
      </div>
    </article>
  );
}

const BADGE = { linkedin: { background: "#0A66C2" }, github: { background: "#24292F" }, cv: { background: "#fff", color: "#4285F4", border: "1px solid #E4E2DA" } };
const LETTER = { linkedin: "in", github: "GH", cv: "G" };

const S = {
  card: { background: "#fff", border: "1px solid #E4E2DA", borderRadius: 10, padding: "20px 20px 16px", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: "#000", maxWidth: 420 },
  head: { display: "flex", gap: 14, alignItems: "flex-start" },
  avatar: { width: 52, height: 52, borderRadius: "50%", objectFit: "cover", background: "#EDEBE4", border: "1px solid #E4E2DA", flex: "0 0 52px" },
  id: { flex: 1, minWidth: 0 },
  name: { fontFamily: "'Newsreader', Georgia, serif", fontWeight: 600, fontSize: 22, lineHeight: 1.1 },
  role: { fontSize: 14, fontWeight: 500, marginTop: 3 },
  loc: { fontSize: 12.5, color: "#55524B", marginTop: 3 },
  score: { textAlign: "right", flex: "0 0 auto" },
  pct: { fontSize: 22, fontWeight: 600, color: "#0B6E4F", lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  slab: { fontSize: 10.5, color: "#8A867C", marginTop: 2 },
  rule: { height: 1, background: "#E4E2DA", margin: "15px 0" },
  why: { fontFamily: "'Newsreader', Georgia, serif", fontStyle: "italic", fontSize: 15, lineHeight: 1.5 },
  marker: { fontFamily: "'IBM Plex Sans', sans-serif", fontStyle: "normal", fontWeight: 600, fontSize: 11, color: "#0B6E4F", letterSpacing: ".03em", marginRight: 7 },
  tags: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: { fontSize: 11.5, padding: "2px 9px", borderRadius: 999, background: "#EAF4EF", color: "#0B6E4F", fontWeight: 500 },
  miss: { background: "#F3F1EA", color: "#8A867C", textDecoration: "line-through" },
  slabel: { fontSize: 11, color: "#8A867C", fontWeight: 600, marginBottom: 8 },
  sources: { display: "flex", flexWrap: "wrap", gap: 8 },
  src: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500, padding: "4px 10px", border: "1px solid #E4E2DA", borderRadius: 8, textDecoration: "none", color: "#000" },
  badge: { width: 16, height: 16, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: "#fff", flex: "0 0 16px" },
  stars: { color: "#9A6B00", fontWeight: 600 },
  cv: { display: "flex", alignItems: "center", gap: 12, marginTop: 12, padding: "10px 12px", border: "1px solid #E4E2DA", borderRadius: 8, background: "#FCFBF8" },
  thumb: { width: 30, height: 40, background: "#fff", border: "1px solid #E4E2DA", borderRadius: 3, flex: "0 0 30px" },
  cvMeta: { flex: 1, minWidth: 0 },
  cvName: { fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  cvSub: { fontSize: 11, color: "#8A867C", marginTop: 1 },
  icb: { width: 30, height: 30, border: "1px solid #E4E2DA", borderRadius: 7, background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#55524B", textDecoration: "none" },
  contact: { display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14 },
  ct: { fontSize: 12.5 },
  missing: { color: "#8A867C" },
  actions: { display: "flex", gap: 8, marginTop: 16 },
  btn: { fontFamily: "inherit", fontSize: 13, fontWeight: 600, borderRadius: 8, padding: "9px 14px", cursor: "pointer", border: "1px solid #E4E2DA", background: "#fff", color: "#000" },
  primary: { background: "#0A66C2", borderColor: "#0A66C2", color: "#fff", flex: 1 },
};
