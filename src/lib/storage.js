/* Backed by an in-memory cache hydrated once from Firestore at sign-in
   (see SignInGate.jsx + cloudAuth.js) instead of localStorage, so keys
   follow the signed-in Google account across browsers/devices. Every
   existing caller keeps using the same synchronous get/set calls. */
let cache = {};
let persistHandler = null;

export function getStoredKey(name) {
  return cache[name] ?? "";
}

export function setStoredKey(name, value) {
  cache[name] = value;
  if (persistHandler) persistHandler(name, value);
}

export function hydrateCache(data) {
  cache = { ...cache, ...(data || {}) };
}

export function resetCache() {
  cache = {};
}

export function setPersistHandler(fn) {
  persistHandler = fn;
}
