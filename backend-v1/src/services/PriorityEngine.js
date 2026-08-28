// backend-v1/src/services/PriorityEngine.js
const { findLeague } = require('../config/leagues');

function calculatePriority(match) {
  if (!match) return 0;

  let score = 0;

  // League importance — one source of truth (leagues config), no duplicated arrays
  const comp = findLeague(match.leagueId);

  if (comp?.mustHave) score += 55;        // TOP 12 — always prioritized
  else if (comp?.tier === 1) score += 50;
  else if (comp?.tier === 2) score += 30;
  else if (comp) score += 15;
  else score += 10;

  // Live matches get massive priority
  if (match.display?.isLive) score += 100;

  // Matches starting soon (< 1 hour) get priority
  if (match.timestamp) {
    const diffMs = match.timestamp * 1000 - Date.now();
    if (diffMs > 0 && diffMs < 3600000) score += 20;
  }

  return score;
}

module.exports = { calculatePriority };