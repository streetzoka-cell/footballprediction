const express = require("express");
const router = express.Router();
const competitionsService = require("../services/competitions");
const cache = require("../utils/cache");
const memCache = require("../utils/memoryCache");
const logger = require("../utils/logger");

router.get("/", async (req, res) => {
  try {
    var force = req.query.force === "true";
    if (force) {
      memCache.del("competitions");
      logger.info("[ROUTE] /api/competitions - force refresh");
      var data = await competitionsService.fetchAndCache();
      memCache.set("competitions", data);
      return res.json({ data: data, cached: false, lastUpdated: new Date().toISOString(), source: "api" });
    }
    var data = memCache.get("competitions", 3600000);
    if (!data) {
      data = await competitionsService.getCached();
      memCache.set("competitions", data);
    }
    var meta = memCache.get("meta:competitions", 60000) || await cache.getLastUpdated("competitions");
    memCache.set("meta:competitions", meta);
    res.json({
      data: data,
      cached: true,
      lastUpdated: meta ? meta.timestamp : null,
      source: "cache",
    });
  } catch (err) {
    logger.error("[ROUTE] /api/competitions error: " + err.message);
    res.status(500).json({ error: "Failed to fetch competitions" });
  }
});

module.exports = router;
