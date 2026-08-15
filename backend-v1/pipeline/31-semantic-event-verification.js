// pipeline/31-semantic-event-verification.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');
const INPUT_REPORT = path.join(ROOT, 'data_audit', 'v2_integrity', 'duplicate_cluster_report.json');
const OUTPUT_REPORT = path.join(ROOT, 'data_audit', 'v2_integrity', 'semantic_event_verification_report.json');

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
            
            events.push({
              ...m,
              __folder: folderName,
              __file: path.basename(file),
              __identities: identities
            });
          }
        }
      }
    } catch (e) {}
  }
  return events;
}

console.log('🔬 Starting Two-Layer Semantic Event Verification...\n');

if (!fs.existsSync(INPUT_REPORT)) {
  console.error(`❌ Input report not found: ${INPUT_REPORT}`);
  process.exit(1);
}

const clusterReport = JSON.parse(fs.readFileSync(INPUT_REPORT, 'utf8'));
const clusters = clusterReport.clusters;

const report = {
  generatedAt: new Date().toISOString(),
  totalClustersAnalyzed: clusters.length,
  globalCounts: {
    CROSS_FOLDER_MATCHES: 0,
    SAME_EVENT_CONSISTENT: 0,
    SAME_EVENT_COMPLEMENTARY: 0,
    SAME_EVENT_CONFLICT: 0,
    DUPLICATE_WITHIN_FOLDER: 0,
    IDENTITY_MATCH_BY_ID: 0,
    IDENTITY_MATCH_BY_NAME: 0,
    IDENTITY_MATCH_ID_NAME: 0
  },
  clusters: []
};

// Hard conflict fields (Score fixed to handle nulls properly)
const HARD_FIELDS = [
  {
    name: 'score',
    get: v => {
      const home = v.home_score;
      const away = v.away_score;
      if (home === null || home === undefined || home === '' || away === null || away === undefined || away === '') {
        return null;
      }
      return `${home}-${away}`;
    }
  },
  { name: 'competition', get: v => normalizeCompetition(v.competition) },
  { name: 'season', get: v => v.season ? String(v.season) : null }
];

const SOFT_FIELDS = [
  { name: 'round', get: v => v.round ? String(v.round).trim() : null },
  { name: 'stadium', get: v => v.stadium ? String(v.stadium).trim() : null }
];

