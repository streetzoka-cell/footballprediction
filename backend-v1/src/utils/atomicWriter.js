// backend-v1/src/utils/atomicWriter.js
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function buildTmpPath(filePath) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${filePath}.${process.pid}.${Date.now()}.${random}.tmp`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isLockError = (err) =>
  err && (err.code === 'EPERM' || err.code === 'EACCES');

/**
 * ★ Windows-safe rename.
 * On Windows, rename over a destination another process holds open
 * (Defender scan, indexer, in-flight HTTP read) fails instantly with
 * EPERM. Retry with backoff; as a last resort delete-then-rename,
 * which Node can do because it opens files with share-delete.
 */
async function renameAtomic(tmpPath, destPath, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      await fsp.rename(tmpPath, destPath);
      return;
    } catch (err) {
      if (!isLockError(err) || i === attempts - 1) {
        // Non-lock error, or retries exhausted — try the unlink fallback
        // once before giving up (only makes sense for lock errors).
        if (isLockError(err)) {
          await fsp.unlink(destPath).catch(() => {});
          await fsp.rename(tmpPath, destPath);
          return;
        }
        throw err;
      }
      await sleep(100 * (i + 1)); // 100, 200, 300, 400 ms
    }
  }
}

/** Sync twin for legacy stores. */
function renameAtomicSync(tmpPath, destPath, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.renameSync(tmpPath, destPath);
      return;
    } catch (err) {
      if (!isLockError(err) || i === attempts - 1) {
        if (isLockError(err)) {
          try { fs.unlinkSync(destPath); } catch { /* dest may not exist */ }
          fs.renameSync(tmpPath, destPath);
          return;
        }
        throw err;
      }
      const wait = 100 * (i + 1);
      const end = Date.now() + wait;
      while (Date.now() < end) { /* busy-wait: sync context */ }
    }
  }
}

/**
 * Safely writes JSON atomically:
 * 1. Write to temporary file
 * 2. Rename temporary file to final file (Windows-lock tolerant)
 *
 * This prevents corrupted JSON if the process crashes mid-write,
 * and no longer silently loses a publish on Windows file locks.
 */
async function writeJSONAtomic(filePath, data, options = {}) {
  const { pretty = false } = options;

  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  const tmpPath = buildTmpPath(filePath);

  await fsp.writeFile(tmpPath, json, 'utf8');
  try {
    await renameAtomic(tmpPath, filePath);
  } catch (err) {
    // Never leave .tmp litter behind on hard failure
    await fsp.unlink(tmpPath).catch(() => {});
    throw err;
  }

  return {
    bytes: Buffer.byteLength(json, 'utf8'),
  };
}

/**
 * Sync version for legacy stores that currently use fs.writeFileSync.
 */
function writeJSONAtomicSync(filePath, data, options = {}) {
  const { pretty = false } = options;

  const dir = path.dirname(filePath);
  ensureDirSync(dir);

  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  const tmpPath = buildTmpPath(filePath);

  fs.writeFileSync(tmpPath, json, 'utf8');
  try {
    renameAtomicSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }

  return {
    bytes: Buffer.byteLength(json, 'utf8'),
  };
}

async function readJSONSafe(filePath, fallback = null) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readJSONSafeSync(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

module.exports = {
  ensureDir,
  ensureDirSync,
  writeJSONAtomic,
  writeJSONAtomicSync,
  readJSONSafe,
  readJSONSafeSync,
  renameAtomic,       // exported for other writers that roll their own
  renameAtomicSync,
};