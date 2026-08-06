const path = require('path');
const logger = require('../utils/logger');
const { getDb } = require('../config/firebase');
const { publishJSON } = require('./StaticFilePublisher');
const { readJSONSafe, writeJSONAtomic } = require('../utils/atomicWriter');
const QueueService = require('./QueueService');
const { getDateOffset } = require('../config/constants');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data');

function computeStats(entries) {
  if (!entries || entries.length === 0) {
    return { avg: '0.0', preds: 0, exact: 0, players: 0 };
  }
  return {
    avg: (entries.reduce((sum, u) => sum + (u.accuracy || 0), 0) / entries.length).toFixed(1),
    preds: entries.reduce((sum, u) => sum + (u.predictions || 0), 0),
    exact: entries.reduce((sum, u) => sum + (u.exact || 0), 0),
    players: entries.length,
  };
}

function rankEntries(list) {
  if (!list || list.length === 0) return [];
  return list
    .slice()
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exact !== a.exact) return b.exact - a.exact;
      if (b.result !== a.result) return b.result - a.result;
      return (a.miss || 0) - (b.miss || 0);
    })
    .map((u, i) => ({
      ...u,
      rank: i + 1,
      accuracy: u.resolved > 0 ? Math.round(((u.exact + u.result) / u.resolved) * 100) : 0,
    }));
}

function aggregateUserStats(snapshot) {
  const userMap = new Map();

  snapshot.forEach(doc => {
    const data = doc.data();
    const uid = String(data.userId || '');

    if (!uid) return;

    if (!userMap.has(uid)) {
      userMap.set(uid, {
        uid,
        displayName: data.displayName || 'Player',
        photoURL: data.photoURL || null,
        points: 0,
        predictions: 0,
        exact: 0,
        result: 0,
        miss: 0,
        resolved: 0,
        streak: 0,
        maxStreak: 0,
      });
    }

    const user = userMap.get(uid);
    const points = Number(data.points || 0);
    const resultType = String(data.resultType || 'miss');

    user.predictions += 1;
    user.resolved += 1;
    user.points += points;

    if (resultType === 'exact') {
      user.exact += 1;
      user.streak += 1;
      user.maxStreak = Math.max(user.maxStreak, user.streak);
    } else if (resultType === 'result') {
      user.result += 1;
      user.streak += 1;
      user.maxStreak = Math.max(user.maxStreak, user.streak);
    } else {
      user.miss += 1;
      user.streak = 0;
    }
  });

  return Array.from(userMap.values());
}

async function getDailyLeaderboard(date) {
  const filePath = path.join(PUBLIC_DIR, 'leaderboard', 'daily', `${date}.json`);
  const local = await readJSONSafe(filePath, null);

  if (local && Array.isArray(local.entries)) {
    return local;
  }

  return {
    date,
    entries: [],
    top3: [],
    rest: [],
    stats: computeStats([]),
    count: 0,
    lastUpdated: null,
  };
}

async function getSummary(period) {
  if (!['weekly', 'monthly', 'goat'].includes(period)) {
    throw new Error('Invalid leaderboard period');
  }

  const fileName = period === 'goat' ? 'goat.json' : period === 'weekly' ? 'weekly.json' : 'monthly.json';
  const filePath = path.join(PUBLIC_DIR, 'leaderboard', fileName);

  const local = await readJSONSafe(filePath, null);

  if (local && Array.isArray(local.entries)) {
    return local;
  }

  return {
    period,
    entries: [],
    top3: [],
    rest: [],
    stats: computeStats([]),
    lastUpdated: null,
  };
}

async function rebuildDailyLeaderboard(date) {
  const targetDate = String(date || getDateOffset(0)).trim();
  logger.info(`[LeaderboardEngine] Rebuilding daily leaderboard for ${targetDate}`);

  try {
    const db = getDb();

    const snapshot = await db.collection('prediction_results')
      .where('matchDate', '==', targetDate)
      .get();

    const rawEntries = aggregateUserStats(snapshot);
    const entries = rankEntries(rawEntries);

    const result = {
      date: targetDate,
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      count: entries.length,
      lastUpdated: new Date().toISOString(),
    };

    await publishJSON(`leaderboard/daily/${targetDate}.json`, result);

    await QueueService.addToQueue({
      collection: 'daily_leaderboard',
      docId: targetDate,
      type: 'set',
      data: {
        entries,
        stats: result.stats,
        count: result.count,
        updatedAt: result.lastUpdated,
      },
      priority: 'normal',
      source: 'leaderboard-engine',
    });

    logger.info(`[LeaderboardEngine] Daily leaderboard rebuilt: ${entries.length} entries`);
    return result;
  } catch (err) {
    logger.error(`[LeaderboardEngine] Daily rebuild failed: ${err.message}`);

    const existing = await getDailyLeaderboard(targetDate);
    return existing;
  }
}

async function rebuildPeriod(period, startDate) {
  if (!['weekly', 'monthly', 'goat'].includes(period)) {
    throw new Error('Invalid leaderboard period');
  }

  logger.info(`[LeaderboardEngine] Rebuilding ${period} leaderboard`);

  try {
    const db = getDb();

    let snapshot;
    let dateRange = null;

    if (period === 'goat') {
      snapshot = await db.collection('prediction_results').get();
    } else {
      const endDate = String(startDate || getDateOffset(0)).trim();
      const days = period === 'weekly' ? 7 : 30;
      const start = new Date(endDate);
      start.setDate(start.getDate() - days);
      const startDateStr = start.toISOString().split('T')[0];

      dateRange = { start: startDateStr, end: endDate };

      snapshot = await db.collection('prediction_results')
        .where('matchDate', '>=', startDateStr)
        .where('matchDate', '<=', endDate)
        .get();
    }

    const rawEntries = aggregateUserStats(snapshot);
    const entries = rankEntries(rawEntries);

    const result = {
      period,
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      count: entries.length,
      dateRange,
      lastUpdated: new Date().toISOString(),
    };

    const fileName = period === 'goat' ? 'goat.json' : period === 'weekly' ? 'weekly.json' : 'monthly.json';
    await publishJSON(`leaderboard/${fileName}`, result);

    await QueueService.addToQueue({
      collection: 'leaderboard_summaries',
      docId: period,
      type: 'set',
      data: {
        entries,
        stats: result.stats,
        count: result.count,
        dateRange,
        updatedAt: result.lastUpdated,
      },
      priority: 'low',
      source: 'leaderboard-engine',
    });

    logger.info(`[LeaderboardEngine] ${period} leaderboard rebuilt: ${entries.length} entries`);
    return result;
  } catch (err) {
    logger.error(`[LeaderboardEngine] ${period} rebuild failed: ${err.message}`);
    const existing = await getSummary(period);
    return existing;
  }
}

module.exports = {
  getDailyLeaderboard,
  getSummary,
  rebuildDailyLeaderboard,
  rebuildPeriod,
  rankEntries,
  computeStats,
};