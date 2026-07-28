const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const env = {
  // Server
  PORT: process.env.PORT || 3099,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // GOAL API (Primary)
  GOAL_API_KEY: process.env.GOAL_API_KEY,
  
  // Live-Score API (Backup for Live)
  LIVESCORE_API_KEY: process.env.LIVESCORE_API_KEY,
  LIVESCORE_API_SECRET: process.env.LIVESCORE_API_SECRET,
  LIVESCORE_BASE_URL: process.env.LIVESCORE_BASE_URL || 'https://livescore-api.com/api-client',
  
  // API-Football (Legacy/Fallback if needed)
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io',
  
  // API-Basketball (Legacy if needed)
  API_BASKETBALL_KEY: process.env.API_BASKETBALL_KEY,
  API_BASKETBALL_BASE_URL: process.env.API_BASKETBALL_BASE_URL || 'https://v1.basketball.api-sports.io',
  
  // Football Data (Legacy if needed)
  FOOTBALL_DATA_API_KEY: process.env.FOOTBALL_DATA_API_KEY,
  FOOTBALL_DATA_BASE_URL: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4',
  
  // Firebase Admin SDK
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
};

module.exports = env;