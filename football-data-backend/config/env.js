// football-data-backend/config/env.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const rootDir = path.resolve(__dirname, '..');
const defaultPath = path.join(rootDir, 'serviceAccountKey.json');
const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
  ? path.resolve(rootDir, process.env.FIREBASE_SERVICE_ACCOUNT_PATH) 
  : defaultPath;

// ★ Read SUPPORTED_COMPETITIONS from your .env file
const compEnv = process.env.SUPPORTED_COMPETITIONS || 'PL,BL1,SA,PD,FL1,CL,WC,DED,BSA,ELC,PPL,EC';
const competitions = compEnv.split(',').map(c => c.trim());

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3001,
  firebase: {
    serviceAccountPath: envPath,
  },
  footballData: {
    apiKey: process.env.FOOTBALL_DATA_API_KEY || '',
    baseUrl: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4',
  },
  competitions: competitions,
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED !== 'false'
  }
};

module.exports = env;