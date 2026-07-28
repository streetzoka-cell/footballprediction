const fs = require("fs");
const path = require("path");
const winston = require("winston");
require("winston-daily-rotate-file");
const env = require("../config/env");

const logsDir = path.resolve(__dirname, "..", "logs");
let useFileLogging = false;

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  // Test if we can actually write to it
  const testFile = path.join(logsDir, ".test");
  fs.writeFileSync(testFile, "test");
  fs.unlinkSync(testFile);
  useFileLogging = true;
} catch (err) {
  console.warn("WARNING: Cannot write to logs directory. Falling back to console-only logging.");
  useFileLogging = false;
}

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`)
);

const transports = [
  new winston.transports.Console({ format: consoleFormat })
];

if (useFileLogging) {
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d"
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, "error-%DATE%.log"),
      level: "error",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d"
    })
  );
}

const logger = winston.createLogger({
  level: env.LOG_LEVEL || "info",
  defaultMeta: { service: "zokascore-backend" },
  format: fileFormat,
  transports: transports,
  exitOnError: false
});

module.exports = logger;