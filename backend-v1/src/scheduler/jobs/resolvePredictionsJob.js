// backend-v1/src/scheduler/jobs/resolvePredictionsJob.js
const { getDb } = require('../../config/firebase');
const admin = require('firebase-admin'); // Needed for FieldValue

/**
 * Resolves predictions for a finished match and rebuilds the daily leaderboard.
 */
async function resolveMatchAndBuildLeaderboard(matchId, homeScore, awayScore, matchDate) {
  const db = getDb();
  console.log(`[ResolveJob] Checking match ${matchId} (${homeScore}-${awayScore})`);

  const predId = `feat_${matchDate}_${matchId}`;
  const matchRef = db.collection('active_predictions').doc(predId);
  const matchSnap = await matchRef.get();

  // 1. Check if match exists in our featured predictions
  if (!matchSnap.exists) {
    return; // Not a featured match, skip
  }

  // 2. SAFETY CHECK: Prevent double resolution
  if (matchSnap.data().isResolved) {
    return; // Already resolved, skip
  }

  console.log(`[ResolveJob] Starting resolution for featured match ${matchId}...`);
  const batch = db.batch();
  
  // Mark as resolved IMMEDIATELY to prevent race conditions
  batch.update(matchRef, { 
    isFinished: true, 
    isResolved: true, 
    homeScore, 
    awayScore, 
    status: 'FT' 
  });

  // 3. Fetch all user predictions for this match
  const predSnap = await db.collection('user_predictions')
    .where('matchId', '==', String(matchId))
    .get();

  if (predSnap.empty) {
    console.log(`[ResolveJob] No predictions found for match ${matchId}.`);
    await batch.commit();
    return;
  }

  // 4. Calculate points and prepare updates
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

    // 5. Save to prediction_results (History)
    const resultRef = db.collection('prediction_results').doc();
    batch.set(resultRef, {
      ...pred,
      actualHome: homeScore,
      actualAway: awayScore,
      points,
      resultType,
      resolvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 6. Update user_points_total
    const userPointRef = db.collection('user_points_total').doc(pred.userId);
    const userPointSnap = await userPointRef.get();
    
    if (userPointSnap.exists) {
      batch.update(userPointRef, {
        totalPoints: admin.firestore.FieldValue.increment(points),
        exactCount: admin.firestore.FieldValue.increment(resultType === 'exact' ? 1 : 0),
        resultCount: admin.firestore.FieldValue.increment(resultType === 'result' ? 1 : 0),
        predictionsCount: admin.firestore.FieldValue.increment(1)
      });
    } else {
      batch.set(userPointRef, {
        uid: pred.userId,
        displayName: pred.displayName, 
        totalPoints: points,
        exactCount: resultType === 'exact' ? 1 : 0,
        resultCount: resultType === 'result' ? 1 : 0,
        predictionsCount: 1
      });
    }
  }

  await batch.commit();
  console.log(`[ResolveJob] Resolved ${predSnap.size} predictions for match ${matchId}.`);

  // 7. REBUILD LEADERBOARD
  await rebuildDailyLeaderboard(matchDate);
}

// Helper function to rebuild the daily leaderboard
async function rebuildDailyLeaderboard(dateStr) {
  const db = getDb();
  console.log(`[ResolveJob] Rebuilding daily leaderboard for ${dateStr}...`);
  const resultsSnap = await db.collection('prediction_results').where('matchDate', '==', dateStr).get();
  const userMap = {};

  resultsSnap.docs.forEach(doc => {
    const r = doc.data();
    if (!userMap[r.userId]) {
      userMap[r.userId] = { 
        uid: r.userId, 
        displayName: r.displayName || 'Player', 
        points: 0, predictions: 0, exact: 0, result: 0 
      };
    }
    const u = userMap[r.userId];
    u.predictions++;
    u.points += r.points || 0;
    if (r.resultType === 'exact') u.exact++;
    else if (r.resultType === 'result') u.result++;
  });

  // If names are missing, fetch them directly from users collection
  for (const uid of Object.keys(userMap)) {
    if (userMap[uid].displayName === 'Player') {
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        userMap[uid].displayName = userDoc.data().displayName || 'Player';
      }
    }
  }

  // Sort and rank
  const entries = Object.values(userMap).sort((a, b) => b.points - a.points || b.exact - a.exact).map((u, i) => ({
    ...u,
    rank: i + 1,
    accuracy: u.predictions > 0 ? Math.round(((u.exact + u.result) / u.predictions) * 100) : 0
  }));

  // 8. Overwrite the leaderboard document in Firestore
  await db.collection('leaderboard_summaries').doc(`daily_${dateStr}`).set({
    entries: entries,
    stats: {
      players: entries.length,
      preds: entries.reduce((s, u) => s + u.predictions, 0),
      exact: entries.reduce((s, u) => s + u.exact, 0),
      avg: (entries.reduce((s, u) => s + u.accuracy, 0) / (entries.length || 1)).toFixed(1)
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`[ResolveJob] Daily leaderboard rebuilt with ${entries.length} players.`);
}

module.exports = { resolveMatchAndBuildLeaderboard, rebuildDailyLeaderboard };