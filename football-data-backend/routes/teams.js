const express = require("express");
const router = express.Router();
const teamsService = require("../services/teams");
const cache = require("../utils/cache");
const memCache = require("../utils/memoryCache");
const logger = require("../utils/logger");

router.get("/:competition", async (req, res) => {
  try {
    var competition = req.params.competition;
    var force = req.query.force === "true";
    var cacheKey = "teams:" + competition;
    if (force) {
      memCache.del(cacheKey);
      logger.info("[ROUTE] /api/teams/" + competition + " - force refresh");
      var all = await teamsService.fetchAndCacheAll();
      var result = all[competition];
      if (!result) return res.status(404).json({ error: "No teams found for " + competition });
      memCache.set(cacheKey, result);
      return res.json({ data: result, cached: false, lastUpdated: new Date().toISOString(), source: "api" });
    }
    var data = memCache.get(cacheKey, 600000);
    if (!data) {
      data = await teamsService.getCached(competition);
      if (data) memCache.set(cacheKey, data);
    }
    if (!data) {
      return res.status(404).json({ error: "No cached teams for " + competition + "." });
    }
    var meta = memCache.get("meta:teams", 60000) || await cache.getLastUpdated("teams");
    memCache.set("meta:teams", meta);
    res.json({
      data: data.teams,
      competitionCode: data.competitionCode,
      cached: true,
      lastUpdated: data.fetchedAt || (meta ? meta.timestamp : null),
      source: "cache",
    });
  } catch (err) {
    logger.error("[ROUTE] /api/teams/" + req.params.competition + " error: " + err.message);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

module.exports = router;
