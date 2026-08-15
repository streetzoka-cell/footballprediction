// pipeline/31c-plan-shootout-repair.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const PLAN_FILE = path.join(ROOT, 'data_audit', 'v2_integrity', 'shootout_repair_plan.json');

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

console.log('🛠️  Planning Surgical Shootout Repairs (Dry Run)...\n');

const files = walkSync(HISTORY_DIR, []);
const allMatches = [];

// 1. Load all matches into memory safely
for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.matches)) continue;
    for (const m of data.matches) {
      allMatches.push({ match: m, file: file });
    }
  } catch (e) {}
}

const plan = {
  generatedAt: new Date().toISOString(),
  totalActions: 0,
  actions: []
};

// 2. Process the 24 target matches
for (const targetId of TARGET_IDS) {
  const baseEntry = allMatches.find(e => e.match.match_id === targetId);
  if (!baseEntry) continue;

  const normHome = normalizeTeam(baseEntry.match.home_team);
  const normAway = normalizeTeam(baseEntry.match.away_team);
  
  // Find all variants of this event
  const variants = allMatches.filter(e => 
    e.match.date === baseEntry.match.date && 
    normalizeTeam(e.match.home_team) === normHome && 
    normalizeTeam(e.match.away_team) === normAway
  );

  if (variants.length < 2) continue;

  // Deterministically find the pre-shootout score from international_history
  const intlEntry = variants.find(e => e.match.source === 'international_history');
  if (!intlEntry) {
    console.log(`⚠️ No international_history record found for ${targetId}. Skipping.`);
    continue;
  }

  const regHome = parseInt(intlEntry.match.home_score, 10);
  const regAway = parseInt(intlEntry.match.away_score, 10);

  // Plan repairs ONLY for Transfermarkt / club-history representations
  for (const entry of variants) {
    const source = entry.match.source;
    if (source !== 'transfermarkt' && source !== 'club_history') continue;

    const v = entry.match;
    const incHome = parseInt(v.home_score, 10);
    const incAway = parseInt(v.away_score, 10);
    const penHome = incHome - regHome;
    const penAway = incAway - regAway;

    // Verify math
    if (penHome >= 0 && penAway >= 0 && (penHome + penAway) > 0 && penHome !== penAway) {
      
      const expectedWinner = penHome > penAway ? v.home_team : v.away_team;
      
      // Check if it already has completely correct shootout data
      const hasCorrectShootout = v.shootout && 
                                 v.shootout.home === penHome && 
                                 v.shootout.away === penAway &&
                                 v.shootout.winner === expectedWinner &&
                                 v.home_score === regHome && 
                                 v.away_score === regAway;

      if (!hasCorrectShootout) {
        plan.totalActions++;
        plan.actions.push({
          targetFile: path.relative(ROOT, entry.file),
          targetMatchId: v.match_id,
          source: source,
          currentScore: `${incHome}-${incAway}`,
          proposedScore: `${regHome}-${regAway}`,
          proposedShootout: {
            home: penHome,
            away: penAway,
            winner: expectedWinner
          }
        });
        console.log(`✅ Planned repair for ${v.match_id} in [${path.basename(path.dirname(entry.file))}]: ${incHome}-${incAway} -> ${regHome}-${regAway} (Pens: ${penHome}-${penAway})`);
      }
    } else {
      console.log(`⚠️ Math does not match shootout pattern for ${v.match_id}. Skipping.`);
    }
  }
}

// 3. Write the plan to disk
fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2), 'utf8');

console.log('\n============================================================');
console.log(' SHOOTOUT REPAIR PLANNING COMPLETE');
console.log('============================================================');
console.log(`Total repairs planned: ${plan.totalActions}`);
console.log(`\n📄 Plan written to: ${PLAN_FILE}`);
console.log('🛡️ NO HISTORY FILES WERE MODIFIED.');