import { useState, useEffect } from "react";

/* =========================================================
   SCOUT — Sourcing Engine v3.0
   Fixes: boolean "True" bug, blank links, API failures
   Adds: Gemini provider, country selector (India default),
         salary intel, editable context everywhere,
         social handles + web activity feed,
         AROUND/range/site/filetype boolean variants,
         runtime API key entry via Settings modal
   ========================================================= */

const ENV_GROQ = import.meta.env?.VITE_GROQ_KEY || "";
const ENV_GH = import.meta.env?.VITE_GITHUB_TOKEN || "";
const ENV_GEMINI = import.meta.env?.VITE_GEMINI_KEY || "";

/* CORS proxy fallback chain — tried in order */
const PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

const COUNTRIES = [
  { code: "IN", name: "India", currency: "INR", default_loc: "Bangalore, India" },
  { code: "US", name: "United States", currency: "USD", default_loc: "San Francisco, USA" },
  { code: "UK", name: "United Kingdom", currency: "GBP", default_loc: "London, UK" },
  { code: "DE", name: "Germany", currency: "EUR", default_loc: "Berlin, Germany" },
  { code: "SG", name: "Singapore", currency: "SGD", default_loc: "Singapore" },
  { code: "AE", name: "UAE", currency: "AED", default_loc: "Dubai, UAE" },
  { code: "CA", name: "Canada", currency: "CAD", default_loc: "Toronto, Canada" },
  { code: "AU", name: "Australia", currency: "AUD", default_loc: "Sydney, Australia" },
  { code: "GLOBAL", name: "Global", currency: "USD", default_loc: "" },
];

const T = {
  bg: "#05080F", bg2: "#080C17", bg3: "#0C1322",
  panel: "rgba(8, 12, 23, 0.7)",
  cyan: "#00E5FF", cyanDim: "rgba(0, 229, 255, 0.18)",
  purple: "#A855F7", purpleDim: "rgba(168, 85, 247, 0.20)",
  green: "#00FF88", greenDim: "rgba(0, 255, 136, 0.18)",
  amber: "#FFB800", red: "#FF4D4D",
  text: "#E8F0FF", text2: "#9AAEC6", text3: "#5A6B82", text4: "#3D4F66",
  fieldBg: "rgba(3, 6, 12, 0.85)", fieldText: "#F1F6FF",
  display: `'Syne', sans-serif`, mono: `'JetBrains Mono', monospace`, body: `'Rajdhani', sans-serif`,
};

function injectFonts() {
  if (document.getElementById("scout-fonts")) return;
  const link = document.createElement("link");
  link.id = "scout-fonts"; link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.innerHTML = `
    *,*::before,*::after{box-sizing:border-box;}
    html,body,#root{margin:0;padding:0;background:${T.bg};}
    body{font-family:${T.body};color:${T.text};}
    ::selection{background:${T.cyan};color:${T.bg};}
    ::-webkit-scrollbar{width:8px;height:8px;}
    ::-webkit-scrollbar-track{background:${T.bg2};}
    ::-webkit-scrollbar-thumb{background:${T.cyanDim};border-radius:4px;}
    input,textarea,select{font-family:${T.body};}
    button{font-family:${T.mono};cursor:pointer;}
    input::placeholder,textarea::placeholder{color:${T.text3};opacity:1;}
    input:focus,textarea:focus,select:focus{outline:none;border-color:${T.cyan}!important;box-shadow:0 0 0 1px ${T.cyanDim},0 0 12px rgba(0,229,255,0.12)!important;}
    a{color:${T.cyan};text-decoration:none;}
    a:hover{text-decoration:underline;}
    @keyframes pulse{0%,100%{opacity:.4;}50%{opacity:1;}}
    @keyframes spin{to{transform:rotate(360deg);}}
    .scout-grid-bg{background-image:linear-gradient(rgba(0,229,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.025) 1px,transparent 1px);background-size:40px 40px;}
  `;
  document.head.appendChild(style);
}

/* localStorage helpers for runtime API keys */
function getStoredKey(name) { try { return localStorage.getItem(`scout_${name}`) || ""; } catch { return ""; } }
function setStoredKey(name, value) { try { localStorage.setItem(`scout_${name}`, value); } catch {} }

/* CORS proxy chain */
async function proxyFetch(url) {
  let lastErr = null;
  for (const p of PROXIES) {
    try {
      const res = await fetch(p(url));
      if (!res.ok) { lastErr = new Error(`Proxy ${res.status}`); continue; }
      const txt = await res.text();
      if (!txt || txt.length < 50) { lastErr = new Error("Empty response"); continue; }
      return txt;
    } catch (e) { lastErr = e; continue; }
  }
  throw lastErr || new Error("All CORS proxies failed");
}

/* LLM providers */
async function callGroq(messages, opts = {}) {
  const key = getStoredKey("groq") || ENV_GROQ;
  if (!key) throw new Error("Groq key missing — open Settings (⚙) to enter it");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Groq ${res.status}: ${t.slice(0, 200)}`); }
  const data = await res.json();
  const out = data.choices?.[0]?.message?.content || "";
  return opts.json ? safeParseJSON(out) : out;
}

async function callGemini(prompt, opts = {}) {
  const key = getStoredKey("gemini") || ENV_GEMINI;
  if (!key) throw new Error("Gemini key missing — open Settings (⚙) to enter it");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`); }
  const data = await res.json();
  const out = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return opts.json ? safeParseJSON(out) : out;
}

async function llmCall(provider, system, user, opts = {}) {
  const order = provider === "gemini" ? ["gemini", "groq"] : ["groq", "gemini"];
  let lastErr = null;
  for (const prov of order) {
    try {
      if (prov === "groq") {
        return await callGroq([{ role: "system", content: system }, { role: "user", content: user }], opts);
      } else {
        return await callGemini(`${system}\n\n---\n\n${user}`, opts);
      }
    } catch (e) {
      lastErr = e;
      const hasGroq = getStoredKey("groq") || ENV_GROQ;
      const hasGem = getStoredKey("gemini") || ENV_GEMINI;
      if (prov === "groq" && !hasGem) break;
      if (prov === "gemini" && !hasGroq) break;
    }
  }
  throw lastErr || new Error("No LLM provider available");
}

function safeParseJSON(text) {
  if (!text) throw new Error("Empty response from LLM");
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); }
  catch (err) { throw new Error(`Bad JSON from LLM: ${err.message}\n\nRaw: ${text.slice(0, 400)}`); }
}

