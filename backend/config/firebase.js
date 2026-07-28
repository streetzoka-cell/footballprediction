const admin = require("firebase-admin");
const env = require("./env");
const logger = require("../utils/logger");
const { BATCH_MAX_OPS, WRITE_TIMEOUT_MS } = require("./constants");
const { getChangedFields } = require("../utils/compare");

let db = null;

function initializeFirebase() {
  if (db) return db;
  try {
    logger.info("[Firebase] Initializing...");
    const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
    if (!privateKey) throw new Error("FIREBASE_PRIVATE_KEY is missing");

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });

    db = admin.firestore();
    db.settings({ 
      ignoreUndefinedProperties: true, 
      preferRest: true
    });
    
    logger.info("[Firebase] Firestore initialized.");
    return db;
  } catch (error) {
    logger.error(`[Firebase] Initialization failed: ${error.stack}`);
    throw error;
  }
}

function getDb() {
  if (!db) throw new Error("Firebase has not been initialized.");
  return db;
}

function withTTL(doc, ttlSeconds) {
  const now = Date.now();
  return {
    ...doc,
    lastUpdated: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
    version: (doc.version || 0) + 1,
  };
}

function isExpired(doc) {
  if (!doc?.expiresAt) return true;
  return new Date(doc.expiresAt).getTime() < Date.now();
}

async function smartWrite(collectionPath, docId, data, ttlSeconds) {
  const database = getDb();
  const ref = database.collection(collectionPath).doc(String(docId));
  const existing = await ref.get();

  if (existing.exists && !isExpired(existing.data())) {
    const changes = getChangedFields(existing.data(), data);
    if (!changes) return { written: false, reason: 'unchanged' };
    const toWrite = { ...changes };
    delete toWrite._isNew;
    const doc = withTTL(toWrite, ttlSeconds);
    await ref.set(doc, { merge: true });
    return { written: true };
  }

  const doc = withTTL(data, ttlSeconds);
  await ref.set(doc, { merge: true });
  return { written: true };
}

// ★ FIX: CHUNK_SIZE reduced to 100 to prevent network socket drops completely
async function smartBatchWrite(collectionPath, docs, ttlSeconds) {
  const database = getDb();
  let written = 0, skipped = 0;
  if (!docs.length) return { written, skipped };

  const CHUNK_SIZE = 100; 
  
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE);
    const batch = database.batch();
    for (const doc of chunk) {
      const ref = database.collection(collectionPath).doc(String(doc.id));
      const docWithMeta = withTTL(doc, ttlSeconds);
      batch.set(ref, docWithMeta, { merge: true });
      written++;
    }
    await Promise.race([
      batch.commit(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Batch write timeout")), WRITE_TIMEOUT_MS))
    ]);
  }
  return { written, skipped };
}

async function batchWrite(collectionPath, documents) {
  const database = getDb();
  const colRef = database.collection(collectionPath);
  if (!documents.length) return 0;
  let totalWritten = 0;
  
  const CHUNK_SIZE = 100;
  for (let i = 0; i < documents.length; i += CHUNK_SIZE) {
    const chunk = documents.slice(i, i + CHUNK_SIZE);
    const batch = database.batch();
    for (const doc of chunk) {
      batch.set(colRef.doc(String(doc.id)), doc, { merge: true });
    }
    await Promise.race([
      batch.commit(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Batch write timeout")), WRITE_TIMEOUT_MS))
    ]);
    totalWritten += chunk.length;
  }
  return totalWritten;
}

async function deleteByIds(collectionPath, ids) {
  if (!ids || ids.length === 0) return 0;
  const database = getDb();
  const colRef = database.collection(collectionPath);
  let totalDeleted = 0;
  
  const CHUNK_SIZE = 100;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const batch = database.batch();
    for (const id of chunk) batch.delete(colRef.doc(String(id)));
    await Promise.race([
      batch.commit(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Delete by IDs timeout")), WRITE_TIMEOUT_MS))
    ]);
    totalDeleted += chunk.length;
  }
  return totalDeleted;
}

async function clearCollection(collectionPath) {
  const database = getDb();
  const colRef = database.collection(collectionPath);
  let totalDeleted = 0;
  let query = colRef.limit(100);
  
  while (true) {
    const snapshot = await Promise.race([
      query.get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Clear collection read timeout")), WRITE_TIMEOUT_MS)),
    ]);
    if (snapshot.empty) break;
    
    const batch = database.batch();
    for (const doc of snapshot.docs) batch.delete(doc.ref);
    await Promise.race([
      batch.commit(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Clear collection delete timeout")), WRITE_TIMEOUT_MS)),
    ]);
    totalDeleted += snapshot.size;
  }
  return totalDeleted;
}

async function replaceCollection(collectionPath, documents) {
  const deleted = await clearCollection(collectionPath);
  if (!documents.length) return { deleted, written: 0 };
  const written = await batchWrite(collectionPath, documents);
  return { deleted, written };
}

async function getMeta(docId) {
  const database = getDb();
  const doc = await database.collection("meta").doc(docId).get();
  return doc.exists ? doc.data() : null;
}

async function setMeta(docId, data) {
  const database = getDb();
  await database.collection("meta").doc(docId).set(data, { merge: true });
}

async function updateMeta(docId, data) {
  const database = getDb();
  await database.collection("meta").doc(docId).update({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteDoc(collectionPath, docId) {
  const database = getDb();
  await database.collection(collectionPath).doc(String(docId)).delete();
}

module.exports = Object.freeze({
  initializeFirebase, getDb, batchWrite, deleteByIds, clearCollection, replaceCollection,
  getMeta, setMeta, updateMeta, deleteDoc, smartWrite, smartBatchWrite, withTTL, isExpired,
});