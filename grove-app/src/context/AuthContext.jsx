import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AuthContext = createContext(null);

const googleProvider = new GoogleAuthProvider();

/** Grove-credit tokens per calendar month (tiered by subscription) */
export const FREE_TOKEN_LIMIT = 30_000;
export const PREMIUM_TOKEN_LIMIT = 400_000;

export function groveCreditTokenLimit(isPremium) {
  return isPremium ? PREMIUM_TOKEN_LIMIT : FREE_TOKEN_LIMIT;
}

/** `YYYY-MM` for the calendar month that `tokensUsed` applies to */
export function calendarMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Shown when a user hits the monthly cap (local calendar, first day of next month). */
export function formatTokenLimitResetHint() {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const when = next.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  return `Your limit resets next month (${when}).`;
}

async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const month = calendarMonthKey();
  if (!snap.exists()) {
    await setDoc(ref, {
      uid:         user.uid,
      email:       user.email,
      displayName: user.displayName || '',
      createdAt:   serverTimestamp(),
      credits:     { haiku: 50, gptMini: 20 },
      tokensUsed:  0,
      tokenUsageMonth: month,
    });
  }
}

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(undefined); // undefined = loading
  const [loading,    setLoading]    = useState(true);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [isPremium,  setIsPremium]  = useState(false);
  const unsubDocRef = useRef(null);

  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) await ensureUserDoc(result.user);
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn('[auth] getRedirectResult', err);
      });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await ensureUserDoc(firebaseUser);

        // Subscribe to user doc for real-time field updates
        const ref = doc(db, 'users', firebaseUser.uid);
        unsubDocRef.current = onSnapshot(ref, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const month = calendarMonthKey();
            const storedMonth = data.tokenUsageMonth;
            const raw = data.tokensUsed ?? 0;
            const inCurrentMonth =
              storedMonth === undefined ? true : storedMonth === month;
            setTokensUsed(inCurrentMonth ? raw : 0);
            setIsPremium(data.isPremium === true);
          }
        });
      } else {
        // Clean up doc subscription when user signs out
        if (unsubDocRef.current) {
          unsubDocRef.current();
          unsubDocRef.current = null;
        }
        setTokensUsed(0);
        setIsPremium(false);
      }
      setUser(firebaseUser ?? null);
      setLoading(false);
    });
    return () => {
      unsub();
      if (unsubDocRef.current) unsubDocRef.current();
    };
  }, []);

  const signUpWithEmail = useCallback(async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    await ensureUserDoc(cred.user);
    return cred.user;
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserDoc(result.user);
      return { user: result.user };
    } catch (e) {
      if (e?.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
        return { redirected: true };
      }
      throw e;
    }
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  const addTokenUsage = useCallback(async (count) => {
    if (!auth.currentUser || !count) return;
    const ref = doc(db, 'users', auth.currentUser.uid);
    const monthKey = calendarMonthKey();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) return;
      const d = snap.data();
      const storedMonth = d.tokenUsageMonth;
      const prev = d.tokensUsed ?? 0;
      if (storedMonth !== monthKey) {
        const carry = storedMonth === undefined ? prev : 0;
        transaction.update(ref, { tokenUsageMonth: monthKey, tokensUsed: carry + count });
      } else {
        transaction.update(ref, { tokensUsed: prev + count });
      }
    });
  }, []);

  const tokenLimit = groveCreditTokenLimit(isPremium);

  const value = {
    user,
    loading,
    isLoggedIn: !!user,
    tokensUsed,
    tokensRemaining: Math.max(0, tokenLimit - tokensUsed),
    isAtTokenLimit: tokensUsed >= tokenLimit,
    isPremium,
    tokenLimit,
    addTokenUsage,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
