import { useState, useEffect, useMemo, useCallback } from "react";
import { T, ENV_GEMINI } from "../theme.js";
import { getStoredKey } from "../lib/storage.js";
import { llmCall } from "../lib/llm.js";
import { searchCompanyEmployees } from "../lib/apifySearch.js";
import { resolveCompetitors } from "../lib/relevanceEngine.js";
import { geminiGrounded, perplexity, openAICompatible } from "../lib/groundedModel.js";
import { Card, FieldLabel, TextInput, Row, Field, Divider, PrimaryBtn, MicroBtn, ErrBox, Empty, LoadingPulse, Badge, Pill } from "../components/ui.jsx";
import { chip } from "../components/styleHelpers.js";

/* Builds a callModel(prompt)=>string function from whatever's configured in
   Settings for competitor lookup (defaults to Gemini + Google Search
   grounding, reusing the existing Gemini key — zero new keys needed). */
function getCompetitorModel() {
  const provider = getStoredKey("competitor_provider") || "gemini";
  if (provider === "gemini") {
    const key = getStoredKey("gemini") || ENV_GEMINI;
    return key ? geminiGrounded(key) : null;
  }
  if (provider === "perplexity") {
    const key = getStoredKey("competitor_api_key");
    return key ? perplexity(key) : null;
  }
  if (provider === "custom") {
    const key = getStoredKey("competitor_api_key");
    const baseURL = getStoredKey("competitor_base_url");
    return key && baseURL ? openAICompatible(key, { baseURL, model: getStoredKey("competitor_model") || "gpt-4o-mini" }) : null;
  }
  return null;
}

/* Maps a target company's org for one function + geography via
   harvestapi~linkedin-company-employees on Apify — same token as the other
   LinkedIn actors already in Settings, no separate provider account needed.
   (Originally built against Apollo via a serverless proxy, but Apollo's free
   plan has zero API search access — this replaces that entirely.) */

const CACHE_PREFIX = "scout_xray_";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14d TTL, auto-expiring cache

const FUNCTION_TITLES = {
  Sales: [
    "sales", "account executive", "account manager", "sales manager",
    "sales director", "regional sales manager", "vp sales", "head of sales",
    "business development", "inside sales", "sales operations", "sales development",
  ],
  Cloud: ["cloud", "solutions architect", "cloud engineer", "devops", "platform engineer"],
  HR: ["human resources", "talent acquisition", "recruiter", "hrbp", "people operations"],
  Finance: ["finance", "controller", "financial analyst", "fp&a", "accounts"],
};

const TIER = {
  owner: "Leadership", founder: "Leadership", c_suite: "Leadership",
  partner: "Leadership", vp: "Leadership", head: "Leadership",
  director: "Directors", manager: "Managers",
  senior: "Individual Contributors", entry: "Individual Contributors",
  intern: "Individual Contributors",
};
const TIER_ORDER = ["Leadership", "Directors", "Managers", "Individual Contributors", "Unclassified"];
const tierOf = (p) => TIER[p.seniority] || "Unclassified";

const INDIA_CITIES = ["India", "Bengaluru", "Mumbai", "Delhi", "Gurgaon", "Hyderabad", "Pune", "Chennai", "Noida"];

async function ensembleClusterTitles(prompt) {
  const provider = getStoredKey("provider_pref") || "groq";
  return llmCall(provider, "You clean and classify company org-chart data. Respond with JSON only — no markdown, no commentary.", prompt, { temperature: 0.2 });
}

