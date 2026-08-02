// footballprediction/src/utils/firebase.js

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getRemoteConfig } from "firebase/remote-config";

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
let remoteConfig = null;

const hasPrimaryConfig = Object.values(primaryConfig).every(v => v);

if (hasPrimaryConfig) {
  try {
    app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(primaryConfig);
    
    try {
      // â˜… FIX: Use persistentLocalCache so data survives app reloads and backend sleep!
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ 
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (cacheErr) {
      console.warn('[Firebase] Persistent cache init failed, using default:', cacheErr.message);
      db = getFirestore(app);
    }

    auth = getAuth(app);
    
    // Initialize Remote Config safely
    remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = 3600000; // 1 hour
  } catch (e) {
    console.error('[Firebase] Primary init failed:', e.message);
  }
} else {
  console.warn('[Firebase] Missing primary environment variables. Check your .env file.');
}

export { app, db, auth, remoteConfig };
export default app;
