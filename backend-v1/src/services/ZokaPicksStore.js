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
const { getDateOffset } = require('../config/constants');

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
  const trimmed = String(dateStr).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw ApiError.badRequest('date must be in YYYY-MM-DD format');
  }
  return trimmed;
}

function validateAdminPick(pick) {
  const home = Number(pick?.home);
  const away = Number(pick?.away);

  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away > 99 || away < 0 || home > 99) {
    throw ApiError.badRequest('adminPick scores must be integers between 0 and 99');
  }

  return { home, away };
}

function sanitizePicks(payload, date, forceDraft = false) {
  const matches = Array.isArray(payload?.matches) ? payload.matches : [];
  const now = new Date().toISOString();
  const isDraft = forceDraft ? true : Boolean(payload?.isDraft);

  const sanitizedMatches = matches.map((m) => {
    const matchId = String(m.matchId || m.id || '').trim();
    if (!matchId) return null;

    const homeTeam = m.homeTeam || {
      name: m.homeTeamName || m.homeName || 'Home',
    };
    const awayTeam = m.awayTeam || {
      name: m.awayTeamName || m.awayName || 'Away',
    };

    const adminPick = m.adminPick
      ? validateAdminPick(m.adminPick)
      : { home: Number(m.home ?? 0), away: Number(m.away ?? 0) };

    return {
      matchId,
      homeTeam,
      awayTeam,
      homeLogo: m.homeLogo ?? m.homeTeam?.crest ?? m.homeTeam?.logo ?? null,
      awayLogo: m.awayLogo ?? m.awayTeam?.crest ?? m.awayTeam?.logo ?? null,
      league: m.league || m.competition || { name: m.leagueName || 'Other' },
      kickoff: m.kickoff || m.utcDate || m.date || null,
      adminPick,
      homeScore: m.homeScore != null ? Number(m.homeScore) : null,
      awayScore: m.awayScore != null ? Number(m.awayScore) : null,
      status: m.status || 'upcoming',
      updatedAt: now,
    };
  }).filter(Boolean);

  return {
    date,
    matches: sanitizedMatches,
    totalMatches: sanitizedMatches.length,
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

  await writeJSONAtomic(dataFile(normalizedDate), sanitized, { pretty: true });

  logger.info(
    `[ZokaPicksStore] Saved draft for ${normalizedDate}. Matches: ${sanitized.matches.length}`
  );

  return sanitized;
}

async function publish(date, payload) {
  const normalizedDate = normalizeDate(date);
  const sanitized = sanitizePicks(payload, normalizedDate, false);

  await writeJSONAtomic(dataFile(normalizedDate), sanitized, { pretty: true });

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

  // Also publish empty picks to public JSON
  await publishJSON(`zokapicks/${normalizedDate}.json`, {
    data: [],
    matches: [],
    date: normalizedDate,
    isDraft: true,
    publishedAt: null,
    updatedAt: new Date().toISOString(),
  });

  const draft = await getDraft(normalizedDate);

  if (draft) {
    draft.isDraft = true;
    draft.publishedAt = null;
    draft.updatedAt = new Date().toISOString();

    await writeJSONAtomic(dataFile(normalizedDate), draft, { pretty: true });
  }

  logger.info(`[ZokaPicksStore] Unpublished Zoka Picks for ${normalizedDate}.`);

  return {
    unpublished: true,
    date: normalizedDate,
  };
}

// NEW: Get history from local JSON files (replaces slow Firestore reads)
async function getHistory(days = 7) {
  const history = [];

  for (let i = 1; i <= days; i++) {
    const date = getDateOffset(-i);
    const published = await readJSONSafe(publicFile(date), null);

    if (!published || !Array.isArray(published.matches) || published.matches.length === 0) {
      continue;
    }

    let exact = 0, result = 0, miss = 0, pending = 0;
    const matches = published.matches;

    matches.forEach(pk => {
      if (pk.status !== 'finished' || pk.homeScore == null) {
        pending++;
        return;
      }
      const h = Number(pk.adminPick?.home);
      const a = Number(pk.adminPick?.away);

      if (h === pk.homeScore && a === pk.awayScore) {
        exact++;
        return;
      }
      const predictedResult = h > a ? 'H' : h < a ? 'A' : 'D';
      const actualResult = pk.homeScore > pk.awayScore ? 'H' : pk.homeScore < pk.awayScore ? 'A' : 'D';
      if (predictedResult === actualResult) {
        result++;
        return;
      }
      miss++;
    });

    const resolved = matches.length - pending;
    const accuracy = resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0;

    history.push({
      date,
      matches,
      exact,
      result,
      miss,
      pending,
      total: matches.length,
      accuracy,
    });
  }

  return history;
}

module.exports = {
  getDraft,
  getPublished,
  saveDraft,
  publish,
  unpublish,
  getHistory,
};