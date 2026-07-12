const api = require('../config/api');
const cache = require('../utils/cache');
const retry = require('../utils/retry');
const logger = require('../utils/logger');

const COLLECTION = 'competitions';

async function fetchAndCache() {
  logger.info('[COMPETITIONS] Fetching from Football-Data.org ...');

  const response = await retry(
    () => api.get('/competitions'),
    { label: 'competitions' }
  );

  const raw = response.data.competitions || [];
  const docs = raw.map(c => ({
    id: String(c.id),
    data: {
      name: c.name || null,
      code: c.code || null,
      emblem: c.emblem || null,
      area: c.area ? {
        id: c.area.id || null,
        name: c.area.name || null,
        code: c.area.code || null,
        flag: c.area.flag || null,
      } : null,
      currentSeason: c.currentSeason ? {
        id: c.currentSeason.id || null,
        startDate: c.currentSeason.startDate || null,
        endDate: c.currentSeason.endDate || null,
      } : null,
      numberOfAvailableSeasons: c.numberOfAvailableSeasons || 0,
      lastUpdated: c.lastUpdated || null,
    },
  }));

  await cache.replaceCollection(COLLECTION, docs);
  await cache.setLastUpdated('competitions', { count: docs.length });

  logger.info('[COMPETITIONS] Cached ' + docs.length + ' competitions');
  return docs;
}

async function getCached() {
  const rows = await cache.getCollection(COLLECTION);
  return rows.map(r => r.data);
}

module.exports = { fetchAndCache, getCached };
