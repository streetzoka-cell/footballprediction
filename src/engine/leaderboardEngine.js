export function computeStats(entries) {
  if (!entries?.length) return { avg: '0.0', preds: 0, exact: 0, players: 0 };
  const totalAcc = entries.reduce((s, u) => s + (u.accuracy || 0), 0);
  return {
    avg: (totalAcc / entries.length).toFixed(1),
    preds: entries.reduce((s, u) => s + (u.predictions || 0), 0),
    exact: entries.reduce((s, u) => s + (u.exact || 0), 0),
    players: entries.length,
  };
}

export function rankEntries(list) {
  if (!list?.length) return [];
  return [...list]
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .map((u, i) => ({
      ...u,
      rank: i + 1,
      accuracy: u.resolved > 0 ? Math.round(((u.exact + u.result) / u.resolved) * 100) : (u.accuracy || 0),
    }));
}

// Deprecated — backend now serves static JSON. Kept for back-compat, no Firestore reads.
export async function buildDailySummaryData() {
  return { entries: [], top3: [], rest: [], stats: computeStats([]), scoreMap: {} };
}
export async function buildPeriodSummaryData() {
  return { entries: [], top3: [], rest: [], stats: computeStats([]) };
}
