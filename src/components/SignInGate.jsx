import { useEffect, useState } from "react";
import { T } from "../theme.js";
import { Card, PrimaryBtn, LoadingPulse, ErrBox } from "./ui.jsx";
import { isConfigured } from "../lib/firebase.js";
import { signInWithGoogle, signOutUser, subscribeAuth, loadSettingsDoc, saveSettingsField } from "../lib/cloudAuth.js";
import { hydrateCache, resetCache, setPersistHandler } from "../lib/storage.js";
import { AuthContext } from "../lib/authContext.js";

export function SignInGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined = auth state not resolved yet, null = signed out
  const [hydrated, setHydrated] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!isConfigured) return;
    const unsubscribe = subscribeAuth((u) => {
      setUser(u);
      setHydrated(false);
      if (u) {
        setPersistHandler((name, value) => { saveSettingsField(u.uid, name, value).catch(() => { /* best-effort sync */ }); });
        loadSettingsDoc(u.uid)
          .then((data) => hydrateCache(data))
          .catch((e) => setAuthError(e.message || String(e)))
          .finally(() => setHydrated(true));
      } else {
        setPersistHandler(null);
        resetCache();
      }
    });
    return unsubscribe;
  }, []);

  async function handleSignIn() {
    setAuthError("");
    try { await signInWithGoogle(); } catch (e) { setAuthError(e.message || String(e)); }
  }

  if (!isConfigured) {
    return (
      <FullScreen>
        <Card title="FIREBASE NOT CONFIGURED" accent={T.red}>
          <div style={{ color: T.text2, fontSize: 13, lineHeight: 1.6 }}>
            Scout needs a Firebase project for Google sign-in and per-account key storage. Add the <code>VITE_FIREBASE_*</code> values from your Firebase project's Web App config to <code>.env.local</code> (see <code>.env.example</code>) and restart the dev server.
          </div>
        </Card>
      </FullScreen>
    );
  }

  if (user === undefined) {
    return <FullScreen><LoadingPulse /></FullScreen>;
  }

  if (!user) {
    return (
      <FullScreen>
        <Card title="SIGN IN TO SCOUT" accent={T.cyan}>
          <div style={{ color: T.text2, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            Sign in with Google to use Scout. Your API keys (Groq, Gemini, GitHub, Apify) are saved to your account and follow you across browsers and devices — nobody else's keys are shared with you, and yours aren't shared with anyone else.
          </div>
          <PrimaryBtn onClick={handleSignIn}>→ SIGN IN WITH GOOGLE</PrimaryBtn>
          {authError && <ErrBox>{authError}</ErrBox>}
        </Card>
      </FullScreen>
    );
  }

  if (!hydrated) {
    return <FullScreen><LoadingPulse /></FullScreen>;
  }

  return (
    <AuthContext.Provider value={{ user, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

function FullScreen({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.body, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>{children}</div>
    </div>
  );
}
