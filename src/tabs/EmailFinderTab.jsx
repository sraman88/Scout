import { T } from "../theme.js";
import { getStoredKey } from "../lib/storage.js";
import { Card, FieldLabel, TextInput, Row, Field, PrimaryBtn, ErrBox, Empty, LoadingPulse, Stat, Pills, CopyBtn } from "../components/ui.jsx";

export function EmailFinderTab({ emailUser, setEmailUser, emailFullName, setEmailFullName, emailLoading, emailResult, emailError, findEmail, picked, emailLinkedInUrl, setEmailLinkedInUrl, apifyProfLoading, apifyProfResult, apifyProfError, enrichViaApify }) {
  const hasApify = !!getStoredKey("apify");
  return (
    <div>
      <Card title="MULTI-SOURCE EMAIL + SOCIAL HANDLE FINDER" accent={T.green}>
        <Row>
          <Field><FieldLabel>GitHub Username / Handle</FieldLabel><TextInput value={emailUser} onChange={(e) => setEmailUser(e.target.value)} placeholder="torvalds" /></Field>
          <Field><FieldLabel>Full Name (for X-Ray)</FieldLabel><TextInput value={emailFullName} onChange={(e) => setEmailFullName(e.target.value)} placeholder="Linus Torvalds" /></Field>
        </Row>
        {picked && <div style={{ marginTop: 8, padding: "8px 12px", background: `${T.purple}11`, border: `1px solid ${T.purple}33`, borderRadius: 6, fontSize: 12, color: T.text2 }}><span style={{ color: T.purple, fontWeight: 700 }}>FROM PROFILE: </span>{picked.name} (@{picked.username}) · auto-filled</div>}
        <PrimaryBtn onClick={() => findEmail()} disabled={emailLoading} style={{ marginTop: 14 }}>{emailLoading ? "SCANNING..." : "→ SCAN ALL SOURCES"}</PrimaryBtn>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 1.5, alignSelf: "center" }}>SCANS:</span>
          {["GitHub profile", "Push commits", "Repo commits", "Reddit", "Dev.to", "Hacker News", "X-Ray (LinkedIn/X/Facebook/Instagram)"].map((s) => <span key={s} style={{ padding: "3px 8px", background: T.bg3, border: `1px solid ${T.cyanDim}`, borderRadius: 4, fontFamily: T.mono, fontSize: 10, color: T.text2 }}>{s}</span>)}
        </div>
        {emailError && <ErrBox>{emailError}</ErrBox>}
      </Card>

      <Card title="LINKEDIN PROFILE + EMAIL (via Apify)" accent={T.purple}>
        <div style={{ marginBottom: 10, padding: "8px 12px", background: `${T.purple}11`, border: `1px solid ${T.purpleDim}`, borderRadius: 6, color: T.text2, fontSize: 12, fontFamily: T.mono, lineHeight: 1.5 }}>
          {hasApify
            ? "Paste a LinkedIn profile URL or username → get name, headline, company, title, EMAIL, experience, education. ~$0.02-0.05 per profile from your Apify credit."
            : "Add an Apify token in Settings (⚙) to enable this. Free tier: $5/mo = ~100 profile lookups."}
        </div>
        <Row>
          <Field><FieldLabel>LinkedIn Profile URL or Username</FieldLabel><TextInput value={emailLinkedInUrl} onChange={(e) => setEmailLinkedInUrl(e.target.value)} placeholder="https://linkedin.com/in/username OR just username" /></Field>
        </Row>
        <PrimaryBtn onClick={() => enrichViaApify()} disabled={apifyProfLoading || !hasApify} style={{ marginTop: 14 }}>
          {apifyProfLoading ? "SCRAPING LINKEDIN..." : "→ APIFY ENRICH (Profile + Email)"}
        </PrimaryBtn>
        {apifyProfError && <ErrBox>{apifyProfError}</ErrBox>}
      </Card>

      {apifyProfLoading && <Card><LoadingPulse /></Card>}

      {apifyProfResult && (
        <Card title="LINKEDIN PROFILE (Apify)" accent={T.purple}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
            {apifyProfResult.pictureUrl && <img src={apifyProfResult.pictureUrl} alt="" style={{ width: 72, height: 72, borderRadius: 10, border: `1px solid ${T.purpleDim}` }} />}
            <div style={{ flex: 1 }}>
              <div style={{ color: T.text, fontFamily: T.display, fontSize: 22, fontWeight: 700 }}>{apifyProfResult.name || "Unknown"}</div>
              {apifyProfResult.headline && <div style={{ color: T.text2, fontSize: 14, marginTop: 4 }}>{apifyProfResult.headline}</div>}
              {apifyProfResult.location && <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 12, marginTop: 4 }}>📍 {apifyProfResult.location}</div>}
              {apifyProfResult.profileUrl && <a href={apifyProfResult.profileUrl} target="_blank" rel="noreferrer" style={{ fontFamily: T.mono, fontSize: 11, marginTop: 6, display: "inline-block" }}>↗ LinkedIn Profile</a>}
            </div>
          </div>

          {apifyProfResult.emails.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <FieldLabel style={{ color: T.green }}>✉ EMAILS FOUND ({apifyProfResult.emails.length})</FieldLabel>
              {apifyProfResult.emails.map((em) => (
                <div key={em} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: `${T.green}11`, borderRadius: 6, marginBottom: 6, border: `1px solid ${T.green}55` }}>
                  <span style={{ color: T.green, fontSize: 14 }}>●</span>
                  <span style={{ color: T.text, fontFamily: T.mono, fontSize: 14, flex: 1, wordBreak: "break-all" }}>{em}</span>
                  <CopyBtn text={em} />
                </div>
              ))}
            </div>
          )}

          <Row>
            {apifyProfResult.currentCompany && <Stat label="COMPANY">{apifyProfResult.currentCompany}</Stat>}
            {apifyProfResult.currentTitle && <Stat label="TITLE">{apifyProfResult.currentTitle}</Stat>}
            {apifyProfResult.connections > 0 && <Stat label="CONNECTIONS">{apifyProfResult.connections.toLocaleString()}</Stat>}
            {apifyProfResult.followers > 0 && <Stat label="FOLLOWERS">{apifyProfResult.followers.toLocaleString()}</Stat>}
          </Row>

          {apifyProfResult.phone && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: `${T.amber}11`, border: `1px solid ${T.amber}44`, borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: T.amber, fontFamily: T.mono, fontSize: 11, fontWeight: 700 }}>PHONE:</span>
              <span style={{ color: T.text, fontFamily: T.mono, fontSize: 13 }}>{apifyProfResult.phone}</span>
              <CopyBtn text={apifyProfResult.phone} />
            </div>
          )}

          {apifyProfResult.about && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel>ABOUT</FieldLabel>
              <div style={{ padding: 12, background: T.bg3, border: `1px solid ${T.purpleDim}`, borderRadius: 7, fontSize: 13, color: T.text2, lineHeight: 1.5, maxHeight: 180, overflowY: "auto" }}>{apifyProfResult.about}</div>
            </div>
          )}

          {apifyProfResult.experience && apifyProfResult.experience.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel>EXPERIENCE ({apifyProfResult.experience.length})</FieldLabel>
              <div style={{ display: "grid", gap: 6 }}>
                {apifyProfResult.experience.slice(0, 6).map((e, i) => {
                  const dateRange = e.dateRange || e.duration || e.dates
                    || (e.jobStartedOn && `${e.jobStartedOn} – ${e.jobStillWorking ? "Present" : (e.jobEndedOn || "")}`);
                  return (
                    <div key={i} style={{ padding: 10, background: T.bg3, border: `1px solid ${T.purpleDim}`, borderRadius: 6 }}>
                      <div style={{ color: T.purple, fontFamily: T.mono, fontSize: 12, fontWeight: 700 }}>{e.title || e.jobTitle || e.position || "—"}</div>
                      <div style={{ color: T.text2, fontSize: 13 }}>{e.companyName || e.company || "—"}</div>
                      {dateRange && <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11, marginTop: 2 }}>{dateRange}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {apifyProfResult.education && apifyProfResult.education.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel>EDUCATION</FieldLabel>
              <Pills items={apifyProfResult.education.map((e) => e.university || e.schoolName || e.school || e.name || e.title).filter(Boolean).slice(0, 6)} color={T.cyan} />
            </div>
          )}

          {apifyProfResult.skills && apifyProfResult.skills.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel>SKILLS</FieldLabel>
              <Pills items={apifyProfResult.skills.map((s) => (typeof s === "string" ? s : s.name || s.title)).filter(Boolean).slice(0, 20)} color={T.green} />
            </div>
          )}
        </Card>
      )}

      {emailLoading && <Card><LoadingPulse /></Card>}

      {emailResult && (
        <>
          <Card title="VERIFIED SOCIAL ACCOUNTS" accent={T.purple}>
            {emailResult.social_handles.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                {emailResult.social_handles.map((h) => <SocialHandle key={h.platform} {...h} />)}
              </div>
            ) : (
              <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 11, letterSpacing: 1 }}>○ No verified social handles auto-detected for this username. Try the X-Ray searches below (covers LinkedIn, X/Twitter, Facebook, Instagram).</div>
            )}
          </Card>

          <Card title="GITHUB CARBON FOOTPRINT" accent={T.cyan}>
            {emailResult.github.profile && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                {emailResult.github.profile.avatar_url && <img src={emailResult.github.profile.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, border: `1px solid ${T.cyanDim}` }} />}
                <div>
                  <div style={{ color: T.text, fontWeight: 600 }}>{emailResult.github.profile.name || emailResult.github.profile.login}</div>
                  <div style={{ color: T.text3, fontSize: 12 }}>{emailResult.github.profile.bio}</div>
                </div>
              </div>
            )}
            {emailResult.github.error && <ErrBox>{emailResult.github.error}</ErrBox>}
            {emailResult.github.emails.length === 0 ? (
              <Empty label="No emails surfaced from GitHub commits or profile" />
            ) : (
              <div>
                <FieldLabel>EMAILS FOUND ({emailResult.github.emails.length})</FieldLabel>
                {emailResult.github.emails.map((em) => (
                  <div key={em} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.bg3, borderRadius: 6, marginBottom: 6, border: `1px solid ${T.greenDim}` }}>
                    <span style={{ color: T.green, fontSize: 14 }}>●</span>
                    <span style={{ color: T.text, fontFamily: T.mono, fontSize: 13, flex: 1, wordBreak: "break-all" }}>{em}</span>
                    <CopyBtn text={em} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {(emailResult.reddit.found || emailResult.devto.found || emailResult.hn.found) && (
            <Card title="OTHER PLATFORM ACTIVITY" accent={T.amber}>
              {emailResult.reddit.found && (
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel>REDDIT (u/{emailResult.username})</FieldLabel>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Stat label="KARMA">{emailResult.reddit.karma?.toLocaleString() || "—"}</Stat>
                    <Stat label="JOINED">{emailResult.reddit.age || "—"}</Stat>
                  </div>
                  {emailResult.reddit.subs.length > 0 && <div style={{ marginTop: 8 }}><span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, marginRight: 8 }}>ACTIVE IN:</span>{emailResult.reddit.subs.map((s) => <span key={s} style={{ display: "inline-block", padding: "4px 10px", background: `${T.amber}11`, color: T.amber, border: `1px solid ${T.amber}44`, borderRadius: 999, fontSize: 12, marginRight: 6, marginBottom: 6, fontFamily: T.mono }}>r/{s}</span>)}</div>}
                  {emailResult.reddit.recent_posts.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {emailResult.reddit.recent_posts.map((p, i) => (
                        <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "6px 0", color: T.text2, fontSize: 13, borderBottom: `1px solid ${T.cyanDim}`, textDecoration: "none" }}>
                          <span style={{ color: T.amber, fontFamily: T.mono, fontSize: 10 }}>r/{p.sub} · {p.time}</span><br />{p.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {emailResult.devto.found && (
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel>DEV.TO ARTICLES</FieldLabel>
                  {emailResult.devto.posts.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "6px 0", color: T.text2, fontSize: 13, borderBottom: `1px solid ${T.cyanDim}`, textDecoration: "none" }}>
                      <span style={{ color: T.green, fontFamily: T.mono, fontSize: 10 }}>♥ {p.reactions} · {p.time}</span><br />{p.title}
                    </a>
                  ))}
                </div>
              )}
              {emailResult.hn.found && (
                <div>
                  <FieldLabel>HACKER NEWS (karma {emailResult.hn.karma})</FieldLabel>
                  {emailResult.hn.recent.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "6px 0", color: T.text2, fontSize: 13, borderBottom: `1px solid ${T.cyanDim}`, textDecoration: "none" }}>
                      <span style={{ color: T.purple, fontFamily: T.mono, fontSize: 10 }}>{p.type} · {p.time}</span><br />{p.title}
                    </a>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card title="X-RAY SEARCHES — LinkedIn / X / Facebook / Instagram / more (copy and paste into Google)" accent={T.purple}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
              {emailResult.xrays.map((x, i) => (
                <div key={i} style={{ padding: 10, background: T.bg3, border: `1px solid ${T.purpleDim}`, borderRadius: 6, display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.purple, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>{x.label}</div>
                    <div style={{ color: T.text2, fontFamily: T.mono, fontSize: 12, wordBreak: "break-word" }}>{x.query}</div>
                  </div>
                  <CopyBtn text={x.query} />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SocialHandle({ platform, handle, url, verified }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bg3, border: `1px solid ${verified ? T.greenDim : T.cyanDim}`, borderRadius: 8, textDecoration: "none" }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: verified ? T.green : T.amber, boxShadow: `0 0 8px ${verified ? T.green : T.amber}` }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: T.text3, fontFamily: T.mono, fontSize: 9, letterSpacing: 1.5 }}>{platform.toUpperCase()}</div>
        <div style={{ color: T.text, fontFamily: T.mono, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{handle}</div>
      </div>
    </a>
  );
}
