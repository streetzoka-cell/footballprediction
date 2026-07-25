const { getDb } = require("../config/firebase");
const logger = require("../utils/logger");

// Top tier league IDs from API-Football to prioritize when truncating
const PRIORITY_LEAGUE_IDS = new Set([1, 2, 3, 4, 5, 848, 39, 140, 135, 78, 61, 40, 94, 88, 253]);

/**
 * Strip a match to essential fields for snapshots.
 * ★ FIX: Omit null/undefined/empty values to prevent exceeding Firestore's 1MB document limit.
 */
function stripMatch(m) {
  if (!m) return null;
  
  // Base object with mandatory fields
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
  };

  // Only add optional fields if they have valid values to save space
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
 * ★ FIX: Process matches to strip empty fields, and truncate if exceeding Firestore limits.
 * Firestore max document size is 1MB (~1,048,576 bytes). 650 matches safely fits this limit.
 */
function processMatches(matches, limit = 650) {
  if (!matches || matches.length === 0) return [];
  
  let processed = matches.map(stripMatch).filter(Boolean);
  
  // If we are well under the limit, return as is
  if (processed.length <= limit) return processed;
  
  logger.warn(`[Snapshot] Match count (${processed.length}) exceeds safe limit (${limit}). Truncating obscure leagues...`);
  
  // 1. Keep priority leagues (Premier League, La Liga, Serie A, etc.)
  let priorityMatches = processed.filter(m => PRIORITY_LEAGUE_IDS.has(Number(m.leagueId)));
  
  // 2. If priority leagues are too many, slice them
  if (priorityMatches.length > limit) {
    return priorityMatches.slice(0, limit);
  }
  
  // 3. If we still need more to reach the limit, add non-priority matches
  const remaining = limit - priorityMatches.length;
  if (remaining > 0) {
    const nonPriorityMatches = processed.filter(m => !PRIORITY_LEAGUE_IDS.has(Number(m.leagueId)));
    priorityMatches = priorityMatches.concat(nonPriorityMatches.slice(0, remaining));
  }
  
  return priorityMatches;
}

class SnapshotWriter {
  async writeFootballSnapshot(dateStr, data) {
    const payload = { sport: "football" };
    
    // ★ Cap scheduled matches to 650 to avoid Firestore 1MB limit
    if (data.matches) payload.matches = processMatches(data.matches, 650);
    // Live and finished arrays rarely exceed limits, but we cap them just to be safe
    if (data.live) payload.live = processMatches(data.live, 100);
    if (data.finished) payload.finished = processMatches(data.finished, 400);
    
    return this._write("fixture_snapshots", dateStr, payload);
  }

  async writeBasketballSnapshot(dateStr, data) {
    const payload = { sport: "basketball" };
    
    if (data.matches) payload.matches = processMatches(data.matches, 650);
    if (data.live) payload.live = processMatches(data.live, 100);
    if (data.finished) payload.finished = processMatches(data.finished, 400);
    
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