'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 27
 * CANONICAL HISTORY ANOMALY RESOLVER (SURGICAL QUARANTINE)
 * ============================================================
 * 
 * PURPOSE:
 * - Scan history files for the 124 known anomalies.
 * - Surgically remove NaN scores and Unknown Clubs.
 * - Quarantine removed records to a JSON file for later investigation.
 * - Rewrite clean files. Delete empty files.
 * - DOES NOT alter the 229,000+ clean matches.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');
const QUARANTINE_FILE = path.join(MIGRATION_DIR, '27-quarantined-anomalies.json');

function walkSync(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSync(fullPath, fileList);
    } else if (entry.name.endsWith('.json')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 27');
  console.log(' CANONICAL HISTORY ANOMALY RESOLVER');
  console.log('============================================================\n');

  fs.mkdirSync(MIGRATION_DIR, { recursive: true });

  const files = walkSync(HISTORY_DIR);
  console.log(`> Scanning ${files.length} history files for anomalies...`);

  let filesPatched = 0;
  let filesDeleted = 0;
  const quarantined = [];

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      continue; 
    }

    if (!data.matches || !Array.isArray(data.matches)) continue;

    const originalLength = data.matches.length;
    
    // Filter out anomalies and record them
    const cleanMatches = data.matches.filter(match => {
      const invalidScore =
        typeof match.home_score !== 'number' ||
        typeof match.away_score !== 'number' ||
        Number.isNaN(match.home_score) ||
        Number.isNaN(match.away_score);

      const unknownClub =
        String(match.home_team).startsWith('Unknown Club') ||
        String(match.away_team).startsWith('Unknown Club');

      if (invalidScore || unknownClub) {
        quarantined.push({
          reason: invalidScore ? 'INVALID_SCORE' : 'UNKNOWN_CLUB',
          source_file: path.relative(ROOT, file),
          match
        });
        return false;
      }

      return true;
    });

    // If we removed records, patch or delete the file
    if (cleanMatches.length < originalLength) {
      if (cleanMatches.length === 0) {
        fs.unlinkSync(file);
        filesDeleted++;
      } else {
        data.matches = cleanMatches;
        data.total_matches = cleanMatches.length;
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
        filesPatched++;
      }
    }
  }

  // Write quarantined records to disk
  fs.writeFileSync(QUARANTINE_FILE, JSON.stringify(quarantined, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log(' STEP 27 COMPLETE');
  console.log('============================================================');
  console.log(`Files Patched       : ${filesPatched}`);
  console.log(`Files Deleted       : ${filesDeleted}`);
  console.log(`Matches Quarantined : ${quarantined.length}`);
  console.log(`Quarantine File     : ${path.relative(ROOT, QUARANTINE_FILE)}`);
  console.log('============================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});