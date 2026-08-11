const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const ENTITIES_DIR = path.join(HISTORY_DIR, 'entities');

// GET /api/v1/intelligence/team/:teamName
// Fetches deep team intelligence (Form, Goals, Resilience, Match States)
router.get('/team/:teamName', (req, res) => {
  try {
    const slug = String(req.params.teamName).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filePath = path.join(ENTITIES_DIR, 'team_intelligence', `${slug}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Team intelligence not found.' });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load team intelligence.' });
  }
});

// GET /api/v1/intelligence/h2h/:teamA/:teamB
// Fetches Head-to-Head intelligence
router.get('/h2h/:teamA/:teamB', (req, res) => {
  try {
    const slugA = String(req.params.teamA).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const slugB = String(req.params.teamB).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    
    const teams = [slugA, slugB].sort();
    const filePath = path.join(ENTITIES_DIR, 'h2h', `${teams[0]}_${teams[1]}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'H2H record not found.' });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load H2H data.' });
  }
});

module.exports = router;