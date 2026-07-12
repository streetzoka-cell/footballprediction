const express = require('express');
const router = express.Router();
const standingsService = require('../services/standings');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

router.get('/:competition', async (req, res) => {
  try {
    const competition = req.params.competition;
    const force = req.query.force === 'true';

    if (force) {
      logger.info(`[ROUTE] /api/standings/${competition} - force refresh`);
      const data = await standingsService.fetchAndCacheAll();
      const result = data[competition];
      if (!result) return res.status(404).json({ error: `No standings found for ${competition}` });
      return res.json({ data: result, cached: false, lastUpdated: new Date().toISOString(), source: 'api' });
    }

    const data = await standingsService.getCached(competition);
    const meta = await cache.getLastUpdated('standings');

    if (!data) {
      return res.status(404).json({ error: `No cached standings for "${competition}". It may not be a supported competition.` });
    }

    res.json({
      data: data.standings,
      competitionCode: data.competitionCode,
      cached: true,
      lastUpdated: data.fetchedAt || (meta ? meta.timestamp : null),
      source: 'cache',
    });
  } catch (err) {
    logger.error(`[ROUTE] /api/standings/${req.params.competition} error: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch standings' });
  }
});

module.exports = router;
