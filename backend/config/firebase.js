/*
 * firebase.js
 * Initializes Firebase Admin SDK and exports the Firestore instance
 */

const adminimport = require("firebase-admin");
const admin = adminimport.default || adminimport; // ★ fix esm/commonjs wrapper
const env = require("./env");
const logger = require("../utils/logger");
const { BATCH_MAX_OPS, WRITE_TIMEOUT_MS } = require("./constants");

let db = null;

// ───────────────────────────────────────────────
// Initialization
// ───────────────────────────────────────────────
function initializeFirebase() {
  if (db) return db;

  try {
    console.log('--- DEBUG FIREBASE INIT ---');
    console.log('PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
    console.log('CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
    console.log('PRIVATE_KEY exists:', !!process.env.FIREBASE_PRIVATE_KEY);
    console.log('---------------------------');

    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error("❌ Missing Firebase Admin environment variables! Check your GitHub Secrets.");
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    }

    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });

    logger.info("[Firebase] Firestore initialized.");
    return db;
  } catch (error) {
    logger.error(`[Firebase] Initialization failed: ${error.message}`);
    throw error;
  }
}

function getDb() {
  if (!db) {
    throw new Error(
      "Firebase has not been initialized. Call initializeFirebase() first."
    );
  }
  return db;
}

// ───────────────────────────────────────────────
// Export
// ───────────────────────────────────────────────
module.exports = Object.freeze({
  initializeFirebase,
  getDb,
});