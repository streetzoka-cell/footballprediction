// backend-v1/src/middleware/auditLogger.js

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const LOG_DIR = path.join(process.cwd(), 'logs');
const AUDIT_FILE = path.join(LOG_DIR, 'audit.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Logs admin API activity.
 *
 * This should be mounted on /api/v1/admin.
 */
function auditAdminRequests(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        requestId: res.locals?.requestId || null,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
        ip: req.ip || req.socket?.remoteAddress || null,
        admin: req.admin
          ? {
              source: req.admin.source || null,
              uid: req.admin.uid || null,
              role: req.admin.role || null,
            }
          : null,
      };

      fs.appendFile(AUDIT_FILE, `${JSON.stringify(entry)}\n`, (err) => {
        if (err) {
          logger.warn(`[Audit] Failed to write audit log: ${err.message}`);
        }
      });
    } catch (err) {
      logger.warn(`[Audit] Error while preparing audit entry: ${err.message}`);
    }
  });

  next();
}

module.exports = auditAdminRequests;