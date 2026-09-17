import { useState, useMemo } from "react";
import { getStoredKey, setStoredKey } from "../lib/storage.js";
import { useDialog } from "../lib/useDialog.js";
import CompetitorKeyField from "./CompetitorKeyField.jsx";

/* Settings as a right-hand slide-over, grouped by the job each key does rather
   than by which vendor issued it — a recruiter setting Scout up asks "how do I
   search LinkedIn?", not "what is my Apify actor id?".
   Previously this was a dark neon dialog inherited from an older theme, sitting
   over a light app: it read as a different product, and its helper text failed
   contrast at ~2.4:1. */

/* Cheap shape checks. Not validation of whether a key WORKS — only whether it
   looks like the thing the field is asking for, which catches the actual
   mistake people make: pasting the Groq key into the Gemini box. */
const SHAPES = {
  groq: { re: /^gsk_/, hint: "Groq keys start with gsk_" },
  gemini: { re: /^AIza/, hint: "Gemini keys start with AIza" },
  github: { re: /^(ghp_|github_pat_|gho_)/, hint: "GitHub tokens start with ghp_ or github_pat_" },
  apify: { re: /^apify_api_/, hint: "Apify tokens start with apify_api_" },
};
const shapeError = (id, value) => {
  const v = (value || "").trim();
  if (!v || !SHAPES[id]) return "";
  return SHAPES[id].re.test(v) ? "" : SHAPES[id].hint;
};

const ACTOR_DEFAULTS = {
  apify_profile_actor: "dev_fusion~linkedin-profile-scraper",
  apify_search_actor: "harvestapi~linkedin-profile-search",
  apify_google_actor: "apify~google-search-scraper",
  apify_company_actor: "harvestapi~linkedin-company-employees",
};

