// backend-v1/src/services/UserPredictionStore.js

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const QueueService = require('./QueueService');
const LocalSnapshotRepository = require('../repositories/LocalSnapshotRepository');
const StatsEngine = require('./StatsEngine');
const { getDb } = require('../config/firebase');
const {
  BATCH_MAX_OPS,
  WRITE_TIMEOUT_MS,
  getDateOffset,
} = require('../config/constants');

const {
  writeJSONAtomic,
  writeJSONAtomicSync,
  readJSONSafe,
  readJSONSafeSync,
  ensureDirSync,
} = require('../utils/atomicWriter');

const DATA_DIR = path.join(process.cwd(), 'data', 'user-predictions');
const STORE_DIR = path.join(DATA_DIR, 'store');
const WAL_DIR = path.join(DATA_DIR, 'wal');
const SYNCED_DIR = path.join(DATA_DIR, 'synced');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

ensureDirSync(STORE_DIR);
ensureDirSync(WAL_DIR);
ensureDirSync(SYNCED_DIR);

const SYNC_INTERVAL_MS = parseInt(
  process.env.USER_PREDICTION_SYNC_INTERVAL_MS || String(30 * 60 * 1000), // ★ Changed to 30 mins
  10
);

const RETRY_INTERVAL_MS = parseInt(
  process.env.USER_PREDICTION_RETRY_INTERVAL_MS || String(10 * 60 * 1000),
  10
);

const SYNC_SIZE_THRESHOLD = 500; // ★ NEW: Sync if WAL hits 500 ops

const LIVE_STATUSES = new Set([
  '1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED',
]);

const FINISHED_STATUSES = new Set([
  'FT', 'AET', 'PEN', 'FINISHED', 'ABD', 'AWD', 'WO',
]);

let state = readJSONSafeSync(STATE_FILE, {
  lastSyncAt: null,
  lastFailedAt: null,
  lastError: null,
  syncedOps: 0,
});

function saveState() {
  writeJSONAtomicSync(STATE_FILE, state, { pretty: false });
}

function safeFileId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''));
}

function storePath(uid, dateStr) {
  return path.join(STORE_DIR, safeFileId(uid), `${dateStr}.json`);
}

function walPath(dateStr) {
  return path.join(WAL_DIR, `${dateStr}.jsonl`);
}

function publicPrediction(prediction) {
  if (!prediction) return null;
  const { synced, ...rest } = prediction;
  return rest;
}

async function loadUserDate(uid, dateStr) {
  const filePath = storePath(uid, dateStr);
  const data = await readJSONSafe(filePath, {
    uid, date: dateStr, predictions: {}, updatedAt: null,
  });

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { uid, date: dateStr, predictions: {}, updatedAt: null };
  }

  if (!data.predictions || typeof data.predictions !== 'object') {
    data.predictions = {};
  }

  return data;
}

async function saveUserDate(uid, dateStr, payload) {
  await writeJSONAtomic(storePath(uid, dateStr), payload, { pretty: false });
}

async function appendWal(entry) {
  const line = `${JSON.stringify(entry)}\n`;
  await fsp.appendFile(walPath(entry.matchDate), line, 'utf8');
}

async function validateMatchNotStarted(matchId, dateStr) {
  try {
    const snapshot = await LocalSnapshotRepository.getFixtureSnapshot(dateStr);
    const all = snapshot.all || [
      ...(snapshot.matches || []),
      ...(snapshot.live || []),
      ...(snapshot.finished || []),
    ];

    const match = all.find((m) => String(m.id) === String(matchId));

    if (!match) return { found: false, started: false };

    const status = String(match.status || '').toUpperCase();

    if (LIVE_STATUSES.has(status) || FINISHED_STATUSES.has(status)) {
      return { found: true, started: true };
    }

    let kickoffMs = null;
    if (match.timestamp) {
      kickoffMs = Number(match.timestamp) * 1000;
    } else if (match.utcDate || match.date) {
      kickoffMs = Date.parse(match.utcDate || match.date);
    }

    if (kickoffMs && Date.now() > kickoffMs + 5 * 60 * 1000) {
      return { found: true, started: true };
    }

    return { found: true, started: false };
  } catch (err) {
    logger.warn(`[UserPredictionStore] Match validation failed for ${matchId}: ${err.message}`);
    return { found: false, started: false };
  }
}

