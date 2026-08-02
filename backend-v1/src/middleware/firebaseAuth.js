// backend-v1/src/middleware/firebaseAuth.js
const admin = require('firebase-admin');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

/**
 * Extracts and verifies a Firebase ID token from "Authorization: Bearer <token>".
 * Returns decoded token or null.
 */
async function verifyBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split('Bearer ')[1];
    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    logger.warn(`[FirebaseAuth] Token verification failed: ${err.message}`);
    return null;
  }
}

/**
 * Checks if a uid is admin (admin_users collection OR users.role).
 */
async function isAdminUser(uid) {
  try {
    const db = getDb();
    const adminDoc = await db.collection('admin_users').doc(uid).get();
    if (adminDoc.exists) return { role: 'admin', isSuperAdmin: true };

    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const role = (userDoc.data().role || 'user').toLowerCase();
      if (role === 'admin' || role === 'staff') {
        return { role, isSuperAdmin: false };
      }
    }
  } catch (err) {
    logger.warn(`[FirebaseAuth] Admin check failed for ${uid}: ${err.message}`);
  }
  return null;
}

/**
 * Middleware: requires a valid Firebase user token.
 * Attaches req.user = { uid, email }.
 */
async function authenticateFirebaseUser(req, res, next) {
  const decoded = await verifyBearerToken(req);
  if (!decoded) {
    return next(ApiError.unauthorized('Valid Firebase ID token required'));
  }
  req.user = { uid: decoded.uid, email: decoded.email || null };
  next();
}

/**
 * Middleware: attaches req.user if token present, but doesn't fail without one.
 */
async function optionalFirebaseUser(req, res, next) {
  const decoded = await verifyBearerToken(req);
  if (decoded) {
    req.user = { uid: decoded.uid, email: decoded.email || null };
  }
  next();
}

/**
 * Middleware: requires Firebase user AND admin role.
 */
async function requireFirebaseAdmin(req, res, next) {
  const decoded = await verifyBearerToken(req);
  if (!decoded) {
    return next(ApiError.unauthorized('Valid Firebase ID token required'));
  }
  const adminInfo = await isAdminUser(decoded.uid);
  if (!adminInfo) {
    return next(ApiError.forbidden('Admin access required'));
  }
  req.user = { uid: decoded.uid, email: decoded.email || null, ...adminInfo };
  next();
}

module.exports = {
  verifyBearerToken,
  isAdminUser,
  authenticateFirebaseUser,
  optionalFirebaseUser,
  requireFirebaseAdmin,

  // backwards compatibility
  firebaseAdminAuth: requireFirebaseAdmin,
};