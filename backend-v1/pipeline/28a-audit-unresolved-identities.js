'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 28A
 * UNRESOLVED IDENTITY AUDIT
 * ============================================================
 * 
 * PURPOSE:
 * - Re-scan history files.
 * - Identify matches where team names don't resolve to canonical IDs.
 * - Tally unique unresolved names and their frequency.
 * - Identify the competitions/seasons they appear in.
 * - STRICTLY READ-ONLY.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');

const CLUB_IDENTITY_FILE = path.join(INDEX_DIR, 'club_identity_index.json');
const REPORT_FILE = path.join(MIGRATION_DIR, '28a-unresolved-identity-audit.txt');
const JSON_REPORT_FILE = path.join(MIGRATION_DIR, '28a-unresolved-identity-audit.json');

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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 28A');
  console.log(' UNRESOLVED IDENTITY AUDIT');
  console.log('============================================================\n');

  if (!fs.existsSync(CLUB_IDENTITY_FILE)) {
    console.error('❌ Club identity index not found.');
    process.exit(1);
  }

  console.log('> Loading Club Identity Index...');
  const clubIdentity = JSON.parse(fs.readFileSync(CLUB_IDENTITY_FILE, 'utf8'));
  
  const nameToIdMap = new Map();
  for (const [clubId, data] of Object.entries(clubIdentity)) {
    nameToIdMap.set(data.canonical_name.toLowerCase(), clubId);
    for (const alias of (data.aliases || [])) {
      nameToIdMap.set(alias.toLowerCase(), clubId);
    }
  }

  const files = walkSync(HISTORY_DIR);
  console.log(`> Scanning ${files.length} history files for unresolved identities...`);

  const unresolvedMap = new Map();
  let totalMatches = 0;
  let unresolvedMatches = 0;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.matches) continue;

    for (const match of data.matches) {
      totalMatches++;
      
      const homeId = nameToIdMap.get(String(match.home_team).toLowerCase());
      const awayId = nameToIdMap.get(String(match.away_team).toLowerCase());

      if (!homeId) {
        unresolvedMatches++;
        const nameKey = String(match.home_team);
        if (!unresolvedMap.has(nameKey)) {
          unresolvedMap.set(nameKey, { count: 0, competitions: new Set(), seasons: new Set() });
        }
        const entry = unresolvedMap.get(nameKey);
        entry.count++;
        entry.competitions.add(match.competition);
        entry.seasons.add(match.season);
      }

      if (!awayId) {
        unresolvedMatches++;
        const nameKey = String(match.away_team);
        if (!unresolvedMap.has(nameKey)) {
          unresolvedMap.set(nameKey, { count: 0, competitions: new Set(), seasons: new Set() });
        }
        const entry = unresolvedMap.get(nameKey);
        entry.count++;
        entry.competitions.add(match.competition);
        entry.seasons.add(match.season);
      }
    }
  }

  const unresolvedArr = [...unresolvedMap.entries()].map(([name, data]) => ({
    name,
    count: data.count,
    competitions: [...data.competitions],
    seasons: [...data.seasons]
  })).sort((a, b) => b.count - a.count);

  // Write JSON report for potential programmatic fixing later
  fs.writeFileSync(JSON_REPORT_FILE, JSON.stringify(unresolvedArr, null, 2), 'utf8');

  // Generate Text Report
  const report = [];
  report.push('ZOKASCORE V2 PIPELINE — STEP 28A: UNRESOLVED IDENTITY AUDIT');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push('\n============================================================');
  report.push(' SUMMARY');
  report.push('============================================================');
  report.push(`Total Matches Scanned       : ${totalMatches.toLocaleString()}`);
  report.push(`Total Unresolved References : ${unresolvedMatches.toLocaleString()}`);
  report.push(`Unique Unresolved Names     : ${unresolvedArr.length.toLocaleString()}`);
  report.push(`Current Resolution Rate     : ${((1 - (unresolvedMatches / (totalMatches * 2))) * 100).toFixed(2)}%`);

  report.push('\n============================================================');
  report.push(' TOP 50 UNRESOLVED IDENTITIES');
  report.push('============================================================');
  
  unresolvedArr.slice(0, 50).forEach((item, i) => {
    reportLine(report, `\n${i + 1}. "${item.name}" (${item.count} occurrences)`);
    reportLine(report, `   Competitions : ${item.competitions.join(', ')}`);
    reportLine(report, `   Seasons      : ${item.seasons.slice(0, 5).join(', ')}${item.seasons.length > 5 ? '...' : ''}`);
  });

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');

  console.log('\n============================================================');
  console.log(' STEP 28A COMPLETE');
  console.log('============================================================');
  console.log(`Unique Unresolved Names : ${unresolvedArr.length.toLocaleString()}`);
  console.log(`📄 FULL REPORT           : ${REPORT_FILE}`);
  console.log(`📄 JSON REPORT           : ${JSON_REPORT_FILE}`);
}

function reportLine(arr, text = '') { arr.push(text); }

main().catch(err => {
  console.error(err);
  process.exit(1);
});