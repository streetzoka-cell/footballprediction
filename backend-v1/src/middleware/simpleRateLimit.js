// backend-v1/src/middleware/simpleRateLimit.js

/**
 * Lightweight in-memory rate limiter.
 *
 * Future upgrade:
 * Replace with Redis-based rate limiting for horizontal scaling.
 */
function createRateLimit({
  windowMs = 60 * 1000,
  max = 30,
  keyPrefix = 'rl',
  message = 'Too many requests',
} = {}) {
  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();

    for (const [key, entry] of hits.entries()) {
      if (now > entry.reset) {
        hits.delete(key);
      }
    }
  }, Math.max(windowMs, 60 * 1000));

  if (cleanup.unref) {
    cleanup.unref();
  }

  return function rateLimitMiddleware(req, res, next) {
    const ip =
      req.ip ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      'unknown';

    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.reset) {
      hits.set(key, {
        count: 1,
        reset: now + windowMs,
      });

      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message,
          details: [],
        },
        meta: {
          requestId: res.locals?.requestId || null,
          timestamp: new Date().toISOString(),
          retryAfterMs: entry.reset - now,
        },

        // Legacy compatibility
        error: message,
      });
    }

    next();
  };
}

module.exports = createRateLimit;