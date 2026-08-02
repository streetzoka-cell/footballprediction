// backend-v1/src/services/LeaderboardEngine.js

const path = require('path');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const { publishJSON } = require('./StaticFilePublisher');
const { readJSONSafe } = require('../utils/atomicWriter');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data');

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function getWeekStart() {
  const d = new Date();

  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );

  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;

  date.setUTCDate(date.getUTCDate() + diff);

  return date.toISOString().split('T')[0];
}

function getMonthStart() {
  const d = new Date();

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');

  return `${year}-${month}-01`;
}

function computeStats(entries) {
  if (!entries || entries.length === 0) {
    return {
      avg: '0.0',
      preds: 0,
      exact: 0,
      players: 0,
    };
  }

  return {
    avg: (
      entries.reduce((sum, u) => sum + (u.accuracy || 0), 0) / entries.length
    ).toFixed(1),
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
      accuracy:
        u.resolved > 0
          ? Math.round(((u.exact + u.result) / u.resolved) * 100)
          : u.predictions > 0
          ? Math.round(((u.exact + u.result) / u.predictions) * 100)
          : 0,
    }));
}

async function buildDailyEntries(date) {
  const db = getDb();

  const colRef = db
    .collection('daily_leaderboard')
    .doc(String(date))
    .collection('users');

  const q = colRef.orderBy('points', 'desc').limit(100);

  const snap = await q.get();

  return snap.docs.map((d, i) => {
    const data = d.data() || {};

    return {
      ...data,
      uid: d.id,
      rank: i + 1,
      accuracy:
        data.predictions > 0
          ? Math.round(((data.exact + data.result) / data.predictions) * 100)
          : 0,
    };
  });
}

async function publishDailyLeaderboardSnapshot(date) {
  const entries = await buildDailyEntries(date);

  const payload = {
    date,
    entries,
    top3: entries.slice(0, 3),
    rest: entries.slice(3),
    stats: computeStats(entries),
    count: entries.length,
    lastUpdated: new Date().toISOString(),
  };

  await publishJSON(`leaderboard/daily/${date}.json`, payload);

  return payload;
}

async function getDailyLeaderboard(date) {
  const local = await readJSONSafe(
    path.join(PUBLIC_DIR, 'leaderboard', 'daily', `${date}.json`),
    null
  );

  if (local && Array.isArray(local.entries) && local.entries.length > 0) {
    return local;
  }

  return publishDailyLeaderboardSnapshot(date);
}

async function rebuildDailyLeaderboard(date) {
  return publishDailyLeaderboardSnapshot(date);
}

function summaryDocId(period, startDate) {
  if (period === 'goat') return 'current';
  if (period === 'weekly') return `weekly_${startDate || getWeekStart()}`;
  if (period === 'monthly') return `monthly_${startDate || getMonthStart()}`;

  throw ApiError.badRequest('Invalid leaderboard period');
}

function summaryFileName(period) {
  if (period === 'goat') return 'goat.json';
  if (period === 'weekly') return 'weekly.json';
  if (period === 'monthly') return 'monthly.json';

  throw ApiError.badRequest('Invalid leaderboard period');
}

