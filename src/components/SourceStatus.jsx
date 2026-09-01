import { getStoredKey } from "../lib/storage.js";
import { buildXRayQuery } from "../lib/social.js";

/* Says plainly which sources are live and which need a key.

   LinkedIn and Google both run through Apify, so with only an LLM key the feed
   is GitHub-only and silently looks broken ("I don't see linkedin at all").
   The X-ray links below are the free fallback: the same boolean, opened in
   Google, no token required. */
const NEEDS_APIFY = "Needs an Apify token";

export default function SourceStatus({ spec, family }) {
  const hasApify = !!getStoredKey("apify");
  const hasGithub = !!getStoredKey("github");
  const technical = family === "engineering" || family === "techsupport";

  const rows = [
    { id: "linkedin", label: "LinkedIn", live: hasApify, note: hasApify ? "live" : NEEDS_APIFY },
    { id: "google", label: "Google", live: hasApify, note: hasApify ? "live" : NEEDS_APIFY },
    { id: "github", label: "GitHub", live: technical, note: technical ? (hasGithub ? "live" : "live · unauthenticated, low rate limit") : "not used for this role" },
    { id: "stackoverflow", label: "StackOverflow", live: technical, note: technical ? "live" : "not used for this role" },
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
          <b>No Apify token — LinkedIn and Google can’t be searched in-app.</b> Add one in Settings, or run these free X-ray searches:
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
