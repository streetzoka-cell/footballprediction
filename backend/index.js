/*
 * index.js
 * Entry point for the Sports Sync Backend.
 *
 * 1. Connects Firebase
 * 2. Initializes processors (no API calls)
 * 3. Initializes services (processors injected)
 * 4. Initializes scheduler with services
 * 5. Runs initial sync (6 API calls)
 * 6. Sends 'ready' to PM2
 * 7. Starts scheduled jobs (cron + adaptive polling)
 * 8. Starts health check Express server
 * 9. Handles graceful shutdown (SIGINT, SIGTERM, PM2 message)
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

// ─── Processors (no API calls — pure data transform + write) ───
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

// ─── Global references for shutdown ───
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
  // Use this if data is missing and you don't want to wait for next cron
  // GET /api/recover?sport=football|basketball|all
  const { getDb } = require("./config/firebase");

  app.get("/api/recover", async (req, res) => {
    const sport = req.query.sport || "all";

    try {
      const db = getDb();
      const results = {};

      if (sport === "all" || sport === "football") {
        // Delete meta to bypass dedup, forcing full re-run
        try {
          await db.collection("meta").doc("footballScheduler").delete();
          logger.info("[Recover] Deleted football scheduler meta");
        } catch (e) {
          logger.warn(`[Recover] Meta delete failed (may not exist): ${e.message}`);
        }

        if (scheduler?.services?.footballDailyFixtures) {
          results.football = await scheduler.services.footballDailyFixtures.run();
        }
      }

      if (sport === "all" || sport === "basketball") {
        try {
          await db.collection("meta").doc("basketballScheduler").delete();
          logger.info("[Recover] Deleted basketball scheduler meta");
        } catch (e) {
          logger.warn(`[Recover] Meta delete failed (may not exist): ${e.message}`);
        }

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

  // ── Backfill Endpoint — fetches today + yesterday directly ──
  // GET /api/backfill?sport=football|basketball|all
  app.get("/api/backfill", async (req, res) => {
    const sport = req.query.sport || "all";
    const { getDateOffset, LEAGUES, TRACK_ALL_LEAGUES } = require("./config/constants");
    const todayStr = getDateOffset(0);
    const yesterdayStr = getDateOffset(-1);

    try {
      const results = {};

      if (sport === "all" || sport === "football") {
        const { api, isBudgetAvailable } = require("./config/api");
        const tracked = new Set(LEAGUES.filter(l => l.active).map(l => l.id));

        // Fetch today
        if (isBudgetAvailable(1)) {
          const todayRaw = await api.get("/fixtures", { params: { date: todayStr } });
          const todayGames = TRACK_ALL_LEAGUES
            ? (todayRaw?.response || [])
            : (todayRaw?.response || []).filter(f => tracked.has(f.league?.id));
          const todayDocs = todayGames.map(f => ({
            id: f.fixture.id, date: f.fixture.date, timestamp: f.fixture.timestamp,
            status: f.fixture.status.short, statusLong: f.fixture.status.long,
            elapsed: f.fixture.status.elapsed ?? null,
            leagueId: f.league.id, leagueName: f.league.name,
            leagueCountry: f.league.country, leagueLogo: f.league.logo,
            leagueFlag: f.league.flag ?? null, season: f.league.season,
            round: f.league.round,
            homeTeamId: f.teams.home.id, homeTeamName: f.teams.home.name,
            homeTeamLogo: f.teams.home.logo,
            awayTeamId: f.teams.away.id, awayTeamName: f.teams.away.name,
            awayTeamLogo: f.teams.away.logo,
            goalsHome: f.goals.home, goalsAway: f.goals.away,
            sport: "football", _updatedAt: new Date().toISOString(),
          }));

          const { replaceCollection } = require("./config/firebase");
          const todayResult = await replaceCollection("todayFixtures", todayDocs);
          results.footballToday = { fetched: todayGames.length, ...todayResult };
        }

        // Fetch yesterday
        if (isBudgetAvailable(1)) {
          const yestRaw = await api.get("/fixtures", { params: { date: yesterdayStr } });
          const yestGames = TRACK_ALL_LEAGUES
            ? (yestRaw?.response || [])
            : (yestRaw?.response || []).filter(f => tracked.has(f.league?.id));
          const yestDocs = yestGames.map(f => ({
            id: f.fixture.id, date: f.fixture.date, timestamp: f.fixture.timestamp,
            status: f.fixture.status.short, statusLong: f.fixture.status.long,
            elapsed: f.fixture.status.elapsed ?? null,
            leagueId: f.league.id, leagueName: f.league.name,
            leagueCountry: f.league.country, leagueLogo: f.league.logo,
            leagueFlag: f.league.flag ?? null, season: f.league.season,
            round: f.league.round,
            homeTeamId: f.teams.home.id, homeTeamName: f.teams.home.name,
            homeTeamLogo: f.teams.home.logo,
            awayTeamId: f.teams.away.id, awayTeamName: f.teams.away.name,
            awayTeamLogo: f.teams.away.logo,
            goalsHome: f.goals.home, goalsAway: f.goals.away,
            sport: "football", _updatedAt: new Date().toISOString(),
          }));

          const { replaceCollection } = require("./config/firebase");
          const yestResult = await replaceCollection("yesterdayFixtures", yestDocs);
          results.footballYesterday = { fetched: yestGames.length, ...yestResult };
        }
      }

      res.json({ success: true, results });
    } catch (err) {
      logger.error(`[Backfill] Failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  server = app.listen(env.PORT, () => {
    logger.info(
      `[Server] Health server listening on port ${env.PORT}`
    );
  });

  return server;
}

// ==========================================================
// GRACEFUL SHUTDOWN
//
// Handles 3 signals:
//   1. PM2 message { cmd: 'shutdown' }  — preferred
//   2. SIGTERM                           — Docker, Kubernetes
//   3. SIGINT                            — Ctrl+C
//
// Flow:
//   1. Set flag to prevent duplicate shutdowns
//   2. Stop scheduler (sets polling stop flags + clears cron timers)
//   3. Wait 2s for in-progress writes to finish
//   4. Close Express server
//   5. Exit
// ==========================================================

function setupShutdownHandlers() {
  const shutdown = async (source) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`[Shutdown] Initiated by ${source}`);

    // 1. Stop scheduler (polling loops + cron timers)
    if (scheduler) {
      scheduler.stop();
    }

    // 2. Wait for in-progress operations
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. Close Express
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info("[Shutdown] Express closed");
    }

    logger.info("[Shutdown] Complete");
    process.exit(0);
  };

  // PM2 shutdown message (shutdown_with_message: true)
  process.on("message", (msg) => {
    if (msg.cmd === "shutdown") {
      shutdown("PM2");
    }
  });

  // Docker / Kubernetes
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Ctrl+C
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Don't let unhandled exceptions crash the process.
  // The scheduler's error handling + Winston's exceptionHandlers
  // will log them. The polling loop recovers on next iteration.
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

  // ── 2. Repositories (no db param — firebase.js handles connection) ──
  const fixturesRepo = new FixturesRepository();
  const teamRepo = new TeamRepository();
  const standingRepo = new StandingRepository();
  const leagueRepo = new LeagueRepository();
  const basketballFixturesRepo = new BasketballFixturesRepository();

  // ── 3. Processors (no API cost) ──
  const ftProcessor = new FinishedFixturesProcessor(fixturesRepo);
  const teamsProcessor = new TeamsProcessor(teamRepo);
  const basketballFtProcessor = new BasketballFinishedFixturesProcessor(
    basketballFixturesRepo
  );

  // ── 4. Services ──
  //
  // NOTE: Constructor signatures changed after adding data integrity verification:
  //   DailyFixturesService(repo, teamsProcessor)         — ftProcessor removed
  //   BasketballDailyFixturesService(repo)               — ftProcessor removed
  //   LiveFixturesService(repo, ftProcessor)             — unchanged
  //   BasketballLiveFixturesService(repo, ftProcessor)   — unchanged
  //
  const services = {
    // Football Daily: FT recovery now handled inline during rollover
    // No longer needs ftProcessor as a dependency
    footballDailyFixtures: new DailyFixturesService(
      fixturesRepo,
      teamsProcessor  // ✅ Correct: (repo, teamsProcessor)
    ),

    // Football Live: Still needs ftProcessor for live→finished transitions
    footballLiveFixtures: new LiveFixturesService(
      fixturesRepo,
      ftProcessor  // ✅ Correct: (repo, ftProcessor)
    ),

    footballStandings: new StandingsService(
      standingRepo
    ),

    footballLeagues: new LeaguesService(
      leagueRepo
    ),
  };

  if (isBasketballConfigured) {
    logger.info("[Startup] Basketball enabled");

    // Basketball Daily: FT recovery now handled inline during rollover
    // No longer needs ftProcessor as a dependency
    services.basketballDailyFixtures =
      new BasketballDailyFixturesService(
        basketballFixturesRepo  // ✅ Correct: (repo) only
      );

    // Basketball Live: Still needs ftProcessor for live→finished transitions
    services.basketballLiveFixtures =
      new BasketballLiveFixturesService(
        basketballFixturesRepo,
        basketballFtProcessor  // ✅ Correct: (repo, ftProcessor)
      );
  } else {
    logger.warn(
      "[Startup] Basketball disabled — set API_BASKETBALL_KEY"
    );
  }

  // ── 5. Scheduler ──
  scheduler = new Scheduler(services);

  // ── 6. Initial sync (6 API calls: 3 football + 3 basketball) ──
  try {
    await scheduler.runInitialSync();
    // Wait before signaling ready — avoids 429 from
    // rapid calls during startup + immediate live poll
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    logger.error(`[Startup] Initial sync error: ${error.message}`);
  }

  // ── 7. Signal PM2 that we're ready ──
  // This must happen AFTER initial sync so pm2 wait sports-sync
  // blocks until data is populated.
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

// ── Run ──
main().catch((error) => {
  logger.error(`[Startup] Fatal: ${error.message}`, {
    stack: error.stack,
  });
  process.exit(1);
});