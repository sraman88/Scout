import { useState, useMemo } from "react";
import { detectTerms } from "../lib/glossary.js";
import { explainTerm } from "../lib/termInsight.js";
import { useDialog } from "../lib/useDialog.js";

/* The rail that reads the JD back to the recruiter.
   A recruiter who doesn't know what Kafka is cannot tell someone who ran it in
   production from someone who did a weekend tutorial — so every entry leads
   with how to screen for the thing, not just what it is. Docked to the right,
   opened by a button carrying the count of terms found. */
export default function InsightRail({ text = "", role = "", family = null }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [lookup, setLookup] = useState("");
  const [generated, setGenerated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useDialog(open, () => setOpen(false));

  const terms = useMemo(() => detectTerms(text, { family }), [text, family]);
  const active = generated || (selected ? terms.find((t) => t.id === selected) : null) || terms[0] || null;

  if (!terms.length && !generated) return null;

  async function ask(e) {
    e.preventDefault();
    const q = lookup.trim();
    if (!q || busy) return;
    setBusy(true); setError(""); setGenerated(null);
    try {
      const insight = await explainTerm(q, { role });
      if (insight) setGenerated(insight);
      else setError(`Couldn't find anything useful about "${q}".`);
    } catch (err) {
      setError(err.message || String(err));
    } finally { setBusy(false); }
  }

  return (
    <>
      <button className="rail-tab" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className="rail-tab-n">{terms.length}</span>
        <span className="rail-tab-l">What this JD is asking for</span>
      </button>

      {open && (
        <>
          <div className="sheet-scrim" onClick={() => setOpen(false)} />
          <aside className="rail" ref={ref} role="dialog" aria-modal="true" aria-labelledby="rail-title">
            <div className="sheet-head">
              <div>
                <h2 id="rail-title">What this JD is asking for</h2>
                <p>{terms.length} term{terms.length === 1 ? "" : "s"} found. Each one includes how to screen for it.</p>
              </div>
              <button className="sheet-x" onClick={() => setOpen(false)} aria-label="Close insights">×</button>
            </div>

            <div className="rail-terms" role="tablist" aria-label="Detected terms">
              {terms.map((t) => (
                <button key={t.id} role="tab" aria-selected={active?.id === t.id}
                  className={"chip" + (active?.id === t.id ? " on" : "")}
                  onClick={() => { setSelected(t.id); setGenerated(null); }}>{t.label}</button>
              ))}
            </div>

            <div className="sheet-body">
              {active && (
                <article className="insight">
                  <h3>
                    {active.label}
                    {active.kind && <span className="pill">{active.kind}</span>}
                    {active.generated && <span className="pill req">AI-generated</span>}
                  </h3>
                  <p className="what">{active.what}</p>
                  {active.where && (
                    <>
                      <h4>Where it's used</h4>
                      <p>{active.where}</p>
                    </>
                  )}
                  {active.screen?.length > 0 && (
                    <>
                      <h4>How to screen for it</h4>
                      <ul className="screenlist">{active.screen.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </>
                  )}
                  {active.related?.length > 0 && (
                    <p className="related">Related: {active.related.join(" · ")}</p>
                  )}
                </article>
              )}

              <form className="rail-ask" onSubmit={ask}>
                <label htmlFor="rail-lookup">Something else in the JD?</label>
                <div className="rail-ask-row">
                  <input id="rail-lookup" value={lookup} placeholder="e.g. Snowpipe, Gartner MQ, SAFe"
                    onChange={(e) => setLookup(e.target.value)} />
                  <button className="btn-ghost" type="submit" disabled={busy || !lookup.trim()}>{busy ? "Asking…" : "Explain"}</button>
                </div>
                <p className="hint">Scout explains the {terms.length ? "terms above" : "JD"} instantly. Anything else is answered by your configured model.</p>
                {error && <p className="err">{error}</p>}
              </form>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
