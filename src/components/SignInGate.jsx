import { useEffect, useState } from "react";
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
      <Screen>
        <h1>Firebase isn't configured</h1>
        <p>
          Scout needs a Firebase project for Google sign-in and per-account key storage. Add the{" "}
          <code>VITE_FIREBASE_*</code> values from your project's Web App config to <code>.env.local</code>{" "}
          (see <code>.env.example</code>) and restart the dev server.
        </p>
      </Screen>
    );
  }

  if (user === undefined) return <Screen busy label="Checking your session…" />;

  if (!user) {
    return (
      <Screen>
        <h1>Sign in to Scout</h1>
        <p>
          Your API keys are saved to your own Google account and follow you across browsers and devices.
          Nobody else's keys are shared with you, and yours aren't shared with anyone.
        </p>
        <button className="btn-pri" style={{ width: "100%" }} onClick={handleSignIn}>Sign in with Google</button>
        {authError && <div className="errbox" role="alert">{authError}</div>}
      </Screen>
    );
  }

  if (!hydrated) return <Screen busy label="Loading your settings…" />;

  return (
    <AuthContext.Provider value={{ user, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

/* One centred card, used by every pre-app state: missing config, checking the
   session, signed out, hydrating. */
function Screen({ children, busy, label }) {
  return (
    <div className="screen">
      <div className="screen-card">
        <div className="brandmark">S<span>C</span>OUT</div>
        {busy ? (
          <>
            <div className="spinner" role="status" aria-label={label || "Loading"} />
            <div className="loading-label">{label}</div>
          </>
        ) : children}
      </div>
    </div>
  );
}
