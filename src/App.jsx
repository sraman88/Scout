import { useState, useEffect } from "react";
import { injectFonts } from "./theme.js";
import { getStoredKey, setStoredKey } from "./lib/storage.js";
import { proxyFetch } from "./lib/proxyFetch.js";
import { llmCall } from "./lib/llm.js";
import { ghEmailLookup, searchGitHubUsers } from "./lib/github.js";
import { searchStackOverflow } from "./lib/stackoverflow.js";
import { searchHackerNews, hnUserLookup } from "./lib/hackernews.js";
import { redditLookup, devtoLookup, buildXRayQuery, buildEmailXRays } from "./lib/social.js";
import { scrapeLinkedInProfile } from "./lib/apify.js";
import { searchLinkedInCandidates, searchGoogleResults, fetchUrlContent } from "./lib/apifySearch.js";
import { Header } from "./components/Header.jsx";
import { Tabs } from "./components/Tabs.jsx";
import { ContextBar } from "./components/ContextBar.jsx";
import { SettingsModal } from "./components/SettingsModal.jsx";
import { Footer } from "./components/ui.jsx";
import { JDIntelTab } from "./tabs/JDIntelTab.jsx";
import { ProfileFinderTab } from "./tabs/ProfileFinderTab.jsx";
import { EmailFinderTab } from "./tabs/EmailFinderTab.jsx";
import { CompanyXRayTab } from "./tabs/CompanyXRayTab.jsx";
import { SmartIntakeTab } from "./tabs/SmartIntakeTab.jsx";
import { T, COUNTRIES, ENV_GROQ, ENV_GEMINI } from "./theme.js";

const JD_SCHEMA_PROMPT = `You are SCOUT, a recruiter intel assistant. Analyse the JD and return ONLY a JSON object.

CRITICAL: every value in "search_strings" must be a LONG STRING containing a boolean search query. NEVER the literal value true or false. NEVER the word "True". These are full sourcing queries.

Return this exact shape (values shown are EXAMPLES of the format, replace with real content):

{
  "role_title": "Senior Data Engineer",
  "seniority": "senior",
  "experience_years": "5-8",
  "must_have": ["Python", "Apache Spark", "AWS", "SQL"],
  "nice_to_have": ["Kafka", "Airflow"],
  "pool_note": "Strong pool in Bangalore but premium for Spark+AWS combo",
  "location": "Bangalore, India",
  "primary_language": "Python",
  "synonyms": {
    "Apache Spark": ["Spark", "PySpark", "Spark SQL"],
    "AWS": ["Amazon Web Services", "EC2", "S3"]
  },
  "search_strings": {
    "linkedin_basic": "(\\"data engineer\\" OR \\"senior data engineer\\") AND (Python AND Spark AND AWS) AND \\"Bangalore\\"",
    "linkedin_around": "(\\"data engineer\\") AND (Python AROUND(5) Spark) AND \\"Bangalore\\"",
    "linkedin_excludes": "(\\"data engineer\\") AND Python AND Spark NOT (intern OR fresher OR \\"looking for\\")",
    "github_users": "language:Python location:Bangalore followers:>10 created:<2021-01-01",
    "github_code": "spark pyspark language:Python in:file extension:py",
    "github_repos": "spark airflow stars:>50 language:Python",
    "stackoverflow_tags": "[apache-spark] AND [python] AND [aws]",
    "xray_linkedin": "site:linkedin.com/in (\\"data engineer\\" OR \\"senior data engineer\\") (Python AND Spark) \\"Bangalore\\"",
    "xray_github": "site:github.com (Python OR PySpark) Spark Bangalore",
    "xray_twitter": "(site:twitter.com OR site:x.com) (\\"data engineer\\" OR \\"#dataengineer\\") Python Spark Bangalore",
    "xray_resumes": "(filetype:pdf OR filetype:doc OR filetype:docx) (resume OR CV) \\"data engineer\\" Python Spark Bangalore",
    "xray_dev_to": "site:dev.to (\\"data engineer\\" OR \\"data engineering\\") Python Spark",
    "xray_naukri_india": "(site:naukri.com OR site:monsterindia.com OR site:shine.com) \\"data engineer\\" Python Spark Bangalore",
    "google_salary": "(\\"data engineer\\" OR \\"senior data engineer\\") salary Bangalore India (site:glassdoor.com OR site:ambitionbox.com OR site:levels.fyi)",
    "x_advanced_range": "(\\"data engineer\\" Python Spark) (\\"5 years\\"..\\"8 years\\") Bangalore"
  }
}

RULES:
- Every search_strings value MUST be a complete copy-pasteable boolean string
- Use AROUND() for proximity, AND/OR/NOT for logic, () for grouping
- Use range operators ("5..8 years"), site: filters, filetype:, intitle:, inurl: where useful
- Tailor LOCATION strings to the country context provided
- Return JSON only, no markdown, no commentary`;

