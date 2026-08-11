// backend-v1/scripts/generate-index.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const OUTPUT_FILE = path.join(HISTORY_DIR, 'index.json');

console.log('[Index] Scanning database directories...');

const leagues = [];
const clubsDir = path.join(HISTORY_DIR, 'clubs');

// 1. Scan Club Leagues & Cups
if (fs.existsSync(clubsDir)) {
  const countries = fs.readdirSync(clubsDir);
  for (const country of countries) {
    const countryPath = path.join(clubsDir, country);
    if (!fs.statSync(countryPath).isDirectory()) continue;
    
    const competitions = fs.readdirSync(countryPath);
    for (const comp of competitions) {
      const compPath = path.join(countryPath, comp);
      if (!fs.statSync(compPath).isDirectory()) continue;
      
      const seasons = fs.readdirSync(compPath).filter(f => fs.statSync(path.join(compPath, f)).isDirectory());
      if (seasons.length > 0) {
        leagues.push({
          type: 'club',
          country: country.replace(/_/g, ' '),
          competition: comp.replace(/_/g, ' '),
          slug: `${country}/${comp}`,
          seasons: seasons.sort()
        });
      }
    }
  }
}

// 2. Scan International Tournaments
const intDir = HISTORY_DIR;
const intFolders = fs.readdirSync(intDir).filter(f => 
  fs.statSync(path.join(intDir, f)).isDirectory() && f !== 'clubs' && f !== 'entities'
);

for (const folder of intFolders) {
  const folderPath = path.join(intDir, folder);
  const files = fs.readdirSync(folderPath);
  
  // If it's a tournament folder with matches.json directly inside
  if (files.includes('matches.json')) {
    leagues.push({
      type: 'international',
      competition: folder.replace(/_/g, ' '),
      slug: folder,
      seasons: ['all']
    });
  }
}

// Sort leagues alphabetically
leagues.sort((a, b) => a.competition.localeCompare(b.competition));

const payload = {
  id: 'database_index',
  name: 'Database Index',
  category: 'meta',
  intents: ['definition'],
  total_competitions: leagues.length,
  leagues: leagues
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
console.log(`\n[Index] Done! Found ${leagues.length} competitions. Saved to index.json`);