const path = require('path');
require('dotenv').config();

const required = [
  'FOOTBALL_DATA_API_KEY',
  'FIREBASE_SERVICE_ACCOUNT_PATH',
  'PORT',
];

const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[ENV] Missing required variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  port: parseInt(process.env.PORT, 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  footballData: {
    apiKey: process.env.FOOTBALL_DATA_API_KEY,
    baseUrl: (process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4').replace(/\/+$/, ''),
  },

  firebase: {
    serviceAccountPath: path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
  },

  competitions: (process.env.SUPPORTED_COMPETITIONS || 'PL,BL1,SA,PD,FL1,CL,EL')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean),

  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED !== 'false',
  },
};
