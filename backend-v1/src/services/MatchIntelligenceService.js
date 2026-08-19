const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');
const INDEX_DIR = path.join(PUBLIC_DIR, 'indexes');
const ENTITIES_DIR = path.join(PUBLIC_DIR, 'history', 'entities');
const INTERNAL_MAP_FILE = path.join(process.cwd(), 'data', 'zokascore_football_data', 'canonical_sources', 'internal_team_map.json');

// Load indexes into memory once for instant lookups
let teamsIndex = {};
let providerMap = {};
let nameToIdMap = new Map();
let currentElo = {};
let h2hSummaries = {};

try {
  teamsIndex = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, 'teams-index.json'), 'utf8'));
  Object.entries(teamsIndex).forEach(([zkId, profile]) => {
    if (profile && profile.name) {
      const slug = String(profile.name).toLowerCase().replace(/[^a-z0-9]+/g, '_');
      nameToIdMap.set(slug, zkId);
    }
  });
} catch (e) { logger.warn('[MatchIntel] teams-index.json not found'); }

try {
  const mapData = JSON.parse(fs.readFileSync(INTERNAL_MAP_FILE, 'utf8'));
  providerMap = mapData.by_provider_club_id || {};
} catch (e) { /* Ignore if missing */ }

try {
  const eloData = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, 'elo_current.json'), 'utf8'));
  currentElo = eloData.elos || {};
} catch (e) { logger.warn('[MatchIntel] elo_current.json not found. Run Step 16.'); }

try {
  h2hSummaries = JSON.parse(fs.readFileSync(path.join(ENTITIES_DIR, 'h2h', 'summaries.json'), 'utf8'));
} catch (e) { logger.warn('[MatchIntel] H2H summaries.json not found.'); }

function resolveTeamId(input) {
  const val = String(input || '').trim();
  if (!val) return null;
  if (val.startsWith('ZK_TEAM_')) return val;
  if (providerMap[val]) return providerMap[val];
  const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (nameToIdMap.has(slug)) return nameToIdMap.get(slug);
  return null;
}

function getTeamData(zkId) {
  if (!zkId) return { elo: 1500, form: [] };
  
  const filePath = path.join(ENTITIES_DIR, 'team_intelligence', `${zkId}.json`);
  let stats = { recent_form: [] };
  
  try {
    if (fs.existsSync(filePath)) {
      stats = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) { /* Ignore */ }

  return {
    elo: currentElo[zkId] || 1500,
    form: stats.recent_form || []
  };
}

async function getMatchIntelligence(homeTeam, awayTeam) {
  const homeId = resolveTeamId(homeTeam);
  const awayId = resolveTeamId(awayTeam);

  if (!homeId || !awayId) {
    return null; // Frontend will handle null gracefully
  }

  const teams = [homeId, awayId].sort();
  const h2hKey = `${teams[0]}_vs_${teams[1]}`;
  
  const h2h = h2hSummaries[h2hKey] || { matches: 0, team_a_wins: 0, team_b_wins: 0, draws: 0 };

  return {
    home: getTeamData(homeId),
    away: getTeamData(awayId),
    h2h: {
      meetings: h2h.matches,
      teamA_wins: h2h.team_a_wins,
      teamB_wins: h2h.team_b_wins,
      draws: h2h.draws
    }
  };
}

module.exports = { getMatchIntelligence };