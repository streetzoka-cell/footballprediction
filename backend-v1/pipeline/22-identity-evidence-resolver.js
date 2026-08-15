'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 22
 * BOUNDED IDENTITY EVIDENCE RESOLVER
 * ============================================================
 * 
 * TARGET: 947 MEDIUM confidence candidates from Step 21.
 * 
 * RULES:
 * - Read game_events.jsonl at most ONCE.
 * - Extract precise evidence trails (game_id, date, minute, description).
 * - Classify based on evidence density (STRONG_CANDIDATE = high activity, NOT confirmed identity).
 * - NEVER modify source data.
 * - NEVER call another pipeline step.
 * - STOP immediately after generating the report.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'source');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');

const MATRIX_FILE = path.join(MIGRATION_DIR, '21-player-recovery-matrix.json');
const EVIDENCE_FILE = path.join(MIGRATION_DIR, '22-identity-evidence-trails.json');
const REPORT_FILE = path.join(MIGRATION_DIR, '22-identity-evidence-resolver.txt');

async function processJSONL(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return resolve(0);
    
    let processed = 0;
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try { 
        onRow(JSON.parse(line));
        processed++;
        if (processed % 500000 === 0) {
          const elapsed = process.uptime().toFixed(1);
          process.stdout.write(`\r   Processed ${processed.toLocaleString()} rows (${elapsed}s)...`);
        }
      } catch (e) {}
    });
    
    rl.on('close', () => {
      const elapsed = process.uptime().toFixed(1);
      process.stdout.write(`\r   Processed ${processed.toLocaleString()} rows (${elapsed}s).      \n`);
      resolve(processed);
    });
    rl.on('error', reject);
  });
}

const report = [];
function reportLine(text = '') { report.push(text); }
function section(title) { reportLine('\n' + '='.repeat(60)); reportLine(title); reportLine('='.repeat(60)); }

async function main() {
  const startTime = process.uptime();
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 22');
  console.log(' BOUNDED IDENTITY EVIDENCE RESOLVER');
  console.log('============================================================\n');

  if (!fs.existsSync(MATRIX_FILE)) {
    console.error('❌ Step 21 matrix not found. Run Step 21 first.');
    process.exit(1);
  }

  console.log('> Loading Step 21 matrix...');
  const matrix = JSON.parse(fs.readFileSync(MATRIX_FILE, 'utf8'));
  
  // Filter for the 947 REVIEW candidates
  const candidates = matrix.filter(m => m.action === 'REVIEW');
  const candidateIds = new Set(candidates.map(c => c.player_id));
  
  console.log(`   Isolated ${candidateIds.size} MEDIUM candidates for evidence extraction.`);

  // 1. Setup Evidence Accumulator
  const evidenceMap = new Map();
  for (const cand of candidates) {
    evidenceMap.set(cand.player_id, {
      player_id: cand.player_id,
      likely_club: cand.likely_club,
      total_refs: cand.event_refs,
      goals: cand.events.Goals || 0,
      cards: cand.events.Cards || 0,
      subs: cand.events.Substitutions || 0,
      evidence_trail: [],
      classification: 'UNRESOLVED'
    });
  }

  // 2. Scan game_events.jsonl ONCE to extract evidence trails
  console.log('> Scanning game_events.jsonl for evidence trails...');
  await processJSONL(path.join(SOURCE_DIR, 'game_events.jsonl'), (row) => {
    // Defensive deduplication per row
    const pIds = new Set([
      row.player_id,
      row.player_in_id,
      row.player_assist_id
    ].filter(Boolean).map(String));

    for (const pid of pIds) {
      if (!candidateIds.has(pid)) continue;

      const entry = evidenceMap.get(pid);

      if (entry && entry.evidence_trail.length < 5) {
        entry.evidence_trail.push({
          date: row.date,
          game_id: row.game_id,
          minute: row.minute,
          type: row.type,
          club: row.club_name,
          description: row.description
        });
      }
    }
  });

  // 3. Classify Candidates based on Evidence Density
  console.log('> Classifying candidates...');
  let stats = { STRONG_CANDIDATE: 0, REVIEW: 0, UNRESOLVED: 0 };

  for (const entry of evidenceMap.values()) {
    // If they have many refs or multiple goals, they are a strong candidate for external lookup
    if (entry.total_refs >= 20 || entry.goals >= 5) {
      entry.classification = 'STRONG_CANDIDATE';
      stats.STRONG_CANDIDATE++;
    } else if (entry.total_refs >= 10) {
      entry.classification = 'REVIEW';
      stats.REVIEW++;
    } else {
      entry.classification = 'UNRESOLVED';
      stats.UNRESOLVED++;
    }
  }

  // 4. Output JSON Evidence File
  const evidenceArr = [...evidenceMap.values()];
  evidenceArr.sort((a, b) => b.total_refs - a.total_refs);
  
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidenceArr, null, 2), 'utf8');
  console.log(`   ✅ Saved evidence trails: ${path.relative(ROOT, EVIDENCE_FILE)}`);

  // 5. Generate Report
  section('IDENTITY EVIDENCE RESOLVER SUMMARY');
  reportLine(`Candidates Analyzed       : ${evidenceArr.length}`);
  reportLine(`STRONG_CANDIDATE          : ${stats.STRONG_CANDIDATE}`);
  reportLine(`REVIEW                    : ${stats.REVIEW}`);
  reportLine(`UNRESOLVED                : ${stats.UNRESOLVED}`);

  section('TOP 10 STRONG CANDIDATES (Evidence Trails)');
  const topCandidates = evidenceArr.filter(e => e.classification === 'STRONG_CANDIDATE').slice(0, 10);
  
  topCandidates.forEach((c, i) => {
    reportLine(`\n${i + 1}. Player ID: ${c.player_id} (Refs: ${c.total_refs}, Goals: ${c.goals})`);
    reportLine(`   Likely Club : ${c.likely_club}`);
    reportLine(`   Evidence Trail:`);
    c.evidence_trail.forEach(ev => {
      reportLine(`   - ${ev.date} | ${ev.minute}' | ${ev.type} | ${ev.club}`);
      reportLine(`     Desc: ${ev.description}`);
    });
  });

  const elapsed = (process.uptime() - startTime).toFixed(2);
  section('PIPELINE BOUNDARIES');
  reportLine(`Total Elapsed Time        : ${elapsed}s`);
  reportLine('STEP 22 IS ANALYSIS ONLY.');
  reportLine('NO SOURCE DATA WAS MODIFIED.');
  reportLine('NO AUDIT LOOP WAS STARTED.');

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');

  console.log('\n============================================================');
  console.log(' STEP 22 COMPLETE');
  console.log('============================================================');
  console.log(`📄 FULL REPORT: ${REPORT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});