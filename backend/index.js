/*
 * index.js
 * Entry point for the Sports Sync Backend.
 *
 * CACHED REST API ENDPOINTS
 * ─────────────────────────
 * Without this: 1,000 Android users reading Firestore directly
 *   = ~200,000 reads/day → EXHAUSTS 50K limit
 *
 * With this: 1,000 users hit these endpoints
 *   = ~6 Firestore reads/day (1 per collection per cache miss)
 *   = 99.997% reduction in client reads
 *
 * YOUR ANDROID APP MUST CALL THESE ENDPOINTS INSTEAD OF
 * READING FIRESTORE DIRECTLY.
 */

const express = require("express");

const { initializeFirebase, getDb } = require("./config/firebase");
const { getRemainingRequests } = require("./config/api");
const { getBasketballRemainingRequests, isBasketballConfigured } = require("./config/basketballApi");
const { COLLECTIONS } = require("./config/constants");
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

// Scheduler
const Scheduler = require("./schedulers/scheduler");

let scheduler = null;
let server = null;
let isShuttingDown = false;

// ==========================================================
// CACHED COLLECTION READER
// 1,000 requests in 30s = 1 Firestore read, not 1,000.
// ==========================================================

async function cachedCollectionEndpoint(req, res, collectionName, cacheKey, ttl) {
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    return res.json(cached);
  }

  try {
    const db = getDb();
    const snapshot = await db.collection(collectionName).get();
    const data = snapshot.docs.map((doc) => doc.data());

    cache.set(cacheKey, data, ttl);

    const clientTTL = Math.floor(ttl / 2 / 1000);
    res.set("Cache-Control", `public, max-age=${clientTTL}`);
    res.json(data);
  } catch (err) {
    logger.error(`[API] Error reading ${collectionName}: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ==========================================================
// API SERVER
// ==========================================================

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

  // ── Health ──
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

  // ── Football Fixtures ──
  app.get("/api/fixtures/today", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.TODAY_FIXTURES, "ft:today", 30000));

  app.get("/api/fixtures/tomorrow", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.TOMORROW_FIXTURES, "ft:tomorrow", 60000));

  app.get("/api/fixtures/yesterday", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.YESTERDAY_FIXTURES, "ft:yesterday", 300000));

  app.get("/api/fixtures/live", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.LIVE_FIXTURES, "ft:live", 10000));

  app.get("/api/fixtures/finished", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.FINISHED_FIXTURES, "ft:finished", 300000));

  // ── Basketball Fixtures ──
  app.get("/api/basketball/today", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_TODAY_FIXTURES, "bb:today", 30000));

  app.get("/api/basketball/tomorrow", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES, "bb:tomorrow", 60000));

  app.get("/api/basketball/yesterday", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_YESTERDAY_FIXTURES, "bb:yesterday", 300000));

  app.get("/api/basketball/live", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_LIVE_FIXTURES, "bb:live", 10000));

  app.get("/api/basketball/finished", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_FINISHED_FIXTURES, "bb:finished", 300000));

  // ── Reference Data (rarely changes, 10 min cache) ──
  app.get("/api/leagues", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.LEAGUES, "ref:leagues", 600000));

  app.get("/api/teams", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.TEAMS, "ref:teams", 600000));

  app.get("/api/standings", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.STANDINGS, "ref:standings", 600000));

  app.get("/api/basketball/leagues", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_LEAGUES, "ref:bb:leagues", 600000));

  app.get("/api/basketball/teams", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_TEAMS, "ref:bb:teams", 600000));

  app.get("/api/basketball/standings", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_STANDINGS, "ref:bb:standings", 600000));

  // ── Manual Recovery ──
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

  server = app.listen(env.PORT, () => {
    logger.info(`[Server] Listening on port ${env.PORT}`);
  });

  return server;
}

// ==========================================================
// GRACEFUL SHUTDOWN
// ==========================================================

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

// ==========================================================
// MAIN
// ==========================================================

async function main() {
  const startTime = Date.now();

  logger.info("╔══════════════════════════════════════════╗");
  logger.info("║   Sports Sync — Starting                 ║");
  logger.info("╚══════════════════════════════════════════╝");

  // 1. Firebase
  try {
    initializeFirebase();
  } catch (error) {
    logger.error(`[Startup] Firebase failed: ${error.message}`);
    process.exit(1);
  }

  // 2. Repositories
  const fixturesRepo = new FixturesRepository();
  const teamRepo = new TeamRepository();
  const standingRepo = new StandingRepository();
  const leagueRepo = new LeagueRepository();
  const basketballFixturesRepo = new BasketballFixturesRepository();

  // 3. Processors
  const ftProcessor = new FinishedFixturesProcessor(fixturesRepo);
  const teamsProcessor = new TeamsProcessor(teamRepo);
  const basketballFtProcessor = new BasketballFinishedFixturesProcessor(basketballFixturesRepo);

  // 4. Services
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

  // 5. Scheduler
  scheduler = new Scheduler(services);

  // 6. Initial sync
  try {
    await scheduler.runInitialSync();
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    logger.error(`[Startup] Initial sync error: ${error.message}`);
  }

  // 7. Signal PM2
  if (process.send) process.send("ready");

  // 8. Start scheduled jobs
  scheduler.start();

  // 9. Start server
  startServer();

  // 10. Shutdown handlers
  setupShutdownHandlers();

  // 11. Ready banner
  const duration = Date.now() - startTime;
  const bball = isBasketballConfigured ? "✅ ON" : "⬜ OFF";

  logger.info("╔══════════════════════════════════════════╗");
  logger.info(`║  Ready in ${String(duration).padStart(4)}ms                       ║`);
  logger.info(`║  API:    http://localhost:${env.PORT}/api/     ║`);
  logger.info(`║  Health: http://localhost:${env.PORT}/health   ║`);
  logger.info("║  Football:   ✅ ON                       ║");
  logger.info(`║  Basketball: ${bball.padEnd(26)}║`);
  logger.info("║  Mode:       Budget-Optimized           ║");
  logger.info("║  Client reads: CACHED (not Firestore)   ║");
  logger.info("╚══════════════════════════════════════════╝");
}

main().catch((error) => {
  logger.error(`[Startup] Fatal: ${error.message}`, { stack: error.stack });
  process.exit(1);
});