const express = require('express');
const router = express.Router();
const MatchIntelligenceService = require('../../services/MatchIntelligenceService');

// GET /api/v1/match-intelligence?home=Man City&away=Liverpool
router.get('/', async (req, res) => {
  try {
    const { home, away } = req.query;
    if (!home || !away) {
      return res.status(400).json({ success: false, error: 'Home and Away team names are required.' });
    }
    
    const data = await MatchIntelligenceService.getMatchIntelligence(home, away);
    
    if (!data) {
      return res.status(404).json({ success: false, error: 'Intelligence data not found for these teams.' });
    }
    
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load match intelligence.' });
  }
});

module.exports = router;