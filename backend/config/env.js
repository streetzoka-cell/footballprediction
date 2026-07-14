// backend/config/env.js
const dotenv = require('dotenv');
const path = require('path');

// Explicitly tell dotenv to load the .env file from the backend root folder
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const env = {
  // API Keys
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL,
  API_BASKETBALL_KEY: process.env.API_BASKETBALL_KEY,
  API_BASKETBALL_BASE_URL: process.env.API_BASKETBALL_BASE_URL,
  
  // Firebase Admin SDK
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,

  // Server
  PORT: process.env.PORT || 5000,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

module.exports = env;