/* A sourcing lead (currently Hacker News threads) — deliberately a different
   shape from CandidateCard, because a thread is not a person. Mixing the two
   is what put "Ask HN: ..." in the results at 100% match. */
export default function LeadCard({ lead = {} }) {
  const host = lead.articleUrl ? safeHost(lead.articleUrl) : "";
  return (
    <article className="lead">
      <div className="lhead">
        <span className="lsrc">Y</span>
        <a className="ltitle" href={lead.hnUrl} target="_blank" rel="noreferrer">{lead.title}</a>
        {lead.people ? <span className="lflag">people inside</span> : null}
      </div>

      {lead.summary && <div className="lsum">{lead.summary}</div>}
      {lead.value && <div className="lval">{lead.value}</div>}

      <div className="lmeta">
        {lead.points ? <span>▲ {lead.points}</span> : null}
        {lead.comments ? <a href={lead.hnUrl} target="_blank" rel="noreferrer">{lead.comments} comments</a> : null}
        {lead.author ? <span>by {lead.author}</span> : null}
        {host ? <a href={lead.articleUrl} target="_blank" rel="noreferrer">{host} ↗</a> : null}
      </div>
    </article>
  );
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