async function getSummary(period) {
  if (!['weekly', 'monthly', 'goat'].includes(period)) {
    throw ApiError.badRequest('Invalid leaderboard period');
  }

  const local = await readJSONSafe(
    path.join(PUBLIC_DIR, 'leaderboard', summaryFileName(period)),
    null
  );

  if (local && Array.isArray(local.entries) && local.entries.length > 0) {
    return local;
  }

  const db = getDb();
  const docId = summaryDocId(period);

  const snap = await db.collection('leaderboard_summaries').doc(docId).get();

  if (snap.exists) {
    const data = snap.data() || {};

    const payload = {
      ...data,
      period,
      lastUpdated: data.updatedAt || null,
    };

    await publishJSON(`leaderboard/${summaryFileName(period)}`, payload);

    return payload;
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

async function rebuildGoat() {
  const db = getDb();

  const snap = await db
    .collection('user_points_total')
    .orderBy('totalPoints', 'desc')
    .limit(100)
    .get();

  const entries = rankEntries(
    snap.docs.map((d) => {
      const u = d.data() || {};

      return {
        uid: d.id,
        displayName: u.displayName || 'Player',
        points: u.totalPoints || 0,
        predictions: u.predictionsCount || 0,
        exact: u.exactCount || 0,
        result: u.resultCount || 0,
        miss: u.missCount || 0,
        resolved: u.predictionsCount || 0,
        streak: u.streak || 0,
      };
    })
  );

  const payload = {
    period: 'goat',
    startDate: null,
    entries,
    top3: entries.slice(0, 3),
    rest: entries.slice(3),
    stats: computeStats(entries),
    lastUpdated: new Date().toISOString(),
  };

  await publishJSON('leaderboard/goat.json', payload);

  await db.collection('leaderboard_summaries').doc('current').set(payload, {
    merge: true,
  });

  return payload;
}

async function rebuildPeriodFromResults(period, startDate) {
  if (!['weekly', 'monthly'].includes(period)) {
    throw ApiError.badRequest('Invalid leaderboard period');
  }

  const start =
    startDate || (period === 'weekly' ? getWeekStart() : getMonthStart());

  const end = todayStr();

  const db = getDb();

  const userMap = {};

  let lastDoc = null;
  let totalDocs = 0;

  while (true) {
    let q = db
      .collection('prediction_results')
      .where('matchDate', '>=', start)
      .where('matchDate', '<=', end)
      .orderBy('matchDate')
      .limit(1000);

    if (lastDoc) {
      q = q.startAfter(lastDoc);
    }

    const snap = await q.get();

    if (snap.empty) break;

    snap.forEach((d) => {
      const r = d.data() || {};

      const uid = String(r.userId || '');

      if (!uid) return;

      if (!userMap[uid]) {
        userMap[uid] = {
          uid,
          displayName: r.displayName || 'Player',
          points: 0,
          predictions: 0,
          exact: 0,
          result: 0,
          miss: 0,
          resolved: 0,
          streak: 0,
        };
      }

      const u = userMap[uid];

      u.predictions += 1;
      u.resolved += 1;
      u.points += Number(r.points || 0);

      if (r.resultType === 'exact') {
        u.exact += 1;
        u.streak += 1;
      } else if (r.resultType === 'result') {
        u.result += 1;
        u.streak += 1;
      } else {
        u.miss += 1;
        u.streak = 0;
      }
    });

    totalDocs += snap.size;
    lastDoc = snap.docs[snap.docs.length - 1];

    if (snap.size < 1000) break;
  }

  const all = rankEntries(
    Object.values(userMap).filter((u) => u.predictions > 0)
  );

  const entries = all.slice(0, 100);

  const payload = {
    period,
    startDate: start,
    endDate: end,
    entries,
    top3: entries.slice(0, 3),
    rest: entries.slice(3),
    stats: computeStats(all),
    totalDocs,
    lastUpdated: new Date().toISOString(),
  };

  await publishJSON(`leaderboard/${summaryFileName(period)}`, payload);

  const docId = summaryDocId(period, start);

  await db.collection('leaderboard_summaries').doc(docId).set(payload, {
    merge: true,
  });

  return payload;
}

async function rebuildPeriod(period, startDate) {
  if (period === 'goat') {
    return rebuildGoat();
  }

  if (period === 'weekly' || period === 'monthly') {
    return rebuildPeriodFromResults(period, startDate);
  }

  throw ApiError.badRequest('Invalid leaderboard period');
}

module.exports = {
  getDailyLeaderboard,
  publishDailyLeaderboardSnapshot,
  rebuildDailyLeaderboard,
  getSummary,
  rebuildPeriod,
  rebuildGoat,
  rankEntries,
  computeStats,
};