import { T } from "../theme.js";
import { FieldLabel, TextInput } from "./ui.jsx";

// Drop into Settings, next to the Groq/Gemini/Apify key rows. Stores
// { provider, apiKey, baseURL } for the grounded competitor-lookup model
// used by Company X-Ray. When the provider is Gemini it reuses the existing
// Gemini key, so no new key is required in the common case.

export default function CompetitorKeyField({ value = {}, onChange }) {
  const provider = value.provider || "gemini";
  const set = (patch) => onChange && onChange({ ...value, provider, ...patch });
  const needsKey = provider !== "gemini";

  return (
    <div>
      <FieldLabel>COMPETITOR LOOKUP MODEL <span style={{ color: T.text4, textTransform: "none" }}>(web-grounded — maps a target company's rivals in Company X-Ray)</span></FieldLabel>
      <select value={provider} onChange={(e) => set({ provider: e.target.value })} style={{ width: "100%", padding: "10px 12px", background: T.fieldBg, color: T.fieldText, border: `1px solid ${T.cyanDim}`, borderRadius: 7, fontFamily: T.body, fontSize: 14 }}>
        <option value="gemini">Gemini · Google Search grounding (recommended)</option>
        <option value="perplexity">Perplexity Sonar</option>
        <option value="custom">Custom · OpenAI-compatible</option>
      </select>

      {provider === "gemini" && (
        <div style={{ marginTop: 6, padding: "6px 10px", background: `${T.green}11`, border: `1px solid ${T.green}44`, borderRadius: 6, color: T.green, fontSize: 11, fontFamily: T.mono }}>
          Reuses your existing Gemini key above — no new key needed.
        </div>
      )}

      {needsKey && (
        <TextInput
          type="password" autoComplete="off"
          placeholder={provider === "perplexity" ? "pplx-..." : "API key"}
          value={value.apiKey || ""}
          onChange={(e) => set({ apiKey: e.target.value })}
          style={{ marginTop: 8 }}
        />
      )}

      {provider === "custom" && (
        <TextInput
          placeholder="Base URL, e.g. https://api.provider.com/v1"
          value={value.baseURL || ""}
          onChange={(e) => set({ baseURL: e.target.value })}
          style={{ marginTop: 8 }}
        />
      )}

      {provider === "perplexity" && (
        <div style={{ marginTop: 6, padding: "6px 10px", background: `${T.amber}11`, border: `1px solid ${T.amber}44`, borderRadius: 6, color: T.amber, fontSize: 11, fontFamily: T.mono }}>
          Perplexity blocks browser-origin calls — this will fail with a CORS error until it's routed through a serverless function. Gemini (default) works directly from the browser.
        </div>
      )}
    </div>
  );
}
