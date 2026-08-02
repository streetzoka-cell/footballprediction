// backend-v1/src/middleware/adminAuth.js
const admin = require('firebase-admin');
const env = require('../config/env');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');

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

/** Sync: does this request carry the static ADMIN_API_KEY? */
function isAdminKey(req) {
  const key = extractAdminKey(req);
  return Boolean(key && key === env.ADMIN_API_KEY);
}

/** Async: does this request carry a Firebase ID token belonging to an admin? */
async function isFirebaseAdmin(req) {
  const token = extractBearer(req);
  if (!token || token === env.ADMIN_API_KEY) return false;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const db = getDb();

    // Super admin → admin_users/{uid} exists
    const adminDoc = await db.collection('admin_users').doc(decoded.uid).get();
    if (adminDoc.exists) return true;

    // Role admin → users/{uid}.role === 'admin' | 'staff'
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    const role = (userDoc.exists ? userDoc.data().role : 'user') || 'user';
    return role === 'admin' || role === 'staff';
  } catch (err) {
    logger.warn(`[adminAuth] Firebase token check failed: ${err.message}`);
    return false;
  }
}

/**
 * Admin gate. Accepts the static admin key OR a Firebase admin token.
 */
async function adminAuth(req, res, next) {
  try {
    if (isAdminKey(req)) return next();
    if (await isFirebaseAdmin(req)) return next();
    return res.status(401).json({
      error: 'Unauthorized: Invalid or missing admin credentials',
    });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Sync helper for inline gates (e.g. queue/add) — static key only, unchanged.
adminAuth.verifyAdminRequest = (req) => isAdminKey(req);
adminAuth.isAdminKey = isAdminKey;
adminAuth.isFirebaseAdmin = isFirebaseAdmin;
adminAuth.extractAdminKey = extractAdminKey;

module.exports = adminAuth;