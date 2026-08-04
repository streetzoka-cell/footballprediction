// backend-v1/src/services/FeaturedStore.js

const path = require('path');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const QueueService = require('./QueueService');
const { publishJSON } = require('./StaticFilePublisher');
const {
  writeJSONAtomic,
  readJSONSafe,
  ensureDir,
} = require('../utils/atomicWriter');
const DATA_DIR = path.join(process.cwd(), 'data', 'featured');
const PUBLIC_DIR = path.join(process.cwd(), 'public_data', 'featured');

const FEATURED_MAX = parseInt(process.env.FEATURED_MAX || '20', 10);

ensureDir(DATA_DIR);
ensureDir(PUBLIC_DIR);

function dataFile(date) {
  return path.join(DATA_DIR, `${date}.json`);
}

function publicFile(date) {
  return path.join(PUBLIC_DIR, `${date}.json`);
}

function normalizeDate(dateStr) {
  if (!dateStr) {
    throw ApiError.badRequest('date is required');
  }

  return String(dateStr).trim();
}

function sanitizeMatch(match, date) {
  const matchId = String(match?.matchId || match?.id || '').trim();

  if (!matchId) {
    throw ApiError.badRequest('match.id or match.matchId is required');
  }

  const now = new Date().toISOString();

  return {
    id: `feat_${date}_${matchId}`,
    matchId,
    matchDate: date,
    homeTeam: match.homeTeam || {
      name: match.homeTeamName || match.homeName || 'Home',
    },
    awayTeam: match.awayTeam || {
      name: match.awayTeamName || match.awayName || 'Away',
    },
    homeLogo:
      match.homeLogo ??
      match.homeTeam?.crest ??
      match.homeTeam?.logo ??
      null,
    awayLogo:
      match.awayLogo ??
      match.awayTeam?.crest ??
      match.awayTeam?.logo ??
      null,
    league:
      match.league ||
      match.competition || {
        name: match.leagueName || 'Other',
      },
    kickoff: match.kickoff || match.utcDate || match.date || null,
    status: match.status || 'NS',
    homeScore: match.homeScore ?? null,
    awayScore: match.awayScore ?? null,
    priority: Number(match.priority) || 0,
    createdAt: match.createdAt || now,
    updatedAt: now,
  };
}

async function list(date) {
  const normalizedDate = normalizeDate(date);

  const data = await readJSONSafe(dataFile(normalizedDate), null);

  if (data && Array.isArray(data.matches)) {
    return data.matches;
  }

  const publicData = await readJSONSafe(publicFile(normalizedDate), null);

  if (publicData && Array.isArray(publicData.matches)) {
    return publicData.matches;
  }

  return [];
}

async function publishPublic(date, matches) {
  await publishJSON(`featured/${date}.json`, {
    data: matches,
    matches,
    count: matches.length,
    date,
    lastUpdated: new Date().toISOString(),
  });
}

async function queueFirebaseSync(date, matches, removedIds = []) {
  const now = new Date().toISOString();

  for (const match of matches) {
    await QueueService.addToQueue({
      collection: 'active_predictions',
      docId: match.id || `feat_${date}_${match.matchId}`,
      type: 'set',
      data: match,
      priority: 'high',
      source: 'featured-store',
    });
  }

  for (const id of removedIds) {
    await QueueService.addToQueue({
      collection: 'active_predictions',
      docId: id,
      type: 'delete',
      priority: 'high',
      source: 'featured-store',
    });
  }

  await QueueService.addToQueue({
    collection: 'prediction_snapshots',
    docId: date,
    type: 'set',
    data: {
      predictions: matches,
      updatedAt: now,
    },
    priority: 'high',
    source: 'featured-store',
  });
}

async function save(date, matches, options = {}) {
  const {
    publish = true,
    syncFirebase = true,
  } = options;

  const normalizedDate = normalizeDate(date);

  const previous = await list(normalizedDate);

  const previousIds = new Set(
    previous.map((m) => String(m.id || `feat_${normalizedDate}_${m.matchId}`))
  );

  const newIds = new Set(
    matches.map((m) => String(m.id || `feat_${normalizedDate}_${m.matchId}`))
  );

  const removedIds = Array.from(previousIds).filter((id) => !newIds.has(id));

  const payload = {
    date: normalizedDate,
    matches,
    count: matches.length,
    updatedAt: new Date().toISOString(),
  };

  await writeJSONAtomic(dataFile(normalizedDate), payload, {
    pretty: true,
  });

  if (publish) {
    await publishPublic(normalizedDate, matches);
  }

  if (syncFirebase) {
    await queueFirebaseSync(normalizedDate, matches, removedIds);
  }

  logger.info(
    `[FeaturedStore] Saved ${matches.length} featured matches for ${normalizedDate}. Removed ${removedIds.length}.`
  );

  return payload;
}

async function add(date, match) {
  const normalizedDate = normalizeDate(date);

  const matches = await list(normalizedDate);
  const sanitized = sanitizeMatch(match, normalizedDate);

  const existingIndex = matches.findIndex(
    (m) => String(m.matchId) === String(sanitized.matchId)
  );

  if (existingIndex >= 0) {
    matches[existingIndex] = sanitized;
  } else {
    if (matches.length >= FEATURED_MAX) {
      throw new ApiError(
        409,
        'FEATURED_LIST_FULL',
        `Featured list is full. Maximum allowed: ${FEATURED_MAX}`
      );
    }

    matches.push(sanitized);
  }

  matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  await save(normalizedDate, matches);

  return sanitized;
}

async function remove(date, matchId) {
  const normalizedDate = normalizeDate(date);

  const matches = await list(normalizedDate);

  const removed = matches.find(
    (m) => String(m.matchId) === String(matchId)
  );

  const next = matches.filter(
    (m) => String(m.matchId) !== String(matchId)
  );

  await save(normalizedDate, next);

  return removed || null;
}
async function replace(date, matches, options = {}) {
  const normalizedDate = normalizeDate(date);

  const sanitized = [];

  for (const match of matches || []) {
    try {
      sanitized.push(sanitizeMatch(match, normalizedDate));
    } catch (err) {
      logger.warn(
        `[FeaturedStore] Skipping invalid match during replace: ${err.message}`
      );
    }
  }

  sanitized.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  await save(normalizedDate, sanitized, options);

  return sanitized;
}

module.exports = {
  list,
  add,
  remove,
  replace,
  save,
  FEATURED_MAX,
};