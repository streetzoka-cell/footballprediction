// pipeline/31b-inspect-semantic-conflicts.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');
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

function normalizeCompetition(name) {
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
  if (Array.isArray(val) && val.length === 0) return true;
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

console.log('🔍 Starting Semantic Conflict Root-Cause Inspection...\n');

if (!fs.existsSync(CLUSTER_REPORT)) {
  console.error(`❌ Cluster report not found: ${CLUSTER_REPORT}`);
  process.exit(1);
}

const clusterReport = JSON.parse(fs.readFileSync(CLUSTER_REPORT, 'utf8'));
const clusters = clusterReport.clusters;

const globalCounts = {
  TOTAL_CONFLICTS: 0,
  SCORE_CONFLICTS: 0,
  COMPETITION_CONFLICTS: 0,
  SEASON_CONFLICTS: 0
};

const samples = [];

for (const cluster of clusters) {
  // For speed, we only need to inspect clusters that had conflicts in Step 31
  // But to be safe, we run it on all. If it takes too long, we can restrict it.
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
    const comps = versions.map(v => normalizeCompetition(v.competition));
    const seasons = versions.map(v => v.season ? String(v.season) : null);
    
    const uniqueScores = [...new Set(scores.filter(v => !isMissing(v)))];
    const uniqueComps = [...new Set(comps.filter(v => !isMissing(v)))];
    const uniqueSeasons = [...new Set(seasons.filter(v => !isMissing(v)))];
    
    let hasConflict = false;
    
    if (uniqueScores.length > 1) {
      globalCounts.SCORE_CONFLICTS++;
      hasConflict = true;
    }
    if (uniqueComps.length > 1) {
      globalCounts.COMPETITION_CONFLICTS++;
      hasConflict = true;
    }
    if (uniqueSeasons.length > 1) {
      globalCounts.SEASON_CONFLICTS++;
      hasConflict = true;
    }
    
    if (hasConflict) {
      globalCounts.TOTAL_CONFLICTS++;
      if (samples.length < 3) {
        samples.push({
          clusterId: cluster.clusterId,
          versions: versions.map(v => ({
            folder: v.__folder,
            match_id: v.match_id,
            date: v.date,
            home_team: v.home_team,
            home_team_id: v.home_team_id,
            away_team: v.away_team,
            away_team_id: v.away_team_id,
            score: `${v.home_score}-${v.away_score}`,
            competition: v.competition,
            season: v.season
          }))
        });
      }
    }
  }
}

console.log('============================================================');
console.log(' CONFLICT ROOT-CAUSE ANALYSIS COMPLETE');
console.log('============================================================');
console.log(`Total Conflicts Analyzed: ${globalCounts.TOTAL_CONFLICTS}`);
console.log(`  - Caused by Score difference:       ${globalCounts.SCORE_CONFLICTS}`);
console.log(`  - Caused by Competition difference: ${globalCounts.COMPETITION_CONFLICTS}`);
console.log(`  - Caused by Season difference:      ${globalCounts.SEASON_CONFLICTS}`);

console.log('\n============================================================');
console.log(' FIRST 3 CONFLICT SAMPLES');
console.log('============================================================');
samples.forEach((s, idx) => {
  console.log(`\n--- SAMPLE ${idx + 1} (Cluster: ${s.clusterId}) ---`);
  s.versions.forEach(v => {
    console.log(JSON.stringify(v, null, 2));
  });
});
      
console.log('\n🛡️ NO FILES WERE MODIFIED.');