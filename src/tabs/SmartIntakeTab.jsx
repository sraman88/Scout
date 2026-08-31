import { useState } from "react";
import { T } from "../theme.js";
import { searchLinkedInCandidates, searchGoogleResults } from "../lib/apifySearch.js";
import { searchGitHubUsers } from "../lib/github.js";
import { scoreBatch } from "../lib/scoreProfile.js";
import { getCompetitorModel } from "../lib/competitorModel.js";
import { Card, PrimaryBtn, ErrBox, Empty, LoadingPulse } from "../components/ui.jsx";
import IntakePanel from "../components/IntakePanel.jsx";
import CandidateCard from "../components/CandidateCard.jsx";

/* prefilter/scoreProfile (lib/relevanceEngine.js, lib/scoreProfile.js) read
   profile.title/summary/skills — our search functions return `bio` instead,
   so map it across without losing the original fields (username/source/
   profile_url) Save + Email + social need downstream. */
function toIntakeProfile(p) {
  return { ...p, title: p.bio || p.title || "", org: p.company || p.org || "", summary: p.bio || "", skills: [] };
}

function toCardProfile(p) {
  const sourceLabel = p.source === "github" ? "GitHub" : p.source === "linkedin" ? "LinkedIn" : "Google";
  return {
    name: p.name, title: p.title, org: p.org, location: p.location,
    avatarUrl: p.avatar_url, url: p.profile_url, match: p.match,
    sources: [{ id: p.source, label: sourceLabel, url: p.profile_url }],
    contact: {},
    _raw: p,
  };
}

export function SmartIntakeTab({ pickCandidate, saveCandidate }) {
  const [spec, setSpec] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  async function sourceCandidates() {
    if (!spec) return;
    setLoading(true); setError(""); setWarning(""); setResults([]);
    try {
      const location = (spec.locations || [])[0] || "India";
      const keywordQuery = (spec.titles || []).slice(0, 3).join(" ");
      const [gh, li, go] = await Promise.allSettled([
        searchGitHubUsers({ ghLanguage: (spec.skills || [])[0] || "", ghLocation: location }),
        searchLinkedInCandidates({ query: keywordQuery, location }),
        searchGoogleResults({ query: `${keywordQuery} ${location} (site:linkedin.com/in OR resume OR profile)`.trim() }),
      ]);
      const warnings = [];
      let merged = [];
      if (gh.status === "fulfilled") merged = merged.concat(gh.value); else warnings.push(`GitHub: ${gh.reason?.message || gh.reason}`);
      if (li.status === "fulfilled") merged = merged.concat(li.value); else warnings.push(`LinkedIn: ${li.reason?.message || li.reason}`);
      if (go.status === "fulfilled") merged = merged.concat(go.value); else warnings.push(`Google: ${go.reason?.message || go.reason}`);
      if (warnings.length) setWarning(warnings.join(" · "));

      if (merged.length) {
        const scored = await scoreBatch(merged.map(toIntakeProfile), spec);
        setResults(scored);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <IntakePanel callModel={getCompetitorModel()} onSpec={setSpec} />

      {spec && (
        <Card accent={T.green}>
          <PrimaryBtn onClick={sourceCandidates} disabled={loading}>
            {loading ? "SOURCING + SCORING..." : "→ SOURCE CANDIDATES"}
          </PrimaryBtn>
          <div style={{ marginTop: 8, color: T.text3, fontFamily: T.mono, fontSize: 11, lineHeight: 1.5 }}>
            Fetches real profiles from LinkedIn, GitHub, and Google, deterministically pre-filters for free, then LLM-scores only the survivors against this spec.
          </div>
          {warning && <div style={{ marginTop: 10, padding: "8px 12px", background: `${T.amber}11`, border: `1px solid ${T.amber}44`, borderRadius: 6, color: T.amber, fontFamily: T.mono, fontSize: 11, lineHeight: 1.5 }}>{warning}</div>}
          {error && <ErrBox>{error}</ErrBox>}
        </Card>
      )}

      {loading && <Card><LoadingPulse /></Card>}
      {!loading && spec && results.length === 0 && !error && (
        <Card><Empty label="Click Source Candidates to fetch + score real profiles against this spec." /></Card>
      )}

      {results.length > 0 && (
        <>
          <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11, letterSpacing: 1.5, marginBottom: 10 }}>
            {results.length} SCORED · {results.filter((r) => r.match?.tier === "Strong").length} STRONG MATCHES
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
            {results.map((p, i) => (
              <CandidateCard
                key={p.username || p.profile_url || i}
                profile={toCardProfile(p)}
                onOpen={(_profile, url) => url && window.open(url, "_blank", "noopener,noreferrer")}
                onSave={(profile) => saveCandidate(profile._raw)}
                onEmail={(profile) => pickCandidate(profile._raw, "email")}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
