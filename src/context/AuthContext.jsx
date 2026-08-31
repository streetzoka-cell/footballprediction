import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  onAuthStateChanged,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { auth, db } from '../utils/firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { clearCachedToken } from '../services/backendAuth';

const AuthContext = createContext(null);

// ★ LAST-ACCOUNT MEMORY — survives logout so returning users/admins are
//   greeted by name (and role) on the login screen. Cleared only via
//   forgetLastAccount() or when a different account signs in.
const LAST_ACCOUNT_KEY = 'zokascore-last-account';

const readLastAccount = () => {
  try { return JSON.parse(localStorage.getItem(LAST_ACCOUNT_KEY)) || null; }
  catch { return null; }
};
const writeLastAccount = (acc) => {
  try { localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(acc)); } catch {}
};

const isAdminRole = (role) => ['admin', 'staff', 'super_admin'].includes(String(role || '').toLowerCase());

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [lastAccount, setLastAccount] = useState(readLastAccount);
  const rememberedRef = useRef(null); // guard: write localStorage once per sign-in

  const rememberAccount = useCallback((user, role) => {
    if (!user || rememberedRef.current === user.uid) return;
    rememberedRef.current = user.uid;
    const acc = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split('@')[0] || 'Player',
      photoURL: user.photoURL || null,
      role: String(role || 'user').toLowerCase(),
      at: Date.now(),
    };
    writeLastAccount(acc);
    setLastAccount(acc);
  }, []);

  const forgetLastAccount = useCallback(() => {
    try { localStorage.removeItem(LAST_ACCOUNT_KEY); } catch {}
    setLastAccount(null);
  }, []);

  useEffect(() => {
    if (!auth) {
      console.warn('[Auth] Firebase Auth not initialized.');
      setAuthLoading(false);
      return;
    }

    // Default: keep users signed in across visits (Remember-me default = ON).
    // A login with remember=false overrides this to session-only for that session.
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.error('[Auth] Error setting persistence:', err);
    });

    getRedirectResult(auth)
      .then((result) => {
        if (result) console.log('[Auth] Redirect sign-in successful:', result.user.uid);
      })
      .catch((err) => console.error('[Auth] Redirect result error:', err.code));
  }, [auth]);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    let unsubscribed = false;
    let unsubProfile = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubscribed) return;
      setCurrentUser(user);

      // Clear cached token when user changes
      clearCachedToken();

      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);

          // 1. Fetch initial profile or create if missing
          const profileDoc = await getDoc(userDocRef);
          if (!profileDoc.exists()) {
            const profile = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email?.split('@')[0] || 'Player',
              photoURL: user.photoURL || null,
              role: 'user',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userDocRef, profile);
          }

          // 2. Listen to users collection for instant profile/role updates
          unsubProfile = onSnapshot(userDocRef, (docSnap) => {
            if (unsubscribed) return;
            if (docSnap.exists()) {
              const baseData = docSnap.data();
              const role = String(baseData.role || 'user').toLowerCase();
              const isRoleAdmin = isAdminRole(role);

              setUserProfile({
                uid: user.uid,
                ...baseData,
                role,
                isAdmin: isRoleAdmin,
              });
              rememberAccount(user, role); // ★ persist for the welcome-back chip
            } else {
              setUserProfile(prev => ({
                ...(prev || {}),
                uid: user.uid,
                role: 'user',
                isAdmin: false,
              }));
              rememberAccount(user, 'user');
            }
            setAuthLoading(false);
          }, (err) => {
            console.error('[Auth] Profile listener error:', err.message);
            setUserProfile({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email?.split('@')[0] || 'Player',
              photoURL: user.photoURL || null,
              role: 'user',
              isAdmin: false,
            });
            rememberAccount(user, 'user');
            setAuthLoading(false);
          });
        } catch (err) {
          console.error('[Auth] Failed to load profile:', err.message);
          setUserProfile({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email?.split('@')[0] || 'Player',
            photoURL: user.photoURL || null,
            role: 'user',
            isAdmin: false,
          });
          rememberAccount(user, 'user');
          setAuthLoading(false);
        }
      } else {
        setUserProfile(null);
        rememberedRef.current = null; // ★ next sign-in re-remembers (fresh role too)
        setAuthLoading(false);
      }
    });

    return () => {
      unsubscribed = true;
      if (unsubProfile) unsubProfile();
      unsubscribe();
    };
  }, [auth, rememberAccount]);

  // ★ Remember-me: local = survive browser restarts · session = tab lifetime only
  const applyPersistence = useCallback(async (remember) => {
    if (!auth) return;
    try {
      await setPersistence(auth, remember === false ? browserSessionPersistence : browserLocalPersistence);
    } catch (err) {
      console.warn('[Auth] Persistence not applied:', err.code);
    }
  }, [auth]);

  const login = useCallback(async (email, password, remember = true) => {
    if (!auth) throw new Error('Auth not initialized');
    await applyPersistence(remember);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, [applyPersistence]);

  const register = useCallback(async (email, password, displayName, remember = true) => {
    if (!auth) throw new Error('Auth not initialized');
    await applyPersistence(remember);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await fbUpdateProfile(cred.user, { displayName });

    const profile = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: displayName || cred.user.email?.split('@')[0] || 'Player',
      photoURL: cred.user.photoURL || null,
      role: 'user',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    setUserProfile({ ...profile, role: 'user', isAdmin: false });
    return cred.user;
  }, [applyPersistence]);

  const loginWithGoogle = useCallback(async (remember = true) => {
    if (!auth) throw new Error('Auth not initialized');
    await applyPersistence(remember);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw err;
    }
  }, [applyPersistence]);

  const resetPassword = useCallback(async (email) => {
    if (!auth) throw new Error('Auth not initialized');
    await sendPasswordResetEmail(auth, email);
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) throw new Error('Auth not initialized');
    try {
      clearCachedToken();
      await fbSignOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
      // ★ lastAccount is intentionally KEPT — that's the welcome-back memory.
    } catch (err) {
      console.error('[Auth] Sign out failed:', err.message);
      throw err;
    }
  }, []);

  const updateProfile = useCallback(async (updates) => {
    if (!auth || !currentUser) throw new Error('Not authenticated');

    if (updates.displayName || updates.photoURL) {
      const authUpdates = {};
      if (updates.displayName) authUpdates.displayName = updates.displayName;
      if (updates.photoURL) authUpdates.photoURL = updates.photoURL;
      await fbUpdateProfile(currentUser, authUpdates);
    }

    const profileUpdates = { ...updates, updatedAt: serverTimestamp() };
    delete profileUpdates.uid;
    delete profileUpdates.role;
    delete profileUpdates.isAdmin;

    await setDoc(doc(db, 'users', currentUser.uid), profileUpdates, { merge: true });
  }, [currentUser]);

  const value = useMemo(() => ({
    currentUser,
    userProfile,
    authLoading,
    lastAccount,
    login,
    register,
    loginWithGoogle,
    resetPassword,
    signOut,
    updateProfile,
    forgetLastAccount,
  }), [currentUser, userProfile, authLoading, lastAccount, login, register, loginWithGoogle, resetPassword, signOut, updateProfile, forgetLastAccount]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export default AuthContext;