const express = require("express");
const router = express.Router();
const standingsService = require("../services/standings");
const cache = require("../utils/cache");
const memCache = require("../utils/memoryCache");
const logger = require("../utils/logger");

router.get("/:competition", async (req, res) => {
  try {
    var competition = req.params.competition;
    var force = req.query.force === "true";
    var cacheKey = "standings:" + competition;
    if (force) {
      memCache.del(cacheKey);
      logger.info("[ROUTE] /api/standings/" + competition + " - force refresh");
      var all = await standingsService.fetchAndCacheAll();
      var result = all[competition];
      if (!result) return res.status(404).json({ error: "No standings found for " + competition });
      memCache.set(cacheKey, result);
      return res.json({ data: result, cached: false, lastUpdated: new Date().toISOString(), source: "api" });
    }
    var data = memCache.get(cacheKey, 600000);
    if (!data) {
      data = await standingsService.getCached(competition);
      if (data) memCache.set(cacheKey, data);
    }
    if (!data) {
      return res.status(404).json({ error: "No cached standings for " + competition + "." });
    }
    var meta = memCache.get("meta:standings", 60000) || await cache.getLastUpdated("standings");
    memCache.set("meta:standings", meta);
    res.json({
      data: data.standings,
      competitionCode: data.competitionCode,
      cached: true,
      lastUpdated: data.fetchedAt || (meta ? meta.timestamp : null),
      source: "cache",
    });
  } catch (err) {
    logger.error("[ROUTE] /api/standings/" + req.params.competition + " error: " + err.message);
    res.status(500).json({ error: "Failed to fetch standings" });
  }
});

module.exports = router;
