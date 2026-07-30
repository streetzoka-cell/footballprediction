import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  onAuthStateChanged,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { auth, db } from '../utils/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'; // ★ Removed onSnapshot

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      console.warn('[Auth] Firebase Auth not initialized.');
      setAuthLoading(false);
      return;
    }

    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.error('[Auth] Error setting persistence:', err);
    });

    getRedirectResult(auth)
      .then((result) => {
        if (result) console.log('[Auth] Redirect sign-in successful:', result.user.uid);
      })
      .catch((err) => console.error('[Auth] Redirect result error:', err.code));
  }, []);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    let unsubscribed = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubscribed) return;
      setCurrentUser(user);

      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const profileDoc = await getDoc(userDocRef);

          // ★ FIX: ONLY create if it doesn't exist.
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
            if (!unsubscribed) setUserProfile(profile);
          } else {
            // ★ Phase 5: One-time read instead of onSnapshot to save Firebase quota
            let profileData = profileDoc.data();
            
            // Check admin_users collection (one-time read)
            const adminDoc = await getDoc(doc(db, 'admin_users', user.uid));
            const isAdminCollection = adminDoc.exists();
            const isRoleAdmin = profileData.role === 'admin' || profileData.role === 'staff';
            
            if (!unsubscribed) {
              setUserProfile({
                ...profileData,
                role: (isAdminCollection || isRoleAdmin) ? 'admin' : (profileData.role || 'user')
              });
            }
          }
        } catch (err) {
          console.error('[Auth] Failed to load profile:', err.message);
        }
      } else {
        if (!unsubscribed) setUserProfile(null);
      }
      
      if (!unsubscribed) setAuthLoading(false);
    });

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    if (!auth) throw new Error('Auth not initialized');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const register = useCallback(async (email, password, displayName) => {
    if (!auth) throw new Error('Auth not initialized');
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
    setUserProfile(profile);
    return cred.user;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (!auth) throw new Error('Auth not initialized');
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
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) throw new Error('Auth not initialized');
    try {
      await fbSignOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
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
    delete profileUpdates.role; // Prevent user from changing their own role

    await setDoc(doc(db, 'users', currentUser.uid), profileUpdates, { merge: true });
    
    // Update local state instantly so UI doesn't need to refetch
    setUserProfile(prev => ({ ...prev, ...updates }));
  }, [currentUser]);

  const value = useMemo(() => ({
    currentUser,
    userProfile,
    authLoading,
    login,
    register,
    loginWithGoogle,
    signOut,
    updateProfile,
  }), [currentUser, userProfile, authLoading, login, register, loginWithGoogle, signOut, updateProfile]);

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