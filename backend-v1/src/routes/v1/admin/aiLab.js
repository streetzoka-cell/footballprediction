const express = require('express');
const router = express.Router();
const adminAuth = require('../../../middleware/adminAuth');
const { exec } = require('child_process');
const logger = require('../../../utils/logger');

router.use(adminAuth);

// POST /api/v1/admin/ai-lab/generate-features
// Triggers the NEW V2 ML pipeline to generate daily multi-market predictions
router.post('/generate-features', (req, res) => {
  logger.info('[Admin AI Lab] Triggering Pipeline 50 (Daily ML Predictions)...');
  
  // Execute the Python script. Note: This runs asynchronously in the background.
  exec('python pipeline/50-generate-daily-predictions.py', { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
    if (error) {
      logger.error(`[Admin AI Lab] Error running Pipeline 50: ${error.message}`);
      return;
    }
    logger.info(`[Admin AI Lab] Pipeline 50 completed successfully.`);
  });

  res.json({ 
    success: true, 
    message: 'V2 ML Prediction generation started in the background. Check server logs for progress.' 
  });
});

module.exports = router;