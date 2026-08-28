'use strict';

const express = require('express');
const router = express.Router();

const intel = require('../../services/MatchIntelligenceService');

/**
 * GET /api/v1/intelligence/team/:teamName
 * Deep team intelligence file. Accepts ZK id, provider id, or name.
 */
router.get('/team/:teamName', async (req, res, next) => {
  try {
    const result = await intel.getTeamIntelligence(req.params.teamName);

    if (!result?.data) {
      return res.status(404).json({
        success: false,
        error: 'Team intelligence not found.',
        input: req.params.teamName,
      });
    }

    // Same shape as the original route: { success, data, zkId }
    return res.json({ success: true, data: result.data, zkId: result.zkId });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/intelligence/h2h/:teamA/:teamB
 * Aggregate H2H — pure memory lookup, no entity-file reads.
 * First param is treated as HOME so counts come back home/away oriented.
 */
router.get('/h2h/:teamA/:teamB', async (req, res, next) => {
  try {
    const { teamA, teamB } = req.params;

    const a = intel.resolveTeamId(teamA);
    const b = intel.resolveTeamId(teamB);

    if (!a || !b) {
      return res.status(404).json({
        success: false,
        error: 'One or both team identities could not be resolved.',
        inputs: [teamA, teamB],
        resolved: { teamA: a || null, teamB: b || null },
      });
    }

    const data = await intel.getH2H(a, b);
    return res.json({ success: true, homeId: a, awayId: b, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;