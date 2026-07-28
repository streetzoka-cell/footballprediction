const { getDb } = require("../config/firebase");
const logger = require("../utils/logger");

/**
 * Strip a match to essential fields for snapshots.
 */
function stripMatch(m) {
  if (!m) return null;
  
  const stripped = {
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
    sport: m.sport || "football",
    matchScore: m.matchScore || 0,       // NEW: Pass score to frontend
    category: m.category || 'NORMAL',    // NEW: Pass category to frontend
  };

  if (m.statusLong) stripped.statusLong = m.statusLong;
  if (m.leagueCountry) stripped.leagueCountry = m.leagueCountry;
  if (m.leagueFlag) stripped.leagueFlag = m.leagueFlag;
  if (m.season) stripped.season = m.season;
  if (m.round) stripped.round = m.round;
  
  if (m.scoreHalftimeHome != null) stripped.scoreHalftimeHome = m.scoreHalftimeHome;
  if (m.scoreHalftimeAway != null) stripped.scoreHalftimeAway = m.scoreHalftimeAway;
  if (m.scoreFulltimeHome != null) stripped.scoreFulltimeHome = m.scoreFulltimeHome;
  if (m.scoreFulltimeAway != null) stripped.scoreFulltimeAway = m.scoreFulltimeAway;
  if (m.scoreExtratimeHome != null) stripped.scoreExtratimeHome = m.scoreExtratimeHome;
  if (m.scoreExtratimeAway != null) stripped.scoreExtratimeAway = m.scoreExtratimeAway;
  if (m.scorePenaltyHome != null) stripped.scorePenaltyHome = m.scorePenaltyHome;
  if (m.scorePenaltyAway != null) stripped.scorePenaltyAway = m.scorePenaltyAway;
  
  return stripped;
}

/**
 * Process matches to strip empty fields, and truncate if exceeding Firestore limits.
 */
function processMatches(matches, limit = 1000) { // ★ FIX: Increased limit from 650 to 1000
  if (!matches || matches.length === 0) return [];
  
  let processed = matches.map(stripMatch).filter(Boolean);
  
  if (processed.length <= limit) return processed;
  
  logger.warn(`[Snapshot] Match count (${processed.length}) exceeds safe limit (${limit}). Truncating by matchScore...`);
  
  // Sort by matchScore descending to keep the most important matches
  processed.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  
  return processed.slice(0, limit);
}

class SnapshotWriter {
  async writeFootballSnapshot(dateStr, data) {
    const payload = { sport: "football" };
    
    // ★ FIX: Pass 1000 as the limit
    if (data.matches) payload.matches = processMatches(data.matches, 1000);
    if (data.live) payload.live = processMatches(data.live, 1000);
    if (data.finished) payload.finished = processMatches(data.finished, 1000);
    
    return this._write("fixture_snapshots", dateStr, payload);
  }

  async writeBasketballSnapshot(dateStr, data) {
    const payload = { sport: "basketball" };
    
    if (data.matches) payload.matches = processMatches(data.matches, 1000);
    if (data.live) payload.live = processMatches(data.live, 1000);
    if (data.finished) payload.finished = processMatches(data.finished, 1000);
    
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
      logger.info(`[Snapshot] Successfully wrote ${docId}`);
    } catch (err) {
      logger.error(`[Snapshot] Write failed ${collection}/${docId}: ${err.message}`);
    }
  }
}

module.exports = new SnapshotWriter();