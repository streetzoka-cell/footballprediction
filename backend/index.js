const express = require("express");

const { initializeFirebase, getDb } = require("./config/firebase");
const { getRemainingRequests } = require("./config/api");
const {
  getBasketballRemainingRequests,
  isBasketballConfigured,
} = require("./config/basketballApi");
const { COLLECTIONS, getDateOffset } = require("./config/constants"); // Added getDateOffset
const env = require("./config/env");
const logger = require("./utils/logger");
const cache = require("./utils/cache");

// Repositories
const FixturesRepository = require("./repositories/fixturesRepository");
const TeamRepository = require("./repositories/teamRepository");
const StandingRepository = require("./repositories/standingRepository");
const LeagueRepository = require("./repositories/leagueRepository");
const BasketballFixturesRepository = require("./repositories/basketballFixturesRepository");

// Processors
const FinishedFixturesProcessor = require("./services/finishedFixtures");
const TeamsProcessor = require("./services/teams");
const BasketballFinishedFixturesProcessor = require("./services/basketballFinishedFixtures");

// Services
const DailyFixturesService = require("./services/dailyFixtures");
const LiveFixturesService = require("./services/liveFixtures");
const StandingsService = require("./services/standings");
const LeaguesService = require("./services/leagues");
const BasketballDailyFixturesService = require("./services/basketballDailyFixtures");
const BasketballLiveFixturesService = require("./services/basketballLiveFixtures");

const TopMatchesDetailsService = require("./services/topMatchesDetails");

// Scheduler
const Scheduler = require("./schedulers/scheduler");

let scheduler = null;
let server = null;
let isShuttingDown = false;

// Cache TTLs (24h). Cleared explicitly by scheduler on writes.
const CACHE_TTL = {
  LIVE: 86400000,
  TODAY: 86400000,
  TOMORROW: 86400000,
  YESTERDAY: 86400000,
  FINISHED: 86400000,
  REFERENCE: 86400000,
};

// Client Cache TTLs (browser revalidation)
const CLIENT_CACHE_TTL = {
  LIVE: 15,
  TODAY: 30,
  TOMORROW: 60,
  YESTERDAY: 300,
  FINISHED: 300,
  REFERENCE: 600,
};

const ENDPOINT_CONFIG = {
  [COLLECTIONS.TODAY_FIXTURES]: { cacheKey: "ft:today", ttl: CACHE_TTL.TODAY, clientTTL: CLIENT_CACHE_TTL.TODAY },
  [COLLECTIONS.TOMORROW_FIXTURES]: { cacheKey: "ft:tomorrow", ttl: CACHE_TTL.TOMORROW, clientTTL: CLIENT_CACHE_TTL.TOMORROW },
  [COLLECTIONS.YESTERDAY_FIXTURES]: { cacheKey: "ft:yesterday", ttl: CACHE_TTL.YESTERDAY, clientTTL: CLIENT_CACHE_TTL.YESTERDAY },
  [COLLECTIONS.LIVE_FIXTURES]: { cacheKey: "ft:live", ttl: CACHE_TTL.LIVE, clientTTL: CLIENT_CACHE_TTL.LIVE },
  [COLLECTIONS.FINISHED_FIXTURES]: { cacheKey: "ft:finished", ttl: CACHE_TTL.FINISHED, clientTTL: CLIENT_CACHE_TTL.FINISHED },
  [COLLECTIONS.BASKETBALL_TODAY_FIXTURES]: { cacheKey: "bb:today", ttl: CACHE_TTL.TODAY, clientTTL: CLIENT_CACHE_TTL.TODAY },
  [COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES]: { cacheKey: "bb:tomorrow", ttl: CACHE_TTL.TOMORROW, clientTTL: CLIENT_CACHE_TTL.TOMORROW },
  [COLLECTIONS.BASKETBALL_YESTERDAY_FIXTURES]: { cacheKey: "bb:yesterday", ttl: CACHE_TTL.YESTERDAY, clientTTL: CLIENT_CACHE_TTL.YESTERDAY },
  [COLLECTIONS.BASKETBALL_LIVE_FIXTURES]: { cacheKey: "bb:live", ttl: CACHE_TTL.LIVE, clientTTL: CLIENT_CACHE_TTL.LIVE },
  [COLLECTIONS.BASKETBALL_FINISHED_FIXTURES]: { cacheKey: "bb:finished", ttl: CACHE_TTL.FINISHED, clientTTL: CLIENT_CACHE_TTL.FINISHED },
  [COLLECTIONS.LEAGUES]: { cacheKey: "ref:leagues", ttl: CACHE_TTL.REFERENCE, clientTTL: CLIENT_CACHE_TTL.REFERENCE },
  [COLLECTIONS.TEAMS]: { cacheKey: "ref:teams", ttl: CACHE_TTL.REFERENCE, clientTTL: CLIENT_CACHE_TTL.REFERENCE },
  [COLLECTIONS.STANDINGS]: { cacheKey: "ref:standings", ttl: CACHE_TTL.REFERENCE, clientTTL: CLIENT_CACHE_TTL.REFERENCE },
  [COLLECTIONS.BASKETBALL_LEAGUES]: { cacheKey: "ref:bb:leagues", ttl: CACHE_TTL.REFERENCE, clientTTL: CLIENT_CACHE_TTL.REFERENCE },
  [COLLECTIONS.BASKETBALL_TEAMS]: { cacheKey: "ref:bb:teams", ttl: CACHE_TTL.REFERENCE, clientTTL: CLIENT_CACHE_TTL.REFERENCE },
  [COLLECTIONS.BASKETBALL_STANDINGS]: { cacheKey: "ref:bb:standings", ttl: CACHE_TTL.REFERENCE, clientTTL: CLIENT_CACHE_TTL.REFERENCE },
};

