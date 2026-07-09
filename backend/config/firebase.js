/*
 * firebase.js
 * Initializes Firebase Admin SDK and exports the Firestore instance
 * plus production-grade write helpers used by all services.
 */

const admin = require("firebase-admin");
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
    logger.info("[Firebase] Initializing...");

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
  projectId: env.FIREBASE_PROJECT_ID,
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  privateKey: env.FIREBASE_PRIVATE_KEY
    ? env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
}),
      });
    }

    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });

    logger.info("[Firebase] Firestore initialized.");
    
    logger.info(
      `[Firebase] Connected to project: ${env.FIREBASE_PROJECT_ID}`
    );

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
// Batch Write — chunks large arrays into
// batches of 500 (Firestore limit) automatically
// ───────────────────────────────────────────────
async function batchWrite(collectionPath, documents) {
  const database = getDb();
  const colRef = database.collection(collectionPath);

  if (!documents.length) return 0;

  let totalWritten = 0;

  for (let i = 0; i < documents.length; i += BATCH_MAX_OPS) {
    const chunk = documents.slice(i, i + BATCH_MAX_OPS);
    const batch = database.batch();

    for (const doc of chunk) {
      const ref = colRef.doc(String(doc.id));
      batch.set(ref, doc, { merge: true });
    }

    await Promise.race([
      batch.commit(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Batch write timeout")), WRITE_TIMEOUT_MS)
      ),
    ]);

    totalWritten += chunk.length;
  }

  return totalWritten;
}

// ───────────────────────────────────────────────
// Clear Collection — deletes ALL documents
// in a collection. Used before replacing daily
// fixture snapshots (yesterday/today/tomorrow).
// ───────────────────────────────────────────────
async function clearCollection(collectionPath) {
  const database = getDb();
  const colRef = database.collection(collectionPath);

  let totalDeleted = 0;
  let query = colRef.limit(BATCH_MAX_OPS);

  // Loop until collection is empty
  // Firestore doesn't have "delete collection" — must batch-delete
  while (true) {
    const snapshot = await Promise.race([
      query.get(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Clear collection read timeout")), WRITE_TIMEOUT_MS)
      ),
    ]);

    if (snapshot.empty) break;

    const batch = database.batch();

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }

    await Promise.race([
      batch.commit(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Clear collection delete timeout")), WRITE_TIMEOUT_MS)
      ),
    ]);

    totalDeleted += snapshot.size;
  }

  return totalDeleted;
}

// ───────────────────────────────────────────────
// Replace Collection — atomic clear + write.
// The primary pattern for daily fixtures:
//   1. Delete everything in the collection
//   2. Write all new documents
// ───────────────────────────────────────────────
async function replaceCollection(collectionPath, documents) {
  const deleted = await clearCollection(collectionPath);

  if (!documents.length) {
    logger.info(
      `[Firebase] ${collectionPath}: cleared ${deleted} docs, 0 new (empty set)`
    );
    return { deleted, written: 0 };
  }

  const written = await batchWrite(collectionPath, documents);

  logger.info(
    `[Firebase] ${collectionPath}: replaced ${deleted} → ${written} docs`
  );

  return { deleted, written };
}

// ───────────────────────────────────────────────
// Meta Helpers — read/write scheduler state,
// last fetch timestamps, budget persistence.
// All live under the `meta` collection.
// ───────────────────────────────────────────────
async function getMeta(docId) {
  const database = getDb();
  const doc = await database
    .collection("meta")
    .doc(docId)
    .get();

  return doc.exists ? doc.data() : null;
}

async function setMeta(docId, data) {
  const database = getDb();
  await database
    .collection("meta")
    .doc(docId)
    .set(data, { merge: true });
}

async function updateMeta(docId, data) {
  const database = getDb();
  await database
    .collection("meta")
    .doc(docId)
    .update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// ───────────────────────────────────────────────
// Delete Single Doc — utility for removing
// a specific fixture (e.g., when match goes
// from live to finished)
// ───────────────────────────────────────────────
async function deleteDoc(collectionPath, docId) {
  const database = getDb();
  await database
    .collection(collectionPath)
    .doc(String(docId))
    .delete();
}

// ───────────────────────────────────────────────
// Export
// ───────────────────────────────────────────────
module.exports = Object.freeze({
  initializeFirebase,
  getDb,
  batchWrite,
  clearCollection,
  replaceCollection,
  getMeta,
  setMeta,
  updateMeta,
  deleteDoc,
});