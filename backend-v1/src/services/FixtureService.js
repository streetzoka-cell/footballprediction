// backend-v1/src/services/FixtureService.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { buildUnifiedFixtures } = require('./UnifiedFixtureService');
const { writeFootballSnapshot, calculateMatchScore, categorizeMatch } = require('./SnapshotService');
const { getDateOffset } = require('../config/constants');
const logger = require('../utils/logger');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data');

// ... (Keep your existing syncFixturesForDate, syncTodayFixtures, etc.)

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

// Update the existing refresh function to use the smart master sync
async function refreshFinishedMatches() {
  await syncMasterResults(0); // Today
  await syncMasterResults(-1); // Yesterday
}

module.exports = {
  syncTodayFixtures,
  syncTomorrowFixtures,
  syncYesterdayResults,
  syncFinishedFixtures,
  syncRecentFinishedFixtures,
  syncMasterResults, // ★ Export new function
  forceRefreshFinishedMatches: refreshFinishedMatches, // Alias for compatibility
  refreshFinishedMatches
};