function ghHeaders() {
  const tok = getStoredKey("github") || ENV_GH;
  const h = { Accept: "application/vnd.github+json" };
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

/* ========================================================= */

export default function App() {
  useEffect(() => { injectFonts(); }, []);
  const [tab, setTab] = useState("jd");
  const [showSettings, setShowSettings] = useState(false);

  /* First-time onboarding — auto-open Settings if no keys anywhere */
  useEffect(() => {
    const hasAnyKey = getStoredKey("groq") || getStoredKey("gemini") || ENV_GROQ || ENV_GEMINI;
    const onboarded = getStoredKey("onboarding_done");
    if (!hasAnyKey && !onboarded) {
      setShowSettings(true);
    }
  }, []);

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
  const [profFetched, setProfFetched] = useState(false);
  const [saved, setSaved] = useState([]);

  /* Email */
  const [emailUser, setEmailUser] = useState("");
  const [emailFullName, setEmailFullName] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const [emailError, setEmailError] = useState("");
  const [emailLinkedInUrl, setEmailLinkedInUrl] = useState("");
  const [apifyProfLoading, setApifyProfLoading] = useState(false);
  const [apifyProfResult, setApifyProfResult] = useState(null);
  const [apifyProfError, setApifyProfError] = useState("");

  /* Outreach */
  const [outProfile, setOutProfile] = useState("");
  const [outRole, setOutRole] = useState("");
  const [outTone, setOutTone] = useState("professional");
  const [outResult, setOutResult] = useState("");
  const [outLoading, setOutLoading] = useState(false);

  /* Signals + Feed */
  const [sigUser, setSigUser] = useState("");
  const [sigLoading, setSigLoading] = useState(false);
  const [sigResult, setSigResult] = useState(null);
  const [sigError, setSigError] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedResult, setFeedResult] = useState(null);

  /* Market */
  const [mktSkill, setMktSkill] = useState("");
  const [mktLocation, setMktLocation] = useState("");
  const [mktExp, setMktExp] = useState("");
  const [mktLoading, setMktLoading] = useState(false);
  const [mktResult, setMktResult] = useState(null);
  const [mktError, setMktError] = useState("");

  /* Company Intel */
  const [ciCompany, setCiCompany] = useState("");
  const [ciLoading, setCiLoading] = useState(false);
  const [ciResult, setCiResult] = useState(null);
  const [ciError, setCiError] = useState("");
  const [ciProgress, setCiProgress] = useState("");
  const [ciUseApify, setCiUseApify] = useState(false);

  /* Overwrite all tab fields when a new JD is analysed */
  function applyCtxToAllTabs(c) {
    setProfQuery((c.must_have || []).slice(0, 4).join(" "));
    setGhLocation(c.location || countryObj.default_loc || "");
    setGhLanguage(c.language || "");
    const expMatch = String(c.experience_years || "").match(/\d+/);
    setGhExpYears(expMatch ? expMatch[0] : "");
    setMktSkill((c.must_have || [])[0] || "");
    setMktLocation(c.location || countryObj.default_loc || "");
    setMktExp(expMatch ? expMatch[0] : "");
    setOutRole(c.role || "");
  }

  useEffect(() => {
    if (!picked) return;
    if (picked.username) { setEmailUser(picked.username); setSigUser(picked.username); }
    if (picked.name) setEmailFullName(picked.name);
    if (picked.profile_text) setOutProfile(picked.profile_text);
  }, [picked]);

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

  async function analyseJD() {
    setJdError(""); setJdLoading(true); setJdResult(null);
    try {
      let text = jd;
      if (jdMode === "url") {
        if (!jdUrl.trim()) throw new Error("Paste a URL first");
        const isLI = /linkedin\.com/i.test(jdUrl);
        let raw;
        try {
          raw = await proxyFetch(jdUrl.trim());
        } catch (e) {
          throw new Error(isLI
            ? "LinkedIn job pages block fetching. Copy the JD text and use Paste mode."
            : `All 3 CORS proxies failed: ${e.message}. Paste the JD text instead.`);
        }
        text = raw
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/\s+/g, " ").trim();
        if (text.length < 200) throw new Error(isLI ? "LinkedIn blocked the fetch. Use paste mode." : "Too little content. Use paste mode.");
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
    } catch (e) {
      setJdError(e.message || String(e));
    } finally {
      setJdLoading(false);
    }
  }

  function updateCtxField(field, value) {
    const newCtx = { ...ctx, [field]: value };
    setCtx(newCtx);
    if (field === "must_have") {
      setProfQuery(value.slice(0, 4).join(" "));
      setMktSkill(value[0] || "");
    }
    if (field === "location") { setGhLocation(value); setMktLocation(value); }
    if (field === "language") setGhLanguage(value);
    if (field === "experience_years") {
      const m = String(value).match(/\d+/);
      const v = m ? m[0] : "";
      setGhExpYears(v); setMktExp(v);
    }
    if (field === "role") setOutRole(value);
  }

  /* Profile Finder */
  async function searchGitHubUsers() {
    let q = "type:user";
    if (ghLanguage) q += ` language:${ghLanguage.replace(/\s/g, "")}`;
    if (ghLocation) q += ` location:"${ghLocation}"`;
    if (ghMinFollowers) q += ` followers:>=${ghMinFollowers}`;
    if (ghExpYears) {
      const y = parseInt(ghExpYears, 10);
      if (y > 0) {
        const cut = new Date(); cut.setFullYear(cut.getFullYear() - y);
        q += ` created:<${cut.toISOString().slice(0, 10)}`;
      }
    }
    const url = `https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=20&sort=followers`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) {
      if (res.status === 403) throw new Error("GitHub rate-limited. Add a GitHub token in Settings (⚙) to get 5000 req/hour instead of 60.");
      throw new Error(`GitHub ${res.status}`);
    }
    const data = await res.json();
    const items = data.items || [];
    const enriched = await Promise.all(items.slice(0, 12).map(async (u) => {
      try {
        const r = await fetch(`https://api.github.com/users/${u.login}`, { headers: ghHeaders() });
        if (!r.ok) return null;
        const p = await r.json();
        return {
          source: "github", username: p.login, name: p.name || p.login,
          bio: p.bio || "", profile_url: p.html_url, location: p.location || "",
          company: p.company || "", blog: p.blog || "", twitter: p.twitter_username || "",
          followers: p.followers, following: p.following, public_repos: p.public_repos,
          created_at: p.created_at, avatar_url: p.avatar_url,
        };
      } catch { return null; }
    }));
    return enriched.filter(Boolean);
  }

  async function searchStackOverflow() {
    let tag = (ghLanguage || profQuery.split(/\s+/)[0] || "javascript").toLowerCase().trim();
    const tagMap = { js: "javascript", ts: "typescript", py: "python", node: "node.js", react: "reactjs", vue: "vue.js" };
    tag = tagMap[tag] || tag;
    const url = `https://api.stackexchange.com/2.3/tags/${encodeURIComponent(tag)}/top-answerers/all_time?site=stackoverflow&pagesize=20`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`StackOverflow ${res.status} — tag "${tag}" may not exist. Try a different language.`);
    const data = await res.json();
    if (data.error_id) throw new Error(`SO API: ${data.error_message || "tag not found"}`);
    if (!data.items || data.items.length === 0) throw new Error(`No top answerers found for tag "${tag}"`);
    return data.items.slice(0, 12).map((it) => ({
      source: "stackoverflow", username: String(it.user?.user_id || ""),
      name: (it.user?.display_name || "").replace(/&#39;/g, "'"),
      bio: `Score ${it.score} · Posts ${it.post_count} · Tag: ${tag}`,
      profile_url: it.user?.link || "", avatar_url: it.user?.profile_image,
    }));
  }

  async function searchHackerNews() {
    const q = profQuery || (ctx.must_have || []).join(" ") || "engineer";
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=15`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HN ${res.status}`);
    const data = await res.json();
    return (data.hits || []).slice(0, 12).map((h) => ({
      source: "hn", username: h.author || "", name: h.title || "Who's hiring",
      bio: (h.story_text || "").replace(/<[^>]+>/g, " ").slice(0, 220),
      profile_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    }));
  }

  function buildXRayQuery(site) {
    const skills = profQuery || (ctx.must_have || []).slice(0, 3).join(" ");
    const loc = ghLocation;
    let q = `site:${site}`;
    if (site.includes("linkedin")) q += "/in";
    if (skills) q += " " + skills.split(/\s+/).filter(Boolean).slice(0, 4).map((s) => `"${s}"`).join(" ");
    if (loc) q += ` "${loc}"`;
    if (ghExpYears) q += ` "${ghExpYears}+ years"`;
    return q;
  }

  async function findProfiles(src) {
    src = src || profSrc;
    setProfSrc(src); setProfError(""); setProfLoading(true); setProfFetched(true); setProfResults([]);
    try {
      let r = [];
      if (src === "github") r = await searchGitHubUsers();
      else if (src === "stackoverflow") r = await searchStackOverflow();
      else if (src === "hackernews") r = await searchHackerNews();
      else if (src === "xray-linkedin" || src === "xray-github") {
        const queries = [];
        if (src === "xray-linkedin") {
          queries.push({ label: "LinkedIn /in profiles", q: buildXRayQuery("linkedin.com") });
          queries.push({ label: "LinkedIn /pub (older)", q: buildXRayQuery("linkedin.com").replace("/in", "/pub") });
          queries.push({ label: "Naukri (India)", q: buildXRayQuery("naukri.com") });
          queries.push({ label: "Resumes (PDF/DOC)", q: `(filetype:pdf OR filetype:doc OR filetype:docx) (resume OR CV) ${(ctx.must_have || []).slice(0, 3).map((s) => `"${s}"`).join(" ")} ${ghLocation ? `"${ghLocation}"` : ""}` });
        } else {
          queries.push({ label: "GitHub profiles", q: buildXRayQuery("github.com") });
          queries.push({ label: "GitHub gists", q: buildXRayQuery("gist.github.com") });
          queries.push({ label: "Dev.to", q: buildXRayQuery("dev.to") });
          queries.push({ label: "Twitter / X", q: buildXRayQuery("twitter.com") + " OR site:x.com" });
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
    const profile_text = [
      p.name && `Name: ${p.name}`, p.username && `Username: ${p.username}`,
      p.location && `Location: ${p.location}`, p.company && `Company: ${p.company}`,
      p.bio && `Bio: ${p.bio}`, p.public_repos != null && `Public repos: ${p.public_repos}`,
      p.followers != null && `Followers: ${p.followers}`, p.blog && `Site: ${p.blog}`,
      p.twitter && `Twitter: @${p.twitter}`,
    ].filter(Boolean).join("\n");
    setPicked({ ...p, profile_text });
    if (p.username) { setEmailUser(p.username); setSigUser(p.username); }
    if (p.name) setEmailFullName(p.name);
    if (profile_text) setOutProfile(profile_text);
    if (goToTab) setTab(goToTab);
  }

  function saveCandidate(p) {
    if (saved.find((s) => s.username === p.username && s.source === p.source)) return;
    setSaved([...saved, p]);
  }

  /* Email + Social Handles */
  async function ghEmailLookup(username) {
    const found = new Set();
    let profile = null;
    try {
      const r = await fetch(`https://api.github.com/users/${username}`, { headers: ghHeaders() });
      if (r.ok) {
        profile = await r.json();
        if (profile.email && !profile.email.includes("noreply")) found.add(profile.email);
      } else if (r.status === 404) throw new Error(`GitHub user "${username}" not found`);
      else if (r.status === 403) throw new Error("GitHub rate-limited. Add a token in Settings.");
    } catch (e) { if (!profile) throw e; }
    try {
      const r = await fetch(`https://api.github.com/users/${username}/events/public?per_page=100`, { headers: ghHeaders() });
      if (r.ok) {
        const events = await r.json();
        events.forEach((ev) => {
          if (ev.type === "PushEvent" && ev.payload?.commits) {
            ev.payload.commits.forEach((c) => {
              const em = c.author?.email;
              if (em && !em.includes("noreply")) found.add(em);
            });
          }
        });
      }
    } catch {}
    try {
      const rr = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=5`, { headers: ghHeaders() });
      if (rr.ok) {
        const repos = await rr.json();
        for (const repo of repos.slice(0, 5)) {
          try {
            const cr = await fetch(`https://api.github.com/repos/${username}/${repo.name}/commits?author=${username}&per_page=3`, { headers: ghHeaders() });
            if (!cr.ok) continue;
            const commits = await cr.json();
            commits.forEach((c) => {
              const em = c.commit?.author?.email;
              if (em && !em.includes("noreply")) found.add(em);
            });
          } catch {}
        }
      }
    } catch {}
    return { emails: Array.from(found), profile };
  }

  async function redditLookup(username) {
    const out = { found: false, karma: null, age: null, subs: [], recent_posts: [], url: `https://www.reddit.com/user/${username}/` };
    try {
      const aboutRaw = await proxyFetch(`https://www.reddit.com/user/${username}/about.json`);
      const about = JSON.parse(aboutRaw);
      if (about?.data?.name) {
        out.found = true;
        out.karma = (about.data.link_karma || 0) + (about.data.comment_karma || 0);
        out.age = new Date(about.data.created_utc * 1000).getFullYear();
      }
      try {
        const submittedRaw = await proxyFetch(`https://www.reddit.com/user/${username}/submitted.json?limit=20`);
        const submitted = JSON.parse(submittedRaw);
        const subs = new Set();
        const posts = [];
        (submitted.data?.children || []).forEach((c) => {
          subs.add(c.data.subreddit);
          posts.push({ title: c.data.title, sub: c.data.subreddit, url: `https://reddit.com${c.data.permalink}`, score: c.data.score, time: new Date(c.data.created_utc * 1000).toLocaleDateString() });
        });
        out.subs = Array.from(subs).slice(0, 10);
        out.recent_posts = posts.slice(0, 5);
      } catch {}
    } catch {}
    return out;
  }

  async function devtoLookup(username) {
    const out = { found: false, posts: [], url: `https://dev.to/${username}` };
    try {
      const r = await fetch(`https://dev.to/api/articles?username=${encodeURIComponent(username)}&per_page=5`);
      if (!r.ok) return out;
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        out.found = true;
        out.posts = data.map((p) => ({ title: p.title, url: p.url, time: new Date(p.published_at).toLocaleDateString(), reactions: p.public_reactions_count }));
      }
    } catch {}
    return out;
  }

  async function hnUserLookup(username) {
    const out = { found: false, karma: null, recent: [], url: `https://news.ycombinator.com/user?id=${username}` };
    try {
      const r = await fetch(`https://hacker-news.firebaseio.com/v0/user/${username}.json`);
      if (!r.ok) return out;
      const data = await r.json();
      if (data && data.id) {
        out.found = true;
        out.karma = data.karma;
        const items = (data.submitted || []).slice(0, 5);
        for (const id of items) {
          try {
            const ir = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
            if (!ir.ok) continue;
            const item = await ir.json();
            if (item) out.recent.push({
              title: item.title || (item.text || "").replace(/<[^>]+>/g, "").slice(0, 80),
              url: `https://news.ycombinator.com/item?id=${id}`,
              time: new Date(item.time * 1000).toLocaleDateString(),
              type: item.type,
            });
          } catch {}
        }
      }
    } catch {}
    return out;
  }

  function buildEmailXRays(username, fullName) {
    const u = (username || "").trim(), n = (fullName || "").trim();
    const q = [];
    if (u) {
      q.push({ label: "username + common email domains", query: `"${u}" ("@gmail.com" OR "@outlook.com" OR "@yahoo.com" OR "@hotmail.com" OR "@protonmail.com")` });
      q.push({ label: "Reddit mentions", query: `site:reddit.com "${u}"` });
      q.push({ label: "Twitter / X mentions", query: `(site:twitter.com OR site:x.com) "${u}"` });
      q.push({ label: "Dev.to / Hashnode / Medium", query: `(site:dev.to OR site:hashnode.com OR site:medium.com OR site:substack.com) "${u}"` });
      q.push({ label: "Mastodon / Bluesky", query: `(site:mastodon.social OR site:bsky.app) "${u}"` });
      q.push({ label: "Personal sites / blogs", query: `"${u}" ("about me" OR "contact" OR "@") -site:github.com -site:linkedin.com` });
    }
    if (n) {
      q.push({ label: "full name + email", query: `"${n}" ("@gmail.com" OR "@outlook.com" OR "contact me" OR "email me")` });
      q.push({ label: "name + LinkedIn", query: `site:linkedin.com/in "${n}"` });
      q.push({ label: "name + AmbitionBox / Naukri (India)", query: `(site:ambitionbox.com OR site:naukri.com) "${n}"` });
    }
    return q;
  }

  async function findEmail() {
    setEmailError(""); setEmailLoading(true); setEmailResult(null);
    try {
      if (!emailUser.trim()) throw new Error("Enter a username");
      const u = emailUser.trim();
      const [gh, rd, dv, hn] = await Promise.all([
        ghEmailLookup(u).catch((e) => ({ emails: [], profile: null, error: e.message })),
        redditLookup(u), devtoLookup(u), hnUserLookup(u),
      ]);
      const xrays = buildEmailXRays(u, emailFullName);
      setEmailResult({ username: u, fullName: emailFullName, github: gh, reddit: rd, devto: dv, hn, xrays });
    } catch (e) {
      setEmailError(e.message || String(e));
    } finally {
      setEmailLoading(false);
    }
  }

  async function enrichViaApify() {
    setApifyProfError(""); setApifyProfLoading(true); setApifyProfResult(null);
    try {
      const input = emailLinkedInUrl.trim() || emailUser.trim();
      if (!input) throw new Error("Enter a LinkedIn URL or username");
      const profile = await scrapeLinkedInProfile(input);
      setApifyProfResult(profile);
      /* Auto-populate other fields from what we got */
      if (profile.name && !emailFullName) setEmailFullName(profile.name);
    } catch (e) {
      setApifyProfError(e.message || String(e));
    } finally {
      setApifyProfLoading(false);
    }
  }

  /* Signals + Feed */
  function timeAgo(d) {
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return d.toLocaleDateString();
  }

  async function fetchSignals() {
    setSigLoading(true); setSigResult(null); setSigError(""); setFeedResult(null);
    try {
      if (!sigUser.trim()) throw new Error("Enter a GitHub username");
      const u = sigUser.trim();
      const r = await fetch(`https://api.github.com/users/${u}/events/public?per_page=30`, { headers: ghHeaders() });
      if (!r.ok) {
        if (r.status === 404) throw new Error(`GitHub user "${u}" not found`);
        if (r.status === 403) throw new Error("GitHub rate-limited. Add a token in Settings.");
        throw new Error(`GitHub ${r.status}`);
      }
      const events = await r.json();
      const pushes = events.filter((e) => e.type === "PushEvent").length;
      const total = events.length;
      const score = pushes * 3 + total;
      const last7 = events.filter((e) => Date.now() - new Date(e.created_at).getTime() < 7 * 86400000).length;
      const profileR = await fetch(`https://api.github.com/users/${u}`, { headers: ghHeaders() });
      const profile = profileR.ok ? await profileR.json() : null;
      const reposR = await fetch(`https://api.github.com/users/${u}/repos?sort=updated&per_page=10`, { headers: ghHeaders() });
      const langs = {};
      let repos = [];
      if (reposR.ok) {
        repos = await reposR.json();
        repos.forEach((rp) => { if (rp.language) langs[rp.language] = (langs[rp.language] || 0) + 1; });
      }
      const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
      const last = events[0]?.created_at;
      const status = score > 20 ? "HOT" : score > 5 ? "WARM" : "COLD";
      const overlap = ctx.must_have.filter((s) =>
        topLangs.some((l) => l.toLowerCase() === s.toLowerCase()) ||
        (profile?.bio || "").toLowerCase().includes(s.toLowerCase())
      );

      const feed = events.slice(0, 15).map((e) => {
        const t = new Date(e.created_at);
        const ago = timeAgo(t);
        let action = e.type.replace(/Event$/, "");
        let detail = e.repo?.name || "";
        let url = e.repo?.name ? `https://github.com/${e.repo.name}` : null;
        if (e.type === "PushEvent") {
          const cnt = e.payload?.commits?.length || 0;
          action = `Pushed ${cnt} commit${cnt === 1 ? "" : "s"} to`;
        } else if (e.type === "PullRequestEvent") {
          action = `${e.payload?.action || "did"} PR in`;
          if (e.payload?.pull_request?.html_url) url = e.payload.pull_request.html_url;
        } else if (e.type === "IssuesEvent") {
          action = `${e.payload?.action || "did"} issue in`;
          if (e.payload?.issue?.html_url) url = e.payload.issue.html_url;
        } else if (e.type === "CreateEvent") action = `Created ${e.payload?.ref_type || "thing"} in`;
        else if (e.type === "WatchEvent") action = `Starred`;
        else if (e.type === "ForkEvent") action = `Forked`;
        return { platform: "github", ago, action, detail, url };
      });

      setSigResult({ username: u, score, pushes, total, last7, topLangs, last, status, profile, overlap, repos });

      setFeedLoading(true);
      const [rd, dv, hn] = await Promise.all([redditLookup(u), devtoLookup(u), hnUserLookup(u)]);
      const social_handles = [];
      if (profile) social_handles.push({ platform: "GitHub", handle: `@${profile.login}`, url: profile.html_url, verified: true });
      if (profile?.twitter_username) social_handles.push({ platform: "Twitter/X", handle: `@${profile.twitter_username}`, url: `https://x.com/${profile.twitter_username}`, verified: true });
      if (profile?.blog) social_handles.push({ platform: "Website", handle: profile.blog, url: profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`, verified: true });
      if (rd.found) social_handles.push({ platform: "Reddit", handle: `u/${u}`, url: rd.url, verified: true });
      if (dv.found) social_handles.push({ platform: "Dev.to", handle: `@${u}`, url: dv.url, verified: true });
      if (hn.found) social_handles.push({ platform: "Hacker News", handle: u, url: hn.url, verified: true });

      const combined_feed = [...feed];
      rd.recent_posts.forEach((p) => combined_feed.push({ platform: "reddit", ago: p.time, action: `Posted in r/${p.sub} (↑${p.score})`, detail: p.title, url: p.url }));
      dv.posts.forEach((p) => combined_feed.push({ platform: "devto", ago: p.time, action: `Published (♥${p.reactions})`, detail: p.title, url: p.url }));
      hn.recent.forEach((p) => combined_feed.push({ platform: "hn", ago: p.time, action: p.type === "story" ? "Submitted story" : "Commented", detail: p.title, url: p.url }));

      setFeedResult({ social_handles, feed: combined_feed });
      setFeedLoading(false);
    } catch (e) {
      setSigError(e.message || String(e));
    } finally {
      setSigLoading(false);
    }
  }

  /* Outreach */
  async function draftOutreach() {
    setOutLoading(true); setOutResult("");
    try {
      if (!outProfile.trim()) throw new Error("Add candidate profile");
      if (!outRole.trim()) throw new Error("Add the role");
      const body = await llmCall(provider,
        `You write outreach emails for recruiters. Tone: ${outTone}. 150-200 words. No subject line. No placeholders like [Name]. Reference 1-2 specific things from the candidate profile. End with soft CTA. Never invent details.`,
        `CANDIDATE:\n${outProfile}\n\nROLE:\n${outRole}\n\nCOUNTRY: ${countryObj.name}\n\nWrite the email body only.`,
        { temperature: 0.55 });
      setOutResult(body);
    } catch (e) {
      setOutResult(`Error: ${e.message}`);
    } finally {
      setOutLoading(false);
    }
  }

  /* Market + Salary */
  async function fetchMarket() {
    setMktLoading(true); setMktResult(null); setMktError("");
    try {
      if (!mktSkill.trim()) throw new Error("Enter a skill");
      const skill = mktSkill.trim();
      const loc = mktLocation.trim() || countryObj.default_loc;

      const ghQ = `language:${skill.replace(/\s/g, "")}${loc ? ` location:"${loc}"` : ""}`;
      const ghR = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(ghQ)}&per_page=1`, { headers: ghHeaders() });
      const ghData = ghR.ok ? await ghR.json() : { total_count: 0 };

      const soR = await fetch(`https://api.stackexchange.com/2.3/tags/${encodeURIComponent(skill.toLowerCase())}/info?site=stackoverflow`);
      const soData = soR.ok ? await soR.json() : { items: [] };
      const soCount = soData.items?.[0]?.count || 0;

      const repoR = await fetch(`https://api.github.com/search/repositories?q=language:${encodeURIComponent(skill)}&sort=stars&order=desc&per_page=5`, { headers: ghHeaders() });
      const repoData = repoR.ok ? await repoR.json() : { items: [] };

      const ai = await llmCall(provider,
        `Return STRICT JSON only. No markdown. Estimate market intel + salary bands for the given skill in the given country.

Schema:
{
  "demand": "low|medium|high|very_high",
  "supply": "scarce|limited|moderate|abundant",
  "competition": "low|medium|high|very_high",
  "summary": "2-3 line market summary",
  "best_sources": ["string"],
  "tips": ["sourcing tip"],
  "salary": {
    "currency": "INR",
    "junior":     { "min": 0, "median": 0, "max": 0, "yrs": "0-2" },
    "mid":        { "min": 0, "median": 0, "max": 0, "yrs": "3-5" },
    "senior":     { "min": 0, "median": 0, "max": 0, "yrs": "6-9" },
    "lead":       { "min": 0, "median": 0, "max": 0, "yrs": "10+" },
    "notes": "Brief note on premium skills, equity, top payers etc"
  },
  "top_employers": ["Company A", "Company B"],
  "boomerang_targets": ["Recent layoff company"],
  "sources_consulted": ["AmbitionBox", "Glassdoor", "Levels.fyi"]
}

Use accurate annual base figures for the country. India: INR (absolute, e.g. 1800000 for 18 LPA). US: USD/yr. UK: GBP/yr. EU: EUR/yr.`,
        `Skill: ${skill}\nLocation: ${loc}\nCountry: ${countryObj.name} (${countryObj.currency})\nTarget experience: ${mktExp || "any"} years\nGitHub pool: ${ghData.total_count}\nSO questions: ${soCount}`,
        { json: true, temperature: 0.3 });

      setMktResult({ skill, location: loc, pool: ghData.total_count, soCount, repos: repoData.items || [], ...ai });
    } catch (e) {
      setMktError(e.message || String(e));
    } finally {
      setMktLoading(false);
    }
  }

  /* Company Intel */
  async function fetchCompanyIntel() {
    setCiLoading(true); setCiResult(null); setCiError(""); setCiProgress("");
    try {
      if (!ciCompany.trim()) throw new Error("Enter a company name");
      const co = ciCompany.trim();
      const cacheKey = `scout_ci_${co.toLowerCase()}_${ciUseApify ? "1" : "0"}`;
      const cached = getStoredKey(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.company) {
            setCiResult({ ...parsed, from_cache: true });
            setCiLoading(false);
            return;
          }
        } catch {}
      }

      /* 1. Wikipedia (free, CORS-enabled) */
      setCiProgress("Fetching Wikipedia snapshot...");
      let wiki = null;
      try {
        const wr = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(co)}`);
        if (wr.ok) {
          const wd = await wr.json();
          if (wd.type === "standard") {
            wiki = { title: wd.title, extract: wd.extract, url: wd.content_urls?.desktop?.page, thumbnail: wd.thumbnail?.source };
          }
        }
      } catch {}

      /* 2. GitHub org (free, live) */
      setCiProgress("Checking GitHub organisation...");
      let ghOrg = null;
      const slugs = [co.toLowerCase().replace(/\s+/g, ""), co.toLowerCase().replace(/\s+/g, "-")];
      for (const slug of slugs) {
        try {
          const or = await fetch(`https://api.github.com/orgs/${slug}`, { headers: ghHeaders() });
          if (or.ok) {
            const od = await or.json();
            const mr = await fetch(`https://api.github.com/orgs/${slug}/public_members?per_page=12`, { headers: ghHeaders() });
            const members = mr.ok ? await mr.json() : [];
            ghOrg = {
              name: od.name || od.login, login: od.login, url: od.html_url,
              bio: od.description || "", location: od.location || "", blog: od.blog || "",
              public_repos: od.public_repos, followers: od.followers, created_at: od.created_at,
              avatar_url: od.avatar_url,
              members: members.map((m) => ({ username: m.login, url: m.html_url, avatar_url: m.avatar_url })),
            };
            break;
          }
        } catch {}
      }

      /* 3. Apify LinkedIn company scrape (optional, paid) */
      setCiProgress(ciUseApify ? "Scraping LinkedIn via Apify..." : "Skipping Apify LinkedIn scrape...");
      let apifyLI = null;
      if (ciUseApify) {
        try {
          apifyLI = await scrapeLinkedInCompany(co);
        } catch (e) {
          apifyLI = { error: e.message };
        }
      }

      /* 4. HN mentions (free) */
      setCiProgress("Searching HN for company mentions...");
      let hnMentions = [];
      try {
        const hr = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(co)}&tags=story&hitsPerPage=8`);
        if (hr.ok) {
          const hd = await hr.json();
          hnMentions = (hd.hits || []).map((h) => ({ title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, points: h.points, date: new Date(h.created_at).toLocaleDateString() }));
        }
      } catch {}

      /* 5. LLM synthesis — hierarchy + comparables + intel */
      setCiProgress("Synthesising org chart, comparables, and salary bands with AI...");
      const wikiText = wiki?.extract || "";
      const apifyText = apifyLI && !apifyLI.error ? JSON.stringify({
        name: apifyLI.name, industry: apifyLI.industry, employeeCount: apifyLI.employeeCount,
        hq: apifyLI.headquarters, specialties: apifyLI.specialties, founded: apifyLI.founded,
      }) : "";

      const llmPrompt = `Analyse the company "${co}" for a recruiter working in ${countryObj.name}. Focus on India-specific hiring intel when country is India.

