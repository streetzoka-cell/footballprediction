const express = require('express');
const router = express.Router();
const competitionsService = require('../services/competitions');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

router.get('/', async (req, res) => {
  try {
    const force = req.query.force === 'true';

    if (force) {
      logger.info('[ROUTE] /api/competitions - force refresh');
      const data = await competitionsService.fetchAndCache();
      return res.json({ data: data, cached: false, lastUpdated: new Date().toISOString(), source: 'api' });
    }

    const data = await competitionsService.getCached();
    const meta = await cache.getLastUpdated('competitions');

    res.json({
      data: data,
      cached: true,
      lastUpdated: meta ? meta.timestamp : null,
      source: 'cache',
    });
  } catch (err) {
    logger.error(`[ROUTE] /api/competitions error: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch competitions' });
  }
});

module.exports = router;
