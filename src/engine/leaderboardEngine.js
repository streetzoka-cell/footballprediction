import { calcPoints, RESULT_TYPE } from '../utils/constants';
import { db } from '../utils/firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Computes aggregate statistics for a list of ranked entries.
 */
export function computeStats(entries) {
  if (!entries || entries.length === 0) return { avg: '0.0', preds: 0, exact: 0, players: 0 };
  return {
    avg: (entries.reduce((s, u) => s + (u.accuracy || 0), 0) / entries.length).toFixed(1),
    preds: entries.reduce((s, u) => s + (u.predictions || 0), 0),
    exact: entries.reduce((s, u) => s + (u.exact || 0), 0),
    players: entries.length,
  };
}

/**
 * Sorts and ranks a list of user statistics objects.
 * Professional Ranking Rules:
 * 1. Highest Points
 * 2. Highest Exact Scores (tie-breaker)
 * 3. Highest Result Scores (tie-breaker)
 * 4. Fewest Misses (final tie-breaker)
 */
export function rankEntries(list) {
  if (!list || list.length === 0) return [];
  
  return list
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exact !== a.exact) return b.exact - a.exact;
      if (b.result !== a.result) return b.result - a.result;
      return a.miss - b.miss; 
    })
    .map((u, i) => ({
      ...u,
      rank: i + 1,
      accuracy: u.resolved > 0 ? Math.round(((u.exact + u.result) / u.resolved) * 100) : 0,
    }));
}

/**
 * Processes raw prediction and result documents to build a daily leaderboard summary.
 */
export async function buildDailySummaryData(resultsSnap, predsSnap, activeSnap) {
  const scoreMap = {};
  activeSnap.docs.forEach((d) => {
    const p = d.data();
    if ((p.status === 'finished' || p.isFinished) && p.homeScore != null) {
      scoreMap[String(p.matchId)] = { h: p.homeScore, a: p.awayScore };
    }
  });

  const userStats = {};
  const missingNames = [];
  const resolvedIds = new Set(resultsSnap.docs.map((d) => String(d.data().matchId)));

  // 1. Process already resolved results from backend
  for (const d of resultsSnap.docs) {
    const r = d.data();
    const uid = r.userId;
    if (!userStats[uid]) {
      userStats[uid] = { uid, displayName: r.displayName || 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0, streak: 0 };
    }
    if (!r.displayName && !missingNames.includes(uid)) missingNames.push(uid);
    
    const u = userStats[uid];
    u.predictions++;
    u.resolved++;
    u.points += r.points || 0;
    
    if (r.resultType === RESULT_TYPE.EXACT) u.exact++;
    else if (r.resultType === RESULT_TYPE.RESULT) u.result++;
    else u.miss++;
  }

  // 2. Process pending predictions that have now finished (live scores updated)
  const pendingFinishedPreds = [];
  for (const d of predsSnap.docs) {
    const p = d.data();
    const mid = String(p.matchId);
    
    if (resolvedIds.has(mid)) {
      if (userStats[p.userId]) userStats[p.userId].displayName = p.displayName || userStats[p.userId].displayName;
      continue;
    }
    
    const actual = scoreMap[mid];
    if (!actual) continue; // Match not finished yet
    
    pendingFinishedPreds.push({ ...p, actualH: actual.h, actualA: actual.a });
  }

  // ★ CRITICAL FIX: Sort chronologically to ensure streaks are calculated accurately
  pendingFinishedPreds.sort((a, b) => {
    const dateA = a.matchDate || '';
    const dateB = b.matchDate || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.kickoff || '').localeCompare(b.kickoff || '');
  });

  for (const p of pendingFinishedPreds) {
    const uid = p.userId;
    if (!userStats[uid]) {
      userStats[uid] = { uid, displayName: p.displayName || 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0, streak: 0 };
    }
    if (!p.displayName && !missingNames.includes(uid)) missingNames.push(uid);
    
    const u = userStats[uid];
    u.predictions++;
    u.resolved++;
    
    const r = calcPoints(p.homeScore, p.awayScore, p.actualH, p.actualA);
    u.points += r.points || 0;
    
    if (r.type === RESULT_TYPE.EXACT) {
      u.exact++;
      u.streak++;
    } else if (r.type === RESULT_TYPE.RESULT) {
      u.result++;
      u.streak++;
    } else {
      u.miss++;
      u.streak = 0; // Reset streak on miss
    }
  }

  // 3. Batch fetch missing display names from users collection
  for (const uid of missingNames) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists() && userDoc.data().displayName) {
        if (userStats[uid]) userStats[uid].displayName = userDoc.data().displayName;
      }
    } catch (e) {
      console.error('Failed to fetch user name for LB:', uid);
    }
  }

  const entries = rankEntries(Object.values(userStats).filter((u) => u.predictions > 0));
  return { entries, top3: entries.slice(0, 3), rest: entries.slice(3), stats: computeStats(entries), scoreMap };
}

/**
 * Builds GOAT or period-based leaderboard summaries.
 */
export async function buildPeriodSummaryData(snap, period, startDate) {
  const userMap = {};
  const missingNames = [];
  const allPreds = [];

  for (const d of snap.docs) {
    const r = d.data();
    allPreds.push(r);
    const uid = r.userId;
    if (!userMap[uid]) {
      userMap[uid] = { uid, displayName: r.displayName || 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0, streak: 0 };
    }
    if (!r.displayName && !missingNames.includes(uid)) missingNames.push(uid);
  }

  // ★ CRITICAL FIX: Sort chronologically for accurate period streak calculation
  allPreds.sort((a, b) => {
    const dateA = a.matchDate || '';
    const dateB = b.matchDate || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.kickoff || '').localeCompare(b.kickoff || '');
  });

  for (const r of allPreds) {
    const uid = r.userId;
    const u = userMap[uid];
    u.predictions++;
    u.resolved++;
    u.points += r.points || 0;
    
    if (r.resultType === RESULT_TYPE.EXACT) {
      u.exact++;
      u.streak++;
    } else if (r.resultType === RESULT_TYPE.RESULT) {
      u.result++;
      u.streak++;
    } else {
      u.miss++;
      u.streak = 0;
    }
  }

  // Batch fetch missing names
  for (const uid of missingNames) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists() && userDoc.data().displayName) {
        if (userMap[uid]) userMap[uid].displayName = userDoc.data().displayName;
      }
    } catch (e) {
      console.error('Failed to fetch user name for Period LB:', uid);
    }
  }

  const entries = rankEntries(Object.values(userMap).filter((u) => u.predictions > 0));
  return { entries, top3: entries.slice(0, 3), rest: entries.slice(3), stats: computeStats(entries), period, startDate };
}