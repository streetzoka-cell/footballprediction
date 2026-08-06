const admin = require('firebase-admin');
const env = require('../config/env');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

function extractBearer(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    // Don't return the admin API key as a Firebase token
    if (token === env.ADMIN_API_KEY) return null;
    return token;
  }
  return null;
}

function extractAdminKey(req) {
  // 1. Check x-admin-api-key header
  const headerKey = req.headers['x-admin-api-key'];
  if (headerKey && String(headerKey) === env.ADMIN_API_KEY) {
    return String(headerKey);
  }

  // 2. Check if Bearer token IS the admin API key
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === env.ADMIN_API_KEY) return token;
  }

  return null;
}

function isAdminKey(req) {
  const key = extractAdminKey(req);
  return Boolean(key && key === env.ADMIN_API_KEY);
}

async function isFirebaseAdmin(req) {
  const token = extractBearer(req);
  if (!token) return false;

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const db = getDb();

    // 1. Super admin check
    const adminDoc = await db.collection('admin_users').doc(decoded.uid).get();
    if (adminDoc.exists) {
      req.adminUser = { uid: decoded.uid, email: decoded.email, role: 'super_admin', method: 'firebase' };
      return true;
    }

    // 2. Role-based admin check
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (userDoc.exists) {
      const role = String(userDoc.data().role || 'user').toLowerCase();
      if (role === 'admin' || role === 'staff' || role === 'super_admin') {
        req.adminUser = { uid: decoded.uid, email: decoded.email, role, method: 'firebase' };
        return true;
      }
      logger.warn(`[adminAuth] User ${decoded.uid} is not admin (role: ${role})`);
    } else {
      logger.warn(`[adminAuth] User ${decoded.uid} not found in DB`);
    }

    return false;
  } catch (err) {
    logger.warn(`[adminAuth] Firebase token check failed: ${err.message}`);
    return false;
  }
}

async function adminAuth(req, res, next) {
  try {
    // 1. Check admin API key first (fastest)
    if (isAdminKey(req)) {
      req.adminUser = { uid: 'api-key', role: 'super_admin', method: 'api-key' };
      return next();
    }

    // 2. Check Firebase admin token
    if (await isFirebaseAdmin(req)) {
      return next();
    }

    return next(ApiError.unauthorized('Invalid or missing admin credentials'));
  } catch (err) {
    return next(ApiError.unauthorized('Unauthorized'));
  }
}

adminAuth.verifyAdminRequest = async (req) => {
  if (isAdminKey(req)) {
    req.adminUser = {
      uid: 'api-key',
      role: 'super_admin',
      method: 'api-key',
    };
    return true;
  }

  return await isFirebaseAdmin(req);
};

adminAuth.isAdminKey = isAdminKey;
adminAuth.isFirebaseAdmin = isFirebaseAdmin;
adminAuth.extractAdminKey = extractAdminKey;

module.exports = adminAuth;