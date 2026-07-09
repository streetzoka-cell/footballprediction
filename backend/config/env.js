/*
 * env.js
 * Loads and validates environment variables.
 */

const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
});

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const env = {
  // ───── API-Football ─────
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_BASE_URL:
    process.env.API_FOOTBALL_BASE_URL ||
    "https://v3.football.api-sports.io",

  // ───── API-Basketball ─────
  API_BASKETBALL_KEY: process.env.API_BASKETBALL_KEY,
  API_BASKETBALL_BASE_URL:
    process.env.API_BASKETBALL_BASE_URL ||
    "https://v1.basketball.api-sports.io",

  // ───── Firebase Admin ─────
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : null,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,

  // ───── Server ─────
  PORT: parseNumber(process.env.PORT, 3099),
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};

// ───────────────────────────────────────────────
// Required — Fail Fast
// ───────────────────────────────────────────────
const required = [
  ["API_FOOTBALL_KEY", env.API_FOOTBALL_KEY],
  ["FIREBASE_PROJECT_ID", env.FIREBASE_PROJECT_ID],
  ["FIREBASE_PRIVATE_KEY", env.FIREBASE_PRIVATE_KEY],
  ["FIREBASE_CLIENT_EMAIL", env.FIREBASE_CLIENT_EMAIL],
];

const missing = required.filter(([, value]) => !value);

if (missing.length > 0) {
  console.error("");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error(" FATAL CONFIGURATION ERROR");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const [name] of missing) {
    console.error(` Missing: ${name}`);
  }
  console.error("");
  console.error("Please check your .env file.");
  console.error("");
  process.exit(1);
}

// ───────────────────────────────────────────────
// Optional Warning
// ───────────────────────────────────────────────
if (!env.API_BASKETBALL_KEY) {
  console.warn("\n⚠️  API_BASKETBALL_KEY not set — Basketball disabled\n");
}

module.exports = Object.freeze(env);