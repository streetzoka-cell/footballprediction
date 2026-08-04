const { getDb } = require('../config/firebase');
const { publishJSON } = require('./StaticFilePublisher');
const logger = require('../utils/logger');

async function buildGlobalStats() {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    // 1. Count total registered users
    const usersSnap = await db.collection('users').count().get();
    const totalUsers = usersSnap.data().count;

    // 2. Count total players who have ever scored points
    const pointsSnap = await db.collection('user_points_total').count().get();
    const totalPlayers = pointsSnap.data().count;

    // 3. Count predictions made today
    const todayPredsSnap = await db.collection('user_predictions').where('matchDate', '==', today).count().get();
    const predictionsToday = todayPredsSnap.data().count;

    // 4. Count total predictions all-time
    const totalPredsSnap = await db.collection('prediction_results').count().get();
    const totalPredictions = totalPredsSnap.data().count;

    const payload = {
      totalUsers,
      totalPlayers,
      predictionsToday,
      activePlayersToday: predictionsToday, 
      totalPredictions,
      lastUpdated: new Date().toISOString()
    };

    await publishJSON('stats/global.json', payload);
    logger.info(`[StatsEngine] Global stats updated: ${JSON.stringify(payload)}`);
    return payload;
  } catch (err) {
    logger.error(`[StatsEngine] Failed to build stats: ${err.message}`);
    throw err;
  }
}

module.exports = { buildGlobalStats };