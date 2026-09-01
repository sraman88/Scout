import { useState } from "react";

// CandidateCard — themed to scout-theme.css (matches the one-page mockup).
// profile = { name, title, org, location, avatarUrl?, url?, linkedinUrn?,
//   match:{score,tier,reason,matched:[],missed:[]}, sources:[{id,label,url,stars?}] }
// Contact reveal happens inline, on demand — there is no separate email tab.
const SRC_BG = { linkedin: "#0A66C2", github: "#24292F", google: "#4285F4", stackoverflow: "#F48024", hn: "#FF6600", cv: "#1e1e1e" };
const SRC_LTR = { linkedin: "in", github: "GH", google: "G", stackoverflow: "SO", hn: "Y", cv: "CV" };
const TIER_CLASS = { Strong: "strong", Good: "good", Maybe: "maybe", Weak: "weak", Unscored: "unscored" };

export default function CandidateCard({ profile = {}, onOpen, onRevealEmail, onSave, saved = false }) {
  const [revealing, setRevealing] = useState(false);
  const [contact, setContact] = useState(null);
  const [revealError, setRevealError] = useState("");

  const m = profile.match || {};
  const url = profile.url || (profile.linkedinUrn ? `https://www.linkedin.com/in/${profile.linkedinUrn}` : null);
  const loc = profile.location || [profile.city, profile.country].filter(Boolean).join(", ");

  async function reveal() {
    if (!onRevealEmail || revealing || contact) return;
    setRevealing(true); setRevealError("");
    try {
      setContact(await onRevealEmail(profile));
    } catch (e) {
      setRevealError(e.message || String(e));
    } finally {
      setRevealing(false);
    }
  }

  return (
    <article className="card">
      <div className="chead">
        <div className="av" style={profile.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})`, backgroundSize: "cover" } : undefined} />
        <div className="cwho">
          <div className="nm">{profile.name || "—"}</div>
          {(profile.title || profile.org) && <div className="rl">{[profile.title, profile.org].filter(Boolean).join(" · ")}</div>}
          {loc && <div className="lc">{loc}</div>}
        </div>
        {typeof m.score === "number" && (
          <div className={"sc " + (TIER_CLASS[m.tier] || "")}>
            <div className="p">{m.score}%</div>
            <div className="l">{m.tier || "match"}</div>
          </div>
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
            <a key={i} className="s" href={s.url || "#"} target="_blank" rel="noreferrer">
              <span className="b" style={{ background: SRC_BG[s.id] || "#1e1e1e" }}>{SRC_LTR[s.id] || "•"}</span>
              {s.label || s.id}{typeof s.stars === "number" ? ` ★ ${s.stars}` : ""}
            </a>
          ))}
        </div>
      ) : null}

      {(contact || revealError) && (
        <div className={"contact" + (revealError ? " bad" : "")}>
          {revealError
            ? `Couldn't reveal contact — ${revealError}`
            : (
              <>
                <div>
                  {contact.emails?.length
                    ? contact.emails.map((e) => <a key={e} href={`mailto:${e}`}>✉ {e}</a>)
                    : <span className="none">✉ no public email found</span>}
                </div>
                {contact.phone && <div>☎ {contact.phone}</div>}
                {contact.social_handles?.length ? (
                  <div className="soc">
                    {contact.social_handles.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noreferrer">{s.platform} {s.handle}</a>
                    ))}
                  </div>
                ) : null}
              </>
            )}
        </div>
      )}

      <div className="cta">
        <button className="g pri" onClick={() => onOpen?.(profile, url)} disabled={!url}>Open profile</button>
        <button className="g" onClick={reveal} disabled={revealing || !!contact}>
          {revealing ? "Revealing…" : contact ? "Revealed" : "Email + social"}
        </button>
        <button className={"g star" + (saved ? " on" : "")} onClick={() => onSave?.(profile)} title={saved ? "Saved" : "Save"}>★</button>
      </div>
    </article>
  );
}
