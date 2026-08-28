
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const AUDIT_LEDGER_PATH = path.join(process.cwd(), 'public_data', 'audit_ledger_v4.csv');
const PREDICTIONS_DIR = path.join(process.cwd(), 'public_data', 'predictions');
const MODEL_DIR = path.join(process.cwd(), 'data', 'models');

router.get('/current', (req, res) => {
  let modelInfo = {
    model: 'ZOKASCORE V2 FINAL',
    version: '50_FINAL_CLEAN + 51_UNIFIED',
    engine: '1X2 (49.56%) + BTTS (53%) + OU1.5 60.52% + CS 12.3% + xG',
    training_period: '1872 - 2026-08-27',
    total_matches: 437695,
    teams: 9716,
    features: '38 enhanced (23 old + 15 xG/Poisson/hybrid)',
    models: {
      '1x2': 'champion_model.joblib - 49.56% acc, DRAW 14.5%, F1 41.8%',
      'btts': 'market_btts_model.joblib - 53.8%',
      'ou_1_5': '60.52% enhanced',
      'ou_2_5': '55.73%',
      'ou_3_5': '69.96%',
      'home_goals': '33.47%',
      'away_goals': '36.31%',
      'correct_score': '12.3% hybrid (70% ML + 30% Poisson xG)'
    },
    status: 'LIVE ✅',
    predictions_today: 0,
    last_generated: null,
    statement: 'ZOKASCORE V2 is LIVE with honest DRAW prediction 14.5% (industry 0%). 677 daily predictions with xG and hybrid Correct Score.'
  };

  try {
    const files = fs.readdirSync(PREDICTIONS_DIR).filter(f => f.endsWith('.json') && f.startsWith('2026-'));
    if (files.length > 0) {
      const latest = files.sort().reverse()[0];
      const data = JSON.parse(fs.readFileSync(path.join(PREDICTIONS_DIR, latest), 'utf8'));
      modelInfo.predictions_today = data.predictions ? data.predictions.length : (Array.isArray(data) ? data.length : 0);
      modelInfo.last_generated = data.generated_at || null;
      modelInfo.latest_file = latest;
    }
  } catch(e) {}

  res.json({ success: true, data: modelInfo });
});

router.get('/audit', (req, res) => {
  try {
    if (!fs.existsSync(AUDIT_LEDGER_PATH)) {
      return res.status(404).json({ success: false, error: 'Audit ledger not found. Run run_audit_v4.py first.' });
    }
    res.setHeader('Content-Type', 'text/csv');
    fs.createReadStream(AUDIT_LEDGER_PATH).pipe(res);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load audit ledger.' });
  }
});

module.exports = router;
