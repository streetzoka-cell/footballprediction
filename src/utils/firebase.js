// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/firebase.js
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/* ═══════════════════════════════════════════════════
   1. PRIMARY APP (Auth, User Predictions, Leaderboards)
   ═══════════════════════════════════════════════════ */
const primaryConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let db = null;
let auth = null;

const hasPrimaryConfig = Object.values(primaryConfig).every(v => v);

if (hasPrimaryConfig) {
  try {
    app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(primaryConfig);
    
    // ★ FIX: Force memory cache to bypass corrupted IndexedDB schema and prevent 
    // the "isCorePipeline" INTERNAL ASSERTION FAILED crash.
    try {
      db = initializeFirestore(app, {
        localCache: memoryLocalCache()
      });
    } catch (cacheErr) {
      console.warn('[Firebase] Memory cache init failed, using default:', cacheErr.message);
      db = getFirestore(app);
    }

    auth = getAuth(app);
  } catch (e) {
    console.error('[Firebase] Primary init failed:', e.message);
  }
} else {
  console.warn('[Firebase] Missing primary environment variables. Check your .env file.');
}

/* ═══════════════════════════════════════════════════
   2. FOOTBALL DATA APP (Secondary App for Fixtures)
   ═══════════════════════════════════════════════════ */
const footballConfig = {
  apiKey: import.meta.env.VITE_FOOTBALL_FB_API_KEY,
  authDomain: import.meta.env.VITE_FOOTBALL_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FOOTBALL_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FOOTBALL_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FOOTBALL_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FOOTBALL_FB_APP_ID,
};

let footballDb = null;
const hasFootballConfig = Object.values(footballConfig).every(v => v);

if (hasFootballConfig) {
  try {
    const existingApp = getApps().find(a => a.name === 'football-data');
    const footballApp = existingApp || initializeApp(footballConfig, 'football-data');
    
    // ★ FIX: Force memory cache for the secondary app as well.
    try {
      footballDb = initializeFirestore(footballApp, {
        localCache: memoryLocalCache()
      });
    } catch (cacheErr) {
      footballDb = getFirestore(footballApp);
    }

  } catch (e) {
    console.error('[FootballFirebase] Init failed:', e.message);
  }
} else {
  console.warn('[FootballFirebase] Missing football env vars. Falling back to primary DB.');
  footballDb = db; 
}

export { app, db, auth, footballDb };
export default app;