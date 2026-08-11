// backend-v1/scripts/generate-club-standings.js
const fs = require('fs');
const path = require('path');

const CLUBS_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history', 'clubs');

console.log('[Standings] Scanning club leagues and seasons...');

if (!fs.existsSync(CLUBS_DIR)) {
  console.error('[Standings] Clubs directory not found!');
  process.exit(1);
}

let totalTablesGenerated = 0;

function processSeason(seasonPath) {
  const matchesFile = path.join(seasonPath, 'matches.json');
  if (!fs.existsSync(matchesFile)) return;

  try {
    const raw = fs.readFileSync(matchesFile, 'utf8');
    const parsed = JSON.parse(raw);
    
    if (!parsed || !Array.isArray(parsed.matches)) return;

    const table = {};

    for (const match of parsed.matches) {
      if (!match.score || !match.score.ft || match.score.ft.home === null) continue;
      
      const home = match.home_team;
      const away = match.away_team;
      const hg = match.score.ft.home;
      const ag = match.score.ft.away;
      
      if (!table[home]) table[home] = { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, points: 0 };
      if (!table[away]) table[away] = { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, points: 0 };
      
      // Update stats
      table[home].played++;
      table[away].played++;
      table[home].gf += hg;
      table[home].ga += ag;
      table[away].gf += ag;
      table[away].ga += hg;
      
      if (hg > ag) {
        table[home].win++;
        table[home].points += 3;
        table[away].loss++;
      } else if (hg < ag) {
        table[away].win++;
        table[away].points += 3;
        table[home].loss++;
      } else {
        table[home].draw++;
        table[away].draw++;
        table[home].points += 1;
        table[away].points += 1;
      }
    }

    // Convert to array and calculate GD
    const standings = Object.keys(table).map(team => {
      const t = table[team];
      return {
        team,
        played: t.played,
        win: t.win,
        draw: t.draw,
        loss: t.loss,
        goals_for: t.gf,
        goals_against: t.ga,
        goal_difference: t.gf - t.ga,
        points: t.points
      };
    });

    // Sort standard: Points, GD, GF
    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    });

    const payload = {
      id: parsed.id + '_standings',
      name: parsed.name + ' Standings',
      aliases: [parsed.name + ' table', parsed.name + ' standings'],
      category: 'history',
      intents: ['definition'],
      standings: standings
    };

    fs.writeFileSync(path.join(seasonPath, 'standings.json'), JSON.stringify(payload, null, 2));
    totalTablesGenerated++;
  } catch (e) {
    console.error(`[Standings] Failed to process ${matchesFile}:`, e.message);
  }
}

// Traverse the clubs directory (Country -> League -> Season)
const countries = fs.readdirSync(CLUBS_DIR);
for (const country of countries) {
  const countryPath = path.join(CLUBS_DIR, country);
  if (!fs.statSync(countryPath).isDirectory()) continue;
  
  const leagues = fs.readdirSync(countryPath);
  for (const league of leagues) {
    const leaguePath = path.join(countryPath, league);
    if (!fs.statSync(leaguePath).isDirectory()) continue;
    
    const seasons = fs.readdirSync(leaguePath);
    for (const season of seasons) {
      const seasonPath = path.join(leaguePath, season);
      if (!fs.statSync(seasonPath).isDirectory()) continue;
      
      processSeason(seasonPath);
    }
  }
}

console.log(`\n[Standings] Done! Generated ${totalTablesGenerated} league tables.`);