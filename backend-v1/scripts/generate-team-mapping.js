const fs = require('fs');
const path = require('path');
const { getMatcher } = require('../src/services/TeamMatcherService');

const FIXTURES_DIR = path.join(process.cwd(), 'public_data', 'fixtures');
const ALIASES_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'aliases');

function findFixtureFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) findFixtureFiles(filePath, fileList);
    else if (file.endsWith('.json') && !file.includes('.tmp')) fileList.push(filePath);
  }
  return fileList;
}

console.log('[Mapping] Initializing strict TeamMatcher...');
const matcher = getMatcher();

console.log('[Mapping] Scanning local fixtures to extract unique live team names...');
const fixtureFiles = findFixtureFiles(FIXTURES_DIR);
const liveTeams = new Set();

for (const file of fixtureFiles) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const matches = Array.isArray(parsed) ? parsed : (parsed.matches || parsed.data || []);
    
    for (const m of matches) {
      const homeName = m.homeTeam?.name || m.homeName;
      const awayName = m.awayTeam?.name || m.awayName;
      const homeId = m.homeTeam?.id || m.homeTeamId;
      const awayId = m.awayTeam?.id || m.awayTeamId;
      
      if (homeName) liveTeams.add(JSON.stringify({ name: homeName, id: homeId }));
      if (awayName) liveTeams.add(JSON.stringify({ name: awayName, id: awayId }));
    }
  } catch (e) {}
}

console.log(`[Mapping] Found ${liveTeams.size} unique live teams. Resolving against history...`);

const identityMap = {};       // 100% Safe matches
const reviewList = [];        // Matches that need human verification
let missingCount = 0;

for (const teamStr of liveTeams) {
  const { name, id } = JSON.parse(teamStr);
  const resolved = matcher.resolve(name, { teamId: id });
  
  if (resolved) {
    const isSafe = ['ID', 'EXACT', 'ALIAS', 'STRONG'].includes(resolved.type);
    
    if (isSafe) {
      // Add to the safe identity map
      identityMap[name.toLowerCase().trim()] = resolved.name;
    } else {
      // Add to the review list
      reviewList.push({
        liveName: name,
        historicalName: resolved.name,
        score: resolved.score,
        suggestedAlias: name.toLowerCase().trim()
      });
    }
  } else {
    missingCount++;
  }
}

// Ensure directory exists
if (!fs.existsSync(ALIASES_DIR)) fs.mkdirSync(ALIASES_DIR, { recursive: true });

// 1. Save the safe map
const mapPath = path.join(ALIASES_DIR, 'team_identity_map.json');
fs.writeFileSync(mapPath, JSON.stringify(identityMap, null, 2));

// 2. Save the review list
const reviewPath = path.join(ALIASES_DIR, 'team_review_list.json');
fs.writeFileSync(reviewPath, JSON.stringify(reviewList, null, 2));

console.log(`\n[Mapping] Complete!`);
console.log(`  ✅ Safe matches saved to team_identity_map.json: ${Object.keys(identityMap).length} teams`);
console.log(`  🟠 Review matches saved to team_review_list.json: ${reviewList.length} teams`);
console.log(`  ❌ Missing (No history): ${missingCount} teams`);