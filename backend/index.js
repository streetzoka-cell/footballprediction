/*
 * index.js
 * Entry point for the Sports Sync Backend.
 *
 * ★ QUOTA FIX: All collection endpoints use 24-hour cache TTLs.
 *   The cache is ONLY cleared when the scheduler writes new data.
 *   Client requests almost never trigger Firestore reads.
 *
 *   getOrSet() prevents thundering herd: after cache invalidation,
 *   1000 concurrent requests cause exactly 1 Firestore read.
 *
 *   Budget math with 2,000 visitors:
 *     Daily sync invalidations:  ~6 reads
 *     Live polling invalidations: ~30 reads
 *     Cold start warmup:          ~12 reads
 *     TOTAL:                      ~48 reads/day (0.1% of 50K limit)
 */

const express = require("express");

const { initializeFirebase, getDb } = require("./config/firebase");
const { getRemainingRequests } = require("./config/api");
const {
  getBasketballRemainingRequests,
  isBasketballConfigured,
} = require("./config/basketballApi");
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

// ═══════════════════════════════════════════════════════════════
// CACHE TTL CONFIGURATION
//
// ★ ALL set to 24 hours. The scheduler explicitly invalidates
//   these when it writes new data. Client requests NEVER cause
//   Firestore reads unless the cache was just invalidated.
//
// The Cache-Control header sent to clients is MUCH shorter
// (15s–5min) so browsers re-validate with the backend
// (which serves from memory cache, not Firestore).
// ═══════════════════════════════════════════════════════════════

const CACHE_TTL = {
  LIVE: 86400000,           // 24h — cleared by live polling service
  TODAY: 86400000,          // 24h — cleared by daily fixtures service
  TOMORROW: 86400000,       // 24h — cleared by daily fixtures service
  YESTERDAY: 86400000,      // 24h — cleared by daily fixtures service
  FINISHED: 86400000,       // 24h — cleared by live/daily services
  REFERENCE: 86400000,      // 24h — cleared by leagues/standings services
};

const CLIENT_CACHE_TTL = {
  LIVE: 15,          // 15s — clients re-validate frequently for live scores
  TODAY: 30,         // 30s
  TOMORROW: 60,      // 1min
  YESTERDAY: 300,    // 5min — yesterday's data barely changes
  FINISHED: 300,     // 5min
  REFERENCE: 600,    // 10min — leagues/teams/standings rarely change
};

// ═══════════════════════════════════════════════════════════════
// COLLECTION → CACHE KEY MAPPING
// ═══════════════════════════════════════════════════════════════

