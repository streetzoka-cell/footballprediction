// backend-v1/src/services/LiveMatchService.js
const ProviderManager = require('../providers/ProviderManager');
const { writeFootballSnapshot } = require('./SnapshotService');
const { getDateOffset } = require('../config/constants');
const QuotaManager = require('./QuotaManager');
const { isports, apiFootball } = require('../normalisers');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public_data');
const FIXTURES_DIR = path.join(PUBLIC_DATA_DIR, 'fixtures');
const RESULTS_DIR = path.join(PUBLIC_DATA_DIR, 'results');

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/fc|afc|cf|sc|club|team/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function syncLiveMatches() {
  if (!QuotaManager.canPollLive()) {
    logger.info('[LiveMatchService] Skipped polling due to quota limits.');
    return { count: 0, skipped: true, liveMatches: [] };
  }

  logger.info(`[LiveMatchService] Polling live matches...`);
  const rawLiveMatches = await ProviderManager.getLiveFixtures();
  
  if (!Array.isArray(rawLiveMatches) || rawLiveMatches.length === 0) {
    const todayStr = getDateOffset(0);
    await writeFootballSnapshot(todayStr, { live: [] });
    return { count: 0, skipped: true, liveMatches: [] };
  }

  let liveMatches = [];
  if (rawLiveMatches[0].matchId) {
    liveMatches = isports.matches(rawLiveMatches);
  } else {
    liveMatches = apiFootball.matches(rawLiveMatches);
  }

  const todayStr = getDateOffset(0);
  const fixturesPath = path.join(FIXTURES_DIR, `${todayStr}.json`);
  const resultsPath = path.join(RESULTS_DIR, `${todayStr}.json`);

  try {
    const rawFixtures = await fs.readFile(fixturesPath, 'utf8');
    const parsedFixtures = JSON.parse(rawFixtures);
    
    // ★ BULLETPROOF EXTRACTION
    let fixtures = [];
    let fixtureWrapper = null;
    
    if (Array.isArray(parsedFixtures)) {
      fixtures = parsedFixtures;
    } else if (Array.isArray(parsedFixtures.data)) {
      fixtures = parsedFixtures.data;
      fixtureWrapper = parsedFixtures;
    } else if (Array.isArray(parsedFixtures.matches)) {
      fixtures = parsedFixtures.matches;
      fixtureWrapper = parsedFixtures;
    }

    const liveMap = new Map();
    for (const match of liveMatches) {
      // Use nested or flat name for safety
      const home = normalizeName(match.homeTeamName || match.homeTeam?.name);
      const away = normalizeName(match.awayTeamName || match.awayTeam?.name);
      if (home && away) liveMap.set(`${home}-${away}`, match);
    }

    let updatedCount = 0;
    const stillFixtures = [];
    const finishedMatches = [];

    for (let fixture of fixtures) {
      const home = normalizeName(fixture.homeTeamName || fixture.homeTeam?.name);
      const away = normalizeName(fixture.awayTeamName || fixture.awayTeam?.name);
      const key = `${home}-${away}`;
      
      const liveMatch = liveMap.get(key);
      
      if (liveMatch) {
        updatedCount++;
        // Update flat and nested scores
        fixture.homeScore = liveMatch.homeScore;
        fixture.awayScore = liveMatch.awayScore;
        if (fixture.display && fixture.display.score) {
          fixture.display.score.home = liveMatch.homeScore;
          fixture.display.score.away = liveMatch.awayScore;
        }
        fixture.status = liveMatch.status === 'FT' ? 'FT' : liveMatch.status;
        fixture.minute = liveMatch.minute || 0;
        fixture.isLive = fixture.status !== 'FT';
        
        if (fixture.status === 'FT') {
          finishedMatches.push(fixture);
        } else {
          stillFixtures.push(fixture);
        }
      } else {
        if (fixture.isLive) {
          fixture.isLive = false;
          fixture.status = 'FT';
          finishedMatches.push(fixture);
        } else {
          stillFixtures.push(fixture);
        }
      }
    }

    if (updatedCount > 0 || finishedMatches.length > 0) {
      if (fixtureWrapper) {
        fixtureWrapper.data = stillFixtures;
        fixtureWrapper.count = stillFixtures.length;
        await fs.writeFile(fixturesPath, JSON.stringify(fixtureWrapper, null, 2));
      } else {
        await fs.writeFile(fixturesPath, JSON.stringify(stillFixtures, null, 2));
      }
      logger.info(`[LiveSync] Updated ${updatedCount} live fixtures. Moved ${finishedMatches.length} to results.`);
    }

    if (finishedMatches.length > 0) {
      let existingResultsObj = { data: [] };
      try {
        const rawRes = await fs.readFile(resultsPath, 'utf8');
        const parsedRes = JSON.parse(rawRes);
        existingResultsObj = Array.isArray(parsedRes) ? { data: parsedRes } : parsedRes;
      } catch (e) { /* File doesn't exist yet */ }
      
      const merged = [...(existingResultsObj.data || []), ...finishedMatches];
      const unique = Array.from(new Map(merged.map(m => [m.id || `${m.homeTeamName || m.homeTeam?.name}-${m.awayTeamName || m.awayTeam?.name}`, m])).values());
      
      existingResultsObj.data = unique;
      existingResultsObj.count = unique.length;
      existingResultsObj.date = todayStr;
      await fs.writeFile(resultsPath, JSON.stringify(existingResultsObj, null, 2));
    }
  } catch (e) {
    logger.warn(`[LiveSync] Merge failed: ${e.message}`);
  }

  await writeFootballSnapshot(todayStr, { live: liveMatches });
  return { count: liveMatches.length, skipped: false, liveMatches };
}

module.exports = { syncLiveMatches };