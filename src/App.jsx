import { useState } from "react";
import { getStoredKey, setStoredKey } from "./lib/storage.js";
import { SettingsModal } from "./components/SettingsModal.jsx";
import ScoutPage from "./components/ScoutPage.jsx";
import { ENV_GROQ, ENV_GEMINI } from "./theme.js";
import "./components/scout-theme.css";

/* One page, no tabs. Search -> smart intake -> profiles -> company map all
   stack on a single screen; the only modal left is Settings, since API keys
   have to live somewhere. */
export default function App() {
  const [showSettings, setShowSettings] = useState(() => {
    const hasAnyKey = getStoredKey("groq") || getStoredKey("gemini") || ENV_GROQ || ENV_GEMINI;
    return !hasAnyKey && !getStoredKey("onboarding_done");
  });
  const [provider, setProvider] = useState(() => getStoredKey("provider_pref") || "auto");
  function changeProvider(p) { setProvider(p); setStoredKey("provider_pref", p); }

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">S<span>C</span>OUT</div>
        <div className="topright">
          <span className="tag">Sourcing intelligence · one screen</span>
          <button className="iconbtn" onClick={() => setShowSettings(true)} title="API keys & settings">⚙ Settings</button>
        </div>
      </div>

      <ScoutPage />

      {showSettings && <SettingsModal close={() => setShowSettings(false)} provider={provider} setProvider={changeProvider} />}
    </div>
  );
}
