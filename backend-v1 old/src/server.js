// footballprediction/backend-v1/src/server.js

const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const metricsTracker = require('./middleware/metricsTracker');
const { addLog } = require('./utils/logStore');

// Routes
const leaderboardRoutes = require('./routes/v1/admin/leaderboards');
const healthRoute = require('./routes/v1/health');
const matchesRoute = require('./routes/v1/matches');
const matchRoute = require('./routes/v1/match');
const teamsRoute = require('./routes/v1/teams');
const adminSchedulers = require('./routes/v1/admin/schedulers');
const monitoringDashboard = require('./routes/v1/monitoring/dashboard');
const sitemapRoute = require('./routes/v1/sitemap');
const predictionsRoute = require('./routes/v1/predictions'); // â˜… NEW: Import predictions route

const app = express();

// CORS: Allow your Vercel frontend to access the API
app.use(cors({
  origin: ['https://zokascore.xyz', 'http://localhost:5173', 'https://zokascore.vercel.app']
}));
app.use(express.json());

// â˜… ATTACH METRICS TRACKER BEFORE ROUTES
app.use(metricsTracker);

// Simple request logger & Terminal Log Feeder
app.use((req, res, next) => {
  const logMsg = `[Gateway] ${req.method} ${req.originalUrl}`;
  logger.info(logMsg);
  addLog(logMsg);
  next();
});

// API Routes
app.use('/api/v1/health', healthRoute);
app.use('/api/v1/matches', matchesRoute);
app.use('/api/v1/match', matchRoute);
app.use('/api/v1/teams', teamsRoute);
app.use('/api/v1/admin/schedulers', adminSchedulers);
app.use('/api/v1/monitoring', monitoringDashboard);
app.use('/api/v1/admin/leaderboards', leaderboardRoutes);
app.use('/api/v1/predictions', predictionsRoute); // â˜… NEW: Register predictions route
app.use('/zokascore-sitemap.xml', sitemapRoute);

// â”€â”€â”€ SERVE STATIC JSON FILES (0-Read Gateway Magic) â”€â”€â”€
app.use('/api/v1/data', express.static(path.join(process.cwd(), 'public_data'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.json')) {
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
