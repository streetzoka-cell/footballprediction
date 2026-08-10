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

/*
 * PHASE 8:
 * Historical results archive.
 */
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
 *
 * This does NOT handle CORS.
 * CORS is configured separately below.
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

  /*
   * Local development.
   */
  'http://localhost:5173',
  'http://localhost:3000',
]);

const corsOptions = {
  origin(origin, callback) {
    /*
     * Requests without Origin:
     *
     * - server-to-server
     * - curl
     * - health checks
     * - some native clients
     *
     * should still be allowed.
     */
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    logger.warn?.(`[CORS] Blocked origin: ${origin}`);
    console.warn(`[CORS] Blocked origin: ${origin}`);

    /*
     * Returning an error intentionally blocks unknown origins.
     */
    return callback(
      new Error('Not allowed by CORS')
    );
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-admin-api-key',
  ],

  exposedHeaders: [
    'RateLimit-Limit',
    'RateLimit-Remaining',
    'RateLimit-Reset',
  ],

  optionsSuccessStatus: 204,
};

/*
 * IMPORTANT:
 *
 * CORS is intentionally registered BEFORE:
 *
 * - rate limiting
 * - API routes
 * - notFound
 * - errorHandler
 *
 * This guarantees that successful API responses and
 * preflight OPTIONS requests receive CORS headers.
 */
app.use(cors(corsOptions));

/*
 * Explicit OPTIONS handling.
 *
 * The cors middleware normally handles this already, but
 * keeping this explicit makes the API behaviour predictable
 * across reverse proxies and deployments.
 */
app.options('*', cors(corsOptions));

/*
 * ============================================================
 * REQUEST BODY LIMITS
 * ============================================================
 */

app.use(
  express.json({
    limit: '10kb',
  })
);

app.use(
  express.urlencoded({
    limit: '10kb',
    extended: true,
  })
);

/*
 * ============================================================
 * REQUEST CONTEXT / METRICS
 * ============================================================
 */

app.use(requestContext);
app.use(metricsTracker);

/*
 * ============================================================
 * GATEWAY REQUEST LOGGING
 * ============================================================
 */

app.use((req, res, next) => {
  const requestId =
    res.locals.requestId || 'req_unknown';

  const logMsg =
    `[Gateway] [${requestId}] ` +
    `${req.method} ${req.originalUrl}`;

  logger.info(logMsg);
  addLog(logMsg);

  next();
});

/*
 * ============================================================
 * GLOBAL RATE LIMITER
 * ============================================================
 *
 * 100 requests/minute/IP baseline.
 *
 * CORS is already installed above, so even rate-limit
 * responses generated here can retain the correct CORS
 * headers for allowed browser origins.
 */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,

  max: 100,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
  },
});

app.use(globalLimiter);

/*
 * ============================================================
 * PUBLIC WRITE LIMITER
 * ============================================================
 */

const publicWriteLimiter = createRateLimit({
  windowMs: 60 * 1000,

  max: 30,

  keyPrefix: 'api-public-write',

  message:
    'Too many write requests. Please slow down.',
});

app.use('/api/v1', (req, res, next) => {
  /*
   * Admin requests use their own auditing/security path.
   */
  if (req.originalUrl.includes('/admin')) {
    return next();
  }

  /*
   * Only write operations consume this additional limiter.
   */
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
      req.method
    )
  ) {
    return publicWriteLimiter(req, res, next);
  }

  next();
});

/*
 * ============================================================
 * ADMIN AUDIT LOGGING
 * ============================================================
 */

app.use(
  '/api/v1/admin',
  auditAdminRequests
);

/*
 * ============================================================
 * API ROUTES
 * ============================================================
 */

app.use(
  '/api/v1/health',
  healthRoute
);

app.use(
  '/api/v1/matches',
  matchesRoute
);

app.use(
  '/api/v1/match',
  matchRoute
);

app.use(
  '/api/v1/teams',
  teamsRoute
);

app.use(
  '/api/v1/standings',
  standingsRoute
);

app.use(
  '/api/v1/leagues',
  leaguesRoute
);

app.use(
  '/api/v1/predictions',
  predictionsRoute
);

app.use(
  '/api/v1/queue',
  queueRoute
);

app.use(
  '/api/v1/featured',
  featuredRoute
);

app.use(
  '/api/v1/zoka-picks',
  zokaPicksRoute
);

app.use(
  '/api/v1/leaderboard',
  leaderboardRoute
);

/*
 * PHASE 8:
 * Historical results API.
 */
app.use(
  '/api/v1/results',
  resultsRoute
);

/*
 * ============================================================
 * ADMIN ROUTES
 * ============================================================
 */

app.use(
  '/api/v1/admin/schedulers',
  adminSchedulers
);

app.use(
  '/api/v1/admin/leaderboards',
  leaderboardRoutes
);

app.use(
  '/api/v1/monitoring',
  monitoringDashboard
);

app.use(
  '/api/v1/admin/monitoring',
  monitoringDashboard
);

app.use(
  '/api/v1/admin/kim',
  kimGapsRoutes
);

/*
 * ============================================================
 * AI / KNOWLEDGE
 * ============================================================
 */

app.use(
  '/api/v1/ai',
  aiRoutes
);

app.use(
  '/api/v1/knowledge',
  knowledgeRoutes
);

/*
 * ============================================================
 * SITEMAPS
 * ============================================================
 */

app.use(
  [
    '/sitemap.xml',
    '/zokascore-sitemap.xml',
    '/sitemaps',
  ],
  sitemapRoute
);

/*
 * ============================================================
 * STATIC PUBLIC JSON DATA
 * ============================================================
 *
 * Keep the explicit results route BEFORE express.static().
 * This allows the backend to return a valid empty response
 * when the requested results file doesn't exist.
 */

app.get(
  '/api/v1/data/results/:date.json',
  (req, res) => {
    const date = req.params.date;

    const filePath = path.join(
      process.cwd(),
      'public_data',
      'results',
      `${date}.json`
    );

    if (!fs.existsSync(filePath)) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        date,
        message: 'No finished matches yet',
      });
    }

    return res.sendFile(filePath);
  }
);

/*
 * Static JSON data.
 */
app.use(
  '/api/v1/data',
  express.static(
    path.join(
      process.cwd(),
      'public_data'
    ),
    {
      setHeaders: (res, filePath) => {
        if (!filePath.endsWith('.json')) {
          return;
        }

        /*
         * Live data needs very short caching because
         * scores change frequently.
         */
        if (
          filePath.endsWith('live.json')
        ) {
          res.setHeader(
            'Cache-Control',
            'public, max-age=15'
          );

          return;
        }

        /*
         * Fixtures/results/etc can be cached longer.
         */
        res.setHeader(
          'Cache-Control',
          'public, max-age=900'
        );
      },
    }
  )
);

/*
 * ============================================================
 * 404
 * ============================================================
 */

app.use(notFound);

/*
 * ============================================================
 * GLOBAL ERROR HANDLER
 * ============================================================
 */

app.use(errorHandler);

module.exports = app;