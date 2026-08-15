'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 23
 * PLAYER IDENTITY RECONCILIATION
 * ============================================================
 * 
 * TARGET: 947 STRONG_EVIDENCE candidates from Step 22.
 * 
 * RULES:
 * - Read ONLY Step 21 and Step 22 output files.
 * - NEVER scan game_events.jsonl or other massive sources.
 * - Build historical timelines from extracted evidence.
 * - Compare manifest hints vs observed evidence.
 * - Assign conservative identity states (SUPPORTED, CONFLICT, UNRESOLVED).
 * - NEVER modify source data.
 * - STOP immediately after generating the report.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');

const MATRIX_FILE = path.join(MIGRATION_DIR, '21-player-recovery-matrix.json');
const EVIDENCE_FILE = path.join(MIGRATION_DIR, '22-identity-evidence-trails.json');
const RECONCILIATION_FILE = path.join(MIGRATION_DIR, '23-player-identity-reconciliation.json');
const REPORT_FILE = path.join(MIGRATION_DIR, '23-player-identity-reconciliation.txt');

const report = [];
function reportLine(text = '') { report.push(text); }
function section(title) { reportLine('\n' + '='.repeat(60)); reportLine(title); reportLine('='.repeat(60)); }

async function main() {
  const startTime = process.uptime();
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 23');
  console.log(' PLAYER IDENTITY RECONCILIATION');
  console.log('============================================================\n');

  if (!fs.existsSync(MATRIX_FILE) || !fs.existsSync(EVIDENCE_FILE)) {
    console.error('❌ Required input files from Steps 21 and 22 not found.');
    process.exit(1);
  }

  console.log('> Loading Step 21 matrix and Step 22 evidence trails...');
  const matrix = JSON.parse(fs.readFileSync(MATRIX_FILE, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_FILE, 'utf8'));

  // Index evidence by player_id for fast lookup
  const evidenceMap = new Map();
  for (const ev of evidence) {
    evidenceMap.set(ev.player_id, ev);
  }

  // Filter for the 947 REVIEW candidates
  const candidates = matrix.filter(m => m.action === 'REVIEW');
  console.log(`   Reconciling ${candidates.length} candidates...`);

  const reconciliationResults = [];
  let stats = { IDENTITY_SUPPORTED: 0, IDENTITY_CONFLICT: 0, IDENTITY_UNRESOLVED: 0 };

  for (const cand of candidates) {
    const evData = evidenceMap.get(cand.player_id);
    
    const result = {
      player_id: cand.player_id,
      manifest_hint_club: cand.likely_club,
      total_refs: cand.event_refs,
      goals: cand.events.Goals || 0,
      observed_clubs: [],
      club_conflict: false,
      identity_status: 'IDENTITY_UNRESOLVED',
      resolution_action: 'NEEDS_IDENTITY_SOURCE',
      partial_timeline: []
    };

    if (evData && evData.evidence_trail.length > 0) {
      // Extract observed clubs and timeline from the 5-sample evidence trail
      const observedClubs = new Set();
      for (const ev of evData.evidence_trail) {
        if (ev.club) {
          observedClubs.add(ev.club);
          result.partial_timeline.push({
            date: ev.date,
            club: ev.club,
            event: ev.type
          });
        }
      }
      
      result.observed_clubs = [...observedClubs];
      
      // Check if manifest hint matches any observed club
      const hintMatchesEvidence = observedClubs.has(cand.likely_club);
      
      if (observedClubs.size === 0) {
        result.identity_status = 'IDENTITY_UNRESOLVED';
        stats.IDENTITY_UNRESOLVED++;
      } else if (hintMatchesEvidence) {
        result.identity_status = 'IDENTITY_SUPPORTED';
        result.resolution_action = 'READY_FOR_EXTERNAL_LOOKUP';
        stats.IDENTITY_SUPPORTED++;
      } else {
        result.identity_status = 'IDENTITY_CONFLICT';
        result.club_conflict = true;
        result.resolution_action = 'REVIEW_CONFLICT_BEFORE_LOOKUP';
        stats.IDENTITY_CONFLICT++;
      }
    } else {
      stats.IDENTITY_UNRESOLVED++;
    }

    reconciliationResults.push(result);
  }

  // Sort by total refs descending
  reconciliationResults.sort((a, b) => b.total_refs - a.total_refs);

  // 1. Output Reconciliation JSON
  fs.writeFileSync(RECONCILIATION_FILE, JSON.stringify(reconciliationResults, null, 2), 'utf8');
  console.log(`   ✅ Saved reconciliation matrix: ${path.relative(ROOT, RECONCILIATION_FILE)}`);

  // 2. Generate Report
  section('IDENTITY RECONCILIATION SUMMARY');
  reportLine(`Candidates Reconciled       : ${reconciliationResults.length}`);
  reportLine(`IDENTITY_SUPPORTED          : ${stats.IDENTITY_SUPPORTED}`);
  reportLine(`IDENTITY_CONFLICT           : ${stats.IDENTITY_CONFLICT}`);
  reportLine(`IDENTITY_UNRESOLVED         : ${stats.IDENTITY_UNRESOLVED}`);

  section('TOP 10 IDENTITY CONFLICTS (Manifest Hint vs Evidence)');
  const conflicts = reconciliationResults.filter(r => r.identity_status === 'IDENTITY_CONFLICT').slice(0, 10);
  
  conflicts.forEach((c, i) => {
    reportLine(`\n${i + 1}. Player ID: ${c.player_id} (Refs: ${c.total_refs})`);
    reportLine(`   Manifest Hint : ${c.manifest_hint_club}`);
    reportLine(`   Observed Clubs: ${c.observed_clubs.join(' | ')}`);
    reportLine(`   Partial Timeline:`);
    c.partial_timeline.forEach(t => {
      reportLine(`   - ${t.date} | ${t.club} (${t.event})`);
    });
  });

  section('TOP 10 IDENTITY SUPPORTED');
  const supported = reconciliationResults.filter(r => r.identity_status === 'IDENTITY_SUPPORTED').slice(0, 10);
  
  supported.forEach((c, i) => {
    reportLine(`\n${i + 1}. Player ID: ${c.player_id} (Refs: ${c.total_refs}, Goals: ${c.goals})`);
    reportLine(`   Confirmed Club: ${c.manifest_hint_club}`);
  });

  const elapsed = (process.uptime() - startTime).toFixed(2);
  section('PIPELINE BOUNDARIES');
  reportLine(`Total Elapsed Time        : ${elapsed}s`);
  reportLine('STEP 23 IS ANALYSIS ONLY.');
  reportLine('NO SOURCE DATA WAS MODIFIED.');
  reportLine('NO MASSIVE DATASETS WERE SCANNED.');
  reportLine('NO AUDIT LOOP WAS STARTED.');

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');

  console.log('\n============================================================');
  console.log(' STEP 23 COMPLETE');
  console.log('============================================================');
  console.log(`📄 FULL REPORT: ${REPORT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});