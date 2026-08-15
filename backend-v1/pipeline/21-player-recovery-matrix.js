'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 21
 * ENTITY RECOVERY & RESOLUTION MATRIX
 * ============================================================
 * Reads the missing player manifest and cross-references
 * appearances, valuations, and game events to assign
 * confidence scores and recovery strategies.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'source');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');

const MANIFEST_FILE = path.join(MIGRATION_DIR, 'missing_player_evidence_manifest.json');
const MATRIX_FILE = path.join(MIGRATION_DIR, '21-player-recovery-matrix.json');
const REPORT_FILE = path.join(MIGRATION_DIR, '21-player-recovery-matrix.txt');

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

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 21');
  console.log(' ENTITY RECOVERY & RESOLUTION MATRIX');
  console.log('============================================================\n');

  if (!fs.existsSync(MANIFEST_FILE)) {
    console.error('❌ Missing player manifest not found. Run Step 20 first.');
    process.exit(1);
  }

  console.log('> Loading missing player manifest...');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  const missingIds = new Set(manifest.map(m => m.player_id));
  
  console.log(`   ${missingIds.size} missing IDs loaded for cross-referencing.`);

  // 1. Setup Matrix Accumulator
  const matrix = new Map();
  for (const item of manifest) {
    matrix.set(item.player_id, {
      player_id: item.player_id,
      likely_club: item.likely_club,
      event_refs: item.total_event_refs,
      first_seen: item.first_seen,
      last_seen: item.last_seen,
      recovered_name: null,
      valuation_found: false,
      events: { Goals: 0, Cards: 0, Substitutions: 0, Other: 0 },
      confidence: 'LOW',
      action: 'DO_NOT_RECOVER'
    });
  }

  // 2. Cross-reference Appearances (for names)
  console.log('> Scanning appearances.jsonl for player names...');
  let namesFound = 0;
  await processJSONL(path.join(SOURCE_DIR, 'appearances.jsonl'), (row) => {
    const pid = row.player_id ? String(row.player_id) : null;
    if (pid && missingIds.has(pid)) {
      const entry = matrix.get(pid);
      if (entry && !entry.recovered_name && row.player_name) {
        entry.recovered_name = String(row.player_name).trim();
        namesFound++;
      }
    }
  });
  console.log(`   Found names for ${namesFound} missing players.`);

  // 3. Cross-reference Valuations (for financial evidence)
  console.log('> Scanning player_valuations.jsonl for financial evidence...');
  let valuationsFound = 0;
  await processJSONL(path.join(SOURCE_DIR, 'player_valuations.jsonl'), (row) => {
    const pid = row.player_id ? String(row.player_id) : null;
    if (pid && missingIds.has(pid)) {
      const entry = matrix.get(pid);
      if (entry && !entry.valuation_found) {
        entry.valuation_found = true;
        valuationsFound++;
      }
    }
  });
  console.log(`   Found valuation records for ${valuationsFound} missing players.`);

  // 4. Cross-reference Game Events (for event type breakdown)
  console.log('> Scanning game_events.jsonl for event type breakdown...');
  await processJSONL(path.join(SOURCE_DIR, 'game_events.jsonl'), (row) => {
    const pIds = [row.player_id, row.player_in_id, row.player_assist_id];
    const type = row.type || 'Other';
    
    pIds.forEach(pid => {
      if (pid && missingIds.has(String(pid))) {
        const entry = matrix.get(String(pid));
        if (entry) {
          if (entry.events[type] !== undefined) entry.events[type]++;
          else entry.events.Other++;
        }
      }
    });
  });

  // 5. Calculate Confidence & Action
  console.log('> Calculating confidence scores...');
  let stats = { RECOVER: 0, REVIEW: 0, DO_NOT_RECOVER: 0 };

  for (const entry of matrix.values()) {
    if (entry.recovered_name) {
      entry.confidence = 'HIGH';
      entry.action = 'RECOVER';
      stats.RECOVER++;
    } else if (entry.valuation_found || entry.event_refs > 20) {
      entry.confidence = 'MEDIUM';
      entry.action = 'REVIEW';
      stats.REVIEW++;
    } else {
      entry.confidence = 'LOW';
      entry.action = 'DO_NOT_RECOVER';
      stats.DO_NOT_RECOVER++;
    }
  }

  // 6. Output Matrix JSON
  const matrixArr = [...matrix.values()];
  // Sort by event refs descending
  matrixArr.sort((a, b) => b.event_refs - a.event_refs);
  
  fs.writeFileSync(MATRIX_FILE, JSON.stringify(matrixArr, null, 2), 'utf8');
  console.log(`   ✅ Saved recovery matrix: ${path.relative(ROOT, MATRIX_FILE)}`);

  // 7. Generate Report
  section('ENTITY RECOVERY SUMMARY');
  reportLine(`Total Missing IDs Analyzed : ${matrix.size}`);
  reportLine(`Names Recovered (HIGH)     : ${stats.RECOVER}`);
  reportLine(`Needs Review (MEDIUM)      : ${stats.REVIEW}`);
  reportLine(`Unresolvable (LOW)         : ${stats.DO_NOT_RECOVER}`);

  section('TOP 20 RECOVERABLE PLAYERS (HIGH CONFIDENCE)');
  const recoverable = matrixArr.filter(m => m.action === 'RECOVER').slice(0, 20);
  recoverable.forEach((p, i) => {
    reportLine(`\n${i + 1}. ${p.recovered_name} (ID: ${p.player_id})`);
    reportLine(`   Club       : ${p.likely_club}`);
    reportLine(`   Event Refs : ${p.event_refs} (Goals: ${p.events.Goals}, Cards: ${p.events.Cards})`);
  });

  section('TOP 20 REVIEW PLAYERS (MEDIUM CONFIDENCE)');
  const reviewable = matrixArr.filter(m => m.action === 'REVIEW').slice(0, 20);
  reviewable.forEach((p, i) => {
    reportLine(`\n${i + 1}. ID: ${p.player_id}`);
    reportLine(`   Club       : ${p.likely_club}`);
    reportLine(`   Event Refs : ${p.event_refs} (Goals: ${p.events.Goals}, Cards: ${p.events.Cards})`);
    reportLine(`   Valuation  : ${p.valuation_found ? 'Found' : 'Not Found'}`);
  });

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');

  console.log('\n============================================================');
  console.log(' STEP 21 COMPLETE');
  console.log('============================================================');
  console.log(`📄 FULL REPORT: ${REPORT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});