const cache = require('../utils/cache');
const logger = require('../utils/logger');

const COLLECTION = 'finishedFixtures';

async function cacheFromToday(matches) {
  await cache.replaceCollection(COLLECTION, matches.map(m => ({ id: m.id, data: m })));
  await cache.setLastUpdated('finishedFixtures', { count: matches.length, source: 'today' });
  logger.info('[FINISHED] Cached ' + matches.length + ' finished matches (from today)');
}

async function getCached() {
  const rows = await cache.getCollection(COLLECTION);
  return rows.map(r => r.data);
}

module.exports = { cacheFromToday, getCached };