export function CompanyXRayTab() {
  const providerKey = getStoredKey("apify");

  const [companyDomain, setCompanyDomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fn, setFn] = useState("Sales");
  const [locations, setLocations] = useState(["India"]);
  const [maxItems, setMaxItems] = useState(50);

  const [people, setPeople] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState(null);

  const [competitors, setCompetitors] = useState([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState("");
  const [compSource, setCompSource] = useState("");

  const cacheKey = useMemo(
    () => `${CACHE_PREFIX}${(companyDomain || companyName || "").toLowerCase()}_${fn}`,
    [companyDomain, companyName, fn]
  );

  /* Load any cached map for this company+function whenever the identity
     changes. This is a genuine "synchronize with an external system"
     effect (reading localStorage, checking wall-clock expiry) — there's no
     pure render-time equivalent since both of those are impure reads. */
  useEffect(() => {
    let nextPeople = [];
    let nextCachedAt = null;
    if (companyDomain || companyName) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const { savedAt, people: cachedPeople } = JSON.parse(raw);
          if (Date.now() - savedAt <= CACHE_TTL_MS) {
            nextPeople = cachedPeople || [];
            nextCachedAt = savedAt;
          } else {
            localStorage.removeItem(cacheKey);
          }
        }
      } catch { /* corrupt cache entry, ignore */ }
    }
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage on key change, the textbook effect use case */
    setPeople(nextPeople);
    setCachedAt(nextCachedAt);
  }, [cacheKey, companyDomain, companyName]);

  const persist = useCallback((list) => {
    try {
      const savedAt = Date.now();
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt, people: list }));
      setCachedAt(savedAt);
    } catch { /* storage full or disabled, non-fatal */ }
  }, [cacheKey]);

  const purge = useCallback(() => {
    try { localStorage.removeItem(cacheKey); } catch { /* ignore */ }
    setPeople([]); setMeta(null); setCachedAt(null); setError("");
  }, [cacheKey]);

  const enrich = useCallback(async (list) => {
    if (!list.length) return list;
    setEnriching(true);
    try {
      const sample = list.map((p, i) => ({ i, title: p.title, seniority: p.seniority }));
      const prompt =
        "You are cleaning a company org map. For each item return JSON only: " +
        '[{"i":<index>,"title":"<canonical title>","tier":"Leadership|Directors|Managers|Individual Contributors"}]. ' +
        "No prose, no code fences.\n" + JSON.stringify(sample);
      const out = await ensembleClusterTitles(prompt);
      const parsed = JSON.parse(String(out).replace(/```json|```/g, "").trim());
      const byIndex = new Map(parsed.map((r) => [r.i, r]));
      return list.map((p, i) => {
        const r = byIndex.get(i);
        if (!r) return p;
        return { ...p, title: r.title || p.title, _tier: r.tier || undefined };
      });
    } catch {
      return list; // clustering failure never breaks the map
    } finally {
      setEnriching(false);
    }
  }, []);

  const run = useCallback(async () => {
    if (!providerKey) { setError("No Apify token. Add one in Settings (⚙) — same token as the other LinkedIn features."); return; }
    if (!companyDomain && !companyName) { setError("Enter a company domain (e.g. ibm.com) or name."); return; }
    setLoading(true); setError("");
    try {
      let list = await searchCompanyEmployees({
        companyDomain: companyDomain.trim(),
        companyName: companyName.trim(),
        titles: FUNCTION_TITLES[fn] || [],
        locations,
        maxItems,
      });
      list = await enrich(list);
      setPeople(list);
      setMeta({ count: list.length });
      persist(list);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [providerKey, companyDomain, companyName, fn, locations, maxItems, enrich, persist]);

  const findCompetitors = useCallback(async () => {
    const company = (companyName || companyDomain).trim();
    if (!company) { setCompError("Enter a company name or domain first."); return; }
    const callModel = getCompetitorModel();
    if (!callModel) { setCompError("No competitor-lookup model configured. Add one in Settings (⚙) — defaults to your existing Gemini key, zero new keys needed."); return; }
    setCompLoading(true); setCompError(""); setCompetitors([]);
    try {
      const { competitors: list, source } = await resolveCompetitors(company, { callModel, region: "India" });
      setCompetitors(list);
      setCompSource(source);
      if (source === "error" || source === "empty_result") setCompError("Couldn't resolve real competitors — model call failed or returned nothing usable.");
    } catch (e) {
      setCompError(e.message || String(e));
    } finally {
      setCompLoading(false);
    }
  }, [companyName, companyDomain]);

  function mapCompetitor(name) {
    setCompanyName(name);
    setCompanyDomain("");
  }

  const grouped = useMemo(() => {
    const g = Object.fromEntries(TIER_ORDER.map((t) => [t, []]));
    for (const p of people) {
      const t = p._tier && g[p._tier] ? p._tier : tierOf(p);
      g[t].push(p);
    }
    for (const t of TIER_ORDER) g[t].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return g;
  }, [people]);

  const downloadJSON = () => saveBlob(JSON.stringify(people, null, 2), `${slug(companyDomain || companyName)}_${fn}.json`, "application/json");
  const downloadCSV = () => {
    const cols = ["name", "title", "seniority", "city", "state", "country", "org", "linkedin"];
    const head = cols.join(",");
    const rows = people.map((p) => cols.map((c) => csv(p[c])).join(","));
    saveBlob([head, ...rows].join("\n"), `${slug(companyDomain || companyName)}_${fn}.csv`, "text/csv");
  };

  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div>
      <Card title="COMPANY X-RAY — ORG MAPPING (VIA APIFY)" accent={T.cyan}>
        <div style={{ marginBottom: 10, padding: "8px 12px", background: `${T.cyan}11`, border: `1px solid ${T.cyanDim}`, borderRadius: 6, color: T.text2, fontSize: 12, fontFamily: T.mono, lineHeight: 1.5 }}>
          {providerKey
            ? "Map who works at a target company, grouped by seniority tier (via AI title clustering) — filtered by function and location. Uses the same Apify token as your other LinkedIn features."
            : "Add an Apify token in Settings (⚙) to enable this — same token used for LinkedIn search/enrich elsewhere in Scout."}
        </div>
        <Row>
          <Field><FieldLabel>Company domain</FieldLabel><TextInput value={companyDomain} onChange={(e) => setCompanyDomain(e.target.value)} placeholder="ibm.com" /></Field>
          <Field><FieldLabel>…or company name</FieldLabel><TextInput value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="IBM" /></Field>
        </Row>
        <Row style={{ marginTop: 10 }}>
          <Field>
            <FieldLabel>Function</FieldLabel>
            <select value={fn} onChange={(e) => setFn(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: T.fieldBg, color: T.fieldText, border: `1px solid ${T.cyanDim}`, borderRadius: 7, fontFamily: T.body, fontSize: 14 }}>
              {Object.keys(FUNCTION_TITLES).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field><FieldLabel>Max results</FieldLabel><TextInput type="number" min={10} max={500} step={10} value={maxItems} onChange={(e) => setMaxItems(Number(e.target.value))} /></Field>
        </Row>

        <FieldLabel style={{ marginTop: 14 }}>LOCATIONS</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {INDIA_CITIES.map((c) => (
            <button key={c} onClick={() => toggle(locations, setLocations, c)} style={chip(locations.includes(c) ? T.cyan : T.text3)}>{c}</button>
          ))}
        </div>

        <Divider label="RUN" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PrimaryBtn onClick={run} disabled={loading || enriching || !providerKey} style={{ width: "auto", flex: "1 1 200px" }}>
            {loading ? "MAPPING..." : enriching ? "CLUSTERING..." : "→ RUN X-RAY"}
          </PrimaryBtn>
          <MicroBtn onClick={downloadCSV} color={T.green} disabled={!people.length}>↓ EXPORT CSV</MicroBtn>
          <MicroBtn onClick={downloadJSON} color={T.green} disabled={!people.length}>↓ EXPORT JSON</MicroBtn>
          <MicroBtn onClick={purge} color={T.red} disabled={!people.length && !cachedAt}>PURGE CACHE</MicroBtn>
        </div>
        {cachedAt && <div style={{ marginTop: 8, color: T.text3, fontFamily: T.mono, fontSize: 10 }}>cached {new Date(cachedAt).toLocaleDateString()}</div>}
        {error && <ErrBox>{error}</ErrBox>}
      </Card>

      <Card title="COMPETITORS (WEB-GROUNDED)" accent={T.amber}>
        <div style={{ marginBottom: 10, color: T.text2, fontSize: 12, fontFamily: T.mono, lineHeight: 1.5 }}>
          Resolves the target's real, currently-operating competitors via a web-grounded model (not a hardcoded list, so it stays accurate) — click one to map it instead, for poaching-adjacent sourcing.
        </div>
        <MicroBtn onClick={findCompetitors} color={T.amber} disabled={compLoading || (!companyName.trim() && !companyDomain.trim())}>
          {compLoading ? "RESOLVING..." : "→ FIND COMPETITORS"}
        </MicroBtn>
        {compError && <ErrBox>{compError}</ErrBox>}
        {competitors.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {competitors.map((c) => (
              <button key={c} onClick={() => mapCompetitor(c)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} title="Map this company instead">
                <Pill color={T.amber}>{c}</Pill>
              </button>
            ))}
            {compSource === "cache" && <div style={{ marginTop: 6, color: T.text4, fontFamily: T.mono, fontSize: 10 }}>from cache</div>}
          </div>
        )}
      </Card>

      {loading && <Card><LoadingPulse /></Card>}
      {!loading && !people.length && !error && <Card><Empty label="Enter a company and run X-Ray to map its org." /></Card>}

      {meta && people.length > 0 && (
        <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11, letterSpacing: 1.5, marginBottom: 10 }}>
          {people.length} PEOPLE MAPPED
        </div>
      )}

      {TIER_ORDER.filter((t) => grouped[t]?.length).map((t) => (
        <Card key={t} title={`${t.toUpperCase()} (${grouped[t].length})`} accent={T.purple}>
          <div style={{ display: "grid", gap: 6 }}>
            {grouped[t].map((p, i) => (
              <div key={p.id || i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1fr auto", gap: 10, padding: "8px 10px", background: T.bg3, border: `1px solid ${T.purpleDim}`, borderRadius: 6, alignItems: "center" }}>
                <span style={{ color: T.text, fontWeight: 600, fontSize: 13 }}>{p.name || "—"}</span>
                <span style={{ color: T.text2, fontSize: 13 }}>{p.title || "—"}</span>
                <span style={{ color: T.text3, fontSize: 11 }}>{[p.city, p.country].filter(Boolean).join(", ")}</span>
                {p.linkedin ? <a href={p.linkedin} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: T.cyan }}><Badge color={T.cyan}>IN</Badge></a> : <span />}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function saveBlob(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const slug = (s) => String(s || "company").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
