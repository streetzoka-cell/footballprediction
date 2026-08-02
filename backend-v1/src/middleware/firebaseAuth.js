// backend-v1/src/middleware/firebaseAuth.js

const admin = require('firebase-admin');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

const userRoleCache = new Map();
const ROLE_TTL_MS = 60 * 1000;

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

async function verifyFirebaseIdToken(token) {
  try {
    if (!token) return null;

    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    logger.warn(`[FirebaseAuth] verifyIdToken failed: ${err.message}`);
    return null;
  }
}

async function getUserRole(uid) {
  const cached = userRoleCache.get(uid);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.role;
  }

  let role = 'user';
  let isAdminCollection = false;

  try {
    const db = getDb();

    const [userSnap, adminSnap] = await Promise.all([
      db.collection('users').doc(uid).get().catch(() => null),
      db.collection('admin_users').doc(uid).get().catch(() => null),
    ]);

    if (userSnap && userSnap.exists) {
      const data = userSnap.data() || {};
      const normalizedRole = String(data.role || 'user').toLowerCase();

      if (normalizedRole === 'admin' || normalizedRole === 'staff') {
        role = normalizedRole;
      }
    }

    if (adminSnap && adminSnap.exists) {
      role = 'admin';
      isAdminCollection = true;
    }
  } catch (err) {
    logger.warn(`[FirebaseAuth] Failed to load role for ${uid}: ${err.message}`);
  }

  userRoleCache.set(uid, {
    role,
    isAdminCollection,
    expiresAt: Date.now() + ROLE_TTL_MS,
  });

  return role;
}

function clearUserRoleCache(uid) {
  if (uid) {
    userRoleCache.delete(uid);
  } else {
    userRoleCache.clear();
  }
}

async function buildRequestUser(req) {
  const token = extractBearerToken(req);

  if (!token) return null;

  const decoded = await verifyFirebaseIdToken(token);

  if (!decoded || !decoded.uid) return null;

  const role = await getUserRole(decoded.uid);

  return {
    uid: decoded.uid,
    email: decoded.email || null,
    role,
    isAdmin: role === 'admin' || role === 'staff',
    source: 'firebase',
  };
}

async function authenticateFirebaseUser(req, res, next) {
  try {
    const user = await buildRequestUser(req);

    if (!user) {
      throw ApiError.unauthorized('Authentication required');
    }

    req.user = user;

    next();
  } catch (err) {
    next(err);
  }
}

async function optionalFirebaseUser(req, res, next) {
  try {
    req.user = await buildRequestUser(req);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  extractBearerToken,
  verifyFirebaseIdToken,
  getUserRole,
  clearUserRoleCache,
  buildRequestUser,
  authenticateFirebaseUser,
  optionalFirebaseUser,
};