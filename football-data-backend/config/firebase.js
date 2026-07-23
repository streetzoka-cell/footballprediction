// backend/config/firebase.js
const admin = require('firebase-admin');
const fs = require('fs');
const env = require('./env');
const logger = require('../utils/logger');

let serviceAccount;

try {
  // Read the file directly from the absolute path provided by env.js
  if (!fs.existsSync(env.firebase.serviceAccountPath)) {
    throw new Error(`File does not exist at: ${env.firebase.serviceAccountPath}`);
  }
  const fileContent = fs.readFileSync(env.firebase.serviceAccountPath, 'utf8');
  serviceAccount = JSON.parse(fileContent);
} catch (err) {
  logger.error(`[FIREBASE] Cannot load service account from "${env.firebase.serviceAccountPath}"`);
  logger.error('[FIREBASE] Error details: ' + err.message);
  logger.error('[FIREBASE] Ensure the JSON file exists in your football-data-backend folder.');
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