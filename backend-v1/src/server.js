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
const knowledgeRoutes = require('./routes/v1/knowledge');
const kimGapsRoutes = require('./routes/v1/admin/kimGaps');

const intelligenceRoutes = require('./routes/v1/intelligence');
const modelLabRoutes = require('./routes/v1/modelLab');
const aiLabRoutes = require('./routes/v1/admin/aiLab');

const resultsRoute = require('./routes/v1/results');
const historyRoute = require('./routes/v1/history');
const matchIntelligenceRoute = require('./routes/v1/matchIntelligence');
// ★ removed: MatchIntelligenceService + inline /match-intelligence route
//   (it sat AFTER the router mount = dead code, used the old positional
//   service signature, and didn't support homeId/awayId)

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

securityHeaders(app);

/*
 * ============================================================
 * CORS — Vercel previews matched with an anchored regex
 * ============================================================
 */

const allowedOrigins = new Set([
  'https://zokascore.xyz',
  'https://www.zokascore.xyz',
  'https://zokascore.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

// ★ anchored: only this project's preview deployments, not any URL containing the substring
const VERCEL_PREVIEW_RE = /^https:\/\/footballprediction-[a-z0-9-]+\.vercel\.app$/i;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);           // curl / mobile / server-to-server
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
// ★ removed app.options('*') — the cors middleware already answers preflights

/*
 * ============================================================
 * BODY PARSERS — admin gets a bigger limit (featured/zoka payloads)
 * Mount the admin parser FIRST: express.json skips if already parsed,
 * so admin routes get 100kb and everything else stays at 10kb.
 * ============================================================
 */

app.use('/api/v1/admin', express.json({ limit: '100kb' }));
app.use('/api/v1/admin', express.urlencoded({ limit: '100kb', extended: true }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

app.use(requestContext);
app.use(metricsTracker);

app.use((req, res, next) => {
  const requestId = res.locals.requestId || 'req_unknown';
  const logMsg = `[Gateway] [${requestId}] ${req.method} ${req.originalUrl}`;
  logger.info(logMsg);
  addLog(logMsg);
  next();
});

/*
 * ============================================================
 * RATE LIMITING — static JSON exempt (cacheable, high-frequency)
 * ============================================================
 */

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' },
  // ★ /api/v1/data/* is CDN-cacheable static JSON — the frontend polls it
  //   every 15–30s; counting it against the API budget starves real endpoints.
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

app.use('/api/v1/admin', auditAdminRequests);

/*
 * ============================================================
 * API ROUTES
 * ============================================================
 */

app.use('/api/v1/health', healthRoute);
app.use('/api/v1/matches', matchesRoute);      // includes /matches/top (TOP 12)
app.use('/api/v1/match', matchRoute);          // canonical match object
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

app.use('/api/v1/match-intelligence', matchIntelligenceRoute); // ← the ONLY match-intel surface
app.use('/api/v1/intelligence', intelligenceRoutes);           // ← team/h2h intelligence
app.use('/api/v1/models', modelLabRoutes);

/*
 * ============================================================
 * ADMIN ROUTES
 * ============================================================
 */

app.use('/api/v1/admin/schedulers', adminSchedulers);
app.use('/api/v1/admin/leaderboards', leaderboardRoutes);
app.use('/api/v1/admin/monitoring', monitoringDashboard);
app.use('/api/v1/admin/kim', kimGapsRoutes);
app.use('/api/v1/admin/ai-lab', aiLabRoutes);
app.use('/api/v1/monitoring', monitoringDashboard);

/*
 * ============================================================
 * AI / KNOWLEDGE
 * ============================================================
 */

app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/knowledge', knowledgeRoutes);

/*
 * ============================================================
 * SITEMAPS & STATIC DATA
 * ============================================================
 */

app.use(sitemapRoute);

// Graceful "no results yet" for a date file that hasn't been published
app.get('/api/v1/data/results/:date.json', (req, res) => {
  const date = req.params.date;
  const filePath = path.join(process.cwd(), 'public_data', 'results', `${date}.json`);
  if (!fs.existsSync(filePath)) {
    return res.json({ success: true, data: [], count: 0, date, message: 'No finished matches yet' });
  }
  res.setHeader('Cache-Control', 'public, max-age=900');
  return res.sendFile(filePath);
});

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

app.use(notFound);
app.use(errorHandler);

module.exports = app;