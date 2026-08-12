'use strict';

/**
 * ============================================================
 * ZOKASCORE — SAFE WORLD CUP HISTORY REPAIR
 * ============================================================
 *
 * PURPOSE
 * -------
 * Repairs historical team-name mutations created by the old
 * normalize-teams.js script.
 *
 * SAFE RULES
 * ----------
 * 1. Creates a complete backup before changing anything.
 * 2. Only restores names when *_historical already exists.
 * 3. Never guesses historical identities.
 * 4. Never changes scores, dates, rounds, venues or hosts.
 * 5. Preserves the previous normalized name as *_normalized.
 * 6. Does NOT delete *_historical fields.
 * 7. Processes only World Cup history match files.
 *
 * EXAMPLE
 * -------
 * BEFORE:
 *
 * {
 *   "home_team": "Serbia",
 *   "home_team_historical": "Yugoslavia"
 * }
 *
 * AFTER:
 *
 * {
 *   "home_team": "Yugoslavia",
 *   "home_team_historical": "Yugoslavia",
 *   "home_team_normalized": "Serbia"
 * }
 *
 * This keeps old information and restores the historically
 * correct match identity.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const WORLD_CUP_DIR = path.join(
  ROOT,
  'public_data',
  'knowledge',
  'football',
  'history',
  'world_cup'
);

const BACKUP_ROOT = path.join(
  ROOT,
  'backups',
  'world_cup-history-repair'
);

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');

const BACKUP_DIR = path.join(
  BACKUP_ROOT,
  timestamp
);

let filesScanned = 0;
let filesChanged = 0;
let matchesScanned = 0;
let matchesChanged = 0;
let homeRestored = 0;
let awayRestored = 0;

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirectory(source, destination) {
  ensureDirectory(destination);

  const entries = fs.readdirSync(source, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

function walkJsonFiles(dir) {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...walkJsonFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.json')
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

function restoreTeam(match, side) {
  const currentKey = `${side}_team`;
  const historicalKey = `${side}_team_historical`;
  const normalizedKey = `${side}_team_normalized`;

  const current = match[currentKey];
  const historical = match[historicalKey];

  if (
    typeof current !== 'string' ||
    typeof historical !== 'string' ||
    !historical.trim()
  ) {
    return false;
  }

  const historicalName = historical.trim();
  const currentName = current.trim();

  // Already correct.
  if (currentName === historicalName) {
    return false;
  }

  // Preserve what the old normalizer changed it FROM.
  if (!match[normalizedKey]) {
    match[normalizedKey] = currentName;
  }

  // Restore the historically correct participant name.
  match[currentKey] = historicalName;

  return true;
}

console.log('');
console.log('============================================================');
console.log(' ZOKASCORE — SAFE WORLD CUP HISTORY REPAIR');
console.log('============================================================');
console.log('');

console.log(`World Cup directory:`);
console.log(WORLD_CUP_DIR);
console.log('');

if (!fs.existsSync(WORLD_CUP_DIR)) {
  fail('World Cup history directory does not exist.');
}

/**
 * ------------------------------------------------------------
 * STEP 1 — BACKUP
 * ------------------------------------------------------------
 */

console.log('[1/5] Creating backup...');

ensureDirectory(BACKUP_ROOT);

copyDirectory(
  WORLD_CUP_DIR,
  BACKUP_DIR
);

console.log(`✅ Backup created:`);
console.log(BACKUP_DIR);
console.log('');

/**
 * ------------------------------------------------------------
 * STEP 2 — DISCOVER FILES
 * ------------------------------------------------------------
 */

console.log('[2/5] Scanning World Cup JSON files...');

const jsonFiles = walkJsonFiles(WORLD_CUP_DIR);

console.log(`Found ${jsonFiles.length} JSON files.`);
console.log('');

/**
 * ------------------------------------------------------------
 * STEP 3 — REPAIR EXPLICIT HISTORICAL NAMES
 * ------------------------------------------------------------
 */

console.log('[3/5] Restoring explicit historical team names...');
console.log('');

for (const filePath of jsonFiles) {
  filesScanned++;

  let parsed;

  try {
    parsed = JSON.parse(
      fs.readFileSync(filePath, 'utf8')
    );
  } catch (error) {
    console.error(
      `⚠️ Could not parse ${filePath}: ${error.message}`
    );
    continue;
  }

  if (
    !parsed ||
    !Array.isArray(parsed.matches)
  ) {
    continue;
  }

  let changed = false;
  let fileChanges = 0;

  for (const match of parsed.matches) {
    if (!match || typeof match !== 'object') {
      continue;
    }

    matchesScanned++;

    const original = JSON.stringify(match);

    if (restoreTeam(match, 'home')) {
      homeRestored++;
      fileChanges++;
    }

    if (restoreTeam(match, 'away')) {
      awayRestored++;
      fileChanges++;
    }

    if (JSON.stringify(match) !== original) {
      changed = true;
      matchesChanged++;
    }
  }

  if (changed) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(parsed, null, 2) + '\n',
      'utf8'
    );

    filesChanged++;

    console.log(
      `✅ ${path.relative(ROOT, filePath)}`
    );

    console.log(
      `   Restored fields: ${fileChanges}`
    );
  }
}

console.log('');

/**
 * ------------------------------------------------------------
 * STEP 4 — REPORT
 * ------------------------------------------------------------
 */

console.log('[4/5] Repair summary...');
console.log('');

console.log(`Files scanned:             ${filesScanned}`);
console.log(`Files changed:             ${filesChanged}`);
console.log(`Matches scanned:           ${matchesScanned}`);
console.log(`Matches changed:           ${matchesChanged}`);
console.log(`Home names restored:       ${homeRestored}`);
console.log(`Away names restored:       ${awayRestored}`);
console.log('');

if (matchesChanged === 0) {
  console.log(
    'ℹ️ No explicit historical-name mutations were found.'
  );
} else {
  console.log(
    '✅ Historical names restored from existing metadata.'
  );
}

console.log('');

/**
 * ------------------------------------------------------------
 * STEP 5 — SAFETY MESSAGE
 * ------------------------------------------------------------
 */

console.log('[5/5] Safety verification...');
console.log('');

console.log('No score fields were modified.');
console.log('No round fields were modified.');
console.log('No venue fields were modified.');
console.log('No host fields were modified.');
console.log('No matches were deleted.');
console.log('No duplicate matches were removed.');
console.log('No historical names were guessed.');
console.log('');

console.log('============================================================');
console.log(' REPAIR COMPLETE');
console.log('============================================================');
console.log('');

console.log(`Backup: ${BACKUP_DIR}`);
console.log('');

console.log(
  'Next step: run the Brazil–Germany 2014 diagnostic again.'
);

console.log('');
