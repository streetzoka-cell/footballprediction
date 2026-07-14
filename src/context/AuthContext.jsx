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
} from 'firebase/auth';
import { auth, db } from '../utils/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ─── Handle Google Redirect Result ───────────────────────
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          console.log('[Auth] Redirect sign-in successful:', result.user.uid);
          // onAuthStateChanged will handle setting the user
        }
      })
      .catch((err) => {
        console.error('[Auth] Redirect result error:', err.code, err.message);
      });
  }, []);

  // ─── Listen for auth state changes ───────────────────────
  useEffect(() => {
    let unsubscribed = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubscribed) return;

      setCurrentUser(user);

      if (user) {
        try {
          const profileDoc = await getDoc(doc(db, 'users', user.uid));
          if (profileDoc.exists()) {
            setUserProfile(profileDoc.data());
          } else {
            const profile = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email?.split('@')[0] || 'Player',
              photoURL: user.photoURL || null,
              role: 'user',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'users', user.uid), profile, { merge: true });
            setUserProfile(profile);
          }
        } catch (err) {
          console.error('[Auth] Failed to load profile:', err.message);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }

      setAuthLoading(false);
    });

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, []);

  // ─── Actions ─────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const register = useCallback(async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await fbUpdateProfile(cred.user, { displayName });
    }
    const profile = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: displayName || cred.user.email?.split('@')[0] || 'Player',
      photoURL: cred.user.photoURL || null,
      role: 'user',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', cred.user.uid), profile, { merge: true });
    setUserProfile(profile);
    return cred.user;
  }, []);

  // ★ FIXED: Popup first, redirect as fallback
  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      // Try popup first (works on desktop, most mobile browsers)
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (err) {
      // If popup is blocked, fall back to full redirect
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        await signInWithRedirect(auth, provider);
        // Page navigates away here — never returns to this execution
        return null; // This line is unreachable after redirect, but satisfies linters
      }
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
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
    if (!currentUser) throw new Error('Not authenticated');

    if (updates.displayName || updates.photoURL) {
      const authUpdates = {};
      if (updates.displayName) authUpdates.displayName = updates.displayName;
      if (updates.photoURL) authUpdates.photoURL = updates.photoURL;
      await fbUpdateProfile(currentUser, authUpdates);
    }

    const profileUpdates = {
      ...updates,
      updatedAt: serverTimestamp(),
    };
    delete profileUpdates.uid;

    await setDoc(doc(db, 'users', currentUser.uid), profileUpdates, { merge: true });

    const refreshed = await getDoc(doc(db, 'users', currentUser.uid));
    if (refreshed.exists()) {
      setUserProfile(refreshed.data());
    }
  }, [currentUser]);

  const value = {
    currentUser,
    userProfile,
    authLoading,
    login,
    register,
    loginWithGoogle,
    signOut,
    updateProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;