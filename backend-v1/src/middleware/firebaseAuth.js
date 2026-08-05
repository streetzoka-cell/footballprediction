// backend-v1/src/middleware/firebaseAuth.js
const admin = require('firebase-admin');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

/**
 * Extracts and verifies a Firebase ID token.
 * 2. Firebase Token Revocation: checkRevoked = true ensures revoked tokens are rejected.
 */
async function verifyBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  
  try {
    const token = authHeader.split('Bearer ')[1];
    // The 'true' argument forces Firebase to check the revocation list.
    const decodedToken = await admin.auth().verifyIdToken(token, true);
    return decodedToken;
  } catch (err) {
    logger.warn(`[FirebaseAuth] Token verification failed: ${err.message}`);
    return null;
  }
}

/**
 * Middleware: requires a valid Firebase user token.
 * 11. IDOR Prevention: Attaches req.user securely from token, ignoring any client-sent UID.
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
 * 1. Admin Authorization: Checks admin_users collection on every request (no insecure caching).
 */
async function requireFirebaseAdmin(req, res, next) {
  const decoded = await verifyBearerToken(req);
  if (!decoded) {
    return next(ApiError.unauthorized('Valid Firebase ID token required'));
  }
  
  try {
    const db = getDb();
    const uid = decoded.uid;
    
    // Check admin_users collection
    const adminDoc = await db.collection('admin_users').doc(uid).get();
    if (adminDoc.exists) {
      req.user = { uid, email: decoded.email, role: 'super_admin' };
      return next();
    }

    // Check users collection for role
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const role = (userDoc.data().role || 'user').toLowerCase();
      if (role === 'admin' || role === 'staff' || role === 'super_admin') {
        req.user = { uid, email: decoded.email, role };
        return next();
      }
    }
    
    return next(ApiError.forbidden('Admin access required'));
  } catch (err) {
    logger.error(`[FirebaseAuth] Admin check failed for ${decoded.uid}: ${err.message}`);
    return next(ApiError.forbidden('Admin verification failed'));
  }
}

module.exports = {
  verifyBearerToken,
  authenticateFirebaseUser,
  optionalFirebaseUser, // ★ RESTORED
  requireFirebaseAdmin,
};