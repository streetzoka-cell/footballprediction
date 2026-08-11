// backend-v1/scripts/generate-records.js
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

console.log('[Records] Scanning all matches.json files...');

const matchesFiles = findMatchesFiles(HISTORY_DIR);
let totalRecordsGenerated = 0;

for (const matchesFile of matchesFiles) {
  try {
    const raw = fs.readFileSync(matchesFile, 'utf8');
    const parsed = JSON.parse(raw);
    
    if (!parsed || !Array.isArray(parsed.matches)) continue;

    const topScorers = {};
    let biggestWin = { margin: 0, match: null };

    for (const match of parsed.matches) {
      // 1. Calculate Top Scorers
      if (match.goals && Array.isArray(match.goals)) {
        for (const goal of match.goals) {
          if (goal.own_goal) continue; // Skip own goals for top scorer stats
          if (!goal.scorer || goal.scorer === 'Unknown') continue;
          
          if (!topScorers[goal.scorer]) topScorers[goal.scorer] = { goals: 0, penalties: 0 };
          topScorers[goal.scorer].goals++;
          if (goal.penalty) topScorers[goal.scorer].penalties++;
        }
      }

      // 2. Calculate Biggest Win
      const ftHome = match.score?.ft?.home;
      const ftAway = match.score?.ft?.away;
      if (ftHome !== null && ftAway !== null && !isNaN(ftHome) && !isNaN(ftAway)) {
        const margin = Math.abs(ftHome - ftAway);
        if (margin > biggestWin.margin) {
          biggestWin = { margin, match: { date: match.date, home: match.home_team, away: match.away_team, score: `${ftHome}-${ftAway}` } };
        }
      }
    }

    // Convert top scorers to array and sort
    const sortedScorers = Object.entries(topScorers)
      .map(([name, stats]) => ({ player: name, goals: stats.goals, penalties: stats.penalties }))
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 20); // Top 20

    if (sortedScorers.length > 0 || biggestWin.match) {
      const recordsPayload = {
        id: parsed.id + '_records',
        name: parsed.name + ' Records',
        category: 'history',
        intents: ['definition'],
        top_scorers: sortedScorers,
        biggest_win: biggestWin.match
      };

      const recordsFile = path.join(path.dirname(matchesFile), 'records.json');
      fs.writeFileSync(recordsFile, JSON.stringify(recordsPayload, null, 2));
      totalRecordsGenerated++;
    }

  } catch (e) {
    // Ignore parse errors
  }
}

console.log(`\n[Records] Done! Generated ${totalRecordsGenerated} records.json files.`);