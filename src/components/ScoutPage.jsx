import { useState, useRef, useCallback } from "react";
import "./scout-theme.css";
import { senseFamily, gateSources, FAMILIES } from "../lib/relevanceEngine.js";
import { deriveRole, LEVEL_MAP } from "../lib/senseRole.js";
import { getStoredKey } from "../lib/storage.js";
import { proxyFetch } from "../lib/proxyFetch.js";
import { fetchUrlContent, searchLinkedInCandidates, searchGoogleResults } from "../lib/apifySearch.js";
import { searchGitHubUsers } from "../lib/github.js";
import { searchStackOverflow } from "../lib/stackoverflow.js";
import { searchHackerNewsLeads } from "../lib/hackernews.js";
import { summarizeLeads } from "../lib/summarizeLeads.js";
import { scoreBatch } from "../lib/scoreProfile.js";
import { revealContact } from "../lib/contactReveal.js";
import { getCompetitorModel } from "../lib/competitorModel.js";
import IntakePanel from "./IntakePanel.jsx";
import CandidateCard from "./CandidateCard.jsx";
import LeadCard from "./LeadCard.jsx";
import CompanyMap from "./CompanyMap.jsx";
import SourceStatus from "./SourceStatus.jsx";

// ScoutPage — the whole product on one screen. No tabs:
//   1 Search (keyword | JD link | paste JD)  ->  senseFamily
//   2 Smart intake (fortifies the spec)      ->  buildSpec/buildQuery
//   3 Profiles, scored, rendered below       ->  prefilter + scoreBatch
//   + Company mapping, as a tree, on the same page.

const HINTS = {
  kw: "Boolean supported — quoted strings, parentheses, AND / OR / NOT.",
  jd: "Works on Lever, Greenhouse, Workday, Ashby, careers pages. LinkedIn job links are blocked — use Paste.",
  paste: "Paste raw JD text — Scout senses the role family and pre-fills intake.",
};

/* prefilter/scoreProfile read title/summary/skills; the search helpers return
   `bio`/`company` instead — map across without dropping the fields that Save
   and contact-reveal need off the original object. */
const toIntakeProfile = (p) => ({
  ...p,
  title: p.title || p.bio || "",
  org: p.company || p.org || "",
  summary: p.bio || p.summary || "",
  skills: p.skills || [],
});

const SOURCE_LABEL = { github: "GitHub", linkedin: "LinkedIn", stackoverflow: "StackOverflow", hn: "Hacker News", google: "Google" };

const toCardProfile = (p) => ({
  name: p.name,
  title: p.title || p.bio || "",
  org: p.org || p.company || "",
  location: p.location,
  avatarUrl: p.avatar_url,
  url: p.profile_url,
  match: p.match,
  sources: [{ id: p.source, label: SOURCE_LABEL[p.source] || p.source, url: p.profile_url, stars: p.stars }],
  _raw: p,
});

const keyOf = (p) => `${p.source || ""}:${p.username || p.profile_url || p.name || ""}`;

/* HN's search is keyword-relevance based, so the concatenated title list
   ("software engineer senior software engineer backend engineer frontend
   engineer") matched nothing useful and hammered a rate-limited endpoint.
   One title plus the primary skill is both cheaper and more relevant. */
function leadQuery(spec) {
  const title = (spec.titles?.[0] || "").split(/\s+/).slice(0, 3).join(" ");
  const skill = spec.skills?.[0] || "";
  return [title, skill].filter(Boolean).join(" ").trim() || "hiring";
}

