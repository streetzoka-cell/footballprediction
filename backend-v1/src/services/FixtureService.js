// backend-v1/src/services/FixtureService.js
const fs = require('fs');
const path = require('path');
const ProviderManager = require('../providers/ProviderManager');
const { writeFootballSnapshot, calculateMatchScore, categorizeMatch } = require('./SnapshotService');
const { getDateOffset } = require('../config/constants');
const QuotaManager = require('./QuotaManager');
const logger = require('../utils/logger');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data');

async function syncFixturesForDate(dateStr) {
  const filePath = path.join(PUBLIC_DIR, 'fixtures', `${dateStr}.json`);
  
  // ★ FIX: If the file exists but is empty (or too small), delete it so it can be re-fetched
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size < 100) {
      logger.warn(`[FixtureService] Fixtures file for ${dateStr} is empty (${stats.size} bytes). Re-fetching...`);
      fs.unlinkSync(filePath);
    } else {
      logger.info(`[FixtureService] Fixtures for ${dateStr} already exist locally. Skipping API fetch.`);
      return 0; 
    }
  }

  logger.info(`[FixtureService] Syncing fixtures for ${dateStr}`);
  const matches = await ProviderManager.getFixtures(dateStr);
  
  // ★ FIX: Never overwrite good data with an empty API response
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
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size < 100) {
      logger.warn(`[FixtureService] Results file for ${dateStr} is empty. Re-fetching...`);
      fs.unlinkSync(filePath);
    } else {
      logger.info(`[FixtureService] Results for ${dateStr} already exist locally. Skipping API fetch.`);
      return 0;
    }
  }

  const matches = await ProviderManager.getFixtures(dateStr);
  if (!Array.isArray(matches) || matches.length === 0) return 0;
  const finished = matches.filter(m => m.display?.isFinished);
  await writeFootballSnapshot(dateStr, { matches, finished });
  return finished.length;
}

// ★ FIX: Only write to the results file, do NOT overwrite the main fixtures file if empty
async function syncFinishedFixtures() {
  if (!QuotaManager.canFetchFT()) {
    logger.warn('[FixtureService] FT sync blocked. Daily FT budget exhausted.');
    return 0;
  }

  const dateStr = getDateOffset(0);
  logger.info(`[FixtureService] Syncing finished fixtures for ${dateStr} (Budget used: ${QuotaManager.getStats().ftUsed}/12)`);
  
  const matches = await ProviderManager.getFixtures(dateStr);
  QuotaManager.recordFTCall();

  if (!Array.isArray(matches) || matches.length === 0) {
    logger.warn(`[FixtureService] No matches returned for ${dateStr}. Skipping FT sync to avoid overwriting data.`);
    return 0;
  }
  
  const finished = matches.filter(m => m.display?.isFinished);
  
  // Only publish to results file, do NOT overwrite the main fixtures file
  await writeFootballSnapshot(dateStr, { finished });
  
  // ★ FIX: Return the ARRAY of finished matches instead of just the length
  // This allows the scheduler to pass the match data to the prediction resolver
  return finished; 
}

module.exports = { syncTodayFixtures, syncTomorrowFixtures, syncYesterdayResults, syncFinishedFixtures };