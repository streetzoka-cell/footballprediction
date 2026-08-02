// backend-v1/src/middleware/requestContext.js

const { randomUUID } = require('crypto');

/**
 * Attaches a request ID to every request.
 * This is required for enterprise logging, monitoring, and debugging.
 */
module.exports = function requestContext(req, res, next) {
  const requestId =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    `req_${randomUUID()}`;

  res.locals.requestId = requestId;
  res.locals.requestStartedAt = Date.now();

  res.setHeader('X-Request-Id', requestId);

  next();
};