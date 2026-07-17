/*
 * snapshotWriter.js
 * Writes single-document snapshots that the frontend reads directly.
 *
 * ★ SIZE OPTIMIZATION: Strips match objects down to only the essential 
 * fields required by the frontend. This reduces the document size by 
 * ~90%, allowing 1000+ matches to easily fit inside Firestore's 1MB 
 * document limit without needing complex chunking.
 */

const { getDb } = require("../config/firebase");
const logger = require("../utils/logger");

function stripMatch(m) {
  if (!m) return null;
  return {
    id: m.id,
    date: m.date,
    timestamp: m.timestamp,
    status: m.status,
    elapsed: m.elapsed,
    leagueId: m.leagueId,
    leagueName: m.leagueName,
    leagueLogo: m.leagueLogo,
    homeTeamId: m.homeTeamId,
    homeTeamName: m.homeTeamName,
    homeTeamLogo: m.homeTeamLogo,
    awayTeamId: m.awayTeamId,
    awayTeamName: m.awayTeamName,
    awayTeamLogo: m.awayTeamLogo,
    goalsHome: m.goalsHome,
    goalsAway: m.goalsAway,
    sport: m.sport || "football"
  };
}

class SnapshotWriter {
  async writeFootballSnapshot(dateStr, data) {
    return this._write("fixture_snapshots", dateStr, {
      matches: (data.matches || []).map(stripMatch),
      live: (data.live || []).map(stripMatch),
      finished: (data.finished || []).map(stripMatch),
      sport: "football",
    });
  }

  async writeBasketballSnapshot(dateStr, data) {
    return this._write("fixture_snapshots", `basketball_${dateStr}`, {
      matches: (data.matches || []).map(stripMatch),
      live: (data.live || []).map(stripMatch),
      finished: (data.finished || []).map(stripMatch),
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
        .set({
          ...data,
          updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (err) {
      logger.error(`[Snapshot] Write failed ${collection}/${docId}: ${err.message}`);
    }
  }
}

module.exports = new SnapshotWriter();