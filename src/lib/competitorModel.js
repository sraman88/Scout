import { ENV_GEMINI } from "../theme.js";
import { getStoredKey } from "./storage.js";
import { geminiGrounded, perplexity, openAICompatible } from "./groundedModel.js";

/* Builds a callModel(prompt)=>string function from whatever's configured in
   Settings for competitor/company-relevance lookups (defaults to Gemini +
   Google Search grounding, reusing the existing Gemini key — zero new keys
   needed). Shared by Company X-Ray and Smart Intake. */
export function getCompetitorModel() {
  const provider = getStoredKey("competitor_provider") || "gemini";
  if (provider === "gemini") {
    const key = getStoredKey("gemini") || ENV_GEMINI;
    return key ? geminiGrounded(key) : null;
  }
  if (provider === "perplexity") {
    const key = getStoredKey("competitor_api_key");
    return key ? perplexity(key) : null;
  }
  if (provider === "custom") {
    const key = getStoredKey("competitor_api_key");
    const baseURL = getStoredKey("competitor_base_url");
    return key && baseURL ? openAICompatible(key, { baseURL, model: getStoredKey("competitor_model") || "gpt-4o-mini" }) : null;
  }
  return null;
}
