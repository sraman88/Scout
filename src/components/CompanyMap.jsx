import { useState, useMemo, useCallback } from "react";
import { searchCompanyEmployees } from "../lib/apifySearch.js";
import { resolveCompetitors, tierOf, FAMILIES } from "../lib/relevanceEngine.js";
import { resolveLevelMap, peopleSearchUrl } from "../lib/levelMap.js";
import { resolveTalentMarket, salaryExtent, getGroundedModel, friendlyError } from "../lib/talentMarket.js";
import { getCompetitorModel } from "../lib/competitorModel.js";
import { getStoredKey } from "../lib/storage.js";

// CompanyMap — contrasting dark panel, on the same page as the search.
// Three things a recruiter actually needs from a target company:
//   1. the org SHAPE (tree of tiers -> real titles, each linking to people)
//   2. what each level is CALLED at comparable companies, with experience bands
//   3. who the peer companies even are
// The company name is seeded from the JD when the LLM found one.

const TIER_ORDER = ["Leadership", "Directors", "Managers", "Individual Contributors"];
const TIER_SHORT = { Leadership: "VP / Head", Directors: "Director", Managers: "Manager / Lead", "Individual Contributors": "IC" };

function Node({ node }) {
  const body = (
    <div className={"node" + (node.head ? " head" : "")}>
      <div className="role">{node.role}</div>
      {node.meta && <div className="meta">{node.meta}</div>}
    </div>
  );
  return (
    <li>
      {node.url
        ? <a className="nodelink" href={node.url} target="_blank" rel="noreferrer" title="Find these people on LinkedIn">{body}</a>
        : body}
      {node.children?.length ? <ul>{node.children.map((c, i) => <Node key={i} node={c} />)}</ul> : null}
    </li>
  );
}

/* Real people, grouped into tiers with the most common titles per tier. An
   honest org SHAPE — employee search never returns reporting lines, so we
   don't draw edges that would imply it does. */
function treeFromPeople(company, people, famLabel) {
  const buckets = Object.fromEntries(TIER_ORDER.map((t) => [t, []]));
  for (const p of people) (buckets[tierOf(p.title || p.seniority)] || buckets["Individual Contributors"]).push(p);

  const children = TIER_ORDER.filter((t) => buckets[t].length).map((t) => {
    const byTitle = new Map();
    for (const p of buckets[t]) {
      const key = (p.title || "—").split(/[,|·—–]/)[0].trim().slice(0, 40) || "—";
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push(p);
    }
    const top = [...byTitle.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3);
    return {
      role: TIER_SHORT[t] || t,
      meta: `${buckets[t].length} mapped`,
      children: top.map(([title, ps]) => ({
        role: title,
        meta: ps.length > 1 ? `${ps.length} people` : (ps[0]?.name || "1 person"),
        url: ps.length === 1 && ps[0].linkedin ? ps[0].linkedin : peopleSearchUrl(title, company),
      })),
    };
  });
  return { role: company, meta: `${people.length} in ${famLabel}`, head: true, children };
}

/* No token / no results — the family's typical ladder, still linked to people. */
function treeFromFamily(family, company) {
  const f = FAMILIES[family] || FAMILIES.sales;
  const buckets = Object.fromEntries(TIER_ORDER.map((t) => [t, []]));
  for (const title of f.titles) (buckets[tierOf(title)] || buckets["Individual Contributors"]).push(title);
  return {
    role: company ? `${company} — ${f.label}` : `${f.label} org`,
    meta: "typical shape",
    head: true,
    children: TIER_ORDER.filter((t) => buckets[t].length).map((t) => ({
      role: TIER_SHORT[t] || t,
      meta: `${buckets[t].length} titles`,
      children: buckets[t].slice(0, 3).map((title) => ({ role: title, url: peopleSearchUrl(title, company) })),
    })),
  };
}

