const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const ENTITIES_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history', 'entities');

const slugify = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

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

/**
 * Aggregates all intelligence for a specific match
 * @param {string} homeTeam - Home team name (e.g., "Arsenal")
 * @param {string} awayTeam - Away team name (e.g., "Chelsea")
 */
async function getMatchIntelligence(homeTeam, awayTeam) {
  const homeSlug = slugify(homeTeam);
  const awaySlug = slugify(awayTeam);
  
  const homeIntel = loadJson(path.join(ENTITIES_DIR, 'team_intelligence', `${homeSlug}.json`));
  const awayIntel = loadJson(path.join(ENTITIES_DIR, 'team_intelligence', `${awaySlug}.json`));
  
  const h2hTeams = [homeSlug, awaySlug].sort();
  const h2hIntel = loadJson(path.join(ENTITIES_DIR, 'h2h', `${h2hTeams[0]}_${h2hTeams[1]}.json`));
  
  const homeElo = loadJson(path.join(ENTITIES_DIR, 'team_elo', `${homeSlug}.json`));
  const awayElo = loadJson(path.join(ENTITIES_DIR, 'team_elo', `${awaySlug}.json`));

  return {
    home: {
      team: homeTeam,
      elo: homeElo?.current_elo || null,
      form: homeIntel?.recent_form?.slice(-5) || [],
      stats: homeIntel?.overall || {},
      goalPatterns: homeIntel?.goal_patterns || {},
      resilience: homeIntel?.resilience || {}
    },
    away: {
      team: awayTeam,
      elo: awayElo?.current_elo || null,
      form: awayIntel?.recent_form?.slice(-5) || [],
      stats: awayIntel?.overall || {},
      goalPatterns: awayIntel?.goal_patterns || {},
      resilience: awayIntel?.resilience || {}
    },
    h2h: h2hIntel || null
  };
}

module.exports = { getMatchIntelligence };