// footballprediction/backend-v1/src/services/StaticFilePublisher.js

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Ensure the local public directory exists
const PUBLIC_DIR = path.join(__dirname, '../../public_data');

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

/**
 * Saves a JSON payload to the local public_data folder.
 * The Express server will serve these files to the frontend.
 * @param {string} filePath - e.g., 'live.json', 'fixtures/today.json'
 * @param {Object|Array} data - The JSON payload
 */
async function publishJSON(filePath, data) {
  try {
    const fullPath = path.join(PUBLIC_DIR, filePath);
    const dir = path.dirname(fullPath);
    
    // Create subdirectories if they don't exist (e.g., /fixtures)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const buffer = JSON.stringify(data);
    fs.writeFileSync(fullPath, buffer);
    
    logger.info(`[StaticPublisher] Published ${filePath} (${(buffer.length / 1024).toFixed(2)} KB)`);
  } catch (err) {
    logger.error(`[StaticPublisher] Failed to publish ${filePath}: ${err.message}`);
  }
}

module.exports = { publishJSON };
