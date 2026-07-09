/*
 * logger.js
 * Centralized Winston logger.
 *
 * Features:
 * - Colored console output (human-readable)
 * - JSON file logs (machine-parseable, standard for production)
 * - Error stack traces
 * - Exception handling
 * - Rejection handling
 * - Log rotation (10MB per file, 5 combined / 3 error)
 */

const fs = require("fs");
const path = require("path");
const winston = require("winston");

const env = require("../config/env");

const logsDir = path.resolve(__dirname, "..", "logs");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ───────────────────────────────────────────────
// File format — JSON for production
// Easy to grep, parse, ship to log aggregators
// ───────────────────────────────────────────────
const fileFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ───────────────────────────────────────────────
// Console format — colored, short timestamp
// For dev and terminal monitoring
// ───────────────────────────────────────────────
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf((info) => {
    return `[${info.timestamp}] ${info.level}: ${info.message}`;
  })
);

const logger = winston.createLogger({
  level: env.LOG_LEVEL || "info",

  defaultMeta: {
    service: "sports-sync",
  },

  format: fileFormat,

  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),

    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),

    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],

  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, "exceptions.log"),
    }),
  ],

  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, "rejections.log"),
    }),
  ],

  // Critical for production — don't crash on unhandled
  // exceptions. The polling loop should recover.
  exitOnError: false,
});

module.exports = logger;