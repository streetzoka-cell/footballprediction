// backend-v1/src/services/QueueService.js
const path = require('path');
const { randomUUID } = require('crypto');

const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const { BATCH_MAX_OPS, WRITE_TIMEOUT_MS } = require('../config/constants');
const {
  writeJSONAtomicSync,
  readJSONSafeSync,
  ensureDirSync,
} = require('../utils/atomicWriter');

const DATA_DIR = path.join(process.cwd(), 'data', 'queue');

const PENDING_FILE = path.join(DATA_DIR, 'pending.json');
const DEAD_LETTER_FILE = path.join(DATA_DIR, 'dead-letter.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const LEGACY_QUEUE_FILE = path.join(process.cwd(), 'pending_queue.json');

ensureDirSync(DATA_DIR);

const ALLOWED_COLLECTIONS = new Set([
  'active_predictions',
  'prediction_snapshots',
  'user_predictions',
  'prediction_results',
  'user_points_total',
  'daily_leaderboard',
  'leaderboard_summaries',
  'zoka_picks',
  'zoka_vote_stats',
  'match_resolution_status',
  'prediction_groups',       // ★ NEW — curated groups Firestore backup
  'pick_groups_archive',     // ★ NEW — permanent history backup
]);

const ALLOWED_TYPES = new Set(['set', 'update', 'delete']);

const PRIORITY_WEIGHT = {
  high: 0,
  normal: 1,
  low: 2,
};

let processing = false;

let stats = {
  processed: 0,
  failed: 0,
  retries: 0,
  deadLettered: 0,
  lastRun: null,
  lastError: null,
  startedAt: new Date().toISOString(),
};

function readPending() {
  const queue = readJSONSafeSync(PENDING_FILE, []);
  return Array.isArray(queue) ? queue : [];
}

function writePending(queue) {
  writeJSONAtomicSync(PENDING_FILE, queue, { pretty: false });
}

function readDeadLetter() {
  const queue = readJSONSafeSync(DEAD_LETTER_FILE, []);
  return Array.isArray(queue) ? queue : [];
}

function writeDeadLetter(queue) {
  writeJSONAtomicSync(DEAD_LETTER_FILE, queue, { pretty: false });
}

function saveState() {
  writeJSONAtomicSync(STATE_FILE, { stats }, { pretty: false });
}

function loadState() {
  const state = readJSONSafeSync(STATE_FILE, null);
  if (state && state.stats) {
    stats = { ...stats, ...state.stats };
  }
}

function sanitizeOp(op) {
  if (!op || typeof op !== 'object') {
    throw new Error('Invalid queue operation');
  }

  const collection = String(op.collection || '').trim();
  const docId = String(op.docId || '').trim();

  if (!collection || !docId) {
    throw new Error('Missing collection or docId');
  }

  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw new Error(`Collection not allowed: ${collection}`);
  }

  const type = ALLOWED_TYPES.has(op.type) ? op.type : 'set';

  if (type !== 'delete') {
    if (!op.data || typeof op.data === 'object' || Array.isArray(op.data)) {
      throw new Error('Missing data object');
    }
  }

  const priority = PRIORITY_WEIGHT[op.priority] !== undefined ? op.priority : 'normal';

  return {
    id: op.id || `${collection}_${docId}_${randomUUID()}`,
    type,
    collection,
    docId,
    data: type === 'delete' ? null : op.data,
    options: op.options && typeof op.options === 'object' ? op.options : { merge: true },
    priority,
    source: op.source || 'backend',
    createdAt: op.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attempts: Number(op.attempts) || 0,
    maxAttempts: Number(op.maxAttempts) || 0,
    nextRetryAt: Number(op.nextRetryAt) || 0,
    lastError: op.lastError || null,
    lastAttemptAt: op.lastAttemptAt || null,
  };
}

function migrateLegacyQueue() {
  try {
    const fs = require('fs');
    if (!fs.existsSync(LEGACY_QUEUE_FILE)) return;

    const current = readPending();
    if (current.length > 0) return;

    const legacy = readJSONSafeSync(LEGACY_QUEUE_FILE, []);
    if (!Array.isArray(legacy) || legacy.length === 0) return;

    const sanitized = [];
    for (const op of legacy) {
      try { sanitized.push(sanitizeOp(op)); } catch { /* Skip invalid */ }
    }

    if (sanitized.length > 0) {
      writePending(sanitized);
      logger.info(`[QueueService] Migrated ${sanitized.length} legacy queue operations.`);
    }

    fs.renameSync(LEGACY_QUEUE_FILE, `${LEGACY_QUEUE_FILE}.migrated.bak`);
  } catch (err) {
    logger.warn(`[QueueService] Legacy queue migration failed: ${err.message}`);
  }
}

async function addToQueue(op) {
  const sanitized = sanitizeOp(op);

  const pending = readPending();
  const key = `${sanitized.collection}:${sanitized.docId}`;

  const existingIndex = pending.findIndex(
    (item) => `${item.collection}:${item.docId}` === key
  );

  if (existingIndex >= 0) {
    const existing = pending[existingIndex];

    // 'set' merges data, 'delete' overrides
    if (existing.type === 'delete' && sanitized.type !== 'delete') {
      pending[existingIndex] = sanitized;
    } else if (existing.type === 'set' && sanitized.type === 'set') {
      existing.data = { ...existing.data, ...sanitized.data };
    } else {
      existing.type = sanitized.type;
      existing.data = sanitized.data;
    }

    existing.options = sanitized.options;

    existing.priority =
      PRIORITY_WEIGHT[sanitized.priority] < PRIORITY_WEIGHT[existing.priority]
        ? sanitized.priority
        : existing.priority;

    existing.updatedAt = new Date().toISOString();
    existing.nextRetryAt = 0;

    writePending(pending);
    return existing;
  }

  pending.push(sanitized);
  writePending(pending);

  logger.info(
    `[QueueService] Queued ${sanitized.type} ${sanitized.collection}/${sanitized.docId}. Pending: ${pending.length}`
  );

  return sanitized;
}

