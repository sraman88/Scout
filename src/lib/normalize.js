/* Different scraping actors return plain strings for things like "location"
   while others (e.g. harvestapi) return a nested object ({ parsed: {...}, ... }).
   Rendering an object directly as JSX crashes the whole app with no error
   boundary, so every field that ends up as display text goes through this
   first to guarantee a string. */
export function asText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    return v.text || v.linkedinText || v.name || v.city || v.title || v.parsed?.text || "";
  }
  return "";
}

export function asArray(v) {
  return Array.isArray(v) ? v : [];
}
