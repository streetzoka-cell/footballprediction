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

  // --- PHASE 1: CORE CSV SYNC & ELO (PYTHON) ---
  // 1. Merge live results from public_data/results into the Core CSVs and deduplicate
  runStep('python pipeline/append-results-to-master.py', 'Append Live Results to Master CSV');
  
  // 2. Recalculate Elo for the newly appended matches
  runStep('python pipeline/32-build-zokascore-elo.py', 'Build ZOKASCORE ELO');
  
  // 3. Publish the updated Elo to the public folder
  runStep('python pipeline/16-publish-elo-state.py', 'Publish Current ELO State');

  // --- PHASE 2: KNOWLEDGE GRAPH (NODE.js) ---
  // 4. Rebuild canonical team/player indexes (reads Core CSVs)
  runStep('node pipeline/01-build-canonical-indexes.js', 'Build Canonical Indexes');
  
  // 5. Build deep intelligence (Team stats, H2H, recent form) from Core CSVs
  runStep('node pipeline/06-build-intelligence-indexes.js', 'Build Intelligence Indexes');
  
  // 6. Build seasonal stats (Win %, BTTS %, Over/Under %) from Core CSVs
  runStep('node pipeline/07-seasonal-intelligence.js', 'Build Seasonal Intelligence');
  
  // 7. Build fast lookup maps for the API
  runStep('node pipeline/11-rebuild-knowledge-indexes.js', 'Rebuild Knowledge Indexes');
  
  // 8. Copy the verified intelligence to public_data
  runStep('node pipeline/13-publish-knowledge.js', 'Publish Knowledge to Public');
  
  // 9. Publish historical matches (with the newly calculated Elo) to public_data
  runStep('node pipeline/14-publish-historical-matches.js', 'Publish Historical Matches');
  
  // 10. Publish match events (scorers, cards) to public_data
  runStep('node pipeline/15-publish-match-events.js', 'Publish Match Events');

  // --- PHASE 3: LIVE PREDICTIONS (PYTHON) ---
  // 11. Generate today's predictions reading the UNIFIED public_data folder
  runStep('python pipeline/50-generate-daily-predictions.py', 'Generate Daily ML Predictions');

  logger.info('\n============================================================');
  logger.info('✅ ZOKASCORE V2 DAILY PIPELINE COMPLETE ✅');
  logger.info('============================================================');
}

run().catch(err => {
  logger.error('[Pipeline] Fatal error:', err);
  process.exit(1);
});