import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Firebase is optional — app works without it (no login/cloud sync)
let auth = null, db = null, googleProvider = null;

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;

if (apiKey) {
  try {
    const firebaseConfig = {
      apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    };
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
    if (typeof window !== 'undefined') getAnalytics(app);
  } catch (e) {
    console.warn("Firebase init failed — running without auth/db:", e.message);
  }
}

export const firebaseReady = !!auth;

export { auth, db, googleProvider, signInWithPopup, signOut, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, getDocs, query, orderBy, serverTimestamp };

export const signInWithGoogle = async () => {
  if (!auth || !googleProvider) return null;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    return null;
  }
};

export const logout = () => (auth ? signOut(auth) : Promise.resolve());
