import { useState } from "react";
import { T } from "../theme.js";
import { getStoredKey, setStoredKey } from "../lib/storage.js";
import { FieldLabel, TextInput } from "./ui.jsx";

export function SettingsModal({ close, provider, setProvider }) {
  const [groq, setGroq] = useState(getStoredKey("groq"));
  const [gemini, setGemini] = useState(getStoredKey("gemini"));
  const [gh, setGh] = useState(getStoredKey("github"));
  const [apify, setApify] = useState(getStoredKey("apify"));
  const [apifyProfileActor, setApifyProfileActor] = useState(getStoredKey("apify_profile_actor") || "dev_fusion~linkedin-profile-scraper");
  const [apifySearchActor, setApifySearchActor] = useState(getStoredKey("apify_search_actor") || "harvestapi~linkedin-profile-search");
  const [apifyGoogleActor, setApifyGoogleActor] = useState(getStoredKey("apify_google_actor") || "apify~google-search-scraper");

  function save() {
    setStoredKey("groq", groq.trim());
    setStoredKey("gemini", gemini.trim());
    setStoredKey("github", gh.trim());
    setStoredKey("apify", apify.trim());
    setStoredKey("apify_profile_actor", apifyProfileActor.trim());
    setStoredKey("apify_search_actor", apifySearchActor.trim());
    setStoredKey("apify_google_actor", apifyGoogleActor.trim());
    setStoredKey("onboarding_done", "1");
    close();
  }
  function clearAll() { ["groq", "gemini", "github", "apify", "apify_profile_actor", "apify_search_actor", "apify_google_actor", "onboarding_done"].forEach((k) => setStoredKey(k, "")); setGroq(""); setGemini(""); setGh(""); setApify(""); }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backdropFilter: "blur(4px)" }} onClick={close}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg2, border: `1px solid ${T.cyan}`, borderRadius: 12, padding: 24, maxWidth: 540, width: "100%", boxShadow: `0 0 60px rgba(0,229,255,0.25)`, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: T.display, fontSize: 22, color: T.cyan, margin: 0 }}>⚙ Settings</h2>
          <button onClick={close} style={{ background: "transparent", border: "none", color: T.text3, fontSize: 22 }}>✕</button>
        </div>
        {!getStoredKey("onboarding_done") && (
          <div style={{ padding: 14, background: `linear-gradient(135deg, ${T.cyan}15, ${T.purple}15)`, border: `1px solid ${T.cyan}`, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 800, color: T.cyan, marginBottom: 6 }}>👋 Welcome to SCOUT</div>
            <div style={{ color: T.text, fontSize: 13, lineHeight: 1.6 }}>
              Your keys are saved to <strong style={{ color: T.cyan }}>your signed-in Google account</strong> (via Firestore) and follow you across browsers and devices — nobody else can see them, and you won't see anyone else's. Enter them once below and SCOUT is yours everywhere you sign in.
              <br /><br />
              <strong style={{ color: T.green }}>Minimum to start:</strong> one LLM key (Groq is fastest and free).<br />
              <strong style={{ color: T.amber }}>Recommended:</strong> also add a GitHub token to lift the rate limit 60→5000/hr.<br />
              <strong style={{ color: T.purple }}>For LinkedIn scraping:</strong> add Apify token + your chosen actor ID.
            </div>
          </div>
        )}
        <p style={{ color: T.text2, fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
          Keys sync to your Google account — never sent anywhere except the official APIs and your own Firebase project. Get free keys at:<br />
          · Groq: <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a><br />
          · Gemini: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a><br />
          · GitHub: <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">github.com/settings/tokens</a> (classic token, no scopes needed)<br />
          · Apify: <a href="https://console.apify.com/account/integrations" target="_blank" rel="noreferrer">console.apify.com/account/integrations</a> ($5/mo free credit)
        </p>
        <FieldLabel>GROQ API KEY</FieldLabel>
        <TextInput type="password" value={groq} onChange={(e) => setGroq(e.target.value)} placeholder="gsk_..." />
        <FieldLabel style={{ marginTop: 10 }}>GOOGLE GEMINI API KEY</FieldLabel>
        <TextInput type="password" value={gemini} onChange={(e) => setGemini(e.target.value)} placeholder="AIza..." />
        <FieldLabel style={{ marginTop: 10 }}>GITHUB TOKEN (recommended — 60→5000/hr)</FieldLabel>
        <TextInput type="password" value={gh} onChange={(e) => setGh(e.target.value)} placeholder="ghp_..." />
        <FieldLabel style={{ marginTop: 10 }}>APIFY API TOKEN (for LinkedIn profile scraping)</FieldLabel>
        <TextInput type="password" value={apify} onChange={(e) => setApify(e.target.value)} placeholder="apify_api_..." />
        <FieldLabel style={{ marginTop: 8 }}>APIFY LINKEDIN PROFILE + EMAIL ACTOR ID</FieldLabel>
        <TextInput value={apifyProfileActor} onChange={(e) => setApifyProfileActor(e.target.value)} placeholder="dev_fusion~linkedin-profile-scraper" />
        <p style={{ color: T.text3, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
          Browse actors at <a href="https://apify.com/store" target="_blank" rel="noreferrer">apify.com/store</a> — search "LinkedIn Profile Scraper + Email". Copy the actor ID (format: <span style={{ fontFamily: T.mono, color: T.cyan }}>author~actor-name</span>). Costs ~$0.02-0.10 per lookup; free tier gives $5/mo (50-250 lookups).
        </p>
        <FieldLabel style={{ marginTop: 8 }}>APIFY LINKEDIN SEARCH ACTOR ID (for candidate search, not single-profile lookup)</FieldLabel>
        <TextInput value={apifySearchActor} onChange={(e) => setApifySearchActor(e.target.value)} placeholder="harvestapi~linkedin-profile-search" />
        <FieldLabel style={{ marginTop: 8 }}>APIFY GOOGLE SEARCH ACTOR ID</FieldLabel>
        <TextInput value={apifyGoogleActor} onChange={(e) => setApifyGoogleActor(e.target.value)} placeholder="apify~google-search-scraper" />
        <p style={{ color: T.text3, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
          These two power the auto-populated Profiles feed after a JD is analysed. LinkedIn search costs ~$0.10/search page; Google search is near-free on Apify's free tier. Both need the same Apify token above.
        </p>
        <FieldLabel style={{ marginTop: 16 }}>PREFERRED LLM PROVIDER</FieldLabel>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setProvider("groq")} style={{ flex: 1, padding: "10px 14px", background: provider === "groq" ? T.cyan : "transparent", color: provider === "groq" ? T.bg : T.text2, border: `1px solid ${provider === "groq" ? T.cyan : T.cyanDim}`, borderRadius: 7, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>GROQ (Llama 3.3)</button>
          <button onClick={() => setProvider("gemini")} style={{ flex: 1, padding: "10px 14px", background: provider === "gemini" ? T.cyan : "transparent", color: provider === "gemini" ? T.bg : T.text2, border: `1px solid ${provider === "gemini" ? T.cyan : T.cyanDim}`, borderRadius: 7, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>GEMINI (1.5 Flash)</button>
        </div>
        <p style={{ color: T.text3, fontSize: 11, marginTop: 8 }}>If preferred provider fails, app auto-falls back to the other.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={save} style={{ flex: 1, padding: "12px 18px", background: `linear-gradient(90deg, ${T.cyan}, ${T.purple})`, color: T.bg, border: "none", borderRadius: 8, fontFamily: T.mono, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>SAVE</button>
          <button onClick={clearAll} style={{ padding: "12px 18px", background: "transparent", color: T.red, border: `1px solid ${T.red}66`, borderRadius: 8, fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>CLEAR ALL</button>
        </div>
      </div>
    </div>
  );
}
