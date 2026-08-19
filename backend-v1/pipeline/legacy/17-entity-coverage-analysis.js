'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 17
 * ENTITY COVERAGE & ID NAMESPACE ANALYSIS
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'source');
const MIGRATION_DIR = path.join(ROOT, 'public_data', 'migration');
const REPORT_FILE = path.join(MIGRATION_DIR, '17-entity-coverage-analysis.txt');

async function processJSONL(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return resolve(false);
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try { onRow(JSON.parse(line)); } catch (e) {}
    });
    rl.on('close', () => resolve(true));
    rl.on('error', reject);
  });
}

const report = [];
function reportLine(text = '') { report.push(text); }
function section(title) { reportLine('\n' + '='.repeat(60)); reportLine(title); reportLine('='.repeat(60)); }

// Integrated and hardened updateMap function
function updateMap(map, id, dataset, date, name = null, clubName = null) {
  if (!id) return;

  const idStr = String(id).trim();
  if (!idStr) return;

  if (!map.has(idStr)) {
    map.set(idStr, {
      datasets: new Set(),
      count: 0,
      minDate: '',
      maxDate: '',
      names: new Set(),
      clubs: new Set()
    });
  }

  const entry = map.get(idStr);

  entry.datasets.add(dataset);
  entry.count++;

  const dateStr = date ? String(date).trim() : '';

  // Strict date validation to prevent string comparison anomalies
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    if (!entry.minDate || dateStr < entry.minDate) {
      entry.minDate = dateStr;
    }

    if (!entry.maxDate || dateStr > entry.maxDate) {
      entry.maxDate = dateStr;
    }
  }

  if (name && entry.names.size < 3) {
    entry.names.add(String(name).trim());
  }

  if (clubName && entry.clubs.size < 3) {
    entry.clubs.add(String(clubName).trim());
  }
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 17');
  console.log(' ENTITY COVERAGE & ID NAMESPACE ANALYSIS');
  console.log('============================================================\n');

  fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  reportLine('ZOKASCORE V2 PIPELINE — STEP 17: ENTITY COVERAGE ANALYSIS');
  reportLine(`Generated: ${new Date().toISOString()}`);

  // 1. Load Master IDs
  console.log('> Loading master IDs...');
  const masterPlayers = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'players.jsonl'), (row) => {
    if (row.player_id) masterPlayers.add(String(row.player_id));
  });

  const masterClubs = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'clubs.jsonl'), (row) => {
    if (row.club_id) masterClubs.add(String(row.club_id));
  });

  // 2. Prepare Maps for Missing Entities
  const missingPlayers = new Map();
  const missingClubs = new Map();

  // 3. Stream through ALL datasets to track orphans
  console.log('> Scanning all datasets for orphan references...');

  // A) game_events.jsonl (Distinguishing ID types)
  await processJSONL(path.join(SOURCE_DIR, 'game_events.jsonl'), (row) => {
    const date = row.date;
    const clubName = row.club_name;
    
    updateMap(missingPlayers, row.player_id, 'game_events', date, null, clubName);
    updateMap(missingPlayers, row.player_in_id, 'game_events (in)', date, null, clubName);
    updateMap(missingPlayers, row.player_assist_id, 'game_events (assist)', date, null, clubName);
    
    updateMap(missingClubs, row.club_id, 'game_events', date, clubName, null);
  });

  // B) appearances.jsonl
  await processJSONL(path.join(SOURCE_DIR, 'appearances.jsonl'), (row) => {
    updateMap(missingPlayers, row.player_id, 'appearances', row.date, row.player_name, null);
    updateMap(missingClubs, row.player_club_id, 'appearances', row.date, null, null);
  });

  // C) player_valuations.jsonl
  await processJSONL(path.join(SOURCE_DIR, 'player_valuations.jsonl'), (row) => {
    updateMap(missingPlayers, row.player_id, 'valuations', row.date, null, row.current_club_name);
    updateMap(missingClubs, row.current_club_id, 'valuations', row.date, row.current_club_name, null);
  });

  // D) club_games.jsonl (Checking both own and opponent IDs)
  await processJSONL(path.join(SOURCE_DIR, 'club_games.jsonl'), (row) => {
    updateMap(missingClubs, row.club_id, 'club_games', null, null, null);
    updateMap(missingClubs, row.opponent_id, 'club_games (opp)', null, null, null);
  });

  // 4. Filter out IDs that actually exist in master tables
  for (const id of missingPlayers.keys()) {
    if (masterPlayers.has(id)) missingPlayers.delete(id);
  }
  for (const id of missingClubs.keys()) {
    if (masterClubs.has(id)) missingClubs.delete(id);
  }

  // 5. Generate Report
  section('MISSING PLAYER ANALYSIS');
  console.log(`Analyzing ${missingPlayers.size} missing players...`);
  reportLine(`Total Unique Missing Player IDs: ${missingPlayers.size.toLocaleString()}`);
  
  const sortedPlayers = [...missingPlayers.entries()].sort((a, b) => b[1].count - a[1].count);
  reportLine('\n--- Top 20 Most Referenced Missing Players ---');
  
  sortedPlayers.slice(0, 20).forEach(([id, data], i) => {
    reportLine(`\n${i + 1}. Player ID: ${id} (Refs: ${data.count})`);
    reportLine(`   Found in   : ${[...data.datasets].join(', ')}`);
    // Applied N/A fallback
    reportLine(`   Date Range : ${data.minDate || 'N/A'} → ${data.maxDate || 'N/A'}`);
    if (data.names.size > 0) reportLine(`   Names      : ${[...data.names].join(', ')}`);
    if (data.clubs.size > 0) reportLine(`   Clubs      : ${[...data.clubs].join(', ')}`);
  });

  section('MISSING CLUB ANALYSIS');
  console.log(`Analyzing ${missingClubs.size} missing clubs...`);
  reportLine(`Total Unique Missing Club IDs: ${missingClubs.size.toLocaleString()}`);

  const sortedClubs = [...missingClubs.entries()].sort((a, b) => b[1].count - a[1].count);
  reportLine('\n--- Top 20 Most Referenced Missing Clubs ---');

  sortedClubs.slice(0, 20).forEach(([id, data], i) => {
    reportLine(`\n${i + 1}. Club ID: ${id} (Refs: ${data.count})`);
    reportLine(`   Found in   : ${[...data.datasets].join(', ')}`);
    // Applied N/A fallback
    reportLine(`   Date Range : ${data.minDate || 'N/A'} → ${data.maxDate || 'N/A'}`);
    if (data.names.size > 0) reportLine(`   Names      : ${[...data.names].join(', ')}`);
  });

  section('ANALYSIS COMPLETE');
  console.log('\n============================================================');
  console.log(' STEP 17 COMPLETE');
  console.log('============================================================');
  console.log(`📄 FULL REPORT: ${REPORT_FILE}`);

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});