async function cachedCollectionEndpoint(req, res, collectionName) {
  const config = ENDPOINT_CONFIG[collectionName];

  if (!config) {
    logger.error(`[API] No config for collection: ${collectionName}`);
    return res.status(500).json({ error: "Unknown collection" });
  }

  const { cacheKey, ttl, clientTTL } = config;

  try {
    const data = await cache.getOrSet(cacheKey, async () => {
      const db = getDb();
      const snapshot = await db.collection(collectionName).get();
      return snapshot.docs.map((doc) => doc.data());
    }, ttl);

    res.set("Cache-Control", `public, max-age=${clientTTL}`);
    res.json(data);
  } catch (err) {
    logger.error(`[API] Error reading ${collectionName}: ${err.message}`);

    // Fallback to stale cache on error
    const staleEntry = cache._store.get(cacheKey);
    if (staleEntry) {
      logger.warn(`[API] Returning stale cache for ${collectionName}`);
      res.set("Cache-Control", `public, max-age=0, must-revalidate`);
      return res.json(staleEntry.data);
    }

    res.status(500).json({ error: "Internal server error" });
  }
}

function startServer() {
  const app = express();

  // CORS
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Health Check
  app.get("/health", (req, res) => {
    const jobStatus = scheduler?.getStatus() ?? null;
    const degraded = jobStatus?.jobs
      ? Object.values(jobStatus.jobs).some((job) => job.errorCount > 3)
      : false;

    res.json({
      status: degraded ? "degraded" : "healthy",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      budget: {
        football: getRemainingRequests() ?? "unknown",
        basketball: isBasketballConfigured
          ? getBasketballRemainingRequests() ?? "disabled"
          : "disabled",
      },
      football: "enabled",
      basketball: isBasketballConfigured ? "enabled" : "disabled",
      scheduler: {
        running: jobStatus?.running ?? false,
        jobs: jobStatus?.jobs ?? {},
      },
      cache: cache.stats(),
    });
  });

  app.get("/health/simple", (_, res) => res.send("OK"));

  // Scheduler Status (Visibility)
  app.get("/api/scheduler/status", (req, res) => {
    const status = scheduler?.getStatus() ?? null;
    if (!status) return res.status(404).json({ error: "Scheduler not initialized" });
    res.json(status);
  });

  // ─────────────────────────────────────────────────────────────
  // DYNAMIC DATE FIXTURES ROUTE (Local Time Support)
  // ─────────────────────────────────────────────────────────────
  app.get("/api/fixtures", async (req, res) => {
    const dateStr = req.query.date; // e.g., 2023-10-25
    
    if (!dateStr) {
      // Fallback to today if no date provided
      return cachedCollectionEndpoint(req, res, COLLECTIONS.TODAY_FIXTURES);
    }

    // Map the requested local date to our internal UTC-tracked collections
    const today = getDateOffset(0);
    const tomorrow = getDateOffset(1);
    const yesterday = getDateOffset(-1);

    let collectionName = COLLECTIONS.TODAY_FIXTURES;
    if (dateStr === today) collectionName = COLLECTIONS.TODAY_FIXTURES;
    else if (dateStr === tomorrow) collectionName = COLLECTIONS.TOMORROW_FIXTURES;
    else if (dateStr === yesterday) collectionName = COLLECTIONS.YESTERDAY_FIXTURES;
    else {
      // If the date is outside our 3-day window, return empty to save budget
      return res.json([]);
    }

    return cachedCollectionEndpoint(req, res, collectionName);
  });

  // Football Fixtures (Legacy Routes for backward compatibility)
  app.get("/api/fixtures/today", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.TODAY_FIXTURES));
  app.get("/api/fixtures/tomorrow", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.TOMORROW_FIXTURES));
  app.get("/api/fixtures/yesterday", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.YESTERDAY_FIXTURES));
  app.get("/api/fixtures/live", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.LIVE_FIXTURES));
  app.get("/api/fixtures/finished", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.FINISHED_FIXTURES));

  // Basketball Fixtures
  app.get("/api/basketball/today", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_TODAY_FIXTURES));
  app.get("/api/basketball/tomorrow", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES));
  app.get("/api/basketball/yesterday", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_YESTERDAY_FIXTURES));
  app.get("/api/basketball/live", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_LIVE_FIXTURES));
  app.get("/api/basketball/finished", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_FINISHED_FIXTURES));

  // Reference Data
  app.get("/api/leagues", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.LEAGUES));
  app.get("/api/teams", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.TEAMS));
  app.get("/api/standings", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.STANDINGS));
  app.get("/api/basketball/leagues", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_LEAGUES));
  app.get("/api/basketball/teams", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_TEAMS));
  app.get("/api/basketball/standings", (req, res) => cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_STANDINGS));

  // Match Details Endpoint (0 API Calls - Reads strictly from Cache)
  app.get("/api/match/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const db = getDb();
      const docRef = db.collection("match_details").doc(id);
      const docSnap = await docRef.get();
      
      if (docSnap.exists) {
        return res.json(docSnap.data());
      }
      return res.status(404).json({ error: "Details not available for this match." });
    } catch (err) {
      logger.error(`[API] Match details read error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Manual Recovery
  app.get("/api/recover", async (req, res) => {
    const sport = req.query.sport || "all";

    try {
      const db = getDb();
      const results = {};

      if (sport === "all" || sport === "football") {
        try { await db.collection("meta").doc("footballScheduler").delete(); } catch (_) {}
        if (scheduler?.services?.footballDailyFixtures) {
          results.football = await scheduler.services.footballDailyFixtures.run();
        }
      }

      if (sport === "all" || sport === "basketball") {
        try { await db.collection("meta").doc("basketballScheduler").delete(); } catch (_) {}
        if (scheduler?.services?.basketballDailyFixtures) {
          results.basketball = await scheduler.services.basketballDailyFixtures.run();
        }
      }

      cache.clear();
      res.json({ success: true, results });
    } catch (err) {
      logger.error(`[Recover] Failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // OG Image Proxy
  app.get("/api/og-image/:postId", async (req, res) => {
    try {
      const db = getDb();
      const snap = await db.collection("news_posts").doc(req.params.postId).get();
      
      if (!snap.exists) return res.redirect("https://zokascore.xyz/logo.png");
      
      const { imageUrl } = snap.data();
      
      if (imageUrl && imageUrl.startsWith("data:image")) {
        const base64Data = imageUrl.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        res.set("Content-Type", "image/jpeg");
        res.set("Cache-Control", "public, max-age=86400");
        return res.send(buffer);
      } else if (imageUrl) {
        return res.redirect(imageUrl);
      } else {
        return res.redirect("https://zokascore.xyz/logo.png");
      }
    } catch (err) {
      return res.redirect("https://zokascore.xyz/logo.png");
    }
  });

  // 404 Fallback
  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  server = app.listen(env.PORT, () => {
    logger.info(`[Server] Listening on port ${env.PORT}`);
  });

  return server;
}

function setupShutdownHandlers() {
  const shutdown = async (source) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`[Shutdown] Initiated by ${source}`);
    if (scheduler) scheduler.stop();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info("[Shutdown] Express closed");
    }

    logger.info("[Shutdown] Complete");
    process.exit(0);
  };

  process.on("message", (msg) => {
    if (msg.cmd === "shutdown") shutdown("PM2");
  });
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (error) => {
    logger.error(`[Fatal] Uncaught: ${error.message}`, { stack: error.stack });
  });
  process.on("unhandledRejection", (reason) => {
    logger.error(`[Fatal] Unhandled rejection: ${reason}`);
  });
}