Return STRICT JSON only. No markdown. Schema:
{
  "company_summary": "2-3 line description of what they do, target market, current focus",
  "industry": "SaaS ECM / IT Services / etc",
  "hq": "Waterloo, Canada",
  "india_presence": "Bangalore (large), Hyderabad (mid), Chennai (small) — approx 5000 headcount in India",
  "typical_designations": {
    "engineering": ["Software Engineer", "Senior Software Engineer", "Staff Engineer", "Principal Engineer", "Engineering Manager", "Sr Engineering Manager", "Director of Engineering", "VP Engineering", "SVP Engineering", "CTO"],
    "product": ["Product Manager", "Sr PM", "Principal PM", "Group PM", "Director of Product", "VP Product"],
    "sales": ["Account Executive", "Sr AE", "Enterprise AE", "Sales Director", "RVP", "VP Sales", "SVP Sales"]
  },
  "org_hierarchy": [
    {"level": "C-Suite", "roles": ["CEO", "CTO", "CFO", "COO", "CRO", "CMO", "CHRO"], "people": [{"name": "Mark Barrenechea", "role": "CEO", "verify_hint": "publicly known"}]},
    {"level": "EVP/SVP", "roles": ["EVP Engineering", "SVP Sales", "SVP HR"], "people": [{"name": "Muhi Majzoub", "role": "EVP Development", "verify_hint": "publicly known"}]},
    {"level": "VP", "roles": ["VP of X", "VP of Y"], "people": []},
    {"level": "Director", "roles": ["Director of X", "Sr Director of Y"], "people": []}
  ],
  "comparable_companies": [
    {"name": "Hyland Software", "reason": "ECM competitor with similar product breadth", "hq": "Cleveland, USA", "india_hq": "Bangalore", "boomerang_potential": "medium"},
    {"name": "Box", "reason": "Cloud content management overlap", "hq": "Redwood City, USA", "india_hq": "None", "boomerang_potential": "low"}
  ],
  "salary_bands_india": {
    "currency": "INR",
    "software_engineer": {"junior": {"min": 800000, "median": 1400000, "max": 2200000}, "senior": {"min": 2500000, "median": 3800000, "max": 5500000}, "lead": {"min": 6000000, "median": 9000000, "max": 15000000}},
    "product_manager": {"junior": {"min": 1500000, "median": 2500000, "max": 3800000}, "senior": {"min": 4000000, "median": 6000000, "max": 9000000}, "lead": {"min": 10000000, "median": 15000000, "max": 25000000}},
    "sales": {"junior": {"min": 800000, "median": 1500000, "max": 2500000}, "senior": {"min": 3000000, "median": 5000000, "max": 8000000}, "lead": {"min": 10000000, "median": 18000000, "max": 40000000}},
    "notes": "Note on stock, boomerang factor, joining bonus range, notice period norms"
  },
  "hiring_signals": {
    "current_state": "actively_hiring | steady | slow_hiring | freeze | layoffs",
    "recent_news": ["Q3 layoffs of 500 globally, India spared", "Opened new Hyderabad office"],
    "growth_functions": ["AI/ML platform team", "Cloud SRE"],
    "vulnerable_functions": ["Legacy on-prem support"]
  },
  "sourcing_notes": ["Boomerang pool from Filenet acquisition is strong", "Long tenure culture — 3+ years typical", "Notice period 60-90 days"],
  "top_indian_universities_hired": ["IIT-B", "IIT-D", "NIT-Trichy", "BITS-Pilani", "IIIT-H"]
}

Use accurate current-year INR figures (India: absolute, e.g. 1400000 for 14 LPA). List real people only if you're confident they hold that role today; use empty people arrays otherwise. Comparables should be actual product/market competitors, mixed with services companies if applicable.`;

      const llmContext = `Company: ${co}
Country focus: ${countryObj.name} (${countryObj.currency})
Wikipedia summary: ${wikiText.slice(0, 1500)}
Apify LinkedIn data: ${apifyText.slice(0, 800)}
Recent HN mentions: ${hnMentions.slice(0, 3).map((h) => h.title).join(" | ")}`;

      const ai = await llmCall(provider, llmPrompt, llmContext, { json: true, temperature: 0.3 });

      /* 6. Build India X-Ray library */
      setCiProgress("Building India X-Ray query library...");
      const designations = collectDesignations(ai.typical_designations || {});
      const xraylib = buildIndiaXRayLibrary(co, designations, ai.comparable_companies || []);

      const result = {
        company: co,
        wiki, ghOrg, apifyLI, hnMentions, ai, xraylib,
        fetched_at: new Date().toISOString(),
      };

      try { setStoredKey(cacheKey, JSON.stringify(result)); } catch {}

      setCiResult(result);
    } catch (e) {
      setCiError(e.message || String(e));
    } finally {
      setCiLoading(false);
      setCiProgress("");
    }
  }

  function sendGhUserToProfiles(username) {
    /* jump to Profiles tab with a company-specific search */
    setTab("profiles");
    setProfQuery(username);
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

        {tab === "jd" && (<JDIntelTab jdMode={jdMode} setJdMode={setJdMode} jd={jd} setJd={setJd} jdUrl={jdUrl} setJdUrl={setJdUrl} jdLoading={jdLoading} jdResult={jdResult} jdError={jdError} analyseJD={analyseJD} setTab={setTab} updateCtxField={updateCtxField} />)}
        {tab === "profiles" && (<ProfileFinderTab profQuery={profQuery} setProfQuery={setProfQuery} ghLocation={ghLocation} setGhLocation={setGhLocation} ghLanguage={ghLanguage} setGhLanguage={setGhLanguage} ghMinFollowers={ghMinFollowers} setGhMinFollowers={setGhMinFollowers} ghExpYears={ghExpYears} setGhExpYears={setGhExpYears} profSrc={profSrc} profResults={profResults} profLoading={profLoading} profError={profError} profFetched={profFetched} findProfiles={findProfiles} pickCandidate={pickCandidate} saveCandidate={saveCandidate} saved={saved} ctx={ctx} country={countryObj} />)}
        {tab === "email" && (<EmailFinderTab emailUser={emailUser} setEmailUser={setEmailUser} emailFullName={emailFullName} setEmailFullName={setEmailFullName} emailLoading={emailLoading} emailResult={emailResult} emailError={emailError} findEmail={findEmail} picked={picked} setTab={setTab} setOutProfile={setOutProfile} setOutRole={setOutRole} ctx={ctx} emailLinkedInUrl={emailLinkedInUrl} setEmailLinkedInUrl={setEmailLinkedInUrl} apifyProfLoading={apifyProfLoading} apifyProfResult={apifyProfResult} apifyProfError={apifyProfError} enrichViaApify={enrichViaApify} />)}
        {tab === "outreach" && (<OutreachTab outProfile={outProfile} setOutProfile={setOutProfile} outRole={outRole} setOutRole={setOutRole} outTone={outTone} setOutTone={setOutTone} outResult={outResult} outLoading={outLoading} draftOutreach={draftOutreach} saved={saved} setPicked={setPicked} />)}
        {tab === "signals" && (<SignalsTab sigUser={sigUser} setSigUser={setSigUser} sigLoading={sigLoading} sigResult={sigResult} sigError={sigError} feedLoading={feedLoading} feedResult={feedResult} fetchSignals={fetchSignals} setTab={setTab} setOutProfile={setOutProfile} setEmailUser={setEmailUser} />)}
        {tab === "market" && (<MarketIntelTab mktSkill={mktSkill} setMktSkill={setMktSkill} mktLocation={mktLocation} setMktLocation={setMktLocation} mktExp={mktExp} setMktExp={setMktExp} mktLoading={mktLoading} mktResult={mktResult} mktError={mktError} fetchMarket={fetchMarket} ctx={ctx} country={countryObj} />)}
        {tab === "company" && (<CompanyIntelTab ciCompany={ciCompany} setCiCompany={setCiCompany} ciLoading={ciLoading} ciResult={ciResult} ciError={ciError} ciProgress={ciProgress} ciUseApify={ciUseApify} setCiUseApify={setCiUseApify} fetchCompanyIntel={fetchCompanyIntel} sendGhUserToProfiles={sendGhUserToProfiles} country={countryObj} />)}

        <Footer />
      </div>
      {showSettings && <SettingsModal close={() => setShowSettings(false)} provider={provider} setProvider={changeProvider} />}
    </div>
  );
}

/* ============== Header ============== */
function Header({ provider, setProvider, country, setCountry, openSettings }) {
  const hasGroq = !!(getStoredKey("groq") || ENV_GROQ);
  const hasGemini = !!(getStoredKey("gemini") || ENV_GEMINI);
  const hasGH = !!(getStoredKey("github") || ENV_GH);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${T.cyan}, ${T.purple})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.display, fontWeight: 800, fontSize: 22, color: T.bg, boxShadow: `0 0 24px rgba(0,229,255,0.35)` }}>S</div>
        <div>
          <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 26, letterSpacing: 1.5, color: T.text }}>SCOUT</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 2, color: T.text3, textTransform: "uppercase" }}>Sourcing Engine v3.0</div>
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
      </div>
    </div>
  );
}

/* ============== Tabs ============== */
function Tabs({ tab, setTab, ctx, picked }) {
  const tabs = [
    { k: "jd", label: "JD INTEL", badge: ctx.role ? "●" : "" },
    { k: "profiles", label: "PROFILES", badge: ctx.must_have.length ? "●" : "" },
    { k: "email", label: "EMAIL", badge: picked ? "●" : "" },
    { k: "outreach", label: "OUTREACH", badge: picked ? "●" : "" },
    { k: "signals", label: "SIGNALS + FEED", badge: picked ? "●" : "" },
    { k: "market", label: "MARKET + SALARY", badge: ctx.must_have.length ? "●" : "" },
    { k: "company", label: "COMPANY INTEL", badge: "" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, padding: 6, background: T.panel, border: `1px solid ${T.cyanDim}`, borderRadius: 12, backdropFilter: "blur(8px)", marginBottom: 14, flexWrap: "wrap" }}>
      {tabs.map((t) => {
        const active = tab === t.k;
        return (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: "1 1 130px", padding: "12px 10px", background: active ? `linear-gradient(180deg, rgba(0,229,255,0.18), rgba(0,229,255,0.06))` : "transparent", border: active ? `1px solid ${T.cyan}` : `1px solid transparent`, borderRadius: 8, color: active ? T.cyan : T.text2, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, boxShadow: active ? `inset 0 0 18px rgba(0,229,255,0.08)` : "none" }}>{t.label}{t.badge && <span style={{ marginLeft: 6, color: active ? T.cyan : T.green, fontSize: 9 }}>{t.badge}</span>}</button>
        );
      })}
    </div>
  );
}

/* ============== Editable Context Bar ============== */
function ContextBar({ ctx, picked, resetCtx, clearPicked, updateCtxField }) {
  const hasCtx = ctx.role || ctx.must_have.length;
  if (!hasCtx && !picked) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "12px 14px", background: `linear-gradient(90deg, rgba(0,229,255,0.06), rgba(168,85,247,0.04))`, border: `1px solid ${T.cyanDim}`, borderRadius: 10, marginBottom: 18, fontFamily: T.mono, fontSize: 11 }}>
      <span style={{ color: T.cyan, fontWeight: 700, letterSpacing: 2 }}>● CONTEXT (CLICK ANY TO EDIT)</span>
      {hasCtx && (
        <>
          <EditableTag label="ROLE" value={ctx.role} onSave={(v) => updateCtxField("role", v)} />
          <EditableTag label="LVL" value={ctx.seniority} onSave={(v) => updateCtxField("seniority", v)} />
          <EditableTag label="EXP" value={ctx.experience_years} onSave={(v) => updateCtxField("experience_years", v)} suffix="y" />
          <EditableTag label="LOC" value={ctx.location} onSave={(v) => updateCtxField("location", v)} />
          <EditableTag label="LANG" value={ctx.language} onSave={(v) => updateCtxField("language", v)} />
          <EditableSkills label="SKILLS" items={ctx.must_have} onSave={(arr) => updateCtxField("must_have", arr)} color={T.green} />
        </>
      )}
      {picked && <Tag label="CANDIDATE" value={picked.username || picked.name} color={T.purple} />}
      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
        {hasCtx && <button onClick={resetCtx} style={miniBtn(T.red)}>CLEAR JD</button>}
        {picked && <button onClick={clearPicked} style={miniBtn(T.amber)}>CLEAR CANDIDATE</button>}
      </div>
    </div>
  );
}

function EditableTag({ label, value, onSave, color = T.cyan, suffix = "" }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);
  if (edit) {
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft); setEdit(false); } if (e.key === "Escape") setEdit(false); }} onBlur={() => { onSave(draft); setEdit(false); }} style={{ background: T.bg, color, border: `1px solid ${color}`, borderRadius: 5, padding: "3px 7px", fontFamily: T.mono, fontSize: 11, width: 140 }} />
      </span>
    );
  }
  return (
    <button onClick={() => setEdit(true)} title="Click to edit" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", background: T.bg, border: `1px solid ${color}33`, borderRadius: 6, cursor: "pointer" }}>
      <span style={{ color: T.text3, fontSize: 9, letterSpacing: 1.5 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontFamily: T.mono, fontSize: 11 }}>{value ? value + suffix : <span style={{ color: T.text4 }}>—</span>}</span>
      <span style={{ color: T.text4, fontSize: 9 }}>✎</span>
    </button>
  );
}

function EditableSkills({ label, items, onSave, color }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState((items || []).join(", "));
  useEffect(() => { setDraft((items || []).join(", ")); }, [items]);
  if (edit) {
    return (
      <span>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft.split(",").map((s) => s.trim()).filter(Boolean)); setEdit(false); } if (e.key === "Escape") setEdit(false); }} onBlur={() => { onSave(draft.split(",").map((s) => s.trim()).filter(Boolean)); setEdit(false); }} style={{ background: T.bg, color, border: `1px solid ${color}`, borderRadius: 5, padding: "3px 7px", fontFamily: T.mono, fontSize: 11, width: 320 }} placeholder="comma-separated skills" />
      </span>
    );
  }
  return (
    <button onClick={() => setEdit(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", background: T.bg, border: `1px solid ${color}33`, borderRadius: 6, cursor: "pointer" }}>
      <span style={{ color: T.text3, fontSize: 9, letterSpacing: 1.5 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontFamily: T.mono, fontSize: 11 }}>{items.length} loaded</span>
      <span style={{ color: T.text4, fontSize: 9 }}>✎</span>
    </button>
  );
}

function Tag({ label, value, color = T.cyan }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", background: T.bg, border: `1px solid ${color}33`, borderRadius: 6 }}>
      <span style={{ color: T.text3, fontSize: 9, letterSpacing: 1.5 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontFamily: T.mono, fontSize: 11 }}>{value || "—"}</span>
    </span>
  );
}

function miniBtn(color) {
  return { padding: "4px 10px", background: "transparent", border: `1px solid ${color}66`, color, fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6 };
}

