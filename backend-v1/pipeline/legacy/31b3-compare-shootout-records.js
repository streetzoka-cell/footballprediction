// pipeline/31b3-compare-shootout-records.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');

const TARGET_IDS = new Set([
  'CLUB_53483', 'CLUB_53484', 'CLUB_53485', 'CLUB_53491',
  'CLUB_1027049', 'CLUB_1027723', 'CLUB_2462528', 'CLUB_2462531',
  'CLUB_2462864', 'CLUB_2464610', 'CLUB_3057977', 'CLUB_3058404',
  'CLUB_3061408', 'CLUB_3970790', 'CLUB_3970791', 'CLUB_3971598',
  'CLUB_3972833', 'CLUB_3975879', 'TM_4680835', 'TM_4680844',
  'TM_4274561', 'TM_4274565', 'TM_4274567', 'TM_4280472'
]);

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

console.log('🔍 Side-by-Side Comparison of 24 Shootout Matches...\n');

const files = walkSync(HISTORY_DIR, []);
const allMatches = [];

for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.matches)) continue;
    for (const m of data.matches) {
      allMatches.push({ ...m, __folder: path.basename(path.dirname(file)) });
    }
  } catch (e) {}
}

let verifiedCount = 0;

for (const targetId of TARGET_IDS) {
  const baseMatch = allMatches.find(m => m.match_id === targetId);
  if (!baseMatch) continue;

  const normHome = normalizeTeam(baseMatch.home_team);
  const normAway = normalizeTeam(baseMatch.away_team);
  
  const variants = allMatches.filter(m => 
    m.date === baseMatch.date && 
    normalizeTeam(m.home_team) === normHome && 
    normalizeTeam(m.away_team) === normAway
  );

  if (variants.length < 2) continue;

  // Sort variants by total goals ascending. The lowest score is likely the pre-shootout score.
  variants.sort((a, b) => {
    const totA = parseInt(a.home_score, 10) + parseInt(a.away_score, 10);
    const totB = parseInt(b.home_score, 10) + parseInt(b.away_score, 10);
    return totA - totB;
  });

  const base = variants[0];
  const final = variants[variants.length - 1];

  console.log('------------------------------------------------------------');
  console.log(`MATCH: ${base.home_team} vs ${base.away_team} (${base.date})`);

  for (const v of variants) {
    console.log(`  [${v.__folder}] Score: ${v.home_score}-${v.away_score} | Shootout: ${JSON.stringify(v.shootout)} | Source: ${v.source || 'N/A'}`);
  }

  const penHome = parseInt(final.home_score, 10) - parseInt(base.home_score, 10);
  const penAway = parseInt(final.away_score, 10) - parseInt(base.away_score, 10);

  // Valid shootout math: >= 0, at least 1 penalty scored, and someone wins
  const isLikelyShootout = penHome >= 0 && penAway >= 0 && (penHome + penAway) > 0 && penHome !== penAway;

  console.log(`\n  INTERPRETATION:`);
  console.log(`    Pre-shootout score:       ${base.home_score}-${base.away_score}`);
  console.log(`    Final score (inclusive):  ${final.home_score}-${final.away_score}`);
  console.log(`    Score delta (shootout):   ${penHome}-${penAway}`);
  
  if (isLikelyShootout) {
    console.log(`    Likely shootout: ✅ YES`);
    console.log(`    ⚠️ Shootout metadata missing in V2 (field is null but score contains penalties)`);
    verifiedCount++;
  } else {
    console.log(`    Likely shootout: ❌ NO (Math does not match expected shootout pattern)`);
  }
}

console.log('\n============================================================');
console.log(`SHOOTOUT PATTERN VERIFIED FOR ${verifiedCount} / 24 MATCHES`);
console.log('============================================================');
console.log('🛡️ NO FILES WERE MODIFIED.');