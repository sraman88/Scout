import { getStoredKey } from "../lib/storage.js";
import { buildXRayQuery } from "../lib/social.js";
import { availableBackends } from "../lib/serp.js";

/* Says plainly which sources are live and what each one is running on.

   Nothing here needs a key any more: the LinkedIn X-ray runs on every search,
   web search falls through Brave -> SearXNG -> keyless engines -> Apify, and
   the free technical sources need nothing at all. A token still raises yield,
   so the notes say what each source is currently using rather than warning
   about what is missing. */

export default function SourceStatus({ spec, family }) {
  const hasApify = !!getStoredKey("apify");
  const hasGithub = !!getStoredKey("github");
  const technical = family === "engineering" || family === "techsupport";

  /* The first available backend is the one a web search will actually use. */
  const backend = availableBackends()[0];

  const rows = [
    { id: "linkedin", label: "LinkedIn", live: true,
      note: hasApify ? "live · X-ray + Apify actor" : "live · keyless X-ray, lower yield" },
    { id: "web", label: "Web search", live: true, note: `live · ${backend.label}` },
    { id: "github", label: "GitHub", live: technical, note: technical ? (hasGithub ? "live" : "live · unauthenticated, low rate limit") : "not used for this role" },
    { id: "stackoverflow", label: "StackOverflow", live: technical, note: technical ? "live" : "not used for this role" },
    { id: "free", label: "dev.to · HF · GitLab", live: technical, note: technical ? "live · keyless" : "not used for this role" },
  ];

  const titles = spec?.titles?.slice(0, 3).join(" ") || "";
  const loc = spec?.locations?.[0] || "India";
  const skills = spec?.skills || [];
  const xrays = [
    { label: "LinkedIn profiles", q: buildXRayQuery("linkedin.com", { profQuery: titles, mustHave: skills, ghLocation: loc }) },
    { label: "Naukri (India)", q: buildXRayQuery("naukri.com", { profQuery: titles, mustHave: skills, ghLocation: loc }) },
    { label: "Resumes / CVs", q: `(filetype:pdf OR filetype:doc) (resume OR CV) ${titles} "${loc}"` },
  ];

  return (
    <div className="srcstatus">
      <div className="ssrow">
        {rows.map((r) => (
          <span key={r.id} className={"ss" + (r.live ? " on" : "")} title={r.note}>
            <i /> {r.label}<em>{r.note}</em>
          </span>
        ))}
      </div>

      {!hasApify && (
        <div className="ssxray">
          <b>Running fully keyless.</b> LinkedIn is searched by X-ray across two engines, which returns fewer
          results and no headshots than the paid actor. Add a Brave key or an Apify token in Settings to raise
          yield — or widen the net by hand:
          <div className="xlinks">
            {xrays.map((x) => (
              <a key={x.label} href={`https://www.google.com/search?q=${encodeURIComponent(x.q)}`} target="_blank" rel="noreferrer">{x.label} ↗</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
