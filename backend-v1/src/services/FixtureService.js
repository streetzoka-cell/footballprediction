// backend-v1/src/services/FixtureService.js
const ProviderManager = require('../providers/ProviderManager');
const { writeFootballSnapshot, calculateMatchScore, categorizeMatch } = require('./SnapshotService');
const { getDateOffset } = require('../config/constants');
const logger = require('../utils/logger');

async function syncFixturesForDate(dateStr) {
  logger.info(`[FixtureService] Syncing fixtures for ${dateStr}`);
  const matches = await ProviderManager.getFixtures(dateStr);
  
  if (!Array.isArray(matches)) {
    logger.error(`[FixtureService] No matches array returned for ${dateStr}`);
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
  logger.info(`[FixtureService] Syncing results for ${dateStr}`);
  const matches = await ProviderManager.getFixtures(dateStr);
  
  if (!Array.isArray(matches)) return 0;
  const finished = matches.filter(m => m.display?.isFinished);
  await writeFootballSnapshot(dateStr, { matches, finished });
  return finished.length;
}

module.exports = { syncTodayFixtures, syncTomorrowFixtures, syncYesterdayResults };