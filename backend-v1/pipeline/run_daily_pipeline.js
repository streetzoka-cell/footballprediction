'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function runStep(command, label) {
  console.log(`\n============================================================`);
  console.log(`[Pipeline] STARTING: ${label}`);
  console.log(`Command: ${command}`);
  console.log(`============================================================`);
  try {
    execSync(command, { cwd: ROOT, stdio: 'inherit', shell: true });
    console.log(`[Pipeline] ✅ COMPLETED: ${label}`);
    return true;
  } catch (error) {
    console.error(`[Pipeline] ❌ FAILED: ${label}`);
    console.error(error.message);
    return false;
  }
}

// Retention cleanup: keep the last 7 days of daily prediction files.
// (Replaces the hardcoded '2026-08-27' cutoff that silently expired.)
function cleanOldPredictions() {
  const predDir = path.join(ROOT, 'public_data', 'predictions');
  if (!fs.existsSync(predDir)) return;
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const oldFiles = fs.readdirSync(predDir)
    .map(f => ({ f, m: f.match(/(\d{4}-\d{2}-\d{2})\.json/) }))
    .filter(x => x.m && x.m[1] < cutoff);
  if (oldFiles.length > 0) {
    log(`Cleaning ${oldFiles.length} prediction files older than ${cutoff}...`);
    oldFiles.forEach(x => {
      fs.unlinkSync(path.join(predDir, x.f));
      log(`  Deleted ${x.f}`);
    });
  }
}

async function run() {
  log('🚀 STARTING ZOKASCORE V2 MASTER PIPELINE — FINAL 🚀');
  log('Pipeline: 32 ELO → 35 EWMA → 38 Unique → 46 Market Targets → 49 Trainer (V4) → 50 UNIFIED (picker + predict + finalize)');

  // --- PHASE 0: Clean old preds ---
  cleanOldPredictions();

  // --- PHASE 1: ELO & FEATURES (PYTHON) ---
  if (!runStep('python pipeline/32-build-zokascore-elo.py', '32 - Build ZOKASCORE ELO (436k rows)')) return;

  if (!runStep('python pipeline/35-extract-form-features.py', '35 - Extract Form EWMA Features')) {
    log('35 failed — trying legacy fallback: legacy/40-build-ewma-features.py');
    runStep('python pipeline/legacy/40-build-ewma-features.py', '40 - Build EWMA Features (legacy alt)');
  }

  runStep('python pipeline/38-build-unique-features.py', '38 - Build Unique Features');

  // --- PHASE 2: ML TRAINING (single trainer — 49 V4 is champion + governance) ---
  runStep('python pipeline/46-build-market-targets.py', '46 - Build Market Targets v4 Unified');

  // 49 V4: 1X2 51.10% (+7.12) · OU_2_5 55.71% (+2.74) · BTTS 54.45% (+1.04) · OVER=1
  // Writes: all market models + champion_model.joblib + manifest/schema/label maps
  // (42.3 + 44 retired to pipeline/legacy — 49 absorbs 44's governance artifacts)
  if (!runStep('python pipeline/49-train-market-models.py', '49 - Train Market Models V4 (34 feats, OVER=1) — THE trainer')) return;

  // --- PHASE 3: KNOWLEDGE GRAPH (NODE.js) — optional, never fatal ---
  runStep('node pipeline/01-build-canonical-indexes.js', '01 - Build Canonical Indexes');
  runStep('node pipeline/06-build-intelligence-indexes.js', '06 - Build Intelligence Indexes');
  runStep('node pipeline/11-rebuild-knowledge-indexes.js', '11 - Rebuild Knowledge Indexes');

  // --- PHASE 4: PREDICT + FINALIZE (single step — 50 does 51's job inline) ---
  if (!runStep('python pipeline/50-generate-daily-predictions.py', '50 UNIFIED - Master Picker + Generate + Finalize (3 days → all API files)')) return;

  console.log('\n============================================================');
  console.log('✅ ZOKASCORE V2 MASTER PIPELINE COMPLETE ✅');
  console.log('============================================================');
  console.log('Outputs:');
  console.log('  public_data/predictions/<date>.json   (next 3 days, per-day)');
  console.log('  public_data/predictions.json          (unified, deduped, confidence-sorted)');
  console.log('  public_data/zokapicks.json            (top 50 confidence)');
  console.log('  public_data/market_predictions.json   (1X2/BTTS/OU/CS/xG)');
  console.log('  data/models/selection_decision.json   (daily picker audit trail)');
  console.log('');
  console.log('API:');
  console.log('  python -m http.server 8000 --directory public_data');
  console.log('  http://localhost:8000/predictions.json');
  console.log('  http://localhost:8000/zokapicks.json');
  console.log('============================================================');
}

run().catch(err => {
  console.error('[Pipeline] Fatal error:', err);
  process.exit(1);
});