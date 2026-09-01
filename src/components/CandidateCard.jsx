
// CandidateCard — themed to scout-theme.css (matches the one-page mockup).
// profile = { name, title, org, location, avatarUrl?, url?, linkedinUrn?,
//   match:{score,reason,matched:[],missed:[]}, sources:[{id,label,url,stars?}] }
const SRC_BG = { linkedin: "#0A66C2", github: "#24292F", cv: "#1e1e1e" };
const SRC_LTR = { linkedin: "in", github: "GH", cv: "G" };

export default function CandidateCard({ profile = {}, onOpen, onEmail, onSave }) {
  const m = profile.match || {};
  const url = profile.url || (profile.linkedinUrn ? `https://www.linkedin.com/in/${profile.linkedinUrn}` : null);
  const loc = profile.location || [profile.city, profile.country].filter(Boolean).join(", ");
  return (
    <article className="card">
      <div className="chead">
        <div className="av" style={profile.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})`, backgroundSize: "cover" } : undefined} />
        <div>
          <div className="nm">{profile.name || "—"}</div>
          {(profile.title || profile.org) && <div className="rl">{[profile.title, profile.org].filter(Boolean).join(", ")}</div>}
          {loc && <div className="lc">{loc}</div>}
        </div>
        {typeof m.score === "number" && (
          <div className="sc"><div className="p">{m.score}%</div><div className="l">match</div></div>
        )}
      </div>

      {m.reason && <div className="why">{m.reason}</div>}

      {(m.matched?.length || m.missed?.length) ? (
        <div className="tags">
          {(m.matched || []).map((t) => <span key={"m" + t} className="t">{t}</span>)}
          {(m.missed || []).map((t) => <span key={"x" + t} className="t x">{t}</span>)}
        </div>
      ) : null}

      {profile.sources?.length ? (
        <div className="srcs">
          {profile.sources.map((s, i) => (
            <a key={i} className="s" href={s.url || "#"} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="b" style={{ background: SRC_BG[s.id] || "#1e1e1e" }}>{SRC_LTR[s.id] || "•"}</span>
              {s.label || s.id}{typeof s.stars === "number" ? ` ★ ${s.stars}` : ""}
            </a>
          ))}
        </div>
      ) : null}

      <div className="cta">
        <button className="g pri" onClick={() => onOpen?.(profile, url)}>Open</button>
        <button className="g" onClick={() => onEmail?.(profile)}>Email + social</button>
        <button className="g" onClick={() => onSave?.(profile)}>★</button>
      </div>
    </article>
  );
}
