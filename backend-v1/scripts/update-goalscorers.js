// backend-v1/scripts/update-goalscorers.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const INPUT_CSV = path.join(process.cwd(), 'goalscorers_update.csv');
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
  console.log('[Update] Reading updated goalscorers CSV...');
  
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`[Update] Error: Could not find ${INPUT_CSV}`);
    process.exit(1);
  }

  // Build lookup map from new CSV
  const goalsLookup = {};
  const parser = fs.createReadStream(INPUT_CSV).pipe(parse({ columns: true, trim: true }));
  
  for await (const record of parser) {
    const date = record.date;
    const homeTeam = normalizeTeam(record.home_team);
    const awayTeam = normalizeTeam(record.away_team);
    
    if (!date || !homeTeam || !awayTeam) continue;
    
    if (!goalsLookup[date]) goalsLookup[date] = {};
    if (!goalsLookup[date][homeTeam]) goalsLookup[date][homeTeam] = {};
    if (!goalsLookup[date][homeTeam][awayTeam]) goalsLookup[date][homeTeam][awayTeam] = [];
    
    goalsLookup[date][homeTeam][awayTeam].push({
      team: normalizeTeam(record.team),
      scorer: record.scorer,
      minute: parseInt(record.minute, 10) || null,
      own_goal: String(record.own_goal).toUpperCase() === 'TRUE',
      penalty: String(record.penalty).toUpperCase() === 'TRUE'
    });
  }
  
  console.log(`[Update] Loaded goalscorers from update CSV.`);

  // Iterate through tournament folders
  const tournamentFolders = fs.readdirSync(HISTORY_DIR);
  let totalUpdated = 0;
  let totalGoalsAdded = 0;
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
          // Skip if already has goals
          if (match.goals && match.goals.length > 0) {
            skippedInFile++;
            continue;
          }
          
          const date = match.date;
          const homeTeam = match.home_team;
          const awayTeam = match.away_team;
          
          if (date && homeTeam && awayTeam) {
            const goals = goalsLookup[date]?.[homeTeam]?.[awayTeam];
            if (goals && goals.length > 0) {
              match.goals = goals;
              updatedInFile++;
              totalGoalsAdded += goals.length;
            }
          }
        }
        
        if (updatedInFile > 0) {
          fs.writeFileSync(matchesFile, JSON.stringify(parsed, null, 2));
          console.log(`[Update] Added goals to ${updatedInFile} matches in ${folder}/matches.json (skipped ${skippedInFile} that already had goals)`);
          totalUpdated += updatedInFile;
          totalSkipped += skippedInFile;
        }
      }
    } catch (e) {
      console.error(`[Update] Failed to process ${matchesFile}:`, e.message);
    }
  }
  
  console.log(`\n[Update] Done! Added goals to ${totalUpdated} matches (${totalGoalsAdded} total goals). Skipped ${totalSkipped} matches that already had goals.`);
}

run().catch(err => {
  console.error('[Update] Failed:', err);
  process.exit(1);
});