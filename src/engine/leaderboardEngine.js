// src/engine/leaderboardEngine.js
import { calcPoints, RESULT_TYPE } from '../utils/constants';

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
export function buildDailySummaryData(resultsSnap, predsSnap, activeSnap) {
  const scoreMap = {};
  activeSnap.docs.forEach((d) => {
    const p = d.data();
    if (p.status === 'finished' && p.homeScore != null) {
      scoreMap[String(p.matchId)] = { h: p.homeScore, a: p.awayScore };
    }
  });

  const userStats = {};
  
  // Process resolved results
  resultsSnap.docs.forEach((d) => {
    const r = d.data();
    if (!userStats[r.userId]) {
      userStats[r.userId] = { uid: r.userId, displayName: r.displayName || 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
    }
    const u = userStats[r.userId];
    u.predictions++;
    u.resolved++;
    u.points += r.points || 0;
    
    if (r.resultType === RESULT_TYPE.EXACT) u.exact++;
    else if (r.resultType === RESULT_TYPE.RESULT) u.result++;
    else u.miss++;
  });

  // Process pending predictions against live scores
  const resolvedIds = new Set(resultsSnap.docs.map((d) => String(d.data().matchId)));
  predsSnap.docs.forEach((d) => {
    const p = d.data();
    if (p.matchDate && p.matchDate !== todayStr()) return; // Ensure we only process today's docs if miscategorized
    const mid = String(p.matchId);
    if (resolvedIds.has(mid)) {
      if (userStats[p.userId]) userStats[p.userId].displayName = p.displayName || 'Player';
      return;
    }
    
    if (!userStats[p.userId]) {
      userStats[p.userId] = { uid: p.userId, displayName: p.displayName || 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
    }
    
    const u = userStats[p.userId];
    u.predictions++;
    const actual = scoreMap[mid];
    if (!actual) return;
    
    u.resolved++;
    const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
    u.points += r.points;
    if (r.type === RESULT_TYPE.EXACT) u.exact++;
    else if (r.type === RESULT_TYPE.RESULT) u.result++;
    else u.miss++;
  });

  const entries = rankEntries(Object.values(userStats).filter((u) => u.predictions > 0));
  return { entries, top3: entries.slice(0, 3), rest: entries.slice(3), stats: computeStats(entries), scoreMap };
}

/**
 * Builds GOAT or period-based leaderboard summaries.
 */
export function buildPeriodSummaryData(snap, period, startDate) {
  const userMap = {};
  snap.docs.forEach((d) => {
    const r = d.data();
    if (!userMap[r.userId]) {
      userMap[r.userId] = { uid: r.userId, displayName: r.displayName || 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
    }
    const u = userMap[r.userId];
    u.predictions++;
    u.resolved++;
    u.points += r.points || 0;
    
    if (r.resultType === RESULT_TYPE.EXACT) u.exact++;
    else if (r.resultType === RESULT_TYPE.RESULT) u.result++;
    else u.miss++;
  });

  const entries = rankEntries(Object.values(userMap).filter((u) => u.predictions > 0));
  return { entries, top3: entries.slice(0, 3), rest: entries.slice(3), stats: computeStats(entries), period, startDate };
}