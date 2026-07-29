const ProviderManager = require('../providers/ProviderManager');
const standingsRepo = require('../repositories/StandingsRepository');
const { publishJSON } = require('./StaticFilePublisher');
const logger = require('../utils/logger');

const LEAGUES_TO_SYNC = [
  // Replace these with the actual league IDs from your GOAL API dashboard
  { id: 'cmr77dvv600aprx06o7y7lnfu', name: 'Primera A', season: 2026 },
  // { id: 'other_league_id', name: 'EPL', season: 2026 },
];
async function syncStandings() {
  logger.info(`[StandingsService] Syncing standings for ${LEAGUES_TO_SYNC.length} leagues`);
  let ok = 0, fail = 0;
  const allStandings = [];

  for (const league of LEAGUES_TO_SYNC) {
    try {
      const { data } = await ProviderManager.getStandings(league.id, league.season);
    //   if (data?.league) {
    //     await standingsRepo.upsert(league.id, data.league);
    //     allStandings.push(data.league);
    //     ok++;
    //   }
    } catch (err) {
      fail++;
    }
  }

  // Publish aggregated JSON for frontend (0 reads)
  await publishJSON('standings.json', { data: allStandings, count: allStandings.length });
  logger.info(`[StandingsService] ✓ Standings: ${ok} ok, ${fail} fail`);
  return { ok, fail };
}

module.exports = { syncStandings };