// pipeline/31b1-inspect-score-conflicts.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const CLUSTER_REPORT = path.join(ROOT, 'data_audit', 'v2_integrity', 'duplicate_cluster_report.json');

function walkSync(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSync(fullPath, fileList);
    else if (entry.name.endsWith('.json')) fileList.push(fullPath);
  }
  return fileList;
}

function normalizeTeam(name) {
  if (!name) return '';
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeDate(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).split('T')[0].trim();
}

function isMissing(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  return false;
}

function loadFolderEvents(folderName) {
  const folderPath = path.join(HISTORY_DIR, folderName);
  const files = walkSync(folderPath, []);
  const events = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data.matches)) {
        for (const m of data.matches) {
          if (m && m.date && m.home_team && m.away_team) {
            const date = normalizeDate(m.date);
            const homeName = normalizeTeam(m.home_team);
            const awayName = normalizeTeam(m.away_team);
            const identities = [];
            if (m.home_team_id && m.away_team_id) {
              identities.push({ type: 'ID', key: `${date}|ID:${String(m.home_team_id)}|ID:${String(m.away_team_id)}` });
            }
            identities.push({ type: 'NAME', key: `${date}|NAME:${homeName}|NAME:${awayName}` });
            events.push({ ...m, __folder: folderName, __identities: identities });
          }
        }
      }
    } catch (e) {}
  }
  return events;
}

console.log('🔍 Isolating Genuine Score Conflicts...\n');

const clusterReport = JSON.parse(fs.readFileSync(CLUSTER_REPORT, 'utf8'));
const clusters = clusterReport.clusters;

let foundCount = 0;

for (const cluster of clusters) {
  const allEvents = [];
  for (const f of cluster.folders) {
    allEvents.push(...loadFolderEvents(f.folder));
  }
  
  const parent = allEvents.map((_, i) => i);
  function find(i) { if (parent[i] === i) return i; parent[i] = find(parent[i]); return parent[i]; }
  function union(i, j) { const rI = find(i); const rJ = find(j); if (rI !== rJ) parent[rI] = rJ; }
  
  const identityMap = new Map();
  for (let i = 0; i < allEvents.length; i++) {
    for (const id of allEvents[i].__identities) {
      if (identityMap.has(id.key)) union(i, identityMap.get(id.key));
      else identityMap.set(id.key, i);
    }
  }
  
  const eventGroups = new Map();
  for (let i = 0; i < allEvents.length; i++) {
    const root = find(i);
    if (!eventGroups.has(root)) eventGroups.set(root, []);
    eventGroups.get(root).push(allEvents[i]);
  }
  
  for (const versions of eventGroups.values()) {
    const uniqueFolders = new Set(versions.map(v => v.__folder));
    if (uniqueFolders.size < 2) continue;
    
    const scores = versions.map(v => {
      const h = v.home_score, a = v.away_score;
      if (isMissing(h) || isMissing(a)) return null;
      return `${h}-${a}`;
    });
    const uniqueScores = [...new Set(scores.filter(v => !isMissing(v)))];
    
    if (uniqueScores.length > 1) {
      foundCount++;
      console.log('------------------------------------------------------------');
      console.log(`MATCH ID: ${versions[0].match_id}`);
      for (const v of versions) {
        console.log(`  [${v.__folder}] ${v.home_team} ${v.home_score} - ${v.away_score} ${v.away_team} (${v.date})`);
      }
    }
  }
}

console.log('\n============================================================');
console.log(`TOTAL GENUINE SCORE CONFLICTS FOUND: ${foundCount}`);
console.log('============================================================');