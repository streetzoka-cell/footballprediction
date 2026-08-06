const admin = require('firebase-admin');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

async function verifyBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    // More robust token extraction
    const token = authHeader.substring(7).trim();
    if (!token) return null;

    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (err) {
    logger.warn(`[FirebaseAuth] Token verification failed: ${err.message}`);
    return null;
  }
}

async function isAdminUser(uid) {
  try {
    const db = getDb();

    const adminDoc = await db.collection('admin_users').doc(uid).get();
    if (adminDoc.exists) return { role: 'super_admin', isSuperAdmin: true };

    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const role = String(userDoc.data().role || 'user').toLowerCase();
      if (role === 'admin' || role === 'staff' || role === 'super_admin') {
        return { role, isSuperAdmin: false };
      }
    }
  } catch (err) {
    logger.warn(`[FirebaseAuth] Admin check failed for ${uid}: ${err.message}`);
  }
  return null;
}

async function authenticateFirebaseUser(req, res, next) {
  const decoded = await verifyBearerToken(req);
  if (!decoded) {
    return next(ApiError.unauthorized('Valid Firebase ID token required'));
  }

  req.user = {
    uid: decoded.uid,
    email: decoded.email || null,
    name: decoded.name || null,
    picture: decoded.picture || null,
  };

  next();
}

async function optionalFirebaseUser(req, res, next) {
  const decoded = await verifyBearerToken(req);
  if (decoded) {
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      picture: decoded.picture || null,
    };
  }
  next();
}

async function requireFirebaseAdmin(req, res, next) {
  const decoded = await verifyBearerToken(req);
  if (!decoded) {
    return next(ApiError.unauthorized('Valid Firebase ID token required'));
  }

  const adminInfo = await isAdminUser(decoded.uid);
  if (!adminInfo) {
    return next(ApiError.forbidden('Admin access required'));
  }

  req.user = {
    uid: decoded.uid,
    email: decoded.email || null,
    ...adminInfo,
  };

  next();
}

module.exports = {
  verifyBearerToken,
  isAdminUser,
  authenticateFirebaseUser,
  optionalFirebaseUser,
  requireFirebaseAdmin,
};