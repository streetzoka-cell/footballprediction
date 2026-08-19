'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'source_comparison');

const PAIRS = [
  { name: 'results', original: 'results.csv', update: 'results_update.csv' },
  { name: 'goalscorers', original: 'goalscorers.csv', update: 'goalscorers_update.csv' },
  { name: 'shootouts', original: 'shootouts.csv', update: 'shootouts_update.csv' }
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadCsv(filename) {
  return new Promise((resolve, reject) => {
    const results = [];
    const filePath = path.join(SOURCE_DIR, filename);
    if (!fs.existsSync(filePath)) return resolve([]);
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// Creates a consistent string representation of a row for comparison
function stringifyRow(row) {
  if (!row) return '';
  const keys = Object.keys(row).sort();
  return keys.map(k => String(row[k] || '').trim()).join('|');
}

// Attempts to find a unique identifier for the row
function getRowId(row) {
  if (!row) return null;
  // Common ID fields
  const idFields = ['match_id', 'game_id', 'id', 'fixture_id'];
  for (const field of idFields) {
    if (row[field] && String(row[field]).trim() !== '') {
      return String(row[field]).trim();
    }
  }
  
  // Fallback to composite key (date + home + away)
  const date = row.date || row.Date || '';
  const home = row.home_team || row.home_club_name || row.home_club || '';
  const away = row.away_team || row.away_club_name || row.away_club || '';
  if (date && home && away) {
    return `${date}_${home}_${away}`.toLowerCase().replace(/\s+/g, '');
  }
  
  return null; // No ID possible
}

async function comparePair(pair) {
  console.log(`\n🔍 Comparing ${pair.original} vs ${pair.update}...`);
  
  const originalData = await loadCsv(pair.original);
  const updateData = await loadCsv(pair.update);

  const report = {
    pair: pair.name,
    originalFile: pair.original,
    updateFile: pair.update,
    originalRowCount: originalData.length,
    updateRowCount: updateData.length,
    exactMatches: 0,
    newRowsInUpdate: 0,
    rowsRemovedInUpdate: 0,
    modifiedRows: 0,
    details: {
      newRows: [],       // First 10 samples
      removedRows: [],   // First 10 samples
      modifiedRows: []   // First 10 samples
    }
  };

  const originalMap = new Map();
  const originalStrings = new Set();

  // Index original data
  for (const row of originalData) {
    const id = getRowId(row);
    const str = stringifyRow(row);
    originalStrings.add(str);
    if (id) {
      if (!originalMap.has(id)) originalMap.set(id, []);
      originalMap.get(id).push({ row, str });
    }
  }

  const updateStrings = new Set();
  const matchedIds = new Set();

  // Analyze update data
  for (const row of updateData) {
    const id = getRowId(row);
    const str = stringifyRow(row);
    updateStrings.add(str);

    if (originalStrings.has(str)) {
      report.exactMatches++;
      if (id) matchedIds.add(id);
    } else {
      // It's not an exact match. Is it a new row or a modified row?
      let isModified = false;
      
      if (id && originalMap.has(id)) {
        // We found the same ID in original. Check if any string matches this ID.
        // Actually, since it didn't match exactly above, it's either modified or a duplicate ID.
        isModified = true;
        report.modifiedRows++;
        if (report.details.modifiedRows.length < 10) {
          const originalRow = originalMap.get(id)[0].row;
          report.details.modifiedRows.push({ original: originalRow, update: row });
        }
        matchedIds.add(id);
      } else {
        // No ID match, so it's likely a new row
        report.newRowsInUpdate++;
        if (report.details.newRows.length < 10) {
          report.details.newRows.push(row);
        }
      }
    }
  }

  // Find removed rows (in original, not in update)
  for (const row of originalData) {
    const str = stringifyRow(row);
    if (!updateStrings.has(str)) {
      const id = getRowId(row);
      if (!id || !matchedIds.has(id)) {
        report.rowsRemovedInUpdate++;
        if (report.details.removedRows.length < 10) {
          report.details.removedRows.push(row);
        }
      }
    }
  }

  console.log(`   ✅ Exact Matches: ${report.exactMatches}`);
  console.log(`   ➕ New in Update: ${report.newRowsInUpdate}`);
  console.log(`   ✏️ Modified: ${report.modifiedRows}`);
  console.log(`   ➖ Removed in Update: ${report.rowsRemovedInUpdate}`);

  return report;
}

async function run() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 2: FORENSIC SOURCE COMPARISON');
  console.log('============================================================');

  ensureDir(AUDIT_DIR);

  const allReports = [];

  for (const pair of PAIRS) {
    try {
      const result = await comparePair(pair);
      allReports.push(result);
      
      // Save individual report
      const reportPath = path.join(AUDIT_DIR, `${pair.name}-comparison.json`);
      fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');
    } catch (e) {
      console.error(`❌ Failed to compare ${pair.name}: ${e.message}`);
    }
  }

  // Save summary
  const summaryPath = path.join(AUDIT_DIR, 'source-duplicates-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(allReports, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log(' STEP 2 COMPLETE');
  console.log('============================================================');
  console.log(`📁 Audit Directory: ${AUDIT_DIR}`);
  console.log('🔒 SOURCE DATA WAS NOT MODIFIED.');
}

run().catch(console.error);