const ENDPOINT_CONFIG = {
  [COLLECTIONS.TODAY_FIXTURES]: {
    cacheKey: "ft:today",
    ttl: CACHE_TTL.TODAY,
    clientTTL: CLIENT_CACHE_TTL.TODAY,
  },
  [COLLECTIONS.TOMORROW_FIXTURES]: {
    cacheKey: "ft:tomorrow",
    ttl: CACHE_TTL.TOMORROW,
    clientTTL: CLIENT_CACHE_TTL.TOMORROW,
  },
  [COLLECTIONS.YESTERDAY_FIXTURES]: {
    cacheKey: "ft:yesterday",
    ttl: CACHE_TTL.YESTERDAY,
    clientTTL: CLIENT_CACHE_TTL.YESTERDAY,
  },
  [COLLECTIONS.LIVE_FIXTURES]: {
    cacheKey: "ft:live",
    ttl: CACHE_TTL.LIVE,
    clientTTL: CLIENT_CACHE_TTL.LIVE,
  },
  [COLLECTIONS.FINISHED_FIXTURES]: {
    cacheKey: "ft:finished",
    ttl: CACHE_TTL.FINISHED,
    clientTTL: CLIENT_CACHE_TTL.FINISHED,
  },
  [COLLECTIONS.BASKETBALL_TODAY_FIXTURES]: {
    cacheKey: "bb:today",
    ttl: CACHE_TTL.TODAY,
    clientTTL: CLIENT_CACHE_TTL.TODAY,
  },
  [COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES]: {
    cacheKey: "bb:tomorrow",
    ttl: CACHE_TTL.TOMORROW,
    clientTTL: CLIENT_CACHE_TTL.TOMORROW,
  },
  [COLLECTIONS.BASKETBALL_YESTERDAY_FIXTURES]: {
    cacheKey: "bb:yesterday",
    ttl: CACHE_TTL.YESTERDAY,
    clientTTL: CLIENT_CACHE_TTL.YESTERDAY,
  },
  [COLLECTIONS.BASKETBALL_LIVE_FIXTURES]: {
    cacheKey: "bb:live",
    ttl: CACHE_TTL.LIVE,
    clientTTL: CLIENT_CACHE_TTL.LIVE,
  },
  [COLLECTIONS.BASKETBALL_FINISHED_FIXTURES]: {
    cacheKey: "bb:finished",
    ttl: CACHE_TTL.FINISHED,
    clientTTL: CLIENT_CACHE_TTL.FINISHED,
  },
  [COLLECTIONS.LEAGUES]: {
    cacheKey: "ref:leagues",
    ttl: CACHE_TTL.REFERENCE,
    clientTTL: CLIENT_CACHE_TTL.REFERENCE,
  },
  [COLLECTIONS.TEAMS]: {
    cacheKey: "ref:teams",
    ttl: CACHE_TTL.REFERENCE,
    clientTTL: CLIENT_CACHE_TTL.REFERENCE,
  },
  [COLLECTIONS.STANDINGS]: {
    cacheKey: "ref:standings",
    ttl: CACHE_TTL.REFERENCE,
    clientTTL: CLIENT_CACHE_TTL.REFERENCE,
  },
  [COLLECTIONS.BASKETBALL_LEAGUES]: {
    cacheKey: "ref:bb:leagues",
    ttl: CACHE_TTL.REFERENCE,
    clientTTL: CLIENT_CACHE_TTL.REFERENCE,
  },
  [COLLECTIONS.BASKETBALL_TEAMS]: {
    cacheKey: "ref:bb:teams",
    ttl: CACHE_TTL.REFERENCE,
    clientTTL: CLIENT_CACHE_TTL.REFERENCE,
  },
  [COLLECTIONS.BASKETBALL_STANDINGS]: {
    cacheKey: "ref:bb:standings",
    ttl: CACHE_TTL.REFERENCE,
    clientTTL: CLIENT_CACHE_TTL.REFERENCE,
  },
};

// ═══════════════════════════════════════════════════════════════
// CACHED COLLECTION ENDPOINT
//
// ★ Uses cache.getOrSet() — thundering herd protected.
//   After invalidation, only the FIRST request reads Firestore.
//   All concurrent requests wait and share the result.
// ═══════════════════════════════════════════════════════════════

async function cachedCollectionEndpoint(req, res, collectionName) {
  const config = ENDPOINT_CONFIG[collectionName];

  if (!config) {
    logger.error(`[API] No config for collection: ${collectionName}`);
    return res.status(500).json({ error: "Unknown collection" });
  }

  const { cacheKey, ttl, clientTTL } = config;

  try {
    const data = await cache.getOrSet(cacheKey, async () => {
      // This closure only runs on cache miss (first request after
      // invalidation or server restart). Reads Firestore ONCE.
      const db = getDb();
      const snapshot = await db.collection(collectionName).get();
      return snapshot.docs.map((doc) => doc.data());
    }, ttl);

    res.set("Cache-Control", `public, max-age=${clientTTL}`);
    res.json(data);
  } catch (err) {
    logger.error(`[API] Error reading ${collectionName}: ${err.message}`);

    // On error, try returning stale cache if available
    // (bypasses TTL check)
    const staleEntry = cache._store.get(cacheKey);
    if (staleEntry) {
      logger.warn(`[API] Returning stale cache for ${collectionName}`);
      res.set("Cache-Control", `public, max-age=0, must-revalidate`);
      return res.json(staleEntry.data);
    }

    res.status(500).json({ error: "Internal server error" });
  }
}

// ═══════════════════════════════════════════════════════════════
// API SERVER
// ═══════════════════════════════════════════════════════════════

