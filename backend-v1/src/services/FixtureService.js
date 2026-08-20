const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { buildUnifiedFixtures } = require('./UnifiedFixtureService');
const { writeFootballSnapshot, calculateMatchScore, categorizeMatch } = require('./SnapshotService');
const { getDateOffset } = require('../config/constants');
const logger = require('../utils/logger');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data');

async function syncFixturesForDate(dateStr) {
  const filePath = path.join(PUBLIC_DIR, 'fixtures', `${dateStr}.json`);

  if (fsSync.existsSync(filePath)) {
    const stats = await fs.stat(filePath);
    if (stats.size < 100) {
      logger.warn(`[FixtureService] Fixtures file for ${dateStr} is empty (${stats.size} bytes). Re-fetching...`);
      await fs.unlink(filePath);
    } else {
      logger.info(`[FixtureService] Fixtures for ${dateStr} already exist locally. Skipping API fetch.`);
      return 0;
    }
  }

  logger.info(`[FixtureService] Syncing unified fixtures for ${dateStr}`);
  const matches = await buildUnifiedFixtures(dateStr);

  if (!Array.isArray(matches) || matches.length === 0) {
    logger.warn(`[FixtureService] No matches returned for ${dateStr}. Skipping write to prevent overwriting good data.`);
    return 0;
  }

  const scored = matches.map(doc => {
    doc.matchScore = calculateMatchScore(doc);
    doc.category = categorizeMatch(doc.matchScore);
    return doc;
  }).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  await writeFootballSnapshot(dateStr, { matches: scored });
  return scored.length;
}

async function syncTodayFixtures() {
  return syncFixturesForDate(getDateOffset(0));
}

async function syncTomorrowFixtures() {
  return syncFixturesForDate(getDateOffset(1));
}

async function syncYesterdayResults() {
  return syncMasterResults(-1);
}

async function syncFinishedFixtures(forceFetch = false, offset = 0) {
  const dateStr = getDateOffset(offset);
  const fixturesPath = path.join(PUBLIC_DIR, 'fixtures', `${dateStr}.json`);
  const resultsPath = path.join(PUBLIC_DIR, 'results', `${dateStr}.json`);

  let matches = [];

  logger.info(`[FixtureService] Loading local fixtures for ${dateStr} (offset: ${offset})...`);

  try {
    const raw = await fs.readFile(fixturesPath, 'utf8');
    const parsed = JSON.parse(raw);
    matches = Array.isArray(parsed) ? parsed : (parsed.data || []);
  } catch (e) {
    if (!forceFetch) {
      logger.warn(`[FixtureService] No local fixtures found for ${dateStr}.`);
      return [];
    }

    logger.warn(
      `[FixtureService] Local fixtures missing for ${dateStr}. Performing one-time API fetch.`
    );

    matches = await buildUnifiedFixtures(dateStr);
  }

  const stillFixtures = [];
  const newlyFinished = [];
  const nowMs = Date.now();

  const FT_FORCE_MS = 3.5 * 60 * 60 * 1000;
  const STUCK_AT_90_MS = 3 * 60 * 60 * 1000;

  for (let match of matches) {
    const isFT = match.status === 'FT' || match.display?.isFinished === true;
    const minute = match.display?.minute || match.minute || 0;
    const atNinety = minute >= 90 || match.status === '90' || match.status === '2H';

    const elapsedMs = match.timestamp ? (nowMs - match.timestamp * 1000) : 0;

    const stuckAtNinety = atNinety && elapsedMs > STUCK_AT_90_MS;
    const isExpired = elapsedMs > FT_FORCE_MS;

    if (isFT || isExpired || stuckAtNinety) {
      if (match.homeScore == null || match.awayScore == null) {
        match.status = 'FT';
        match.isLive = false;
        if (match.display) {
          match.display.isLive = false;
          match.display.isFinished = true;
          match.display.minute = 90;
        }
        logger.warn(
          `[FixtureService] Match ${match.id} is FT with no score — marked finished (not live).`
        );
        stillFixtures.push(match);
        continue;
      }

      if (match.display) {
        match.display.isFinished = true;
        match.display.isLive = false;
        match.display.minute = 90;
        if (match.display.score) {
          match.display.score.home = match.homeScore;
          match.display.score.away = match.awayScore;
        }
      }
      match.status = 'FT';
      newlyFinished.push(match);
    } else {
      stillFixtures.push(match);
    }
  }

  if (newlyFinished.length === 0) {
    logger.info(`[FixtureService] No newly finished matches found for ${dateStr}.`);
    const scoredStill = stillFixtures.map(doc => {
      doc.matchScore = calculateMatchScore(doc);
      doc.category = categorizeMatch(doc.matchScore);
      return doc;
    }).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    await writeFootballSnapshot(dateStr, { matches: scoredStill });
    return [];
  }

  const scoredStill = stillFixtures.map(doc => {
    doc.matchScore = calculateMatchScore(doc);
    doc.category = categorizeMatch(doc.matchScore);
    return doc;
  }).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  await writeFootballSnapshot(dateStr, { matches: scoredStill });

  let existingResults = [];
  try {
    if (fsSync.existsSync(resultsPath)) {
      const rawRes = await fs.readFile(resultsPath, 'utf8');
      const parsedRes = JSON.parse(rawRes);
      existingResults = Array.isArray(parsedRes) ? parsedRes : (parsedRes.data || []);
    }
  } catch (e) { /* File doesn't exist yet */ }

  const merged = [...existingResults, ...newlyFinished];
  const unique = Array.from(new Map(merged.map(m => [String(m.id || `${m.homeTeamName || m.homeTeam?.name}-${m.awayTeamName || m.awayTeam?.name}`), m])).values());

  logger.info(`[FixtureService] Moved ${newlyFinished.length} finished matches to results for ${dateStr}. Total results: ${unique.length}`);

  await writeFootballSnapshot(dateStr, { finished: unique });

  return newlyFinished;
}

