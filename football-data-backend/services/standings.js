const api = require('../config/api');
const cache = require('../utils/cache');
const retry = require('../utils/retry');
const logger = require('../utils/logger');
const env = require('../config/env');

const COLLECTION = 'standings';

function normaliseTableEntry(entry) {
  return {
    position: entry.position,
    team: entry.team ? {
      id: entry.team.id,
      name: entry.team.name,
      shortName: entry.team.shortName || null,
      crest: entry.team.crest || null,
    } : null,
    playedGames: entry.playedGames || 0,
    form: entry.form || null,
    won: entry.won || 0,
    draw: entry.draw || 0,
    lost: entry.lost || 0,
    points: entry.points || 0,
    goalsFor: entry.goalsFor || 0,
    goalsAgainst: entry.goalsAgainst || 0,
    goalDifference: entry.goalDifference || 0,
  };
}

async function fetchCompetition(competitionCode) {
  logger.debug(`[STANDINGS] Fetching ${competitionCode} ...`);

  const response = await retry(
    () => api.get(`/competitions/${competitionCode}/standings`),
    { label: `standings-${competitionCode}` }
  );

  const raw = response.data.standings || [];
  return raw.map(s => ({
    stage: s.stage || null,
    type: s.type || null,
    group: s.group || null,
    table: (s.table || []).map(normaliseTableEntry),
  }));
}

async function fetchAndCacheAll() {
  logger.info(`[STANDINGS] Fetching standings for ${env.competitions.length} competitions ...`);

  const results = {};

  for (let i = 0; i < env.competitions.length; i++) {
    const code = env.competitions[i];
    try {
      const standings = await fetchCompetition(code);
      results[code] = standings;

      await cache.setDocument(COLLECTION, code, {
        competitionCode: code,
        standings: standings,
        fetchedAt: new Date().toISOString(),
      });

      logger.info(`[STANDINGS] ${code} - ${standings.reduce(function(s, g) { return s + g.table.length; }, 0)} teams`);
    } catch (err) {
      logger.error(`[STANDINGS] Failed for ${code}: ${err.message}`);
      results[code] = null;
    }

    if (i < env.competitions.length - 1) {
      await new Promise(r => setTimeout(r, 6500));
    }
  }

  await cache.setLastUpdated('standings', { competitions: env.competitions.length });
  return results;
}

async function getCached(competitionCode) {
  return cache.getDocument(COLLECTION, competitionCode);
}

module.exports = { fetchAndCacheAll, getCached };
