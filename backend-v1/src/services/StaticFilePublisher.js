// backend-v1/src/services/StaticFilePublisher.js
const path = require('path');
const fsp = require('fs').promises;
const logger = require('../utils/logger');
const { writeJSONAtomic, ensureDirSync } = require('../utils/atomicWriter');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data');

ensureDirSync(PUBLIC_DIR);

/**
 * Saves a JSON payload to the local public_data folder atomically.
 *
 * Examples:
 *   publishJSON('live.json', payload)
 *   publishJSON('fixtures/2025-08-02.json', payload)
 *   publishJSON('standings.json', payload)
 */
async function publishJSON(filePath, data) {
  try {
    const fullPath = path.join(PUBLIC_DIR, filePath);

    // fixtures/, results/, knowledge/... may not exist on a fresh deploy
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });

    const result = await writeJSONAtomic(fullPath, data, { pretty: false });

    logger.info(
      `[StaticPublisher] Published ${filePath} (${(result.bytes / 1024).toFixed(2)} KB)`
    );
    return { ok: true, bytes: result.bytes };
  } catch (err) {
    logger.error(`[StaticPublisher] Failed to publish ${filePath}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = { publishJSON };