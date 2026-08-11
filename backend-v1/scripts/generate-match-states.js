// backend-v1/scripts/generate-match-states.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const INTEL_DIR = path.join(HISTORY_DIR, 'entities', 'team_intelligence');

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
  console.log('[States] Starting Match-State Intelligence Generation...');
  
  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  const teamStates = {};

  function initStats() {
    return {
      scored_first: 0,
      conceded_first: 0,
      won_when_scored_first: 0,
      drawn_when_scored_first: 0,
      lost_when_scored_first: 0,
      points_when_conceded_first: 0, // 0 for loss, 1 for draw, 3 for win
      late_goals_scored: 0, // 75' +
      late_goals_conceded: 0 // 75' +
    };
  }

  function getTeam(name) {
    if (!teamStates[name]) teamStates[name] = initStats();
    return teamStates[name];
  }

  console.log(`[States] Scanning ${matchesFiles.length} match files...`);

  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.matches)) continue;

      for (const match of parsed.matches) {
        const homeTeam = match.home_team;
        const awayTeam = match.away_team;
        const ftHome = match.score?.ft?.home;
        const ftAway = match.score?.ft?.away;
        const goals = match.goals; // Array of { team, minute, scorer }

        if (!homeTeam || !awayTeam || ftHome === null || ftAway === null) continue;

        const home = getTeam(homeTeam);
        const away = getTeam(awayTeam);

        // 1. Late Goals (75 minutes or later)
        if (goals && Array.isArray(goals)) {
          for (const g of goals) {
            const minute = parseInt(g.minute, 10);
            if (minute >= 75 && !g.own_goal) { // Ignore own goals for team stats
              if (g.team === homeTeam) home.late_goals_scored++;
              else if (g.team === awayTeam) away.late_goals_scored++;
              else if (g.scorer && match.home_team.toLowerCase().includes(String(g.scorer).toLowerCase())) home.late_goals_scored++; // fallback
              else if (g.scorer && match.away_team.toLowerCase().includes(String(g.scorer).toLowerCase())) away.late_goals_scored++; // fallback
            }
          }
        }

        // 2. First Goal Logic
        let firstGoalTeam = null;
        if (goals && Array.isArray(goals) && goals.length > 0) {
          // Sort by minute, ignoring own goals and shootout goals (minute < 0)
          const validGoals = goals.filter(g => parseInt(g.minute, 10) > 0 && !g.own_goal);
          if (validGoals.length > 0) {
            validGoals.sort((a, b) => parseInt(a.minute, 10) - parseInt(b.minute, 10));
            firstGoalTeam = validGoals[0].team;
          }
        }

        // If no goals array, infer from HT score (fallback)
        const htHome = match.score?.ht?.home;
        const htAway = match.score?.ht?.away;
        if (!firstGoalTeam && htHome !== null && htAway !== null) {
          if (htHome > 0) firstGoalTeam = homeTeam;
          else if (htAway > 0) firstGoalTeam = awayTeam;
        }

        // Update First Goal Stats
        if (firstGoalTeam) {
          if (firstGoalTeam === homeTeam) {
            home.scored_first++;
            away.conceded_first++;
            if (ftHome > ftAway) { home.won_when_scored_first++; away.points_when_conceded_first += 0; }
            else if (ftHome < ftAway) { home.lost_when_scored_first++; away.points_when_conceded_first += 3; }
            else { home.drawn_when_scored_first++; away.points_when_conceded_first += 1; }
          } else {
            away.scored_first++;
            home.conceded_first++;
            if (ftAway > ftHome) { away.won_when_scored_first++; home.points_when_conceded_first += 0; }
            else if (ftAway < ftHome) { away.lost_when_scored_first++; home.points_when_conceded_first += 3; }
            else { away.drawn_when_scored_first++; home.points_when_conceded_first += 1; }
          }
        }
      }
    } catch (e) {}
  }

  console.log(`[States] Updating ${Object.keys(teamStates).length} team intelligence files...`);
  let updatedCount = 0;

  for (const teamName in teamStates) {
    const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filePath = path.join(INTEL_DIR, `${slug}.json`);

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const teamIntel = JSON.parse(raw);

        const stats = teamStates[teamName];
        
        teamIntel.match_state = {
          scored_first: stats.scored_first,
          conceded_first: stats.conceded_first,
          won_when_scored_first_pct: stats.scored_first > 0 ? parseFloat(((stats.won_when_scored_first / stats.scored_first) * 100).toFixed(1)) : 0,
          avg_points_when_conceded_first: stats.conceded_first > 0 ? parseFloat((stats.points_when_conceded_first / stats.conceded_first).toFixed(2)) : 0,
          late_goals_scored: stats.late_goals_scored
        };

        fs.writeFileSync(filePath, JSON.stringify(teamIntel, null, 2));
        updatedCount++;
      } catch (e) {}
    }
  }

  console.log(`\n[States] Done! Updated ${updatedCount} team files with match-state intelligence.`);
}

run().catch(err => { console.error('[States] Failed:', err); process.exit(1); });