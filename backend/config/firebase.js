// ───────────────────────────────────────────────
// Initialization
// ───────────────────────────────────────────────
function initializeFirebase() {
  if (db) return db;

  try {
    logger.info("[Firebase] Initializing...");

    // ★ NEW: Debug logs to see exactly what GitHub Actions is reading
    console.log('FIREBASE_PROJECT_ID exists:', !!env.FIREBASE_PROJECT_ID);
    console.log('FIREBASE_CLIENT_EMAIL exists:', !!env.FIREBASE_CLIENT_EMAIL);
    console.log('FIREBASE_PRIVATE_KEY exists:', !!env.FIREBASE_PRIVATE_KEY);

    if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
      throw new Error("❌ Missing Firebase Admin environment variables! Check your GitHub Secrets.");
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    }

    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });

    logger.info("[Firebase] Firestore initialized.");
    logger.info(`[Firebase] Connected to project: ${env.FIREBASE_PROJECT_ID}`);

    return db;
  } catch (error) {
    logger.error(`[Firebase] Initialization failed: ${error.message}`);
    throw error;
  }
}