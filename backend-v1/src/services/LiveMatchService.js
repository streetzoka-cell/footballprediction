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

function getCleanName(rawObj) {
  try {
    if (!rawObj) return '';
    let str = '';
    if (typeof rawObj === 'string') str = rawObj;
    else if (typeof rawObj === 'object') {
      if (Array.isArray(rawObj)) str = rawObj[0]?.name || rawObj[0] || '';
      else str = rawObj.name || rawObj.shortName || rawObj.teamName || rawObj.homeName || '';
    } else str = String(rawObj);
    
    if (typeof str !== 'string') {
      if (str && typeof str === 'object') str = str.name || '';
      else str = String(str);
    }
    if (!str) return '';
    
    return str.toLowerCase()
      .replace(/fc|afc|cf|sc|club|team|reserves|ii/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  } catch (e) {
    return ''; 
  }
}

async function syncLiveMatches() {
  if (!QuotaManager.canPollLive()) {
    return { count: 0, skipped: true, liveMatches: [] };
  }

  const rawLiveMatches = await ProviderManager.getLiveFixtures();
  
  let liveMatches = [];
  if (Array.isArray(rawLiveMatches) && rawLiveMatches.length > 0) {
    try {
      if (rawLiveMatches[0].matchId) {
        liveMatches = isports.matches(rawLiveMatches);
      } else {
        liveMatches = apiFootball.matches(rawLiveMatches);
      }
    } catch (e) {
      logger.warn(`[LiveMatchService] Normaliser failed: ${e.message}`);
      liveMatches = [];
    }
  }

  const todayStr = getDateOffset(0);
  const fixturesPath = path.join(FIXTURES_DIR, `${todayStr}.json`);
  const resultsPath = path.join(RESULTS_DIR, `${todayStr}.json`);

  try {
    const rawFixtures = await fs.readFile(fixturesPath, 'utf8');
    const parsedFixtures = JSON.parse(rawFixtures);
    
    let fixtures = [];
    let fixtureWrapper = null;
    if (Array.isArray(parsedFixtures)) {
      fixtures = parsedFixtures;
    } else if (Array.isArray(parsedFixtures.data)) {
      fixtures = parsedFixtures.data;
      fixtureWrapper = parsedFixtures;
    }

    const liveByApiFootId = new Map();
    const liveByIsportsId = new Map();
    const liveByName = new Map();

    for (const match of liveMatches) {
      if (match.ids?.['api-football']) liveByApiFootId.set(String(match.ids['api-football']), match);
      if (match.ids?.isports) liveByIsportsId.set(String(match.ids.isports), match);
      
      const home = getCleanName(match.homeTeamName || match.homeTeam);
      const away = getCleanName(match.awayTeamName || match.awayTeam);
      if (home && away) liveByName.set(`${home}-${away}`, match);
    }

    const findLiveMatch = (fixture) => {
      try {
        if (fixture.ids?.['api-football'] && liveByApiFootId.has(String(fixture.ids['api-football']))) {
          return liveByApiFootId.get(String(fixture.ids['api-football']));
        }
        if (fixture.ids?.isports && liveByIsportsId.has(String(fixture.ids.isports))) {
          return liveByIsportsId.get(String(fixture.ids.isports));
        }
        if (liveByApiFootId.has(String(fixture.id))) return liveByApiFootId.get(String(fixture.id));
        if (liveByIsportsId.has(String(fixture.id))) return liveByIsportsId.get(String(fixture.id));
        
        const home = getCleanName(fixture.homeTeamName || fixture.homeTeam);
        const away = getCleanName(fixture.awayTeamName || fixture.awayTeam);
        if (home && away && liveByName.has(`${home}-${away}`)) return liveByName.get(`${home}-${away}`);
      } catch(e) {}
      return null;
    };

    let updatedCount = 0;
    const stillFixtures = [];
    const finishedMatches = [];
    const nowMs = Date.now();
    const threeAndHalfHoursMs = 3.5 * 60 * 60 * 1000;

    for (let fixture of fixtures) {
      const liveMatch = findLiveMatch(fixture);
      const matchStartTime = fixture.timestamp ? fixture.timestamp * 1000 : 0;
      const isExpired = matchStartTime > 0 && (nowMs - matchStartTime) > threeAndHalfHoursMs;
      
      // 1. If match is currently live
      if (liveMatch) {
        updatedCount++;
        fixture.homeScore = liveMatch.homeScore ?? fixture.homeScore;
        fixture.awayScore = liveMatch.awayScore ?? fixture.awayScore;
        if (fixture.display && fixture.display.score) {
          fixture.display.score.home = liveMatch.homeScore;
          fixture.display.score.away = liveMatch.awayScore;
        }
        
        // ★ FIX: Force FT if it's been live for > 3.5 hours, even if API says it's still 1H/2H
        if (isExpired) {
          fixture.status = 'FT';
          fixture.isLive = false;
          if (fixture.display) {
            fixture.display.isLive = false;
            fixture.display.isFinished = true;
          }
          finishedMatches.push(fixture);
        } else {
          fixture.status = liveMatch.status === 'FT' ? 'FT' : liveMatch.status;
          fixture.minute = liveMatch.minute || 0;
          fixture.isLive = fixture.status !== 'FT';
          
          if (fixture.status === 'FT') {
            finishedMatches.push(fixture);
          } else {
            stillFixtures.push(fixture);
          }
        }
      } 
      // 2. If match is NOT currently live
      else {
        const isAlreadyFT = fixture.status === 'FT' || fixture.display?.isFinished === true;
        const wasLive = fixture.isLive || fixture.status === '1H' || fixture.status === '2H' || fixture.status === 'HT' || fixture.status === 'LIVE';
        
        // ★ SMART TIME CHECK: If it started > 3.5 hours ago, force it to FT
        if (wasLive || isAlreadyFT || isExpired) {
          fixture.isLive = false;
          fixture.status = 'FT';
          fixture.homeScore = fixture.homeScore || 0;
          fixture.awayScore = fixture.awayScore || 0;
          if (fixture.display) {
            fixture.display.isLive = false;
            fixture.display.isFinished = true;
            if (fixture.display.score) {
              fixture.display.score.home = fixture.homeScore;
              fixture.display.score.away = fixture.awayScore;
            }
          }
          finishedMatches.push(fixture);
        } else {
          // It's an upcoming match (NS), keep it in fixtures
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
      const unique = Array.from(new Map(merged.map(m => [m.id || `${getCleanName(m.homeTeamName || m.homeTeam)}-${getCleanName(m.awayTeamName || m.awayTeam)}`, m])).values());
      
      existingResultsObj.data = unique;
      existingResultsObj.count = unique.length;
      existingResultsObj.date = todayStr;
      await fs.writeFile(resultsPath, JSON.stringify(existingResultsObj, null, 2));
    }
  } catch (e) {
    logger.warn(`[LiveSync] Merge skipped: ${e.message}`);
  }

  await writeFootballSnapshot(todayStr, { live: liveMatches });
  return { count: liveMatches.length, skipped: false, liveMatches };
}

module.exports = { syncLiveMatches };