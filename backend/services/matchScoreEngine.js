const { LEAGUE_TIERS, LEAGUE_UNIVERSE } = require('../config/footballUniverse');
const { getTeamPopularity } = require('../config/teamRanking');

/**
 * Calculates a match score (0-100) based on league tier, team popularity, 
 * competition stage, and live status.
 */
const calculateMatchScore = (match) => {
  const leagueId = match.leagueId;
  
  // ★ FIX: look up team popularity by NAME, not by ID — Goal API team IDs
  // have no relationship to the old numeric API-Football IDs the previous
  // TEAM_POPULARITY map was keyed by.
  const homeName = match.homeTeamName || match.homeName;
  const awayName = match.awayTeamName || match.awayName;
  const stage = match.round || match.leagueName || '';
  
  // Check if match is currently live
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
  const isLive = match.isLive || liveStatuses.includes(match.status);

  // 1. League Score (35%)
  const tier = LEAGUE_UNIVERSE[leagueId] || 'TIER_3';
  const leagueScore = LEAGUE_TIERS[tier].score;

  // 2. Team Popularity (35%)
  const homePop = getTeamPopularity(homeName);
  const awayPop = getTeamPopularity(awayName);
  const teamPopularity = Math.max(homePop, awayPop);

  // 3. Competition Stage (15%)
  let stageScore = 50;
  const stageLower = (stage || '').toLowerCase();
  if (stageLower.includes('final')) stageScore = 100;
  else if (stageLower.includes('semi-final') || stageLower.includes('semifinal')) stageScore = 90;
  else if (stageLower.includes('quarter-final') || stageLower.includes('quarterfinal')) stageScore = 80;
  else if (stageLower.includes('play-off') || stageLower.includes('playoff')) stageScore = 70;

  // 4. Live Importance (10%)
  const liveImportance = isLive ? 100 : 50;

  // 5. User Interest (5%) - Defaults to 50, handled dynamically at API edge later
  const userInterest = 50;

  const matchScore = Math.round(
    (leagueScore * 0.35) +
    (teamPopularity * 0.35) +
    (stageScore * 0.15) +
    (liveImportance * 0.10) +
    (userInterest * 0.05)
  );

  return matchScore;
};

/**
 * Categorizes a match based on its calculated score.
 */
const categorizeMatch = (score) => {
  if (score >= 90) return 'FEATURED';
  if (score >= 75) return 'IMPORTANT';
  if (score >= 30) return 'NORMAL';
  return 'HIDDEN';
};

module.exports = { calculateMatchScore, categorizeMatch };