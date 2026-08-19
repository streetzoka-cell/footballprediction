const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const COMPETITIONS_INDEX_FILE = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'indexes', 'competitions-index.json');

// Load competition names into memory for fast lookup
let competitionNames = {};
try {
  if (fs.existsSync(COMPETITIONS_INDEX_FILE)) {
    const compIndex = JSON.parse(fs.readFileSync(COMPETITIONS_INDEX_FILE, 'utf8'));
    // Create a slug -> name mapping (e.g., "e0" -> "Premier League")
    Object.values(compIndex).forEach(comp => {
      if (comp && comp.name) {
        const slug = comp.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        competitionNames[slug] = comp.name;
      }
    });
  }
} catch (e) {
  console.warn('[HistoryRoute] Could not load competitions index for name mapping.');
}

// GET /api/v1/history/competition/:compSlug/season/:season
// Fetches all matches for a specific competition and season
router.get('/competition/:compSlug/season/:season', (req, res) => {
  try {
    const { compSlug, season } = req.params;
    const filePath = path.join(HISTORY_DIR, compSlug, `${season}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Historical matches not found for this competition/season.' });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Inject the human-readable name if we have it in our index
    if (competitionNames[compSlug]) {
      data.competition_name = competitionNames[compSlug];
    } else {
      data.competition_name = data.competition || compSlug;
    }
    
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load historical matches.' });
  }
});

// GET /api/v1/history/team/:teamId
// Fetches recent historical matches for a specific team across all competitions
router.get('/team/:teamId', (req, res) => {
  try {
    const { teamId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 10;
    
    // For performance, a real implementation would use the team_match_index.json 
    // generated in Step 11 to instantly know which files to open.
    // For now, returning a placeholder or fetching from results cache if needed.
    
    res.json({ 
      success: true, 
      message: 'Team history endpoint. Use team_match_index.json for instant lookups.',
      data: []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load team history.' });
  }
});

module.exports = router;