// backend-v1/src/config/env.js
require('dotenv').config();

const env = {
  PORT: process.env.PORT || 3099,
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DATA_PROVIDER: process.env.DATA_PROVIDER || 'api-football',

  // ── API-Football: 2 keys × 100 calls each = 200 daily calls total ──
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_KEY_2: process.env.API_FOOTBALL_KEY_2,
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io',
  API_FOOTBALL_DAILY_BUDGET: parseInt(process.env.API_FOOTBALL_DAILY_BUDGET || '100', 10), // PER KEY (100 each = 200 total)

  // ── Football-Data.org ──
  FOOTBALL_DATA_API_KEY: process.env.FOOTBALL_DATA_API_KEY,

  // ── TheSportsDB ──
  SPORTSDB_API_KEY: process.env.SPORTSDB_API_KEY || '3',
  SPORTSDB_BASE_URL: process.env.SPORTSDB_BASE_URL || 'https://www.thesportsdb.com/api/v1/json',

  // ── iSports: 2 keys × 200 calls each = 400 daily calls total ──
  ISPORTS_API_KEY: process.env.ISPORTS_API_KEY,
  ISPORTS_API_KEY_2: process.env.ISPORTS_API_KEY_2,
  ISPORTS_DAILY_BUDGET: parseInt(process.env.ISPORTS_DAILY_BUDGET || '200', 10), // PER KEY (200 each = 400 total)
  ISPORTS_PRIMARY_URL: process.env.ISPORTS_PRIMARY_URL || 'https://api.isportsapi.com',
  ISPORTS_BACKUP_URL: process.env.ISPORTS_BACKUP_URL || 'https://api2.isportsapi.com',

  // ── Firebase ──
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),

  // ── Admin ──
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || 'dev-admin-key',
};

module.exports = Object.freeze(env);