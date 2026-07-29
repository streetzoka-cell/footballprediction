const logger = require('../utils/logger');

// 404 Handler
function notFound(req, res, next) {
  res.status(404).json({ error: 'Route not found' });
}

// 500 Error Handler
function errorHandler(err, req, res, next) {
  logger.error(`[API Error] ${req.method} ${req.originalUrl}: ${err.message}`);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
}

module.exports = { notFound, errorHandler };