for (const cluster of clusters) {
  console.log(`Analyzing ${cluster.clusterId} (${cluster.folders.map(f => f.folder).join(' vs ')})...`);
  
  const allEvents = [];
  for (const f of cluster.folders) {
    allEvents.push(...loadFolderEvents(f.folder));
  }
  
  // 1. Union-Find to group events by either ID or Name identity
  const parent = allEvents.map((_, i) => i);
  function find(i) {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i, j) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  }
  
  const identityMap = new Map();
  for (let i = 0; i < allEvents.length; i++) {
    for (const id of allEvents[i].__identities) {
      if (identityMap.has(id.key)) {
        union(i, identityMap.get(id.key).index);
        // Track that this group is bridged by both ID and NAME
        identityMap.get(id.key).types.add(id.type);
      } else {
        identityMap.set(id.key, { index: i, types: new Set([id.type]) });
      }
    }
  }
  
  const eventGroups = new Map();
  for (let i = 0; i < allEvents.length; i++) {
    const root = find(i);
    if (!eventGroups.has(root)) eventGroups.set(root, []);
    eventGroups.get(root).push(allEvents[i]);
  }
  
  let consistent = 0;
  let complementary = 0;
  let conflicts = 0;
  let dupesInFolder = 0;
  let crossFolder = 0;
  let matchBy_Id = 0;
  let matchBy_Name = 0;
  let matchBy_IdName = 0;
  const samples = [];
  
  for (const versions of eventGroups.values()) {
    const uniqueFolders = new Set(versions.map(v => v.__folder));
    
    if (uniqueFolders.size < versions.length) {
      dupesInFolder++;
      report.globalCounts.DUPLICATE_WITHIN_FOLDER++;
    }
    
    if (uniqueFolders.size < 2) continue;
    
    crossFolder++;
    report.globalCounts.CROSS_FOLDER_MATCHES++;
    
    // Determine match origin
    let hasIdMatch = false;
    let hasNameMatch = false;
    for (let i = 0; i < versions.length; i++) {
      for (let j = i + 1; j < versions.length; j++) {
        const idsA = versions[i].__identities;
        const idsB = versions[j].__identities;
        const keysA = new Set(idsA.map(id => id.key));
        
        for (const idB of idsB) {
          if (keysA.has(idB.key)) {
            if (idB.type === 'ID') hasIdMatch = true;
            if (idB.type === 'NAME') hasNameMatch = true;
          }
        }
      }
    }
    
    if (hasIdMatch && hasNameMatch) {
      matchBy_IdName++;
      report.globalCounts.IDENTITY_MATCH_ID_NAME++;
    } else if (hasIdMatch) {
      matchBy_Id++;
      report.globalCounts.IDENTITY_MATCH_BY_ID++;
    } else if (hasNameMatch) {
      matchBy_Name++;
      report.globalCounts.IDENTITY_MATCH_BY_NAME++;
    }
    
    let isConflict = false;
    let isComplementary = false;
    
    // 2. Evaluate Hard Fields
    for (const field of HARD_FIELDS) {
      const values = versions.map(v => field.get(v));
      const uniqueNonMissing = [...new Set(values.filter(v => !isMissing(v)))];
      
      if (uniqueNonMissing.length > 1) {
        isConflict = true;
        break;
      }
      if (uniqueNonMissing.length === 1 && values.some(v => isMissing(v))) {
        isComplementary = true;
      }
    }
    
    // 3. Evaluate Soft Fields
    if (!isConflict) {
      for (const field of SOFT_FIELDS) {
        const values = versions.map(v => field.get(v));
        const uniqueNonMissing = [...new Set(values.filter(v => !isMissing(v)))];
        if (uniqueNonMissing.length >= 1 && values.some(v => isMissing(v))) {
          isComplementary = true;
        }
      }
      
      // Explicit Goals Logic
      const hasGoals = versions.some(v => Array.isArray(v.goals) && v.goals.length > 0);
      const missingGoals = versions.some(v => !Array.isArray(v.goals) || v.goals.length === 0);
      if (hasGoals && missingGoals) {
        isComplementary = true;
      }
    }
    
    // 4. Classify
    if (isConflict) {
      conflicts++;
      report.globalCounts.SAME_EVENT_CONFLICT++;
      if (samples.length < 5) {
        samples.push({
          type: 'CONFLICT',
          versions: versions.map(v => ({
            folder: v.__folder,
            match_id: v.match_id,
            score: `${v.home_score}-${v.away_score}`,
            competition: v.competition,
            season: v.season
          }))
        });
      }
    } else if (isComplementary) {
      complementary++;
      report.globalCounts.SAME_EVENT_COMPLEMENTARY++;
    } else {
      consistent++;
      report.globalCounts.SAME_EVENT_CONSISTENT++;
    }
  }
  
  report.clusters.push({
    clusterId: cluster.clusterId,
    totalEventsAnalyzed: allEvents.length,
    crossFolderMatches: crossFolder,
    SAME_EVENT_CONSISTENT: consistent,
    SAME_EVENT_COMPLEMENTARY: complementary,
    SAME_EVENT_CONFLICT: conflicts,
    DUPLICATE_WITHIN_FOLDER: dupesInFolder,
    matchOrigins: {
      BY_ID: matchBy_Id,
      BY_NAME: matchBy_Name,
      ID_NAME_BRIDGE: matchBy_IdName
    }
  });
}

fs.writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2), 'utf8');

console.log('\n============================================================');
console.log(' TWO-LAYER SEMANTIC EVENT VERIFICATION COMPLETE');
console.log('============================================================');
console.log(`Total Clusters Analyzed: ${clusters.length}`);
console.log(`\nGlobal Classification Counts:`);
console.log(`  CROSS_FOLDER_MATCHES:      ${report.globalCounts.CROSS_FOLDER_MATCHES}`);
console.log(`  SAME_EVENT_CONSISTENT:     ${report.globalCounts.SAME_EVENT_CONSISTENT}`);
console.log(`  SAME_EVENT_COMPLEMENTARY:  ${report.globalCounts.SAME_EVENT_COMPLEMENTARY}`);
console.log(`  SAME_EVENT_CONFLICT:       ${report.globalCounts.SAME_EVENT_CONFLICT}`);
console.log(`  DUPLICATE_WITHIN_FOLDER:   ${report.globalCounts.DUPLICATE_WITHIN_FOLDER}`);
console.log(`\nMatch Origins:`);
console.log(`  IDENTITY_MATCH_BY_ID:      ${report.globalCounts.IDENTITY_MATCH_BY_ID}`);
console.log(`  IDENTITY_MATCH_BY_NAME:    ${report.globalCounts.IDENTITY_MATCH_BY_NAME}`);
console.log(`  IDENTITY_MATCH_ID_NAME:    ${report.globalCounts.IDENTITY_MATCH_ID_NAME}`);
console.log(`\n📄 Report written to: ${OUTPUT_REPORT}`);
console.log('🛡️ NO FILES WERE MODIFIED.');