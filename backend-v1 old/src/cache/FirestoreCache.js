// footballprediction/backend-v1/src/cache/FirestoreCache.js



const { getDb, isExpired } = require('../config/firebase');
const logger = require('../utils/logger');

/**
 * Reads a document from Firestore. If expired, calls the fetchFn to get fresh data,
 * saves it back to Firestore, and returns it. 
 * (Used for lazy-loading individual entities like Teams/Players)
 */
async function getOrSetDoc(collection, docId, fetchFn, ttlSeconds) {
  const db = getDb();
  const ref = db.collection(collection).doc(String(docId));
  
  try {
    const snap = await ref.get();
    if (snap.exists && !isExpired(snap.data())) {
      return snap.data();
    }
  } catch (err) {
    logger.warn(`[FirestoreCache] Read error for ${collection}/${docId}: ${err.message}`);
  }

  // Fetch fresh data
  const freshData = await fetchFn();
  if (!freshData) return null;

  const now = Date.now();
  const docToSave = {
    ...freshData,
    lastUpdated: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
    version: (snap?.data()?.version || 0) + 1,
  };

  try {
    await ref.set(docToSave, { merge: true });
  } catch (err) {
    logger.error(`[FirestoreCache] Write error for ${collection}/${docId}: ${err.message}`);
  }

  return docToSave;
}

module.exports = { getOrSetDoc };
