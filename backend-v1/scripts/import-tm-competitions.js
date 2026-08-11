// backend-v1/scripts/import-tm-competitions.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const COMP_CSV = path.join(process.cwd(), 'competitions.csv');
const GAMES_CSV = path.join('C:\\Users\\COISA COMPUTERS\\Downloads', 'games.csv');

const slugify = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

async function run() {
  console.log('[Import] Loading competitions.csv...');
  const compMap = {};
  await new Promise((res, rej) => {
    fs.createReadStream(COMP_CSV)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (r) => {
        if (r.competition_id) {
          compMap[r.competition_id] = {
            name: r.name,
            type: r.type,
            country: r.country_name || 'International'
          };
        }
      })
      .on('end', res)
      .on('error', rej);
  });
  console.log(`[Import] Loaded ${Object.keys(compMap).length} competitions.`);

  console.log('[Import] Processing games.csv for missing competitions...');
  const matchesByComp = {};
  
  await new Promise((res, rej) => {
    fs.createReadStream(GAMES_CSV)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (r) => {
        const compId = r.competition_id;
        const compInfo = compMap[compId];
        if (!compInfo) return;
        
        const season = r.season;
        if (!season) return;
        
        // Skip domestic leagues (we already imported those from matches.csv)
        if (compInfo.type === 'domestic_league') return;
        
        const seasonFormat = `${parseInt(season)}_${parseInt(season)+1}`;
        const key = `${slugify(compInfo.country)}/${slugify(compInfo.name)}/${seasonFormat}`;
        
        if (!matchesByComp[key]) matchesByComp[key] = [];
        
        const homeGoals = parseInt(r.home_club_goals, 10);
        const awayGoals = parseInt(r.away_club_goals, 10);
        
        matchesByComp[key].push({
          date: r.date,
          round: r.round,
          home_team: r.home_club_name,
          away_team: r.away_club_name,
          score: {
            ft: { 
              home: isNaN(homeGoals) ? null : homeGoals, 
              away: isNaN(awayGoals) ? null : awayGoals, 
              result: homeGoals > awayGoals ? 'H' : homeGoals < awayGoals ? 'A' : 'D' 
            }
          },
          stadium: r.stadium,
          attendance: r.attendance ? parseInt(r.attendance, 10) : null,
          manager: { home: r.home_club_manager_name, away: r.away_club_manager_name }
        });
      })
      .on('end', res)
      .on('error', rej);
  });

  console.log('[Import] Saving missing competitions...');
  let savedCount = 0;
  let totalMatches = 0;
  
  for (const [key, matches] of Object.entries(matchesByComp)) {
    const folder = path.join(HISTORY_DIR, 'clubs', key);
    fs.mkdirSync(folder, { recursive: true });
    
    const payload = {
      id: key.replace(/\//g, '_'),
      name: key.replace(/\//g, ' ').replace(/_/g, ' '),
      category: 'history',
      intents: ['definition'],
      matches: matches
    };
    
    fs.writeFileSync(path.join(folder, 'matches.json'), JSON.stringify(payload, null, 2));
    savedCount++;
    totalMatches += matches.length;
  }

  console.log(`\n[Import] Done! Saved ${savedCount} new competition/season files with ${totalMatches} matches.`);
}

run().catch(err => {
  console.error('[Import] Failed:', err);
  process.exit(1);
});