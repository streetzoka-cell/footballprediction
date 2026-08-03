// backend-v1/src/middleware/errorHandler.js

const logger = require('../utils/logger');

/**
 * 404 Not Found Handler
 *
 * Public response:
 *  - No internal paths
 *  - No filesystem details
 *  - No debugging metadata exposed
 *
 * Internal logs keep full details.
 */
function notFound(req, res) {
  const requestId = res.locals?.requestId || 'req_unknown';

  logger.warn(
    `[404] [${requestId}] ${req.method} ${req.originalUrl}`
  );

  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
}


/**
 * Global Error Handler
 *
 * Handles:
 * - API errors
 * - Provider failures
 * - Database errors
 * - Unexpected crashes
 */
function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  const code =
    err.code ||
    (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');

  const requestId =
    res.locals?.requestId || 'req_unknown';


  // Internal logging only
  logger.error(
    `[API Error] [${requestId}] ${req.method} ${req.originalUrl}: ${err.message}`
  );


  // Stack traces stay private
  if (status >= 500) {
    logger.error(err.stack);
  }


  // Safe public message
  let publicMessage;

  if (status >= 500) {
    publicMessage =
      'Something went wrong. Please try again later.';
  } else {
    publicMessage =
      err.message || 'Request failed.';
  }


  res.status(status).json({
    success: false,

    error: {
      code,
      message: publicMessage,
      details:
        process.env.NODE_ENV === 'production'
          ? []
          : (err.details || []),
    },

    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
}


module.exports = {
  notFound,
  errorHandler,
};