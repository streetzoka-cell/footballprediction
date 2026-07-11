/*
 * snapshotWriter.js
 * Writes single-document snapshots that the frontend reads directly.
 *
 * Called by daily/live services after writing to collections.
 * Uses merge:true so daily and live services don't overwrite
 * each other's fields in the same document.
 *
 * Daily service owns:  yesterday, today, tomorrow
 * Live service owns:   live, finished
 *
 * Cost: 1 write per sync. Enables 80× fewer frontend reads.
 */

const { getDb } = require("../config/firebase");
const logger = require("../utils/logger");

class SnapshotWriter {
  writeFootballSnapshot(dateStr, data) {
    return this._write("fixture_snapshots", dateStr, {
      ...data,
      sport: "football",
    });
  }

  writeBasketballSnapshot(dateStr, data) {
    return this._write("fixture_snapshots", `basketball_${dateStr}`, {
      ...data,
      sport: "basketball",
    });
  }

  writeReference(type, sport, data) {
    const docId = sport === "basketball" ? `bb_${type}` : type;
    return this._write("reference_data", docId, { data, sport, type });
  }

  async _write(collection, docId, data) {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .collection(collection)
        .doc(docId)
        .set(
          {
            ...data,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      logger.debug(`[Snapshot] Wrote ${collection}/${docId}`);
    } catch (err) {
      logger.error(
        `[Snapshot] Write failed ${collection}/${docId}: ${err.message}`
      );
    }
  }
}

module.exports = new SnapshotWriter();