function startServer() {
  const app = express();

  // CORS
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // ── Health (no Firestore) ──
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
    cachedCollectionEndpoint(req, res, COLLECTIONS.TODAY_FIXTURES)
  );
  app.get("/api/fixtures/tomorrow", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.TOMORROW_FIXTURES)
  );
  app.get("/api/fixtures/yesterday", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.YESTERDAY_FIXTURES)
  );
  app.get("/api/fixtures/live", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.LIVE_FIXTURES)
  );
  app.get("/api/fixtures/finished", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.FINISHED_FIXTURES)
  );

  // ── Basketball Fixtures ──
  app.get("/api/basketball/today", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_TODAY_FIXTURES)
  );
  app.get("/api/basketball/tomorrow", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES)
  );
  app.get("/api/basketball/yesterday", (req, res) =>
    cachedCollectionEndpoint(
      req,
      res,
      COLLECTIONS.BASKETBALL_YESTERDAY_FIXTURES
    )
  );
  app.get("/api/basketball/live", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_LIVE_FIXTURES)
  );
  app.get("/api/basketball/finished", (req, res) =>
    cachedCollectionEndpoint(
      req,
      res,
      COLLECTIONS.BASKETBALL_FINISHED_FIXTURES
    )
  );

  // ── Reference Data ──
  app.get("/api/leagues", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.LEAGUES)
  );
  app.get("/api/teams", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.TEAMS)
  );
  app.get("/api/standings", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.STANDINGS)
  );
  app.get("/api/basketball/leagues", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_LEAGUES)
  );
  app.get("/api/basketball/teams", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_TEAMS)
  );
  app.get("/api/basketball/standings", (req, res) =>
    cachedCollectionEndpoint(req, res, COLLECTIONS.BASKETBALL_STANDINGS)
  );

  // ── Manual Recovery ──
  app.get("/api/recover", async (req, res) => {
    const sport = req.query.sport || "all";

    try {
      const db = getDb();
      const results = {};

      if (sport === "all" || sport === "football") {
        try {
          await db.collection("meta").doc("footballScheduler").delete();
        } catch (_) {}
        if (scheduler?.services?.footballDailyFixtures) {
          results.football =
            await scheduler.services.footballDailyFixtures.run();
        }
      }

      if (sport === "all" || sport === "basketball") {
        try {
          await db
            .collection("meta")
            .doc("basketballScheduler")
            .delete();
        } catch (_) {}
        if (scheduler?.services?.basketballDailyFixtures) {
          results.basketball =
            await scheduler.services.basketballDailyFixtures.run();
        }
      }

      // Clear all caches so next requests re-read fresh data
      cache.clear();
      res.json({ success: true, results });
    } catch (err) {
      logger.error(`[Recover] Failed: ${err.message}`);
      res
        .status(500)
        .json({ success: false, error: err.message });
    }
  });

  // ── 404 ──
  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  server = app.listen(env.PORT, () => {
    logger.info(`[Server] Listening on port ${env.PORT}`);
  });

  return server;
}

// ═══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

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
    logger.error(`[Fatal] Uncaught: ${error.message}`, {
      stack: error.stack,
    });
  });
  process.on("unhandledRejection", (reason) => {
    logger.error(`[Fatal] Unhandled rejection: ${reason}`);
  });
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

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
  const basketballFtProcessor =
    new BasketballFinishedFixturesProcessor(basketballFixturesRepo);

  // 4. Services
  const services = {
    footballDailyFixtures: new DailyFixturesService(
      fixturesRepo,
      teamsProcessor
    ),
    footballLiveFixtures: new LiveFixturesService(
      fixturesRepo,
      ftProcessor
    ),
    footballStandings: new StandingsService(standingRepo),
    footballLeagues: new LeaguesService(leagueRepo),
  };

  if (isBasketballConfigured) {
    logger.info("[Startup] Basketball enabled");
    services.basketballDailyFixtures =
      new BasketballDailyFixturesService(basketballFixturesRepo);
    services.basketballLiveFixtures =
      new BasketballLiveFixturesService(
        basketballFixturesRepo,
        basketballFtProcessor
      );
  } else {
    logger.warn(
      "[Startup] Basketball disabled — set API_BASKETBALL_KEY"
    );
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
  logger.info(
    `║  Ready in ${String(duration).padStart(4)}ms                       ║`
  );
  logger.info(
    `║  API:    http://localhost:${env.PORT}/api/     ║`
  );
  logger.info(
    `║  Health: http://localhost:${env.PORT}/health   ║`
  );
  logger.info("║  Football:   ✅ ON                       ║");
  logger.info(
    `║  Basketball: ${bball.padEnd(26)}║`
  );
  logger.info("║  Cache TTL:  24h (invalidate-only)     ║");
  logger.info("║  Herd guard: getOrSet lock active      ║");
  logger.info("║  Client reads: 0 Firestore reads       ║");
  logger.info("╚══════════════════════════════════════════╝");
}

main().catch((error) => {
  logger.error(`[Startup] Fatal: ${error.message}`, {
    stack: error.stack,
  });
  process.exit(1);
});