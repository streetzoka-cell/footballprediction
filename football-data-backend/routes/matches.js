const express = require("express");
const router = express.Router();
const matchesService = require("../services/matches");
const liveService = require("../services/liveMatches");
const finishedService = require("../services/finishedMatches");
const cache = require("../utils/cache");
const memCache = require("../utils/memoryCache");
const logger = require("../utils/logger");

router.get("/live", async (req, res) => {
  try {
    var data = memCache.get("live", 15000);
    if (!data) {
      data = await liveService.getCached();
      memCache.set("live", data);
    }
    var meta = memCache.get("meta:live", 60000) || await cache.getLastUpdated("liveMatches");
    memCache.set("meta:live", meta);
    res.json({ data: data, cached: true, lastUpdated: meta ? meta.timestamp : null });
  } catch (err) {
    logger.error("[ROUTE] /api/live error: " + err.message);
    res.status(500).json({ error: "Failed to fetch live matches" });
  }
});

router.get("/today", async (req, res) => {
  try {
    var data = memCache.get("today", 20000);
    if (!data) {
      data = await matchesService.getCachedToday();
      memCache.set("today", data);
    }
    var meta = memCache.get("meta:live", 60000) || await cache.getLastUpdated("liveMatches");
    memCache.set("meta:live", meta);
    res.json({ data: data, cached: true, lastUpdated: meta ? meta.timestamp : null });
  } catch (err) {
    logger.error("[ROUTE] /api/today error: " + err.message);
    res.status(500).json({ error: "Failed to fetch today fixtures" });
  }
});

router.get("/finished", async (req, res) => {
  try {
    var data = memCache.get("finished", 30000);
    if (!data) {
      data = await finishedService.getCached();
      memCache.set("finished", data);
    }
    var meta = memCache.get("meta:finished", 60000) || await cache.getLastUpdated("finishedFixtures");
    memCache.set("meta:finished", meta);
    res.json({ data: data, cached: true, lastUpdated: meta ? meta.timestamp : null });
  } catch (err) {
    logger.error("[ROUTE] /api/finished error: " + err.message);
    res.status(500).json({ error: "Failed to fetch finished matches" });
  }
});

router.get("/fixtures", async (req, res) => {
  try {
    var data = memCache.get("fixtures", 30000);
    if (!data) {
      data = await matchesService.getCachedAll();
      memCache.set("fixtures", data);
    }
    var meta = memCache.get("meta:fixturesRange", 60000) || await cache.getLastUpdated("fixturesRange");
    memCache.set("meta:fixturesRange", meta);
    res.json({ data: data, cached: true, lastUpdated: meta ? meta.timestamp : null });
  } catch (err) {
    logger.error("[ROUTE] /api/fixtures error: " + err.message);
    res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

module.exports = router;
