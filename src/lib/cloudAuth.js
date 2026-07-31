import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";

export async function signInWithGoogle() {
  await signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  await signOut(auth);
}

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/* One doc per user, keyed by their Firebase uid, holding every value that
   used to live in localStorage under storage.js's getStoredKey/setStoredKey. */
export async function loadSettingsDoc(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : {};
}

export async function saveSettingsField(uid, name, value) {
  await setDoc(doc(db, "users", uid), { [name]: value }, { merge: true });
}
