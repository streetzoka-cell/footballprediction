'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 16.5
 * ORPHAN-ID FORENSICS (Read-Only Investigation)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'source');
const MIGRATION_DIR = path.join(ROOT, 'public_data', 'migration');
const REPORT_FILE = path.join(MIGRATION_DIR, '16.5-orphan-forensics.txt');

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

async function analyzeOrphans(datasetName, file, idField, validSet, crossRefSet = null) {
  section(`FORENSIC: ${datasetName} (${idField})`);
  console.log(`🔍 Forensics for ${datasetName}...`);

  const orphanCounts = new Map();
  let totalRows = 0;
  let totalOrphans = 0;
  const sampleOrphanRows = []; 

  await processJSONL(path.join(SOURCE_DIR, file), (row) => {
    totalRows++;
    const val = row[idField] ? String(row[idField]) : null;
    
    if (val && !validSet.has(val)) {
      totalOrphans++;
      orphanCounts.set(val, (orphanCounts.get(val) || 0) + 1);

      if (sampleOrphanRows.length < 3) {
        sampleOrphanRows.push(row);
      }
    }
  });

  const sortedOrphans = [...orphanCounts.entries()].sort((a, b) => b[1] - a[1]);
  const top10 = sortedOrphans.slice(0, 10);

  reportLine(`Total Rows Scanned   : ${totalRows.toLocaleString()}`);
  reportLine(`Total Orphan Rows    : ${totalOrphans.toLocaleString()}`);
  reportLine(`Unique Orphan IDs    : ${orphanCounts.size.toLocaleString()}`);
  
  if (crossRefSet) {
    let foundInCrossRef = 0;
    for (const id of orphanCounts.keys()) {
      if (crossRefSet.has(id)) foundInCrossRef++;
    }
    reportLine(`Appears in former_names (Lead Only) : ${foundInCrossRef.toLocaleString()}`);
  }

  // Pattern Analysis on UNIQUE IDs
  let numericCount = 0;
  let alphaNumericCount = 0;
  let totalLength = 0;

  for (const id of orphanCounts.keys()) {
    if (/^\d+$/.test(id)) numericCount++;
    else alphaNumericCount++;
    totalLength += id.length;
  }

  const avgLength = orphanCounts.size > 0 ? (totalLength / orphanCounts.size).toFixed(2) : 0;
  reportLine('\n--- Unique Orphan ID Patterns ---');
  reportLine(`Numeric IDs          : ${numericCount.toLocaleString()}`);
  reportLine(`AlphaNumeric IDs     : ${alphaNumericCount.toLocaleString()}`);
  reportLine(`Average ID Length    : ${avgLength}`);

  reportLine('\n--- Top 10 Most Frequent Orphan IDs ---');
  top10.forEach(([id, count], i) => {
    reportLine(`${i + 1}. ID: ${id} (Frequency: ${count.toLocaleString()})`);
  });

  reportLine('\n--- Sample Orphan Rows (Max 3) ---');
  sampleOrphanRows.forEach((row, i) => {
    reportLine(`Sample ${i + 1}: ${JSON.stringify(row)}`);
  });
  
  console.log(`   Unique Orphans: ${orphanCounts.size.toLocaleString()} | Numeric: ${numericCount} | AlNum: ${alphaNumericCount}`);
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 16.5');
  console.log(' ORPHAN-ID FORENSICS');
  console.log('============================================================\n');

  fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  reportLine('ZOKASCORE V2 PIPELINE — STEP 16.5: ORPHAN-ID FORENSICS');
  reportLine(`Generated: ${new Date().toISOString()}`);

  // 1. Load Reference ID Sets
  console.log('> Loading reference IDs...');
  const playerIds = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'players.jsonl'), (row) => {
    if (row.player_id) playerIds.add(String(row.player_id));
  });

  const clubIds = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'clubs.jsonl'), (row) => {
    if (row.club_id) clubIds.add(String(row.club_id));
  });

  // Load former_names club_ids for cross-referencing
  const formerClubIds = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'former_names.jsonl'), (row) => {
    if (row.club_id) formerClubIds.add(String(row.club_id));
  });

  // 2. Run Forensics on the 3 flagged areas
  await analyzeOrphans('game_events', 'game_events.jsonl', 'player_id', playerIds);
  await analyzeOrphans('player_valuations', 'player_valuations.jsonl', 'current_club_id', clubIds, formerClubIds);
  await analyzeOrphans('club_games', 'club_games.jsonl', 'club_id', clubIds, formerClubIds);

  section('FORENSICS COMPLETE');
  console.log('\n============================================================');
  console.log(' STEP 16.5 COMPLETE');
  console.log('============================================================');
  console.log(`📄 FULL REPORT: ${REPORT_FILE}`);

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});