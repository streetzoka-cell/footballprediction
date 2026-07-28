const fs = require("fs");
const path = require("path");
const env = require("./config/env");
const logger = require("./utils/logger");

// Absolute failsafe to create logs directory before anything else
const logsDir = path.resolve(__dirname, "logs");
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  console.error("Failed to create logs directory:", err.message);
}

logger.info("=============================================");
logger.info("   ZOKASCORE Backend Initializing...");
logger.info("=============================================");

let server = null;
let scheduler = null;
let isShuttingDown = false;

async function main() {
  try {
    // 1. Initialize Firebase
    require("./config/firebase");
    
    // 2. Start Express & Scheduler
    const app = require("./server");
    scheduler = require("./services/smartScheduler");
    
    server = app.listen(env.PORT, () => {
      logger.info(`[Server] Listening on port ${env.PORT}`);
    });

    // 3. Start the scheduler!
    scheduler.start();

    // 4. Backend Heartbeat for Vercel Gateway NOC
    const { getDb } = require("./config/firebase");
    const goalApi = require("./config/goalApiAdapter");
    const livescoreApi = require("./config/livescoreApiAdapter");
    
    setInterval(async () => {
      if (isShuttingDown) return;
      try {
        const db = getDb();
        await db.collection('meta').doc('backend_status').set({
          status: 'healthy',
          uptime: Math.round(process.uptime()),
          budget: {
            goalApi: goalApi.getRemaining() ?? "unknown",
            livescore: livescoreApi.getRemaining() ?? "unknown"
          },
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        logger.error(`[Heartbeat] Failed: ${err.message}`);
      }
    }, 60000);

  } catch (err) {
    logger.error(`[Startup] Fatal: ${err.message}`, { stack: err.stack });
    process.exit(1);
  }
}

// Graceful Shutdown Handlers
const shutdown = async (source) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`[Shutdown] Initiated by ${source}`);
  if (scheduler) await scheduler.stop();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    logger.info("[Shutdown] Express closed");
  }
  logger.info("[Shutdown] Complete");
  process.exit(0);
};

process.on("message", (msg) => { if (msg.cmd === "shutdown") shutdown("PM2"); });
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  logger.error(`[Fatal] Uncaught: ${error.message}`, { stack: error.stack });
});
process.on("unhandledRejection", (reason) => {
  logger.error(`[Fatal] Unhandled rejection: ${reason}`);
});

main();