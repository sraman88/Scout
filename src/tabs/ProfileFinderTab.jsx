import { T } from "../theme.js";
import { Card, FieldLabel, TextArea, TextInput, Row, Field, Divider, SourceBtn, ErrBox, Empty, LoadingPulse, MicroBtn, Badge, CopyBtn } from "../components/ui.jsx";
import { chip, miniBtn } from "../components/styleHelpers.js";

export function ProfileFinderTab({ profQuery, setProfQuery, ghLocation, setGhLocation, ghLanguage, setGhLanguage, ghMinFollowers, setGhMinFollowers, ghExpYears, setGhExpYears, profSrc, profResults, profLoading, profError, profFetched, findProfiles, pickCandidate, saveCandidate, saved, ctx, country }) {
  const quickSkills = ctx.must_have.slice(0, 6);
  const indianLocations = ["Bangalore, India", "Hyderabad, India", "Pune, India", "Mumbai, India", "Chennai, India", "Delhi, India", "Gurgaon, India", "Noida, India"];
  const globalLocations = ["Remote", "San Francisco", "New York", "London", "Berlin", "Singapore", "Toronto"];
  const locs = country.code === "IN" ? indianLocations : [...globalLocations, country.default_loc].filter(Boolean);

  return (
    <div>
      <Card title="MULTI-SOURCE CANDIDATE SEARCH" accent={T.cyan}>
        <FieldLabel>Keywords / skills</FieldLabel>
        <TextArea value={profQuery} onChange={(e) => setProfQuery(e.target.value)} placeholder="python, kafka, microservices..." rows={3} />
        {quickSkills.length > 0 && (
          <>
            <FieldLabel style={{ marginTop: 8 }}>FROM JD — CLICK TO ADD</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {quickSkills.map((s) => <button key={s} onClick={() => { if (!profQuery.toLowerCase().includes(s.toLowerCase())) setProfQuery((profQuery + " " + s).trim()); }} style={chip(T.cyan)}>+ {s}</button>)}
            </div>
          </>
        )}
        <Row style={{ marginTop: 14 }}>
          <Field>
            <FieldLabel>Location</FieldLabel>
            <TextInput value={ghLocation} onChange={(e) => setGhLocation(e.target.value)} placeholder={country.default_loc} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {locs.map((l) => <button key={l} onClick={() => setGhLocation(l)} style={chip(T.purple, true)}>{l}</button>)}
            </div>
          </Field>
          <Field>
            <FieldLabel>Language</FieldLabel>
            <TextInput value={ghLanguage} onChange={(e) => setGhLanguage(e.target.value)} placeholder="Python" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {["Python", "JavaScript", "Go", "Java", "TypeScript", "Rust"].map((l) => <button key={l} onClick={() => setGhLanguage(l)} style={chip(T.purple, true)}>{l}</button>)}
            </div>
          </Field>
        </Row>
        <Row style={{ marginTop: 10 }}>
          <Field><FieldLabel>Min Followers</FieldLabel><TextInput value={ghMinFollowers} onChange={(e) => setGhMinFollowers(e.target.value)} placeholder="10" /></Field>
          <Field>
            <FieldLabel>Experience (yrs) — proxied by GitHub account age</FieldLabel>
            <TextInput value={ghExpYears} onChange={(e) => setGhExpYears(e.target.value)} placeholder="5" />
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {["2", "3", "5", "8", "10"].map((y) => <button key={y} onClick={() => setGhExpYears(y)} style={chip(T.amber, true)}>{y}+ yrs</button>)}
            </div>
          </Field>
        </Row>
        <Divider label="SELECT SOURCE" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <SourceBtn active={profSrc === "github"} onClick={() => findProfiles("github")}>● GITHUB</SourceBtn>
          <SourceBtn active={profSrc === "stackoverflow"} onClick={() => findProfiles("stackoverflow")}>● STACK OVERFLOW</SourceBtn>
          <SourceBtn active={profSrc === "hackernews"} onClick={() => findProfiles("hackernews")}>● HACKER NEWS</SourceBtn>
          <SourceBtn active={profSrc === "xray-linkedin"} onClick={() => findProfiles("xray-linkedin")}>● X-RAY LINKEDIN+</SourceBtn>
          <SourceBtn active={profSrc === "xray-github"} onClick={() => findProfiles("xray-github")}>● X-RAY GITHUB+DEV.TO+X</SourceBtn>
        </div>
        {profError && <ErrBox>{profError}</ErrBox>}
      </Card>

      {profLoading && <Card><LoadingPulse /></Card>}
      {profFetched && !profLoading && profResults.length === 0 && !profError && <Card><Empty label="No results. Try different filters or source." /></Card>}

      {profResults.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.text3, letterSpacing: 2 }}>{profResults.length} RESULTS · {profSrc.toUpperCase()}</div>
            {profSrc !== "xray-linkedin" && profSrc !== "xray-github" && <MicroBtn onClick={() => exportCSV(profResults)} color={T.green}>↓ EXPORT CSV</MicroBtn>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {profResults.map((p, i) => <ProfileCard key={i} p={p} pickCandidate={pickCandidate} saveCandidate={saveCandidate} saved={saved} />)}
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Card title={`SAVED PROFILES (${saved.length})`} accent={T.green}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
              {saved.map((p, i) => (
                <div key={i} style={{ padding: 10, background: T.bg3, border: `1px solid ${T.greenDim}`, borderRadius: 8 }}>
                  <div style={{ color: T.green, fontFamily: T.mono, fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ color: T.text3, fontSize: 11 }}>{p.username} · {p.source}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <MicroBtn color={T.cyan} onClick={() => pickCandidate(p, "email")}>EMAIL + SOCIAL</MicroBtn>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ProfileCard({ p, pickCandidate, saveCandidate, saved }) {
  const isSaved = saved.some((s) => s.username === p.username && s.source === p.source);
  const isXray = p.source === "xray";
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.cyanDim}`, borderRadius: 10, padding: 14, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.cyan}, transparent)` }} />
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, border: `1px solid ${T.cyanDim}` }} />
        ) : (
          <div style={{ width: 48, height: 48, background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: T.cyan, fontFamily: T.display, fontWeight: 700, fontSize: 20 }}>{(p.name || p.username || "?").slice(0, 1).toUpperCase()}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <div style={{ color: T.text, fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || p.username}</div>
            <Badge color={p.source === "github" ? T.cyan : p.source === "stackoverflow" ? T.amber : p.source === "hn" ? T.purple : T.green}>{p.source.toUpperCase()}</Badge>
          </div>
          {p.username && p.username !== p.name && <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11 }}>@{p.username}</div>}
          {p.location && <div style={{ color: T.text2, fontSize: 12, marginTop: 2 }}>📍 {p.location}</div>}
        </div>
      </div>
      {p.bio && <div style={{ color: T.text2, fontSize: 13, marginTop: 10, lineHeight: 1.4, maxHeight: 90, overflow: "hidden", wordBreak: "break-word" }}>{p.bio}</div>}
      {(p.followers != null || p.public_repos != null) && (
        <div style={{ display: "flex", gap: 12, marginTop: 10, fontFamily: T.mono, fontSize: 11, color: T.text3 }}>
          {p.followers != null && <span>★ {p.followers}</span>}
          {p.public_repos != null && <span>⬡ {p.public_repos}</span>}
          {p.created_at && <span>📅 {new Date(p.created_at).getFullYear()}</span>}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {isXray && p.xray_query && <CopyBtn text={p.xray_query} />}
        {!isXray && p.profile_url && <a href={p.profile_url} target="_blank" rel="noreferrer" style={{ ...miniBtn(T.cyan), textDecoration: "none", display: "inline-block" }}>↗ OPEN</a>}
        {!isXray && <MicroBtn color={T.green} onClick={() => pickCandidate(p, "email")}>✉ EMAIL + SOCIAL</MicroBtn>}
        {!isXray && <MicroBtn color={isSaved ? T.text3 : T.green} onClick={() => saveCandidate(p)} disabled={isSaved}>{isSaved ? "✓ SAVED" : "💾 SAVE"}</MicroBtn>}
      </div>
    </div>
  );
}

function exportCSV(rows) {
  const cols = ["source", "name", "username", "profile_url", "location", "company", "bio", "followers", "public_repos"];
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => `"${(r[c] == null ? "" : String(r[c])).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `scout_${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}
