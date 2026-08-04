// backend-v1/src/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const metricsTracker = require('./middleware/metricsTracker');
const requestContext = require('./middleware/requestContext');
const securityHeaders = require('./middleware/securityHeaders');
const auditAdminRequests = require('./middleware/auditLogger');
const createRateLimit = require('./middleware/simpleRateLimit');
const { addLog } = require('./utils/logStore');

const leaderboardRoutes = require('./routes/v1/admin/leaderboards');
const healthRoute = require('./routes/v1/health');
const matchesRoute = require('./routes/v1/matches');
const matchRoute = require('./routes/v1/match');
const teamsRoute = require('./routes/v1/teams');
const standingsRoute = require('./routes/v1/standings');
const leaguesRoute = require('./routes/v1/leagues');
const adminSchedulers = require('./routes/v1/admin/schedulers');
const monitoringDashboard = require('./routes/v1/monitoring/dashboard');
const sitemapRoute = require('./routes/v1/sitemap');
const predictionsRoute = require('./routes/v1/predictions');
const queueRoute = require('./routes/v1/queue');
const featuredRoute = require('./routes/v1/featured');
const zokaPicksRoute = require('./routes/v1/zokaPicks');
const leaderboardRoute = require('./routes/v1/leaderboard');
const aiRoutes = require('./routes/v1/ai');

const app = express();

app.set('trust proxy', 1);

securityHeaders(app);

// ★ FIX: Hardcode allowed origins to prevent CORS failures
const allowedOrigins = [
  'https://zokascore.xyz',
  'https://www.zokascore.xyz',
  'https://zokascore.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-api-key'],
  })
);

app.use(express.json({ limit: '1mb' }));

app.use(requestContext);
app.use(metricsTracker);

app.use((req, res, next) => {
  const logMsg = `[Gateway] [${res.locals.requestId || 'req_unknown'}] ${req.method} ${req.originalUrl}`;
  logger.info(logMsg);
  addLog(logMsg);
  next();
});

app.disable('x-powered-by');

const publicWriteLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 180,
  keyPrefix: 'api-public-write',
  message: 'Too many write requests. Please slow down.',
});

app.use('/api/v1', (req, res, next) => {
  if (req.originalUrl.includes('/admin')) {
    return next();
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return publicWriteLimiter(req, res, next);
  }

  next();
});

app.use('/api/v1/admin', auditAdminRequests);

app.use('/api/v1/health', healthRoute);
app.use('/api/v1/matches', matchesRoute);
app.use('/api/v1/match', matchRoute);
app.use('/api/v1/teams', teamsRoute);
app.use('/api/v1/standings', standingsRoute);
app.use('/api/v1/leagues', leaguesRoute);
app.use('/api/v1/predictions', predictionsRoute);
app.use('/api/v1/queue', queueRoute);
app.use('/api/v1/featured', featuredRoute);
app.use('/api/v1/zoka-picks', zokaPicksRoute);
app.use('/api/v1/leaderboard', leaderboardRoute);

app.use('/api/v1/admin/schedulers', adminSchedulers);
app.use('/api/v1/admin/leaderboards', leaderboardRoutes);

app.use('/api/v1/monitoring', monitoringDashboard);
app.use('/api/v1/admin/monitoring', monitoringDashboard);

app.use('/zokascore-sitemap.xml', sitemapRoute);

app.use('/api/v1/ai', aiRoutes);

// ─────────────────────────────────────────────
// Static public JSON data
// ─────────────────────────────────────────────

// Results fallback
// Returns a clean response when today's results file
// does not exist yet because no matches have finished.

app.get('/api/v1/data/results/:date.json', (req, res) => {
  // ★ FIX: Explicitly set CORS header for static file
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  const filePath = path.join(
    process.cwd(),
    'public_data',
    'results',
    `${req.params.date}.json`
  );

  if (!fs.existsSync(filePath)) {
    return res.json({
      success: true,
      data: [],
      count: 0,
      date: req.params.date,
      message: 'No finished matches yet'
    });
  }

  res.sendFile(filePath);
});

// Serve public_data JSON files
app.use(
  '/api/v1/data',
  express.static(
    path.join(process.cwd(), 'public_data'),
    {
      setHeaders: (res, filePath) => {
        // ★ FIX: Ensure CORS header is set on the actual file response as well
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (filePath.endsWith('.json')) {
          // Live data changes frequently
          if (filePath.includes('live.json')) {
            res.setHeader(
              'Cache-Control',
              'public, max-age=15'
            );
          } else {
            // Fixtures/results snapshots
            res.setHeader(
              'Cache-Control',
              'public, max-age=900'
            );
          }
        }
      },
    }
  )
);

app.use(notFound);
app.use(errorHandler);

module.exports = app;