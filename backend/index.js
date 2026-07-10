/*
 * index.js
 * Entry point for the Sports Sync Backend.
 *
 * Budget on free plan (100 req/day per sport):
 *   Startup:  2 API calls (live check each sport)
 *   Daily:    2 API calls (tomorrow fetch each sport)
 *   Live:     Up to 15 total (10 football + 5 basketball)
 *   Total:    ~19/day — leaves 81+ per sport for safety
 *
 * FIX: Removed /api/backfill endpoint — it burned 2 API calls
 *      for today+yesterday on every accidental hit.
 */

const express = require("express");

const { initializeFirebase } = require("./config/firebase");

const {
  getRemainingRequests,
} = require("./config/api");
const {
  getBasketballRemainingRequests,
  isBasketballConfigured,
} = require("./config/basketballApi");
const env = require("./config/env");
const logger = require("./utils/logger");

// ─── Repositories ───
const FixturesRepository = require("./repositories/fixturesRepository");
const TeamRepository = require("./repositories/teamRepository");
const StandingRepository = require("./repositories/standingRepository");
const LeagueRepository = require("./repositories/leagueRepository");
const BasketballFixturesRepository = require("./repositories/basketballFixturesRepository");

// ─── Processors (no API calls) ───
const FinishedFixturesProcessor = require("./services/finishedFixtures");
const TeamsProcessor = require("./services/teams");
const BasketballFinishedFixturesProcessor = require("./services/basketballFinishedFixtures");

// ─── Services (API calls + orchestration) ───
const DailyFixturesService = require("./services/dailyFixtures");
const LiveFixturesService = require("./services/liveFixtures");
const StandingsService = require("./services/standings");
const LeaguesService = require("./services/leagues");
const BasketballDailyFixturesService = require("./services/basketballDailyFixtures");
const BasketballLiveFixturesService = require("./services/basketballLiveFixtures");

// ─── Scheduler ───
const Scheduler = require("./schedulers/scheduler");

let scheduler = null;
let server = null;
let isShuttingDown = false;

// ==========================================================
// HEALTH CHECK SERVER
// ==========================================================

function startHealthServer() {
  const app = express();

  app.get("/health", (req, res) => {
    const footballBudget = getRemainingRequests();
    const basketballBudget = isBasketballConfigured
      ? getBasketballRemainingRequests()
      : null;
    const jobStatus = scheduler ? scheduler.getStatus() : null;

    let degraded = false;
    if (jobStatus?.jobs) {
      degraded = Object.values(jobStatus.jobs).some(
        (job) => job.errorCount > 3
      );
    }

    res.json({
      status: degraded ? "degraded" : "healthy",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      budget: {
        football: footballBudget ?? "unknown",
        basketball: basketballBudget ?? "disabled",
      },
      football: "enabled",
      basketball: isBasketballConfigured ? "enabled" : "disabled",
      scheduler: {
        running: jobStatus?.running ?? false,
        jobs: jobStatus?.jobs ?? {},
      },
    });
  });

  app.get("/health/simple", (_, res) => {
    res.send("OK");
  });

  // ── Manual Recovery Endpoint ──
  // Deletes meta to force full re-run on next cycle
  const { getDb } = require("./config/firebase");

  app.get("/api/recover", async (req, res) => {
    const sport = req.query.sport || "all";

    try {
      const db = getDb();
      const results = {};

      if (sport === "all" || sport === "football") {
        try {
          await db.collection("meta").doc("footballScheduler").delete();
          logger.info("[Recover] Deleted football scheduler meta");
        } catch (e) { /* may not exist */ }

        if (scheduler?.services?.footballDailyFixtures) {
          results.football = await scheduler.services.footballDailyFixtures.run();
        }
      }

      if (sport === "all" || sport === "basketball") {
        try {
          await db.collection("meta").doc("basketballScheduler").delete();
          logger.info("[Recover] Deleted basketball scheduler meta");
        } catch (e) { /* may not exist */ }

        if (scheduler?.services?.basketballDailyFixtures) {
          results.basketball = await scheduler.services.basketballDailyFixtures.run();
        }
      }

      res.json({ success: true, results });
    } catch (err) {
      logger.error(`[Recover] Failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  server = app.listen(env.PORT, () => {
    logger.info(`[Server] Health server listening on port ${env.PORT}`);
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

    if (scheduler) {
      scheduler.stop();
    }

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

// ==========================================================
// MAIN
// ==========================================================

async function main() {
  const startTime = Date.now();

  logger.info("╔══════════════════════════════════════════╗");
  logger.info("║   Sports Sync — Starting                 ║");
  logger.info("╚══════════════════════════════════════════╝");

  // ── 1. Firebase ──
  try {
    initializeFirebase();
  } catch (error) {
    logger.error(`[Startup] Firebase failed: ${error.message}`);
    process.exit(1);
  }

  // ── 2. Repositories ──
  const fixturesRepo = new FixturesRepository();
  const teamRepo = new TeamRepository();
  const standingRepo = new StandingRepository();
  const leagueRepo = new LeagueRepository();
  const basketballFixturesRepo = new BasketballFixturesRepository();

  // ── 3. Processors ──
  const ftProcessor = new FinishedFixturesProcessor(fixturesRepo);
  const teamsProcessor = new TeamsProcessor(teamRepo);
  const basketballFtProcessor = new BasketballFinishedFixturesProcessor(
    basketballFixturesRepo
  );

  // ── 4. Services ──
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
      new BasketballLiveFixturesService(basketballFixturesRepo, basketballFtProcessor);
  } else {
    logger.warn("[Startup] Basketball disabled — set API_BASKETBALL_KEY");
  }

  // ── 5. Scheduler ──
  scheduler = new Scheduler(services);

  // ── 6. Initial sync ──
  try {
    await scheduler.runInitialSync();
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    logger.error(`[Startup] Initial sync error: ${error.message}`);
  }

  // ── 7. Signal PM2 ──
  if (process.send) {
    process.send("ready");
  }

  // ── 8. Start scheduled jobs ──
  scheduler.start();

  // ── 9. Health server ──
  startHealthServer();

  // ── 10. Shutdown handlers ──
  setupShutdownHandlers();

  // ── 11. Ready banner ──
  const duration = Date.now() - startTime;
  const bball = isBasketballConfigured ? "✅ ON" : "⬜ OFF";

  logger.info("╔══════════════════════════════════════════╗");
  logger.info(`║  Ready in ${String(duration).padStart(4)}ms                       ║`);
  logger.info(`║  Health: http://localhost:${env.PORT}/health  ║`);
  logger.info("║  Football:   ✅ ON                       ║");
  logger.info(`║  Basketball: ${bball.padEnd(26)}║`);
  logger.info("║  Mode:       Production (100 req/day)   ║");
  logger.info("╚══════════════════════════════════════════╝");
}

main().catch((error) => {
  logger.error(`[Startup] Fatal: ${error.message}`, {
    stack: error.stack,
  });
  process.exit(1);
});