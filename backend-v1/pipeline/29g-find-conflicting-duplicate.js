'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(
  ROOT,
  'public_data_v2',
  'knowledge',
  'football',
  'history'
);

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;

  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (file.endsWith('.json')) {
      callback(fullPath);
    }
  }
}

const matchMap = new Map();

walkDir(HISTORY_DIR, filePath => {
  try {
    const data = JSON.parse(
      fs.readFileSync(filePath, 'utf8')
    );

    if (!Array.isArray(data.matches)) return;

    for (const match of data.matches) {
      if (!match.match_id) continue;

      if (!matchMap.has(match.match_id)) {
        matchMap.set(match.match_id, []);
      }

      matchMap.get(match.match_id).push({
        ...match,
        __file: path.relative(ROOT, filePath)
      });
    }
  } catch {}
});

console.log('============================================================');
console.log(' 29G — CONFLICTING DUPLICATE MATCH FORENSIC');
console.log('============================================================\n');

let found = 0;

for (const [matchId, records] of matchMap.entries()) {
  if (records.length < 2) continue;

  const first = records[0];

  const scoresMatch = records.every(
    r =>
      r.home_score === first.home_score &&
      r.away_score === first.away_score
  );

  const teamsMatch = records.every(
    r =>
      r.home_team === first.home_team &&
      r.away_team === first.away_team
  );

  const datesMatch = records.every(
    r => r.date === first.date
  );

  if (!scoresMatch || !teamsMatch || !datesMatch) {
    found++;

    console.log('------------------------------------------------------------');
    console.log(`MATCH ID: ${matchId}`);
    console.log(`Occurrences: ${records.length}`);

    for (const r of records) {
      console.log('\nFILE:');
      console.log(`  ${r.__file}`);

      console.log('DATE:');
      console.log(`  ${r.date}`);

      console.log('TEAMS:');
      console.log(`  ${r.home_team} vs ${r.away_team}`);

      console.log('SCORE:');
      console.log(`  ${r.home_score} - ${r.away_score}`);

      console.log('TEAM IDs:');
      console.log(`  ${r.home_team_id} / ${r.away_team_id}`);

      console.log('COMPETITION:');
      console.log(`  ${r.competition}`);

      console.log('SEASON:');
      console.log(`  ${r.season}`);
    }
  }
}

console.log('\n============================================================');
console.log(`CONFLICTING DUPLICATE IDs FOUND: ${found}`);
console.log('============================================================');
console.log('🛡️ NO FILES WERE MODIFIED.');