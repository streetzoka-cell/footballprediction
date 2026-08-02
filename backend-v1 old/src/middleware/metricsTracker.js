// footballprediction/backend-v1/src/middleware/metricsTracker.js
module.exports = function metricsTracker(req, res, next) {
  // Initialize globals if they don't exist
  if (typeof global.requestCount === 'undefined') global.requestCount = 0;
  if (typeof global.errorCount === 'undefined') global.errorCount = 0;

  global.requestCount++;

  res.on('finish', () => {
    if (res.statusCode >= 400) {
      global.errorCount++;
    }
  });

  next();
};
