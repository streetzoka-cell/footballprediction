// backend/config/firebase.js
const admin = require('firebase-admin');
const env = require('./env');
const logger = require('../utils/logger');

let serviceAccount;

try {
  serviceAccount = require(env.firebase.serviceAccountPath);
} catch (err) {
  logger.error(`[FIREBASE] Cannot load service account from "${env.firebase.serviceAccountPath}"`);
  logger.error('[FIREBASE] Ensure the JSON file exists and is valid.');
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  const FieldValue = admin.firestore.FieldValue;

  logger.info(`[FIREBASE] Initialised - project: ${serviceAccount.project_id}`);

  module.exports = { admin, db, FieldValue };

} catch (err) {
  logger.error('[FIREBASE] Initialization failed: ' + err.message);
  process.exit(1);
}