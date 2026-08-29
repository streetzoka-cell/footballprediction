// backend-v1/src/routes/v1/matchIntelligence.js
'use strict';

const express = require('express');
const router = express.Router();

const MatchIntelligenceService = require('../../services/MatchIntelligenceService');

/**
 * GET /api/v1/match-intelligence
 * Preferred:  ?homeId=50&awayId=44          (exact + instant)
 * Fallback:   ?home=Man City&away=Liverpool (name resolution)
 *
 * ★ Never 404s when inputs are present: unknown teams resolve to a
 *   graceful shell (elo 1500, empty form/H2H) so the UI renders
 *   immediately instead of spinning on a failed request.
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
      // Both teams unresolvable → honest empty shell, still 200
      return res.json({
        success: true,
        data: {
          resolved: { home: false, away: false },
          home: { id: String(homeId || ''), name: home || null, elo: 1500, form: [], goalPatterns: {} },
          away: { id: String(awayId || ''), name: away || null, elo: 1500, form: [], goalPatterns: {} },
          h2h: { meetings: 0, homeWins: 0, awayWins: 0, draws: 0 },
          zokaPick: null,
        },
      });
    }

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;