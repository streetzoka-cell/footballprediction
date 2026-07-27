// api/_firebase.js
import admin from 'firebase-admin';

let db = null;

function initializeDb() {
  if (db) return db;
  
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        // ★ FIX: Use FIREBASE_PROJECT_ID (Data Project) instead of VITE_
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  
  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export { initializeDb };