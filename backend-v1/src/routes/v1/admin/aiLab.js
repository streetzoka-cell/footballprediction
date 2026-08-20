const express = require('express');
const router = express.Router();
const adminAuth = require('../../../middleware/adminAuth');
const { exec } = require('child_process');
const logger = require('../../../utils/logger');

router.use(adminAuth);

// POST /api/v1/admin/ai-lab/generate-features
// Triggers the FULL ZOKASCORE V2 Daily Pipeline (CSV Sync -> ELO -> Knowledge -> ML Predictions)
router.post('/generate-features', (req, res) => {
  logger.info('[Admin AI Lab] Triggering Full Daily Pipeline (run_daily_pipeline.js)...');
  
  // Execute the Node.js pipeline runner. This handles all Python and Node.js steps safely.
  exec('node pipeline/run_daily_pipeline.js', { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
    if (error) {
      logger.error(`[Admin AI Lab] Pipeline failed: ${error.message}`);
      return;
    }
    logger.info(`[Admin AI Lab] Daily Pipeline completed successfully.`);
  });

  res.json({ 
    success: true, 
    message: 'Full AI Pipeline (Elo, Stats, Form, ML Predictions) started in background. Check server logs for progress.' 
  });
});

module.exports = router;