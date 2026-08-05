// backend-v1/src/middleware/adminAuth.js
const admin = require('firebase-admin');
const env = require('../config/env');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

function extractBearer(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return null;
}

function extractAdminKey(req) {
  const headerKey = req.headers['x-admin-api-key'];
  if (headerKey) return String(headerKey);
  return extractBearer(req);
}

function isAdminKey(req) {
  const key = extractAdminKey(req);
  return Boolean(key && key === env.ADMIN_API_KEY);
}

async function isFirebaseAdmin(req) {
  const token = extractBearer(req);
  if (!token || token === env.ADMIN_API_KEY) return false;
  
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const db = getDb();

    const adminDoc = await db.collection('admin_users').doc(decoded.uid).get();
    if (adminDoc.exists) {
      req.adminUser = { uid: decoded.uid, role: 'super_admin', method: 'firebase' };
      return true;
    }

    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (userDoc.exists) {
      const role = (userDoc.data().role || 'user').toLowerCase();
      if (role === 'admin' || role === 'staff' || role === 'super_admin') {
        req.adminUser = { uid: decoded.uid, role, method: 'firebase' };
        return true;
      }
    }
    
    return false;
  } catch (err) {
    logger.warn(`[adminAuth] Firebase token check failed: ${err.message}`);
    return false;
  }
}

async function adminAuth(req, res, next) {
  try {
    if (isAdminKey(req)) {
      req.adminUser = { uid: 'api-key', role: 'super_admin', method: 'api-key' };
      return next();
    }
    
    if (await isFirebaseAdmin(req)) {
      return next();
    }

    return next(ApiError.unauthorized('Invalid or missing admin credentials'));
  } catch (err) {
    return next(ApiError.unauthorized('Unauthorized'));
  }
}

adminAuth.verifyAdminRequest = (req) => isAdminKey(req);
adminAuth.isAdminKey = isAdminKey;
adminAuth.isFirebaseAdmin = isFirebaseAdmin;
adminAuth.extractAdminKey = extractAdminKey;

module.exports = adminAuth;