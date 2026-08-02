// footballprediction/backend-v1/src/config/firebase.js

const admin = require('firebase-admin');
const env = require('./env');
const logger = require('../utils/logger');
const { BATCH_MAX_OPS, WRITE_TIMEOUT_MS } = require('./constants');
const { getChangedFields } = require('../utils/compare');

let db = null;
let storage = null;

function initializeFirebase() {
  if (db) return db;
  try {
    logger.info('[Firebase] Initializing...');
    if (!env.FIREBASE_PRIVATE_KEY) throw new Error('FIREBASE_PRIVATE_KEY is missing');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, ''),
      }),
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
    });

    
    db = admin.firestore();
    db.settings({ 
      ignoreUndefinedProperties: true 
    });

    // if (env.FIREBASE_STORAGE_BUCKET) {
    //   storage = admin.storage().bucket();
    // } else {
    //   logger.warn('[Firebase] FIREBASE_STORAGE_BUCKET is missing in .env. Static file publishing will be disabled.');
    // }

    logger.info('[Firebase] Firestore & Storage initialized.');
    return db;
  } catch (error) {
    logger.error(`[Firebase] Initialization failed: ${error.stack}`);
    throw error;
  }
}

function getDb() {
  if (!db) throw new Error('Firebase has not been initialized.');
  return db;
}

function getStorage() {
  if (!storage) throw new Error('Firebase Storage has not been initialized.');
  return storage;
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

// Smart write: only writes to Firestore if data has changed
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

// Batch write with 50-doc chunking to prevent socket drops
async function smartBatchWrite(collectionPath, docs, ttlSeconds) {
  const database = getDb();
  let written = 0, skipped = 0;
  if (!docs.length) return { written, skipped };

  for (let i = 0; i < docs.length; i += BATCH_MAX_OPS) {
    const chunk = docs.slice(i, i + BATCH_MAX_OPS);
    const batch = database.batch();
    for (const doc of chunk) {
      const ref = database.collection(collectionPath).doc(String(doc.id));
      const docWithMeta = withTTL(doc, ttlSeconds);
      batch.set(ref, docWithMeta, { merge: true });
      written++;
    }
    await Promise.race([
      batch.commit(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Batch write timeout')), WRITE_TIMEOUT_MS))
    ]);
  }
  return { written, skipped };
}

async function deleteByIds(collectionPath, ids) {
  if (!ids || ids.length === 0) return 0;
  const database = getDb();
  const colRef = database.collection(collectionPath);
  let totalDeleted = 0;
  
  for (let i = 0; i < ids.length; i += BATCH_MAX_OPS) {
    const chunk = ids.slice(i, i + BATCH_MAX_OPS);
    const batch = database.batch();
    for (const id of chunk) batch.delete(colRef.doc(String(id)));
    await Promise.race([
      batch.commit(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Delete timeout')), WRITE_TIMEOUT_MS))
    ]);
    totalDeleted += chunk.length;
  }
  return totalDeleted;
}

async function clearCollection(collectionPath) {
  const database = getDb();
  const colRef = database.collection(collectionPath);
  let totalDeleted = 0;
  let query = colRef.limit(BATCH_MAX_OPS * 2); // 100 docs at a time
  
  while (true) {
    const snapshot = await Promise.race([
      query.get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Clear collection read timeout')), WRITE_TIMEOUT_MS)),
    ]);
    if (snapshot.empty) break;
    
    const batch = database.batch();
    for (const doc of snapshot.docs) batch.delete(doc.ref);
    await Promise.race([
      batch.commit(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Clear collection delete timeout')), WRITE_TIMEOUT_MS)),
    ]);
    totalDeleted += snapshot.size;
  }
  return totalDeleted;
}

async function getMeta(docId) {
  const database = getDb();
  const doc = await database.collection(COLLECTIONS.META).doc(docId).get();
  return doc.exists ? doc.data() : null;
}

async function setMeta(docId, data) {
  const database = getDb();
  await database.collection(COLLECTIONS.META).doc(docId).set(data, { merge: true });
}

module.exports = Object.freeze({
  initializeFirebase,
  getDb,
  getStorage,
  batchWrite: smartBatchWrite, // alias for consistency
  deleteByIds,
  clearCollection,
  getMeta,
  setMeta,
  smartWrite,
  smartBatchWrite,
  withTTL,
  isExpired,
});
