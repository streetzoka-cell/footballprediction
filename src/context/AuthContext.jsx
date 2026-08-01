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
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

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
    let unsubProfile = null;
    let unsubAdmin = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubscribed) return;
      setCurrentUser(user);

      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      if (unsubAdmin) {
        unsubAdmin();
        unsubAdmin = null;
      }

      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const adminDocRef = doc(db, 'admin_users', user.uid);

          // 1. Fetch initial profile
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

          // 2. Listen to users collection (Role-based Admin)
          unsubProfile = onSnapshot(userDocRef, (docSnap) => {
            if (unsubscribed) return;
            if (docSnap.exists()) {
              const baseData = docSnap.data();
              // Normalize role to lowercase to prevent casing issues (e.g., 'Admin' vs 'admin')
              const role = (baseData.role || 'user').toLowerCase();
              const isRoleAdmin = role === 'admin' || role === 'staff';
              
              setUserProfile(prev => {
                const isSuperAdmin = prev?.isAdminCollection === true;
                return { 
                  uid: user.uid, // Ensure uid is always explicitly set
                  ...baseData, 
                  role,
                  isAdmin: isSuperAdmin || isRoleAdmin 
                };
              });
            } else {
              setUserProfile(prev => ({ 
                ...(prev || {}), 
                uid: user.uid, 
                role: 'user', 
                isAdmin: false 
              }));
            }
            setAuthLoading(false);
          }, (err) => {
            console.error('[Auth] Profile listener error:', err.message);
            setAuthLoading(false);
          });

          // 3. Listen to admin_users collection (Super Admin)
          unsubAdmin = onSnapshot(adminDocRef, (adminSnap) => {
            if (unsubscribed) return;
            setUserProfile(prev => {
              const isSuperAdmin = adminSnap.exists();
              const role = (prev?.role || 'user').toLowerCase();
              const isRoleAdmin = role === 'admin' || role === 'staff';
              
              return {
                ...prev,
                uid: user.uid,
                isAdmin: isSuperAdmin || isRoleAdmin,
                isAdminCollection: isSuperAdmin
              };
            });
          }, (err) => {
            // Silently ignore permission-denied for normal users (expected behavior)
            if (err.code !== 'permission-denied') {
              console.error('[Auth] Admin listener error:', err.message);
            }
          });

        } catch (err) {
          console.error('[Auth] Failed to load profile:', err.message);
          setUserProfile(prev => ({ 
            ...(prev || {}), 
            uid: user.uid, 
            role: 'user', 
            isAdmin: false 
          }));
          setAuthLoading(false);
        }
      } else {
        setUserProfile(null);
        setAuthLoading(false);
      }
    });

    return () => {
      unsubscribed = true;
      if (unsubProfile) unsubProfile();
      if (unsubAdmin) unsubAdmin();
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
    delete profileUpdates.role; // Prevent accidental role escalation from client

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