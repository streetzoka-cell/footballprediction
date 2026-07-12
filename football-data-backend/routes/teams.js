const express = require('express');
const router = express.Router();
const teamsService = require('../services/teams');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

router.get('/:competition', async (req, res) => {
  try {
    const competition = req.params.competition;
    const force = req.query.force === 'true';

    if (force) {
      logger.info(`[ROUTE] /api/teams/${competition} - force refresh`);
      const data = await teamsService.fetchAndCacheAll();
      const result = data[competition];
      if (!result) return res.status(404).json({ error: `No teams found for ${competition}` });
      return res.json({ data: result, cached: false, lastUpdated: new Date().toISOString(), source: 'api' });
    }

    const data = await teamsService.getCached(competition);
    const meta = await cache.getLastUpdated('teams');

    if (!data) {
      return res.status(404).json({ error: `No cached teams for "${competition}". It may not be a supported competition.` });
    }

    res.json({
      data: data.teams,
      competitionCode: data.competitionCode,
      cached: true,
      lastUpdated: data.fetchedAt || (meta ? meta.timestamp : null),
      source: 'cache',
    });
  } catch (err) {
    logger.error(`[ROUTE] /api/teams/${req.params.competition} error: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

module.exports = router;
