// backend-v1/src/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Routes
const healthRoute = require('./routes/v1/health');
const matchesRoute = require('./routes/v1/matches');
const matchRoute = require('./routes/v1/match');
const teamsRoute = require('./routes/v1/teams');
const adminSchedulers = require('./routes/v1/admin/schedulers');
const monitoringDashboard = require('./routes/v1/monitoring/dashboard');

const app = express();

// CORS: Allow your Vercel frontend to access the API
app.use(cors({
  origin: ['https://zokascore.xyz', 'http://localhost:5173', 'https://zokascore.vercel.app']
}));
app.use(express.json());

// Simple request logger
app.use((req, res, next) => {
  logger.info(`[Gateway] ${req.method} ${req.originalUrl}`);
  next();
});

// API Routes
app.use('/api/v1/health', healthRoute);
app.use('/api/v1/matches', matchesRoute);
app.use('/api/v1/match', matchRoute);
app.use('/api/v1/teams', teamsRoute);
app.use('/api/v1/admin/schedulers', adminSchedulers);
app.use('/api/v1/monitoring', monitoringDashboard);

// ─── SERVE STATIC JSON FILES (0-Read Gateway Magic) ───
// Serve files from public_data with strong caching headers
app.use('/api/v1/data', express.static(path.join(process.cwd(), 'public_data'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.json')) {
      // Cache live.json for 15s, everything else for 15 mins
      if (path.includes('live.json')) {
        res.setHeader('Cache-Control', 'public, max-age=15');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=900'); // 15 minutes
      }
    }
  }
}));

// Error Handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;