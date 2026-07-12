const express = require('express');
const router = express.Router();
const matchesService = require('../services/matches');
const liveService = require('../services/liveMatches');
const finishedService = require('../services/finishedMatches');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

router.get('/live', async (req, res) => {
  try {
    const data = await liveService.getCached();
    const meta = await cache.getLastUpdated('liveMatches');
    res.json({ data: data, cached: true, lastUpdated: meta ? meta.timestamp : null });
  } catch (err) {
    logger.error('[ROUTE] /api/live error: ' + err.message);
    res.status(500).json({ error: 'Failed to fetch live matches' });
  }
});

router.get('/today', async (req, res) => {
  try {
    const data = await matchesService.getCachedToday();
    const meta = await cache.getLastUpdated('liveMatches');
    res.json({ data: data, cached: true, lastUpdated: meta ? meta.timestamp : null });
  } catch (err) {
    logger.error('[ROUTE] /api/today error: ' + err.message);
    res.status(500).json({ error: 'Failed to fetch today fixtures' });
  }
});

router.get('/finished', async (req, res) => {
  try {
    const data = await finishedService.getCached();
    const meta = await cache.getLastUpdated('finishedFixtures');
    res.json({ data: data, cached: true, lastUpdated: meta ? meta.timestamp : null });
  } catch (err) {
    logger.error('[ROUTE] /api/finished error: ' + err.message);
    res.status(500).json({ error: 'Failed to fetch finished matches' });
  }
});

router.get('/fixtures', async (req, res) => {
  try {
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ error: 'dateFrom and dateTo query params required (YYYY-MM-DD)' });
    }
    const data = await matchesService.getCachedByDateRange(dateFrom, dateTo);
    const meta = await cache.getLastUpdated('fixturesRange');
    res.json({ data: data, cached: true, dateFrom: dateFrom, dateTo: dateTo, lastUpdated: meta ? meta.timestamp : null });
  } catch (err) {
    logger.error('[ROUTE] /api/fixtures error: ' + err.message);
    res.status(500).json({ error: 'Failed to fetch fixtures' });
  }
});

module.exports = router;
