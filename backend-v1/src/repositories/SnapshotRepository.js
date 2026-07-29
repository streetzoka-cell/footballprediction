const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const { WRITE_TIMEOUT_MS } = require('../config/constants');

async function getSnapshot(dateStr) {
  const db = getDb();
  const docId = 'football_' + dateStr;
  const snap = await db.collection('fixture_snapshots').doc(docId).get();
  return snap.exists ? snap.data() : { matches: [], live: [], finished: [] };
}

async function saveSnapshot(dateStr, data) {
  const db = getDb();
  const docId = 'football_' + dateStr;
  
  // Sanitize data: removes any undefined/non-serializable fields
  const cleanData = JSON.parse(JSON.stringify(data));
  
  const payloadStr = JSON.stringify(cleanData);
  const sizeKB = (Buffer.byteLength(payloadStr) / 1024).toFixed(2);
  logger.info(`[SnapshotRepo] Saving ${docId} (Size: ${sizeKB} KB)`);

  try {
    await Promise.race([
      db.collection('fixture_snapshots').doc(docId).set(cleanData),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Snapshot save timeout')), WRITE_TIMEOUT_MS))
    ]);
  } catch (err) {
    logger.error(`[SnapshotRepo] Save failed: ${err.message}`);
    throw err;
  }
}

module.exports = { getSnapshot, saveSnapshot };