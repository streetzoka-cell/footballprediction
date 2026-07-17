/*
 * snapshotWriter.js
 * Writes single-document snapshots that the frontend reads directly.
 *
 * ★ AUTO-CHUNKING: Automatically splits large arrays into multiple 
 * documents to bypass Firestore's 1MB document size limit.
 */

const { getDb } = require("../config/firebase");
const logger = require("../utils/logger");

const MAX_CHUNK_SIZE = 150; // Matches per document to stay well under 1MB

class SnapshotWriter {
  async writeFootballSnapshot(dateStr, data) {
    await this._writeChunked("fixture_snapshots", dateStr, {
      ...data,
      sport: "football",
    });
  }

  async writeBasketballSnapshot(dateStr, data) {
    await this._writeChunked("fixture_snapshots", `basketball_${dateStr}`, {
      ...data,
      sport: "basketball",
    });
  }

  writeReference(type, sport, data) {
    const docId = sport === "basketball" ? `bb_${type}` : type;
    return this._write("reference_data", docId, { data, sport, type });
  }

  async _writeChunked(collection, docIdPrefix, data) {
    const db = getDb();
    if (!db) return;

    // Extract arrays that need chunking
    const matches = data.matches || [];
    
    if (matches.length > MAX_CHUNK_SIZE) {
      const chunks = [];
      for (let i = 0; i < matches.length; i += MAX_CHUNK_SIZE) {
        chunks.push(matches.slice(i, i + MAX_CHUNK_SIZE));
      }

      // Write meta document (no arrays, just counts and live/finished)
      await this._write(collection, docIdPrefix, {
        sport: data.sport,
        updatedAt: new Date().toISOString(),
        isChunked: true,
        totalMatches: matches.length,
        totalChunks: chunks.length,
        live: data.live || [],
        finished: data.finished || []
      });

      // Write chunks
      for (let i = 0; i < chunks.length; i++) {
        await this._write(collection, `${docIdPrefix}_chunk_${i}`, {
          sport: data.sport,
          updatedAt: new Date().toISOString(),
          chunkIndex: i,
          matches: chunks[i]
        });
      }
    } else {
      // Small enough to write in one document
      await this._write(collection, docIdPrefix, {
        ...data,
        updatedAt: new Date().toISOString(),
        isChunked: false
      });
    }
  }

  async _write(collection, docId, data) {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .collection(collection)
        .doc(docId)
        .set(data, { merge: true });
    } catch (err) {
      logger.error(`[Snapshot] Write failed ${collection}/${docId}: ${err.message}`);
    }
  }
}

module.exports = new SnapshotWriter();