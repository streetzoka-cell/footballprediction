const express = require('express');
const router = express.Router();
const adminAuth = require('../../../middleware/adminAuth');
const { exec } = require('child_process');
const logger = require('../../../utils/logger');

router.use(adminAuth);

// POST /api/v1/admin/ai-lab/generate-features
// Triggers the Node.js script to calculate Elo, Form, and H2H for all missing matches
router.post('/generate-features', (req, res) => {
  logger.info('[Admin AI Lab] Triggering generate-match-features.js...');
  
  // Execute the script. Note: This runs asynchronously in the background.
  // The response is sent immediately so the frontend doesn't hang.
  exec('node scripts/generate-match-features.js', { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      logger.error(`[Admin AI Lab] Error running features script: ${error.message}`);
      return;
    }
    logger.info(`[Admin AI Lab] Features script completed successfully.`);
  });

  res.json({ 
    success: true, 
    message: 'Feature generation started in the background. Check server logs for progress.' 
  });
});

module.exports = router;