export default function App() {
  useEffect(() => { injectFonts(); }, []);
  const [tab, setTab] = useState("jd");
  /* First-time onboarding — auto-open Settings if no keys anywhere */
  const [showSettings, setShowSettings] = useState(() => {
    const hasAnyKey = getStoredKey("groq") || getStoredKey("gemini") || ENV_GROQ || ENV_GEMINI;
    const onboarded = getStoredKey("onboarding_done");
    return !hasAnyKey && !onboarded;
  });

  const [provider, setProvider] = useState(() => getStoredKey("provider_pref") || "groq");
  function changeProvider(p) { setProvider(p); setStoredKey("provider_pref", p); }

  const [country, setCountry] = useState(() => getStoredKey("country") || "IN");
  function changeCountry(c) { setCountry(c); setStoredKey("country", c); }
  const countryObj = COUNTRIES.find((c) => c.code === country) || COUNTRIES[0];

  const [ctx, setCtx] = useState({
    role: "", seniority: "", experience_years: "",
    must_have: [], nice_to_have: [],
    location: "", language: "", pool_note: "",
    synonyms: {}, search_strings: {},
  });
  const [picked, setPicked] = useState(null);

  /* JD */
  const [jdMode, setJdMode] = useState("paste");
  const [jd, setJd] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [jdLoading, setJdLoading] = useState(false);
  const [jdResult, setJdResult] = useState(null);
  const [jdError, setJdError] = useState("");

  /* Profile Finder */
  const [profQuery, setProfQuery] = useState("");
  const [ghLocation, setGhLocation] = useState(() => COUNTRIES.find(c => c.code === (getStoredKey("country") || "IN"))?.default_loc || "");
  const [ghLanguage, setGhLanguage] = useState("");
  const [ghMinFollowers, setGhMinFollowers] = useState("");
  const [ghExpYears, setGhExpYears] = useState("");
  const [profSrc, setProfSrc] = useState("github");
  const [profResults, setProfResults] = useState([]);
  const [profLoading, setProfLoading] = useState(false);
  const [profError, setProfError] = useState("");
  const [profWarning, setProfWarning] = useState("");
  const [profFetched, setProfFetched] = useState(false);
  const [saved, setSaved] = useState([]);

  /* Email + Social */
  const [emailUser, setEmailUser] = useState("");
  const [emailFullName, setEmailFullName] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const [emailError, setEmailError] = useState("");
  const [emailLinkedInUrl, setEmailLinkedInUrl] = useState("");
  const [apifyProfLoading, setApifyProfLoading] = useState(false);
  const [apifyProfResult, setApifyProfResult] = useState(null);
  const [apifyProfError, setApifyProfError] = useState("");

  /* Overwrite all tab fields when a new JD is analysed */
  function applyCtxToAllTabs(c) {
    setProfQuery((c.must_have || []).slice(0, 4).join(" "));
    setGhLocation(c.location || countryObj.default_loc || "");
    setGhLanguage(c.language || "");
    const expMatch = String(c.experience_years || "").match(/\d+/);
    setGhExpYears(expMatch ? expMatch[0] : "");
  }

  async function analyseJD() {
    setJdError(""); setJdLoading(true); setJdResult(null);
    try {
      let text = jd;
      if (jdMode === "url") {
        if (!jdUrl.trim()) throw new Error("Paste a URL first");
        const isLI = /linkedin\.com/i.test(jdUrl);
        const url = jdUrl.trim();
        let proxyErr = null;
        try {
          const raw = await proxyFetch(url);
          const stripped = raw
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/\s+/g, " ").trim();
          if (stripped.length < 200) throw new Error("returned too little content (likely a JS-rendered page)");
          text = stripped;
        } catch (e) {
          proxyErr = e;
        }
        /* CORS-proxied plain-HTML fetch can't see JS-rendered career pages
           (Greenhouse, Lever, Workday, LinkedIn...) — fall back to a real
           headless-browser fetch via Apify if a token is configured. */
        if (proxyErr && getStoredKey("apify")) {
          try {
            text = await fetchUrlContent(url);
          } catch (e2) {
            throw new Error(`Couldn't fetch this page (proxy: ${proxyErr.message}; browser fetch: ${e2.message}). Paste the JD text instead.`, { cause: e2 });
          }
        } else if (proxyErr) {
          throw new Error(isLI
            ? "LinkedIn job pages block fetching. Copy the JD text and use Paste mode, or add an Apify token in Settings for browser-based fetching."
            : `Couldn't fetch this page (${proxyErr.message}). Paste the JD text instead, or add an Apify token in Settings for more reliable fetching of JS-rendered career pages.`, { cause: proxyErr });
        }
        if (text.length > 8000) text = text.slice(0, 8000);
      }
      if (!text.trim()) throw new Error("No JD content");

      const userPrompt = `COUNTRY: ${countryObj.name} (currency ${countryObj.currency})\nDefault location if JD silent: ${countryObj.default_loc}\n\nJOB DESCRIPTION:\n${text}`;
      const result = await llmCall(provider, JD_SCHEMA_PROMPT, userPrompt, { json: true, temperature: 0.25 });

      /* Defensive: coerce any non-string values that slipped through */
      if (result.search_strings && typeof result.search_strings === "object") {
        for (const k of Object.keys(result.search_strings)) {
          const v = result.search_strings[k];
          if (typeof v !== "string") result.search_strings[k] = String(v || "");
        }
      }

      setJdResult(result);
      const newCtx = {
        role: result.role_title || "",
        seniority: result.seniority || "",
        experience_years: result.experience_years || "",
        must_have: result.must_have || [],
        nice_to_have: result.nice_to_have || [],
        location: result.location || countryObj.default_loc,
        language: result.primary_language || "",
        pool_note: result.pool_note || "",
        synonyms: result.synonyms || {},
        search_strings: result.search_strings || {},
      };
      setCtx(newCtx);
      applyCtxToAllTabs(newCtx);

      /* Auto-advance: jump straight to Profiles with real cross-web results
         already loading, instead of requiring a manual search click. */
      const autoQuery = (newCtx.must_have || []).slice(0, 4).join(" ") || newCtx.role || "";
      const autoLocation = newCtx.location || countryObj.default_loc || "";
      setTab("profiles");
      findProfiles("auto", { query: autoQuery, location: autoLocation });
    } catch (e) {
      setJdError(e.message || String(e));
    } finally {
      setJdLoading(false);
    }
  }

  /* Same auto-advance destination as analyseJD's success path, but skips JD
     parsing/the LLM call entirely — for when there's no JD to work from. */
  function runKeywordSearch() {
    if (!profQuery.trim()) return;
    setTab("profiles");
    findProfiles("auto", { query: profQuery, location: ghLocation || countryObj.default_loc });
  }

  function updateJdField(field, value) {
    setJdResult((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateCtxField(field, value) {
    const newCtx = { ...ctx, [field]: value };
    setCtx(newCtx);
    if (field === "must_have") setProfQuery(value.slice(0, 4).join(" "));
    if (field === "location") setGhLocation(value);
    if (field === "language") setGhLanguage(value);
    if (field === "experience_years") {
      const m = String(value).match(/\d+/);
      setGhExpYears(m ? m[0] : "");
    }
  }

  /* Profile Finder */
  async function findProfiles(src, override) {
    src = src || profSrc;
    const query = override?.query ?? profQuery;
    const location = override?.location ?? ghLocation;
    setProfSrc(src); setProfError(""); setProfWarning(""); setProfLoading(true); setProfFetched(true); setProfResults([]);
    try {
      let r = [];
      const xrayParams = { profQuery: query, mustHave: ctx.must_have, ghLocation: location, ghExpYears };
      if (src === "github") r = await searchGitHubUsers({ ghLanguage, ghLocation: location, ghMinFollowers, ghExpYears });
      else if (src === "stackoverflow") r = await searchStackOverflow({ ghLanguage, profQuery: query });
      else if (src === "hackernews") r = await searchHackerNews({ profQuery: query, mustHave: ctx.must_have });
      else if (src === "linkedin-live") r = await searchLinkedInCandidates({ query, location });
      else if (src === "google-live") r = await searchGoogleResults({ query: `${query} ${location} (site:linkedin.com/in OR resume OR profile)`.trim() });
      else if (src === "auto") {
        /* Each source appends its results as soon as it resolves instead of
           waiting for all three — GitHub/Google usually answer in a few
           seconds, LinkedIn's real scrape can take much longer, and nobody
           should stare at a blank screen for a minute+ waiting on the
           slowest one. maxItems/timeout are kept small here specifically
           for the auto-triggered run; the manual "LINKEDIN (LIVE)" button
           still runs the fuller search. */
        const warnings = [];
        const tasks = [
          { label: "GitHub", p: searchGitHubUsers({ ghLanguage, ghLocation: location, ghMinFollowers, ghExpYears }) },
          { label: "LinkedIn", p: searchLinkedInCandidates({ query, location, maxItems: 10, timeout: 60 }) },
          { label: "Google", p: searchGoogleResults({ query: `${query} ${location} (site:linkedin.com/in OR resume OR profile)`.trim() }) },
        ];
        await Promise.all(tasks.map(({ label, p }) => p
          .then((items) => setProfResults((prev) => [...prev, ...items]))
          .catch((e) => warnings.push(`${label}: ${e.message || e}`))));
        if (warnings.length) setProfWarning(warnings.join(" · "));
        return;
      } else if (src === "xray-linkedin" || src === "xray-github") {
        const queries = [];
        if (src === "xray-linkedin") {
          queries.push({ label: "LinkedIn /in profiles", q: buildXRayQuery("linkedin.com", xrayParams) });
          queries.push({ label: "LinkedIn /pub (older)", q: buildXRayQuery("linkedin.com", xrayParams).replace("/in", "/pub") });
          queries.push({ label: "Naukri (India)", q: buildXRayQuery("naukri.com", xrayParams) });
          queries.push({ label: "Resumes (PDF/DOC)", q: `(filetype:pdf OR filetype:doc OR filetype:docx) (resume OR CV) ${(ctx.must_have || []).slice(0, 3).map((s) => `"${s}"`).join(" ")} ${location ? `"${location}"` : ""}` });
          queries.push({ label: "Facebook Communities", q: `site:facebook.com (group OR community OR jobs) ${(ctx.must_have || []).slice(0, 3).map((s) => `"${s}"`).join(" ")} ${location ? `"${location}"` : ""}` });
        } else {
          queries.push({ label: "GitHub profiles", q: buildXRayQuery("github.com", xrayParams) });
          queries.push({ label: "GitHub gists", q: buildXRayQuery("gist.github.com", xrayParams) });
          queries.push({ label: "Dev.to", q: buildXRayQuery("dev.to", xrayParams) });
          queries.push({ label: "Twitter / X", q: buildXRayQuery("twitter.com", xrayParams) + " OR site:x.com" });
        }
        r = queries.map((qq) => ({
          source: "xray", name: qq.label, bio: qq.q,
          profile_url: `https://www.google.com/search?q=${encodeURIComponent(qq.q)}`,
          xray_query: qq.q,
        }));
      }
      setProfResults(r);
    } catch (e) {
      setProfError(e.message || String(e));
    } finally {
      setProfLoading(false);
    }
  }

  function pickCandidate(p, goToTab) {
    setPicked(p);
    if (p.username) setEmailUser(p.username);
    if (p.name) setEmailFullName(p.name);
    if (goToTab) setTab(goToTab);

    /* Auto-scan: clicking through to Email + Social should already be
       looking up contact info, not wait for a second manual click. */
    if (goToTab === "email") {
      if (p.source === "linkedin" && p.profile_url && getStoredKey("apify")) {
        setEmailLinkedInUrl(p.profile_url);
        enrichViaApify(p.profile_url);
      } else if (p.username) {
        findEmail(p.username);
      }
    }
  }

  function saveCandidate(p) {
    if (saved.find((s) => s.username === p.username && s.source === p.source)) return;
    setSaved([...saved, p]);
  }

  /* Email + Social */
  async function findEmail(userOverride) {
    setEmailError(""); setEmailLoading(true); setEmailResult(null);
    try {
      const u = (userOverride || emailUser).trim();
      if (!u) throw new Error("Enter a username");
      const [gh, rd, dv, hn] = await Promise.all([
        ghEmailLookup(u).catch((e) => ({ emails: [], profile: null, error: e.message })),
        redditLookup(u), devtoLookup(u), hnUserLookup(u),
      ]);

      const social_handles = [];
      if (gh.profile) social_handles.push({ platform: "GitHub", handle: `@${gh.profile.login}`, url: gh.profile.html_url, verified: true });
      if (gh.profile?.twitter_username) social_handles.push({ platform: "Twitter/X", handle: `@${gh.profile.twitter_username}`, url: `https://x.com/${gh.profile.twitter_username}`, verified: true });
      if (gh.profile?.blog) social_handles.push({ platform: "Website", handle: gh.profile.blog, url: gh.profile.blog.startsWith("http") ? gh.profile.blog : `https://${gh.profile.blog}`, verified: true });
      if (rd.found) social_handles.push({ platform: "Reddit", handle: `u/${u}`, url: rd.url, verified: true });
      if (dv.found) social_handles.push({ platform: "Dev.to", handle: `@${u}`, url: dv.url, verified: true });
      if (hn.found) social_handles.push({ platform: "Hacker News", handle: u, url: hn.url, verified: true });

      const xrays = buildEmailXRays(u, emailFullName);
      setEmailResult({ username: u, fullName: emailFullName, github: gh, reddit: rd, devto: dv, hn, social_handles, xrays });
    } catch (e) {
      setEmailError(e.message || String(e));
    } finally {
      setEmailLoading(false);
    }
  }

  async function enrichViaApify(inputOverride) {
    setApifyProfError(""); setApifyProfLoading(true); setApifyProfResult(null);
    try {
      const input = (inputOverride || emailLinkedInUrl || emailUser).trim();
      if (!input) throw new Error("Enter a LinkedIn URL or username");
      const profile = await scrapeLinkedInProfile(input);
      setApifyProfResult(profile);
      if (profile.name && !emailFullName) setEmailFullName(profile.name);
    } catch (e) {
      setApifyProfError(e.message || String(e));
    } finally {
      setApifyProfLoading(false);
    }
  }

  function resetCtx() {
    setCtx({ role: "", seniority: "", experience_years: "", must_have: [], nice_to_have: [], location: "", language: "", pool_note: "", synonyms: {}, search_strings: {} });
    setJdResult(null); setJd(""); setJdUrl("");
  }
  function clearPicked() { setPicked(null); }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.body, position: "relative" }}>
      <div className="scout-grid-bg" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", inset: 0, background: `radial-gradient(ellipse at top, rgba(0,229,255,0.05), transparent 60%), radial-gradient(ellipse at bottom right, rgba(168,85,247,0.04), transparent 50%)`, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1280, margin: "0 auto", padding: "24px 24px 80px" }}>
        <Header provider={provider} setProvider={changeProvider} country={country} setCountry={changeCountry} openSettings={() => setShowSettings(true)} />
        <Tabs tab={tab} setTab={setTab} ctx={ctx} picked={picked} />
        <ContextBar ctx={ctx} picked={picked} resetCtx={resetCtx} clearPicked={clearPicked} updateCtxField={updateCtxField} />

        {tab === "jd" && (<JDIntelTab jdMode={jdMode} setJdMode={setJdMode} jd={jd} setJd={setJd} jdUrl={jdUrl} setJdUrl={setJdUrl} jdLoading={jdLoading} jdResult={jdResult} jdError={jdError} analyseJD={analyseJD} setTab={setTab} updateCtxField={updateCtxField} updateJdField={updateJdField} profQuery={profQuery} setProfQuery={setProfQuery} ghLocation={ghLocation} setGhLocation={setGhLocation} runKeywordSearch={runKeywordSearch} profLoading={profLoading} />)}
        {tab === "profiles" && (<ProfileFinderTab profQuery={profQuery} setProfQuery={setProfQuery} ghLocation={ghLocation} setGhLocation={setGhLocation} ghLanguage={ghLanguage} setGhLanguage={setGhLanguage} ghMinFollowers={ghMinFollowers} setGhMinFollowers={setGhMinFollowers} ghExpYears={ghExpYears} setGhExpYears={setGhExpYears} profSrc={profSrc} profResults={profResults} profLoading={profLoading} profError={profError} profWarning={profWarning} profFetched={profFetched} findProfiles={findProfiles} pickCandidate={pickCandidate} saveCandidate={saveCandidate} saved={saved} ctx={ctx} country={countryObj} />)}
        {tab === "email" && (<EmailFinderTab emailUser={emailUser} setEmailUser={setEmailUser} emailFullName={emailFullName} setEmailFullName={setEmailFullName} emailLoading={emailLoading} emailResult={emailResult} emailError={emailError} findEmail={findEmail} picked={picked} emailLinkedInUrl={emailLinkedInUrl} setEmailLinkedInUrl={setEmailLinkedInUrl} apifyProfLoading={apifyProfLoading} apifyProfResult={apifyProfResult} apifyProfError={apifyProfError} enrichViaApify={enrichViaApify} />)}
        {tab === "xray" && (<CompanyXRayTab />)}
        {tab === "smart" && (<SmartIntakeTab pickCandidate={pickCandidate} saveCandidate={saveCandidate} />)}

        <Footer />
      </div>
      {showSettings && <SettingsModal close={() => setShowSettings(false)} provider={provider} setProvider={changeProvider} />}
    </div>
  );
}
