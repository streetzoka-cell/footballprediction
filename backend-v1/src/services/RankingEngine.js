const admin = require('firebase-admin');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const { publishJSON } = require('./StaticFilePublisher');
const QueueService = require('./QueueService');
const ZokaPicksStore = require('./ZokaPicksStore');
const { readJSONSafe } = require('../utils/atomicWriter');
const path = require('path');

const _resolving = new Set();

function calculatePoints(predH, predA, actualH, actualA) {
  const ph = Number(predH);
  const pa = Number(predA);
  const ah = Number(actualH);
  const aa = Number(actualA);

  if (ph === ah && pa === aa) return { points: 10, resultType: 'exact' };

  const predicted = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  const actual = ah > aa ? 'H' : ah < aa ? 'A' : 'D';

  if (predicted === actual) return { points: 3, resultType: 'result' };

  return { points: 0, resultType: 'miss' };
}

function normalizeScore(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    throw ApiError.badRequest(`${field} must be an integer between 0 and 99`);
  }
  return n;
}

async function alreadyResolved(db, matchDate, matchId) {
  const snap = await db.collection('match_resolution_status').doc(matchDate).get();
  if (!snap.exists) return false;
  const resolved = snap.data()?.resolvedMatches || [];
  return resolved.includes(String(matchId));
}

async function updateZokaPicksForMatch(date, matchId, homeScore, awayScore) {
  try {
    const published = await ZokaPicksStore.getPublished(date);

    if (!published || !Array.isArray(published.matches)) return false;

    let changed = false;
    const updatedMatches = published.matches.map(match => {
      if (String(match.matchId) === String(matchId) && match.status !== 'finished') {
        changed = true;
        return {
          ...match,
          homeScore,
          awayScore,
          status: 'finished',
          updatedAt: new Date().toISOString(),
        };
      }
      return match;
    });

    if (!changed) return false;

    const updatedPayload = {
      ...published,
      matches: updatedMatches,
      totalMatches: updatedMatches.length,
      updatedAt: new Date().toISOString(),
    };

    await publishJSON(`zokapicks/${date}.json`, {
      data: updatedMatches,
      ...updatedPayload,
    });

    await QueueService.addToQueue({
      collection: 'zoka_picks',
      docId: String(date),
      type: 'set',
      data: updatedPayload,
      priority: 'high',
      source: 'ranking-engine',
    });

    logger.info(`[RankingEngine] Updated Zoka Picks for match ${matchId}`);
    return true;
  } catch (err) {
    logger.warn(`[RankingEngine] Zoka Picks update failed: ${err.message}`);
    return false;
  }
}

