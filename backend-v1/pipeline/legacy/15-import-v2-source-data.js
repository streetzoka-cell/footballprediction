'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 15
 * SOURCE DATA EXPANSION (Robust & Memory-Safe)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser'); // npm install csv-parser

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const EXTRA_CLUB_GAMES = path.join(process.env.USERPROFILE || '', 'Downloads', 'club_games.csv');
const V2_FOOTBALL_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football');
const OUTPUT_DIR = path.join(V2_FOOTBALL_DIR, 'source');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');
const REPORT_FILE = path.join(MIGRATION_DIR, '15-v2-source-import.txt');

const BATCH_SIZE = 10000; // Logical batch size

const DATASETS = [
  { name: 'clubs', files: ['clubs.csv'], output: 'clubs.jsonl', key: row => first(row, ['club_id', 'id', 'clubId']) || composite(row, ['name', 'country']) },
  { name: 'players', files: ['players.csv'], output: 'players.jsonl', key: row => first(row, ['player_id', 'id', 'playerId']) || composite(row, ['name', 'first_name', 'last_name']) },
  { name: 'competitions', files: ['competitions.csv'], output: 'competitions.jsonl', key: row => first(row, ['competition_id', 'id', 'competitionId']) || composite(row, ['name', 'country']) },
  { name: 'former_names', files: ['former_names.csv'], output: 'former_names.jsonl', key: row => first(row, ['id', 'former_name_id']) || composite(row, ['club_id', 'club_name', 'former_name', 'name']) },
  { name: 'elo_ratings', files: ['EloRatings.csv'], output: 'elo_ratings.jsonl', key: row => composite(row, ['date', 'club', 'country', 'elo']) },
  { name: 'rankings', files: ['ranking.csv'], output: 'rankings.jsonl', key: row => composite(row, ['rank_date', 'country_abrv', 'country_full', 'rank']) },
  { name: 'game_events', files: ['game_events.csv'], output: 'game_events.jsonl', key: row => first(row, ['game_event_id', 'id']) || composite(row, ['date', 'game_id', 'minute', 'type', 'club_id', 'player_id', 'description']) },
  { name: 'player_valuations', files: ['player_valuations.csv'], output: 'player_valuations.jsonl', key: row => composite(row, ['player_id', 'date', 'market_value_in_eur', 'current_club_id']) },
  { name: 'appearances', files: ['appearances.csv'], output: 'appearances.jsonl', key: row => first(row, ['appearance_id', 'id']) || composite(row, ['game_id', 'player_id', 'date', 'player_club_id']) },
  { name: 'goalscorers', files: ['goalscorers.csv', 'goalscorers_update.csv'], output: 'goalscorers.jsonl', key: row => composite(row, ['date', 'home_team', 'away_team', 'scorer', 'minute', 'own_goal', 'penalty']) },
  { name: 'shootouts', files: ['shootouts.csv', 'shootouts_update.csv'], output: 'shootouts.jsonl', key: row => composite(row, ['date', 'home_team', 'away_team', 'winner', 'first_shooter']) },
  { name: 'results', files: ['results.csv', 'results_update.csv'], output: 'results.jsonl', key: row => composite(row, ['date', 'home_team', 'away_team', 'home_score', 'away_score', 'tournament']) },
  { name: 'matches', files: ['matches.csv'], output: 'matches.jsonl', key: row => first(row, ['match_id', 'game_id', 'id']) || composite(row, ['date', 'home_team', 'away_team', 'home_score', 'away_score']) },
  { name: 'games', files: ['games.csv'], output: 'games.jsonl', key: row => first(row, ['game_id', 'id']) || composite(row, ['date', 'home_club_id', 'away_club_id']) },
  { name: 'club_games', files: [], externalFiles: [EXTRA_CLUB_GAMES], output: 'club_games.jsonl', key: row => first(row, ['game_id', 'id', 'club_game_id']) || composite(row, ['game_id', 'club_id', 'date']) }
];

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function safeString(value) { return (value === undefined || value === null) ? '' : String(value).trim(); }
function first(row, fields) { for (const f of fields) { const v = safeString(row[f]); if (v) return v; } return ''; }

function composite(row, fields) {
  const parts = fields.map(f => safeString(row[f]));
  // If all parts are empty, fallback to hashing the whole row to prevent false duplicates
  if (parts.every(p => p === '')) {
    return JSON.stringify(row);
  }
  return parts.join('|').toLowerCase();
}

// Safer appendJSONL with 4MB buffer chunking
function appendJSONL(file, rows) {
  if (!rows.length) return;
  let buffer = '';
  for (const row of rows) {
    buffer += JSON.stringify(row) + '\n';
    if (buffer.length >= 4 * 1024 * 1024) { // 4MB
      fs.appendFileSync(file, buffer, 'utf8');
      buffer = '';
    }
  }
  if (buffer) {
    fs.appendFileSync(file, buffer, 'utf8');
  }
}

