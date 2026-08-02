// backend-v1/src/services/RecoveryService.js

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const {
  ensureDirSync,
  readJSONSafeSync,
  writeJSONAtomicSync,
} = require('../utils/atomicWriter');

const ROOT = process.cwd();

const PUBLIC_DATA_DIR = path.join(ROOT, 'public_data');
const FIXTURES_DIR = path.join(PUBLIC_DATA_DIR, 'fixtures');
const RESULTS_DIR = path.join(PUBLIC_DATA_DIR, 'results');
const FEATURED_PUBLIC_DIR = path.join(PUBLIC_DATA_DIR, 'featured');
const ZOKA_PUBLIC_DIR = path.join(PUBLIC_DATA_DIR, 'zokapicks');
const LEADERBOARD_PUBLIC_DIR = path.join(PUBLIC_DATA_DIR, 'leaderboard');
const DAILY_LEADERBOARD_PUBLIC_DIR = path.join(LEADERBOARD_PUBLIC_DIR, 'daily');

const DATA_DIR = path.join(ROOT, 'data');
const QUEUE_DIR = path.join(DATA_DIR, 'queue');
const USER_PREDICTIONS_DIR = path.join(DATA_DIR, 'user-predictions');
const USER_PREDICTIONS_WAL_DIR = path.join(USER_PREDICTIONS_DIR, 'wal');
const USER_PREDICTIONS_STORE_DIR = path.join(USER_PREDICTIONS_DIR, 'store');
const USER_PREDICTIONS_RECEIPTS_DIR = path.join(USER_PREDICTIONS_DIR, 'receipts');
const FEATURED_DATA_DIR = path.join(DATA_DIR, 'featured');
const ZOKA_DATA_DIR = path.join(DATA_DIR, 'zokapicks');

const LOGS_DIR = path.join(ROOT, 'logs');

function ensureDir(dir) {
  ensureDirSync(dir);
}

function ensureFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    writeJSONAtomicSync(filePath, fallback, { pretty: false });
  }
}

function countFiles(dir, extension = null) {
  try {
    if (!fs.existsSync(dir)) return 0;

    const files = fs.readdirSync(dir);

    if (!extension) return files.length;

    return files.filter((file) => file.endsWith(extension)).length;
  } catch {
    return 0;
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function getRecoveryStatus() {
  const queuePending = readJSONSafeSync(
    path.join(QUEUE_DIR, 'pending.json'),
    []
  );

  const queueDeadLetter = readJSONSafeSync(
    path.join(QUEUE_DIR, 'dead-letter.json'),
    []
  );

  return {
    timestamp: new Date().toISOString(),
    directories: {
      publicData: fileExists(PUBLIC_DATA_DIR),
      fixtures: fileExists(FIXTURES_DIR),
      results: fileExists(RESULTS_DIR),
      featuredPublic: fileExists(FEATURED_PUBLIC_DIR),
      zokaPublic: fileExists(ZOKA_PUBLIC_DIR),
      leaderboardPublic: fileExists(LEADERBOARD_PUBLIC_DIR),
      queue: fileExists(QUEUE_DIR),
      userPredictions: fileExists(USER_PREDICTIONS_DIR),
      userPredictionsWal: fileExists(USER_PREDICTIONS_WAL_DIR),
      featuredData: fileExists(FEATURED_DATA_DIR),
      zokaData: fileExists(ZOKA_DATA_DIR),
      logs: fileExists(LOGS_DIR),
    },
    queue: {
      pending: Array.isArray(queuePending) ? queuePending.length : 0,
      deadLetter: Array.isArray(queueDeadLetter) ? queueDeadLetter.length : 0,
    },
    userPredictions: {
      walFiles: countFiles(USER_PREDICTIONS_WAL_DIR, '.jsonl'),
      storeFiles: countFiles(USER_PREDICTIONS_STORE_DIR, '.json'),
      receiptFiles: countFiles(USER_PREDICTIONS_RECEIPTS_DIR, '.json'),
    },
    snapshots: {
      liveJson: fileExists(path.join(PUBLIC_DATA_DIR, 'live.json')),
      standingsJson: fileExists(path.join(PUBLIC_DATA_DIR, 'standings.json')),
      predictionsJson: fileExists(path.join(PUBLIC_DATA_DIR, 'predictions.json')),
      featuredFiles: countFiles(FEATURED_PUBLIC_DIR, '.json'),
      zokaFiles: countFiles(ZOKA_PUBLIC_DIR, '.json'),
      dailyLeaderboardFiles: countFiles(DAILY_LEADERBOARD_PUBLIC_DIR, '.json'),
    },
  };
}

async function runStartupChecks() {
  logger.info('[Recovery] Running startup checks...');

  ensureDir(PUBLIC_DATA_DIR);
  ensureDir(FIXTURES_DIR);
  ensureDir(RESULTS_DIR);
  ensureDir(FEATURED_PUBLIC_DIR);
  ensureDir(ZOKA_PUBLIC_DIR);
  ensureDir(LEADERBOARD_PUBLIC_DIR);
  ensureDir(DAILY_LEADERBOARD_PUBLIC_DIR);

  ensureDir(DATA_DIR);
  ensureDir(QUEUE_DIR);
  ensureDir(USER_PREDICTIONS_DIR);
  ensureDir(USER_PREDICTIONS_WAL_DIR);
  ensureDir(USER_PREDICTIONS_STORE_DIR);
  ensureDir(USER_PREDICTIONS_RECEIPTS_DIR);
  ensureDir(FEATURED_DATA_DIR);
  ensureDir(ZOKA_DATA_DIR);

  ensureDir(LOGS_DIR);

  ensureFile(path.join(QUEUE_DIR, 'pending.json'), []);
  ensureFile(path.join(QUEUE_DIR, 'dead-letter.json'), []);
  ensureFile(path.join(QUEUE_DIR, 'state.json'), {
    lastSyncAt: null,
    lastFailedAt: null,
    lastError: null,
    syncedOps: 0,
  });

  ensureFile(path.join(PUBLIC_DATA_DIR, 'live.json'), {
    data: [],
    count: 0,
  });

  ensureFile(path.join(PUBLIC_DATA_DIR, 'predictions.json'), {});

  const status = getRecoveryStatus();

  logger.info(
    `[Recovery] Startup checks complete. ` +
    `Queue pending: ${status.queue.pending}, ` +
    `WAL files: ${status.userPredictions.walFiles}, ` +
    `Featured snapshots: ${status.snapshots.featuredFiles}, ` +
    `Zoka snapshots: ${status.snapshots.zokaFiles}`
  );

  return status;
}

module.exports = {
  runStartupChecks,
  getRecoveryStatus,
};