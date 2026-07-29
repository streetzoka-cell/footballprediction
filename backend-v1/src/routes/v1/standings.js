// backend-v1/src/services/StandingsService.js
const ProviderManager = require('../providers/ProviderManager');
const standingsRepo = require('../repositories/StandingsRepository');
const { publishJSON } = require('./StaticFilePublisher');
const logger = require('../utils/logger');

// ★ FIX: Use API-Football numeric IDs. The FootballDataAdapter will translate them to string codes.
const LEAGUES_TO_SYNC = [
  { id: 39, name: 'Premier League', season: 2024 },
  { id: 140, name: 'La Liga', season: 2024 },
  { id: 135, name: 'Serie A', season: 2024 },
  { id: 78, name: 'Bundesliga', season: 2024 },
  { id: 61, name: 'Ligue 1', season: 2024 },
  { id: 2, name: 'UEFA Champions League', season: 2024 },
  { id: 3, name: 'UEFA Europa League', season: 2024 },
  { id: 88, name: 'Eredivisie', season: 2024 },
  { id: 94, name: 'Primeira Liga', season: 2024 },
  { id: 71, name: 'Serie A (Brazil)', season: 2024 },
  { id: 40, name: 'Championship', season: 2024 }
];

async function syncStandings() {
  logger.info(`[StandingsService] Syncing standings for ${LEAGUES_TO_SYNC.length} leagues`);
  let ok = 0, fail = 0;
  const allStandings = [];

  for (const league of LEAGUES_TO_SYNC) {
    try {
      const data = await ProviderManager.getStandings(league.id, league.season);
      if (data) {
        await standingsRepo.upsert(league.id, data);
        allStandings.push(data);
        ok++;
      } else {
        fail++;
      }
    } catch (err) {
      fail++;
    }
  }

  await publishJSON('standings.json', { data: allStandings, count: allStandings.length });
  logger.info(`[StandingsService] ✓ Standings: ${ok} ok, ${fail} fail`);
  return { ok, fail };
}

module.exports = { syncStandings };