'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — PIPELINE 33
 * CANONICAL ELO FEATURE EXTRACTION
 * ============================================================
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

const REQUIRED_COLUMNS = [
  'zokascore_match_id',
  'date',
  'home_team_id',
  'away_team_id',
  'home_score',
  'away_score',
  'home_elo_pre',     // ← FIXED: was 'home_elo'
  'away_elo_pre'      // ← FIXED: was 'away_elo'
];

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

function isValidDate(value) {
  if (value == null || String(value).trim() === '') {
    return false;
  }
  const time = Date.parse(String(value));
  return Number.isFinite(time);
}

function getTarget(homeScore, awayScore) {
  if (homeScore > awayScore) return 'HOME_WIN';
  if (homeScore < awayScore) return 'AWAY_WIN';
  return 'DRAW';
}

function loadCsv(file) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(file)
      .pipe(csv())
      .on('headers', headers => {
        // ★ FIX: Trim invisible spaces/BOM from headers
        const trimmedHeaders = headers.map(h => h.trim());
        
        const missing = REQUIRED_COLUMNS.filter(
          column => !trimmedHeaders.includes(column)
        );
        if (missing.length > 0) {
          reject(
            new Error(
              `Step 32 output is missing required columns: ${missing.join(', ')}`
            )
          );
        }
      })
      .on('data', row => { rows.push(row); })
      .on('end', () => { resolve(rows); })
      .on('error', error => { reject(error); });
  });
}


