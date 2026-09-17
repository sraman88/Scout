// DocPreview — pop-out viewer for a document found by lib/docFinder.js.
//   doc = { type: "pdf" | "doc" | "ppt", url, title }
// PDFs render in the browser directly. Word and PowerPoint go through the
// Office Online viewer, which can only reach a publicly readable URL — hence
// the note, and the download link that always works either way.
export default function DocPreview({ doc, onClose }) {
  if (!doc) return null;
  const office = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(doc.url)}`;
  const src = doc.type === "pdf" ? doc.url : office;
  return (
    <div className="dp-overlay" onClick={onClose}>
      <div className="dp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dp-bar">
          <span className="dp-badge">{(doc.type || "doc").toUpperCase()}</span>
          <span className="dp-title">{doc.title || doc.url}</span>
          <a className="dp-dl" href={doc.url} download target="_blank" rel="noreferrer">Download</a>
          <button className="dp-x" onClick={onClose} aria-label="Close preview">×</button>
        </div>
        <iframe className="dp-frame" src={src} title="Document preview" />
        {doc.type !== "pdf" && (
          <div className="dp-note">Word and PowerPoint preview through Office Online, which needs a public URL — if the frame stays blank, use Download.</div>
        )}
      </div>
    </div>
  );
}
