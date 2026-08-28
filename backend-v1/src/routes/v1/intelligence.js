// backend-v1/src/routes/v1/intelligence.js
'use strict';

const express = require('express');
const router = express.Router();
const intel = require('../../services/MatchIntelligenceService');

// GET /team/:teamName — deep team intelligence
router.get('/team/:team', async (req, res, next) => {
  try {
    const result = await intel.getTeamIntelligence(req.params.team);
    if (!result?.data) {
      return res.status(404).json({
        success: false,
        error: 'Team intelligence not found.',
        input: req.params.team,
      });
    }
    return res.json({ success: true, zkId: result.zkId, data: result.data });
  } catch (err) {
    next(err);
  }
});

// GET /h2h/:teamA/:teamB — per-pair H2H lookup
router.get('/h2h/:teamA/:teamB', async (req, res, next) => {
  try {
    const a = intel.resolveTeamId(req.params.teamA);
    const b = intel.resolveTeamId(req.params.teamB);

    if (!a || !b) {
      return res.status(404).json({
        success: false,
        error: 'One or both team identities could not be resolved.',
        inputs: [req.params.teamA, req.params.teamB],
      });
    }

    const result = await intel.getMatchIntelligence({ home: a, away: b });
    return res.json({ success: true, data: result.h2h, homeId: a, awayId: b });
  } catch (err) {
    next(err);
  }
});

module.exports = router;