import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  ...(measurementId ? { measurementId } : {}),
};

const app       = initializeApp(firebaseConfig);
const auth      = getAuth(app);
const db        = getFirestore(app);
const functions = getFunctions(app);

/** @type {import('firebase/analytics').Analytics | null} */
let analytics = null;

/**
 * Initializes Google Analytics when supported (browser + GA4 linked).
 * Safe to call from the client entry; no-ops on missing env or unsupported environments.
 */
export function initFirebaseAnalytics() {
  if (typeof window === 'undefined' || !measurementId) {
    return Promise.resolve(null);
  }
  return import('firebase/analytics').then(async ({ getAnalytics, isSupported }) => {
    if (!(await isSupported())) return null;
    analytics = getAnalytics(app);
    return analytics;
  });
}

/** Current Analytics instance after {@link initFirebaseAnalytics} resolves; otherwise null. */
export function getFirebaseAnalytics() {
  return analytics;
}

export { app, auth, db, functions };
