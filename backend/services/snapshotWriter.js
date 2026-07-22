// ═══════════════════════════════════════════════════════════════
// FILE: backend/services/snapshotWriter.js (CURRENT BACKEND)
// ═══════════════════════════════════════════════════════════════

const { getDb } = require("../config/firebase");
const logger = require("../utils/logger");

/**
 * Strip a match to essential fields for snapshots.
 * MUST include everything frontend api.jsx transformMatch() expects.
 */
function stripMatch(m) {
  if (!m) return null;
  return {
    id: m.id,
    date: m.date,
    timestamp: m.timestamp,
    
    // Status
    status: m.status,
    statusLong: m.statusLong || null,  // ★ ADDED
    elapsed: m.elapsed,
    
    // League
    leagueId: m.leagueId,
    leagueName: m.leagueName,
    leagueLogo: m.leagueLogo,
    leagueCountry: m.leagueCountry || null,  // ★ ADDED
    leagueFlag: m.leagueFlag || null,        // ★ ADDED
    season: m.season || null,                // ★ ADDED
    round: m.round || null,                  // ★ ADDED
    
    // Teams
    homeTeamId: m.homeTeamId,
    homeTeamName: m.homeTeamName,
    homeTeamLogo: m.homeTeamLogo,
    awayTeamId: m.awayTeamId,
    awayTeamName: m.awayTeamName,
    awayTeamLogo: m.awayTeamLogo,
    
    // Scores
    goalsHome: m.goalsHome,
    goalsAway: m.goalsAway,
    
    // Score Breakdowns (for finished matches) ★ ADDED
    scoreHalftimeHome: m.scoreHalftimeHome ?? null,
    scoreHalftimeAway: m.scoreHalftimeAway ?? null,
    scoreFulltimeHome: m.scoreFulltimeHome ?? null,
    scoreFulltimeAway: m.scoreFulltimeAway ?? null,
    scoreExtratimeHome: m.scoreExtratimeHome ?? null,
    scoreExtratimeAway: m.scoreExtratimeAway ?? null,
    scorePenaltyHome: m.scorePenaltyHome ?? null,
    scorePenaltyAway: m.scorePenaltyAway ?? null,
    
    sport: m.sport || "football",
  };
}

class SnapshotWriter {
  async writeFootballSnapshot(dateStr, data) {
    const payload = { sport: "football" };
    
    if (data.matches) payload.matches = data.matches.map(stripMatch);
    if (data.live) payload.live = data.live.map(stripMatch);
    if (data.finished) payload.finished = data.finished.map(stripMatch);
    
    return this._write("fixture_snapshots", dateStr, payload);
  }

  async writeBasketballSnapshot(dateStr, data) {
    const payload = { sport: "basketball" };
    
    if (data.matches) payload.matches = data.matches.map(stripMatch);
    if (data.live) payload.live = data.live.map(stripMatch);
    if (data.finished) payload.finished = data.finished.map(stripMatch);
    
    return this._write("fixture_snapshots", `basketball_${dateStr}`, payload);
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
        .set({ ...data, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      logger.error(`[Snapshot] Write failed ${collection}/${docId}: ${err.message}`);
    }
  }
}

module.exports = new SnapshotWriter();