/* ============== Settings Modal ============== */
function SettingsModal({ close, provider, setProvider }) {
  const [groq, setGroq] = useState(getStoredKey("groq"));
  const [gemini, setGemini] = useState(getStoredKey("gemini"));
  const [gh, setGh] = useState(getStoredKey("github"));
  const [apify, setApify] = useState(getStoredKey("apify"));
  const [apifyActor, setApifyActor] = useState(getStoredKey("apify_actor") || "harvestapi~linkedin-company-scraper");
  const [apifyProfileActor, setApifyProfileActor] = useState(getStoredKey("apify_profile_actor") || "dev_fusion~linkedin-profile-scraper");

  function save() {
    setStoredKey("groq", groq.trim());
    setStoredKey("gemini", gemini.trim());
    setStoredKey("github", gh.trim());
    setStoredKey("apify", apify.trim());
    setStoredKey("apify_actor", apifyActor.trim());
    setStoredKey("apify_profile_actor", apifyProfileActor.trim());
    setStoredKey("onboarding_done", "1");
    close();
  }
  function clearAll() { ["groq","gemini","github","apify","apify_actor","apify_profile_actor","onboarding_done"].forEach((k) => setStoredKey(k, "")); setGroq(""); setGemini(""); setGh(""); setApify(""); }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backdropFilter: "blur(4px)" }} onClick={close}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg2, border: `1px solid ${T.cyan}`, borderRadius: 12, padding: 24, maxWidth: 540, width: "100%", boxShadow: `0 0 60px rgba(0,229,255,0.25)`, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: T.display, fontSize: 22, color: T.cyan, margin: 0 }}>⚙ Settings</h2>
          <button onClick={close} style={{ background: "transparent", border: "none", color: T.text3, fontSize: 22 }}>✕</button>
        </div>
        {!getStoredKey("onboarding_done") && (
          <div style={{ padding: 14, background: `linear-gradient(135deg, ${T.cyan}15, ${T.purple}15)`, border: `1px solid ${T.cyan}`, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 800, color: T.cyan, marginBottom: 6 }}>👋 Welcome to SCOUT</div>
            <div style={{ color: T.text, fontSize: 13, lineHeight: 1.6 }}>
              This app runs entirely in your browser — nothing is sent to a server. Your keys stay in your browser's localStorage <strong style={{ color: T.cyan }}>forever</strong> on this device. Enter them once below and SCOUT is yours.
              <br /><br />
              <strong style={{ color: T.green }}>Minimum to start:</strong> one LLM key (Groq is fastest and free).<br />
              <strong style={{ color: T.amber }}>Recommended:</strong> also add a GitHub token to lift the rate limit 60→5000/hr.<br />
              <strong style={{ color: T.purple }}>For LinkedIn scraping:</strong> add Apify token + your chosen actor IDs.
            </div>
          </div>
        )}
        <p style={{ color: T.text2, fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
          Keys stored in browser localStorage only — never sent anywhere except the official APIs. Get free keys at:<br />
          · Groq: <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a><br />
          · Gemini: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a><br />
          · GitHub: <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">github.com/settings/tokens</a> (classic token, no scopes needed)<br />
          · Apify: <a href="https://console.apify.com/account/integrations" target="_blank" rel="noreferrer">console.apify.com/account/integrations</a> ($5/mo free credit)
        </p>
        <FieldLabel>GROQ API KEY</FieldLabel>
        <TextInput type="password" value={groq} onChange={(e) => setGroq(e.target.value)} placeholder="gsk_..." />
        <FieldLabel style={{ marginTop: 10 }}>GOOGLE GEMINI API KEY</FieldLabel>
        <TextInput type="password" value={gemini} onChange={(e) => setGemini(e.target.value)} placeholder="AIza..." />
        <FieldLabel style={{ marginTop: 10 }}>GITHUB TOKEN (recommended — 60→5000/hr)</FieldLabel>
        <TextInput type="password" value={gh} onChange={(e) => setGh(e.target.value)} placeholder="ghp_..." />
        <FieldLabel style={{ marginTop: 10 }}>APIFY API TOKEN (for LinkedIn company scraping)</FieldLabel>
        <TextInput type="password" value={apify} onChange={(e) => setApify(e.target.value)} placeholder="apify_api_..." />
        <FieldLabel style={{ marginTop: 8 }}>APIFY LINKEDIN COMPANY ACTOR ID</FieldLabel>
        <TextInput value={apifyActor} onChange={(e) => setApifyActor(e.target.value)} placeholder="harvestapi~linkedin-company-scraper" />
        <FieldLabel style={{ marginTop: 8 }}>APIFY LINKEDIN PROFILE + EMAIL ACTOR ID</FieldLabel>
        <TextInput value={apifyProfileActor} onChange={(e) => setApifyProfileActor(e.target.value)} placeholder="dev_fusion~linkedin-profile-scraper" />
        <p style={{ color: T.text3, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
          Browse actors at <a href="https://apify.com/store" target="_blank" rel="noreferrer">apify.com/store</a> — search "LinkedIn company" and "LinkedIn Profile Scraper + Email". Copy the actor ID (format: <span style={{ fontFamily: T.mono, color: T.cyan }}>author~actor-name</span>). Costs ~$0.02-0.10 per lookup; free tier gives $5/mo (50-250 lookups).
        </p>
        <FieldLabel style={{ marginTop: 16 }}>PREFERRED LLM PROVIDER</FieldLabel>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setProvider("groq")} style={{ flex: 1, padding: "10px 14px", background: provider === "groq" ? T.cyan : "transparent", color: provider === "groq" ? T.bg : T.text2, border: `1px solid ${provider === "groq" ? T.cyan : T.cyanDim}`, borderRadius: 7, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>GROQ (Llama 3.3)</button>
          <button onClick={() => setProvider("gemini")} style={{ flex: 1, padding: "10px 14px", background: provider === "gemini" ? T.cyan : "transparent", color: provider === "gemini" ? T.bg : T.text2, border: `1px solid ${provider === "gemini" ? T.cyan : T.cyanDim}`, borderRadius: 7, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>GEMINI (1.5 Flash)</button>
        </div>
        <p style={{ color: T.text3, fontSize: 11, marginTop: 8 }}>If preferred provider fails, app auto-falls back to the other.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={save} style={{ flex: 1, padding: "12px 18px", background: `linear-gradient(90deg, ${T.cyan}, ${T.purple})`, color: T.bg, border: "none", borderRadius: 8, fontFamily: T.mono, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>SAVE</button>
          <button onClick={clearAll} style={{ padding: "12px 18px", background: "transparent", color: T.red, border: `1px solid ${T.red}66`, borderRadius: 8, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>CLEAR ALL</button>
        </div>
      </div>
    </div>
  );
}

/* ============== JD Intel Tab ============== */
function JDIntelTab({ jdMode, setJdMode, jd, setJd, jdUrl, setJdUrl, jdLoading, jdResult, jdError, analyseJD, setTab, updateCtxField }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Card title="JD INPUT" accent={T.cyan}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <ModeChip active={jdMode === "paste"} onClick={() => setJdMode("paste")} label="✎ PASTE JD" />
          <ModeChip active={jdMode === "url"} onClick={() => setJdMode("url")} label="🔗 FROM URL" />
        </div>
        {jdMode === "paste" ? (
          <>
            <FieldLabel>Paste the JD text</FieldLabel>
            <TextArea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste full JD..." rows={12} />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <MicroBtn onClick={() => setJd("")} color={T.text3}>CLEAR</MicroBtn>
              <MicroBtn onClick={async () => { try { setJd(await navigator.clipboard.readText()); } catch {} }} color={T.purple}>📋 PASTE FROM CLIPBOARD</MicroBtn>
            </div>
          </>
        ) : (
          <>
            <FieldLabel>Careers page or LinkedIn job URL</FieldLabel>
            <TextInput value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} placeholder="https://careers.company.com/jobs/123" />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <MicroBtn onClick={() => setJdUrl("")} color={T.text3}>CLEAR</MicroBtn>
              <MicroBtn onClick={async () => { try { setJdUrl(await navigator.clipboard.readText()); } catch {} }} color={T.purple}>📋 PASTE FROM CLIPBOARD</MicroBtn>
            </div>
            <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(255,184,0,0.06)", border: `1px solid rgba(255,184,0,0.2)`, borderRadius: 8, color: T.amber, fontSize: 12, fontFamily: T.mono, lineHeight: 1.5 }}>
              <strong>NOTE:</strong> SCOUT tries 3 CORS proxies in sequence. LinkedIn job pages usually block fetching — copy JD text and use Paste mode if URL fails. Works well on: Lever, Greenhouse, Workday, AshbyHQ, company careers pages.
            </div>
          </>
        )}
        <PrimaryBtn onClick={analyseJD} disabled={jdLoading} style={{ marginTop: 14 }}>{jdLoading ? "ANALYSING..." : "→ ANALYSE JD"}</PrimaryBtn>
        {jdError && <ErrBox>{jdError}</ErrBox>}
      </Card>

      <Card title="STRUCTURED INTEL (click any to edit)" accent={T.purple}>
        {!jdResult && !jdLoading && <Empty label="Run analysis to see structured intel" />}
        {jdLoading && <LoadingPulse />}
        {jdResult && (
          <div>
            <Row>
              <EditableStat label="ROLE" value={jdResult.role_title} onSave={(v) => { jdResult.role_title = v; updateCtxField("role", v); }} />
              <EditableStat label="LEVEL" value={jdResult.seniority} onSave={(v) => { jdResult.seniority = v; updateCtxField("seniority", v); }} />
              <EditableStat label="EXP YRS" value={jdResult.experience_years} onSave={(v) => { jdResult.experience_years = v; updateCtxField("experience_years", v); }} />
            </Row>
            <Row>
              <EditableStat label="LOCATION" value={jdResult.location} onSave={(v) => { jdResult.location = v; updateCtxField("location", v); }} />
              <EditableStat label="LANGUAGE" value={jdResult.primary_language} onSave={(v) => { jdResult.primary_language = v; updateCtxField("language", v); }} />
            </Row>
            <FieldLabel style={{ marginTop: 14 }}>MUST HAVE</FieldLabel>
            <Pills items={jdResult.must_have || []} color={T.cyan} />
            <FieldLabel style={{ marginTop: 12 }}>NICE TO HAVE</FieldLabel>
            <Pills items={jdResult.nice_to_have || []} color={T.amber} />
            {jdResult.pool_note && <div style={{ marginTop: 14, padding: 12, background: T.bg3, borderRadius: 8, border: `1px solid ${T.cyanDim}`, fontSize: 14, color: T.text2 }}><span style={{ color: T.cyan, fontWeight: 600 }}>POOL: </span>{jdResult.pool_note}</div>}
            <Divider label="QUICK ACTIONS" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <MicroBtn onClick={() => setTab("profiles")} color={T.cyan}>→ FIND PROFILES</MicroBtn>
              <MicroBtn onClick={() => setTab("market")} color={T.purple}>→ MARKET + SALARY</MicroBtn>
              <MicroBtn onClick={() => setTab("outreach")} color={T.green}>→ DRAFT OUTREACH</MicroBtn>
            </div>
          </div>
        )}
      </Card>

      {jdResult?.search_strings && Object.keys(jdResult.search_strings).length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="BOOLEAN + X-RAY STRINGS (all variants)" accent={T.green}>
            <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 10, marginBottom: 12, letterSpacing: 1.5 }}>Copy any string and paste into LinkedIn, Google, GitHub search, or your ATS.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 10 }}>
              {Object.entries(jdResult.search_strings).map(([k, v]) => {
                const value = typeof v === "string" ? v : String(v || "");
                return (
                  <div key={k} style={{ padding: 12, background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
                      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.green, letterSpacing: 1.5, fontWeight: 700 }}>{k.toUpperCase().replace(/_/g, " ")}</span>
                      <CopyBtn text={value} />
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 12, color: T.text, wordBreak: "break-word", lineHeight: 1.5 }}>{value || <span style={{ color: T.red }}>(empty — LLM returned no value)</span>}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {jdResult?.synonyms && Object.keys(jdResult.synonyms).length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="SYNONYM MAP" accent={T.amber}>
            {Object.entries(jdResult.synonyms).map(([skill, syns]) => {
              const list = Array.isArray(syns) ? syns : typeof syns === "string" ? [syns] : Object.keys(syns || {});
              return (
                <div key={skill} style={{ marginBottom: 8 }}>
                  <span style={{ color: T.cyan, fontFamily: T.mono, fontWeight: 600, marginRight: 8 }}>{skill}:</span>
                  <span style={{ color: T.text2, fontSize: 14 }}>{list.join(", ")}</span>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}

function ModeChip({ active, onClick, label }) {
  return <button onClick={onClick} style={{ padding: "8px 14px", background: active ? T.cyan : "transparent", color: active ? T.bg : T.text2, border: `1px solid ${active ? T.cyan : T.cyanDim}`, borderRadius: 6, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>{label}</button>;
}

function EditableStat({ label, value, onSave }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);
  return (
    <div style={{ padding: "10px 12px", background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 7, minHeight: 64, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.text3, letterSpacing: 2 }}>{label}</div>
      {edit ? (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft); setEdit(false); } if (e.key === "Escape") setEdit(false); }} onBlur={() => { onSave(draft); setEdit(false); }} style={{ background: "transparent", color: T.cyan, border: `1px solid ${T.cyan}`, borderRadius: 4, padding: "4px 6px", fontFamily: T.display, fontSize: 16, fontWeight: 700, marginTop: 4 }} />
      ) : (
        <div onClick={() => setEdit(true)} style={{ fontFamily: T.display, fontSize: 18, fontWeight: 700, color: T.cyan, marginTop: 4, cursor: "pointer" }} title="Click to edit">{value || "—"} <span style={{ color: T.text4, fontSize: 11 }}>✎</span></div>
      )}
    </div>
  );
}

/* ============== Profile Finder Tab ============== */
function ProfileFinderTab({ profQuery, setProfQuery, ghLocation, setGhLocation, ghLanguage, setGhLanguage, ghMinFollowers, setGhMinFollowers, ghExpYears, setGhExpYears, profSrc, profResults, profLoading, profError, profFetched, findProfiles, pickCandidate, saveCandidate, saved, ctx, country }) {
  const quickSkills = ctx.must_have.slice(0, 6);
  const indianLocations = ["Bangalore, India", "Hyderabad, India", "Pune, India", "Mumbai, India", "Chennai, India", "Delhi, India", "Gurgaon, India", "Noida, India"];
  const globalLocations = ["Remote", "San Francisco", "New York", "London", "Berlin", "Singapore", "Toronto"];
  const locs = country.code === "IN" ? indianLocations : [...globalLocations, country.default_loc].filter(Boolean);

  return (
    <div>
      <Card title="MULTI-SOURCE CANDIDATE SEARCH" accent={T.cyan}>
        <FieldLabel>Keywords / skills</FieldLabel>
        <TextArea value={profQuery} onChange={(e) => setProfQuery(e.target.value)} placeholder="python, kafka, microservices..." rows={3} />
        {quickSkills.length > 0 && (
          <>
            <FieldLabel style={{ marginTop: 8 }}>FROM JD — CLICK TO ADD</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {quickSkills.map((s) => <button key={s} onClick={() => { if (!profQuery.toLowerCase().includes(s.toLowerCase())) setProfQuery((profQuery + " " + s).trim()); }} style={chip(T.cyan)}>+ {s}</button>)}
            </div>
          </>
        )}
        <Row style={{ marginTop: 14 }}>
          <Field>
            <FieldLabel>Location</FieldLabel>
            <TextInput value={ghLocation} onChange={(e) => setGhLocation(e.target.value)} placeholder={country.default_loc} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {locs.map((l) => <button key={l} onClick={() => setGhLocation(l)} style={chip(T.purple, true)}>{l}</button>)}
            </div>
          </Field>
          <Field>
            <FieldLabel>Language</FieldLabel>
            <TextInput value={ghLanguage} onChange={(e) => setGhLanguage(e.target.value)} placeholder="Python" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {["Python", "JavaScript", "Go", "Java", "TypeScript", "Rust"].map((l) => <button key={l} onClick={() => setGhLanguage(l)} style={chip(T.purple, true)}>{l}</button>)}
            </div>
          </Field>
        </Row>
        <Row style={{ marginTop: 10 }}>
          <Field><FieldLabel>Min Followers</FieldLabel><TextInput value={ghMinFollowers} onChange={(e) => setGhMinFollowers(e.target.value)} placeholder="10" /></Field>
          <Field>
            <FieldLabel>Experience (yrs) — proxied by GitHub account age</FieldLabel>
            <TextInput value={ghExpYears} onChange={(e) => setGhExpYears(e.target.value)} placeholder="5" />
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {["2", "3", "5", "8", "10"].map((y) => <button key={y} onClick={() => setGhExpYears(y)} style={chip(T.amber, true)}>{y}+ yrs</button>)}
            </div>
          </Field>
        </Row>
        <Divider label="SELECT SOURCE" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <SourceBtn active={profSrc === "github"} onClick={() => findProfiles("github")}>● GITHUB</SourceBtn>
          <SourceBtn active={profSrc === "stackoverflow"} onClick={() => findProfiles("stackoverflow")}>● STACK OVERFLOW</SourceBtn>
          <SourceBtn active={profSrc === "hackernews"} onClick={() => findProfiles("hackernews")}>● HACKER NEWS</SourceBtn>
          <SourceBtn active={profSrc === "xray-linkedin"} onClick={() => findProfiles("xray-linkedin")}>● X-RAY LINKEDIN+</SourceBtn>
          <SourceBtn active={profSrc === "xray-github"} onClick={() => findProfiles("xray-github")}>● X-RAY GITHUB+DEV.TO+X</SourceBtn>
        </div>
        {profError && <ErrBox>{profError}</ErrBox>}
      </Card>

      {profLoading && <Card><LoadingPulse /></Card>}
      {profFetched && !profLoading && profResults.length === 0 && !profError && <Card><Empty label="No results. Try different filters or source." /></Card>}

      {profResults.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.text3, letterSpacing: 2 }}>{profResults.length} RESULTS · {profSrc.toUpperCase()}</div>
            {profSrc !== "xray-linkedin" && profSrc !== "xray-github" && <MicroBtn onClick={() => exportCSV(profResults)} color={T.green}>↓ EXPORT CSV</MicroBtn>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {profResults.map((p, i) => <ProfileCard key={i} p={p} pickCandidate={pickCandidate} saveCandidate={saveCandidate} saved={saved} />)}
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Card title={`SAVED PROFILES (${saved.length})`} accent={T.green}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
              {saved.map((p, i) => (
                <div key={i} style={{ padding: 10, background: T.bg3, border: `1px solid ${T.greenDim}`, borderRadius: 8 }}>
                  <div style={{ color: T.green, fontFamily: T.mono, fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ color: T.text3, fontSize: 11 }}>{p.username} · {p.source}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <MicroBtn color={T.cyan} onClick={() => pickCandidate(p, "email")}>EMAIL</MicroBtn>
                    <MicroBtn color={T.purple} onClick={() => pickCandidate(p, "outreach")}>OUTREACH</MicroBtn>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ProfileCard({ p, pickCandidate, saveCandidate, saved }) {
  const isSaved = saved.some((s) => s.username === p.username && s.source === p.source);
  const isXray = p.source === "xray";
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.cyanDim}`, borderRadius: 10, padding: 14, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.cyan}, transparent)` }} />
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, border: `1px solid ${T.cyanDim}` }} />
        ) : (
          <div style={{ width: 48, height: 48, background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: T.cyan, fontFamily: T.display, fontWeight: 700, fontSize: 20 }}>{(p.name || p.username || "?").slice(0, 1).toUpperCase()}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <div style={{ color: T.text, fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || p.username}</div>
            <Badge color={p.source === "github" ? T.cyan : p.source === "stackoverflow" ? T.amber : p.source === "hn" ? T.purple : T.green}>{p.source.toUpperCase()}</Badge>
          </div>
          {p.username && p.username !== p.name && <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11 }}>@{p.username}</div>}
          {p.location && <div style={{ color: T.text2, fontSize: 12, marginTop: 2 }}>📍 {p.location}</div>}
        </div>
      </div>
      {p.bio && <div style={{ color: T.text2, fontSize: 13, marginTop: 10, lineHeight: 1.4, maxHeight: 90, overflow: "hidden", wordBreak: "break-word" }}>{p.bio}</div>}
      {(p.followers != null || p.public_repos != null) && (
        <div style={{ display: "flex", gap: 12, marginTop: 10, fontFamily: T.mono, fontSize: 11, color: T.text3 }}>
          {p.followers != null && <span>★ {p.followers}</span>}
          {p.public_repos != null && <span>⬡ {p.public_repos}</span>}
          {p.created_at && <span>📅 {new Date(p.created_at).getFullYear()}</span>}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {isXray && p.xray_query && <CopyBtn text={p.xray_query} />}
        {!isXray && p.profile_url && <a href={p.profile_url} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.cyan), textDecoration: "none", display: "inline-block" }}>↗ OPEN</a>}
        {!isXray && p.username && p.source === "github" && (
          <>
            <MicroBtn color={T.green} onClick={() => pickCandidate(p, "email")}>✉ EMAIL</MicroBtn>
            <MicroBtn color={T.amber} onClick={() => pickCandidate(p, "signals")}>⚡ SIGNALS+FEED</MicroBtn>
          </>
        )}
        {!isXray && <MicroBtn color={T.purple} onClick={() => pickCandidate(p, "outreach")}>✎ OUTREACH</MicroBtn>}
        {!isXray && <MicroBtn color={isSaved ? T.text3 : T.green} onClick={() => saveCandidate(p)} disabled={isSaved}>{isSaved ? "✓ SAVED" : "💾 SAVE"}</MicroBtn>}
      </div>
    </div>
  );
}

function exportCSV(rows) {
  const cols = ["source", "name", "username", "profile_url", "location", "company", "bio", "followers", "public_repos"];
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => `"${(r[c] == null ? "" : String(r[c])).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `scout_${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ============== Email Finder Tab ============== */
function EmailFinderTab({ emailUser, setEmailUser, emailFullName, setEmailFullName, emailLoading, emailResult, emailError, findEmail, picked, setTab, setOutProfile, setOutRole, ctx, emailLinkedInUrl, setEmailLinkedInUrl, apifyProfLoading, apifyProfResult, apifyProfError, enrichViaApify }) {
  const hasApify = !!getStoredKey("apify");
  return (
    <div>
      <Card title="MULTI-SOURCE EMAIL + SOCIAL HANDLE FINDER" accent={T.green}>
        <Row>
          <Field><FieldLabel>GitHub Username / Handle</FieldLabel><TextInput value={emailUser} onChange={(e) => setEmailUser(e.target.value)} placeholder="torvalds" /></Field>
          <Field><FieldLabel>Full Name (for X-Ray)</FieldLabel><TextInput value={emailFullName} onChange={(e) => setEmailFullName(e.target.value)} placeholder="Linus Torvalds" /></Field>
        </Row>
        {picked && <div style={{ marginTop: 8, padding: "8px 12px", background: `${T.purple}11`, border: `1px solid ${T.purple}33`, borderRadius: 6, fontSize: 12, color: T.text2 }}><span style={{ color: T.purple, fontWeight: 700 }}>FROM PROFILE: </span>{picked.name} (@{picked.username}) · auto-filled</div>}
        <PrimaryBtn onClick={findEmail} disabled={emailLoading} style={{ marginTop: 14 }}>{emailLoading ? "SCANNING..." : "→ SCAN ALL SOURCES"}</PrimaryBtn>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 1.5, alignSelf: "center" }}>SCANS:</span>
          {["GitHub profile", "Push commits", "Repo commits", "Reddit", "Dev.to", "Hacker News", "X-Ray"].map((s) => <span key={s} style={{ padding: "3px 8px", background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 4, fontFamily: T.mono, fontSize: 10, color: T.text2 }}>{s}</span>)}
        </div>
        {emailError && <ErrBox>{emailError}</ErrBox>}
      </Card>

      <Card title="LINKEDIN PROFILE + EMAIL (via Apify)" accent={T.purple}>
        <div style={{ marginBottom: 10, padding: "8px 12px", background: `${T.purple}11`, border: `1px solid ${T.purpleDim}`, borderRadius: 6, color: T.text2, fontSize: 12, fontFamily: T.mono, lineHeight: 1.5 }}>
          {hasApify
            ? "Paste a LinkedIn profile URL or username → get name, headline, company, title, EMAIL, experience, education. ~$0.02-0.05 per profile from your Apify credit."
            : "Add an Apify token in Settings (⚙) to enable this. Free tier: $5/mo = ~100 profile lookups."}
        </div>
        <Row>
          <Field><FieldLabel>LinkedIn Profile URL or Username</FieldLabel><TextInput value={emailLinkedInUrl} onChange={(e) => setEmailLinkedInUrl(e.target.value)} placeholder="https://linkedin.com/in/username OR just username" /></Field>
        </Row>
        <PrimaryBtn onClick={enrichViaApify} disabled={apifyProfLoading || !hasApify} style={{ marginTop: 14 }}>
          {apifyProfLoading ? "SCRAPING LINKEDIN..." : "→ APIFY ENRICH (Profile + Email)"}
        </PrimaryBtn>
        {apifyProfError && <ErrBox>{apifyProfError}</ErrBox>}
      </Card>

      {apifyProfLoading && <Card><LoadingPulse /></Card>}

      {apifyProfResult && (
        <Card title="LINKEDIN PROFILE (Apify)" accent={T.purple}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
            {apifyProfResult.pictureUrl && <img src={apifyProfResult.pictureUrl} alt="" style={{ width: 72, height: 72, borderRadius: 10, border: `1px solid ${T.purpleDim}` }} />}
            <div style={{ flex: 1 }}>
              <div style={{ color: T.text, fontFamily: T.display, fontSize: 22, fontWeight: 700 }}>{apifyProfResult.name || "Unknown"}</div>
              {apifyProfResult.headline && <div style={{ color: T.text2, fontSize: 14, marginTop: 4 }}>{apifyProfResult.headline}</div>}
              {apifyProfResult.location && <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 12, marginTop: 4 }}>📍 {apifyProfResult.location}</div>}
              {apifyProfResult.profileUrl && <a href={apifyProfResult.profileUrl} target="_blank" rel="noreferrer" style={{ fontFamily: T.mono, fontSize: 11, marginTop: 6, display: "inline-block" }}>↗ LinkedIn Profile</a>}
            </div>
          </div>

          {apifyProfResult.emails.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <FieldLabel style={{ color: T.green }}>✉ EMAILS FOUND ({apifyProfResult.emails.length})</FieldLabel>
              {apifyProfResult.emails.map((em) => (
                <div key={em} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: `${T.green}11`, borderRadius: 6, marginBottom: 6, border: `1px solid ${T.green}55` }}>
                  <span style={{ color: T.green, fontSize: 14 }}>●</span>
                  <span style={{ color: T.text, fontFamily: T.mono, fontSize: 14, flex: 1, wordBreak: "break-all" }}>{em}</span>
                  <CopyBtn text={em} />
                  <MicroBtn color={T.purple} onClick={() => {
                    const summary = [
                      `Name: ${apifyProfResult.name}`,
                      apifyProfResult.headline && `Headline: ${apifyProfResult.headline}`,
                      apifyProfResult.currentTitle && `Title: ${apifyProfResult.currentTitle}`,
                      apifyProfResult.currentCompany && `Company: ${apifyProfResult.currentCompany}`,
                      apifyProfResult.location && `Location: ${apifyProfResult.location}`,
                      `Email: ${em}`,
                    ].filter(Boolean).join("\n");
                    setOutProfile(summary);
                    setOutRole(ctx.role || "");
                    setTab("outreach");
                  }}>OUTREACH</MicroBtn>
                </div>
              ))}
            </div>
          )}

          <Row>
            {apifyProfResult.currentCompany && <Stat label="COMPANY">{apifyProfResult.currentCompany}</Stat>}
            {apifyProfResult.currentTitle && <Stat label="TITLE">{apifyProfResult.currentTitle}</Stat>}
            {apifyProfResult.connections > 0 && <Stat label="CONNECTIONS">{apifyProfResult.connections.toLocaleString()}</Stat>}
            {apifyProfResult.followers > 0 && <Stat label="FOLLOWERS">{apifyProfResult.followers.toLocaleString()}</Stat>}
          </Row>

          {apifyProfResult.phone && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: `${T.amber}11`, border: `1px solid ${T.amber}44`, borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: T.amber, fontFamily: T.mono, fontSize: 11, fontWeight: 700 }}>PHONE:</span>
              <span style={{ color: T.text, fontFamily: T.mono, fontSize: 13 }}>{apifyProfResult.phone}</span>
              <CopyBtn text={apifyProfResult.phone} />
            </div>
          )}

          {apifyProfResult.about && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel>ABOUT</FieldLabel>
              <div style={{ padding: 12, background: T.bg3, border: `1px solid ${T.purpleDim}`, borderRadius: 7, fontSize: 13, color: T.text2, lineHeight: 1.5, maxHeight: 180, overflowY: "auto" }}>{apifyProfResult.about}</div>
            </div>
          )}

          {apifyProfResult.experience && apifyProfResult.experience.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel>EXPERIENCE ({apifyProfResult.experience.length})</FieldLabel>
              <div style={{ display: "grid", gap: 6 }}>
                {apifyProfResult.experience.slice(0, 6).map((e, i) => (
                  <div key={i} style={{ padding: 10, background: T.bg3, border: `1px solid ${T.purpleDim}`, borderRadius: 6 }}>
                    <div style={{ color: T.purple, fontFamily: T.mono, fontSize: 12, fontWeight: 700 }}>{e.title || e.jobTitle || e.position || "—"}</div>
                    <div style={{ color: T.text2, fontSize: 13 }}>{e.companyName || e.company || "—"}</div>
                    {(e.dateRange || e.duration || e.dates) && <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11, marginTop: 2 }}>{e.dateRange || e.duration || e.dates}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {apifyProfResult.education && apifyProfResult.education.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel>EDUCATION</FieldLabel>
              <Pills items={apifyProfResult.education.map((e) => e.schoolName || e.school || e.name || e.title).filter(Boolean).slice(0, 6)} color={T.cyan} />
            </div>
          )}

          {apifyProfResult.skills && apifyProfResult.skills.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel>SKILLS</FieldLabel>
              <Pills items={apifyProfResult.skills.map((s) => (typeof s === "string" ? s : s.name || s.title)).filter(Boolean).slice(0, 20)} color={T.green} />
            </div>
          )}
        </Card>
      )}

      {emailLoading && <Card><LoadingPulse /></Card>}

      {emailResult && (
        <>
          <Card title="SOCIAL HANDLES" accent={T.purple}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
              {emailResult.github.profile && <SocialHandle platform="GitHub" handle={`@${emailResult.github.profile.login}`} url={emailResult.github.profile.html_url} verified />}
              {emailResult.github.profile?.twitter_username && <SocialHandle platform="Twitter/X" handle={`@${emailResult.github.profile.twitter_username}`} url={`https://x.com/${emailResult.github.profile.twitter_username}`} verified />}
              {emailResult.github.profile?.blog && <SocialHandle platform="Website" handle={emailResult.github.profile.blog} url={emailResult.github.profile.blog.startsWith("http") ? emailResult.github.profile.blog : `https://${emailResult.github.profile.blog}`} verified />}
              {emailResult.reddit.found && <SocialHandle platform="Reddit" handle={`u/${emailResult.username}`} url={emailResult.reddit.url} verified />}
              {emailResult.devto.found && <SocialHandle platform="Dev.to" handle={`@${emailResult.username}`} url={emailResult.devto.url} verified />}
              {emailResult.hn.found && <SocialHandle platform="Hacker News" handle={emailResult.username} url={emailResult.hn.url} verified />}
            </div>
            {!emailResult.github.profile?.twitter_username && !emailResult.reddit.found && !emailResult.devto.found && !emailResult.hn.found && <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11, marginTop: 10, letterSpacing: 1 }}>○ No extra social handles auto-detected for this username. Try the X-Ray searches below.</div>}
          </Card>

          <Card title="GITHUB CARBON FOOTPRINT" accent={T.cyan}>
            {emailResult.github.profile && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                {emailResult.github.profile.avatar_url && <img src={emailResult.github.profile.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, border: `1px solid ${T.cyanDim}` }} />}
                <div>
                  <div style={{ color: T.text, fontWeight: 600 }}>{emailResult.github.profile.name || emailResult.github.profile.login}</div>
                  <div style={{ color: T.text3, fontSize: 12 }}>{emailResult.github.profile.bio}</div>
                </div>
              </div>
            )}
            {emailResult.github.error && <ErrBox>{emailResult.github.error}</ErrBox>}
            {emailResult.github.emails.length === 0 ? (
              <Empty label="No emails surfaced from GitHub commits or profile" />
            ) : (
              <div>
                <FieldLabel>EMAILS FOUND ({emailResult.github.emails.length})</FieldLabel>
                {emailResult.github.emails.map((em) => (
                  <div key={em} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.bg3, borderRadius: 6, marginBottom: 6, border: `1px solid ${T.greenDim}` }}>
                    <span style={{ color: T.green, fontSize: 14 }}>●</span>
                    <span style={{ color: T.text, fontFamily: T.mono, fontSize: 13, flex: 1, wordBreak: "break-all" }}>{em}</span>
                    <CopyBtn text={em} />
                    <MicroBtn color={T.purple} onClick={() => { setOutProfile(`Email: ${em}\n${picked?.profile_text || ""}`); setOutRole(ctx.role || ""); setTab("outreach"); }}>OUTREACH</MicroBtn>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {(emailResult.reddit.found || emailResult.devto.found || emailResult.hn.found) && (
            <Card title="OTHER PLATFORM ACTIVITY" accent={T.amber}>
              {emailResult.reddit.found && (
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel>REDDIT (u/{emailResult.username})</FieldLabel>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Stat label="KARMA">{emailResult.reddit.karma?.toLocaleString() || "—"}</Stat>
                    <Stat label="JOINED">{emailResult.reddit.age || "—"}</Stat>
                  </div>
                  {emailResult.reddit.subs.length > 0 && <div style={{ marginTop: 8 }}><span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, marginRight: 8 }}>ACTIVE IN:</span>{emailResult.reddit.subs.map((s) => <Pill key={s} color={T.amber}>r/{s}</Pill>)}</div>}
                  {emailResult.reddit.recent_posts.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {emailResult.reddit.recent_posts.map((p, i) => (
                        <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "6px 0", color: T.text2, fontSize: 13, borderBottom: `1px solid ${T.cyanDim}`, textDecoration: "none" }}>
                          <span style={{ color: T.amber, fontFamily: T.mono, fontSize: 10 }}>r/{p.sub} · {p.time}</span><br />{p.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {emailResult.devto.found && (
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel>DEV.TO ARTICLES</FieldLabel>
                  {emailResult.devto.posts.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "6px 0", color: T.text2, fontSize: 13, borderBottom: `1px solid ${T.cyanDim}`, textDecoration: "none" }}>
                      <span style={{ color: T.green, fontFamily: T.mono, fontSize: 10 }}>♥ {p.reactions} · {p.time}</span><br />{p.title}
                    </a>
                  ))}
                </div>
              )}
              {emailResult.hn.found && (
                <div>
                  <FieldLabel>HACKER NEWS (karma {emailResult.hn.karma})</FieldLabel>
                  {emailResult.hn.recent.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "6px 0", color: T.text2, fontSize: 13, borderBottom: `1px solid ${T.cyanDim}`, textDecoration: "none" }}>
                      <span style={{ color: T.purple, fontFamily: T.mono, fontSize: 10 }}>{p.type} · {p.time}</span><br />{p.title}
                    </a>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card title="X-RAY SEARCHES (copy and paste into Google)" accent={T.purple}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
              {emailResult.xrays.map((x, i) => (
                <div key={i} style={{ padding: 10, background: T.bg3, border: `1px solid ${T.purpleDim}`, borderRadius: 6, display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.purple, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>{x.label}</div>
                    <div style={{ color: T.text2, fontFamily: T.mono, fontSize: 12, wordBreak: "break-word" }}>{x.query}</div>
                  </div>
                  <CopyBtn text={x.query} />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SocialHandle({ platform, handle, url, verified }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bg3, border: `1px solid ${verified ? T.greenDim : T.cyanDim}`, borderRadius: 8, textDecoration: "none" }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: verified ? T.green : T.amber, boxShadow: `0 0 8px ${verified ? T.green : T.amber}` }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 9, letterSpacing: 1.5 }}>{platform.toUpperCase()}</div>
        <div style={{ color: T.text, fontFamily: T.mono, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{handle}</div>
      </div>
    </a>
  );
}

/* ============== Outreach Tab ============== */
function OutreachTab({ outProfile, setOutProfile, outRole, setOutRole, outTone, setOutTone, outResult, outLoading, draftOutreach, saved, setPicked }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Card title="INPUTS" accent={T.cyan}>
        <FieldLabel>Candidate profile</FieldLabel>
        <TextArea value={outProfile} onChange={(e) => setOutProfile(e.target.value)} rows={9} placeholder="Paste or auto-fill from Profiles tab..." />
        <FieldLabel style={{ marginTop: 10 }}>Role</FieldLabel>
        <TextInput value={outRole} onChange={(e) => setOutRole(e.target.value)} placeholder="Senior Backend Engineer..." />
        <FieldLabel style={{ marginTop: 10 }}>Tone</FieldLabel>
        <div style={{ display: "flex", gap: 6 }}>
          {["professional", "conversational", "brief"].map((t) => <button key={t} onClick={() => setOutTone(t)} style={{ padding: "8px 12px", background: outTone === t ? T.cyan : "transparent", color: outTone === t ? T.bg : T.text2, border: `1px solid ${outTone === t ? T.cyan : T.cyanDim}`, borderRadius: 6, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{t}</button>)}
        </div>
        <PrimaryBtn onClick={draftOutreach} disabled={outLoading} style={{ marginTop: 14 }}>{outLoading ? "DRAFTING..." : "→ DRAFT EMAIL"}</PrimaryBtn>
        {saved.length > 0 && (
          <>
            <Divider label={`SAVED (${saved.length})`} />
            <div style={{ display: "grid", gap: 6 }}>
              {saved.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: T.bg3, border: `1px solid ${T.greenDim}`, borderRadius: 6 }}>
                  <div>
                    <div style={{ color: T.green, fontFamily: T.mono, fontSize: 12 }}>{s.name}</div>
                    <div style={{ color: T.text3, fontSize: 11 }}>@{s.username}</div>
                  </div>
                  <MicroBtn color={T.cyan} onClick={() => { setPicked(s); setOutProfile([s.name && `Name: ${s.name}`, s.username && `Username: ${s.username}`, s.bio && `Bio: ${s.bio}`].filter(Boolean).join("\n")); }}>USE</MicroBtn>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="GENERATED EMAIL" accent={T.green}>
        {outLoading && <LoadingPulse />}
        {!outResult && !outLoading && <Empty label="Draft will appear here" />}
        {outResult && (
          <div>
            <div style={{ padding: 14, background: T.bg3, borderRadius: 8, border: `1px solid ${T.greenDim}`, color: T.text, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: T.body }}>{outResult}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <CopyBtn text={outResult} large />
              <MicroBtn color={T.cyan} onClick={draftOutreach}>🔄 REGENERATE</MicroBtn>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============== Signals + Feed Tab ============== */
function SignalsTab({ sigUser, setSigUser, sigLoading, sigResult, sigError, feedLoading, feedResult, fetchSignals, setTab, setOutProfile, setEmailUser }) {
  return (
    <div>
      <Card title="CANDIDATE SIGNALS + WEB ACTIVITY FEED" accent={T.amber}>
        <FieldLabel>GitHub Username</FieldLabel>
        <Row>
          <Field><TextInput value={sigUser} onChange={(e) => setSigUser(e.target.value)} placeholder="github username" /></Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <PrimaryBtn onClick={fetchSignals} disabled={sigLoading} style={{ marginTop: 0 }}>{sigLoading ? "SCANNING..." : "→ SCAN + FETCH FEED"}</PrimaryBtn>
          </div>
        </Row>
        {sigError && <ErrBox>{sigError}</ErrBox>}
      </Card>

      {sigLoading && <Card><LoadingPulse /></Card>}

      {sigResult && (
        <>
          <Card title="SIGNAL READOUT" accent={sigResult.status === "HOT" ? T.red : sigResult.status === "WARM" ? T.amber : T.text3}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ padding: "14px 22px", background: sigResult.status === "HOT" ? `${T.red}22` : sigResult.status === "WARM" ? `${T.amber}22` : `${T.text3}22`, border: `1px solid ${sigResult.status === "HOT" ? T.red : sigResult.status === "WARM" ? T.amber : T.text3}`, borderRadius: 10 }}>
                <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 800, color: sigResult.status === "HOT" ? T.red : sigResult.status === "WARM" ? T.amber : T.text3, letterSpacing: 2 }}>{sigResult.status}</div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 2 }}>SCORE {sigResult.score}</div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: T.text, fontFamily: T.display, fontSize: 20, fontWeight: 600 }}>@{sigResult.username}</div>
                {sigResult.profile?.bio && <div style={{ color: T.text2, fontSize: 14, marginTop: 4 }}>{sigResult.profile.bio}</div>}
              </div>
            </div>
            <Row>
              <Stat label="PUSHES (30d)">{sigResult.pushes}</Stat>
              <Stat label="EVENTS (30d)">{sigResult.total}</Stat>
              <Stat label="EVENTS (7d)">{sigResult.last7}</Stat>
              <Stat label="LAST ACTIVE">{sigResult.last ? new Date(sigResult.last).toLocaleDateString() : "—"}</Stat>
            </Row>
            {sigResult.topLangs.length > 0 && <><FieldLabel style={{ marginTop: 14 }}>TOP LANGUAGES</FieldLabel><Pills items={sigResult.topLangs} color={T.cyan} /></>}
            {sigResult.overlap.length > 0 && <><FieldLabel style={{ marginTop: 12 }}>OVERLAP WITH JD SKILLS</FieldLabel><Pills items={sigResult.overlap} color={T.green} /></>}
            <Divider label="ACTIONS" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <MicroBtn color={T.green} onClick={() => { setEmailUser(sigResult.username); setTab("email"); }}>✉ FIND EMAIL</MicroBtn>
              <MicroBtn color={T.purple} onClick={() => {
                setOutProfile([`Username: ${sigResult.username}`, sigResult.profile?.name && `Name: ${sigResult.profile.name}`, sigResult.profile?.bio && `Bio: ${sigResult.profile.bio}`, sigResult.profile?.location && `Location: ${sigResult.profile.location}`, sigResult.topLangs.length && `Languages: ${sigResult.topLangs.join(", ")}`, `Activity: ${sigResult.status} (score ${sigResult.score})`].filter(Boolean).join("\n"));
                setTab("outreach");
              }}>✎ DRAFT OUTREACH</MicroBtn>
              {sigResult.profile?.html_url && <a href={sigResult.profile.html_url} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.cyan), textDecoration: "none" }}>↗ OPEN GITHUB</a>}
            </div>
          </Card>

          {feedResult && feedResult.social_handles.length > 0 && (
            <Card title="SOCIAL HANDLES (verified across web)" accent={T.purple}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                {feedResult.social_handles.map((s, i) => <SocialHandle key={i} platform={s.platform} handle={s.handle} url={s.url} verified={s.verified} />)}
              </div>
            </Card>
          )}

          <Card title="WEB ACTIVITY FEED (live)" accent={T.cyan}>
            {feedLoading && <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11, padding: 10 }}>Loading extra platforms...</div>}
            {feedResult && feedResult.feed.length > 0 ? (
              <div style={{ display: "grid", gap: 6 }}>
                {feedResult.feed.map((f, i) => (
                  <a key={i} href={f.url || "#"} target={f.url ? "_blank" : undefined} rel="noreferrer" style={{ display: "flex", gap: 10, padding: "10px 12px", background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 7, textDecoration: "none", color: T.text }}>
                    <span style={{ width: 60, fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 1.5, flexShrink: 0, paddingTop: 2 }}>{f.platform.toUpperCase()}</span>
                    <span style={{ width: 80, fontFamily: T.mono, fontSize: 10, color: T.text3, flexShrink: 0, paddingTop: 2 }}>{f.ago}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                      <span style={{ color: T.cyan, fontWeight: 500 }}>{f.action}</span>{" "}
                      <span style={{ color: T.text2 }}>{f.detail}</span>
                    </span>
                  </a>
                ))}
              </div>
            ) : (!feedLoading && <Empty label="No activity feed available — GitHub only or no public activity" />)}
          </Card>
        </>
      )}
    </div>
  );
}

