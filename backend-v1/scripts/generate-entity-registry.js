'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const OUTPUT_FILE = path.join(HISTORY_DIR, 'entity_registry.json');

function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ');
}

function crawlDirectory(dir, teams, players) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    return;
  }

  for (const file of files) {
    const fullPath = path.join(dir, file);
    let stat;
    try { stat = fs.statSync(fullPath); } catch { continue; }

    if (stat.isDirectory()) {
      crawlDirectory(fullPath, teams, players);
    } else if (file.endsWith('.json')) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf8').trim();
        if (!raw) continue;
        const data = JSON.parse(raw);

        const matches = Array.isArray(data.matches) ? data.matches : (Array.isArray(data) ? data : []);
        
        for (const match of matches) {
          if (match.home_team) teams.add(normalizeName(match.home_team));
          if (match.away_team) teams.add(normalizeName(match.away_team));
          
          // Extract scorers
          if (Array.isArray(match.goals)) {
            for (const goal of match.goals) {
              if (goal.scorer) players.add(normalizeName(goal.scorer));
              if (goal.player) players.add(normalizeName(goal.player));
            }
          }
          
          // Extract lineups/subs if available
          if (Array.isArray(match.lineups)) {
            for (const player of match.lineups) {
              if (player.player_name) players.add(normalizeName(player.player_name));
            }
          }
        }
      } catch (e) {
        // Ignore malformed JSONs silently
      }
    }
  }
}

console.log('============================================================');
console.log(' KIM — ENTITY REGISTRY GENERATOR');
console.log('============================================================');
console.log(`Scanning directory: ${HISTORY_DIR}\n`);

if (!fs.existsSync(HISTORY_DIR)) {
  console.error(`❌ Directory not found: ${HISTORY_DIR}`);
  process.exit(1);
}

const teamsSet = new Set();
const playersSet = new Set();

crawlDirectory(HISTORY_DIR, teamsSet, playersSet);

const registry = {
  teams: Array.from(teamsSet).filter(Boolean).map(name => ({
    canonical: name,
    aliases: [name.toLowerCase()]
  })),
  players: Array.from(playersSet).filter(Boolean).map(name => ({
    canonical: name,
    aliases: [name.toLowerCase()]
  }))
};

try {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`✅ Successfully generated entity_registry.json`);
  console.log(`   - Teams Found:   ${registry.teams.length}`);
  console.log(`   - Players Found: ${registry.players.length}`);
  console.log(`   - Location:      ${OUTPUT_FILE}`);
} catch (e) {
  console.error(`❌ Failed to write file: ${e.message}`);
}