function Field({ id, label, pill, value, onChange, placeholder, hint, error, type = "text" }) {
  return (
    <div className={"frow" + (error ? " bad" : "")}>
      <label htmlFor={id}>
        {label}
        {pill && <span className={"pill " + pill.kind}>{pill.text}</span>}
      </label>
      <input id={id} type={type} value={value} placeholder={placeholder} autoComplete="off" spellCheck="false"
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        aria-invalid={error ? "true" : undefined}
        onChange={(e) => onChange(e.target.value)} />
      {error && <p className="err" id={`${id}-err`}>{error}</p>}
      {!error && hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

export function SettingsModal({ close, provider, setProvider }) {
  const [keys, setKeys] = useState(() => ({
    groq: getStoredKey("groq") || "",
    gemini: getStoredKey("gemini") || "",
    github: getStoredKey("github") || "",
    apify: getStoredKey("apify") || "",
  }));
  const [actors, setActors] = useState(() => Object.fromEntries(
    Object.entries(ACTOR_DEFAULTS).map(([k, d]) => [k, getStoredKey(k) || d])
  ));
  const [competitorModel, setCompetitorModel] = useState({
    provider: getStoredKey("competitor_provider") || "gemini",
    apiKey: getStoredKey("competitor_api_key") || "",
    baseURL: getStoredKey("competitor_base_url") || "",
  });
  const [dirty, setDirty] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const firstRun = !getStoredKey("onboarding_done");

  const ref = useDialog(true, close);

  const setKey = (id, v) => { setKeys((k) => ({ ...k, [id]: v })); setDirty(true); };
  const setActor = (id, v) => { setActors((a) => ({ ...a, [id]: v })); setDirty(true); };
  const setModel = (v) => { setCompetitorModel(v); setDirty(true); };
  const pickProvider = (p) => { setProvider(p); setDirty(true); };

  const errors = useMemo(
    () => Object.fromEntries(Object.keys(SHAPES).map((id) => [id, shapeError(id, keys[id])])),
    [keys]
  );
  const hasErrors = Object.values(errors).some(Boolean);
  const hasLlmKey = !!(keys.groq.trim() || keys.gemini.trim());
  const pill = (id) => (keys[id]?.trim() ? { kind: "on", text: "set" } : { kind: "", text: "not set" });

  function save() {
    if (hasErrors) return;
    Object.entries(keys).forEach(([k, v]) => setStoredKey(k, v.trim()));
    Object.entries(actors).forEach(([k, v]) => setStoredKey(k, (v || "").trim()));
    setStoredKey("competitor_provider", competitorModel.provider || "gemini");
    setStoredKey("competitor_api_key", (competitorModel.apiKey || "").trim());
    setStoredKey("competitor_base_url", (competitorModel.baseURL || "").trim());
    setStoredKey("onboarding_done", "1");
    close();
  }

  function clearAll() {
    [...Object.keys(keys), ...Object.keys(ACTOR_DEFAULTS), "competitor_provider", "competitor_api_key", "competitor_base_url", "onboarding_done"]
      .forEach((k) => setStoredKey(k, ""));
    setKeys({ groq: "", gemini: "", github: "", apify: "" });
    setActors({ ...ACTOR_DEFAULTS });
    setCompetitorModel({ provider: "gemini", apiKey: "", baseURL: "" });
    setConfirmClear(false);
    setDirty(true);
  }

  return (
    <>
      <div className="sheet-scrim" onClick={close} />
      <aside className="sheet" ref={ref} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="sheet-head">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Keys are saved to your signed-in Google account and follow you across devices. They are sent only to the official APIs and your own Firebase project.</p>
          </div>
          <button className="sheet-x" onClick={close} aria-label="Close settings">×</button>
        </div>

        <div className="sheet-body">
          {firstRun && (
            <div className="fsec">
              <h3>Start here</h3>
              <p className="note">
                One LLM key is the minimum — <strong>Groq is free and fastest</strong>. Add a GitHub token to lift
                the rate limit from 60 to 5,000 requests an hour, and an Apify token to search LinkedIn.
              </p>
            </div>
          )}

          <section className="fsec">
            <h3>Scoring &amp; analysis</h3>
            <p className="note">
              Reads job descriptions and scores candidates. Free keys:{" "}
              <a href="https://console.groq.com" target="_blank" rel="noreferrer">Groq</a> ·{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Gemini</a>
            </p>
            <Field id="groq" label="Groq API key" pill={pill("groq")} value={keys.groq} onChange={(v) => setKey("groq", v)}
              type="password" placeholder="gsk_…" error={errors.groq} />
            <Field id="gemini" label="Google Gemini API key" pill={pill("gemini")} value={keys.gemini} onChange={(v) => setKey("gemini", v)}
              type="password" placeholder="AIza…" error={errors.gemini}
              hint="Also powers the web-grounded talent market and competitor lookup." />
            {!hasLlmKey && <p className="hint" style={{ color: "var(--warn)" }}>Scout needs at least one of these to score anything.</p>}

            <div className="frow">
              <label id="provider-label">Provider preference</label>
              <div className="seg" role="group" aria-labelledby="provider-label">
                {[["auto", "Auto"], ["groq", "Groq"], ["gemini", "Gemini"]].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={provider === id} onClick={() => pickProvider(id)}>{label}</button>
                ))}
              </div>
              <p className="hint">Auto uses whichever provider is working and stays with it. Model names are never hardcoded — Scout asks each provider what your key can use and skips what it rejects.</p>
            </div>
          </section>

          <section className="fsec">
            <h3>Sourcing</h3>
            <p className="note">
              Where candidates come from.{" "}
              <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">GitHub token</a> (classic, no scopes) ·{" "}
              <a href="https://console.apify.com/account/integrations" target="_blank" rel="noreferrer">Apify token</a> ($5/mo free credit)
            </p>
            <Field id="github" label="GitHub token" pill={pill("github")} value={keys.github} onChange={(v) => setKey("github", v)}
              type="password" placeholder="ghp_…" error={errors.github}
              hint="Recommended — lifts the rate limit from 60 to 5,000 per hour, and powers skill evidence." />
            <Field id="apify" label="Apify token" pill={pill("apify")} value={keys.apify} onChange={(v) => setKey("apify", v)}
              type="password" placeholder="apify_api_…" error={errors.apify}
              hint="Unlocks LinkedIn search, company mapping and CV lookup. Without it Scout falls back to a keyless X-ray." />
          </section>

          <section className="fsec">
            <h3>Apify actors</h3>
            <p className="note">
              Defaults work as-is — change these only to swap in a different actor from{" "}
              <a href="https://apify.com/store" target="_blank" rel="noreferrer">apify.com/store</a>. Format: <code>author~actor-name</code>.
            </p>
            <Field id="apify_search_actor" label="LinkedIn candidate search" value={actors.apify_search_actor}
              onChange={(v) => setActor("apify_search_actor", v)} placeholder={ACTOR_DEFAULTS.apify_search_actor}
              hint="~$0.10 per search page." />
            <Field id="apify_profile_actor" label="LinkedIn profile + email" value={actors.apify_profile_actor}
              onChange={(v) => setActor("apify_profile_actor", v)} placeholder={ACTOR_DEFAULTS.apify_profile_actor}
              hint="~$0.02–0.10 per lookup, used by contact reveal." />
            <Field id="apify_google_actor" label="Google search" value={actors.apify_google_actor}
              onChange={(v) => setActor("apify_google_actor", v)} placeholder={ACTOR_DEFAULTS.apify_google_actor}
              hint="Near-free on the Apify free tier. Also finds candidate CVs." />
            <Field id="apify_company_actor" label="Company employees" value={actors.apify_company_actor}
              onChange={(v) => setActor("apify_company_actor", v)} placeholder={ACTOR_DEFAULTS.apify_company_actor}
              hint="$0.004–0.012 per person, used by company mapping." />
          </section>

          <section className="fsec">
            <h3>Advanced</h3>
            <CompetitorKeyField value={competitorModel} onChange={setModel} />
          </section>

          <section className="fsec">
            <h3>Stored data</h3>
            <p className="note">Removes every key above from this account. Scout stops working until you add one back.</p>
            {confirmClear ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn-danger" onClick={clearAll}>Yes, clear everything</button>
                <button className="btn-ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn-danger" onClick={() => setConfirmClear(true)}>Clear all keys</button>
            )}
          </section>
        </div>

        <div className="sheet-foot">
          {hasErrors ? <span className="sheet-dirty">Check the highlighted fields</span>
            : dirty ? <span className="sheet-dirty">Unsaved changes</span> : null}
          <span className="spacer" />
          <button className="btn-ghost" onClick={close}>Cancel</button>
          <button className="btn-pri" onClick={save} disabled={hasErrors}>Save</button>
        </div>
      </aside>
    </>
  );
}
