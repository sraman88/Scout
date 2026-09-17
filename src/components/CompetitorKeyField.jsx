/* The grounded model behind competitor lookup and the talent market. Lives in
   Settings › Advanced. When the provider is Gemini it reuses the Gemini key
   already entered above, so the common case needs no extra key at all. */
export default function CompetitorKeyField({ value = {}, onChange }) {
  const provider = value.provider || "gemini";
  const set = (patch) => onChange && onChange({ ...value, provider, ...patch });
  const needsKey = provider !== "gemini";

  return (
    <>
      <div className="frow">
        <label htmlFor="competitor-provider">Grounded lookup model</label>
        <select id="competitor-provider" value={provider} onChange={(e) => set({ provider: e.target.value })}
          aria-describedby="competitor-provider-hint">
          <option value="gemini">Gemini · Google Search grounding (recommended)</option>
          <option value="perplexity">Perplexity Sonar</option>
          <option value="custom">Custom · OpenAI-compatible</option>
        </select>
        <p className="hint" id="competitor-provider-hint">
          {provider === "gemini"
            ? "Reuses your Gemini key from Scoring & analysis — nothing more to enter."
            : "Grounding matters here: an ungrounded model recites rivals and pay bands from stale training data."}
        </p>
      </div>

      {needsKey && (
        <div className="frow">
          <label htmlFor="competitor-key">{provider === "perplexity" ? "Perplexity API key" : "API key"}</label>
          <input id="competitor-key" type="password" autoComplete="off" spellCheck="false"
            value={value.apiKey || ""} onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={provider === "perplexity" ? "pplx-…" : "sk-…"} />
        </div>
      )}

      {provider === "custom" && (
        <div className="frow">
          <label htmlFor="competitor-url">Base URL</label>
          <input id="competitor-url" value={value.baseURL || ""} onChange={(e) => set({ baseURL: e.target.value })}
            placeholder="https://api.example.com/v1" spellCheck="false" aria-describedby="competitor-url-hint" />
          <p className="hint" id="competitor-url-hint">Any OpenAI-compatible endpoint. Scout posts to <code>/chat/completions</code> under this URL.</p>
        </div>
      )}
    </>
  );
}
