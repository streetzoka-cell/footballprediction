let helmet = null;
let compression = null;

try {
  helmet = require('helmet');
} catch {
  helmet = null;
}

try {
  compression = require('compression');
} catch {
  compression = null;
}

function securityHeaders(app) {
  if (helmet) {
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: false,
      })
    );
  }

  if (compression) {
    app.use(compression());
  }

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    const isHttps =
      req.secure || req.headers['x-forwarded-proto'] === 'https';

    if (isHttps) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    }

    next();
  });
}

module.exports = securityHeaders;