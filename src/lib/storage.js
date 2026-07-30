export function getStoredKey(name) {
  try { return localStorage.getItem(`scout_${name}`) || ""; } catch { return ""; }
}

export function setStoredKey(name, value) {
  try { localStorage.setItem(`scout_${name}`, value); } catch { /* localStorage unavailable */ }
}
