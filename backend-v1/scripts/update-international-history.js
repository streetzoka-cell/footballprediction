// backend-v1/scripts/update-international-history.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const INPUT_CSV = path.join(process.cwd(), 'results_update.csv');
const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

const slugify = (str) => 
  String(str || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Load existing matches from all tournament folders into a lookup map
function loadExistingMatches() {
  const existing = new Set();
  const tournamentFolders = fs.readdirSync(HISTORY_DIR);
  
  for (const folder of tournamentFolders) {
    const folderPath = path.join(HISTORY_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    
    const matchesFile = path.join(folderPath, 'matches.json');
    if (!fs.existsSync(matchesFile)) continue;
    
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      
      if (parsed && Array.isArray(parsed.matches)) {
        for (const match of parsed.matches) {
          // Create a unique key: date|home_team|away_team|tournament
          const key = `${match.date}|${match.home_team}|${match.away_team}|${match.tournament}`;
          existing.add(key);
        }
      }
    } catch (e) {
      // Skip files that can't be parsed
    }
  }
  
  return existing;
}

async function run() {
  console.log('[Update] Reading updated results CSV...');
  
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`[Update] Error: Could not find ${INPUT_CSV}`);
    process.exit(1);
  }

  if (!fs.existsSync(HISTORY_DIR)) {
    console.error(`[Update] Error: History directory not found at ${HISTORY_DIR}`);
    process.exit(1);
  }

  // Step 1: Load all existing matches into memory
  console.log('[Update] Loading existing matches from database...');
  const existingMatches = loadExistingMatches();
  console.log(`[Update] Found ${existingMatches.size} existing matches in database.`);

  // Step 2: Read the new CSV and group by tournament
  const matchesByTournament = {};
  const parser = fs.createReadStream(INPUT_CSV).pipe(parse({ columns: true, trim: true }));
  
  let totalInCSV = 0;
  let totalNew = 0;
  let totalDuplicates = 0;
  
  for await (const record of parser) {
    totalInCSV++;
    const tournament = record.tournament || 'Unknown';
    const date = record.date;
    const homeTeam = record.home_team;
    const awayTeam = record.away_team;
    
    if (!date || !homeTeam || !awayTeam) continue;
    
    // Check if this match already exists
    const key = `${date}|${homeTeam}|${awayTeam}|${tournament}`;
    
    if (existingMatches.has(key)) {
      totalDuplicates++;
      continue;
    }
    
    // This is a new match!
    totalNew++;
    
    if (!matchesByTournament[tournament]) {
      matchesByTournament[tournament] = [];
    }
    
    matchesByTournament[tournament].push({
      date: date,
      home_team: homeTeam,
      away_team: awayTeam,
      home_score: parseInt(record.home_score, 10) || 0,
      away_score: parseInt(record.away_score, 10) || 0,
      tournament: tournament,
      city: record.city || '',
      country: record.country || '',
      neutral: record.neutral === 'TRUE'
    });
  }
  
  console.log(`\n[Update] CSV Summary:`);
  console.log(`  Total matches in CSV: ${totalInCSV}`);
  console.log(`  Already in database: ${totalDuplicates}`);
  console.log(`  New matches found: ${totalNew}`);
  
  if (totalNew === 0) {
    console.log('\n[Update] Database is already up to date! No new matches to add.');
    return;
  }
  
  // Step 3: Add new matches to existing tournament files
  console.log(`\n[Update] Adding ${totalNew} new matches to database...`);
  
  let tournamentsUpdated = 0;
  
  for (const [tournament, newMatches] of Object.entries(matchesByTournament)) {
    const slug = slugify(tournament);
    const dir = path.join(HISTORY_DIR, slug);
    
    if (!fs.existsSync(dir)) {
      // New tournament folder doesn't exist - create it
      fs.mkdirSync(dir, { recursive: true });
      
      const payload = {
        id: `${slug}_matches`,
        name: `${tournament} Matches`,
        aliases: [tournament.toLowerCase(), slug.replace(/_/g, ' ')],
        category: 'history',
        intents: ['definition'],
        matches: newMatches
      };
      
      fs.writeFileSync(path.join(dir, 'matches.json'), JSON.stringify(payload, null, 2));
      console.log(`[Update] Created new folder ${slug}/ with ${newMatches.length} matches`);
      tournamentsUpdated++;
    } else {
      // Tournament folder exists - append new matches to existing file
      const matchesFile = path.join(dir, 'matches.json');
      
      if (!fs.existsSync(matchesFile)) {
        // matches.json doesn't exist but folder does - create it
        const payload = {
          id: `${slug}_matches`,
          name: `${tournament} Matches`,
          aliases: [tournament.toLowerCase(), slug.replace(/_/g, ' ')],
          category: 'history',
          intents: ['definition'],
          matches: newMatches
        };
        
        fs.writeFileSync(matchesFile, JSON.stringify(payload, null, 2));
        console.log(`[Update] Created ${slug}/matches.json with ${newMatches.length} matches`);
        tournamentsUpdated++;
      } else {
        // matches.json exists - read it, append, and save
        try {
          const raw = fs.readFileSync(matchesFile, 'utf8');
          const parsed = JSON.parse(raw);
          
          if (parsed && Array.isArray(parsed.matches)) {
            parsed.matches.push(...newMatches);
            
            // Sort matches by date
            parsed.matches.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            fs.writeFileSync(matchesFile, JSON.stringify(parsed, null, 2));
            console.log(`[Update] Added ${newMatches.length} new matches to ${slug}/matches.json (total: ${parsed.matches.length})`);
            tournamentsUpdated++;
          }
        } catch (e) {
          console.error(`[Update] Failed to update ${matchesFile}: ${e.message}`);
        }
      }
    }
  }
  
  console.log(`\n[Update] Done! Updated ${tournamentsUpdated} tournament files with ${totalNew} new matches.`);
  console.log(`[Update] Your database now has ${existingMatches.size + totalNew} total matches.`);
}

run().catch(err => {
  console.error('[Update] Failed:', err);
  process.exit(1);
});