async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 33: CANONICAL ELO FEATURE EXTRACTION');
  console.log('============================================================\n');

  console.log('[1/5] Checking Step 32 output...');
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Step 32 output not found:\n${SOURCE_FILE}`);
  }
  console.log(`   ↳ Source: ${SOURCE_FILE}`);

  console.log('\n[2/5] Loading master_with_elo.csv...');
  const rows = await loadCsv(SOURCE_FILE);
  console.log(`   ↳ Rows loaded: ${rows.length.toLocaleString()}`);

  console.log('\n[3/5] Strictly validating Step 32 dataset...');
  const matchIds = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    const matchId = String(row.zokascore_match_id ?? '').trim();
    if (!matchId) {
      throw new Error(`Invalid row ${rowNumber}: missing zokascore_match_id.`);
    }
    if (matchIds.has(matchId)) {
      throw new Error(`Duplicate Match ID at CSV row ${rowNumber}: ${matchId}`);
    }
    matchIds.add(matchId);

    const homeTeamId = String(row.home_team_id ?? '').trim();
    const awayTeamId = String(row.away_team_id ?? '').trim();
    if (!homeTeamId || !awayTeamId) {
      throw new Error(`Invalid row ${rowNumber}: missing canonical team ID.`);
    }
    if (homeTeamId === awayTeamId) {
      throw new Error(`Invalid row ${rowNumber}: self-match for ${matchId}.`);
    }

    if (!isValidDate(row.date)) {
      throw new Error(`Invalid row ${rowNumber}: invalid date for ${matchId}: ${row.date}`);
    }

    const homeScore = Number(row.home_score);
    const awayScore = Number(row.away_score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
      throw new Error(`Invalid row ${rowNumber}: invalid score for ${matchId}.`);
    }
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) ||
        homeScore < 0 || awayScore < 0) {
      throw new Error(`Invalid row ${rowNumber}: invalid football score for ${matchId}: ${homeScore}-${awayScore}`);
    }

    // ← FIXED: was row.home_elo / row.away_elo
    const homeElo = Number(row.home_elo_pre);
    const awayElo = Number(row.away_elo_pre);
    if (!Number.isFinite(homeElo) || !Number.isFinite(awayElo)) {
      throw new Error(`Invalid row ${rowNumber}: invalid pre-match ELO for ${matchId}.`);
    }
    if (!Number.isFinite(homeElo - awayElo)) {
      throw new Error(`Invalid row ${rowNumber}: invalid ELO difference for ${matchId}.`);
    }
  }

  if (matchIds.size !== rows.length) {
    throw new Error(`Match ID accounting failure: ${matchIds.size} vs ${rows.length}.`);
  }

  console.log('   ✅ Match IDs present and unique');
  console.log('   ✅ Canonical team IDs present');
  console.log('   ✅ Dates valid');
  console.log('   ✅ Scores valid');
  console.log('   ✅ Pre-match ELO values valid');
  console.log(`   ✅ Validated ${rows.length.toLocaleString()} rows`);

  console.log('\n[4/5] Extracting ML features...');
  const outputLines = [];
  outputLines.push(
    'match_id,date,home_team_id,away_team_id,home_elo_pre,away_elo_pre,elo_diff,target'
  );

  let homeWins = 0, draws = 0, awayWins = 0;

  for (const row of rows) {
    const matchId = String(row.zokascore_match_id).trim();
    const cleanDate = String(row.date).split('T')[0];
    const homeTeamId = String(row.home_team_id).trim();
    const awayTeamId = String(row.away_team_id).trim();
    const homeScore = Number(row.home_score);
    const awayScore = Number(row.away_score);

    // ← FIXED: was row.home_elo / row.away_elo
    const homeElo = Number(row.home_elo_pre);
    const awayElo = Number(row.away_elo_pre);
    const eloDiff = homeElo - awayElo;
    const target = getTarget(homeScore, awayScore);

    if (target === 'HOME_WIN') homeWins++;
    else if (target === 'DRAW') draws++;
    else awayWins++;

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
  const resultTotal = homeWins + draws + awayWins;

  if (featureRows !== rows.length) {
    throw new Error(`FEATURE ROW COUNT: ${featureRows} vs source ${rows.length}.`);
  }
  if (resultTotal !== rows.length) {
    throw new Error(`TARGET ACCOUNTING: ${resultTotal} vs ${rows.length}.`);
  }

  console.log('\n[5/5] Writing ML feature dataset...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(TEMP_OUTPUT_FILE, outputLines.join('\n') + '\n', 'utf8');

  const verificationRows = await loadCsv(TEMP_OUTPUT_FILE);
  if (verificationRows.length !== featureRows) {
    throw new Error(`OUTPUT VALIDATION: ${verificationRows.length} vs ${featureRows}.`);
  }

  const firstRow = verificationRows[0];
  const requiredOutputColumns = [
    'match_id', 'date', 'home_team_id', 'away_team_id',
    'home_elo_pre', 'away_elo_pre', 'elo_diff', 'target'
  ];
  for (const column of requiredOutputColumns) {
    if (!Object.prototype.hasOwnProperty.call(firstRow, column)) {
      throw new Error(`OUTPUT VALIDATION: missing column "${column}".`);
    }
  }

  const outputMatchIds = new Set();
  for (const row of verificationRows) {
    const id = String(row.match_id).trim();
    if (!id) throw new Error('OUTPUT VALIDATION: empty match_id.');
    if (outputMatchIds.has(id)) throw new Error(`OUTPUT VALIDATION: duplicate ${id}.`);
    outputMatchIds.add(id);

    if (row.target !== 'HOME_WIN' && row.target !== 'DRAW' && row.target !== 'AWAY_WIN') {
      throw new Error(`OUTPUT VALIDATION: invalid target "${row.target}" for ${id}.`);
    }
    if (!Number.isFinite(Number(row.home_elo_pre)) ||
        !Number.isFinite(Number(row.away_elo_pre)) ||
        !Number.isFinite(Number(row.elo_diff))) {
      throw new Error(`OUTPUT VALIDATION: invalid ELO feature for ${id}.`);
    }
  }

  fs.renameSync(TEMP_OUTPUT_FILE, OUTPUT_FILE);

  console.log('\n============================================================');
  console.log(' STEP 33 COMPLETE: PASS');
  console.log('============================================================');
  console.log(`📊 Source rows:       ${rows.length.toLocaleString()}`);
  console.log(`📊 Feature rows:      ${featureRows.toLocaleString()}`);
  console.log(`📊 Unique Match IDs:  ${outputMatchIds.size.toLocaleString()}`);
  console.log(`📊 Home wins:         ${homeWins.toLocaleString()}`);
  console.log(`📊 Draws:             ${draws.toLocaleString()}`);
  console.log(`📊 Away wins:         ${awayWins.toLocaleString()}`);
  console.log(`📁 Features:          ${OUTPUT_FILE}`);
  console.log('============================================================');
}

main().catch(error => {
  if (fs.existsSync(TEMP_OUTPUT_FILE)) {
    try { fs.unlinkSync(TEMP_OUTPUT_FILE); } catch {}
  }
  console.error('\n❌ PIPELINE 33 FAILED');
  console.error('------------------------------------------------------------');
  console.error(error.message);
  console.error('------------------------------------------------------------');
  process.exit(1);
});