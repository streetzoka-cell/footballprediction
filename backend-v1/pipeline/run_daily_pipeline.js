'use strict';

const { execSync } = require('child_process');
const path = require('path');
const logger = require('../src/utils/logger'); // ★ FIX: Added src/ to the path

const ROOT = path.join(__dirname, '..');

function runStep(command, label) {
  logger.info(`\n============================================================`);
  logger.info(`[Pipeline] STARTING: ${label}`);
  logger.info(`============================================================`);
  
  try {
    // Execute synchronously to prevent steps from fighting each other
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
  logger.info('🚀 STARTING ZOKASCORE V2 DAILY PIPELINE 🚀');

  // --- PHASE 1: NODE.js KNOWLEDGE GRAPH ---
  runStep('node pipeline/01-build-canonical-indexes.js', 'Build Canonical Indexes');
  runStep('node pipeline/06-build-intelligence-indexes.js', 'Build Intelligence Indexes');
  runStep('node pipeline/07-seasonal-intelligence.js', 'Build Seasonal Intelligence');
  runStep('node pipeline/11-rebuild-knowledge-indexes.js', 'Rebuild Knowledge Indexes');
  runStep('node pipeline/13-publish-knowledge.js', 'Publish Knowledge to Public');
  runStep('node pipeline/14-publish-historical-matches.js', 'Publish Historical Matches');
  runStep('node pipeline/15-publish-match-events.js', 'Publish Match Events');

  // --- PHASE 2: PYTHON ML ENGINE ---
  runStep('python pipeline/32-build-zokascore-elo.py', 'Build ZOKASCORE ELO');
  runStep('python pipeline/16-publish-elo-state.py', 'Publish Current ELO State');
  
  // The final prediction step that injects AI into fixtures
  runStep('python pipeline/50-generate-daily-predictions.py', 'Generate Daily ML Predictions');

  logger.info('\n============================================================');
  logger.info('✅ ZOKASCORE V2 DAILY PIPELINE COMPLETE ✅');
  logger.info('============================================================');
}

run().catch(err => {
  logger.error('[Pipeline] Fatal error:', err);
  process.exit(1);
});