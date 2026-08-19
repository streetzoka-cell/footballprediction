'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — PIPELINE 33
 * CANONICAL ELO FEATURE EXTRACTION
 * ============================================================
 *
 * Source of truth:
 *   data/processed/master_with_elo.csv
 *
 * Output:
 *   data/ml/features_elo.csv
 *
 * Pipeline 33 does NOT:
 *   - scan historical JSON files
 *   - rebuild match identity
 *   - recalculate ELO
 *   - load a separate ELO index
 *   - modify the canonical MASTER
 *   - modify the Step 32 ELO dataset
 *
 * It is a pure projection of the validated Step 32 dataset.
 *
 * Expected population:
 *   484,354 matches
 *
 * Features:
 *   match_id
 *   date
 *   home_team_id
 *   away_team_id
 *   home_elo_pre
 *   away_elo_pre
 *   elo_diff
 *   target
 *
 * Target:
 *   HOME_WIN
 *   DRAW
 *   AWAY_WIN
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');

const SOURCE_FILE = path.join(
  ROOT,
  'data',
  'processed',
  'master_with_elo.csv'
);

const OUTPUT_DIR = path.join(
  ROOT,
  'data',
  'ml'
);

const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  'features_elo.csv'
);

const TEMP_OUTPUT_FILE = OUTPUT_FILE + '.tmp';

const EXPECTED_ROWS = 484354;

/**
 * ------------------------------------------------------------
 * REQUIRED SOURCE COLUMNS
 * ------------------------------------------------------------
 */

const REQUIRED_COLUMNS = [
  'zokascore_match_id',
  'date',
  'home_team_id',
  'away_team_id',
  'home_score',
  'away_score',
  'home_elo',
  'away_elo'
];

/**
 * ------------------------------------------------------------
 * CSV ESCAPING
 * ------------------------------------------------------------
 */

function csvEscape(value) {
  const text = String(value ?? '');

  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/**
 * ------------------------------------------------------------
 * DATE VALIDATION
 * ------------------------------------------------------------
 */

function isValidDate(value) {
  if (value == null || String(value).trim() === '') {
    return false;
  }

  const time = Date.parse(String(value));

  return Number.isFinite(time);
}

/**
 * ------------------------------------------------------------
 * TARGET
 * ------------------------------------------------------------
 */

function getTarget(homeScore, awayScore) {
  if (homeScore > awayScore) {
    return 'HOME_WIN';
  }

  if (homeScore < awayScore) {
    return 'AWAY_WIN';
  }

  return 'DRAW';
}

/**
 * ------------------------------------------------------------
 * LOAD CSV
 * ------------------------------------------------------------
 */

function loadCsv(file) {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(file)
      .pipe(csv())
      .on('headers', headers => {
        const missing = REQUIRED_COLUMNS.filter(
          column => !headers.includes(column)
        );

        if (missing.length > 0) {
          reject(
            new Error(
              `Step 32 output is missing required columns: ${missing.join(', ')}`
            )
          );
        }
      })
      .on('data', row => {
        rows.push(row);
      })
      .on('end', () => {
        resolve(rows);
      })
      .on('error', error => {
        reject(error);
      });
  });
}

