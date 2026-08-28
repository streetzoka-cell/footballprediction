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

/*
 * Entity files: read ONCE, then served from memory — this is what makes it instant.
 * Found files cache forever (refresh = restart). MISS results get a short TTL so
 * files that appear after a pipeline re-run are picked up without a restart.
 */
const NULL_TTL_MS = 5 * 60 * 1000;
const fileCache = new Map(); // zkId -> { value, expiresAt }  (expiresAt === null → forever)

async function readEntity(zkId) {
  const cached = fileCache.get(zkId);
  if (cached) {
    if (cached.expiresAt === null || cached.expiresAt > Date.now()) return cached.value;
    fileCache.delete(zkId); // stale miss — the file may exist now, retry disk
  }

  let parsed = null;
  try {
    parsed = JSON.parse(
      await fsp.readFile(path.join(ENTITIES_DIR, 'team_intelligence', `${zkId}.json`), 'utf8')
    );
  } catch { /* missing file */ }

  fileCache.set(
    zkId,
    parsed
      ? { value: parsed, expiresAt: null }
      : { value: null, expiresAt: Date.now() + NULL_TTL_MS }
  );
  return parsed;
}

function resolveTeamId(input) {
  const val = String(input ?? '').trim();
  if (!val) return null;
  if (val.startsWith('ZK_TEAM_')) return val;

  // provider map first, for ANY value (ids, slugs, keys)
  const hit = providerMap[val];
  if (hit) {
    return typeof hit === 'string'
      ? hit
      : hit.zkId || hit.id || hit.canonical_id || null;
  }

  const slug = norm(val);
  if (nameToIdMap.has(slug)) return nameToIdMap.get(slug);

  // strip suffixes: "newcastle_utd_fc" -> "newcastle"
  const stripped = slug.replace(/_(fc|cf|sc|afc|club)$/i, '');
  if (nameToIdMap.has(stripped)) return nameToIdMap.get(stripped);

  // prefix fallback: "manchester" vs "manchester_city"
  for (const [key, id] of nameToIdMap) {
    if (key.length >= 5 && (key.startsWith(slug) || slug.startsWith(key))) return id;
  }

  if (!unresolvedOnce.has(slug)) {
    unresolvedOnce.add(slug);
    logger.warn(`[MatchIntel] Unresolved team "${val}" — add it to teams-index or pass an ID`);
  }
  return null;
}

/*
 * Aggregate H2H — pure memory, no entity file reads. idA is treated as HOME.
 * Handles both sorted-key and unsorted-key summaries correctly by tracking
 * which key actually hit before remapping team_a/team_b → home/away.
 */
function getH2H(idA, idB) {
  const base = { meetings: 0, homeWins: 0, awayWins: 0, draws: 0 };
  if (!idA || !idB) return base;

  const home = String(idA);
  const away = String(idB);
  const [x, y] = [home, away].sort();

  let raw = h2hSummaries[`${x}_vs_${y}`] || null;
  let teamAIsHome;

  if (raw) {
    teamAIsHome = x === home;               // sorted key: team_a === x
  } else {
    raw = h2hSummaries[`${y}_vs_${x}`] || null;
    if (!raw) return base;
    teamAIsHome = y === home;               // reversed key: team_a === y
  }

  return {
    meetings: raw.matches ?? raw.meetings ?? 0,
    homeWins: teamAIsHome ? (raw.team_a_wins || 0) : (raw.team_b_wins || 0),
    awayWins: teamAIsHome ? (raw.team_b_wins || 0) : (raw.team_a_wins || 0),
    draws: raw.draws || 0,
  };
}

async function getTeamData(zkId) {
  if (!zkId) return { id: null, name: null, elo: 1500, form: [], goalPatterns: {} };
  const stats = (await readEntity(zkId)) || {};
  return {
    id: zkId,
    name: teamsIndex[zkId]?.name || null,
    elo: currentElo[zkId] ?? 1500,
    form: stats.recent_form || stats.form || [],
    goalPatterns: stats.goal_patterns || stats.goalPatterns || {},
  };
}

/* Deterministic Elo-based pick (HOME/DRAW/AWAY + probabilities). */
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

  // ★ single source of truth — same function the /intelligence/h2h route uses
  const h2h = getH2H(homeZk, awayZk);

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

module.exports = { getMatchIntelligence, getTeamIntelligence, getH2H, resolveTeamId };