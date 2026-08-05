// backend-v1/src/middleware/errorHandler.js
const logger = require('../utils/logger');

function notFound(req, res) {
  const requestId = res.locals?.requestId || 'req_unknown';
  logger.warn(`[404] [${requestId}] ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
    meta: { requestId, timestamp: new Date().toISOString() },
  });
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const requestId = res.locals?.requestId || 'req_unknown';

  // 7. Secrets & 14. Logs: Log securely internally, never expose stack to client
  const safeLog = {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    error: err.message
  };
  
  logger.error(`[API Error] [${requestId}] ${JSON.stringify(safeLog)}`);
  if (status >= 500) logger.error(err.stack); // Internal stack trace only

  // Safe public message (Hide internals in production)
  const publicMessage = process.env.NODE_ENV === 'production' && status >= 500
    ? 'Something went wrong. Please try again later.'
    : err.message || 'Request failed.';

  res.status(status).json({
    success: false,
    error: { code, message: publicMessage, details: process.env.NODE_ENV === 'production' ? [] : (err.details || []) },
    meta: { requestId, timestamp: new Date().toISOString() },
  });
}

module.exports = { notFound, errorHandler };