/* ============== Market + Salary Tab ============== */
function MarketIntelTab({ mktSkill, setMktSkill, mktLocation, setMktLocation, mktExp, setMktExp, mktLoading, mktResult, mktError, fetchMarket, ctx, country }) {
  return (
    <div>
      <Card title="MARKET INTELLIGENCE + SALARY BANDS" accent={T.purple}>
        <div style={{ marginBottom: 10, padding: "8px 12px", background: `${T.cyan}11`, border: `1px solid ${T.cyanDim}`, borderRadius: 6, color: T.text2, fontSize: 12, fontFamily: T.mono }}>
          Country: <span style={{ color: T.cyan, fontWeight: 700 }}>{country.name}</span> · Currency: <span style={{ color: T.cyan, fontWeight: 700 }}>{country.currency}</span> · Change in header to recalc
        </div>
        <Row>
          <Field>
            <FieldLabel>Skill / Language</FieldLabel>
            <TextInput value={mktSkill} onChange={(e) => setMktSkill(e.target.value)} placeholder="python" />
            {ctx.must_have.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>{ctx.must_have.slice(0, 5).map((s) => <button key={s} onClick={() => setMktSkill(s)} style={chip(T.cyan, true)}>{s}</button>)}</div>}
          </Field>
          <Field><FieldLabel>Location</FieldLabel><TextInput value={mktLocation} onChange={(e) => setMktLocation(e.target.value)} placeholder={country.default_loc} /></Field>
          <Field><FieldLabel>Target Exp (yrs)</FieldLabel><TextInput value={mktExp} onChange={(e) => setMktExp(e.target.value)} placeholder="5" /></Field>
        </Row>
        <PrimaryBtn onClick={fetchMarket} disabled={mktLoading} style={{ marginTop: 14 }}>{mktLoading ? "ANALYSING..." : "→ RUN MARKET + SALARY INTEL"}</PrimaryBtn>
        {mktError && <ErrBox>{mktError}</ErrBox>}
      </Card>

      {mktLoading && <Card><LoadingPulse /></Card>}

      {mktResult && (
        <>
          <Card title={`${mktResult.skill.toUpperCase()} · ${mktResult.location || country.name.toUpperCase()}`} accent={T.cyan}>
            <Row>
              <Stat label="POOL SIZE">{mktResult.pool?.toLocaleString() || "—"}</Stat>
              <Stat label="SO QUESTIONS">{mktResult.soCount?.toLocaleString() || "—"}</Stat>
              <Stat label="DEMAND" color={demandColor(mktResult.demand)}>{(mktResult.demand || "—").toUpperCase()}</Stat>
              <Stat label="SUPPLY" color={supplyColor(mktResult.supply)}>{(mktResult.supply || "—").toUpperCase()}</Stat>
              <Stat label="COMPETITION" color={demandColor(mktResult.competition)}>{(mktResult.competition || "—").toUpperCase()}</Stat>
            </Row>
            {mktResult.summary && <div style={{ marginTop: 14, padding: 12, background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 8, fontSize: 14, color: T.text2, lineHeight: 1.5 }}>{mktResult.summary}</div>}
          </Card>

          {mktResult.salary && (
            <Card title={`SALARY BANDS · ${mktResult.salary.currency || country.currency}`} accent={T.green}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {["junior", "mid", "senior", "lead"].map((tier) => {
                  const b = mktResult.salary[tier];
                  if (!b) return null;
                  return (
                    <div key={tier} style={{ padding: 12, background: T.bg3, border: `1px solid ${T.greenDim}`, borderRadius: 8 }}>
                      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 2 }}>{tier.toUpperCase()} · {b.yrs}</div>
                      <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 800, color: T.green, marginTop: 4 }}>{formatSalary(b.median, mktResult.salary.currency || country.currency)}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 11, color: T.text2, marginTop: 4 }}>{formatSalary(b.min, mktResult.salary.currency || country.currency)} – {formatSalary(b.max, mktResult.salary.currency || country.currency)}</div>
                    </div>
                  );
                })}
              </div>
              {mktResult.salary.notes && <div style={{ marginTop: 12, padding: 10, background: `${T.green}08`, border: `1px solid ${T.greenDim}`, borderRadius: 6, fontSize: 13, color: T.text2, lineHeight: 1.5 }}><span style={{ color: T.green, fontWeight: 700, fontFamily: T.mono, fontSize: 10, letterSpacing: 2 }}>NOTES: </span>{mktResult.salary.notes}</div>}
              {mktResult.sources_consulted && <div style={{ marginTop: 10, fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 1.5 }}>SOURCES: {mktResult.sources_consulted.join(" · ")}</div>}
            </Card>
          )}

          {mktResult.top_employers?.length > 0 && <Card title="TOP EMPLOYERS" accent={T.cyan}><Pills items={mktResult.top_employers} color={T.cyan} /></Card>}
          {mktResult.boomerang_targets?.length > 0 && <Card title="BOOMERANG TARGETS (recent layoffs)" accent={T.amber}><Pills items={mktResult.boomerang_targets} color={T.amber} /><div style={{ color: T.text3, fontFamily: T.mono, fontSize: 10, marginTop: 8, letterSpacing: 1.5 }}>Boomerang candidates = ex-employees of these firms now in market — high-conversion sourcing pool</div></Card>}
          {mktResult.best_sources?.length > 0 && <Card title="BEST SOURCES" accent={T.green}><Pills items={mktResult.best_sources} color={T.green} /></Card>}
          {mktResult.tips?.length > 0 && <Card title="SOURCING TIPS" accent={T.amber}><ul style={{ paddingLeft: 18, margin: 0 }}>{mktResult.tips.map((t, i) => <li key={i} style={{ color: T.text2, fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>{t}</li>)}</ul></Card>}
          {mktResult.repos?.length > 0 && (
            <Card title="TOP GITHUB REPOS" accent={T.cyan}>
              <div style={{ display: "grid", gap: 8 }}>
                {mktResult.repos.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 10, background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.cyan, fontFamily: T.mono, fontSize: 13, fontWeight: 600 }}>{r.full_name}</div>
                      <div style={{ color: T.text3, fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>
                    </div>
                    <span style={{ color: T.amber, fontFamily: T.mono, fontSize: 12 }}>★ {r.stargazers_count?.toLocaleString()}</span>
                    <a href={r.html_url} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.cyan), textDecoration: "none" }}>OPEN</a>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function formatSalary(n, currency) {
  if (!n || n === 0) return "—";
  if (currency === "INR") {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
    return `₹${n.toLocaleString("en-IN")}`;
  }
  if (currency === "USD") { if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`; return `$${n}`; }
  if (currency === "GBP") { if (n >= 1000) return `£${(n / 1000).toFixed(0)}k`; return `£${n}`; }
  if (currency === "EUR") { if (n >= 1000) return `€${(n / 1000).toFixed(0)}k`; return `€${n}`; }
  if (n >= 1000) return `${currency} ${(n / 1000).toFixed(0)}k`;
  return `${currency} ${n}`;
}

function demandColor(v) { if (!v) return T.text2; if (v === "very_high" || v === "high") return T.red; if (v === "medium") return T.amber; return T.green; }
function supplyColor(v) { if (!v) return T.text2; if (v === "scarce" || v === "limited") return T.red; if (v === "moderate") return T.amber; return T.green; }

/* ============== Reusable components ============== */
function Card({ title, accent = T.cyan, children, style }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.cyanDim}`, borderRadius: 12, padding: 18, marginBottom: 14, position: "relative", backdropFilter: "blur(6px)", overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      {title && <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: accent, marginBottom: 14, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}><Dot color={accent} /> {title}</div>}
      {children}
    </div>
  );
}

function Dot({ color = T.cyan }) { return <span style={{ display: "inline-block", width: 6, height: 6, background: color, borderRadius: 999, boxShadow: `0 0 8px ${color}`, animation: "pulse 1.6s ease-in-out infinite" }} />; }
function Badge({ color = T.cyan, children }) { return <span style={{ padding: "2px 7px", borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}55`, fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>{children}</span>; }
function Pill({ color = T.cyan, children }) { return <span style={{ display: "inline-block", padding: "4px 10px", background: `${color}11`, color, border: `1px solid ${color}44`, borderRadius: 999, fontSize: 12, fontWeight: 500, marginRight: 6, marginBottom: 6, fontFamily: T.mono }}>{children}</span>; }
function Pills({ items, color }) { return <div style={{ display: "flex", flexWrap: "wrap" }}>{(items || []).map((it, i) => <Pill key={i} color={color}>{it}</Pill>)}</div>; }
function FieldLabel({ children, style }) { return <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 2, color: T.text3, textTransform: "uppercase", marginBottom: 6, ...style }}>{children}</div>; }
function TextInput(props) { return <input {...props} style={{ width: "100%", padding: "10px 12px", background: T.fieldBg, color: T.fieldText, border: `1px solid ${T.cyanDim}`, borderRadius: 7, fontFamily: T.body, fontSize: 14, ...props.style }} />; }
function TextArea(props) { return <textarea {...props} style={{ width: "100%", padding: "10px 12px", background: T.fieldBg, color: T.fieldText, border: `1px solid ${T.cyanDim}`, borderRadius: 7, fontFamily: T.body, fontSize: 14, resize: "vertical", lineHeight: 1.5, ...props.style }} />; }
function Row({ children, style }) { const arr = Array.isArray(children) ? children.filter(Boolean) : [children]; return <div style={{ display: "grid", gridTemplateColumns: `repeat(${arr.length}, 1fr)`, gap: 10, ...style }}>{children}</div>; }
function Field({ children }) { return <div>{children}</div>; }
function Stat({ label, children, color = T.cyan }) {
  return (
    <div style={{ padding: "10px 12px", background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 7, minHeight: 64, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.text3, letterSpacing: 2 }}>{label}</div>
      <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 700, color, marginTop: 4 }}>{children}</div>
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, style }) {
  return <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "12px 18px", background: disabled ? T.text4 : `linear-gradient(90deg, ${T.cyan}, ${T.purple})`, color: T.bg, border: "none", borderRadius: 8, fontFamily: T.mono, fontSize: 12, fontWeight: 800, letterSpacing: 2, cursor: disabled ? "not-allowed" : "pointer", boxShadow: disabled ? "none" : `0 4px 18px rgba(0,229,255,0.25)`, ...style }}>{children}</button>;
}

function MicroBtn({ children, onClick, color = T.cyan, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: "6px 11px", background: `${color}11`, color, border: `1px solid ${color}55`, borderRadius: 6, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}

function SourceBtn({ active, onClick, children }) {
  return <button onClick={onClick} style={{ padding: "10px 14px", background: active ? `${T.cyan}22` : "transparent", color: active ? T.cyan : T.text2, border: `1px solid ${active ? T.cyan : T.cyanDim}`, borderRadius: 7, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>{children}</button>;
}

function chip(color, small) { return { padding: small ? "3px 8px" : "5px 10px", background: `${color}11`, color, border: `1px solid ${color}44`, borderRadius: 999, fontFamily: T.mono, fontSize: small ? 10 : 11, fontWeight: 600, cursor: "pointer" }; }

function CopyBtn({ text, large }) {
  const [done, setDone] = useState(false);
  return <button onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch {} }} style={{ padding: large ? "8px 14px" : "5px 10px", background: done ? T.green : "transparent", color: done ? T.bg : T.cyan, border: `1px solid ${done ? T.green : T.cyanDim}`, borderRadius: 6, fontFamily: T.mono, fontSize: large ? 11 : 10, fontWeight: 700, letterSpacing: 1.5 }}>{done ? "✓ COPIED" : "📋 COPY"}</button>;
}

function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 10px" }}>
      <div style={{ flex: 1, height: 1, background: T.cyanDim }} />
      {label && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 2 }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: T.cyanDim }} />
    </div>
  );
}

function ErrBox({ children }) { return <div style={{ marginTop: 12, padding: "10px 14px", background: `${T.red}11`, border: `1px solid ${T.red}66`, borderRadius: 7, color: T.red, fontFamily: T.mono, fontSize: 12, lineHeight: 1.5 }}>{children}</div>; }
function Empty({ label }) { return <div style={{ padding: 30, textAlign: "center", color: T.text3, fontFamily: T.mono, fontSize: 12, letterSpacing: 1.5 }}>{label}</div>; }
function LoadingPulse() { return <div style={{ padding: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}><div style={{ width: 32, height: 32, border: `2px solid ${T.cyanDim}`, borderTopColor: T.cyan, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><div style={{ fontFamily: T.mono, fontSize: 11, color: T.text3, letterSpacing: 2 }}>SCANNING...</div></div>; }
function Footer() { return <div style={{ marginTop: 30, textAlign: "center", fontFamily: T.mono, fontSize: 10, color: T.text4, letterSpacing: 2 }}>SCOUT v3.1 · LINKS ONLY · NO DATA STORED · BUILT FOR RECRUITERS WHO HUNT</div>; }

/* =========================================================
   COMPANY INTEL — Apify + Wikipedia + GitHub + LLM + India X-Ray library
   ========================================================= */

async function scrapeLinkedInCompany(companyName) {
  const token = getStoredKey("apify");
  if (!token) throw new Error("Apify token missing — open Settings and add it, or uncheck 'Use Apify' to skip LinkedIn scraping");
  const actor = (getStoredKey("apify_actor") || "harvestapi~linkedin-company-scraper").trim();
  const slug = companyName.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
  /* Different actors expect different input shapes — cover the common ones */
  const inputVariants = [
    { companyName: [slug], profileUrls: [`https://www.linkedin.com/company/${slug}`] },
    { companies: [slug] },
    { startUrls: [{ url: `https://www.linkedin.com/company/${slug}` }] },
    { queries: [companyName] },
    { url: `https://www.linkedin.com/company/${slug}` },
  ];
  let lastErr = null;
  for (const input of inputVariants) {
    try {
      const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${token}&timeout=90`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 401) throw new Error("Apify token rejected — check the token in Settings");
        if (res.status === 404) throw new Error(`Actor "${actor}" not found — verify the ID in Settings`);
        lastErr = new Error(`Apify ${res.status}: ${t.slice(0, 150)}`);
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { lastErr = new Error("Apify returned no data — actor may have failed silently"); continue; }
      const item = data[0];
      /* Normalise across actor output shapes */
      return {
        name: item.name || item.companyName || item.title || companyName,
        industry: item.industry || item.industries?.[0] || "",
        employeeCount: item.employeeCount || item.staffCount || item.companySize || item.employees || "",
        headquarters: item.headquarters || item.hq || item.location || "",
        founded: item.founded || item.foundedYear || "",
        specialties: item.specialties || item.specialities || [],
        description: item.description || item.about || "",
        followerCount: item.followerCount || item.followers || 0,
        website: item.website || item.websiteUrl || "",
        universalName: item.universalName || slug,
        url: item.url || `https://www.linkedin.com/company/${item.universalName || slug}`,
        raw: item,
      };
    } catch (e) {
      lastErr = e;
      if (e.message.includes("token") || e.message.includes("not found")) throw e;
    }
  }
  throw lastErr || new Error("All Apify input variants failed — the actor may need different input format");
}

