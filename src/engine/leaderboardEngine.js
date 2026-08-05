// src/engine/leaderboardEngine.js

/**
 * NOTE: Leaderboards are now calculated entirely on the backend 
 * and published as static JSON files. The frontend no longer needs 
 * to build summaries from Firestore snapshots.
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

export function rankEntries(list) {
  if (!list || list.length === 0) return [];
  return list.sort((a, b) => b.points - a.points).map((u, i) => ({
    ...u,
    rank: i + 1,
    accuracy: u.resolved > 0 ? Math.round(((u.exact + u.result) / u.resolved) * 100) : 0,
  }));
}

// Stubbed out to prevent Firestore reads. 
// Use footballApi.getDailyLeaderboard(date) instead.
export async function buildDailySummaryData() {
  console.warn('[LeaderboardEngine] buildDailySummaryData is deprecated. Use backend API.');
  return { entries: [], top3: [], rest: [], stats: computeStats([]), scoreMap: {} };
}

export async function buildPeriodSummaryData() {
  console.warn('[LeaderboardEngine] buildPeriodSummaryData is deprecated. Use backend API.');
  return { entries: [], top3: [], rest: [], stats: computeStats([]) };
}