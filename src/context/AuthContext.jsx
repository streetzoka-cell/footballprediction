// FILE: src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';

const AuthContext = createContext();

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ═══════════════════════════════════════════════════════════
     Fetch or create user profile in users/{uid}
     This is the PUBLIC profile — readable by anyone for leaderboard
  ═══════════════════════════════════════════════════════════ */
  async function fetchOrCreateUserProfile(user) {
    try {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setUserProfile(docSnap.data());
      } else {
        // Auto-create profile for first-time Google login or registration
        const newProfile = {
          uid: user.uid,
          displayName: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          photoURL: user.photoURL || null,
          points: 0,
          predictions: 0,
          correctScore: 0,
          correctResult: 0,
          badges: ['newcomer'],
          createdAt: new Date().toISOString(),
        };
        await setDoc(docRef, newProfile);
        setUserProfile(newProfile);
      }
    } catch (err) {
      console.warn('[Auth] Profile fetch failed:', err.message);
      setUserProfile(null);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Check admin role from admin_users/{uid}
     Rules deny read for non-admins — the error is EXPECTED
     and means "this user is not an admin"
  ═══════════════════════════════════════════════════════════ */
  async function checkAdminRole(user) {
    try {
      const adminDoc = await getDoc(doc(db, 'admin_users', user.uid));
      if (adminDoc.exists()) {
        const role = adminDoc.data()?.role;
        setIsAdmin(role === 'admin' || role === 'super_admin');
      } else {
        setIsAdmin(false);
      }
    } catch (err) {
      // Permission denied = NOT an admin — this is the normal path
      // for 99.9% of users. Do NOT log as an error.
      setIsAdmin(false);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Auth state listener — runs on every page load and auth change
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        // Fetch profile and check admin role IN PARALLEL
        await Promise.all([
          fetchOrCreateUserProfile(user),
          checkAdminRole(user),
        ]);
      } else {
        setUserProfile(null);
        setIsAdmin(false);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  /* ═══════════════════════════════════════════════════════════
     Auth methods
  ═══════════════════════════════════════════════════════════ */
  async function register(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && cred.user) {
      try {
        await cred.user.updateProfile({ displayName });
      } catch (e) {
        // Non-critical
      }
    }
    return cred;
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result;
  }

  function logout() {
    setUserProfile(null);
    setIsAdmin(false);
    return signOut(auth);
  }

  /* ═══════════════════════════════════════════════════════════
     Context value
  ═══════════════════════════════════════════════════════════ */
  const value = {
    currentUser,
    userProfile,
    setUserProfile,
    isAdmin,
    isRegistered: !!currentUser,
    loading,
    authLoading: loading,          // ← alias for route guards
    register,
    login,
    loginWithGoogle,
    logout,
    fetchUserProfile: fetchOrCreateUserProfile,
  };

  // Always render children — let route guards handle loading UI
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;