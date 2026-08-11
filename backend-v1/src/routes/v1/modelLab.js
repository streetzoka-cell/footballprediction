const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const AUDIT_LEDGER_PATH = path.join(process.cwd(), 'public_data', 'audit_ledger_v4.csv');

// GET /api/v1/models/current
// Transparent overview of the current AI model status
router.get('/current', (req, res) => {
  res.json({
    success: true,
    data: {
      model: 'Zoka V1',
      version: '1.0.0',
      training_period: '1872 - 2023',
      out_of_sample_period: '2024 - Present',
      markets: ['1X2'],
      minimum_edge: '10%',
      current_oos_roi: '-9.05%',
      status: 'NOT DEPLOYED (Failed Audit)',
      statement: 'Past performance is not evidence of future performance. ZOKASCORE refused to launch its own betting AI after it failed its out-of-sample audit.'
    }
  });
});

// GET /api/v1/models/audit
// Exposes the immutable bet ledger for independent inspection
router.get('/audit', (req, res) => {
  try {
    if (!fs.existsSync(AUDIT_LEDGER_PATH)) {
      return res.status(404).json({ success: false, error: 'Audit ledger not found. Run run_audit_v4.py first.' });
    }
    
    // Stream the CSV file directly to the client for large file efficiency
    res.setHeader('Content-Type', 'text/csv');
    fs.createReadStream(AUDIT_LEDGER_PATH).pipe(res);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load audit ledger.' });
  }
});

module.exports = router;