// backend-v1/scripts/normalize-teams.js
const fs = require('fs');
const path = require('path');

const INPUT_CSV = path.join(process.cwd(), 'former_names.csv');
const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

console.log('[Normalize] Setting up team aliases...');

// 1. Hardcode the most critical historical national teams first
const teamMap = {
  'West Germany': 'Germany',
  'German DR': 'Germany',
  'Soviet Union': 'Russia',
  'CIS': 'Russia',
  'Yugoslavia': 'Serbia',
  'FR Yugoslavia': 'Serbia',
  'Serbia and Montenegro': 'Serbia',
  'Czechoslovakia': 'Czech Republic',
  'Bohemia': 'Czech Republic'
};

// 2. Also read the CSV for the other 36 teams (like Dahomey -> Benin)
if (fs.existsSync(INPUT_CSV)) {
  const csvContent = fs.readFileSync(INPUT_CSV, 'utf-8');
  const lines = csvContent.split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.toLowerCase().includes('current')) continue;
    
    const parts = line.split(/[,|;\t]/).map(p => p.trim().replace(/^"|"$/g, ''));
    
    if (parts.length >= 4) {
      if (parts[1] && parts[2]) teamMap[parts[2]] = parts[1];
    } else if (parts.length >= 2) {
      if (parts[0] && parts[1]) teamMap[parts[1]] = parts[0];
    }
  }
  console.log(`[Normalize] Loaded additional names from CSV.`);
} else {
  console.log(`[Normalize] Warning: former_names.csv not found. Using hardcoded list only.`);
}

console.log(`[Normalize] Total aliases to check: ${Object.keys(teamMap).length}`);

if (!fs.existsSync(HISTORY_DIR)) {
  console.error(`[Normalize] Error: History directory not found at ${HISTORY_DIR}`);
  process.exit(1);
}

const tournamentFolders = fs.readdirSync(HISTORY_DIR);
let totalMatchesUpdated = 0;

for (const folder of tournamentFolders) {
  const folderPath = path.join(HISTORY_DIR, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;
  
  const matchesFile = path.join(folderPath, 'matches.json');
  if (!fs.existsSync(matchesFile)) continue;
  
  try {
    const raw = fs.readFileSync(matchesFile, 'utf8');
    const parsed = JSON.parse(raw);
    let updatedInFile = 0;
    
    if (parsed && Array.isArray(parsed.matches)) {
      for (const match of parsed.matches) {
        let changed = false;
        
        if (match.home_team && teamMap[match.home_team]) {
          match.home_team_historical = match.home_team;
          match.home_team = teamMap[match.home_team];
          changed = true;
        }

        if (match.away_team && teamMap[match.away_team]) {
          match.away_team_historical = match.away_team;
          match.away_team = teamMap[match.away_team];
          changed = true;
        }
        
        if (changed) {
          updatedInFile++;
          totalMatchesUpdated++;
        }
      }
      
      if (updatedInFile > 0) {
        fs.writeFileSync(matchesFile, JSON.stringify(parsed, null, 2));
        console.log(`[Normalize] Updated ${updatedInFile} matches in ${folder}/matches.json`);
      }
    }
  } catch (e) {
    console.error(`[Normalize] Failed to process ${matchesFile}:`, e.message);
  }
}

console.log(`\n[Normalize] Done! Updated team names in ${totalMatchesUpdated} matches.`);