import { useState, useEffect, useMemo, useCallback } from "react";
import { T } from "../theme.js";
import { getStoredKey } from "../lib/storage.js";
import { llmCall } from "../lib/llm.js";
import { Card, FieldLabel, TextInput, Row, Field, Divider, PrimaryBtn, MicroBtn, ErrBox, Empty, LoadingPulse, Badge } from "../components/ui.jsx";
import { chip } from "../components/styleHelpers.js";

/* Maps a target company's org for one function + geography via a people-data
   provider (Apollo, through the /api/xray serverless proxy so the Apollo key
   never reaches the browser network tab — it's forwarded per-request from
   this component to our own origin, then from our origin to Apollo). */

const ENDPOINT = "/api/xray";
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

const SENIORITY_OPTIONS = ["c_suite", "vp", "head", "director", "manager", "senior", "entry"];

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
  const providerKey = getStoredKey("apollo");

  const [companyDomain, setCompanyDomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fn, setFn] = useState("Sales");
  const [locations, setLocations] = useState(["India"]);
  const [seniorities, setSeniorities] = useState([]);
  const [maxPages, setMaxPages] = useState(3);

  const [people, setPeople] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState(null);

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
    if (!providerKey) { setError("No Apollo key. Add your Apollo API key in Settings (⚙)."); return; }
    if (!companyDomain && !companyName) { setError("Enter a company domain (e.g. ibm.com) or name."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-provider-key": providerKey },
        body: JSON.stringify({
          companyDomain: companyDomain.trim() || undefined,
          companyName: companyName.trim() || undefined,
          titles: FUNCTION_TITLES[fn] || [],
          seniorities,
          locations,
          perPage: 100,
          maxPages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);

      let list = data.people || [];
      list = await enrich(list);
      setPeople(list);
      setMeta({ count: data.count, pagination: data.pagination });
      persist(list);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [providerKey, companyDomain, companyName, fn, seniorities, locations, maxPages, enrich, persist]);

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
      <Card title="COMPANY X-RAY — ORG MAPPING (VIA APOLLO)" accent={T.cyan}>
        <div style={{ marginBottom: 10, padding: "8px 12px", background: `${T.cyan}11`, border: `1px solid ${T.cyanDim}`, borderRadius: 6, color: T.text2, fontSize: 12, fontFamily: T.mono, lineHeight: 1.5 }}>
          {providerKey
            ? "Map who works at a target company, grouped by seniority tier — filtered by function and location."
            : "Add an Apollo API key in Settings (⚙) to enable this. Sign up at apollo.io to get one."}
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
          <Field><FieldLabel>Max pages (×100 results)</FieldLabel><TextInput type="number" min={1} max={10} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} /></Field>
        </Row>

        <FieldLabel style={{ marginTop: 14 }}>LOCATIONS</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {INDIA_CITIES.map((c) => (
            <button key={c} onClick={() => toggle(locations, setLocations, c)} style={chip(locations.includes(c) ? T.cyan : T.text3)}>{c}</button>
          ))}
        </div>

        <FieldLabel style={{ marginTop: 12 }}>SENIORITY <span style={{ color: T.text4, textTransform: "none" }}>(none = all levels)</span></FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SENIORITY_OPTIONS.map((s) => (
            <button key={s} onClick={() => toggle(seniorities, setSeniorities, s)} style={chip(seniorities.includes(s) ? T.purple : T.text3)}>{s}</button>
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

      {loading && <Card><LoadingPulse /></Card>}
      {!loading && !people.length && !error && <Card><Empty label="Enter a company and run X-Ray to map its org." /></Card>}

      {meta && people.length > 0 && (
        <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11, letterSpacing: 1.5, marginBottom: 10 }}>
          {people.length} SHOWN · PROVIDER TOTAL {meta.pagination?.total_entries ?? "?"}
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
