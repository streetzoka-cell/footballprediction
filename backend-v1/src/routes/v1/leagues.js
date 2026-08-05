const express = require('express');
const router = express.Router();
const path = require('path');
const fsSync = require('fs');
const localSnapshotRepo = require('../../repositories/LocalSnapshotRepository');
const { getLeagues, findLeague } = require('../../config/leagues');
const cache = require('../../cache/MemoryCache');
const logger = require('../../utils/logger');
const { getDateOffset } = require('../../config/constants');

/**
 * GET /api/v1/leagues
 */
router.get('/', async (req, res, next) => {
  try {
    const dynamicLeagues = await localSnapshotRepo.getLeaguesSnapshot();

    if (dynamicLeagues && dynamicLeagues.length > 0) {
      return res.json({
        data: dynamicLeagues,
        count: dynamicLeagues.length,
      });
    }

    const leagues = getLeagues();

    return res.json({
      data: leagues,
      count: leagues.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/leagues/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const league = findLeague(req.params.id);

    if (!league) {
      return res.status(404).json({
        data: null,
        error: 'League not found',
      });
    }

    return res.json({
      data: league,
    });
  } catch (err) {
    next(err);
  }
});

// ★ SEO FIX: Targeted League Fixtures Endpoint (Lightweight for Googlebot)
router.get('/:leagueId/fixtures', async (req, res, next) => {
  try {
    const leagueId = String(req.params.leagueId);
    const cacheKey = `league-fixtures:${leagueId}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`[Gateway] Cache HIT for ${cacheKey}`);
      return res.json(cached);
    }

    logger.info(`[Gateway] Cache MISS for ${cacheKey}. Reading local snapshots...`);

    const today = getDateOffset(0);
    const tomorrow = getDateOffset(1);
    
    const dates = [today, tomorrow];
    let leagueMatches = [];
    
    for (const date of dates) {
      const filePath = path.join(process.cwd(), 'public_data', 'fixtures', `${date}.json`);
      if (fsSync.existsSync(filePath)) {
        const raw = fsSync.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const matches = parsed.matches || parsed.data || [];
        
        const filtered = matches.filter(m => 
          String(m.leagueId) === leagueId || String(m.league?.id) === leagueId
        );
        leagueMatches = [...leagueMatches, ...filtered];
      }
    }
    
    leagueMatches.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const result = leagueMatches.slice(0, 15); // Limit to 15 for performance
    
    cache.set(cacheKey, result, 10 * 60 * 1000);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;