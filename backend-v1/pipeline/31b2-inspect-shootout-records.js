// pipeline/31b2-inspect-shootout-records.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');

// The 24 match_ids identified in Pipeline 33 that have score conflicts
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

console.log('🔍 Inspecting V2 Records for 24 Shootout Matches...\n');

const files = walkSync(HISTORY_DIR, []);
let foundCount = 0;

for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.matches)) continue;

    for (const match of data.matches) {
      if (TARGET_IDS.has(match.match_id)) {
        foundCount++;
        console.log('------------------------------------------------------------');
        console.log(`FILE: ${path.relative(ROOT, file)}`);
        console.log(JSON.stringify(match, null, 2));
        
        if (foundCount >= 3) break; // Just print the first 3 to see the structure
      }
    }
  } catch (e) {}
  
  if (foundCount >= 3) break;
}

if (foundCount === 0) {
  console.log('❌ No matching records found. Check the Match IDs.');
} else if (foundCount < 3) {
  console.log(`\n(Only ${foundCount} records printed)`);
}

console.log('\n🛡️ NO FILES WERE MODIFIED.');