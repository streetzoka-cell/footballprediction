// backend-v1/src/middleware/errorHandler.js

const logger = require('../utils/logger');

/**
 * 404 Handler
 *
 * Keeps legacy compatibility:
 *   { error: "Route not found" }
 *
 * Adds standardized enterprise format:
 *   {
 *     success: false,
 *     error: { code, message, details },
 *     meta: { requestId, timestamp }
 *   }
 */
function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'Route not found',
      details: [],
    },
    meta: {
      requestId: res.locals?.requestId || null,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
    },

    // Legacy compatibility
    error: 'Route not found',
  });
}

/**
 * 500 Error Handler
 */
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');

  const publicMessage =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';

  const requestId = res.locals?.requestId || 'req_unknown';

  logger.error(
    `[API Error] [${requestId}] ${req.method} ${req.originalUrl}: ${err.message}`
  );

  if (status >= 500) {
    logger.error(err.stack);
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message: publicMessage,
      details: err.details || [],
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
    },

    // Legacy compatibility
    error: publicMessage,
  });
}

module.exports = {
  notFound,
  errorHandler,
};