// backend-v1/src/server.js
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
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

// ============================================================
// ROUTES
// ============================================================

// Core
const healthRoute = require('./routes/v1/health');
const matchesRoute = require('./routes/v1/matches');
const matchRoute = require('./routes/v1/match');
const teamsRoute = require('./routes/v1/teams');
const standingsRoute = require('./routes/v1/standings');
const leaguesRoute = require('./routes/v1/leagues');
const predictionsRoute = require('./routes/v1/predictions');
const queueRoute = require('./routes/v1/queue');
const featuredRoute = require('./routes/v1/featured');
const zokaPicksRoute = require('./routes/v1/zokaPicks');
const leaderboardRoute = require('./routes/v1/leaderboard');
const resultsRoute = require('./routes/v1/results');
const historyRoute = require('./routes/v1/history');

// Intelligence / Models
const matchIntelligenceRoute = require('./routes/v1/matchIntelligence');
const intelligenceRoutes = require('./routes/v1/intelligence');
const modelLabRoutes = require('./routes/v1/modelLab');

// Admin
const leaderboardRoutes = require('./routes/v1/admin/leaderboards');
const adminSchedulers = require('./routes/v1/admin/schedulers');
const kimGapsRoutes = require('./routes/v1/admin/kimGaps');
const aiLabRoutes = require('./routes/v1/admin/aiLab');

// Monitoring
const monitoringDashboard = require('./routes/v1/monitoring/dashboard');

// AI / Knowledge
const aiRoutes = require('./routes/v1/ai');
const knowledgeRoutes = require('./routes/v1/knowledge');

// Other
const sitemapRoute = require('./routes/v1/sitemap');

// ============================================================
// APP
// ============================================================

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

securityHeaders(app);

// ============================================================
// CORS
// ============================================================

const allowedOrigins = new Set([
  'https://zokascore.xyz',
  'https://www.zokascore.xyz',
  'https://zokascore.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

// Anchored: only this project's preview deployments
const VERCEL_PREVIEW_RE = /^https:\/\/footballprediction-[a-z0-9-]+\.vercel\.app$/i;

const corsOptions = {
  origin(origin, callback) {
    // curl, server-to-server, mobile/native clients
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    if (VERCEL_PREVIEW_RE.test(origin)) return callback(null, true);

    logger.warn?.(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-api-key'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// ============================================================
// BODY PARSERS — admin gets a larger limit (featured/zoka payloads)
// ============================================================

app.use('/api/v1/admin', express.json({ limit: '100kb' }));
app.use('/api/v1/admin', express.urlencoded({ limit: '100kb', extended: true }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// ============================================================
// REQUEST CONTEXT / METRICS / GATEWAY LOGGING
// ============================================================

app.use(requestContext);
app.use(metricsTracker);

app.use((req, res, next) => {
  const requestId = res.locals.requestId || 'req_unknown';
  const logMsg = `[Gateway] [${requestId}] ${req.method} ${req.originalUrl}`;
  logger.info(logMsg);
  addLog(logMsg);
  next();
});

// ============================================================
// RATE LIMITING — static JSON exempt (cacheable, high-frequency)
// ============================================================

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' },
  skip: (req) => req.path.startsWith('/api/v1/data'),
});

app.use(globalLimiter);

const publicWriteLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'api-public-write',
  message: 'Too many write requests. Please slow down.',
});

app.use('/api/v1', (req, res, next) => {
  if (req.originalUrl.includes('/admin')) return next();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return publicWriteLimiter(req, res, next);
  }
  next();
});

// ============================================================
// ADMIN AUDIT
// ============================================================

app.use('/api/v1/admin', auditAdminRequests);

// ============================================================
// API ROUTES
// ============================================================

app.use('/api/v1/health', healthRoute);
app.use('/api/v1/matches', matchesRoute);       // includes /matches/top (TOP 12)
app.use('/api/v1/match', matchRoute);           // canonical match object
app.use('/api/v1/teams', teamsRoute);
app.use('/api/v1/standings', standingsRoute);
app.use('/api/v1/leagues', leaguesRoute);
app.use('/api/v1/predictions', predictionsRoute);
app.use('/api/v1/queue', queueRoute);
app.use('/api/v1/featured', featuredRoute);
app.use('/api/v1/zoka-picks', zokaPicksRoute);
app.use('/api/v1/leaderboard', leaderboardRoute);
app.use('/api/v1/results', resultsRoute);
app.use('/api/v1/history', historyRoute);

app.use('/api/v1/match-intelligence', matchIntelligenceRoute);
app.use('/api/v1/intelligence', intelligenceRoutes);
app.use('/api/v1/models', modelLabRoutes);

// ============================================================
// ADMIN ROUTES
// ============================================================

app.use('/api/v1/admin/schedulers', adminSchedulers);
app.use('/api/v1/admin/leaderboards', leaderboardRoutes);
app.use('/api/v1/admin/monitoring', monitoringDashboard);
app.use('/api/v1/admin/kim', kimGapsRoutes);
app.use('/api/v1/admin/ai-lab', aiLabRoutes);

// ============================================================
// MONITORING
// ============================================================

app.use('/api/v1/monitoring', monitoringDashboard);

// ============================================================
// AI / KNOWLEDGE
// ============================================================

app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/knowledge', knowledgeRoutes);

// ============================================================
// SITEMAP
// ============================================================

app.use(sitemapRoute);

// ============================================================
// STATIC DATA
// ============================================================

// Graceful fallback for result files that do not exist yet.
// ★ DATE GUARD: Express URL-decodes params — without this check,
//   '..%2f..' in :date escapes public_data (arbitrary file read).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get('/api/v1/data/results/:date.json', (req, res) => {
  const { date } = req.params;

  if (!DATE_RE.test(date)) {
    return res.status(400).json({ success: false, error: 'Invalid date format' });
  }

  const filePath = path.join(process.cwd(), 'public_data', 'results', `${date}.json`);

  if (!fs.existsSync(filePath)) {
    // Don't let intermediaries cache the empty fallback
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      data: [],
      count: 0,
      date,
      message: 'No finished matches yet',
    });
  }

  res.setHeader('Cache-Control', 'public, max-age=900');
  return res.sendFile(filePath);
});

// Public static JSON data
app.use(
  '/api/v1/data',
  express.static(path.join(process.cwd(), 'public_data'), {
    setHeaders: (res, filePath) => {
      if (!filePath.endsWith('.json')) return;
      if (filePath.endsWith('live.json')) {
        res.setHeader('Cache-Control', 'public, max-age=15');
        return;
      }
      if (filePath.includes('predictions')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=900');
    },
  })
);

// ============================================================
// 404 / ERROR HANDLING
// ============================================================

app.use(notFound);
app.use(errorHandler);

module.exports = app;