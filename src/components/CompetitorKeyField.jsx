// Drop this into your Settings modal, next to the Groq/Gemini/Apify key rows.
// Stores { provider, apiKey } for the grounded competitor-lookup model. When
// the provider is Gemini it reuses your existing Gemini key, so no new key.
//
//   <CompetitorKeyField value={settings.competitorModel} onChange={(v)=>save({competitorModel:v})} />
//
// Then build the caller from it (see lib/groundedModel.js) whenever you resolve
// competitors.

export default function CompetitorKeyField({ value = {}, onChange }) {
  const provider = value.provider || "gemini";
  const set = (patch) => onChange && onChange({ ...value, provider, ...patch });
  const needsKey = provider !== "gemini";

  return (
    <div style={S.wrap}>
      <div style={S.lab}>
        Competitor lookup model
        <span style={S.hint}>web-grounded — maps a target company's rivals for sourcing</span>
      </div>

      <select style={S.sel} value={provider} onChange={(e) => set({ provider: e.target.value })}>
        <option value="gemini">Gemini · Google Search grounding (recommended)</option>
        <option value="perplexity">Perplexity Sonar</option>
        <option value="custom">Custom · OpenAI-compatible</option>
      </select>

      {provider === "gemini" && (
        <div style={S.note}>Reuses your existing Gemini key — no new key needed.</div>
      )}

      {needsKey && (
        <input
          style={S.inp}
          type="password"
          autoComplete="off"
          placeholder={provider === "perplexity" ? "pplx-..." : "API key"}
          value={value.apiKey || ""}
          onChange={(e) => set({ apiKey: e.target.value })}
        />
      )}

      {provider === "custom" && (
        <input
          style={S.inp}
          type="text"
          placeholder="Base URL, e.g. https://api.provider.com/v1"
          value={value.baseURL || ""}
          onChange={(e) => set({ baseURL: e.target.value })}
        />
      )}

      {provider === "perplexity" && (
        <div style={S.warn}>Perplexity blocks browser calls — route this through a serverless function.</div>
      )}
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 8, fontFamily: "system-ui, sans-serif", maxWidth: 460 },
  lab: { fontSize: 13, fontWeight: 600, color: "#111", display: "flex", flexDirection: "column", gap: 2 },
  hint: { fontSize: 11.5, fontWeight: 400, color: "#8A867C" },
  sel: { padding: "8px 10px", border: "1px solid #E4E2DA", borderRadius: 8, fontSize: 13, background: "#fff" },
  inp: { padding: "8px 10px", border: "1px solid #E4E2DA", borderRadius: 8, fontSize: 13 },
  note: { fontSize: 12, color: "#0B6E4F", background: "#EAF4EF", padding: "6px 10px", borderRadius: 6 },
  warn: { fontSize: 12, color: "#9A6B00", background: "#FBF3E2", padding: "6px 10px", borderRadius: 6 },
};
