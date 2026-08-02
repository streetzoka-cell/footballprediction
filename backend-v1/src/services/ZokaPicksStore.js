// backend-v1/src/services/ZokaPicksStore.js

const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const QueueService = require('./QueueService');
const { publishJSON } = require('./StaticFilePublisher');
const {
  writeJSONAtomic,
  readJSONSafe,
  ensureDir,
} = require('../utils/atomicWriter');

const DATA_DIR = path.join(process.cwd(), 'data', 'zokapicks');
const PUBLIC_DIR = path.join(process.cwd(), 'public_data', 'zokapicks');

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

function sanitizePicks(payload, date, forceDraft = false) {
  const matches = Array.isArray(payload?.matches) ? payload.matches : [];
  const now = new Date().toISOString();

  const isDraft = forceDraft ? true : Boolean(payload?.isDraft);

  return {
    date,
    matches: matches.map((m) => ({
      matchId: String(m.matchId || m.id || '').trim(),
      homeTeam: m.homeTeam || {
        name: m.homeTeamName || m.homeName || 'Home',
      },
      awayTeam: m.awayTeam || {
        name: m.awayTeamName || m.awayName || 'Away',
      },
      homeLogo:
        m.homeLogo ??
        m.homeTeam?.crest ??
        m.homeTeam?.logo ??
        null,
      awayLogo:
        m.awayLogo ??
        m.awayTeam?.crest ??
        m.awayTeam?.logo ??
        null,
      league:
        m.league ||
        m.competition || {
          name: m.leagueName || 'Other',
        },
      kickoff: m.kickoff || m.utcDate || m.date || null,
      adminPick: {
        home: Number(m.adminPick?.home ?? m.home ?? 0),
        away: Number(m.adminPick?.away ?? m.away ?? 0),
      },
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      status: m.status || 'upcoming',
      updatedAt: now,
    })).filter((m) => m.matchId),
    totalMatches: matches.length,
    isDraft,
    publishedAt: isDraft ? null : (payload?.publishedAt || now),
    updatedAt: now,
  };
}

async function getDraft(date) {
  const normalizedDate = normalizeDate(date);
  return readJSONSafe(dataFile(normalizedDate), null);
}

async function getPublished(date) {
  const normalizedDate = normalizeDate(date);
  return readJSONSafe(publicFile(normalizedDate), null);
}

async function saveDraft(date, payload) {
  const normalizedDate = normalizeDate(date);

  const sanitized = sanitizePicks(payload, normalizedDate, true);

  await writeJSONAtomic(dataFile(normalizedDate), sanitized, {
    pretty: true,
  });

  logger.info(
    `[ZokaPicksStore] Saved draft for ${normalizedDate}. Matches: ${sanitized.matches.length}`
  );

  return sanitized;
}

async function publish(date, payload) {
  const normalizedDate = normalizeDate(date);

  const sanitized = sanitizePicks(payload, normalizedDate, false);

  await writeJSONAtomic(dataFile(normalizedDate), sanitized, {
    pretty: true,
  });

  await publishJSON(`zokapicks/${normalizedDate}.json`, {
    data: sanitized.matches,
    ...sanitized,
  });

  await QueueService.addToQueue({
    collection: 'zoka_picks',
    docId: normalizedDate,
    type: 'set',
    data: sanitized,
    priority: 'high',
    source: 'zoka-store',
  });

  logger.info(
    `[ZokaPicksStore] Published Zoka Picks for ${normalizedDate}. Matches: ${sanitized.matches.length}`
  );

  return sanitized;
}

async function unpublish(date) {
  const normalizedDate = normalizeDate(date);

  try {
    await fs.unlink(publicFile(normalizedDate));
  } catch {
    // Ignore missing public file
  }

  await QueueService.addToQueue({
    collection: 'zoka_picks',
    docId: normalizedDate,
    type: 'delete',
    priority: 'high',
    source: 'zoka-store',
  });

  const draft = await getDraft(normalizedDate);

  if (draft) {
    draft.isDraft = true;
    draft.publishedAt = null;
    draft.updatedAt = new Date().toISOString();

    await writeJSONAtomic(dataFile(normalizedDate), draft, {
      pretty: true,
    });
  }

  logger.info(`[ZokaPicksStore] Unpublished Zoka Picks for ${normalizedDate}.`);

  return {
    unpublished: true,
    date: normalizedDate,
  };
}

module.exports = {
  getDraft,
  getPublished,
  saveDraft,
  publish,
  unpublish,
};