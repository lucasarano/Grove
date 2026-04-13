import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot, serverTimestamp, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AuthContext = createContext(null);

const googleProvider = new GoogleAuthProvider();

export const TOKEN_LIMIT = 30_000;

async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid:         user.uid,
      email:       user.email,
      displayName: user.displayName || '',
      createdAt:   serverTimestamp(),
      credits:     { haiku: 50, sonnet: 20, gptMini: 20 },
      tokensUsed:  0,
    });
  } else if (snap.data().tokensUsed === undefined) {
    // Backfill tokensUsed for existing accounts that predate this field
    await updateDoc(ref, { tokensUsed: 0 });
  }
}

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(undefined); // undefined = loading
  const [loading,    setLoading]    = useState(true);
  const [tokensUsed, setTokensUsed] = useState(0);
  const unsubDocRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await ensureUserDoc(firebaseUser);

        // Subscribe to user doc for real-time tokensUsed updates
        const ref = doc(db, 'users', firebaseUser.uid);
        unsubDocRef.current = onSnapshot(ref, (snap) => {
          if (snap.exists()) {
            setTokensUsed(snap.data().tokensUsed ?? 0);
          }
        });
      } else {
        // Clean up doc subscription when user signs out
        if (unsubDocRef.current) {
          unsubDocRef.current();
          unsubDocRef.current = null;
        }
        setTokensUsed(0);
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
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(result.user);
    return result.user;
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  const addTokenUsage = useCallback(async (count) => {
    if (!auth.currentUser || !count) return;
    const ref = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(ref, { tokensUsed: increment(count) });
  }, []);

  const value = {
    user,
    loading,
    isLoggedIn: !!user,
    tokensUsed,
    tokensRemaining: Math.max(0, TOKEN_LIMIT - tokensUsed),
    isAtTokenLimit: tokensUsed >= TOKEN_LIMIT,
    TOKEN_LIMIT,
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
