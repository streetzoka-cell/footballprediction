import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FOOTBALL_FB_API_KEY,
  authDomain: import.meta.env.VITE_FOOTBALL_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FOOTBALL_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FOOTBALL_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FOOTBALL_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FOOTBALL_FB_APP_ID,
};

const missing = Object.entries(config).filter(([, v]) => !v);
if (missing.length > 0) {
  console.error(
    '[FootballFirebase] Missing env vars:',
    missing.map(([k]) => k).join(', ')
  );
}

let db = null;
if (missing.length === 0) {
  try {
    const existingApp = getApps().find(a => a.name === 'football-data');
    const app = existingApp || initializeApp(config, 'football-data');
    db = getFirestore(app);
    console.log('[FootballFirebase] Project:', config.projectId);
  } catch (e) {
    console.error('[FootballFirebase] Init failed:', e.message);
  }
}

export { db as footballDb };