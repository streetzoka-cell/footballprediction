require('dotenv').config();

const env = {
  PORT: process.env.PORT || 3099,
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  DATA_PROVIDER: process.env.DATA_PROVIDER || 'api-football',
  
  // API-Football
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io',
  API_FOOTBALL_DAILY_BUDGET: parseInt(process.env.API_FOOTBALL_DAILY_BUDGET || '100', 10),
  
  // TheSportsDB
  SPORTSDB_API_KEY: process.env.SPORTSDB_API_KEY || '3',
  SPORTSDB_BASE_URL: process.env.SPORTSDB_BASE_URL || 'https://www.thesportsdb.com/api/v1/json',
  
  // Firebase
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  
  // Admin
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || 'dev-admin-key',
};

module.exports = Object.freeze(env);