// backend-v1/src/routes/v1/teams.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fsSync = require('fs');

const ProviderManager = require('../../providers/ProviderManager');
const cache = require('../../cache/MemoryCache');
const logger = require('../../utils/logger');
const { getDateOffset, CURRENT_SEASON } = require('../../config/constants');

// GET /api/v1/teams?league=39
router.get('/', async (req, res, next) => {
  try {
    const leagueId = req.query.league;
    if (!leagueId) {
      return res.status(400).json({ success: false, error: 'Missing league parameter' });
    }

    const cacheKey = `teams:${leagueId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const teams = await ProviderManager.getTeams(leagueId, CURRENT_SEASON); // ← was hardcoded 2026

    if (!teams || teams.length === 0) {
      return res.status(404).json({ success: false, error: 'Teams not found for this league' });
    }

    cache.set(cacheKey, teams, 24 * 60 * 60 * 1000);
    return res.json({ success: true, data: teams });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/teams/:teamId/fixtures — MUST come before /:id
router.get('/:teamId/fixtures', async (req, res, next) => {
  try {
    const teamId = String(req.params.teamId);
    const cacheKey = `team-fixtures:${teamId}`;

    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const dates = [getDateOffset(-1), getDateOffset(0), getDateOffset(1)];
    let teamMatches = [];

    for (const date of dates) {
      const filePath = path.join(process.cwd(), 'public_data', 'fixtures', `${date}.json`);
      if (!fsSync.existsSync(filePath)) continue;

      try {
        const parsed = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
        const matches = Array.isArray(parsed) ? parsed : (parsed.matches || parsed.data || []);

        const filtered = matches.filter((match) => {
          const homeId = match.homeTeamId ?? match.homeTeam?.id;
          const awayId = match.awayTeamId ?? match.awayTeam?.id;
          return String(homeId) === teamId || String(awayId) === teamId;
        });

        teamMatches.push(...filtered);
      } catch (fileError) {
        logger.warn(`[TeamFixtures] Failed reading ${filePath}: ${fileError.message}`);
      }
    }

    teamMatches = Array.from(new Map(teamMatches.map((m) => [String(m.id), m])).values());
    teamMatches.sort((a, b) => (a.timestamp ?? a.kickoff ?? 0) - (b.timestamp ?? b.kickoff ?? 0));

    const response = { success: true, data: teamMatches, count: teamMatches.length, teamId };
    cache.set(cacheKey, response, 10 * 60 * 1000);
    return res.json(response);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/teams/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const cacheKey = `team:${id}`;

    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const team = await ProviderManager.getTeam(id);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

    cache.set(cacheKey, team, 7 * 24 * 60 * 60 * 1000);
    return res.json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
});

module.exports = router;