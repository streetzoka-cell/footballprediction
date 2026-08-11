// backend-v1/scripts/merge-goalscorers.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const INPUT_CSV = path.join(process.cwd(), 'goalscorers.csv');
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
  console.log('[Merge] Reading goalscorers CSV...');
  
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`[Merge] Error: Could not find ${INPUT_CSV}`);
    process.exit(1);
  }

  const goalsLookup = {};
  let totalGoalsInCSV = 0;
  
  const parser = fs.createReadStream(INPUT_CSV).pipe(parse({ columns: true, trim: true }));
  
  for await (const record of parser) {
    const date = record.date;
    // ★ FIX: Normalize team names from CSV so they match the normalized matches.json
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
    totalGoalsInCSV++;
  }
  
  console.log(`[Merge] Loaded ${totalGoalsInCSV} goals into lookup map.`);

  if (!fs.existsSync(HISTORY_DIR)) {
    console.error(`[Merge] Error: History directory not found at ${HISTORY_DIR}`);
    process.exit(1);
  }

  const tournamentFolders = fs.readdirSync(HISTORY_DIR);
  let totalUpdated = 0;
  let totalGoalsAdded = 0;
  const matchedKeys = new Set(); // ★ NEW: Track matched records

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
          const date = match.date;
          const homeTeam = match.home_team;
          const awayTeam = match.away_team;
          
          if (date && homeTeam && awayTeam) {
            const goals = goalsLookup[date]?.[homeTeam]?.[awayTeam];
            if (goals && goals.length > 0) {
              match.goals = goals;
              updatedInFile++;
              totalGoalsAdded += goals.length;
              
              // ★ NEW: Mark this match as matched
              matchedKeys.add(`${date}|${homeTeam}|${awayTeam}`);
            }
          }
        }
        
        if (updatedInFile > 0) {
          fs.writeFileSync(matchesFile, JSON.stringify(parsed, null, 2));
          console.log(`[Merge] Updated ${updatedInFile} matches in ${folder}/matches.json`);
          totalUpdated += updatedInFile;
        }
      }
    } catch (e) {
      console.error(`[Merge] Failed to process ${matchesFile}:`, e.message);
    }
  }
  
  console.log(`\n[Merge] Done! Updated ${totalUpdated} matches with ${totalGoalsAdded} goals.`);

  // ★ NEW: Diagnostic section to find unmatched records
  console.log('\n--- Unmatched Goalscorer Records ---');
  let unmatchedCount = 0;
  for (const [date, homeTeams] of Object.entries(goalsLookup)) {
    for (const [homeTeam, awayTeams] of Object.entries(homeTeams)) {
      for (const [awayTeam, goals] of Object.entries(awayTeams)) {
        const key = `${date}|${homeTeam}|${awayTeam}`;
        if (!matchedKeys.has(key)) {
          console.log(`UNMATCHED -> Date: ${date}, Home: ${homeTeam}, Away: ${awayTeam}, Goals: ${goals.length}`);
          unmatchedCount++;
        }
      }
    }
  }
  if (unmatchedCount === 0) {
    console.log('All goalscorer records were matched successfully!');
  } else {
    console.log(`Total unmatched matches with goals: ${unmatchedCount}`);
  }
}

run().catch(err => {
  console.error('[Merge] Failed:', err);
  process.exit(1);
});