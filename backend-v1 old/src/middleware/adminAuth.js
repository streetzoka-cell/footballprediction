// footballprediction/backend-v1/src/middleware/adminAuth.js

const env = require('../config/env');

function adminAuth(req, res, next) {
  const apiKey = req.headers['x-admin-api-key'];
  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing admin API key' });
  }
  next();
}

module.exports = adminAuth;
