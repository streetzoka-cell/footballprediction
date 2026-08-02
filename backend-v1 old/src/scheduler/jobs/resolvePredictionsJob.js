// footballprediction/backend-v1/src/scheduler/jobs/resolvePredictionsJob.js
const { getDb } = require('../../config/firebase');
const admin = require('firebase-admin');

/**
 * â˜… SCALE FIX: Resolves a match and increments points directly. 
 * NO massive reads. Handles 50,000 users instantly.
 */
async function resolveMatch(matchId, homeScore, awayScore, matchDate) {
  const db = getDb();
  const predId = `feat_${matchDate}_${matchId}`;
  const matchRef = db.collection('active_predictions').doc(predId);
  const matchSnap = await matchRef.get();

  if (!matchSnap.exists) return false;
  if (matchSnap.data().isResolved) return false;

  console.log(`[ResolveJob] Resolving featured match ${matchId}...`);
  const batch = db.batch();
  
  batch.update(matchRef, { 
    isFinished: true, 
    isResolved: true, 
    homeScore, 
    awayScore, 
    status: 'FT' 
  });

  const predSnap = await db.collection('user_predictions')
    .where('matchId', '==', String(matchId))
    .get();

  if (predSnap.empty) {
    await batch.commit();
    return true;
  }

  for (const predDoc of predSnap.docs) {
    const pred = predDoc.data();
    let points = 0;
    let resultType = 'miss';

    if (pred.homeScore === homeScore && pred.awayScore === awayScore) {
      points = 10; resultType = 'exact';
    } else if (
      (pred.homeScore > pred.awayScore && homeScore > awayScore) ||
      (pred.homeScore < pred.awayScore && homeScore < awayScore) ||
      (pred.homeScore === pred.awayScore && homeScore === awayScore)
    ) {
      points = 3; resultType = 'result';
    }

    // 1. Save to prediction_results (History)
    const resultRef = db.collection('prediction_results').doc();
    batch.set(resultRef, {
      ...pred,
      actualHome: homeScore,
      actualAway: awayScore,
      points,
      resultType,
      resolvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Increment User Total Points
    const userPointRef = db.collection('user_points_total').doc(pred.userId);
    batch.set(userPointRef, {
      uid: pred.userId,
      displayName: pred.displayName, 
      totalPoints: admin.firestore.FieldValue.increment(points),
      exactCount: admin.firestore.FieldValue.increment(resultType === 'exact' ? 1 : 0),
      resultCount: admin.firestore.FieldValue.increment(resultType === 'result' ? 1 : 0),
      predictionsCount: admin.firestore.FieldValue.increment(1)
    }, { merge: true });

    // â˜… NEW: 3. Increment Daily Leaderboard Points directly! (0 reads needed)
    const dailyLbRef = db.collection('daily_leaderboard').doc(matchDate)
                          .collection('users').doc(pred.userId);
    batch.set(dailyLbRef, {
      uid: pred.userId,
      displayName: pred.displayName || 'Player',
      points: admin.firestore.FieldValue.increment(points),
      exact: admin.firestore.FieldValue.increment(resultType === 'exact' ? 1 : 0),
      result: admin.firestore.FieldValue.increment(resultType === 'result' ? 1 : 0),
      predictions: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
  }

  await batch.commit();
  console.log(`[ResolveJob] Incremented points for ${predSnap.size} users.`);
  return true;
}

// We no longer need rebuildDailyLeaderboard because points are incremented live!
// But we keep a stub for backwards compatibility if called.
async function rebuildDailyLeaderboard(dateStr) {
  console.log(`[ResolveJob] Leaderboard is built incrementally. No rebuild needed for ${dateStr}.`);
}

async function resolveMatchAndBuildLeaderboard(matchId, homeScore, awayScore, matchDate) {
  return resolveMatch(matchId, homeScore, awayScore, matchDate);
}

module.exports = { resolveMatch, rebuildDailyLeaderboard, resolveMatchAndBuildLeaderboard };
