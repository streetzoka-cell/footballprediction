'use strict';

const { execSync } = require('child_process');
const path = require('path');
const logger = require('../src/utils/logger');

const ROOT = path.join(__dirname, '..');

function runStep(command, label) {
  logger.info(`\n============================================================`);
  logger.info(`[Pipeline] STARTING: ${label}`);
  logger.info(`============================================================`);
  
  try {
    execSync(command, { cwd: ROOT, stdio: 'inherit' });
    logger.info(`[Pipeline] ✅ COMPLETED: ${label}`);
    return true;
  } catch (error) {
    logger.error(`[Pipeline] ❌ FAILED: ${label}`);
    logger.error(error.message);
    return false;
  }
}

async function run() {
  logger.info('🚀 STARTING ZOKASCORE V2 MASTER PIPELINE 🚀');

  // --- PHASE 1: CORE CSV SYNC & ELO (PYTHON) ---
  runStep('python pipeline/append-results-to-master.py', 'Append Live Results to Master CSV');
  runStep('python pipeline/32-build-zokascore-elo.py', 'Build ZOKASCORE ELO');
  runStep('python pipeline/16-publish-elo-state.py', 'Publish Current ELO State');

  // --- PHASE 2: KNOWLEDGE GRAPH (NODE.js) ---
  runStep('node pipeline/01-build-canonical-indexes.js', 'Build Canonical Indexes');
  runStep('node pipeline/06-build-intelligence-indexes.js', 'Build Intelligence Indexes');
  runStep('node pipeline/07-seasonal-intelligence.js', 'Build Seasonal Intelligence');
  runStep('node pipeline/11-rebuild-knowledge-indexes.js', 'Rebuild Knowledge Indexes');
  runStep('node pipeline/13-publish-knowledge.js', 'Publish Knowledge to Public');
  runStep('node pipeline/14-publish-historical-matches.js', 'Publish Historical Matches');
  runStep('node pipeline/15-publish-match-events.js', 'Publish Match Events');

  // --- PHASE 3: ML FEATURE EXTRACTION & TRAINING ---
  // ★ Fixed file name to match your folder
  runStep('node pipeline/33-build-elo-features.js', 'Extract ML Elo Features (Node.js)');
  
  runStep('python pipeline/40-build-ewma-features.py', 'Build EWMA Features');
  
  // ★ Fixed file name to match your folder
  runStep('python pipeline/46-build-market-targets.py', 'Build Unified ML Market Targets');
  
  // Train Extended Markets & CORRECT SCORE ML Model
  runStep('python pipeline/49-train-extended-markets.py', 'Train OU & Correct Score ML Models');
  
  // Deploy Champion 1X2 Model
  runStep('python pipeline/44-deploy-champion-model.py', 'Deploy Champion 1X2 Model');

  // --- PHASE 4: LIVE PREDICTIONS (PYTHON) ---
  runStep('python pipeline/50-generate-daily-predictions.py', 'Generate Daily ML Predictions');

  logger.info('\n============================================================');
  logger.info('✅ ZOKASCORE V2 MASTER PIPELINE COMPLETE ✅');
  logger.info('============================================================');
}

run().catch(err => {
  logger.error('[Pipeline] Fatal error:', err);
  process.exit(1);
});