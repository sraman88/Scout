
// CompanyMap — the contrasting dark panel + org tree (matches scout-theme.css).
// tree  = { role, meta, head?, children:[...] }   (recursive)
// levels = [{ label, value, band? }]
function Node({ node }) {
  return (
    <li>
      <div className={"node" + (node.head ? " head" : "")}>
        <div className="role">{node.role}</div>
        {node.meta && <div className="meta">{node.meta}</div>}
      </div>
      {node.children?.length ? (
        <ul>{node.children.map((c, i) => <Node key={i} node={c} />)}</ul>
      ) : null}
    </li>
  );
}

export default function CompanyMap({ title = "Company mapping", subtitle = "org shape + typical designations", tree, levels = [] }) {
  if (!tree) return null;
  return (
    <div className="map">
      <div className="mh"><h3>{title}</h3><span className="msub">{subtitle}</span></div>
      <div className="maplayout">
        <ul className="tree"><Node node={tree} /></ul>
        {levels.length > 0 && (
          <div className="levels">
            <h4>Designations &amp; levels</h4>
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