async function syncRecentFinishedFixtures(forceFetch = false) {
  logger.info(`[FixtureService] Syncing recent finished fixtures (Today & Yesterday)...`);
  const todayCount = await syncFinishedFixtures(forceFetch, 0);
  const yesterdayCount = await syncFinishedFixtures(forceFetch, -1);
  return todayCount + yesterdayCount;
}

/**
 * ★ NEW: Smart Master Results Sync
 * Fetches ALL matches for a date directly from the API.
 * Safely updates fixtures and results JSONs without data loss.
 */
async function syncMasterResults(offset = 0) {
  const dateStr = getDateOffset(offset);
  logger.info(`[FixtureService] Master Results Sync for ${dateStr}...`);

  const matches = await buildUnifiedFixtures(dateStr);
  if (!Array.isArray(matches) || matches.length === 0) return 0;

  const finishedMatches = matches.filter(m => m.display?.isFinished || m.status === 'FT');
  const scheduledMatches = matches.filter(m => !m.display?.isFinished && m.status !== 'FT');

  // 1. Update fixtures file with the remaining scheduled matches
  const scoredScheduled = scheduledMatches.map(doc => {
    doc.matchScore = calculateMatchScore(doc);
    doc.category = categorizeMatch(doc.matchScore);
    return doc;
  }).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  await writeFootballSnapshot(dateStr, { matches: scoredScheduled });

  // 2. Update results file
  let existingResults = [];
  const resultsPath = path.join(PUBLIC_DIR, 'results', `${dateStr}.json`);
  try {
    if (fsSync.existsSync(resultsPath)) {
      const rawRes = await fs.readFile(resultsPath, 'utf8');
      const parsedRes = JSON.parse(rawRes);
      existingResults = Array.isArray(parsedRes) ? parsedRes : (parsedRes.data || []);
    }
  } catch (e) { /* File doesn't exist yet */ }

  const resultMap = new Map();
  existingResults.forEach(m => resultMap.set(String(m.id), m));
  
  let newCount = 0;
  finishedMatches.forEach(m => {
    if (m.homeScore != null && m.awayScore != null) {
      if (!resultMap.has(String(m.id))) newCount++;
      // Overwrite with master API data to ensure accuracy
      resultMap.set(String(m.id), m); 
    }
  });

  const uniqueResults = Array.from(resultMap.values());
  await writeFootballSnapshot(dateStr, { finished: uniqueResults });

  logger.info(`[FixtureService] Master sync complete for ${dateStr}. Scheduled: ${scoredScheduled.length}, Results: ${uniqueResults.length} (New: ${newCount})`);
  return newCount;
}

async function refreshFinishedMatches() {
  await syncMasterResults(0); // Today
  await syncMasterResults(-1); // Yesterday
}

module.exports = {
  syncFixturesForDate,
  syncTodayFixtures,
  syncTomorrowFixtures,
  syncYesterdayResults,
  syncFinishedFixtures,
  syncRecentFinishedFixtures,
  syncMasterResults, // ★ Export new function
  forceRefreshFinishedMatches: refreshFinishedMatches, // Alias for compatibility
  refreshFinishedMatches
};