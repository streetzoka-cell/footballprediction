// backend-v1/src/cache/FirestoreCache.js

const { getDb, isExpired } = require('../config/firebase');
const logger = require('../utils/logger');

/**
 * Reads a document from Firestore.
 *
 * If expired:
 * - fetch fresh data using fetchFn
 * - save fresh data back to Firestore
 * - return fresh data
 *
 * If fetch fails:
 * - return stale data if available
 * - otherwise throw
 */
async function getOrSetDoc(collection, docId, fetchFn, ttlSeconds) {
  const db = getDb();
  const ref = db.collection(collection).doc(String(docId));

  let existingData = null;
  let existingVersion = 0;

  try {
    const snap = await ref.get();

    if (snap.exists) {
      existingData = snap.data();
      existingVersion = Number(existingData.version || 0);

      if (!isExpired(existingData)) {
        return existingData;
      }
    }
  } catch (err) {
    logger.warn(`[FirestoreCache] Read error for ${collection}/${docId}: ${err.message}`);
  }

  let freshData = null;

  try {
    freshData = await fetchFn();
  } catch (err) {
    logger.error(
      `[FirestoreCache] Fetch failed for ${collection}/${docId}: ${err.message}`
    );

    // Return stale data instead of failing completely
    if (existingData) {
      logger.warn(
        `[FirestoreCache] Returning stale data for ${collection}/${docId}`
      );
      return existingData;
    }

    throw err;
  }

  if (freshData === null || freshData === undefined) {
    return existingData;
  }

  const now = Date.now();

  const docToSave = {
    ...freshData,
    lastUpdated: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
    version: existingVersion + 1,
  };

  try {
    await ref.set(docToSave, { merge: true });
  } catch (err) {
    logger.error(
      `[FirestoreCache] Write error for ${collection}/${docId}: ${err.message}`
    );
  }

  return docToSave;
}

module.exports = {
  getOrSetDoc,
};