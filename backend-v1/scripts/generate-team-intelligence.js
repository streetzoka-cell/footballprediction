// backend-v1/scripts/generate-team-intelligence.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const OUTPUT_DIR = path.join(HISTORY_DIR, 'entities', 'team_intelligence');

function findMatchesFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findMatchesFiles(filePath, fileList);
    } else if (file === 'matches.json') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function run() {
  console.log('[Intel] Starting Team Intelligence Generation...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  
  // 1. Collect and sort all matches globally by date
  const allMatches = [];
  console.log('[Intel] Scanning and sorting 227k matches...');
  
  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.matches)) continue;
      
      for (const match of parsed.matches) {
        const ftHome = match.score?.ft?.home;
        const ftAway = match.score?.ft?.away;
        if (match.date && match.home_team && match.away_team && ftHome !== null && ftAway !== null) {
          allMatches.push({
            date: match.date,
            home_team: match.home_team,
            away_team: match.away_team,
            ftHome: parseInt(ftHome, 10),
            ftAway: parseInt(ftAway, 10)
          });
        }
      }
    } catch (e) {}
  }

  allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`[Intel] Sorted ${allMatches.length} matches. Aggregating Team Intelligence...`);

  // 2. Build Profiles
  const teamData = {};

  function getTeam(name) {
    if (!teamData[name]) {
      teamData[name] = {
        name,
        overall: { played: 0, win: 0, draw: 0, loss: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 },
        home: { played: 0, win: 0, draw: 0, loss: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 },
        away: { played: 0, win: 0, draw: 0, loss: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 },
        recent_form: [], // Last 10
        h2h: {} // Opponent: { total, wins, draws, losses, goals_for, goals_against, last_5: [] }
      };
    }
    return teamData[name];
  }

  for (const m of allMatches) {
    const home = getTeam(m.home_team);
    const away = getTeam(m.away_team);

    // Update Overall & Venue Stats
    const updateStats = (team, venue, gf, ga) => {
      team[venue].played++;
      team.overall.played++;
      
      team[venue].goals_for += gf;
      team[venue].goals_against += ga;
      team.overall.goals_for += gf;
      team.overall.goals_against += ga;
      
      if (gf === 0) { team[venue].failed_to_score++; team.overall.failed_to_score++; }
      if (ga === 0) { team[venue].clean_sheets++; team.overall.clean_sheets++; }
      
      if (gf > ga) { team[venue].win++; team.overall.win++; }
      else if (gf < ga) { team[venue].loss++; team.overall.loss++; }
      else { team[venue].draw++; team.overall.draw++; }
    };

    updateStats(home, 'home', m.ftHome, m.ftAway);
    updateStats(away, 'away', m.ftAway, m.ftHome);

    // Update Rolling Form (Last 10)
    const homeResult = m.ftHome > m.ftAway ? 'W' : m.ftHome < m.ftAway ? 'L' : 'D';
    const awayResult = m.ftHome > m.ftAway ? 'L' : m.ftHome < m.ftAway ? 'W' : 'D';
    
    home.recent_form.push({ date: m.date, opp: m.away_team, gf: m.ftHome, ga: m.ftAway, res: homeResult, venue: 'H' });
    away.recent_form.push({ date: m.date, opp: m.home_team, gf: m.ftAway, ga: m.ftHome, res: awayResult, venue: 'A' });

    // Update H2H
    if (!home.h2h[m.away_team]) home.h2h[m.away_team] = { total: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, last_5: [] };
    if (!away.h2h[m.home_team]) away.h2h[m.home_team] = { total: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, last_5: [] };

    const h2hHome = home.h2h[m.away_team];
    const h2hAway = away.h2h[m.home_team];

    h2hHome.total++; h2hAway.total++;
    h2hHome.goals_for += m.ftHome; h2hHome.goals_against += m.ftAway;
    h2hAway.goals_for += m.ftAway; h2hAway.goals_against += m.ftHome;

    if (m.ftHome > m.ftAway) { h2hHome.wins++; h2hAway.losses++; }
    else if (m.ftHome < m.ftAway) { h2hHome.losses++; h2hAway.wins++; }
    else { h2hHome.draws++; h2hAway.draws++; }

    h2hHome.last_5.push({ date: m.date, gf: m.ftHome, ga: m.ftAway, res: homeResult });
    h2hAway.last_5.push({ date: m.date, gf: m.ftAway, ga: m.ftHome, res: awayResult });
  }

  // 3. Trim Form to Last 10 and H2H to Last 5, then Save
  console.log(`[Intel] Saving ${Object.keys(teamData).length} team intelligence files...`);
  let savedCount = 0;

  for (const teamName in teamData) {
    const team = teamData[teamName];
    
    team.recent_form = team.recent_form.slice(-10);
    
    for (const opp in team.h2h) {
      team.h2h[opp].last_5 = team.h2h[opp].last_5.slice(-5);
    }

    const payload = {
      id: teamName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name: teamName,
      overall: team.overall,
      home: team.home,
      away: team.away,
      recent_form: team.recent_form,
      h2h: team.h2h
    };

    const filePath = path.join(OUTPUT_DIR, `${payload.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    savedCount++;
  }

  console.log(`\n[Intel] Done! Saved ${savedCount} Team Intelligence profiles.`);
}

run().catch(err => { console.error('[Intel] Failed:', err); process.exit(1); });