async function updateLocalLeaderboard(matchDate, operations) {
  const filePath = path.join(process.cwd(), 'public_data', 'leaderboard', 'daily', `${matchDate}.json`);

  let entries = [];
  try {
    const local = await readJSONSafe(filePath, null);
    if (local && Array.isArray(local.entries)) {
      entries = local.entries;
    }
  } catch {
    // File doesn't exist yet
  }

  const userMap = new Map(entries.map(u => [u.uid, { ...u }]));

  for (const op of operations) {
    if (!userMap.has(op.uid)) {
      userMap.set(op.uid, {
        uid: op.uid,
        displayName: op.displayName || 'Player',
        photoURL: op.photoURL || null,
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

    const u = userMap.get(op.uid);

    if (op.displayName) u.displayName = op.displayName;
    if (op.photoURL) u.photoURL = op.photoURL;

    u.predictions += 1;
    u.resolved += 1;
    u.points += op.points;

    if (op.resultType === 'exact') {
      u.exact += 1;
      u.streak += 1;
      u.maxStreak = Math.max(u.maxStreak || 0, u.streak);
    } else if (op.resultType === 'result') {
      u.result += 1;
      u.streak += 1;
      u.maxStreak = Math.max(u.maxStreak || 0, u.streak);
    } else {
      u.miss += 1;
      u.streak = 0;
    }
  }

  const sorted = Array.from(userMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.exact !== a.exact) return b.exact - a.exact;
    if (b.result !== a.result) return b.result - a.result;
    return (a.miss || 0) - (b.miss || 0);
  }).map((u, i) => ({
    ...u,
    rank: i + 1,
    accuracy: u.resolved > 0 ? Math.round(((u.exact + u.result) / u.resolved) * 100) : 0,
  }));

  const result = {
    date: matchDate,
    entries: sorted,
    top3: sorted.slice(0, 3),
    rest: sorted.slice(3),
    stats: {
      avg: sorted.length > 0 ? (sorted.reduce((s, u) => s + (u.accuracy || 0), 0) / sorted.length).toFixed(1) : '0.0',
      preds: sorted.reduce((s, u) => s + (u.predictions || 0), 0),
      exact: sorted.reduce((s, u) => s + (u.exact || 0), 0),
      players: sorted.length,
    },
    count: sorted.length,
    lastUpdated: new Date().toISOString(),
  };

  await publishJSON(`leaderboard/daily/${matchDate}.json`, result);

  await QueueService.addToQueue({
    collection: 'daily_leaderboard',
    docId: matchDate,
    type: 'set',
    data: {
      entries: sorted,
      stats: result.stats,
      count: result.count,
      updatedAt: result.lastUpdated,
    },
    priority: 'normal',
    source: 'ranking-engine',
  });

  return result;
}

async function resolveMatch(input = {}) {
  const matchId = String(input.matchId || '').trim();
  const matchDate = String(input.matchDate || '').trim();

  if (!matchId) throw ApiError.badRequest('matchId is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) throw ApiError.badRequest('matchDate must be YYYY-MM-DD');

  const homeScore = normalizeScore(input.homeScore, 'homeScore');
  const awayScore = normalizeScore(input.awayScore, 'awayScore');

  const key = `${matchDate}:${matchId}`;
  if (_resolving.has(key)) {
    return { resolved: false, reason: 'in_progress', matchId, matchDate };
  }

  const db = getDb();

  if (await alreadyResolved(db, matchDate, matchId)) {
    logger.info(`[RankingEngine] Match ${matchId} already resolved.`);
    return { resolved: false, alreadyResolved: true, matchId, matchDate };
  }

  _resolving.add(key);

  try {
    const processed = new Set();
    const processedSnap = await db.collection('prediction_results')
      .where('matchId', '==', String(matchId))
      .get();

    processedSnap.forEach(doc => {
      const uid = doc.get('userId');
      if (uid) processed.add(String(uid));
    });

    const predsSnap = await db.collection('user_predictions')
      .where('matchId', '==', String(matchId))
      .get();

    const operations = [];

    predsSnap.forEach(doc => {
      const prediction = doc.data() || {};
      const uid = String(prediction.userId || '');
      if (!uid || processed.has(uid)) return;

      const predictedHome = Number(prediction.homeScore);
      const predictedAway = Number(prediction.awayScore);
      if (!Number.isInteger(predictedHome) || !Number.isInteger(predictedAway)) return;

      const result = calculatePoints(predictedHome, predictedAway, homeScore, awayScore);
      operations.push({
        uid,
        displayName: prediction.displayName || 'Player',
        photoURL: prediction.photoURL || null,
        prediction,
        points: result.points,
        resultType: result.resultType,
      });
    });

    // 1. Update local leaderboard immediately + queue backup
    await updateLocalLeaderboard(matchDate, operations);

    // 2. Queue individual results with HIGH priority (was 'low' - caused data loss)
    const now = new Date().toISOString();
    for (const op of operations) {
      await QueueService.addToQueue({
        collection: 'prediction_results',
        docId: `${op.uid}_${matchId}`,
        type: 'set',
        data: {
          userId: op.uid,
          displayName: op.displayName,
          photoURL: op.photoURL,
          matchId: String(matchId),
          matchDate: op.prediction.matchDate || matchDate,
          predictedHome: Number(op.prediction.homeScore),
          predictedAway: Number(op.prediction.awayScore),
          actualHome: homeScore,
          actualAway: awayScore,
          points: op.points,
          resultType: op.resultType,
          resolvedAt: now,
        },
        priority: 'high',
        source: 'ranking-engine',
      });
    }

    // 3. Update featured prediction status
    const predId = `feat_${matchDate}_${matchId}`;
    await QueueService.addToQueue({
      collection: 'active_predictions',
      docId: predId,
      type: 'set',
      data: {
        homeScore,
        awayScore,
        status: 'FT',
        isFinished: true,
        isResolved: true,
        'display.isFinished': true,
        'display.isLive': false,
        'display.score.home': homeScore,
        'display.score.away': awayScore,
        updatedAt: now,
      },
      priority: 'high',
      source: 'ranking-engine',
    });

    // 4. Mark match as resolved (direct write - critical for preventing reprocessing)
    await db.collection('match_resolution_status').doc(matchDate).set({
      resolvedMatches: admin.firestore.FieldValue.arrayUnion(String(matchId)),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 5. Update published Zoka Picks (reads from LOCAL JSON, not Firestore)
    await updateZokaPicksForMatch(matchDate, matchId, homeScore, awayScore);

    logger.info(`[RankingEngine] Match ${matchId} resolved. Applied ${operations.length} users. Skipped ${processed.size}.`);
    return {
      resolved: true,
      matchId,
      matchDate,
      users: operations.length,
      skipped: processed.size,
      leaderboardUpdateRequired: true,
    };
  } finally {
    _resolving.delete(key);
  }
}

module.exports = {
  resolveMatch,
  calculatePoints,
  alreadyResolved,
};