'use strict';

const express = require('express');
const router = express.Router();

const MatchIntelligenceService = require('../../services/MatchIntelligenceService');

/**
 * GET /api/v1/match-intelligence
 * Preferred:  ?homeId=50&awayId=44          (exact + instant)
 * Fallback:   ?home=Man City&away=Liverpool (name resolution)
 */
router.get('/', async (req, res, next) => {
  try {
    const { home, away, homeId, awayId } = req.query;

    if ((!home && !homeId) || (!away && !awayId)) {
      return res.status(400).json({
        success: false,
        error: 'Pass homeId & awayId (preferred) or home & away names.',
      });
    }

    const data = await MatchIntelligenceService.getMatchIntelligence({
      home,
      away,
      homeId,
      awayId,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Could not resolve either team.',
        inputs: { home: homeId || home, away: awayId || away },
      });
    }

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;