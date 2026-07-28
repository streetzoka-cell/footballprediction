const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const env = {
  // Existing APIs
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL,
  API_BASKETBALL_KEY: process.env.API_BASKETBALL_KEY,
  API_BASKETBALL_BASE_URL: process.env.API_BASKETBALL_BASE_URL,
  
  footballData: {
    apiKey: process.env.FOOTBALL_DATA_API_KEY,
    baseUrl: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4'
  },

  // ★ NEW: Live-Score API (Primary)
  livescoreApi: {
    apiKey: process.env.LIVESCORE_API_KEY,
    apiSecret: process.env.LIVESCORE_API_SECRET,
    baseUrl: process.env.LIVESCORE_BASE_URL || 'https://api.live-score-api.com/v1'
  },

  // Firebase Admin SDK
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,

  // ★ NEW: GOAL API
  GOAL_API_KEY: process.env.GOAL_API_KEY,
  

  // Server
  PORT: process.env.PORT || 5000,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

module.exports = env;