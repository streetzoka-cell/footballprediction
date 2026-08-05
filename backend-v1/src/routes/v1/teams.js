const express = require('express');
const router = express.Router();
const path = require('path');
const fsSync = require('fs');
const ProviderManager = require('../../providers/ProviderManager');
const cache = require('../../cache/MemoryCache');
const logger = require('../../utils/logger');
const { getDateOffset } = require('../../config/constants');

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
    // Hardcode season 2026 for now, can be made dynamic later
    const teams = await ProviderManager.getTeams(leagueId, 2026);
    
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

// ★ SEO FIX: Targeted Team Fixtures Endpoint (Lightweight for Googlebot)
router.get('/:teamId/fixtures', async (req, res, next) => {
  try {
    const teamId = String(req.params.teamId);
    const cacheKey = `team-fixtures:${teamId}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`[Gateway] Cache HIT for ${cacheKey}`);
      return res.json(cached);
    }

    logger.info(`[Gateway] Cache MISS for ${cacheKey}. Reading local snapshots...`);
    
    const today = getDateOffset(0);
    const yesterday = getDateOffset(-1);
    const tomorrow = getDateOffset(1);
    
    const dates = [today, yesterday, tomorrow];
    let teamMatches = [];
    
    for (const date of dates) {
      const filePath = path.join(process.cwd(), 'public_data', 'fixtures', `${date}.json`);
      if (fsSync.existsSync(filePath)) {
        const raw = fsSync.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const matches = parsed.matches || parsed.data || [];
        
        const filtered = matches.filter(m => 
          String(m.homeTeamId) === teamId || String(m.awayTeamId) === teamId ||
          String(m.homeTeam?.id) === teamId || String(m.awayTeam?.id) === teamId
        );
        teamMatches = [...teamMatches, ...filtered];
      }
    }
    
    teamMatches.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // Cache for 10 minutes to prevent disk spam during heavy crawling
    cache.set(cacheKey, teamMatches, 10 * 60 * 1000);
    res.json(teamMatches);
  } catch (err) { next(err); }
});

module.exports = router;