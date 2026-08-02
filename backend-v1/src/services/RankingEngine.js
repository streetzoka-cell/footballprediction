// backend-v1/src/services/RankingEngine.js

const admin = require('firebase-admin');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const { WRITE_TIMEOUT_MS } = require('../config/constants');
const LeaderboardEngine = require('./LeaderboardEngine');
const { publishJSON } = require('./StaticFilePublisher');

const OPS_PER_BATCH = 100;

const _resolving = new Set();

function calculatePoints(predH, predA, actualH, actualA) {
  const ph = Number(predH);
  const pa = Number(predA);
  const ah = Number(actualH);
  const aa = Number(actualA);

  if (ph === ah && pa === aa) {
    return {
      points: 10,
      resultType: 'exact',
    };
  }

  const predResult = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  const actualResult = ah > aa ? 'H' : ah < aa ? 'A' : 'D';

  if (predResult === actualResult) {
    return {
      points: 3,
      resultType: 'result',
    };
  }

  return {
    points: 0,
    resultType: 'miss',
  };
}

function normalizeScore(value, field) {
  const n = Number(value);

  if (!Number.isInteger(n) || n < 0 || n > 99) {
    throw ApiError.badRequest(`${field} must be an integer between 0 and 99`);
  }

  return n;
}

async function updateZokaPicksForMatch(date, matchId, homeScore, awayScore) {
  try {
    const db = getDb();

    const snap = await db.collection('zoka_picks').doc(String(date)).get();

    if (!snap.exists) return false;

    const data = snap.data() || {};
    const matches = Array.isArray(data.matches) ? data.matches : [];

    let changed = false;

    const updated = matches.map((m) => {
      if (String(m.matchId) === String(matchId) && m.status !== 'finished') {
        changed = true;

        return {
          ...m,
          homeScore,
          awayScore,
          status: 'finished',
          updatedAt: new Date().toISOString(),
        };
      }

      return m;
    });

    if (!changed) return false;

    const publishedAt =
      data.publishedAt && typeof data.publishedAt.toDate === 'function'
        ? data.publishedAt.toDate().toISOString()
        : data.publishedAt || null;

    const payload = {
      date,
      matches: updated,
      totalMatches: updated.length,
      isDraft: false,
      publishedAt,
      updatedAt: new Date().toISOString(),
    };

    await db.collection('zoka_picks').doc(String(date)).set(payload, {
      merge: true,
    });

    await publishJSON(`zokapicks/${date}.json`, {
      data: updated,
      ...payload,
    });

    logger.info(
      `[RankingEngine] Updated Zoka Picks for match ${matchId} on ${date}.`
    );

    return true;
  } catch (err) {
    logger.warn(
      `[RankingEngine] Failed to update Zoka Picks for ${matchId}: ${err.message}`
    );

    return false;
  }
}

/**
 * Resolves a featured match for all affected users.
 *
 * Safety features:
 * - in-memory lock
 * - duplicate resolution protection
 * - idempotent prediction_results check
 * - chunked batch writes
 * - daily leaderboard snapshot publish
 */
