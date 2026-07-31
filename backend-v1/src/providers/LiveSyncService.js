// backend-v1/src/services/LiveSyncService.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public_data');
const FIXTURES_DIR = path.join(PUBLIC_DATA_DIR, 'fixtures');
const RESULTS_DIR = path.join(PUBLIC_DATA_DIR, 'results');

// Helper to normalize team names for matching (remove FC, AFC, lowercase, etc.)
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/fc|afc|cf|sc|club|team/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function updateFixturesWithLive(liveMatches) {
  if (!liveMatches || liveMatches.length === 0) return;
  
  const today = new Date().toISOString().split('T')[0];
  const fixturesPath = path.join(FIXTURES_DIR, `${today}.json`);
  const resultsPath = path.join(RESULTS_DIR, `${today}.json`);

  try {
    // 1. Load today's fixtures
    let fixtures = [];
    try {
      const raw = await fs.readFile(fixturesPath, 'utf8');
      fixtures = JSON.parse(raw);
    } catch (e) {
      logger.warn(`[LiveSync] No fixtures file found for ${today}. Skipping sync.`);
      return;
    }

    let updatedCount = 0;
    let finishedCount = 0;

    // 2. Map live matches by normalized team names
    const liveMap = new Map();
    for (const match of liveMatches) {
      const home = normalizeName(match.homeTeam || match.homeName);
      const away = normalizeName(match.awayTeam || match.awayName);
      if (home && away) {
        liveMap.set(`${home}-${away}`, match);
      }
    }

    // 3. Update fixtures
    const stillFixtures = [];
    const finishedMatches = [];

    for (let fixture of fixtures) {
      const home = normalizeName(fixture.homeTeam || fixture.homeTeamName);
      const away = normalizeName(fixture.awayTeam || fixture.awayTeamName);
      const key = `${home}-${away}`;
      
      const liveMatch = liveMap.get(key);
      
      if (liveMatch) {
        updatedCount++;
        // Update scores and status
        fixture.homeScore = liveMatch.homeScore ?? fixture.homeScore;
        fixture.awayScore = liveMatch.awayScore ?? fixture.awayScore;
        fixture.status = liveMatch.status === -1 || liveMatch.status === 'FT' ? 'FT' : 'LIVE';
        fixture.minute = liveMatch.minute || null;
        fixture.isLive = fixture.status !== 'FT';
        
        if (fixture.status === 'FT') {
          finishedCount++;
          finishedMatches.push(fixture);
        } else {
          stillFixtures.push(fixture);
        }
      } else {
        // Not live, keep as is
        stillFixtures.push(fixture);
      }
    }

    // 4. Save updated fixtures (only those not finished)
    if (updatedCount > 0) {
      await fs.writeFile(fixturesPath, JSON.stringify(stillFixtures, null, 2));
      logger.info(`[LiveSync] Updated ${updatedCount} live fixtures in ${today}.json`);
    }

    // 5. Append finished matches to results
    if (finishedMatches.length > 0) {
      let existingResults = [];
      try {
        const raw = await fs.readFile(resultsPath, 'utf8');
        existingResults = JSON.parse(raw);
      } catch (e) { /* File doesn't exist yet, that's fine */ }
      
      // Merge and deduplicate by match ID or team names
      const merged = [...existingResults, ...finishedMatches];
      const unique = Array.from(new Map(merged.map(m => [m.id || `${m.homeTeam}-${m.awayTeam}`, m])).values());
      
      await fs.writeFile(resultsPath, JSON.stringify(unique, null, 2));
      logger.info(`[LiveSync] Moved ${finishedCount} finished matches to results/${today}.json`);
    }

  } catch (err) {
    logger.error(`[LiveSync] Failed to sync live matches: ${err.message}`);
  }
}

module.exports = { updateFixturesWithLive };