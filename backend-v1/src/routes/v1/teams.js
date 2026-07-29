// backend-v1/src/routes/v1/teams.js
const express = require('express');
const router = express.Router();
const ProviderManager = require('../../providers/ProviderManager');
const cache = require('../../cache/MemoryCache');
const logger = require('../../utils/logger');

// GET /api/v1/teams?league=39
router.get('/', async (req, res, next) => {
  try {
    const leagueId = req.query.league;
    if (!leagueId) return res.status(400).json({ error: 'Missing league parameter' });
    
    const cacheKey = `teams:${leagueId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`[Gateway] Cache HIT for ${cacheKey}`);
      return res.json({ data: cached });
    }

    logger.info(`[Gateway] Cache MISS for ${cacheKey}. Fetching from provider...`);
    // Hardcode season 2024 for now, can be made dynamic later
    const teams = await ProviderManager.getTeams(leagueId, 2024);
    
    if (!teams || teams.length === 0) {
      return res.status(404).json({ error: 'Teams not found for this league' });
    }

    // Cache for 24 hours to save API quota
    cache.set(cacheKey, teams, 24 * 60 * 60 * 1000);
    res.json({ data: teams });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/teams/:id (Single team details from TheSportsDB)
router.get('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const cacheKey = `team:${id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`[Gateway] Cache HIT for ${cacheKey}`);
      return res.json({ data: cached });
    }

    logger.info(`[Gateway] Cache MISS for ${cacheKey}. Fetching from provider...`);
    const team = await ProviderManager.getTeam(id);
    
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    cache.set(cacheKey, team, 7 * 24 * 60 * 60 * 1000);
    res.json({ data: team });
  } catch (err) {
    next(err);
  }
});

module.exports = router;