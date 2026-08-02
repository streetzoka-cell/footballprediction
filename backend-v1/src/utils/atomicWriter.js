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

/**
 * Safely writes JSON atomically:
 * 1. Write to temporary file
 * 2. Rename temporary file to final file
 *
 * This prevents corrupted JSON if the process crashes mid-write.
 */
async function writeJSONAtomic(filePath, data, options = {}) {
  const { pretty = false } = options;

  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  const tmpPath = buildTmpPath(filePath);

  await fsp.writeFile(tmpPath, json, 'utf8');
  await fsp.rename(tmpPath, filePath);

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
  fs.renameSync(tmpPath, filePath);

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
};