// backend-v1/src/services/LeaderboardEngine.js
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { publishJSON } = require('./StaticFilePublisher');
const { readJSONSafe } = require('../utils/atomicWriter');

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

// ★ FIX: Serve daily leaderboard strictly from local JSON
async function getDailyLeaderboard(date) {
  const filePath = path.join(PUBLIC_DIR, 'leaderboard', 'daily', `${date}.json`);
  const local = await readJSONSafe(filePath, null);

  if (local && Array.isArray(local.entries)) {
    return local;
  }

  // If file doesn't exist, return empty structure (NO FIRESTORE QUERIES)
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

// ★ FIX: Serve summary leaderboards strictly from local JSON
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

// Rebuild functions remain but are only called by admin cron jobs, not by user reads
async function rebuildDailyLeaderboard(date) {
  logger.info(`[LeaderboardEngine] Daily leaderboard rebuild triggered for ${date}`);
  return getDailyLeaderboard(date);
}

async function rebuildPeriod(period, startDate) {
  logger.info(`[LeaderboardEngine] Period leaderboard rebuild triggered for ${period}`);
  return getSummary(period);
}

module.exports = {
  getDailyLeaderboard,
  getSummary,
  rebuildDailyLeaderboard,
  rebuildPeriod,
  rankEntries,
  computeStats,
};