async function scrapeLinkedInProfile(profileInput) {
  const token = getStoredKey("apify");
  if (!token) throw new Error("Apify token missing — open Settings and add it");
  const actor = (getStoredKey("apify_profile_actor") || "dev_fusion~linkedin-profile-scraper").trim();
  /* Accept either a full LinkedIn URL or just a username */
  let url = profileInput.trim();
  if (!url.startsWith("http")) {
    url = `https://www.linkedin.com/in/${url.replace(/^@/, "").replace(/\/$/, "")}`;
  }
  /* Different profile actors expect different input shapes */
  const inputVariants = [
    { profileUrls: [url] },
    { profileScraperMode: "Short", profiles: [url] },
    { urls: [url] },
    { startUrls: [{ url }] },
    { linkedinProfileUrls: [url] },
    { url },
    { username: url.split("/in/")[1]?.replace(/\/$/, "") || url },
  ];
  let lastErr = null;
  for (const input of inputVariants) {
    try {
      const apiUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${token}&timeout=120`;
      const res = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 401) throw new Error("Apify token rejected — check the token in Settings");
        if (res.status === 404) throw new Error(`Actor "${actor}" not found — verify the ID in Settings`);
        lastErr = new Error(`Apify ${res.status}: ${t.slice(0, 200)}`);
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { lastErr = new Error("Apify returned no data — try a different input format or check the profile URL"); continue; }
      const item = data[0];
      /* Normalise across actor output shapes */
      return {
        name: item.fullName || item.name || item.firstName + " " + item.lastName || "",
        firstName: item.firstName || "",
        lastName: item.lastName || "",
        headline: item.headline || item.summary || item.title || "",
        location: item.location || item.geoLocation || item.city || "",
        currentCompany: item.currentCompany || item.company || item.currentPosition?.company || item.experience?.[0]?.companyName || "",
        currentTitle: item.currentPosition?.title || item.experience?.[0]?.title || item.jobTitle || "",
        email: item.email || item.emailAddress || item.personalEmail || item.workEmail || "",
        emails: [item.email, item.emailAddress, item.personalEmail, item.workEmail, ...(item.emails || [])].filter(Boolean),
        phone: item.phone || item.phoneNumber || item.mobileNumber || "",
        profileUrl: item.profileUrl || item.linkedinUrl || item.url || url,
        connections: item.connections || item.connectionsCount || 0,
        followers: item.followers || item.followersCount || 0,
        experience: item.experience || item.positions || [],
        education: item.education || item.schools || [],
        skills: item.skills || [],
        languages: item.languages || [],
        certifications: item.certifications || [],
        about: item.about || item.summary || item.description || "",
        pictureUrl: item.pictureUrl || item.profilePicture || item.avatar || "",
        raw: item,
      };
    } catch (e) {
      lastErr = e;
      if (e.message.includes("token") || e.message.includes("not found")) throw e;
    }
  }
  throw lastErr || new Error("All Apify input variants failed — the profile actor may need a different input format");
}

function collectDesignations(map) {
  const out = new Set();
  Object.values(map || {}).forEach((arr) => (arr || []).forEach((d) => out.add(d)));
  return Array.from(out);
}

function buildIndiaXRayLibrary(company, designations, comparables) {
  const co = `"${company}"`;
  const cities = "(bengaluru OR bangalore OR hyderabad OR pune OR mumbai OR chennai OR gurgaon OR noida OR \"new delhi\" OR gurugram)";
  const compList = (comparables || []).map((c) => c.name).slice(0, 6);
  const compListStr = compList.length > 0 ? `("${compList.join('" OR "')}")` : "";

  const lib = {
    linkedin_current: {},
    linkedin_ex: {},
    linkedin_bengaluru_only: {},
    naukri_current: {},
    naukri_ex: {},
    ambitionbox: {},
    "6figr": {},
    levels_fyi: {},
    iimjobs: {},
    instahyre: {},
    hirist: {},
    cutshort: {},
    comparable_pool: {},
    hiring_signals: {},
    news: {},
  };

  const topDesignations = designations.slice(0, 12);

  topDesignations.forEach((d) => {
    const dq = `"${d}"`;
    lib.linkedin_current[d] = `site:linkedin.com/in ${co} ${dq} ${cities}`;
    lib.linkedin_ex[d] = `site:linkedin.com/in ${dq} ("ex-${company}" OR "formerly at ${company}" OR "previously ${company}") ${cities}`;
    lib.linkedin_bengaluru_only[d] = `site:linkedin.com/in ${co} ${dq} (bengaluru OR bangalore OR "BLR")`;
    lib.naukri_current[d] = `site:naukri.com/mnjuser ${dq} ${company.toLowerCase().replace(/\s+/g, "")}`;
    lib.naukri_ex[d] = `site:naukri.com ${dq} "previously at ${company}" OR "worked at ${company}"`;
    lib.iimjobs[d] = `site:iimjobs.com ${company.toLowerCase()} ${dq}`;
    lib.instahyre[d] = `site:instahyre.com ${company.toLowerCase()} ${dq}`;
    lib.hirist[d] = `site:hirist.com ${company.toLowerCase()} ${dq}`;
    lib.cutshort[d] = `site:cutshort.io ${company.toLowerCase()} ${dq}`;
    if (compListStr) {
      lib.comparable_pool[d] = `site:linkedin.com/in ${compListStr} ${dq} ${cities}`;
    }
  });

  lib.ambitionbox.company_page = `site:ambitionbox.com "${company.toLowerCase().replace(/\s+/g, "-")}-overview" OR "${company.toLowerCase().replace(/\s+/g, "-")}-salaries"`;
  lib.ambitionbox.interviews = `site:ambitionbox.com/interviews ${co}`;
  lib.ambitionbox.reviews = `site:ambitionbox.com/reviews ${co} ${cities}`;
  lib["6figr"].company_salaries = `site:6figr.com ${co}`;
  lib.levels_fyi.company_salaries = `site:levels.fyi ${co} india`;
  lib.levels_fyi.company_page = `https://www.levels.fyi/companies/${company.toLowerCase().replace(/\s+/g, "-")}/salaries`;

  lib.hiring_signals.open_roles = `site:linkedin.com/jobs ${co} india`;
  lib.hiring_signals.we_are_hiring = `site:linkedin.com/posts ${co} "we're hiring" india`;
  lib.hiring_signals.recent_joiners = `site:linkedin.com/in ${co} "just joined" OR "excited to share" ${cities}`;

  lib.news.layoffs = `${co} layoffs 2025 site:economictimes.indiatimes.com OR site:moneycontrol.com OR site:inc42.com OR site:yourstory.com`;
  lib.news.funding = `${co} funding OR acquisition 2025 site:inc42.com OR site:yourstory.com OR site:tracxn.com`;
  lib.news.india_growth = `${co} india expansion 2025 site:economictimes.indiatimes.com OR site:business-standard.com`;

  return lib;
}

function CompanyIntelTab({ ciCompany, setCiCompany, ciLoading, ciResult, ciError, ciProgress, ciUseApify, setCiUseApify, fetchCompanyIntel, sendGhUserToProfiles, country }) {
  const hasApify = !!getStoredKey("apify");
  return (
    <div>
      <Card title="COMPANY INTEL · TALENT POOL MAPPING" accent={T.purple}>
        <div style={{ marginBottom: 10, padding: "8px 12px", background: `${T.purple}11`, border: `1px solid ${T.purpleDim}`, borderRadius: 6, color: T.text2, fontSize: 12, fontFamily: T.mono, lineHeight: 1.5 }}>
          Enter a company (e.g. OpenText, WNS, Infosys) → get Wikipedia snapshot + GitHub org + LinkedIn data (Apify) + AI-synthesised org hierarchy + comparable companies + India X-Ray library across Naukri, AmbitionBox, 6figr, Levels.fyi, iimjobs, Instahyre, Hirist, Cutshort + salary bands + hiring signals.
        </div>
        <Row>
          <Field>
            <FieldLabel>Company Name</FieldLabel>
            <TextInput value={ciCompany} onChange={(e) => setCiCompany(e.target.value)} placeholder="OpenText, WNS, Genpact..." />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {["OpenText", "WNS", "Genpact", "Infosys", "TCS", "Wipro", "Cognizant", "Hyland", "IBM"].map((c) => (
                <button key={c} onClick={() => setCiCompany(c)} style={chip(T.purple, true)}>{c}</button>
              ))}
            </div>
          </Field>
        </Row>
        <div style={{ marginTop: 12, padding: 10, background: T.bg3, border: `1px solid ${hasApify ? T.cyanDim : T.amber + "44"}`, borderRadius: 7 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={ciUseApify} onChange={(e) => setCiUseApify(e.target.checked)} disabled={!hasApify} style={{ width: 16, height: 16, accentColor: T.cyan }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: hasApify ? T.text : T.text3, fontFamily: T.mono, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>USE APIFY FOR LINKEDIN COMPANY SCRAPE</div>
              <div style={{ color: T.text3, fontSize: 11, marginTop: 2 }}>
                {hasApify
                  ? "Costs ~$0.05-0.10 per company from your Apify credit. Free tier: $5/mo = 50-100 lookups. Results are cached in browser."
                  : "Add an Apify token in Settings to enable. Free tier gives $5/mo credit."}
              </div>
            </div>
          </label>
        </div>
        <PrimaryBtn onClick={fetchCompanyIntel} disabled={ciLoading} style={{ marginTop: 14 }}>
          {ciLoading ? (ciProgress || "RESEARCHING...") : "→ RESEARCH COMPANY"}
        </PrimaryBtn>
        {ciError && <ErrBox>{ciError}</ErrBox>}
        {ciLoading && ciProgress && <div style={{ marginTop: 8, fontFamily: T.mono, fontSize: 11, color: T.text3, letterSpacing: 1.5 }}>◈ {ciProgress}</div>}
      </Card>

      {ciLoading && <Card><LoadingPulse /></Card>}

      {ciResult && <CompanyIntelResults r={ciResult} sendGhUserToProfiles={sendGhUserToProfiles} country={country} />}
    </div>
  );
}

function CompanyIntelResults({ r, sendGhUserToProfiles, country }) {
  const ai = r.ai || {};
  return (
    <>
      {r.from_cache && (
        <div style={{ padding: "8px 12px", background: `${T.amber}11`, border: `1px solid ${T.amber}44`, borderRadius: 6, color: T.amber, fontFamily: T.mono, fontSize: 11, marginBottom: 14, letterSpacing: 1.5 }}>
          ⚡ CACHED RESULT — clear browser storage to force re-fetch
        </div>
      )}

      {/* SNAPSHOT */}
      <Card title={`${r.company.toUpperCase()} · SNAPSHOT`} accent={T.cyan}>
        {r.wiki && (
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
            {r.wiki.thumbnail && <img src={r.wiki.thumbnail} alt="" style={{ width: 80, height: 80, borderRadius: 8, border: `1px solid ${T.cyanDim}`, objectFit: "cover" }} />}
            <div style={{ flex: 1 }}>
              <div style={{ color: T.text, fontFamily: T.display, fontSize: 20, fontWeight: 700 }}>{r.wiki.title}</div>
              <div style={{ color: T.text2, fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{r.wiki.extract}</div>
              {r.wiki.url && <a href={r.wiki.url} target="_blank" rel="noreferrer" style={{ fontFamily: T.mono, fontSize: 11, marginTop: 6, display: "inline-block" }}>↗ Wikipedia</a>}
            </div>
          </div>
        )}
        <Row>
          <Stat label="INDUSTRY">{ai.industry || "—"}</Stat>
          <Stat label="HQ">{ai.hq || "—"}</Stat>
          <Stat label="INDIA PRESENCE" color={T.green}>{ai.india_presence ? "YES" : "?"}</Stat>
        </Row>
        {ai.india_presence && (
          <div style={{ marginTop: 12, padding: 12, background: `${T.green}08`, border: `1px solid ${T.greenDim}`, borderRadius: 7, fontSize: 14, color: T.text2, lineHeight: 1.5 }}>
            <span style={{ color: T.green, fontWeight: 700, fontFamily: T.mono, fontSize: 10, letterSpacing: 2 }}>INDIA · </span>{ai.india_presence}
          </div>
        )}
        {ai.company_summary && (
          <div style={{ marginTop: 10, padding: 12, background: T.bg3, borderRadius: 7, border: `1px solid ${T.cyanDim}`, fontSize: 14, color: T.text2, lineHeight: 1.5 }}>
            {ai.company_summary}
          </div>
        )}
      </Card>

      {/* APIFY LINKEDIN */}
      {r.apifyLI && !r.apifyLI.error && (
        <Card title="LINKEDIN COMPANY DATA (via Apify)" accent={T.green}>
          <Row>
            <Stat label="EMPLOYEES">{r.apifyLI.employeeCount || "—"}</Stat>
            <Stat label="FOLLOWERS">{r.apifyLI.followerCount?.toLocaleString() || "—"}</Stat>
            <Stat label="FOUNDED">{r.apifyLI.founded || "—"}</Stat>
          </Row>
          {r.apifyLI.description && <div style={{ marginTop: 10, padding: 12, background: T.bg3, borderRadius: 7, border: `1px solid ${T.greenDim}`, fontSize: 13, color: T.text2, lineHeight: 1.5 }}>{r.apifyLI.description}</div>}
          {r.apifyLI.specialties && r.apifyLI.specialties.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <FieldLabel>SPECIALTIES</FieldLabel>
              <Pills items={r.apifyLI.specialties.slice(0, 15)} color={T.green} />
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            {r.apifyLI.url && <a href={r.apifyLI.url} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.cyan), textDecoration: "none", display: "inline-block" }}>↗ LINKEDIN PAGE</a>}
            {r.apifyLI.website && <a href={r.apifyLI.website} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.purple), textDecoration: "none", display: "inline-block" }}>↗ WEBSITE</a>}
          </div>
        </Card>
      )}
      {r.apifyLI?.error && (
        <Card title="LINKEDIN COMPANY DATA (Apify)" accent={T.red}>
          <ErrBox>Apify: {r.apifyLI.error}</ErrBox>
        </Card>
      )}

      {/* GITHUB ORG */}
      {r.ghOrg && (
        <Card title="GITHUB ORGANISATION" accent={T.cyan}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            {r.ghOrg.avatar_url && <img src={r.ghOrg.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: 8 }} />}
            <div style={{ flex: 1 }}>
              <div style={{ color: T.text, fontWeight: 700, fontSize: 16 }}>@{r.ghOrg.login}</div>
              {r.ghOrg.bio && <div style={{ color: T.text2, fontSize: 13, marginTop: 2 }}>{r.ghOrg.bio}</div>}
            </div>
            <a href={r.ghOrg.url} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.cyan), textDecoration: "none" }}>↗ OPEN</a>
          </div>
          <Row>
            <Stat label="PUBLIC REPOS">{r.ghOrg.public_repos?.toLocaleString() || "—"}</Stat>
            <Stat label="FOLLOWERS">{r.ghOrg.followers?.toLocaleString() || "—"}</Stat>
            <Stat label="PUBLIC MEMBERS">{r.ghOrg.members?.length || 0}</Stat>
          </Row>
          {r.ghOrg.members && r.ghOrg.members.length > 0 && (
            <>
              <FieldLabel style={{ marginTop: 14 }}>PUBLIC MEMBERS (sample) — CLICK TO SEND TO PROFILES SEARCH</FieldLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {r.ghOrg.members.map((m) => (
                  <button key={m.username} onClick={() => sendGhUserToProfiles(m.username)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 6, color: T.text, cursor: "pointer", textAlign: "left" }}>
                    {m.avatar_url && <img src={m.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />}
                    <span style={{ fontFamily: T.mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.username}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* ORG HIERARCHY */}
      {ai.org_hierarchy && ai.org_hierarchy.length > 0 && (
        <Card title="ORG HIERARCHY (verify on LinkedIn — click X-Ray)" accent={T.amber}>
          <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, marginBottom: 12 }}>
            ⚠ Named executives are AI-generated from training data — verify current status on LinkedIn before outreach. Roles and structure are more reliable than specific names.
          </div>
          {ai.org_hierarchy.map((layer, i) => (
            <div key={i} style={{ marginBottom: 14, padding: 12, background: T.bg3, border: `1px solid ${T.amber}33`, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: T.display, fontSize: 18, color: T.amber, fontWeight: 700 }}>{layer.level}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 1.5 }}>LAYER {i + 1}</span>
              </div>
              {layer.roles && layer.roles.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 1.5, marginBottom: 4 }}>TYPICAL ROLES</div>
                  <Pills items={layer.roles} color={T.amber} />
                </div>
              )}
              {layer.people && layer.people.length > 0 && (
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 1.5, marginBottom: 4 }}>NAMED (AI — VERIFY)</div>
                  {layer.people.map((p, j) => {
                    const xrayQ = `site:linkedin.com/in "${p.name}" "${r.company}"`;
                    return (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: T.bg2, borderRadius: 6, marginBottom: 4 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ color: T.text, fontFamily: T.mono, fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                          <span style={{ color: T.text3, fontFamily: T.mono, fontSize: 11, marginLeft: 8 }}>· {p.role}</span>
                        </div>
                        <CopyBtn text={xrayQ} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* SALARY BANDS */}
      {ai.salary_bands_india && (
        <Card title={`SALARY BANDS · ${country.name.toUpperCase()} · ${ai.salary_bands_india.currency || country.currency}`} accent={T.green}>
          {Object.entries(ai.salary_bands_india).filter(([k]) => !["currency", "notes"].includes(k)).map(([func, bands]) => (
            <div key={func} style={{ marginBottom: 14 }}>
              <FieldLabel>{func.toUpperCase().replace(/_/g, " ")}</FieldLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                {["junior", "senior", "lead"].map((tier) => {
                  const b = bands[tier];
                  if (!b) return null;
                  return (
                    <div key={tier} style={{ padding: 10, background: T.bg3, border: `1px solid ${T.greenDim}`, borderRadius: 7 }}>
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.text3, letterSpacing: 2 }}>{tier.toUpperCase()}</div>
                      <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 800, color: T.green, marginTop: 3 }}>{formatSalary(b.median, ai.salary_bands_india.currency || country.currency)}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text2, marginTop: 2 }}>{formatSalary(b.min, ai.salary_bands_india.currency || country.currency)} – {formatSalary(b.max, ai.salary_bands_india.currency || country.currency)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {ai.salary_bands_india.notes && <div style={{ marginTop: 10, padding: 10, background: `${T.green}08`, border: `1px solid ${T.greenDim}`, borderRadius: 6, fontSize: 13, color: T.text2, lineHeight: 1.5 }}><span style={{ color: T.green, fontWeight: 700, fontFamily: T.mono, fontSize: 10, letterSpacing: 2 }}>NOTES: </span>{ai.salary_bands_india.notes}</div>}
          <Divider label="EXTERNAL SALARY SOURCES" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            <ExtLink label="Levels.fyi" url={`https://www.levels.fyi/companies/${r.company.toLowerCase().replace(/\s+/g, "-")}/salaries`} color={T.cyan} />
            <ExtLink label="AmbitionBox" url={`https://www.ambitionbox.com/salaries/${r.company.toLowerCase().replace(/\s+/g, "-")}-salaries`} color={T.amber} />
            <ExtLink label="6figr" url={`https://6figr.com/en/salary?company=${encodeURIComponent(r.company)}`} color={T.green} />
            <ExtLink label="Glassdoor" url={`https://www.glassdoor.co.in/Salary/${encodeURIComponent(r.company)}-Salaries-E1_IN115.htm`} color={T.purple} />
            <ExtLink label="PayScale" url={`https://www.payscale.com/research/IN/Employer=${encodeURIComponent(r.company)}/Salary`} color={T.cyan} />
          </div>
        </Card>
      )}

      {/* COMPARABLE COMPANIES */}
      {ai.comparable_companies && ai.comparable_companies.length > 0 && (
        <Card title="COMPARABLE COMPANIES · SOURCING POOL" accent={T.cyan}>
          <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, marginBottom: 12 }}>Talent moves between these — target their people for {r.company} roles</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {ai.comparable_companies.map((c, i) => (
              <div key={i} style={{ padding: 12, background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ color: T.cyan, fontFamily: T.display, fontSize: 16, fontWeight: 700 }}>{c.name}</div>
                  {c.boomerang_potential && <Badge color={c.boomerang_potential === "high" ? T.red : c.boomerang_potential === "medium" ? T.amber : T.text3}>{c.boomerang_potential?.toUpperCase()} POOL</Badge>}
                </div>
                <div style={{ color: T.text2, fontSize: 13, marginBottom: 6, lineHeight: 1.4 }}>{c.reason}</div>
                {(c.hq || c.india_hq) && <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11 }}>HQ: {c.hq}{c.india_hq && c.india_hq !== "None" ? ` · India: ${c.india_hq}` : ""}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <CopyBtn text={`site:linkedin.com/in "${c.name}" (bengaluru OR bangalore OR hyderabad OR pune OR mumbai)`} />
                  <a href={`https://www.linkedin.com/company/${c.name.toLowerCase().replace(/\s+/g, "-")}`} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.cyan), textDecoration: "none", display: "inline-block" }}>↗ LI</a>
                  <a href={`https://www.ambitionbox.com/overview/${c.name.toLowerCase().replace(/\s+/g, "-")}-overview`} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.amber), textDecoration: "none", display: "inline-block" }}>↗ AB</a>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* INDIA X-RAY LIBRARY */}
      {r.xraylib && <XRayLibrary lib={r.xraylib} company={r.company} />}

      {/* HIRING SIGNALS */}
      {ai.hiring_signals && (
        <Card title="HIRING SIGNALS + NEWS" accent={T.red}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ padding: "8px 14px", background: hiringStateColor(ai.hiring_signals.current_state) + "22", border: `1px solid ${hiringStateColor(ai.hiring_signals.current_state)}`, borderRadius: 6 }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 2 }}>STATE</div>
              <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 700, color: hiringStateColor(ai.hiring_signals.current_state) }}>{(ai.hiring_signals.current_state || "unknown").toUpperCase().replace(/_/g, " ")}</div>
            </div>
          </div>
          {ai.hiring_signals.recent_news && ai.hiring_signals.recent_news.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <FieldLabel>RECENT NEWS</FieldLabel>
              <ul style={{ paddingLeft: 18, margin: 0 }}>{ai.hiring_signals.recent_news.map((n, i) => <li key={i} style={{ color: T.text2, fontSize: 13, marginBottom: 4 }}>{n}</li>)}</ul>
            </div>
          )}
          {ai.hiring_signals.growth_functions && ai.hiring_signals.growth_functions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <FieldLabel>GROWTH FUNCTIONS</FieldLabel>
              <Pills items={ai.hiring_signals.growth_functions} color={T.green} />
            </div>
          )}
          {ai.hiring_signals.vulnerable_functions && ai.hiring_signals.vulnerable_functions.length > 0 && (
            <div>
              <FieldLabel>VULNERABLE FUNCTIONS (potential boomerang or attrition)</FieldLabel>
              <Pills items={ai.hiring_signals.vulnerable_functions} color={T.red} />
            </div>
          )}
          {r.hnMentions && r.hnMentions.length > 0 && (
            <>
              <Divider label="RECENT HN MENTIONS" />
              <div style={{ display: "grid", gap: 6 }}>
                {r.hnMentions.map((h, i) => (
                  <a key={i} href={h.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 10, padding: "8px 10px", background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 6, textDecoration: "none", color: T.text }}>
                    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.amber, minWidth: 40 }}>{h.points}pts</span>
                    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, minWidth: 80 }}>{h.date}</span>
                    <span style={{ fontSize: 13, flex: 1 }}>{h.title}</span>
                  </a>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* SOURCING NOTES */}
      {ai.sourcing_notes && ai.sourcing_notes.length > 0 && (
        <Card title="SOURCING PLAYBOOK" accent={T.purple}>
          <ul style={{ paddingLeft: 18, margin: 0 }}>{ai.sourcing_notes.map((n, i) => <li key={i} style={{ color: T.text2, fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>{n}</li>)}</ul>
          {ai.top_indian_universities_hired && ai.top_indian_universities_hired.length > 0 && (
            <>
              <FieldLabel style={{ marginTop: 12 }}>TOP INDIAN UNIVERSITIES REPRESENTED</FieldLabel>
              <Pills items={ai.top_indian_universities_hired} color={T.purple} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {ai.top_indian_universities_hired.slice(0, 4).map((u) => (
                  <CopyBtn key={u} text={`site:linkedin.com/in "${r.company}" "${u}"`} />
                ))}
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}

function XRayLibrary({ lib, company }) {
  const [category, setCategory] = useState("linkedin_current");
  const categories = [
    { k: "linkedin_current", label: "LinkedIn · Current" },
    { k: "linkedin_ex", label: "LinkedIn · Ex-employees" },
    { k: "linkedin_bengaluru_only", label: "LinkedIn · Bengaluru only" },
    { k: "comparable_pool", label: "LinkedIn · Comparable pool" },
    { k: "naukri_current", label: "Naukri · Current" },
    { k: "naukri_ex", label: "Naukri · Ex-employees" },
    { k: "ambitionbox", label: "AmbitionBox" },
    { k: "6figr", label: "6figr" },
    { k: "levels_fyi", label: "Levels.fyi" },
    { k: "iimjobs", label: "iimjobs" },
    { k: "instahyre", label: "Instahyre" },
    { k: "hirist", label: "Hirist" },
    { k: "cutshort", label: "CutShort" },
    { k: "hiring_signals", label: "Hiring signals" },
    { k: "news", label: "News · Layoffs · Funding" },
  ];
  const active = lib[category] || {};
  return (
    <Card title="INDIA X-RAY LIBRARY (copy any query into Google)" accent={T.cyan}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
        {categories.map((c) => {
          const has = lib[c.k] && Object.keys(lib[c.k]).length > 0;
          return (
            <button key={c.k} onClick={() => setCategory(c.k)} disabled={!has} style={{
              padding: "6px 10px",
              background: category === c.k ? T.cyan : has ? `${T.cyan}11` : "transparent",
              color: category === c.k ? T.bg : has ? T.cyan : T.text4,
              border: `1px solid ${has ? T.cyanDim : T.text4 + "22"}`,
              borderRadius: 6, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
              cursor: has ? "pointer" : "not-allowed",
            }}>{c.label}</button>
          );
        })}
      </div>
      {Object.keys(active).length === 0 ? (
        <Empty label="No queries in this category" />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {Object.entries(active).map(([k, v]) => {
            const isDirectUrl = typeof v === "string" && v.startsWith("http");
            return (
              <div key={k} style={{ padding: 10, background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.cyan, letterSpacing: 1.5, fontWeight: 700 }}>{k.toUpperCase().replace(/_/g, " ")}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <CopyBtn text={v} />
                    {isDirectUrl && <a href={v} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.purple), textDecoration: "none", display: "inline-block" }}>↗ OPEN</a>}
                  </div>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 12, color: T.text, wordBreak: "break-word", lineHeight: 1.5 }}>{v}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ExtLink({ label, url, color }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: T.bg3, border: `1px solid ${color}44`, borderRadius: 7, textDecoration: "none" }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 8px ${color}` }} />
      <span style={{ color, fontFamily: T.mono, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{label}</span>
      <span style={{ color: T.text3, marginLeft: "auto", fontSize: 12 }}>↗</span>
    </a>
  );
}

function hiringStateColor(s) {
  if (!s) return T.text3;
  if (s === "actively_hiring") return T.green;
  if (s === "steady") return T.cyan;
  if (s === "slow_hiring") return T.amber;
  if (s === "freeze" || s === "layoffs") return T.red;
  return T.text3;
}

