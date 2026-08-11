// backend-v1/scripts/generate-match-features.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

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
  console.log('[Features] Starting Pre-Match Feature Generation (Time Machine)...');
  
  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  const allMatches = [];

  // 1. Collect and sort all matches globally by date
  console.log('[Features] Collecting 226k matches...');
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
            file: matchesFile,
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
  console.log(`[Features] Sorted ${allMatches.length} matches. Stepping through time...`);

  // 2. Initialize State Machines
  const teamState = {};
  const h2hState = {};

  function getTeam(name) {
    if (!teamState[name]) {
      teamState[name] = {
        elo: 1500.0,
        history: [], // Array of { date, res, gf, ga, venue }
        home: { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0 },
        away: { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0 }
      };
    }
    return teamState[name];
  }

  function getH2H(teamA, teamB) {
    const teams = [teamA, teamB].sort();
    const key = `${teams[0]}_${teams[1]}`;
    if (!h2hState[key]) {
      h2hState[key] = { meetings: 0, teamA_wins: 0, teamB_wins: 0, draws: 0, teamA_goals: 0, teamB_goals: 0, teamA: teams[0], teamB: teams[1] };
    }
    return h2hState[key];
  }

  const featuresByMatchKey = {};
  const K = 20.0;
  const HOME_ADV = 100.0;

  // 3. Process Every Match Chronologically
  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i];
    const home = getTeam(m.home_team);
    const away = getTeam(m.away_team);
    const h2h = getH2H(m.home_team, m.away_team);

    // --- SNAPSHOT PRE-MATCH FEATURES (Before updating state) ---
    
    // Form Calculation Helper
    const calcForm = (team, n) => {
      const recent = team.history.slice(-n);
      let pts = 0, gf = 0, ga = 0;
      for (const r of recent) {
        if (r.res === 'W') pts += 3;
        else if (r.res === 'D') pts += 1;
        gf += r.gf; ga += r.ga;
      }
      return { played: recent.length, pts, gf, ga };
    };

    const homeForm5 = calcForm(home, 5);
    const awayForm5 = calcForm(away, 5);
    const homeForm10 = calcForm(home, 10);
    const awayForm10 = calcForm(away, 10);

    // H2H Snapshot
    let h2hHomeWins = 0, h2hAwayWins = 0, h2hDraws = 0, h2hHomeGoals = 0, h2hAwayGoals = 0;
    if (h2h.meetings > 0) {
      if (h2h.teamA === m.home_team) {
        h2hHomeWins = h2h.teamA_wins; h2hAwayWins = h2h.teamB_wins;
        h2hHomeGoals = h2h.teamA_goals; h2hAwayGoals = h2h.teamB_goals;
      } else {
        h2hHomeWins = h2h.teamB_wins; h2hAwayWins = h2h.teamA_wins;
        h2hHomeGoals = h2h.teamB_goals; h2hAwayGoals = h2h.teamA_goals;
      }
    }

    const features = {
      home_elo: parseFloat(home.elo.toFixed(2)),
      away_elo: parseFloat(away.elo.toFixed(2)),
      home_form_pts_5: homeForm5.pts,
      home_form_gf_5: homeForm5.gf,
      home_form_ga_5: homeForm5.ga,
      away_form_pts_5: awayForm5.pts,
      away_form_gf_5: awayForm5.gf,
      away_form_ga_5: awayForm5.ga,
      home_win_pct_home: home.home.played > 0 ? parseFloat(((home.home.win / home.home.played) * 100).toFixed(1)) : 0,
      away_win_pct_away: away.away.played > 0 ? parseFloat(((away.away.win / away.away.played) * 100).toFixed(1)) : 0,
      home_avg_goals_home: home.home.played > 0 ? parseFloat((home.home.gf / home.home.played).toFixed(2)) : 0,
      away_avg_goals_away: away.away.played > 0 ? parseFloat((away.away.gf / away.away.played).toFixed(2)) : 0,
      h2h_meetings: h2h.meetings,
      h2h_home_wins: h2hHomeWins,
      h2h_away_wins: h2hAwayWins,
      h2h_draws: h2hDraws,
      h2h_home_goals: h2hHomeGoals,
      h2h_away_goals: h2hAwayGoals
    };

    // Save features to memory map (key: date|home|away)
    const matchKey = `${m.date}|${m.home_team}|${m.away_team}`;
    featuresByMatchKey[matchKey] = features;

    // --- UPDATE STATE MACHINE WITH MATCH RESULT ---

    // 1. Update History & Venue Stats
    const homeRes = m.ftHome > m.ftAway ? 'W' : m.ftHome < m.ftAway ? 'L' : 'D';
    const awayRes = m.ftHome > m.ftAway ? 'L' : m.ftHome < m.ftAway ? 'W' : 'D';

    home.history.push({ date: m.date, res: homeRes, gf: m.ftHome, ga: m.ftAway, venue: 'H' });
    away.history.push({ date: m.date, res: awayRes, gf: m.ftAway, ga: m.ftHome, venue: 'A' });

    home.home.played++; away.away.played++;
    home.home.gf += m.ftHome; home.home.ga += m.ftAway;
    away.away.gf += m.ftAway; away.away.ga += m.ftHome;
    if (homeRes === 'W') { home.home.win++; away.away.loss++; }
    else if (homeRes === 'L') { home.home.loss++; away.away.win++; }
    else { home.home.draw++; away.away.draw++; }

    // 2. Update H2H State
    h2h.meetings++;
    if (h2h.teamA === m.home_team) {
      h2h.teamA_goals += m.ftHome; h2h.teamB_goals += m.ftAway;
      if (m.ftHome > m.ftAway) h2h.teamA_wins++;
      else if (m.ftAway > m.ftHome) h2h.teamB_wins++;
      else h2h.draws++;
    } else {
      h2h.teamA_goals += m.ftAway; h2h.teamB_goals += m.ftHome;
      if (m.ftAway > m.ftHome) h2h.teamA_wins++;
      else if (m.ftHome > m.ftAway) h2h.teamB_wins++;
      else h2h.draws++;
    }

    // 3. Update Elo
    const homeEloAdj = home.elo + HOME_ADV;
    const awayEloAdj = away.elo;
    const expHome = 1 / (1 + Math.pow(10, (awayEloAdj - homeEloAdj) / 400));
    const expAway = 1 - expHome;

    let actHome = m.ftHome > m.ftAway ? 1.0 : m.ftHome < m.ftAway ? 0.0 : 0.5;
    let actAway = 1.0 - actHome;

    const goalDiff = Math.abs(m.ftHome - m.ftAway);
    let goalMult = 1.0;
    if (goalDiff === 2) goalMult = 1.5;
    else if (goalDiff === 3) goalMult = 1.75;
    else if (goalDiff >= 4) goalMult = 1.75 + ((goalDiff - 3) * 0.5);

    home.elo += K * goalMult * (actHome - expHome);
    away.elo += K * goalMult * (actAway - expAway);

    if (i % 50000 === 0) console.log(`[Features] Processed ${i} / ${allMatches.length} matches...`);
  }

  console.log('[Features] State Machine finished. Injecting features into matches.json files...');

  // 4. Inject Features into JSON Files
  let updatedFiles = 0;
  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.matches)) continue;

      let fileChanged = false;
      for (const match of parsed.matches) {
        const matchKey = `${match.date}|${match.home_team}|${match.away_team}`;
        if (featuresByMatchKey[matchKey]) {
          match.pre_match_features = featuresByMatchKey[matchKey];
          fileChanged = true;
        }
      }

      if (fileChanged) {
        fs.writeFileSync(matchesFile, JSON.stringify(parsed, null, 2));
        updatedFiles++;
      }
    } catch (e) {}
  }

  console.log(`\n[Features] Done! Injected pre-match features into ${updatedFiles} match files.`);
}

run().catch(err => { console.error('[Features] Failed:', err); process.exit(1); });