// backend-v1/src/services/FixtureService.js
const fs = require('fs').promises; // ★ CHANGED to fs.promises
const fsSync = require('fs');      // Keep sync only for quick exists checks
const path = require('path');
const { buildUnifiedFixtures } = require('./UnifiedFixtureService');
const { writeFootballSnapshot, calculateMatchScore, categorizeMatch } = require('./SnapshotService');
const { getDateOffset } = require('../config/constants');
const QuotaManager = require('./QuotaManager');
const logger = require('../utils/logger');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data');

async function syncFixturesForDate(dateStr) {
  const filePath = path.join(PUBLIC_DIR, 'fixtures', `${dateStr}.json`);
  
  if (fsSync.existsSync(filePath)) {
    const stats = await fs.stat(filePath); // ★ ASYNC
    if (stats.size < 100) {
      logger.warn(`[FixtureService] Fixtures file for ${dateStr} is empty (${stats.size} bytes). Re-fetching...`);
      await fs.unlink(filePath); // ★ ASYNC
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
  const dateStr = getDateOffset(-1);
  const filePath = path.join(PUBLIC_DIR, 'results', `${dateStr}.json`);
  if (fsSync.existsSync(filePath)) {
    const stats = await fs.stat(filePath);
    if (stats.size < 100) {
      await fs.unlink(filePath);
    } else {
      return 0;
    }
  }

  const matches = await buildUnifiedFixtures(dateStr);
  if (!Array.isArray(matches) || matches.length === 0) return 0;
  
  const finished = matches.filter(m => m.display?.isFinished || m.status === 'FT');
  await writeFootballSnapshot(dateStr, { finished });
  return finished.length;
}

// ★ NEW: forceFetch=true on startup to get real scores from APIs. forceFetch=false for cron to save quota.
async function syncFinishedFixtures(forceFetch = false) {
  const dateStr = getDateOffset(0);
  const fixturesPath = path.join(PUBLIC_DIR, 'fixtures', `${dateStr}.json`);
  const resultsPath = path.join(PUBLIC_DIR, 'results', `${dateStr}.json`);
  
  let matches = [];
  
  if (forceFetch) {
    logger.info(`[FixtureService] Startup Sync: Fetching fresh data from APIs to resolve finished matches...`);
    matches = await buildUnifiedFixtures(dateStr);
  } else {
    logger.info(`[FixtureService] Cron Sync: Checking local fixtures for finished matches...`);
    try {
      const raw = await fs.readFile(fixturesPath, 'utf8'); // ★ ASYNC
      const parsed = JSON.parse(raw);
      matches = Array.isArray(parsed) ? parsed : (parsed.data || []);
    } catch (e) {
      logger.warn(`[FixtureService] No local fixtures file found for ${dateStr}.`);
      return [];
    }
  }

  const stillFixtures = [];
  const newlyFinished = [];
  const nowMs = Date.now();
  const threeAndHalfHoursMs = 3.5 * 60 * 60 * 1000;

  for (let match of matches) {
    const isFT = match.status === 'FT' || match.display?.isFinished === true;
    const wasLive = match.isLive || match.status === '1H' || match.status === '2H' || match.status === 'HT' || match.status === 'LIVE';
    
    let isExpired = false;
    if (match.timestamp) {
      const matchStartTime = match.timestamp * 1000;
      if (wasLive && (nowMs - matchStartTime) > threeAndHalfHoursMs) isExpired = true;
      else if ((nowMs - matchStartTime) > threeAndHalfHoursMs) isExpired = true; // 3.5 hours for NS matches too
    }

    if (isFT || isExpired) {
      match.status = 'FT';
      match.homeScore = match.homeScore || 0;
      match.awayScore = match.awayScore || 0;
      if (match.display) {
        match.display.isFinished = true;
        match.display.isLive = false;
        if (match.display.score) {
          match.display.score.home = match.homeScore;
          match.display.score.away = match.awayScore;
        }
      }
      newlyFinished.push(match);
    } else {
      stillFixtures.push(match);
    }
  }

  if (newlyFinished.length === 0) {
    logger.info(`[FixtureService] No newly finished matches found.`);
    return [];
  }

  // 1. Update fixtures.json (remove the finished ones)
  const scoredStill = stillFixtures.map(doc => {
    doc.matchScore = calculateMatchScore(doc);
    doc.category = categorizeMatch(doc.matchScore);
    return doc;
  }).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  await writeFootballSnapshot(dateStr, { matches: scoredStill });

  // 2. Merge with existing results.json
  let existingResults = [];
  try {
    if (fsSync.existsSync(resultsPath)) {
      const rawRes = await fs.readFile(resultsPath, 'utf8'); // ★ ASYNC
      const parsedRes = JSON.parse(rawRes);
      existingResults = Array.isArray(parsedRes) ? parsedRes : (parsedRes.data || []);
    }
  } catch (e) { /* File doesn't exist yet */ }

  const merged = [...existingResults, ...newlyFinished];
  const unique = Array.from(new Map(merged.map(m => [String(m.id || `${m.homeTeamName || m.homeTeam?.name}-${m.awayTeamName || m.awayTeam?.name}`), m])).values());
  
  logger.info(`[FixtureService] Moved ${newlyFinished.length} finished matches to results. Total results: ${unique.length}`);
  
  // 3. Publish results.json safely
  await writeFootballSnapshot(dateStr, { finished: unique });
  
  return newlyFinished; 
}

module.exports = { syncTodayFixtures, syncTomorrowFixtures, syncYesterdayResults, syncFinishedFixtures };