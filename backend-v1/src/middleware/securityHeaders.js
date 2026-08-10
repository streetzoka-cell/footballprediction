
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

/**
 * Security and performance middleware.
 *
 * IMPORTANT:
 * CORS is intentionally NOT configured here.
 * CORS belongs in server.js and must be registered before
 * the API routes.
 */
function securityHeaders(app) {
  /*
   * ------------------------------------------------------------
   * HELMET
   * ------------------------------------------------------------
   */
  if (helmet) {
    app.use(
      helmet({
        /*
         * The API does not need to impose a browser CSP.
         * CSP is primarily a frontend document concern.
         */
        contentSecurityPolicy: false,

        /*
         * The API is consumed cross-origin by:
         *
         * https://zokascore.xyz
         *
         * Do not let Helmet add:
         *
         * Cross-Origin-Resource-Policy: same-origin
         *
         * which could interfere with cross-origin resources.
         */
        crossOriginResourcePolicy: false,
      })
    );
  }

  /*
   * ------------------------------------------------------------
   * COMPRESSION
   * ------------------------------------------------------------
   */
  if (compression) {
    app.use(compression());
  }

  /*
   * ------------------------------------------------------------
   * ADDITIONAL SECURITY HEADERS
   * ------------------------------------------------------------
   */
  app.use((req, res, next) => {
    res.setHeader(
      'X-Content-Type-Options',
      'nosniff'
    );

    res.setHeader(
      'X-Frame-Options',
      'DENY'
    );

    res.setHeader(
      'Referrer-Policy',
      'strict-origin-when-cross-origin'
    );

    res.setHeader(
      'X-Permitted-Cross-Domain-Policies',
      'none'
    );

    /*
     * HSTS should only be sent over HTTPS.
     *
     * Vercel/reverse proxies commonly terminate TLS before
     * forwarding the request, hence x-forwarded-proto.
     */
    const isHttps =
      req.secure === true ||
      req.headers['x-forwarded-proto'] === 'https';

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
