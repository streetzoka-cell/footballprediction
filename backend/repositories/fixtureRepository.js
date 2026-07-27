const { batchWrite, deleteByIds, getDb } = require('../config/firebase');
const { validateMatch } = require('../domain/schemas');
const { COLLECTIONS } = require('../config/constants');
const logger = require('../utils/logger');

class FixtureRepository {
  async getLiveFixtures() {
    const db = getDb();
    const snapshot = await db.collection(COLLECTIONS.LIVE_FIXTURES).get();
    return snapshot.docs.map(doc => validateMatch(doc.data())).filter(Boolean);
  }

  async writeLiveFixtures(matches) {
    const validMatches = matches.map(validateMatch).filter(Boolean);
    if (validMatches.length === 0) return 0;
    
    const written = await batchWrite(COLLECTIONS.LIVE_FIXTURES, validMatches);
    logger.info(`[FixtureRepo] Wrote ${written} live fixtures.`);
    return written;
  }

  async deleteLiveFixtures(ids) {
    if (!ids || ids.length === 0) return 0;
    const deleted = await deleteByIds(COLLECTIONS.LIVE_FIXTURES, ids);
    logger.info(`[FixtureRepo] Deleted ${deleted} stale live fixtures.`);
    return deleted;
  }
}

module.exports = new FixtureRepository();