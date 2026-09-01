import { useState, useMemo, useCallback } from "react";
import { searchCompanyEmployees } from "../lib/apifySearch.js";
import { resolveCompetitors, tierOf, FAMILIES } from "../lib/relevanceEngine.js";
import { getCompetitorModel } from "../lib/competitorModel.js";
import { getStoredKey } from "../lib/storage.js";

// CompanyMap — the contrasting dark panel + org tree, on the same page as the
// search. Maps a target company's org for the sensed function: real people via
// Apify when a token is present, otherwise the family's typical designation
// ladder so the shape is still legible.
// tree = { role, meta, head?, children:[...] }  (recursive)

const TIER_ORDER = ["Leadership", "Directors", "Managers", "Individual Contributors"];
const TIER_SHORT = { Leadership: "VP / Head", Directors: "Director", Managers: "Manager / Lead", "Individual Contributors": "IC" };

function Node({ node }) {
  return (
    <li>
      <div className={"node" + (node.head ? " head" : "")}>
        <div className="role">{node.role}</div>
        {node.meta && <div className="meta">{node.meta}</div>}
      </div>
      {node.children?.length ? <ul>{node.children.map((c, i) => <Node key={i} node={c} />)}</ul> : null}
    </li>
  );
}

/* Group real people into tiers, then keep the most common titles per tier — an
   honest org SHAPE, since employee search never returns reporting lines. */
function treeFromPeople(company, people, famLabel) {
  const buckets = Object.fromEntries(TIER_ORDER.map((t) => [t, []]));
  for (const p of people) {
    const t = tierOf(p.title || p.seniority);
    (buckets[t] || buckets["Individual Contributors"]).push(p);
  }
  const children = TIER_ORDER.filter((t) => buckets[t].length).map((t) => {
    const byTitle = new Map();
    for (const p of buckets[t]) {
      const key = (p.title || "—").split(/[,|·—–]/)[0].trim().slice(0, 40) || "—";
      byTitle.set(key, (byTitle.get(key) || 0) + 1);
    }
    const top = [...byTitle.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      role: TIER_SHORT[t] || t,
      meta: `${buckets[t].length} mapped`,
      children: top.map(([title, n]) => ({ role: title, meta: n > 1 ? `${n} people` : "1 person" })),
    };
  });
  return { role: company, meta: `${people.length} in ${famLabel}`, head: true, children };
}

/* No Apify token / no results — show the family's typical ladder instead of an
   empty panel, so the section still answers "what does this org look like". */
function treeFromFamily(family) {
  const f = FAMILIES[family] || FAMILIES.sales;
  const buckets = Object.fromEntries(TIER_ORDER.map((t) => [t, []]));
  for (const title of f.titles) (buckets[tierOf(title)] || buckets["Individual Contributors"]).push(title);
  return {
    role: `${f.label} org`,
    meta: "typical shape",
    head: true,
    children: TIER_ORDER.filter((t) => buckets[t].length).map((t) => ({
      role: TIER_SHORT[t] || t,
      meta: `${buckets[t].length} titles`,
      children: buckets[t].slice(0, 3).map((title) => ({ role: title })),
    })),
  };
}

export default function CompanyMap({ family = "sales" }) {
  const [company, setCompany] = useState("");
  const [people, setPeople] = useState([]);
  const [mapped, setMapped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [competitors, setCompetitors] = useState([]);
  const [compLoading, setCompLoading] = useState(false);

  const fam = FAMILIES[family] || FAMILIES.sales;
  const hasApify = !!getStoredKey("apify");

  const run = useCallback(async (name) => {
    const target = String(name ?? company).trim();
    if (!target) return;
    setLoading(true); setError(""); setPeople([]);
    try {
      const list = await searchCompanyEmployees({
        companyName: target,
        titles: fam.titles.slice(0, 10),
        locations: ["India"],
        maxItems: 50,
      });
      setPeople(list);
      setMapped(target);
      if (!list.length) setError(`No ${fam.label} employees came back for “${target}”. Try the domain (e.g. acme.com) instead.`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [company, fam]);

  const findCompetitors = useCallback(async () => {
    const target = company.trim();
    if (!target) return;
    const callModel = getCompetitorModel();
    if (!callModel) { setError("No web-grounded model configured for competitor lookup — add a Gemini key in Settings."); return; }
    setCompLoading(true); setError("");
    try {
      const { competitors: c } = await resolveCompetitors(target, { callModel, region: "India" });
      setCompetitors(c);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCompLoading(false);
    }
  }, [company]);

  const tree = useMemo(
    () => (people.length ? treeFromPeople(mapped, people, fam.label) : treeFromFamily(family)),
    [people, mapped, family, fam.label]
  );

  const levels = useMemo(() => {
    if (!people.length) return fam.titles.slice(0, 5).map((t) => ({ label: t, value: "typical" }));
    const counts = {};
    for (const p of people) {
      const t = tierOf(p.title || p.seniority);
      counts[t] = (counts[t] || 0) + 1;
    }
    return TIER_ORDER.filter((t) => counts[t]).map((t) => ({ label: TIER_SHORT[t] || t, value: String(counts[t]) }));
  }, [people, fam.titles]);

  return (
    <div className="map">
      <div className="mh">
        <h3>Company mapping{mapped && people.length ? ` — ${mapped}, ${fam.label}` : ""}</h3>
        <span className="msub">org shape + typical designations</span>
      </div>

      <div className="maprow">
        <input placeholder="Company name or domain — e.g. Salesforce" value={company}
          onChange={(e) => setCompany(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <button className="btn" onClick={() => run()} disabled={loading || !company.trim() || !hasApify}>
          {loading ? "Mapping…" : "Map org"}
        </button>
        <button className="btn ghost" onClick={findCompetitors} disabled={compLoading || !company.trim()}>
          {compLoading ? "…" : "Competitors"}
        </button>
      </div>

      {!hasApify && <div className="mapnote">Add an Apify token in Settings to map a real org — showing the typical {fam.label} ladder meanwhile.</div>}
      {error && <div className="mapnote bad">{error}</div>}

      {competitors.length > 0 && (
        <div className="comps">
          {competitors.map((c) => (
            <button key={c} onClick={() => { setCompany(c); run(c); }} title={`Map ${c} instead`}>{c}</button>
          ))}
        </div>
      )}

      <div className="maplayout">
        <ul className="tree"><Node node={tree} /></ul>
        {levels.length > 0 && (
          <div className="levels">
            <h4>{people.length ? "People per level" : "Designations & levels"}</h4>
            {levels.map((l, i) => (
              <div className="lvl" key={i}>
                <b>{l.label}</b>
                <span className={l.band ? "band" : ""}>{l.band || l.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
