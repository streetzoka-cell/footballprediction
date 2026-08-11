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

/*
 * ============================================================
 * ROUTES
 * ============================================================
 */

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

// ★ NEW INTELLIGENCE & AI LAB ROUTES
const intelligenceRoutes = require('./routes/v1/intelligence');
const modelLabRoutes = require('./routes/v1/modelLab');
const aiLabRoutes = require('./routes/v1/admin/aiLab');
const MatchIntelligenceService = require('./services/MatchIntelligenceService');

const resultsRoute = require('./routes/v1/results');

const app = express();

/*
 * ============================================================
 * PROXY / SERVER CONFIGURATION
 * ============================================================
 */

app.set('trust proxy', 1);
app.disable('x-powered-by');

/*
 * ============================================================
 * SECURITY HEADERS
 * ============================================================
 */
securityHeaders(app);

/*
 * ============================================================
 * CORS
 * ============================================================
 */

const allowedOrigins = new Set([
  'https://zokascore.xyz',
  'https://www.zokascore.xyz',
  'https://zokascore.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    logger.warn?.(`[CORS] Blocked origin: ${origin}`);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-api-key'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/*
 * ============================================================
 * REQUEST BODY LIMITS & CONTEXT
 * ============================================================
 */

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
 * GLOBAL RATE LIMITERS
 * ============================================================
 */

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' },
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
app.use('/api/v1/results', resultsRoute);

// ★ MOUNT INTELLIGENCE & MODEL LAB ROUTES
app.use('/api/v1/intelligence', intelligenceRoutes);
app.use('/api/v1/models', modelLabRoutes);

// ★ MOUNT DYNAMIC MATCH INTELLIGENCE ENDPOINT
// This serves deep H2H, Form, Goal Patterns, and Elo for any fixture
app.get('/api/v1/match-intelligence', async (req, res) => {
  try {
    const { home, away } = req.query;
    if (!home || !away) {
      return res.status(400).json({ success: false, error: 'Home and Away team names are required.' });
    }
    const intel = await MatchIntelligenceService.getMatchIntelligence(home, away);
    res.json({ success: true, data: intel });
  } catch (err) {
    logger.error(`[Match Intel Route] Error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to load match intelligence.' });
  }
});

/*
 * ============================================================
 * ADMIN ROUTES
 * ============================================================
 */

app.use('/api/v1/admin/schedulers', adminSchedulers);
app.use('/api/v1/admin/leaderboards', leaderboardRoutes);
app.use('/api/v1/admin/monitoring', monitoringDashboard);
app.use('/api/v1/admin/kim', kimGapsRoutes);
app.use('/api/v1/admin/ai-lab', aiLabRoutes); // ★ MOUNT AI LAB
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

app.get('/api/v1/data/results/:date.json', (req, res) => {
  const date = req.params.date;
  const filePath = path.join(process.cwd(), 'public_data', 'results', `${date}.json`);
  if (!fs.existsSync(filePath)) {
    return res.json({ success: true, data: [], count: 0, date, message: 'No finished matches yet' });
  }
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
      res.setHeader('Cache-Control', 'public, max-age=900');
    },
  })
);

/*
 * ============================================================
 * 404 & ERROR HANDLER (MUST BE LAST)
 * ============================================================
 */

app.use(notFound);
app.use(errorHandler);

module.exports = app;