async function savePrediction(user, input = {}) {
  if (!user || !user.uid) {
    throw ApiError.unauthorized('Authentication required');
  }

  const uid = String(user.uid);
  const matchId = String(input.matchId || '').trim();
  const matchDate = String(input.matchDate || '').trim();

  if (!matchId) throw ApiError.badRequest('matchId is required');
  if (!isValidDate(matchDate)) throw ApiError.badRequest('matchDate must be YYYY-MM-DD');
  if (input.homeScore === undefined || input.homeScore === null) throw ApiError.badRequest('homeScore is required');
  if (input.awayScore === undefined || input.awayScore === null) throw ApiError.badRequest('awayScore is required');

  const homeScore = Number(input.homeScore);
  const awayScore = Number(input.awayScore);

  if (!Number.isInteger(homeScore) || homeScore < 0 || homeScore > 99) throw ApiError.badRequest('homeScore must be an integer between 0 and 99');
  if (!Number.isInteger(awayScore) || awayScore < 0 || awayScore > 99) throw ApiError.badRequest('awayScore must be an integer between 0 and 99');

  const matchValidation = await validateMatchNotStarted(matchId, matchDate);

  if (matchValidation.found && matchValidation.started) {
    throw ApiError.conflict('This match has already started. Predictions are locked.');
  }

  const userDateDoc = await loadUserDate(uid, matchDate);
  const existing = userDateDoc.predictions[matchId];

  let status = 'recorded';

  if (existing) {
    if (existing.homeScore === homeScore && existing.awayScore === awayScore) {
      status = 'duplicate';
    } else {
      status = 'changed';
    }
  }

  const now = new Date().toISOString();

  const prediction = {
    userId: uid,
    displayName: String(input.displayName || 'Player'),
    matchId,
    predId: `${uid}_${matchId}`,
    homeScore,
    awayScore,
    matchDate,
    homeTeam: input.homeTeam || 'Home',
    awayTeam: input.awayTeam || 'Away',
    homeLogo: input.homeLogo ?? null,
    awayLogo: input.awayLogo ?? null,
    league: input.league || 'Other',
    kickoff: input.kickoff || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    synced: false,
  };

  userDateDoc.predictions[matchId] = prediction;
  userDateDoc.updatedAt = now;

  // 1. Store atomically before responding
  await saveUserDate(uid, matchDate, userDateDoc);

  // 2. Update local stats engine instantly
  if (status !== 'duplicate') {
    await StatsEngine.predictionCreated(uid);
  }

  // 3. Append write-ahead log for batch Firebase sync
  if (status !== 'duplicate') {
    try {
      await appendWal({
        op: 'set',
        collection: 'user_predictions',
        docId: prediction.predId,
        data: prediction,
        uid,
        matchId,
        matchDate,
        ts: now,
      });
    } catch (walErr) {
      logger.error(`[UserPredictionStore] WAL append failed for ${prediction.predId}: ${walErr.message}`);
      try {
        await QueueService.addToQueue({
          collection: 'user_predictions',
          docId: prediction.predId,
          data: prediction,
          priority: 'high',
          source: 'prediction-store-wal-fallback',
        });
      } catch (queueErr) {
        logger.error(`[UserPredictionStore] Queue fallback failed for ${prediction.predId}: ${queueErr.message}`);
      }
    }
  }

  logger.info(`[UserPredictionStore] ${status} prediction uid=${uid} match=${matchId} date=${matchDate} score=${homeScore}-${awayScore}`);

  return {
    status,
    prediction: publicPrediction(prediction),
  };
}

async function getUserPredictionsMap(uid, dateStr) {
  const normalizedDate = String(dateStr || getDateOffset(0)).trim();
  const userDateDoc = await loadUserDate(uid, normalizedDate);
  const map = {};

  for (const [matchId, prediction] of Object.entries(userDateDoc.predictions || {})) {
    map[matchId] = publicPrediction(prediction);
  }

  return map;
}

function readWalEntries(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildLatestOps(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry?.docId || !entry?.data) continue;
    map.set(entry.docId, entry);
  }
  return Array.from(map.values());
}

