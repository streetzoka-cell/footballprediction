// src/engine/leaderboardEngine.js
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
 */
export function rankEntries(list) {
  if (!list || list.length === 0) return [];
  return list
    .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.exact || 0) - (a.exact || 0) || (b.result || 0) - (a.result || 0))
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
    if (p.status === 'finished' && p.homeScore != null) {
      scoreMap[String(p.matchId)] = { h: p.homeScore, a: p.awayScore };
    }
  });

  const userStats = {};
  const missingNames = []; // ★ NEW: Track uids with missing names
  
  // Process resolved results
  for (const d of resultsSnap.docs) {
    const r = d.data();
    if (!userStats[r.userId]) {
      userStats[r.userId] = { 
        uid: r.userId, 
        displayName: r.displayName || 'Player', 
        points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0,
        streak: 0 // Initialize streak
      };
    }
    
    // ★ FIX: If name is missing, mark for batch fetch
    if (!r.displayName && !missingNames.includes(r.userId)) {
      missingNames.push(r.userId);
    }
    
    const u = userStats[r.userId];
    u.predictions++;
    u.resolved++;
    u.points += r.points || 0;
    
    if (r.resultType === RESULT_TYPE.EXACT) {
      u.exact++;
      u.streak = (u.streak || 0) + 1; // Increment streak
    } else if (r.resultType === RESULT_TYPE.RESULT) {
      u.result++;
      u.streak = (u.streak || 0) + 1; // Increment streak
    } else {
      u.miss++;
      u.streak = 0; // Reset streak
    }
  }

  // Process pending predictions against live scores
  const resolvedIds = new Set(resultsSnap.docs.map((d) => String(d.data().matchId)));
  predsSnap.docs.forEach((d) => {
    const p = d.data();
    if (p.matchDate && p.matchDate !== todayStr()) return; 
    const mid = String(p.matchId);
    if (resolvedIds.has(mid)) {
      if (userStats[p.userId]) userStats[p.userId].displayName = p.displayName || userStats[p.userId].displayName;
      return;
    }
    
    if (!userStats[p.userId]) {
      userStats[p.userId] = { 
        uid: p.userId, 
        displayName: p.displayName || 'Player', 
        points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0,
        streak: 0
      };
    }
    
    if (!p.displayName && !missingNames.includes(p.userId)) {
      missingNames.push(p.userId);
    }
    
    const u = userStats[p.userId];
    u.predictions++;
    const actual = scoreMap[mid];
    if (!actual) return;
    
    u.resolved++;
    const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
    u.points += r.points;
    if (r.type === RESULT_TYPE.EXACT) {
      u.exact++;
      u.streak = (u.streak || 0) + 1;
    } else if (r.type === RESULT_TYPE.RESULT) {
      u.result++;
      u.streak = (u.streak || 0) + 1;
    } else {
      u.miss++;
      u.streak = 0;
    }
  });

  // ★ FIX: Batch fetch missing display names from users collection
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

  for (const d of snap.docs) {
    const r = d.data();
    if (!userMap[r.userId]) {
      userMap[r.userId] = { 
        uid: r.userId, 
        displayName: r.displayName || 'Player', 
        points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0,
        streak: 0
      };
    }
    
    if (!r.displayName && !missingNames.includes(r.userId)) {
      missingNames.push(r.userId);
    }
    
    const u = userMap[r.userId];
    u.predictions++;
    u.resolved++;
    u.points += r.points || 0;
    
    if (r.resultType === RESULT_TYPE.EXACT) {
      u.exact++;
      u.streak = (u.streak || 0) + 1;
    } else if (r.resultType === RESULT_TYPE.RESULT) {
      u.result++;
      u.streak = (u.streak || 0) + 1;
    } else {
      u.miss++;
      u.streak = 0;
    }
  }

  // ★ FIX: Batch fetch missing names for period leaderboards
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

// Helper to get today's string if not imported
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}