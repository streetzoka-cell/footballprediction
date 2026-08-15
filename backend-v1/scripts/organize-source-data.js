'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const MANIFEST_PATH = path.join(SOURCE_DIR, 'source-manifest.json');

const CSV_FILES = [
  'appearances.csv',
  'clubs.csv',
  'competitions.csv',
  'former_names.csv',
  'game_events.csv',
  'games.csv',
  'goalscorers.csv',
  'goalscorers_update.csv',
  'matches.csv',
  'player_valuations.csv',
  'players.csv',
  'ranking.csv',
  'results.csv',
  'results_update.csv',
  'shootouts.csv',
  'shootouts_update.csv',
  'EloRatings.csv'
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function countLines(filePath) {
  const buffer = fs.readFileSync(filePath);

  if (buffer.length === 0) return 0;

  let lines = 1;

  for (const byte of buffer) {
    if (byte === 0x0A) lines++;
  }

  return lines;
}

function inspectFile(filePath) {
  const stat = fs.statSync(filePath);

  return {
    sizeBytes: stat.size,
    sha256: sha256(filePath),
    lineCount: countLines(filePath),
    modifiedAt: stat.mtime.toISOString()
  };
}

function establishSource(file) {
  const src = path.join(ROOT, file);
  const dest = path.join(SOURCE_DIR, file);

  if (!fs.existsSync(src)) {
    console.warn(`⚠️ Missing: ${file}`);
    return {
      file,
      status: 'missing'
    };
  }

  // If already in source/, verify it rather than touching it.
  if (fs.existsSync(dest)) {
    const sourceInfo = inspectFile(dest);

    console.log(`ℹ️ Already exists: data/source/${file}`);
    console.log(`   SHA256: ${sourceInfo.sha256}`);

    return {
      file,
      status: 'already_present',
      source: sourceInfo
    };
  }

  const before = inspectFile(src);

  // IMPORTANT:
  // Use rename rather than read/write so the original bytes
  // remain untouched.
  fs.renameSync(src, dest);

  const after = inspectFile(dest);

  if (before.sha256 !== after.sha256) {
    throw new Error(
      `HASH MISMATCH after moving ${file}: ` +
      `${before.sha256} !== ${after.sha256}`
    );
  }

  console.log(`✅ Established source: ${file}`);
  console.log(`   Size:   ${after.sizeBytes.toLocaleString()} bytes`);
  console.log(`   Lines:  ${after.lineCount.toLocaleString()}`);
  console.log(`   SHA256: ${after.sha256}`);

  return {
    file,
    status: 'established',
    source: after
  };
}

console.log('============================================================');
console.log(' ZOKASCORE — PHASE 1: ESTABLISH IMMUTABLE SOURCE DATA');
console.log('============================================================');

ensureDir(SOURCE_DIR);

const results = [];

for (const file of CSV_FILES) {
  try {
    results.push(establishSource(file));
  } catch (error) {
    console.error(`❌ FAILED: ${file}`);
    console.error(`   ${error.message}`);

    results.push({
      file,
      status: 'error',
      error: error.message
    });
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  purpose: 'Immutable source data baseline for ZOKASCORE data rebuild',
  sourceDirectory: 'data/source',
  files: results
};

fs.writeFileSync(
  MANIFEST_PATH,
  JSON.stringify(manifest, null, 2),
  'utf8'
);

console.log('\n============================================================');
console.log(' PHASE 1 COMPLETE');
console.log('============================================================');

console.log(`📁 Source:   ${SOURCE_DIR}`);
console.log(`📋 Manifest: ${MANIFEST_PATH}`);

const established = results.filter(
  r => r.status === 'established'
).length;

const existing = results.filter(
  r => r.status === 'already_present'
).length;

const missing = results.filter(
  r => r.status === 'missing'
).length;

const errors = results.filter(
  r => r.status === 'error'
).length;

console.log('');
console.log(`Established: ${established}`);
console.log(`Existing:    ${existing}`);
console.log(`Missing:     ${missing}`);
console.log(`Errors:      ${errors}`);

if (errors > 0) {
  console.error('\n⚠️ Phase 1 completed with errors.');
  process.exitCode = 1;
} else {
  console.log('\n✅ Immutable source layer established.');
  console.log('🔒 Original CSV bytes were preserved.');
  console.log('📋 SHA-256 manifest created.');
}