function readExistingKeys(file) {
  const keys = new Set();
  if (!fs.existsSync(file)) return keys;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.__source_key) keys.add(String(row.__source_key));
    } catch {}
  }
  return keys;
}

function formatNumber(value) { return Number(value || 0).toLocaleString(); }

const report = [];
function reportLine(text = '') { report.push(text); }
function section(title) { reportLine(''); reportLine('-'.repeat(60)); reportLine(title); reportLine('-'.repeat(60)); }

async function processDataset(dataset, totals) {
  section(`DATASET: ${dataset.name}`);
  const outputFile = path.join(OUTPUT_DIR, dataset.output);
  const completeMarker = `${outputFile}.complete`;

  if (fs.existsSync(completeMarker)) {
    console.log(`✅ Skipping ${dataset.name} (already complete)`);
    reportLine(`Status: SKIPPED (already complete)`);
    totals.skipped++;
    return;
  }

  const existingKeys = readExistingKeys(outputFile);
  const sourceFiles = [];
  for (const f of dataset.files || []) sourceFiles.push(path.join(SOURCE_DIR, f));
  for (const f of dataset.externalFiles || []) sourceFiles.push(f);

  const stats = { name: dataset.name, rowsRead: 0, added: 0, duplicatesInSource: 0, alreadyInV2: 0, errors: 0 };
  const seen = new Set();
  let batchRows = [];

  for (const sourceFile of sourceFiles) {
    const rel = path.relative(ROOT, sourceFile);
    console.log(`📥 ${dataset.name}: ${rel}`);

    if (!fs.existsSync(sourceFile)) {
      totals.missingSourceFiles++;
      continue;
    }

    totals.sourceFiles++;
    
    try {
      await new Promise((resolve, reject) => {
        fs.createReadStream(sourceFile)
          .pipe(csv())
          .on('data', (row) => {
            stats.rowsRead++;
            totals.rowsRead++;
            
            const key = dataset.key(row);
            if (!key) return;

            if (seen.has(key)) {
              stats.duplicatesInSource++;
              totals.duplicatesInSource++;
              return;
            }
            seen.add(key);

            if (existingKeys.has(key)) {
              stats.alreadyInV2++;
              totals.alreadyInV2++;
              return;
            }

            row.__source_key = key;
            row.__source_dataset = dataset.name;

            batchRows.push(row);
            existingKeys.add(key);
            stats.added++;
            totals.added++;

            if (batchRows.length >= BATCH_SIZE) {
              appendJSONL(outputFile, batchRows);
              batchRows = [];
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });
    } catch (error) {
      stats.errors++;
      totals.errors++;
      reportLine(`ERROR reading ${rel}: ${error.message}`);
      console.error(`   ❌ ERROR: ${error.message}`);
    }
  }

  // FLUSH REMAINING
  if (batchRows.length > 0) {
    appendJSONL(outputFile, batchRows);
  }

  // MARK COMPLETE
  fs.writeFileSync(completeMarker, new Date().toISOString(), 'utf8');

  console.log(`   ✅ Added ${formatNumber(stats.added)} records`);
  console.log(`   Source rows: ${formatNumber(stats.rowsRead)} | Already V2: ${formatNumber(stats.alreadyInV2)} | Dups: ${formatNumber(stats.duplicatesInSource)}\n`);

  reportLine(`Rows read          : ${formatNumber(stats.rowsRead)}`);
  reportLine(`New records added  : ${formatNumber(stats.added)}`);
  reportLine(`Output             : ${outputFile}`);
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 15 (ROBUST CSV PARSER)');
  console.log('============================================================\n');

  ensureDir(OUTPUT_DIR);
  ensureDir(MIGRATION_DIR);

  const totals = { sourceFiles: 0, missingSourceFiles: 0, rowsRead: 0, duplicatesInSource: 0, alreadyInV2: 0, added: 0, errors: 0, skipped: 0 };

  for (const dataset of DATASETS) {
    await processDataset(dataset, totals);
  }

  section('TOTAL');
  reportLine(`Datasets skipped   : ${formatNumber(totals.skipped)}`);
  reportLine(`Rows read          : ${formatNumber(totals.rowsRead)}`);
  reportLine(`NEW records added  : ${formatNumber(totals.added)}`);
  reportLine(`Already in V2      : ${formatNumber(totals.alreadyInV2)}`);

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');

  console.log('============================================================');
  console.log(' STEP 15 COMPLETE');
  console.log('============================================================');
  console.log(`Rows read         : ${formatNumber(totals.rowsRead)}`);
  console.log(`NEW records added : ${formatNumber(totals.added)}`);
  console.log(`\n📄 FULL REPORT: ${REPORT_FILE}`);
  console.log('============================================================');
}

main().catch(error => {
  console.error('\n============================================================');
  console.error(' STEP 15 FAILED');
  console.error('============================================================');
  console.error(error.stack || error.message);
  process.exit(1);
});