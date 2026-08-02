// backend-v1/src/middleware/adminAuth.js
const env = require('../config/env');
const { verifyBearerToken, isAdminUser } = require('./firebaseAuth');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Checks if a request is from a valid admin.
 * Supports:
 *   1. x-admin-api-key header (terminal / curl / schedulers)
 *   2. Firebase Bearer token with admin role (browser admin panel)
 *
 * Returns admin info object or null.
 */
async function verifyAdminRequest(req) {
  // 1. Static API key (legacy / terminal)
  const apiKey = req.headers['x-admin-api-key'];
  if (apiKey && apiKey === env.ADMIN_API_KEY) {
    return { uid: 'api-key', role: 'admin', isSuperAdmin: true, method: 'api-key' };
  }

  // 2. Firebase Bearer token
  const decoded = await verifyBearerToken(req);
  if (decoded) {
    const adminInfo = await isAdminUser(decoded.uid);
    if (adminInfo) {
      return { uid: decoded.uid, email: decoded.email, ...adminInfo, method: 'firebase' };
    }
  }

  return null;
}

/**
 * Express middleware: rejects non-admin requests with 401.
 */
async function adminAuth(req, res, next) {
  const admin = await verifyAdminRequest(req);
  if (!admin) {
    return next(ApiError.unauthorized('Invalid or missing admin credentials'));
  }
  req.adminUser = admin;
  req.user = req.user || { uid: admin.uid, email: admin.email, role: admin.role };
  next();
}

// Attach static method so routes can call adminAuth.verifyAdminRequest(req)
adminAuth.verifyAdminRequest = verifyAdminRequest;

module.exports = adminAuth;