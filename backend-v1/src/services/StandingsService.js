// footballprediction/backend-v1/src/services/StandingsService.js
const ApiFootballAdapter = require('../providers/ApiFootballAdapter');
const FootballDataAdapter = require('../providers/FootballDataAdapter');
const QuotaManager = require('./QuotaManager');
const StaticFilePublisher = require('./StaticFilePublisher');
const logger = require('../utils/logger');

const LEAGUES_TO_SYNC = [
  { id: 39, name: 'Premier League', season: 2026 },
  { id: 140, name: 'La Liga', season: 2026 },
  { id: 135, name: 'Serie A', season: 2026 },
  { id: 78, name: 'Bundesliga', season: 2026 },
  { id: 61, name: 'Ligue 1', season: 2026 },
  { id: 2, name: 'UEFA Champions League', season: 2026 },
  { id: 3, name: 'UEFA Europa League', season: 2026 },
];

async function syncStandings() {
  logger.info(`[StandingsService] Syncing standings for ${LEAGUES_TO_SYNC.length} leagues`);
  let ok = 0, fail = 0;
  const allStandings = [];

  for (const league of LEAGUES_TO_SYNC) {
    try {
      let standings = null;

      // 1. Try FootballData first (Free, no quota cost)
      try {
        standings = await FootballDataAdapter.getStandings(league.id, league.season);
      } catch (fdErr) {
        logger.warn(`[StandingsService] FootballData failed for ${league.name}: ${fdErr.message}`);
      }

      // 2. If FootballData fails, fallback to API-Football (Max 3 calls/day)
      if (!standings && QuotaManager.canUseFallback()) {
        logger.info(`[StandingsService] Falling back to API-Football for ${league.name}.`);
        standings = await ApiFootballAdapter.getStandings(league.id, league.season);
        if (standings) QuotaManager.recordFallbackCall();
      } else if (!standings && !QuotaManager.canUseFallback()) {
        logger.warn(`[StandingsService] Skipping ${league.name} - Fallback budget exhausted (3/3 used).`);
      }

      if (standings) {
        allStandings.push(standings);
        ok++;
      } else {
        fail++;
      }
    } catch (err) {
      logger.error(`[StandingsService] Error processing ${league.name}: ${err.message}`);
      fail++;
    }
  }

  await StaticFilePublisher.publishJSON('standings.json', { data: allStandings, count: allStandings.length });
  logger.info(`[StandingsService] âœ“ Standings: ${ok} ok, ${fail} fail`);
  return { ok, fail };
}

module.exports = { syncStandings };
