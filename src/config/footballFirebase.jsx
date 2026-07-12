import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FOOTBALL_FB_API_KEY,
  authDomain: import.meta.env.VITE_FOOTBALL_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FOOTBALL_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FOOTBALL_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FOOTBALL_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FOOTBALL_FB_APP_ID,
};

// Validate config before initializing
const missing = Object.entries(config).filter(([k, v]) => !v || v.includes('your_') || v.includes('000000'));
if (missing.length > 0) {
  console.error(
    '[FootballFirebase] Missing/invalid env vars:',
    missing.map(([k]) => k).join(', ')
  );
  console.error('[FootballFirebase] Fix VITE_FOOTBALL_FB_* in your .env file');
  console.error('[FootballFirebase] Get values from: Firebase Console > 2nd project > Settings > Your apps > Web app');
}

let db = null;
if (missing.length === 0) {
  try {
    const app = initializeApp(config, 'football-data');
    db = getFirestore(app);
    console.log('[FootballFirebase] Connected — project:', config.projectId);
  } catch (e) {
    console.error('[FootballFirebase] Init failed:', e.message);
  }
}

export { db as footballDb };