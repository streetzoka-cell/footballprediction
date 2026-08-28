// backend-v1/src/services/MatchIntelligenceService.js
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const logger = require('../utils/logger');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');
const INDEX_DIR = path.join(PUBLIC_DIR, 'indexes');
const ENTITIES_DIR = path.join(PUBLIC_DIR, 'history', 'entities');
const INTERNAL_MAP_FILE = path.join(
  process.cwd(), 'data', 'zokascore_football_data', 'canonical_sources', 'internal_team_map.json'
);

let teamsIndex = {};
let providerMap = {};
let currentElo = {};
let h2hSummaries = {};
const nameToIdMap = new Map();
const unresolvedOnce = new Set();

function norm(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

try {
  teamsIndex = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, 'teams-index.json'), 'utf8'));
  Object.entries(teamsIndex).forEach(([zkId, profile]) => {
    if (profile?.name) nameToIdMap.set(norm(profile.name), zkId);
  });
} catch { logger.warn('[MatchIntel] teams-index.json not found'); }

try {
  const mapData = JSON.parse(fs.readFileSync(INTERNAL_MAP_FILE, 'utf8'));
  providerMap = mapData.by_provider_id || mapData.by_provider_club_id || {};
} catch { logger.warn('[MatchIntel] internal_team_map.json not found'); }

try {
  const eloData = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, 'elo_current.json'), 'utf8'));
  currentElo = eloData.elos || eloData || {};
} catch { logger.warn('[MatchIntel] elo_current.json not found'); }

try {
  h2hSummaries = JSON.parse(fs.readFileSync(path.join(ENTITIES_DIR, 'h2h', 'summaries.json'), 'utf8'));
} catch { logger.warn('[MatchIntel] h2h summaries.json not found'); }

/* Each entity file read ONCE, then served from memory — this is what makes it instant. */
const fileCache = new Map();
async function readEntity(zkId) {
  if (fileCache.has(zkId)) return fileCache.get(zkId);
  let parsed = null;
  try {
    parsed = JSON.parse(
      await fsp.readFile(path.join(ENTITIES_DIR, 'team_intelligence', `${zkId}.json`), 'utf8')
    );
  } catch { /* missing file -> cached as null */ }
  fileCache.set(zkId, parsed);
  return parsed;
}

function resolveTeamId(input) {
  const val = String(input ?? '').trim();
  if (!val) return null;
  if (val.startsWith('ZK_TEAM_')) return val;

  if (/^\d+$/.test(val)) {
    const hit = providerMap[val];
    if (hit) return typeof hit === 'string' ? hit : (hit.zkId || hit.id || hit.canonical_id || null);
  }

  const slug = norm(val);
  if (nameToIdMap.has(slug)) return nameToIdMap.get(slug);

  const stripped = slug.replace(/_(fc|cf|sc|afc|club)$/i, '');
  if (nameToIdMap.has(stripped)) return nameToIdMap.get(stripped);

  for (const [key, id] of nameToIdMap) {
    if (key.length >= 5 && (key.startsWith(slug) || slug.startsWith(key))) return id;
  }

  if (!unresolvedOnce.has(slug)) {
    unresolvedOnce.add(slug);
    logger.warn(`[MatchIntel] Unresolved team "${val}" — add it to teams-index or pass an ID`);
  }
  return null;
}

async function getTeamData(zkId) {
  if (!zkId) return { id: null, name: null, elo: 1500, form: [], goalPatterns: {} };
  const stats = (await readEntity(zkId)) || {};
  return {
    id: zkId,
    name: teamsIndex[zkId]?.name || null,
    elo: currentElo[zkId] ?? 1500,
    form: stats.recent_form || stats.form || [],
    // ★ canonical match route surfaces this as intelligence.goalPatterns
    goalPatterns: stats.goal_patterns || stats.goalPatterns || {},
  };
}

/* ★ Simple deterministic Elo-based pick (HOME/DRAW/AWAY + probabilities).
   Replaces the always-null zokaPick the canonical route expected. */
function computeZokaPick(homeData, awayData) {
  const homeElo = homeData?.elo ?? 1500;
  const awayElo = awayData?.elo ?? 1500;
  const diff = homeElo + 65 - awayElo; // +65 home advantage
  const pNotDraw = 1 / (1 + Math.pow(10, -diff / 400));
  const pDraw = Math.min(0.30, Math.max(0.12, 0.27 - Math.abs(diff) / 1500));
  const pH = pNotDraw * (1 - pDraw);
  const pA = (1 - pNotDraw) * (1 - pDraw);
  const best = Math.max(pH, pDraw, pA);
  return {
    pick: best === pH ? 'HOME' : best === pA ? 'AWAY' : 'DRAW',
    probabilities: {
      home: +pH.toFixed(3),
      draw: +pDraw.toFixed(3),
      away: +pA.toFixed(3),
    },
    basedOn: 'elo',
  };
}

async function getMatchIntelligence({ home, away, homeId, awayId } = {}) {
  const homeZk = resolveTeamId(homeId ?? home);
  const awayZk = resolveTeamId(awayId ?? away);

  const [homeData, awayData] = await Promise.all([getTeamData(homeZk), getTeamData(awayZk)]);

  let h2h = { meetings: 0, homeWins: 0, awayWins: 0, draws: 0 };
  if (homeZk && awayZk) {
    const [a, b] = [homeZk, awayZk].sort();
    const raw = h2hSummaries[`${a}_vs_${b}`] || h2hSummaries[`${b}_vs_${a}`] || null;
    if (raw) {
      const aIsHome = a === homeZk;
      h2h = {
        meetings: raw.matches ?? raw.meetings ?? 0,
        homeWins: aIsHome ? (raw.team_a_wins || 0) : (raw.team_b_wins || 0),
        awayWins: aIsHome ? (raw.team_b_wins || 0) : (raw.team_a_wins || 0),
        draws: raw.draws || 0,
      };
    }
  }

  if (!homeZk && !awayZk) return null;

  return {
    resolved: { home: Boolean(homeZk), away: Boolean(awayZk) },
    home: homeData,
    away: awayData,
    h2h,
    zokaPick: homeZk && awayZk ? computeZokaPick(homeData, awayData) : null,
  };
}

async function getTeamIntelligence(idOrName) {
  const zkId = resolveTeamId(idOrName);
  if (!zkId) return null;
  return { zkId, data: await readEntity(zkId) };
}

module.exports = { getMatchIntelligence, getTeamIntelligence, resolveTeamId };