export default function CompanyMap({ family = "sales", seedCompany = "", roleTitle = "", skills = [], location = "India" }) {
  const [company, setCompany] = useState(seedCompany);
  const [people, setPeople] = useState([]);
  const [mapped, setMapped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [competitors, setCompetitors] = useState([]);
  const [compLoading, setCompLoading] = useState(false);
  const [levels, setLevels] = useState(null);
  const [levelLoading, setLevelLoading] = useState(false);

  const [peers, setPeers] = useState(null);
  const [peersLoading, setPeersLoading] = useState(false);
  const [pay, setPay] = useState(null);
  const [payLoading, setPayLoading] = useState(false);

  const fam = FAMILIES[family] || FAMILIES.sales;
  const hasApify = !!getStoredKey("apify");
  const provider = getStoredKey("provider_pref") || "auto";
  const grounded = getGroundedModel();

  const marketSpec = useMemo(
    () => ({ role: roleTitle || fam.label, family: fam.label, skills, location, company: company.trim() }),
    [roleTitle, fam.label, skills, location, company]
  );

  /* Seed from the JD when it changes, without clobbering anything already
     typed. Adjusting state during render (rather than in an effect) is the
     documented pattern for deriving state from props — no cascading render. */
  const [seenSeed, setSeenSeed] = useState(seedCompany);
  if (seedCompany !== seenSeed) {
    setSeenSeed(seedCompany);
    if (seedCompany && !company.trim()) setCompany(seedCompany);
  }

  /* One grounded call for both answers — see resolveTalentMarket. */
  const runMarket = useCallback(async (force = false) => {
    if (!grounded) { setError("Add a Gemini key in Settings to map the talent market."); return; }
    setPeersLoading(true); setPayLoading(true); setError("");
    try {
      const m = await resolveTalentMarket(marketSpec, { callModel: grounded, force });
      setPeers({ peers: m.peers, pools: m.pools, sources: m.sources });
      setPay(m.pay);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setPeersLoading(false); setPayLoading(false);
    }
  }, [grounded, marketSpec]);

  const run = useCallback(async (name) => {
    const target = String(name ?? company).trim();
    if (!target) return;
    setLoading(true); setError(""); setPeople([]);
    try {
      const list = await searchCompanyEmployees({
        companyName: target, titles: fam.titles.slice(0, 10), locations: ["India"], maxItems: 50,
      });
      setPeople(list);
      setMapped(target);
      if (!list.length) setError(`No ${fam.label} employees came back for “${target}”. Try the domain (e.g. acme.com).`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [company, fam]);

  const runLevels = useCallback(async () => {
    const target = company.trim();
    if (!target) { setError("Enter a company first."); return; }
    setLevelLoading(true); setError("");
    try {
      setLevels(await resolveLevelMap({ company: target, family, roleTitle, region: "India", provider }));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLevelLoading(false);
    }
  }, [company, family, roleTitle, provider]);

  const findCompetitors = useCallback(async () => {
    const target = company.trim();
    if (!target) return;
    const callModel = getCompetitorModel();
    if (!callModel) { setError("No web-grounded model configured — add a Gemini key in Settings."); return; }
    setCompLoading(true); setError("");
    try {
      const { competitors: c } = await resolveCompetitors(target, { callModel, region: "India" });
      setCompetitors(c);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setCompLoading(false);
    }
  }, [company]);

  /* Auto-runs, declared after the callbacks they invoke.

     Anchoring on the company being hired for is the point: "who else has this
     talent" only means something relative to that anchor, so both re-run when
     the company changes. Keyed state (not an effect) so a re-render never
     re-fires the call. */
  const marketKey = `${roleTitle}|${fam.label}|${location}|${company.trim()}`;
  const [ranFor, setRanFor] = useState(null);
  if (grounded && roleTitle && marketKey !== ranFor && !peersLoading) {
    setRanFor(marketKey);
    setPeers(null); setPay(null);
    queueMicrotask(() => runMarket());
  }

  const levelKey = `${company.trim()}|${family}|${roleTitle}`;
  const [levelsFor, setLevelsFor] = useState(null);
  if (company.trim() && roleTitle && levelKey !== levelsFor && !levelLoading) {
    setLevelsFor(levelKey);
    queueMicrotask(() => runLevels());
  }

  const tree = useMemo(
    () => (people.length ? treeFromPeople(mapped, people, fam.label) : treeFromFamily(family, company.trim())),
    [people, mapped, family, fam.label, company]
  );

  const tierCounts = useMemo(() => {
    if (!people.length) return [];
    const counts = {};
    for (const p of people) { const t = tierOf(p.title || p.seniority); counts[t] = (counts[t] || 0) + 1; }
    return TIER_ORDER.filter((t) => counts[t]).map((t) => ({ label: TIER_SHORT[t] || t, value: String(counts[t]) }));
  }, [people]);

  return (
    <div className="map">
      <div className="mh">
        <h3>Company mapping{mapped && people.length ? ` — ${mapped}` : ""}</h3>
        <span className="msub">org shape · who has this talent · what it pays</span>
      </div>

      <div className="maprow">
        <input placeholder="Company name or domain — e.g. OpenText" value={company}
          onChange={(e) => setCompany(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <button className="btn" onClick={() => run()} disabled={loading || !company.trim() || !hasApify}
          title={hasApify ? "" : "Needs an Apify token"}>{loading ? "Mapping…" : "Map org"}</button>
        <button className="btn ghost" onClick={runLevels} disabled={levelLoading || !company.trim()}>
          {levelLoading ? "Mapping levels…" : "Level equivalence"}
        </button>
        <button className="btn ghost" onClick={findCompetitors} disabled={compLoading || !company.trim()}>
          {compLoading ? "…" : "Competitors"}
        </button>
        <button className="btn ghost" onClick={() => runMarket(true)} disabled={peersLoading || payLoading}>
          {peersLoading || payLoading ? "Reading market…" : "↻ Talent market"}
        </button>
      </div>

      {!hasApify && <div className="mapnote">No Apify token — showing the typical {fam.label} ladder. Every node still links to real people via LinkedIn search.</div>}
      {error && <div className="mapnote bad">{error}</div>}

      {competitors.length > 0 && (
        <div className="comps">
          {competitors.map((c) => (
            <button key={c} onClick={() => { setCompany(c); run(c); }} title={`Map ${c} instead`}>{c}</button>
          ))}
        </div>
      )}
      {/* Who else has this talent — derived from the role, no company needed */}
      {(peersLoading || peers) && (
        <div className="equiv">
          <h4>
            Companies with similar talent
            {peers?.peers?.length ? <em> — {peers.peers.length} for {roleTitle || fam.label}</em> : null}
          </h4>
          {peersLoading && <div className="mapnote">Reading the market…</div>}

          {peers?.peers?.length > 0 && (
            <div className="etable">
              {peers.peers.map((p, i) => (
                <a key={i} className="erow peer" href={peopleSearchUrl(p.equivalentTitle || roleTitle || fam.label, p.company)}
                  target="_blank" rel="noreferrer" title={`Find ${p.equivalentTitle || roleTitle} at ${p.company}`}>
                  <span className="eco">
                    {p.company}
                    {p.hiring && <i className="hiring" title="Evidence of a live or recent opening">hiring</i>}
                  </span>
                  <span className="eti">{p.equivalentTitle || "—"}</span>
                  <span className="ent">{p.why}</span>
                </a>
              ))}
            </div>
          )}

          {peers?.pools?.length > 0 && (
            <div className="pools">
              <b>Less obvious pools</b>
              {peers.pools.map((p, i) => <span key={i}>{p}</span>)}
            </div>
          )}
          <Sources list={peers?.sources} />
        </div>
      )}

      {/* Pay benchmarks, always shown with the sources behind them */}
      {(payLoading || pay) && (
        <div className="equiv">
          <h4>
            Market pay
            {pay?.asOf ? <em> — {pay.asOf}{pay.unit ? ` · ${pay.currency} ${pay.unit}` : ""}</em> : null}
          </h4>
          {payLoading && <div className="mapnote">Pulling salary benchmarks…</div>}

          {pay && !pay.bands.length && !payLoading && (
            <div className="mapnote">No reliable published data found for this role and region — better to leave it blank than invent a number.</div>
          )}

          {pay?.bands?.length > 0 && <PayBands pay={pay} />}

          {pay?.topPayers?.length > 0 && (
            <div className="pools">
              <b>Pays above market</b>
              {pay.topPayers.map((t, i) => <span key={i}>{t.company} · {t.range}</span>)}
            </div>
          )}
          {pay?.caveat && <div className="mapnote">{pay.caveat}</div>}
          <Sources list={pay?.sources} />
        </div>
      )}

      {/* What each level is called at the peer companies */}
      {levels?.equivalents?.length > 0 && (
        <div className="equiv">
          <h4>
            Levels to target
            {levels.anchor?.title ? <em> — {levels.anchor.title} at {levels.anchor.company}{levels.anchor.years ? ` · ${levels.anchor.years}y` : ""}</em> : null}
          </h4>
          <div className="etable">
            {levels.equivalents.map((e, i) => (
              <a key={i} className="erow" href={peopleSearchUrl(e.title, e.company)} target="_blank" rel="noreferrer"
                title={`Find ${e.title} at ${e.company} on LinkedIn`}>
                <span className="eco">{e.company}</span>
                <span className="eti">{e.title}</span>
                <span className="eyr">{e.years ? `${e.years}y` : ""}</span>
                <span className="ent">{e.note || ""}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Designations, last: the org shape once you know who and what level */}
      <div className="maplayout">
        <ul className="tree"><Node node={tree} /></ul>
        <div className="levels">
          {tierCounts.length > 0 && (
            <>
              <h4>People per level</h4>
              {tierCounts.map((l, i) => <div className="lvl" key={i}><b>{l.label}</b><span>{l.value}</span></div>)}
            </>
          )}
          {levels?.ladder?.length > 0 && (
            <>
              <h4 style={{ marginTop: tierCounts.length ? 18 : 0 }}>Levels &amp; experience</h4>
              {levels.ladder.map((l, i) => (
                <div className="lvl col" key={i}>
                  <b>{l.level}<span className="band">{l.years}y</span></b>
                  {l.titles && <span className="lt">{l.titles}</span>}
                </div>
              ))}
            </>
          )}
          {!tierCounts.length && !levels && (
            <>
              <h4>Designations</h4>
              {fam.titles.slice(0, 5).map((t) => (
                <div className="lvl" key={t}>
                  <a href={peopleSearchUrl(t, company.trim())} target="_blank" rel="noreferrer">{t}</a>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Horizontal range bars — a band's position and width carry the comparison
   far better than a table of numbers does. */
function PayBands({ pay }) {
  const extent = salaryExtent(pay.bands);
  return (
    <div className="paybands">
      {pay.bands.map((b, i) => {
        const lo = b.min ?? b.median, hi = b.max ?? b.median;
        const left = extent ? ((lo - extent.lo) / (extent.hi - extent.lo)) * 100 : 0;
        const width = extent ? Math.max(((hi - lo) / (extent.hi - extent.lo)) * 100, 2) : 100;
        return (
          <div className="payrow" key={i}>
            <span className="plevel">
              {b.level}
              {b.years && <i>{b.years}y</i>}
            </span>
            <span className="ptrack">
              <span className="pbar" style={{ left: `${left}%`, width: `${width}%` }} />
            </span>
            <span className="pfig">
              {lo}{hi !== lo ? `–${hi}` : ""} <i>{pay.unit}</i>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* Citations are the point: every figure above should be checkable at origin. */
function Sources({ list }) {
  if (!list?.length) return null;
  return (
    <div className="srcline">
      <b>Sources</b>
      {list.map((s, i) => (
        <a key={i} href={s.uri} target="_blank" rel="noreferrer" title={s.title}>
          {(s.title || new URL(s.uri).hostname).replace(/^www\./, "").slice(0, 34)}
        </a>
      ))}
    </div>
  );
}
