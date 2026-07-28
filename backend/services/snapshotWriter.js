const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');

/**
 * Writes or merges an aggregated daily snapshot of matches.
 * Frontend reads from collection('fixture_snapshots').doc(`football_${dateStr}`)
 * 
 * @param {string} dateStr - The date (YYYY-MM-DD)
 * @param {object} data - Object containing arrays of matches (e.g., { matches, live, finished })
 */
async function writeFootballSnapshot(dateStr, data) {
  try {
    const db = getDb();
    const ref = db.collection('fixture_snapshots').doc(`football_${dateStr}`);
    
    // Use merge: true so we can layer { matches }, then { live }, then { finished } safely
    await ref.set({
      ...data,
      date: dateStr,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    logger.info(`[SnapshotWriter] Wrote snapshot for football_${dateStr}`);
  } catch (err) {
    logger.error(`[SnapshotWriter] Failed to write snapshot for ${dateStr}: ${err.message}`);
    throw err;
  }
}

module.exports = { writeFootballSnapshot };