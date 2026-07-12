const cache = require('../utils/cache');
const logger = require('../utils/logger');

const COLLECTION = 'liveMatches';

async function cacheLiveMatches(matches) {
  await cache.replaceCollection(COLLECTION, matches.map(m => ({ id: m.id, data: m })));
  await cache.setLastUpdated('liveMatches', { count: matches.length });
  logger.info('[LIVE] Cached ' + matches.length + ' live matches');
}

async function getCached() {
  const rows = await cache.getCollection(COLLECTION);
  return rows.map(r => r.data);
}

module.exports = { cacheLiveMatches, getCached };