async function resolveMatch(input = {}) {
  const matchId = String(input.matchId || '').trim();
  const matchDate = String(input.matchDate || '').trim();

  if (!matchId) {
    throw ApiError.badRequest('matchId is required');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) {
    throw ApiError.badRequest('matchDate must be YYYY-MM-DD');
  }

  const homeScore = normalizeScore(input.homeScore, 'homeScore');
  const awayScore = normalizeScore(input.awayScore, 'awayScore');

  const key = `${matchDate}:${matchId}`;

  if (_resolving.has(key)) {
    return {
      resolved: false,
      reason: 'in_progress',
      matchId,
      matchDate,
    };
  }

  const db = getDb();

  const predId = `feat_${matchDate}_${matchId}`;
  const matchRef = db.collection('active_predictions').doc(predId);

  const matchSnap = await matchRef.get();

  if (!matchSnap.exists) {
    return {
      resolved: false,
      reason: 'featured_match_not_found',
      matchId,
      matchDate,
    };
  }

  const matchData = matchSnap.data() || {};

  if (matchData.isResolved === true) {
    await LeaderboardEngine.publishDailyLeaderboardSnapshot(matchDate).catch(
      () => {}
    );

    return {
      resolved: false,
      reason: 'already_resolved',
      matchId,
      matchDate,
    };
  }

  // Compatibility check with frontend resolver
  const statusRef = db.collection('match_resolution_status').doc(matchDate);
  const statusSnap = await statusRef.get();

  const resolvedMatches = statusSnap.exists
    ? statusSnap.data().resolvedMatches || []
    : [];

  if (resolvedMatches.map(String).includes(String(matchId))) {
    await matchRef.set(
      {
        homeScore,
        awayScore,
        status: 'FT',
        isFinished: true,
        isResolved: true,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await LeaderboardEngine.publishDailyLeaderboardSnapshot(matchDate).catch(
      () => {}
    );

    return {
      resolved: false,
      reason: 'already_resolved_status',
      matchId,
      matchDate,
    };
  }

  _resolving.add(key);

  try {
    // 1. Find already processed users to make reruns idempotent
    const processed = new Set();

    const processedSnap = await db
      .collection('prediction_results')
      .where('matchId', '==', String(matchId))
      .select('userId')
      .get();

    processedSnap.forEach((d) => {
      const uid = d.get('userId');
      if (uid) processed.add(String(uid));
    });

    // 2. Read only predictions for this match
    const predsSnap = await db
      .collection('user_predictions')
      .where('matchId', '==', String(matchId))
      .get();

    const ops = [];

    predsSnap.forEach((d) => {
      const p = d.data() || {};

      const uid = String(p.userId || '');

      if (!uid || processed.has(uid)) return;

      const ph = Number(p.homeScore);
      const pa = Number(p.awayScore);

      if (!Number.isInteger(ph) || !Number.isInteger(pa)) return;

      const r = calculatePoints(ph, pa, homeScore, awayScore);

      ops.push({
        p,
        uid,
        points: r.points,
        resultType: r.resultType,
      });
    });

    // 3. Chunked batch writes
    let applied = 0;

    for (let i = 0; i < ops.length; i += OPS_PER_BATCH) {
      const chunk = ops.slice(i, i + OPS_PER_BATCH);
      const batch = db.batch();

      for (const op of chunk) {
        const resultRef = db
          .collection('prediction_results')
          .doc(`${op.uid}_${matchId}`);

        batch.set(
          resultRef,
          {
            userId: op.uid,
            displayName: op.p.displayName || 'Player',
            matchId: String(matchId),
            predId: `${op.uid}_${matchId}`,
            matchDate: op.p.matchDate || matchDate,
            homeTeam: op.p.homeTeam || 'Home',
            awayTeam: op.p.awayTeam || 'Away',
            homeLogo: op.p.homeLogo || null,
            awayLogo: op.p.awayLogo || null,
            league: op.p.league || '',
            kickoff: op.p.kickoff || null,
            predictedHome: Number(op.p.homeScore),
            predictedAway: Number(op.p.awayScore),
            actualHome: homeScore,
            actualAway: awayScore,
            points: op.points,
            resultType: op.resultType,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        const userPointRef = db.collection('user_points_total').doc(op.uid);

        batch.set(
          userPointRef,
          {
            uid: op.uid,
            displayName: op.p.displayName || 'Player',
            totalPoints: admin.firestore.FieldValue.increment(op.points),
            exactCount: admin.firestore.FieldValue.increment(
              op.resultType === 'exact' ? 1 : 0
            ),
            resultCount: admin.firestore.FieldValue.increment(
              op.resultType === 'result' ? 1 : 0
            ),
            missCount: admin.firestore.FieldValue.increment(
              op.resultType === 'miss' ? 1 : 0
            ),
            predictionsCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        const dailyRef = db
          .collection('daily_leaderboard')
          .doc(matchDate)
          .collection('users')
          .doc(op.uid);

        batch.set(
          dailyRef,
          {
            uid: op.uid,
            displayName: op.p.displayName || 'Player',
            points: admin.firestore.FieldValue.increment(op.points),
            exact: admin.firestore.FieldValue.increment(
              op.resultType === 'exact' ? 1 : 0
            ),
            result: admin.firestore.FieldValue.increment(
              op.resultType === 'result' ? 1 : 0
            ),
            miss: admin.firestore.FieldValue.increment(
              op.resultType === 'miss' ? 1 : 0
            ),
            predictions: admin.firestore.FieldValue.increment(1),
          },
          { merge: true }
        );
      }

      await Promise.race([
        batch.commit(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Ranking batch timeout')),
            WRITE_TIMEOUT_MS
          )
        ),
      ]);

      applied += chunk.length;
    }

    // 4. Mark featured match resolved
    await matchRef.set(
      {
        homeScore,
        awayScore,
        status: 'FT',
        isFinished: true,
        isResolved: true,
        'display.isFinished': true,
        'display.isLive': false,
        'display.score.home': homeScore,
        'display.score.away': awayScore,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 5. Mark resolution status for compatibility
    await statusRef.set(
      {
        resolvedMatches: admin.firestore.FieldValue.arrayUnion(String(matchId)),
        lastResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        date: matchDate,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 6. Update Zoka Picks if this match is published there
    await updateZokaPicksForMatch(matchDate, matchId, homeScore, awayScore);

    // 7. Publish daily leaderboard snapshot
    await LeaderboardEngine.publishDailyLeaderboardSnapshot(matchDate).catch(
      (err) => {
        logger.warn(
          `[RankingEngine] Daily leaderboard publish failed for ${matchDate}: ${err.message}`
        );
      }
    );

    logger.info(
      `[RankingEngine] Resolved match ${matchId} for ${matchDate}. Applied: ${applied}. Skipped: ${processed.size}.`
    );

    return {
      resolved: true,
      matchId,
      matchDate,
      users: applied,
      skipped: processed.size,
    };
  } finally {
    _resolving.delete(key);
  }
}

module.exports = {
  resolveMatch,
  calculatePoints,
};