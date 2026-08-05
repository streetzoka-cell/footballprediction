// src/context/AuthContext.jsx

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
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Handle Firebase Auth initialization and Redirect results
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
  }, [auth]); // ★ FIX: Depend on auth so it runs when Firebase is ready

  // Listen to Auth State Changes
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    let unsubscribed = false;

    // ★ FIX: onAuthStateChanged handles the initial load and restores the session
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubscribed) return;
      
      setCurrentUser(user);

      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const adminDocRef = doc(db, 'admin_users', user.uid);

          // 1. Fetch user profile ONCE (No onSnapshot to save Firestore reads)
          const profileDoc = await getDoc(userDocRef);
          
          if (profileDoc.exists()) {
            const baseData = profileDoc.data();
            const role = (baseData.role || 'user').toLowerCase();
            const isRoleAdmin = role === 'admin' || role === 'staff' || role === 'super_admin';
            
            // 2. Check admin_users collection for Super Admin
            const adminDoc = await getDoc(adminDocRef);
            const isSuperAdmin = adminDoc.exists();
            
            setUserProfile({
              uid: user.uid,
              ...baseData,
              role,
              isAdmin: isSuperAdmin || isRoleAdmin,
              isSuperAdmin: isSuperAdmin
            });
          } else {
            // If profile doesn't exist, create it
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
            setUserProfile({ ...profile, isAdmin: false, isSuperAdmin: false });
          }
        } catch (err) {
          console.error('[Auth] Failed to load profile:', err.message);
          setUserProfile(prev => ({ 
            ...(prev || {}), 
            uid: user.uid, 
            role: 'user', 
            isAdmin: false,
            isSuperAdmin: false
          }));
        } finally {
          setAuthLoading(false);
        }
      } else {
        // User is logged out
        setUserProfile(null);
        setAuthLoading(false);
      }
    });

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, [auth]); // ★ FIX: Depend on auth

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
    setUserProfile({ ...profile, isAdmin: false, isSuperAdmin: false });
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
    delete profileUpdates.role; // Prevent accidental role escalation from client
    delete profileUpdates.isAdmin;
    delete profileUpdates.isSuperAdmin;

    await setDoc(doc(db, 'users', currentUser.uid), profileUpdates, { merge: true });
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