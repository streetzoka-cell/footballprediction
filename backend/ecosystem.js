/*
 * ecosystem.config.js
 * PM2 production configuration.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 *
 * Monitoring:
 *   pm2 monit
 *   pm2 logs sports-sync
 *
 * REQUIRES in index.js:
 *   1. process.send('ready')       — after initial sync completes
 *   2. process.on('message', ...)  — listen for 'shutdown' to stop polling
 */

module.exports = {
  apps: [
    {
      name: "sports-sync",

      script: "./index.js",
      cwd: __dirname,

      // =====================================================
      // Process
      // =====================================================

      instances: 1,
      exec_mode: "fork",

      autorestart: true,
      watch: false,

      min_uptime: "30s",
      max_restarts: 15,
      restart_delay: 10000,

      // Time to let the app close gracefully after
      // receiving the shutdown message. Must be long
      // enough for in-progress Firestore writes.
      kill_timeout: 15000,

      // =====================================================
      // Memory
      // =====================================================

      // This app holds minimal in-memory state
      // (budget counter, last live snapshot).
      // 200M is generous — actual usage ~30-50M.
      max_memory_restart: "200M",

      // =====================================================
      // Environment
      // =====================================================

      env: {
        NODE_ENV: "production",
      },

      // =====================================================
      // Logging
      // =====================================================

      merge_logs: true,
      time: true,

      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",

      log_date_format: "YYYY-MM-DD HH:mm:ss",

      // =====================================================
      // Startup & Shutdown
      //
      // wait_ready: PM2 won't signal "online" until
      //   process.send('ready') is called. This means
      //   pm2 wait sports-sync will block until
      //   initial sync completes.
      //
      // shutdown_with_message: PM2 sends { cmd: 'shutdown' }
      //   instead of SIGINT. The app can then:
      //   1. Stop polling loops (set controller.stop = true)
      //   2. Wait for in-progress writes to finish
      //   3. Close Firestore client
      //   4. process.exit(0)
      //
      //   If the app doesn't exit within kill_timeout,
      //   PM2 sends SIGKILL.
      // =====================================================

      wait_ready: true,
      shutdown_with_message: true,
    },
  ],
};