/* Build-time fallbacks for API keys, so a deployment can ship with keys baked
   in rather than requiring every user to paste their own. Everything visual
   that used to live here — the T token object, injectFonts, COUNTRIES — is
   gone: the app is styled entirely by components/scout-theme.css, and those
   exports were the last thing keeping a second, dead design system alive. */
export const ENV_GROQ = import.meta.env?.VITE_GROQ_KEY || "";
export const ENV_GH = import.meta.env?.VITE_GITHUB_TOKEN || "";
export const ENV_GEMINI = import.meta.env?.VITE_GEMINI_KEY || "";
