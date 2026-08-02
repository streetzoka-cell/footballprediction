// backend-v1/src/repositories/LocalSnapshotRepository.js

const path = require('path');
const { readJSONSafe } = require('../utils/atomicWriter');
const { getDateOffset } = require('../config/constants');

const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public_data');

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function normalizeSnapshotPayload(payload) {
  return {
    data: toArray(payload),
    count: toArray(payload).length,
    lastUpdated: payload?.lastUpdated || payload?.date || null,
  };
}

async function getFixtureSnapshot(dateStr) {
  const fixturesPath = path.join(PUBLIC_DATA_DIR, 'fixtures', `${dateStr}.json`);
  const livePath = path.join(PUBLIC_DATA_DIR, 'live.json');
  const resultsPath = path.join(PUBLIC_DATA_DIR, 'results', `${dateStr}.json`);

  const [fixturesPayload, livePayload, resultsPayload] = await Promise.all([
    readJSONSafe(fixturesPath, { data: [] }),
    readJSONSafe(livePath, { data: [] }),
    readJSONSafe(resultsPath, { data: [] }),
  ]);

  const fixtures = toArray(fixturesPayload);
  const liveAll = toArray(livePayload);
  const finished = toArray(resultsPayload);

  const today = getDateOffset(0);
  const live = dateStr === today ? liveAll : [];

  const map = new Map();

  for (const match of fixtures) {
    if (match?.id) {
      map.set(String(match.id), match);
    }
  }

  for (const match of finished) {
    if (!match?.id) continue;

    const id = String(match.id);
    const existing = map.get(id);

    map.set(id, {
      ...existing,
      ...match,
    });
  }

  for (const match of live) {
    if (!match?.id) continue;

    const id = String(match.id);
    const existing = map.get(id);

    // Do not allow an old live payload to resurrect a finished match
    if (existing?.display?.isFinished && !match?.display?.isFinished) {
      continue;
    }

    map.set(id, {
      ...existing,
      ...match,
    });
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

async function getLiveSnapshot() {
  const livePath = path.join(PUBLIC_DATA_DIR, 'live.json');
  const payload = await readJSONSafe(livePath, { data: [] });
  const live = toArray(payload);

  return {
    data: live,
    live,
    count: live.length,
    lastUpdated: payload?.lastUpdated || null,
  };
}

async function getResultsSnapshot(dateStr) {
  const resultsPath = path.join(PUBLIC_DATA_DIR, 'results', `${dateStr}.json`);
  const payload = await readJSONSafe(resultsPath, { data: [] });
  const results = toArray(payload);

  return {
    date: dateStr,
    data: results,
    finished: results,
    count: results.length,
    lastUpdated: payload?.lastUpdated || null,
  };
}

async function getStandingsSnapshot() {
  const standingsPath = path.join(PUBLIC_DATA_DIR, 'standings.json');
  const payload = await readJSONSafe(standingsPath, { data: [] });

  return toArray(payload);
}

async function getLeaguesSnapshot() {
  const leaguesPath = path.join(PUBLIC_DATA_DIR, 'leagues.json');
  const payload = await readJSONSafe(leaguesPath, null);

  if (!payload) return null;

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;

  return null;
}

async function getVideosSnapshot() {
  const videosPath = path.join(PUBLIC_DATA_DIR, 'videos.json');
  const payload = await readJSONSafe(videosPath, { data: [] });

  return normalizeSnapshotPayload(payload);
}

module.exports = {
  getFixtureSnapshot,
  getLiveSnapshot,
  getResultsSnapshot,
  getStandingsSnapshot,
  getLeaguesSnapshot,
  getVideosSnapshot,
};