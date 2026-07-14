import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// ★ FIX: Check for the DEFAULT app specifically, not just any app
let app;
try {
  app = getApp(); // Gets DEFAULT app if it exists
} catch {
  // DEFAULT app doesn't exist yet — create it
  app = initializeApp(firebaseConfig);
}

const db = getFirestore(app);
const auth = getAuth(app);

// ★ Debug: Verify which project auth is connected to
if (app.options.projectId) {
  console.log('[Firebase:Main] Connected to project:', app.options.projectId);
}

export { app, db, auth };
export default app;