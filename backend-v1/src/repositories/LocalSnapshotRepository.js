// backend-v1/src/repositories/LocalSnapshotRepository.js

const path = require('path');
const fsp = require('fs').promises;
const { readJSONSafe } = require('../utils/atomicWriter');
const { getDateOffset } = require('../config/constants');

const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public_data');

/* ============================================================
 * mtime-validated read cache.
 * Each snapshot file is read + parsed from disk ONCE per version.
 * When the publisher rewrites a file, the next request detects the
 * new mtime and reloads. Requests between publishes are pure memory
 * hits -> instant, zero re-parsing. The publisher stays the only writer.
 * ============================================================ */
const fileCache = new Map(); // absPath -> { mtimeMs, payload }

async function readCached(absPath, fallback) {
  let stat = null;
  try {
    stat = await fsp.stat(absPath);
  } catch {
    fileCache.delete(absPath);
    return fallback;
  }

  const cached = fileCache.get(absPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.payload;
  }

  const payload = await readJSONSafe(absPath, fallback);
  fileCache.set(absPath, { mtimeMs: stat.mtimeMs, payload });
  return payload;
}

/* ============================================================
 * Shape normalizers — accept every historical publisher format
 * ============================================================ */
function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function toStandingsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  // Legacy: { data: { 39: {...}, 140: {...} } }
  if (payload?.data && typeof payload.data === 'object') {
    return Object.values(payload.data);
  }
  // Legacy: bare map { 39: {...}, 140: {...} }
  if (payload && typeof payload === 'object') {
    const vals = Object.values(payload);
    if (vals.length > 0 && vals.some((v) => v && typeof v === 'object' && (v.rows || v.leagueId || v.code))) {
      return vals.filter((v) => v && typeof v === 'object');
    }
  }
  return [];
}

function normalizeSnapshotPayload(payload) {
  const data = toArray(payload);
  return {
    data,
    count: data.length,
    lastUpdated: payload?.lastUpdated || payload?.date || null,
  };
}

/* ============================================================
 * Fixtures (today = fixtures + live + results merged)
 * ============================================================ */
async function getFixtureSnapshot(dateStr) {
  const fixturesPath = path.join(PUBLIC_DATA_DIR, 'fixtures', `${dateStr}.json`);
  const livePath = path.join(PUBLIC_DATA_DIR, 'live.json');
  const resultsPath = path.join(PUBLIC_DATA_DIR, 'results', `${dateStr}.json`);

  const [fixturesPayload, livePayload, resultsPayload] = await Promise.all([
    readCached(fixturesPath, { data: [] }),
    readCached(livePath, { data: [] }),
    readCached(resultsPath, { data: [] }),
  ]);

  const fixtures = toArray(fixturesPayload);
  const liveAll = toArray(livePayload);
  const finished = toArray(resultsPayload);

  const today = getDateOffset(0);
  const live = dateStr === today ? [...liveAll] : [];

  const map = new Map();

  for (const match of fixtures) {
    if (match?.id) map.set(String(match.id), match);
  }

  for (const match of finished) {
    if (!match?.id) continue;
    const id = String(match.id);
    map.set(id, { ...map.get(id), ...match });
  }

  for (const match of live) {
    if (!match?.id) continue;
    const id = String(match.id);
    const existing = map.get(id);
    // Do not allow an old live payload to resurrect a finished match
    if (existing?.display?.isFinished && !match?.display?.isFinished) continue;
    map.set(id, { ...existing, ...match });
  }

  const all = Array.from(map.values());

  const matches = all.filter((match) => {
    const isFinished =
      match?.status === 'FT' ||
      match?.display?.isFinished === true ||
      match?.isFinished === true;
    return !isFinished;
  });

  return {
    date: dateStr,
    matches,
    live,
    finished,
    all,
    count: all.length,
    lastUpdated:
      fixturesPayload?.lastUpdated ||
      livePayload?.lastUpdated ||
      resultsPayload?.lastUpdated ||
      null,
  };
}

/* ============================================================
 * Live / Results / Videos
 * ============================================================ */
async function getLiveSnapshot() {
  const payload = await readCached(path.join(PUBLIC_DATA_DIR, 'live.json'), { data: [] });
  const live = [...toArray(payload)];
  return {
    data: live,
    live,
    count: live.length,
    lastUpdated: payload?.lastUpdated || null,
  };
}

async function getResultsSnapshot(dateStr) {
  const payload = await readCached(
    path.join(PUBLIC_DATA_DIR, 'results', `${dateStr}.json`),
    { data: [] }
  );
  const results = [...toArray(payload)];
  return {
    date: dateStr,
    data: results,
    finished: results,
    count: results.length,
    lastUpdated: payload?.lastUpdated || null,
  };
}

async function getVideosSnapshot() {
  const payload = await readCached(path.join(PUBLIC_DATA_DIR, 'videos.json'), { data: [] });
  return normalizeSnapshotPayload(payload);
}

/* ============================================================
 * Standings — flat array of league containers:
 * [ { leagueId, leagueName, season, code, rows: [...], updatedAt } ]
 * ============================================================ */
async function getStandingsSnapshot() {
  const payload = await readCached(path.join(PUBLIC_DATA_DIR, 'standings.json'), { data: [] });
  return [...toStandingsArray(payload)];
}

/* ============================================================
 * Leagues
 * ============================================================ */
async function getLeaguesSnapshot() {
  const payload = await readCached(path.join(PUBLIC_DATA_DIR, 'leagues.json'), null);

  if (!payload) return null;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.leagues)) return payload.leagues;

  return null;
}

module.exports = {
  getFixtureSnapshot,
  getLiveSnapshot,
  getResultsSnapshot,
  getStandingsSnapshot,
  getLeaguesSnapshot,
  getVideosSnapshot,
};