// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/firebase.js
// ZOKA PRO — Offline Persistence & Multi-App Initialization
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/* ═══════════════════════════════════════════════════
   1. PRIMARY APP (Auth, User Predictions, Leaderboards)
   ═══════════════════════════════════════════════════ */
const primaryConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

let app = null;
let db = null;
let auth = null;

const hasPrimaryConfig = Object.values(primaryConfig).every(v => v);

if (hasPrimaryConfig) {
  try {
    app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(primaryConfig);
    
    // ★ PRO MOVE: Initialize Firestore with persistent cache (IndexedDB)
    // This makes all reads instant by serving from local cache first.
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (cacheErr) {
      // Fallback if cache initialization fails (e.g., older browser)
      console.warn('[Firebase] Persistent cache failed, using default:', cacheErr.message);
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
    
    // Initialize football DB with persistent cache as well
    try {
      footballDb = initializeFirestore(footballApp, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (cacheErr) {
      footballDb = getFirestore(footballApp);
    }

  } catch (e) {
    console.error('[FootballFirebase] Init failed:', e.message);
  }
} else {
  console.warn('[FootballFirebase] Missing football env vars. Falling back to primary DB.');
  // Fallback to primary DB if football vars aren't set
  footballDb = db; 
}

export { app, db, auth, footballDb };