// backend/services/matchScoreEngine.js
const { LEAGUE_TIERS, LEAGUE_UNIVERSE } = require('../config/footballUniverse');
const { TEAM_POPULARITY, DEFAULT_TEAM_SCORE } = require('../config/teamRanking');

const calculateMatchScore = (match) => {
  const leagueId = match.leagueId;
  const homeTeamId = match.homeTeamId;
  const awayTeamId = match.awayTeamId;
  const stage = match.round || match.leagueName || '';
  const isLive = match.isLive || false;

  // 1. League Score (35%)
  // ★ FIX: Default to TIER_3 so all professional leagues are kept
  const tier = LEAGUE_UNIVERSE[leagueId] || 'TIER_3';
  const leagueScore = LEAGUE_TIERS[tier].score;

  // 2. Team Popularity (35%)
  const homePop = TEAM_POPULARITY[homeTeamId] || DEFAULT_TEAM_SCORE;
  const awayPop = TEAM_POPULARITY[awayTeamId] || DEFAULT_TEAM_SCORE;
  const teamPopularity = Math.max(homePop, awayPop);

  // 3. Competition Stage (15%)
  let stageScore = 50;
  const stageLower = stage.toLowerCase();
  if (stageLower.includes('final')) stageScore = 100;
  else if (stageLower.includes('semi-final') || stageLower.includes('semifinal')) stageScore = 90;
  else if (stageLower.includes('quarter-final') || stageLower.includes('quarterfinal')) stageScore = 80;
  else if (stageLower.includes('play-off') || stageLower.includes('playoff')) stageScore = 70;

  // 4. Live Importance (10%)
  const liveImportance = isLive ? 100 : 50;

  // 5. User Interest (5%) - Defaults to 50, handled dynamically at API edge later
  const userInterest = 50; 

  // Weighted calculation
  const matchScore = Math.round(
    (leagueScore * 0.35) +
    (teamPopularity * 0.35) +
    (stageScore * 0.15) +
    (liveImportance * 0.10) +
    (userInterest * 0.05)
  );

  return matchScore;
};

const categorizeMatch = (score) => {
  if (score >= 90) return 'FEATURED';
  if (score >= 75) return 'IMPORTANT';
  if (score >= 30) return 'NORMAL'; 
  return 'HIDDEN';
};

module.exports = { calculateMatchScore, categorizeMatch };