async function syncWalFile(db, filePath) {
  const entries = readWalEntries(filePath);
  if (!entries.length) {
    archiveWalFile(filePath);
    return 0;
  }

  const ops = buildLatestOps(entries);
  const nowIso = new Date().toISOString();

  for (let i = 0; i < ops.length; i += BATCH_MAX_OPS) {
    const chunk = ops.slice(i, i + BATCH_MAX_OPS);
    const batch = db.batch();

    for (const op of chunk) {
      const ref = db.collection('user_predictions').doc(String(op.docId));
      batch.set(ref, {
        ...op.data,
        synced: true,
        syncedAt: nowIso,
      }, { merge: true });
    }

    await Promise.race([
      batch.commit(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Prediction sync batch timeout')), WRITE_TIMEOUT_MS)),
    ]);
  }

  archiveWalFile(filePath);
  return ops.length;
}

function archiveWalFile(filePath) {
  const base = path.basename(filePath, '.jsonl');
  const archivedPath = path.join(SYNCED_DIR, `${base}.${Date.now()}.jsonl.synced`);
  fs.renameSync(filePath, archivedPath);
}

// ★ NEW: Adaptive Sync Logic
function shouldSync(force = false) {
  if (force) return true;
  const now = Date.now();

  // 1. Check if WAL file size exceeds threshold
  try {
    const files = fs.readdirSync(WAL_DIR).filter(file => file.endsWith('.jsonl'));
    let totalOps = 0;
    for (const file of files) {
      const content = fs.readFileSync(path.join(WAL_DIR, file), 'utf8');
      totalOps += content.split('\n').filter(Boolean).length;
      if (totalOps >= SYNC_SIZE_THRESHOLD) return true;
    }
  } catch (e) { /* Ignore read errors */ }

  // 2. Check retry interval (10 mins)
  if (state.lastFailedAt && now - state.lastFailedAt >= RETRY_INTERVAL_MS) return true;
  
  // 3. Check standard interval (30 mins)
  if (!state.lastSyncAt) return true;
  if (now - state.lastSyncAt >= SYNC_INTERVAL_MS) return true;

  return false;
}

async function processPendingSync(force = false) {
  if (!shouldSync(force)) {
    return { skipped: true, synced: 0 };
  }

  let files = [];
  try {
    files = fs.readdirSync(WAL_DIR).filter((file) => file.endsWith('.jsonl')).sort();
  } catch {
    files = [];
  }

  if (!files.length) {
    state.lastSyncAt = Date.now();
    state.lastFailedAt = null;
    state.lastError = null;
    saveState();
    return { skipped: false, synced: 0, pendingFiles: 0 };
  }

  try {
    const db = getDb();
    let totalSynced = 0;

    for (const file of files) {
      const filePath = path.join(WAL_DIR, file);
      totalSynced += await syncWalFile(db, filePath);
    }

    state.lastSyncAt = Date.now();
    state.lastFailedAt = null;
    state.lastError = null;
    state.syncedOps = Number(state.syncedOps || 0) + totalSynced;
    saveState();

    if (totalSynced > 0) {
      logger.info(`[UserPredictionStore] Synced ${totalSynced} user predictions to Firebase.`);
    }

    return { skipped: false, synced: totalSynced, pendingFiles: 0 };
  } catch (err) {
    state.lastFailedAt = Date.now();
    state.lastError = err.message;
    saveState();

    logger.error(`[UserPredictionStore] Sync failed. Will retry in 10 minutes. Error: ${err.message}`);

    return { skipped: false, synced: 0, error: err.message, pendingFiles: files.length };
  }
}

function getStats() {
  let pendingFiles = 0;
  let pendingOps = 0;
  try {
    const files = fs.readdirSync(WAL_DIR).filter((file) => file.endsWith('.jsonl'));
    pendingFiles = files.length;
    for (const file of files) {
      const content = fs.readFileSync(path.join(WAL_DIR, file), 'utf8');
      pendingOps += content.split('\n').filter(Boolean).length;
    }
  } catch {
    pendingFiles = 0;
  }

  return {
    ...state,
    pendingFiles,
    pendingOps,
    syncIntervalMs: SYNC_INTERVAL_MS,
    retryIntervalMs: RETRY_INTERVAL_MS,
    syncSizeThreshold: SYNC_SIZE_THRESHOLD
  };
}

module.exports = {
  savePrediction,
  getUserPredictionsMap,
  processPendingSync,
  getStats,
};



