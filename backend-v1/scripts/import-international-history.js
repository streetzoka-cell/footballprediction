// backend-v1/scripts/import-international-history.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const INPUT_CSV = path.join(process.cwd(), 'results.csv'); // Place CSV in backend-v1 root
const OUTPUT_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

const slugify = (str) => 
  String(str || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

async function run() {
  console.log('[Import] Reading CSV file...');
  
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`[Import] Error: Could not find ${INPUT_CSV}`);
    process.exit(1);
  }

  const matchesByTournament = {};
  
  const parser = fs.createReadStream(INPUT_CSV).pipe(parse({ columns: true, trim: true }));
  
  for await (const record of parser) {
    const tournament = record.tournament || 'Unknown';
    if (!matchesByTournament[tournament]) {
      matchesByTournament[tournament] = [];
    }
    
    matchesByTournament[tournament].push({
      date: record.date,
      home_team: record.home_team,
      away_team: record.away_team,
      home_score: parseInt(record.home_score, 10) || 0,
      away_score: parseInt(record.away_score, 10) || 0,
      tournament: record.tournament,
      city: record.city,
      country: record.country,
      neutral: record.neutral === 'TRUE'
    });
  }
  
  // Create directories and files for each tournament
  let totalTournaments = 0;
  let totalMatches = 0;
  
  for (const [tournament, matches] of Object.entries(matchesByTournament)) {
    const slug = slugify(tournament);
    const dir = path.join(OUTPUT_DIR, slug);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const payload = {
      id: `${slug}_matches`,
      name: `${tournament} Matches`,
      aliases: [tournament.toLowerCase(), slug.replace(/_/g, ' ')],
      category: 'history',
      intents: ['definition'],
      matches: matches
    };
    
    fs.writeFileSync(path.join(dir, 'matches.json'), JSON.stringify(payload, null, 2));
    console.log(`[Import] Created ${slug}/matches.json with ${matches.length} matches`);
    
    totalTournaments++;
    totalMatches += matches.length;
  }
  
  console.log(`\n[Import] Done! Processed ${totalTournaments} tournaments with ${totalMatches} total matches`);
}

run().catch(err => {
  console.error('[Import] Failed:', err);
  process.exit(1);
});