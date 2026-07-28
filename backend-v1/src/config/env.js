require('dotenv').config();

const env = {
  // Server
  PORT: process.env.PORT || 3099,
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Provider Selection
  DATA_PROVIDER: process.env.DATA_PROVIDER || 'goal',
  
  // GOAL API
  GOAL_API_KEY: process.env.GOAL_API_KEY,
  GOAL_API_BASE_URL: process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1',
  GOAL_API_DAILY_BUDGET: parseInt(process.env.GOAL_API_DAILY_BUDGET || '800', 10),
  
  // API-Football
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io',
  
  // Firebase
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
  
  // Admin
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || 'dev-admin-key',
};

// Validation
if (!env.GOAL_API_KEY && env.DATA_PROVIDER === 'goal') {
  console.warn('⚠️  WARNING: DATA_PROVIDER is goal but GOAL_API_KEY is missing.');
}
if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_PRIVATE_KEY) {
  console.warn('⚠️  WARNING: Firebase credentials are missing.');
}

module.exports = Object.freeze(env);