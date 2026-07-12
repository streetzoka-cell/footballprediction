const api = require('../config/api');
const cache = require('../utils/cache');
const retry = require('../utils/retry');
const logger = require('../utils/logger');
const env = require('../config/env');

const COLLECTION = 'teams';

function normaliseTeam(t) {
  return {
    id: t.id,
    name: t.name,
    shortName: t.shortName || null,
    tla: t.tla || null,
    crest: t.crest || null,
    founded: t.founded || null,
    venue: t.venue || null,
  };
}

async function fetchCompetition(competitionCode) {
  logger.debug(`[TEAMS] Fetching ${competitionCode} ...`);

  const response = await retry(
    () => api.get(`/competitions/${competitionCode}/teams`),
    { label: `teams-${competitionCode}` }
  );

  return (response.data.teams || []).map(normaliseTeam);
}

async function fetchAndCacheAll() {
  logger.info(`[TEAMS] Fetching teams for ${env.competitions.length} competitions ...`);

  const results = {};

  for (let i = 0; i < env.competitions.length; i++) {
    const code = env.competitions[i];
    try {
      const teams = await fetchCompetition(code);
      results[code] = teams;

      await cache.setDocument(COLLECTION, code, {
        competitionCode: code,
        teams: teams,
        fetchedAt: new Date().toISOString(),
      });

      logger.info(`[TEAMS] ${code} - ${teams.length} teams`);
    } catch (err) {
      logger.error(`[TEAMS] Failed for ${code}: ${err.message}`);
      results[code] = null;
    }

    if (i < env.competitions.length - 1) {
      await new Promise(r => setTimeout(r, 6500));
    }
  }

  await cache.setLastUpdated('teams', { competitions: env.competitions.length });
  return results;
}

async function getCached(competitionCode) {
  return cache.getDocument(COLLECTION, competitionCode);
}

module.exports = { fetchAndCacheAll, getCached };
