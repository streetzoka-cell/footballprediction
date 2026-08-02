// footballprediction/backend-v1/src/routes/v1/predictions.js

const express = require('express');
const logger = require('../../utils/logger');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Simple in-memory store for predictions
// Format: { "matchId": { totalVotes: 0, home: 0, draw: 0, away: 0 } }
const predictionsStore = {};

// Path to save predictions locally (matches your public_data architecture)
const PREDICTIONS_FILE = path.join(process.cwd(), 'public_data', 'predictions.json');

// Load existing votes on server startup
function loadPredictions() {
  try {
    if (fs.existsSync(PREDICTIONS_FILE)) {
      const data = fs.readFileSync(PREDICTIONS_FILE, 'utf8');
      Object.assign(predictionsStore, JSON.parse(data));
      logger.info('[Predictions] Loaded existing predictions from local file.');
    }
  } catch (err) {
    logger.warn('[Predictions] Could not load local predictions file, starting fresh.');
  }
}

// Save votes to local file for persistence across restarts
function savePredictions() {
  try {
    fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(predictionsStore, null, 2), 'utf8');
  } catch (err) {
    logger.error('[Predictions] Failed to save predictions to local file:', err.message);
  }
}

// Initialize on startup
loadPredictions();

/**
 * POST /api/v1/predictions/vote
 */
router.post('/vote', async (req, res) => {
  try {
    const { matchId, choice } = req.body;

    if (!matchId || !['home', 'draw', 'away'].includes(choice)) {
      return res.status(400).json({ error: 'Invalid matchId or choice' });
    }

    const mid = String(matchId);
    
    // Initialize match if it doesn't exist yet
    if (!predictionsStore[mid]) {
      predictionsStore[mid] = { totalVotes: 0, home: 0, draw: 0, away: 0 };
    }

    // Increment votes
    predictionsStore[mid].totalVotes += 1;
    predictionsStore[mid][choice] += 1;

    // Save to local file immediately
    savePredictions();

    logger.info(`[âœ… Prediction Vote] Match: ${mid}, Choice: ${choice}, Total: ${predictionsStore[mid].totalVotes}`);

    res.status(200).json({ 
      success: true, 
      message: 'Vote recorded successfully',
      matchId: mid,
      choice
    });

  } catch (error) {
    logger.error('[âŒ Prediction Vote Error]:', error);
    res.status(500).json({ error: 'Failed to record vote' });
  }
});

/**
 * GET /api/v1/predictions/:matchId
 */
router.get('/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const mid = String(matchId);
    
    const data = predictionsStore[mid] || { totalVotes: 0, home: 0, draw: 0, away: 0 };
    const total = data.totalVotes || 0;
    
    // Calculate real percentages
    let homePct = total > 0 ? Math.round((data.home / total) * 100) : 0;
    let drawPct = total > 0 ? Math.round((data.draw / total) * 100) : 0;
    let awayPct = total > 0 ? Math.round((data.away / total) * 100) : 0;
    
    // Fix rounding errors so percentages always add up to exactly 100%
    const sum = homePct + drawPct + awayPct;
    if (total > 0 && sum !== 100) {
      const diff = 100 - sum;
      // Add the missing percent to the highest vote getter
      if (data.home >= data.draw && data.home >= data.away) homePct += diff;
      else if (data.draw >= data.home && data.draw >= data.away) drawPct += diff;
      else awayPct += diff;
    }

    logger.info(`[ðŸ“Š Prediction Fetch] Match: ${mid}, Total: ${total}, H:${homePct}% D:${drawPct}% A:${awayPct}%`);

    res.status(200).json({
      success: true,
      matchId: mid,
      totalVotes: total,
      votes: {
        home: data.home,
        draw: data.draw,
        away: data.away
      },
      percentages: {
        home: homePct,
        draw: drawPct,
        away: awayPct
      }
    });

  } catch (error) {
    logger.error('[âŒ Get Predictions Error]:', error);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

module.exports = router;
