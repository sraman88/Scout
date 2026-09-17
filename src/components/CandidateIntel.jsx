import { useState } from "react";
import { skillEvidence } from "../lib/skillEvidence.js";
import { findFootprint, foundOnly } from "../lib/footprint.js";

/* What the public record says about a candidate, as opposed to what their
   profile claims. Two halves:
     · skill evidence — the JD's skills crossed against their public repos
     · footprint      — the other platforms they actually exist on
   Both run only on an explicit click, and only when we hold a real handle for
   them. Guessing a GitHub username from a person's name would attribute a
   stranger's code to a candidate, which is a worse failure than showing
   nothing, so it is never done. */
export default function CandidateIntel({ username, skills = [], onClose }) {
  const [evidence, setEvidence] = useState(null);
  const [footprint, setFootprint] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setError(""); setFootprint([]);
    try {
      /* Footprint rows stream in as each site answers, so the panel fills
         progressively instead of waiting on the slowest proxy. */
      const fp = findFootprint(username, { onResult: (row) => setFootprint((prev) => [...(prev || []), row]) });
      const ev = skills.length ? skillEvidence(username, skills).catch((e) => ({ error: e.message })) : null;
      const [, evResult] = await Promise.all([fp, ev]);
      if (evResult?.error) setError(evResult.error);
      else if (evResult) setEvidence(evResult);
    } catch (e) {
      setError(e.message || String(e));
    } finally { setBusy(false); }
  }

  if (!username) {
    return (
      <div className="intel">
        <p className="intel-none">
          No public handle for this candidate — Scout won't guess one from their name, since that would
          credit someone else's work to them. Reveal contact first: a verified GitHub or Stack Overflow
          handle unlocks this.
        </p>
        <button className="btn-ghost" onClick={onClose}>Close</button>
      </div>
    );
  }

  const found = foundOnly(footprint || []);
  const pending = footprint && footprint.length < 16;

  return (
    <div className="intel">
      {!evidence && !footprint && !busy && (
        <>
          <p className="intel-lead">Check <b>@{username}</b> against public code and the platforms they publish on.</p>
          <button className="btn-pri" onClick={run}>Run intel</button>
        </>
      )}
      {busy && !footprint?.length && <p className="intel-lead">Checking…</p>}
      {error && <p className="intel-err">{error}</p>}

      {evidence && (
        <section className="intel-sec">
          <h4>Skill evidence <span className="pill">{evidence.repoCount} public repos</span></h4>
          {evidence.summary && <p className="intel-sum">{evidence.summary}</p>}
          <ul className="evlist">
            {evidence.rows.map((r) => (
              <li key={r.skill} className={r.evidenced ? (r.stale ? "ev stale" : "ev yes") : "ev no"}>
                <span className="ev-mark" aria-hidden="true">{r.evidenced ? (r.stale ? "◐" : "●") : "○"}</span>
                <span className="ev-skill">{r.skill}</span>
                <span className="ev-note">{r.note}</span>
                {r.proof?.length > 0 && (
                  <span className="ev-proof">
                    {r.proof.map((p, i) => (
                      <a key={i} href={p.url} target="_blank" rel="noreferrer" title={p.why}>{p.why.split(" — ")[0]}</a>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="intel-caveat">No public signal isn't a negative — most production code is private.</p>
        </section>
      )}

      {footprint && (
        <section className="intel-sec">
          <h4>Also found on {pending && <span className="pill">checking…</span>}</h4>
          {found.length === 0 && !pending && <p className="intel-sum">Nothing public under this handle.</p>}
          <div className="fpgrid">
            {found.map((r) => (
              <a key={r.id} className={"fp " + r.kind} href={r.url} target="_blank" rel="noreferrer">
                <b>{r.label}</b>
                {r.detail && <span>{r.detail}</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {(evidence || footprint) && !busy && <button className="btn-ghost" onClick={onClose}>Close</button>}
    </div>
  );
}