function calculateNextRetry(op, quotaError) {
  const baseMinutes = quotaError ? 10 : 5;
  const maxMinutes = 60;
  const backoffMinutes = Math.min(maxMinutes, baseMinutes * Math.max(1, op.attempts));
  return Date.now() + backoffMinutes * 60 * 1000;
}

async function applyOp(db, op) {
  const ref = db.collection(op.collection).doc(op.docId);

  if (op.type === 'delete') {
    await Promise.race([
      ref.delete(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Queue delete timeout')), WRITE_TIMEOUT_MS)
      ),
    ]);
    return;
  }

  const cleanData = JSON.parse(JSON.stringify(op.data));

  await Promise.race([
    ref.set(cleanData, op.options || { merge: true }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Queue write timeout')), WRITE_TIMEOUT_MS)
    ),
  ]);
}

async function commitChunk(db, chunk) {
  const batch = db.batch();

  for (const op of chunk) {
    const ref = db.collection(op.collection).doc(op.docId);

    if (op.type === 'delete') {
      batch.delete(ref);
    } else {
      const cleanData = JSON.parse(JSON.stringify(op.data));
      batch.set(ref, cleanData, op.options || { merge: true });
    }
  }

  await Promise.race([
    batch.commit(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Queue batch timeout')), WRITE_TIMEOUT_MS)
    ),
  ]);
}

async function retryIndividually(db, chunk) {
  const results = { processed: 0, failedOps: [] };

  for (const op of chunk) {
    try {
      await applyOp(db, op);
      results.processed += 1;
    } catch (individualErr) {
      op.lastError = individualErr.message;
      results.failedOps.push(op);
    }
  }

  return results;
}

async function processQueue() {
  if (processing) {
    return { processed: 0, skipped: true, reason: 'already-processing' };
  }

  processing = true;

  try {
    const pending = readPending();

    if (!pending.length) {
      stats.lastRun = new Date().toISOString();
      saveState();
      return { processed: 0, pending: 0 };
    }

    const db = getDb();
    const now = Date.now();

    const due = pending.filter((op) => !op.nextRetryAt || op.nextRetryAt <= now);

    if (!due.length) {
      stats.lastRun = new Date().toISOString();
      saveState();
      return { processed: 0, pending: pending.length, waiting: pending.length };
    }

    due.sort((a, b) => {
      const priorityDiff =
        (PRIORITY_WEIGHT[a.priority] ?? 1) - (PRIORITY_WEIGHT[b.priority] ?? 1);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const remainingById = new Map(pending.map((op) => [op.id, op]));
    const dead = [];
    let processed = 0;

    for (let i = 0; i < due.length; i += BATCH_MAX_OPS) {
      const chunk = due.slice(i, i + BATCH_MAX_OPS);

      try {
        await commitChunk(db, chunk);

        for (const op of chunk) {
          remainingById.delete(op.id);
          processed += 1;
          stats.processed += 1;
        }
      } catch (batchErr) {
        const quotaError =
          batchErr.code === 8 ||
          /resource-exhausted|quota/i.test(batchErr.message || '');

        const individual = await retryIndividually(db, chunk);

        processed += individual.processed;
        stats.processed += individual.processed;

        for (const op of chunk) {
          const succeededIndividually = !individual.failedOps.some(
            (failedOp) => failedOp.id === op.id
          );

          if (succeededIndividually) {
            remainingById.delete(op.id);
            continue;
          }

          stats.failed += 1;
          stats.retries += 1;

          op.attempts += 1;
          op.lastAttemptAt = new Date().toISOString();
          op.lastError = op.lastError || batchErr.message;
          op.nextRetryAt = calculateNextRetry(op, quotaError);

          if (!quotaError && op.maxAttempts > 0 && op.attempts >= op.maxAttempts) {
            dead.push(op);
            remainingById.delete(op.id);
            stats.deadLettered += 1;
          } else {
            remainingById.set(op.id, op);
          }
        }
      }
    }

    const remaining = Array.from(remainingById.values());
    writePending(remaining);

    if (dead.length > 0) {
      const existingDead = readDeadLetter();
      writeDeadLetter([...existingDead, ...dead]);
    }

    stats.lastRun = new Date().toISOString();
    stats.lastError = null;
    saveState();

    if (processed > 0) {
      logger.info(
        `[QueueService] Processed ${processed} ops. Pending: ${remaining.length}. Dead-letter: ${dead.length}.`
      );
    }

    return { processed, pending: remaining.length, dead: dead.length };
  } catch (err) {
    stats.lastError = err.message;
    stats.lastRun = new Date().toISOString();
    saveState();

    logger.error(`[QueueService] processQueue failed: ${err.message}`);
    return { processed: 0, error: err.message };
  } finally {
    processing = false;
  }
}

function getStats() {
  return {
    ...stats,
    processing,
    pending: readPending().length,
    deadLetter: readDeadLetter().length,
    allowedCollections: Array.from(ALLOWED_COLLECTIONS),
  };
}

function getPending() { return readPending(); }
function getDeadLetter() { return readDeadLetter(); }

loadState();
migrateLegacyQueue();

module.exports = {
  addToQueue,
  processQueue,
  getStats,
  getPending,
  getDeadLetter,
  ALLOWED_COLLECTIONS,
};