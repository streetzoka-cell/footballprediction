// footballprediction/backend-v1/src/services/PriorityEngine.js

// Tier 1 Leagues (IDs from API-Football)
const TIER_1 = [39, 140, 135, 78, 61, 2]; // EPL, La Liga, Serie A, Bundesliga, Ligue 1, UCL
const TIER_2 = [3, 848, 71, 252, 11]; // Europa League, Conference League, Brasil Serie A, MLS, Championship

function calculatePriority(match) {
  if (!match) return 0;
  
  let score = 0;
  const leagueId = parseInt(match.leagueId, 10);
  
  // League Importance
  if (TIER_1.includes(leagueId)) score += 50;
  else if (TIER_2.includes(leagueId)) score += 30;
  else score += 10;
  
  // Live matches get massive priority
  if (match.display?.isLive) score += 100;
  
  // Matches starting soon (< 1 hour) get priority
  if (match.timestamp) {
    const diffMs = (match.timestamp * 1000) - Date.now();
    if (diffMs > 0 && diffMs < 3600000) score += 20;
  }
  
  return score;
}

module.exports = { calculatePriority };