export default function ScoutPage() {
  const [mode, setMode] = useState("kw");
  const [raw, setRaw] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [family, setFamily] = useState(null);

  const [spec, setSpec] = useState(null);
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [searching, setSearching] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [fetchingJd, setFetchingJd] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [saved, setSaved] = useState([]);
  const [sourcesUsed, setSourcesUsed] = useState([]);
  const [sensing, setSensing] = useState(false);
  const [derived, setDerived] = useState(null);
  const [leads, setLeads] = useState([]);

  const intakeRef = useRef(null);
  const resultsRef = useRef(null);

  const scrollTo = (ref) => setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);

  /* Step 1 — sense the craft from whatever the recruiter typed/pasted. The
     instant keyword sense lands first so intake opens with no wait, then the
     LLM reading (which understands "HR lead for the engineering org") corrects
     it if they disagree. */
  async function sense() {
    const text = raw.trim();
    if (!text) return;
    setError(""); setWarning("");
    const quick = senseFamily(text);
    setFamily(quick.family || "sales");
    scrollTo(intakeRef);

    setSensing(true);
    try {
      const { family: f, derived, source } = await deriveRole(text, { provider: getStoredKey("provider_pref") || "groq" });
      setFamily(f);
      setDerived(derived);
      if (source === "keywords" && !quick.family) {
        setWarning("Couldn't confidently sense the role family — defaulted to Sales. Correct it in smart intake below.");
      }
    } finally {
      setSensing(false);
    }
  }

  async function fetchJd() {
    const url = jdUrl.trim();
    if (!url) return;
    setFetchingJd(true); setError("");
    try {
      let text = "";
      let proxyErr = null;
      try {
        const stripped = (await proxyFetch(url))
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/\s+/g, " ").trim();
        if (stripped.length < 200) throw new Error("returned too little content (likely a JS-rendered page)");
        text = stripped;
      } catch (e) { proxyErr = e; }

      if (proxyErr && getStoredKey("apify")) text = await fetchUrlContent(url);
      else if (proxyErr) {
        throw new Error(/linkedin\.com/i.test(url)
          ? "LinkedIn job pages block fetching. Copy the JD text and use Paste JD instead, or add an Apify token in Settings."
          : `Couldn't fetch this page (${proxyErr.message}). Paste the JD text instead, or add an Apify token in Settings.`);
      }
      const jd = text.slice(0, 8000);
      setRaw(jd);
      setMode("paste");
      setFamily(senseFamily(jd).family || "sales");
      scrollTo(intakeRef);
      setSensing(true);
      try {
        const { family: f, derived: d } = await deriveRole(jd, { provider: getStoredKey("provider_pref") || "groq" });
        setFamily(f); setDerived(d);
      } finally {
        setSensing(false);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setFetchingJd(false);
    }
  }

  /* Step 3 — the real pipeline. Fires from smart intake's Run search, so the
     spec (titles/skills/level/company) is always what gates and scores. */
  const runSearch = useCallback(async (nextSpec, _query, gated) => {
    const base = nextSpec || spec;
    if (!base) return;

    /* Fold the LLM's reading of the JD into the intake spec — its concrete
       role title and must-haves beat the family's generic title list, which
       is what the prefilter and the scorer both match against. */
    const s = { ...base };
    if (derived) {
      if (derived.role_title) s.titles = [...new Set([derived.role_title.toLowerCase(), ...s.titles])];
      if (derived.must_have?.length) s.skills = [...new Set([...derived.must_have.map((x) => String(x).toLowerCase()), ...s.skills])];
      if (derived.location) s.locations = [derived.location, ...s.locations];
      if (!s.company && derived.company) s.company = derived.company;
      if (!s.seniorities?.length && LEVEL_MAP[derived.seniority]) s.answers = { ...s.answers, level: LEVEL_MAP[derived.seniority] };
    }
    const query = s.titles?.length ? s.titles.slice(0, 4).join(" ") : raw.slice(0, 200);
    const loc = s.locations?.[0] || "India";
    const primarySkill = s.skills?.[0] || "";

    setSearching(true); setError(""); setWarning(""); setResults([]); setCount(0); setLeads([]);
    scrollTo(resultsRef);

    const warnings = [];
    let harvested = [];
    const capture = (items) => {
      const mapped = (items || []).map(toIntakeProfile);
      harvested = harvested.concat(mapped);
      setResults((prev) => [...prev, ...mapped]);
      setCount((n) => n + mapped.length);
    };

    /* Only hit the sources this craft actually lives on. Searching GitHub and
       StackOverflow for an HR business partner can only return engineers —
       which is precisely how software engineers ended up in an HR search. */
    const allow = new Set((gated || gateSources(s)).map((x) => x.id));
    const tasks = [
      allow.has("linkedin") && { label: "LinkedIn", p: searchLinkedInCandidates({ query, location: loc, maxItems: 15, timeout: 30 }) },
      allow.has("serp") || allow.has("linkedin")
        ? { label: "Google", p: searchGoogleResults({ query: `${query} ${loc} (site:linkedin.com/in OR resume OR profile)`.trim() }) }
        : null,
      allow.has("github") && { label: "GitHub", p: searchGitHubUsers({ ghLanguage: primarySkill, ghLocation: loc }) },
      allow.has("stackoverflow") && { label: "StackOverflow", p: searchStackOverflow({ ghLanguage: primarySkill, profQuery: query }) },
    ].filter(Boolean);
    setSourcesUsed(tasks.map((t) => t.label));

    /* Hacker News threads are leads, not people — fetched alongside but kept
       out of the candidate feed entirely. */
    const leadsPromise = allow.has("github")
      ? searchHackerNewsLeads({ query: leadQuery(s), mustHave: s.skills || [] }).catch(() => [])
      : Promise.resolve([]);

    await Promise.all(tasks.map(({ label, p }) => p.then(capture).catch((e) => warnings.push(`${label}: ${e.message || e}`))));
    setSearching(false);
    if (warnings.length) setWarning(warnings.join(" · "));

    leadsPromise.then(async (raw) => {
      if (!raw.length) return;
      setLeads(raw);
      setLeads(await summarizeLeads(raw, { provider: getStoredKey("provider_pref") || "groq" }));
    });

    if (!harvested.length) {
      setError("No candidates came back from any source. Check your API keys in Settings, or loosen the search.");
      return;
    }

    /* prefilter culls the wrong craft for free, then only survivors are
       LLM-scored — that gate is what stops engineers landing in an HR search. */
    setScoring(true);
    try {
      const scored = await scoreBatch(harvested, s);
      setResults(scored);
      setCount(scored.length);
      if (!scored.length) {
        setWarning(
          `All ${harvested.length} raw results were filtered out as the wrong role family — none of them were actually ${FAMILIES[s.family]?.label || s.family} people. ` +
          (getStoredKey("apify")
            ? "Try correcting the sensed family above, or loosen the intake answers."
            : "Non-technical roles live on LinkedIn: add an Apify token in Settings to search it.")
        );
      }
    } catch (e) {
      setWarning((w) => (w ? w + " · " : "") + `Scoring failed: ${e.message || e}`);
    } finally {
      setScoring(false);
    }
  }, [spec, raw, derived]);

  const toggleSave = (profile) => {
    const p = profile._raw || profile;
    setSaved((prev) => (prev.some((x) => keyOf(x) === keyOf(p)) ? prev.filter((x) => keyOf(x) !== keyOf(p)) : [...prev, p]));
  };

  const busy = searching || scoring;
  const scored = results.filter((r) => r.match);

  return (
    <>
      <div className="steps">
        <div className={"stp" + (raw ? " on" : "")}><span className="n">1</span>Search</div><span className="arw">→</span>
        <div className={"stp" + (family ? " on" : "")}><span className="n">2</span>Smart intake</div><span className="arw">→</span>
        <div className={"stp" + (results.length ? " on" : "")}><span className="n">3</span>Profiles</div>
      </div>

      {/* STEP 1 — one unified search box */}
      <div className="panel">
        <div className="ph">Search</div>
        <div className="psub">Start with keywords, a job-description link, or the JD text itself.</div>
        <div className="modes">
          {[["kw", "Keyword"], ["jd", "JD link"], ["paste", "Paste JD"]].map(([k, label]) => (
            <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{label}</button>
          ))}
        </div>

        {mode === "jd" ? (
          <div className="searchrow">
            <input placeholder="https://boards.greenhouse.io/acme/jobs/12345" value={jdUrl}
              onChange={(e) => setJdUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchJd()} />
            <button className="btn" onClick={fetchJd} disabled={fetchingJd || !jdUrl.trim()}>{fetchingJd ? "Fetching…" : "Fetch JD"}</button>
          </div>
        ) : (
          <div className="searchrow">
            {mode === "paste"
              ? <textarea rows={5} placeholder="Paste the full job description here…" value={raw} onChange={(e) => setRaw(e.target.value)} />
              : <input placeholder='("HR business partner" OR "talent acquisition") AND (Mumbai OR Pune)'
                  value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sense()} />}
            <button className="btn" onClick={sense} disabled={!raw.trim()}>{mode === "kw" ? "Find" : "Parse"}</button>
          </div>
        )}
        <div className="hintline">{HINTS[mode]}</div>
        {error && <div className="errbox">{error}</div>}
        {warning && <div className="warnbox">{warning}</div>}
      </div>

      {/* STEP 2 — smart intake fortifies the spec before anything is fetched */}
      <div ref={intakeRef}>
        {family && (
          <IntakePanel
            family={family}
            rawString={raw}
            busy={busy}
            sensing={sensing}
            derived={derived}
            callModel={getCompetitorModel()}
            onFamilyChange={setFamily}
            onSpec={setSpec}
            onRun={(s, q, gated) => runSearch(s, q, gated)}
          />
        )}
        {family && <SourceStatus spec={spec} family={family} />}
      </div>

      {/* STEP 3 — profiles, on the same page */}
      <div ref={resultsRef}>
        {busy && (
          <div className="statusbar">
            <span className="spinner" />
            {searching
              ? `Searching ${sourcesUsed.join(", ") || "sources"}…`
              : `Scoring ${results.length} candidate${results.length === 1 ? "" : "s"} against the spec…`}
          </div>
        )}

        {!busy && !results.length && family && (
          <div className="empty">
            {sourcesUsed.length
              ? "Nothing relevant survived filtering — see the note above."
              : "Run the search from smart intake — scored profiles appear here."}
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="rescount">
              <b>{count}</b> profile{count === 1 ? "" : "s"}
              {scored.length ? " · sorted by match" : " · scoring pending"}
              {saved.length ? ` · ${saved.length} saved` : ""}
            </div>
            <div className="grid">
              {results.map((p, i) => (
                <CandidateCard
                  key={keyOf(p) || i}
                  profile={toCardProfile(p)}
                  saved={saved.some((x) => keyOf(x) === keyOf(p))}
                  onOpen={(_p, url) => url && window.open(url, "_blank", "noopener,noreferrer")}
                  onSave={toggleSave}
                  onRevealEmail={(cp) => revealContact(cp._raw)}
                />
              ))}
            </div>
          </>
        )}

        {/* Community leads — threads, not people, so a separate shape */}
        {leads.length > 0 && (
          <>
            <div className="rescount"><b>{leads.length}</b> community lead{leads.length === 1 ? "" : "s"} · Hacker News</div>
            <div className="leadgrid">
              {leads.map((l) => <LeadCard key={l.id} lead={l} />)}
            </div>
          </>
        )}
      </div>

      {/* Company mapping — same page, contrasting panel, org tree */}
      <CompanyMap family={family} seedCompany={derived?.company || ""} roleTitle={derived?.role_title || ""} />
    </>
  );
}
