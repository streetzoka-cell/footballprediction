// backend-v1/scripts/update-shootouts.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const INPUT_CSV = path.join(process.cwd(), 'shootouts_update.csv');
const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

const TEAM_ALIASES = {
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

const normalizeTeam = (name) => TEAM_ALIASES[name] || name;

async function run() {
  console.log('[Update] Reading updated shootouts CSV...');
  
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`[Update] Error: Could not find ${INPUT_CSV}`);
    process.exit(1);
  }

  // Build lookup map from new CSV
  const shootoutsLookup = {};
  const parser = fs.createReadStream(INPUT_CSV).pipe(parse({ columns: true, trim: true, delimiter: '|' }));
  
  for await (const record of parser) {
    const date = record.date;
    const homeTeam = normalizeTeam(record.home_team);
    const awayTeam = normalizeTeam(record.away_team);
    const winner = normalizeTeam(record.winner);
    const firstShooter = record.first_shooter;
    
    if (!date || !homeTeam || !awayTeam || !winner) continue;
    
    if (!shootoutsLookup[date]) shootoutsLookup[date] = {};
    if (!shootoutsLookup[date][homeTeam]) shootoutsLookup[date][homeTeam] = {};
    
    shootoutsLookup[date][homeTeam][awayTeam] = {
      winner: winner,
      first_shooter: firstShooter || null
    };
  }
  
  console.log(`[Update] Loaded shootouts from update CSV.`);

  // Iterate through tournament folders
  const tournamentFolders = fs.readdirSync(HISTORY_DIR);
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const folder of tournamentFolders) {
    const folderPath = path.join(HISTORY_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    
    const matchesFile = path.join(folderPath, 'matches.json');
    if (!fs.existsSync(matchesFile)) continue;
    
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      let updatedInFile = 0;
      let skippedInFile = 0;
      
      if (parsed && Array.isArray(parsed.matches)) {
        for (const match of parsed.matches) {
          // Skip if already has shootout
          if (match.shootout) {
            skippedInFile++;
            continue;
          }
          
          const date = match.date;
          const homeTeam = match.home_team;
          const awayTeam = match.away_team;
          
          if (date && homeTeam && awayTeam) {
            const shootout = shootoutsLookup[date]?.[homeTeam]?.[awayTeam];
            if (shootout) {
              match.shootout = shootout;
              updatedInFile++;
            }
          }
        }
        
        if (updatedInFile > 0) {
          fs.writeFileSync(matchesFile, JSON.stringify(parsed, null, 2));
          console.log(`[Update] Added shootouts to ${updatedInFile} matches in ${folder}/matches.json (skipped ${skippedInFile} that already had shootouts)`);
          totalUpdated += updatedInFile;
          totalSkipped += skippedInFile;
        }
      }
    } catch (e) {
      console.error(`[Update] Failed to process ${matchesFile}:`, e.message);
    }
  }
  
  console.log(`\n[Update] Done! Added shootouts to ${totalUpdated} matches. Skipped ${totalSkipped} matches that already had shootouts.`);
}

run().catch(err => {
  console.error('[Update] Failed:', err);
  process.exit(1);
});