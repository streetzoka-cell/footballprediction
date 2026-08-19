// pipeline/30b-folder-overlap-audit.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const REPORT_FILE = path.join(ROOT, 'data_audit', 'v2_integrity', 'folder_overlap_report.json');

function normalizeTeam(name) {
  if (!name) return '';
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function createFingerprint(match) {
  const home = normalizeTeam(match.home_team);
  const away = normalizeTeam(match.away_team);
  return `${match.date}|${home}|${away}|${match.home_score}|${match.away_score}`;
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) walkDir(fullPath, callback);
    else if (file.endsWith('.json')) callback(fullPath);
  }
}

console.log('🔍 Starting Complete Folder Overlap Matrix Audit...');

const folders = fs.readdirSync(HISTORY_DIR).filter(f => fs.statSync(path.join(HISTORY_DIR, f)).isDirectory());
const folderFingerprints = new Map();

for (const folder of folders) {
  const fingerprints = new Set();
  walkDir(path.join(HISTORY_DIR, folder), (filePath) => {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data.matches)) {
        for (const m of data.matches) {
          if (m && m.date && m.home_team && m.away_team) {
            fingerprints.add(createFingerprint(m));
          }
        }
      }
    } catch (e) {}
  });
  folderFingerprints.set(folder, fingerprints);
}

const overlapPairs = [];

for (let i = 0; i < folders.length; i++) {
  for (let j = i + 1; j < folders.length; j++) {
    const folderA = folders[i];
    const folderB = folders[j];

    const fpsA = folderFingerprints.get(folderA);
    const fpsB = folderFingerprints.get(folderB);

    let overlap = 0;
    for (const fp of fpsA) {
      if (fpsB.has(fp)) overlap++;
    }

    const minSize = Math.min(fpsA.size, fpsB.size);

    if (minSize > 0 && (overlap / minSize) > 0.8) {
      overlapPairs.push({
        folderA,
        folderB,
        matchesA: fpsA.size,
        matchesB: fpsB.size,
        sharedMatches: overlap,
        overlapPercentage: Number(((overlap / minSize) * 100).toFixed(2))
      });
    }
  }
}

overlapPairs.sort((a, b) => b.overlapPercentage - a.overlapPercentage);

fs.writeFileSync(REPORT_FILE, JSON.stringify(overlapPairs, null, 2), 'utf8');

console.log('\n============================================================');
console.log(' FOLDER OVERLAP MATRIX AUDIT COMPLETE');
console.log('============================================================');
console.log(`Total overlapping pairs recorded: ${overlapPairs.length}`);
console.log(`\n📄 Report written to: ${REPORT_FILE}`);