/**
 * ------------------------------------------------------------
 * MAIN
 * ------------------------------------------------------------
 */

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 33: CANONICAL ELO FEATURE EXTRACTION');
  console.log('============================================================');
  console.log();

  /**
   * ----------------------------------------------------------
   * [1/5] SOURCE CHECK
   * ----------------------------------------------------------
   */

  console.log('[1/5] Checking Step 32 output...');

  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(
      `Step 32 output not found:\n${SOURCE_FILE}`
    );
  }

  console.log(`   ↳ Source: ${SOURCE_FILE}`);

  /**
   * ----------------------------------------------------------
   * [2/5] LOAD AUTHORITATIVE ELO DATASET
   * ----------------------------------------------------------
   */

  console.log('\n[2/5] Loading master_with_elo.csv...');

  const rows = await loadCsv(SOURCE_FILE);

  console.log(
    `   ↳ Rows loaded: ${rows.length.toLocaleString()}`
  );

  if (rows.length !== EXPECTED_ROWS) {
    throw new Error(
      `STEP 32 POPULATION MISMATCH: expected ${EXPECTED_ROWS.toLocaleString()} rows, got ${rows.length.toLocaleString()}.`
    );
  }

  console.log(
    `   ✅ Exact expected population: ${EXPECTED_ROWS.toLocaleString()}`
  );

  /**
   * ----------------------------------------------------------
   * [3/5] STRICT SOURCE VALIDATION
   * ----------------------------------------------------------
   */

  console.log('\n[3/5] Strictly validating Step 32 dataset...');

  const matchIds = new Set();

  let invalidRows = 0;
  let invalidDates = 0;
  let invalidScores = 0;
  let invalidElos = 0;
  let missingTeamIds = 0;
  let duplicateMatchIds = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const rowNumber = i + 2; // header = row 1

    /**
     * Match ID
     */
    const matchId = String(
      row.zokascore_match_id ?? ''
    ).trim();

    if (!matchId) {
      invalidRows++;

      throw new Error(
        `Invalid row ${rowNumber}: missing zokascore_match_id.`
      );
    }

    if (matchIds.has(matchId)) {
      duplicateMatchIds++;

      throw new Error(
        `Duplicate Match ID detected at CSV row ${rowNumber}: ${matchId}`
      );
    }

    matchIds.add(matchId);

    /**
     * Team IDs
     */
    const homeTeamId = String(
      row.home_team_id ?? ''
    ).trim();

    const awayTeamId = String(
      row.away_team_id ?? ''
    ).trim();

    if (!homeTeamId || !awayTeamId) {
      missingTeamIds++;

      throw new Error(
        `Invalid row ${rowNumber}: missing canonical team ID.`
      );
    }

    if (homeTeamId === awayTeamId) {
      throw new Error(
        `Invalid row ${rowNumber}: self-match detected for ${matchId}.`
      );
    }

    /**
     * Date
     */
    if (!isValidDate(row.date)) {
      invalidDates++;

      throw new Error(
        `Invalid row ${rowNumber}: invalid date for Match ID ${matchId}: ${row.date}`
      );
    }

    /**
     * Scores
     */
    const homeScore = Number(row.home_score);
    const awayScore = Number(row.away_score);

    if (
      !Number.isFinite(homeScore) ||
      !Number.isFinite(awayScore)
    ) {
      invalidScores++;

      throw new Error(
        `Invalid row ${rowNumber}: invalid score for Match ID ${matchId}.`
      );
    }

    /**
     * Football scores must be non-negative integers.
     */
    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      invalidScores++;

      throw new Error(
        `Invalid row ${rowNumber}: invalid football score for Match ID ${matchId}: ${homeScore}-${awayScore}`
      );
    }

    /**
     * ELO
     */
    const homeElo = Number(row.home_elo);
    const awayElo = Number(row.away_elo);

    if (
      !Number.isFinite(homeElo) ||
      !Number.isFinite(awayElo)
    ) {
      invalidElos++;

      throw new Error(
        `Invalid row ${rowNumber}: invalid pre-match ELO for Match ID ${matchId}.`
      );
    }

    /**
     * ELO values should be finite real numbers.
     */
    if (
      !Number.isFinite(homeElo - awayElo)
    ) {
      invalidElos++;

      throw new Error(
        `Invalid row ${rowNumber}: invalid ELO difference for Match ID ${matchId}.`
      );
    }
  }

  if (matchIds.size !== EXPECTED_ROWS) {
    throw new Error(
      `Match ID accounting failure: expected ${EXPECTED_ROWS}, got ${matchIds.size}.`
    );
  }

  console.log('   ✅ Match IDs present');
  console.log('   ✅ Match IDs unique');
  console.log('   ✅ Canonical team IDs present');
  console.log('   ✅ Dates valid');
  console.log('   ✅ Scores valid');
  console.log('   ✅ Pre-match ELO values valid');
  console.log(
    `   ✅ Validated ${rows.length.toLocaleString()} rows`
  );

  /**
   * ----------------------------------------------------------
   * [4/5] BUILD FEATURE DATASET
   * ----------------------------------------------------------
   */

  console.log('\n[4/5] Extracting ML features...');

  const outputLines = [];

  outputLines.push(
    'match_id,date,home_team_id,away_team_id,home_elo_pre,away_elo_pre,elo_diff,target'
  );

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  for (const row of rows) {
    const matchId = String(
      row.zokascore_match_id
    ).trim();

    const cleanDate = String(
      row.date
    ).split('T')[0];

    const homeTeamId = String(
      row.home_team_id
    ).trim();

    const awayTeamId = String(
      row.away_team_id
    ).trim();

    const homeScore = Number(row.home_score);
    const awayScore = Number(row.away_score);

    const homeElo = Number(row.home_elo);
    const awayElo = Number(row.away_elo);

    const eloDiff = homeElo - awayElo;

    const target = getTarget(
      homeScore,
      awayScore
    );

    if (target === 'HOME_WIN') {
      homeWins++;
    } else if (target === 'DRAW') {
      draws++;
    } else {
      awayWins++;
    }

    outputLines.push([
      csvEscape(matchId),
      csvEscape(cleanDate),
      csvEscape(homeTeamId),
      csvEscape(awayTeamId),
      homeElo.toFixed(2),
      awayElo.toFixed(2),
      eloDiff.toFixed(2),
      target
    ].join(','));
  }

  const featureRows = outputLines.length - 1;

  /**
   * ----------------------------------------------------------
   * FINAL FEATURE ACCOUNTING
   * ----------------------------------------------------------
   */

  if (featureRows !== EXPECTED_ROWS) {
    throw new Error(
      `FEATURE ROW COUNT FAILURE: expected ${EXPECTED_ROWS}, generated ${featureRows}.`
    );
  }

  const resultTotal =
    homeWins +
    draws +
    awayWins;

  if (resultTotal !== EXPECTED_ROWS) {
    throw new Error(
      `TARGET ACCOUNTING FAILURE: HOME_WIN + DRAW + AWAY_WIN = ${resultTotal}, expected ${EXPECTED_ROWS}.`
    );
  }

  /**
   * ----------------------------------------------------------
   * [5/5] WRITE + RELOAD VALIDATION
   * ----------------------------------------------------------
   */

  console.log('\n[5/5] Writing ML feature dataset...');

  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true
  });

  fs.writeFileSync(
    TEMP_OUTPUT_FILE,
    outputLines.join('\n') + '\n',
    'utf8'
  );

  /**
   * Reload the generated file and verify exact population.
   */
  const verificationRows = await loadCsv(
    TEMP_OUTPUT_FILE
  );

  if (verificationRows.length !== EXPECTED_ROWS) {
    throw new Error(
      `OUTPUT VALIDATION FAILURE: expected ${EXPECTED_ROWS.toLocaleString()} rows, got ${verificationRows.length.toLocaleString()}.`
    );
  }

  /**
   * Verify generated feature columns.
   */
  const firstRow = verificationRows[0];

  const requiredOutputColumns = [
    'match_id',
    'date',
    'home_team_id',
    'away_team_id',
    'home_elo_pre',
    'away_elo_pre',
    'elo_diff',
    'target'
  ];

  for (const column of requiredOutputColumns) {
    if (!Object.prototype.hasOwnProperty.call(firstRow, column)) {
      throw new Error(
        `OUTPUT VALIDATION FAILURE: missing feature column "${column}".`
      );
    }
  }

  /**
   * Verify generated Match IDs remain unique.
   */
  const outputMatchIds = new Set();

  for (const row of verificationRows) {
    const id = String(row.match_id).trim();

    if (!id) {
      throw new Error(
        'OUTPUT VALIDATION FAILURE: empty match_id detected.'
      );
    }

    if (outputMatchIds.has(id)) {
      throw new Error(
        `OUTPUT VALIDATION FAILURE: duplicate match_id detected: ${id}`
      );
    }

    outputMatchIds.add(id);

    if (
      row.target !== 'HOME_WIN' &&
      row.target !== 'DRAW' &&
      row.target !== 'AWAY_WIN'
    ) {
      throw new Error(
        `OUTPUT VALIDATION FAILURE: invalid target "${row.target}" for Match ID ${id}.`
      );
    }

    if (
      !Number.isFinite(Number(row.home_elo_pre)) ||
      !Number.isFinite(Number(row.away_elo_pre)) ||
      !Number.isFinite(Number(row.elo_diff))
    ) {
      throw new Error(
        `OUTPUT VALIDATION FAILURE: invalid ELO feature for Match ID ${id}.`
      );
    }
  }

  if (outputMatchIds.size !== EXPECTED_ROWS) {
    throw new Error(
      `OUTPUT MATCH ID COUNT FAILURE: expected ${EXPECTED_ROWS}, got ${outputMatchIds.size}.`
    );
  }

  /**
   * Atomic replacement.
   */
  fs.renameSync(
    TEMP_OUTPUT_FILE,
    OUTPUT_FILE
  );

  console.log();
  console.log('============================================================');
  console.log(' STEP 33 COMPLETE: PASS');
  console.log('============================================================');
  console.log(
    `📊 Source rows:           ${rows.length.toLocaleString()}`
  );
  console.log(
    `📊 Feature rows:          ${featureRows.toLocaleString()}`
  );
  console.log(
    `📊 Unique Match IDs:      ${outputMatchIds.size.toLocaleString()}`
  );
  console.log(
    `📊 Home wins:             ${homeWins.toLocaleString()}`
  );
  console.log(
    `📊 Draws:                 ${draws.toLocaleString()}`
  );
  console.log(
    `📊 Away wins:             ${awayWins.toLocaleString()}`
  );
  console.log(
    `📁 Features:              ${OUTPUT_FILE}`
  );
  console.log();
  console.log('🔒 Step 32 ELO dataset was NOT modified.');
  console.log('🔒 Historical JSON files were NOT scanned.');
  console.log('🔒 No ELO was recalculated.');
  console.log('🔒 No team identity was re-resolved.');
  console.log(
    '🔒 Feature population exactly matches Step 32: 484,354.'
  );
  console.log('============================================================');
}

/**
 * ------------------------------------------------------------
 * ERROR HANDLING
 * ------------------------------------------------------------
 */

main().catch(error => {
  if (fs.existsSync(TEMP_OUTPUT_FILE)) {
    try {
      fs.unlinkSync(TEMP_OUTPUT_FILE);
    } catch {
      // Ignore cleanup failure.
    }
  }

  console.error();
  console.error('❌ PIPELINE 33 FAILED');
  console.error('------------------------------------------------------------');
  console.error(error.message);
  console.error('------------------------------------------------------------');

  process.exit(1);
});