async function main() {
  const startTime = Date.now();

  logger.info("╔══════════════════════════════════════════╗");
  logger.info("║   Sports Sync — Starting                 ║");
  logger.info("╚══════════════════════════════════════════╝");

  try {
    initializeFirebase();
  } catch (error) {
    logger.error(`[Startup] Firebase failed: ${error.message}`);
    process.exit(1);
  }

  const fixturesRepo = new FixturesRepository();
  const teamRepo = new TeamRepository();
  const standingRepo = new StandingRepository();
  const leagueRepo = new LeagueRepository();
  const basketballFixturesRepo = new BasketballFixturesRepository();

  const ftProcessor = new FinishedFixturesProcessor(fixturesRepo);
  const teamsProcessor = new TeamsProcessor(teamRepo);
  const basketballFtProcessor = new BasketballFinishedFixturesProcessor(basketballFixturesRepo);

  const services = {
    footballDailyFixtures: new DailyFixturesService(fixturesRepo, teamsProcessor),
    footballLiveFixtures: new LiveFixturesService(fixturesRepo, ftProcessor),
    footballStandings: new StandingsService(standingRepo),
    footballLeagues: new LeaguesService(leagueRepo),
  };

  if (isBasketballConfigured) {
    logger.info("[Startup] Basketball enabled");
    services.basketballDailyFixtures = new BasketballDailyFixturesService(basketballFixturesRepo);
    services.basketballLiveFixtures = new BasketballLiveFixturesService(basketballFixturesRepo, basketballFtProcessor);
  } else {
    logger.warn("[Startup] Basketball disabled — set API_BASKETBALL_KEY");
  }

  scheduler = new Scheduler(services);

  try {
    await scheduler.runInitialSync();
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    logger.error(`[Startup] Initial sync error: ${error.message}`);
  }

  if (process.send) process.send("ready");

  scheduler.start();
  startServer();
  setupShutdownHandlers();

  // Start Top Matches Background Poller (Runs every 5 minutes)
  const topMatchesService = new TopMatchesDetailsService();
  setInterval(() => {
    topMatchesService.run().catch(err => logger.error(`[TopMatches] Error: ${err.message}`));
  }, 300000); 

  const duration = Date.now() - startTime;
  const bball = isBasketballConfigured ? "✅ ON" : "⬜ OFF";

  logger.info("╔════════════════════════════════════════╗");
  logger.info(`║  Ready in ${String(duration).padStart(4)}ms                       ║`);
  logger.info(`║  API:    http://localhost:${env.PORT}/api/     ║`);
  logger.info(`║  Health: http://localhost:${env.PORT}/health   ║`);
  logger.info(`║  Football:   ✅ ON                       ║`);
  logger.info(`║  Basketball: ${bball.padEnd(26)}║`);
  logger.info("║  Cache TTL:  24h (invalidate-only)     ║");
  logger.info("║  Herd guard: getOrSet lock active      ║");
  logger.info("║  Client reads: 0 Firestore reads       ║");
  logger.info("╚════════════════════════════════════════╝");
}

main().catch((error) => {
  logger.error(`[Startup] Fatal: ${error.message}`, { stack: error.stack });
  process.exit(1);
});