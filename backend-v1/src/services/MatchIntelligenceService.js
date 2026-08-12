const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { getCanonicalSlug } = require('./TeamMatcherService');

const ENTITIES_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history', 'entities');

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    logger.warn(`[MatchIntel] Failed to read ${filePath}: ${e.message}`);
  }
  return null;
}

function generateZokaPick(home, away, h2h) {
  const homeElo = home?.elo || 1500;
  const awayElo = away?.elo || 1500;
  const eloDiff = homeElo - awayElo;
  
  const homeOver25 = home?.goalPatterns?.overall?.over_2_5_pct || 0;
  const awayOver25 = away?.goalPatterns?.overall?.over_2_5_pct || 0;
  const avgOver25 = (homeOver25 + awayOver25) / 2;
  
  const homeBtts = home?.goalPatterns?.overall?.btts_pct || 0;
  const awayBtts = away?.goalPatterns?.overall?.btts_pct || 0;
  const avgBtts = (homeBtts + awayBtts) / 2;

  if (eloDiff > 100 && avgOver25 > 60) return { market: 'HOME WIN & OVER 2.5', confidence: 'HIGH', rating: 85 };
  if (eloDiff < -100 && avgOver25 > 60) return { market: 'AWAY WIN & OVER 2.5', confidence: 'HIGH', rating: 85 };
  if (avgOver25 > 65) return { market: 'OVER 2.5 GOALS', confidence: 'MEDIUM', rating: 75 };
  if (avgBtts > 60) return { market: 'BOTH TEAMS TO SCORE', confidence: 'MEDIUM', rating: 70 };
  if (Math.abs(eloDiff) > 150) return { market: eloDiff > 0 ? 'HOME WIN' : 'AWAY WIN', confidence: 'MEDIUM', rating: 65 };
  return { market: 'DRAW OR UNDER 2.5', confidence: 'LOW', rating: 50 };
}

async function getMatchIntelligence(homeTeam, awayTeam) {
  // Use the TeamMatcher to get the correct canonical slug
  const homeSlug = getCanonicalSlug(homeTeam);
  const awaySlug = getCanonicalSlug(awayTeam);
  
  // Read from the original folders to maintain frontend compatibility
  const homeIntel = loadJson(path.join(ENTITIES_DIR, 'team_intelligence', `${homeSlug}.json`));
  const awayIntel = loadJson(path.join(ENTITIES_DIR, 'team_intelligence', `${awaySlug}.json`));
  
  const h2hTeams = [homeSlug, awaySlug].sort();
  const h2hIntel = loadJson(path.join(ENTITIES_DIR, 'h2h', `${h2hTeams[0]}_${h2hTeams[1]}.json`));
  
  const homeElo = loadJson(path.join(ENTITIES_DIR, 'team_elo', `${homeSlug}.json`));
  const awayElo = loadJson(path.join(ENTITIES_DIR, 'team_elo', `${awaySlug}.json`));

  const homeData = {
    team: homeTeam,
    elo: homeElo?.current_elo || null,
    form: homeIntel?.recent_form?.slice(-5) || [],
    stats: homeIntel?.overall || {},
    goalPatterns: homeIntel?.goal_patterns || {},
    resilience: homeIntel?.resilience || {}
  };
  
  const awayData = {
    team: awayTeam,
    elo: awayElo?.current_elo || null,
    form: awayIntel?.recent_form?.slice(-5) || [],
    stats: awayIntel?.overall || {},
    goalPatterns: awayIntel?.goal_patterns || {},
    resilience: awayIntel?.resilience || {}
  };

  const zokaPick = generateZokaPick(homeData, awayData, h2hIntel);

  return {
    home: homeData,
    away: awayData,
    h2h: h2hIntel || null,
    zokaPick
  };
}

module.exports = { getMatchIntelligence };