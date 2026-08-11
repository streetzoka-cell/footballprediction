// backend-v1/scripts/merge-transfermarkt-goals.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

// ★ Pointing directly to your Downloads folder!
const DOWNLOADS_DIR = 'C:\\Users\\COISA COMPUTERS\\Downloads';
const GAMES_CSV = path.join(DOWNLOADS_DIR, 'games.csv');
const PLAYERS_CSV = path.join(DOWNLOADS_DIR, 'players.csv');
const EVENTS_CSV = path.join(DOWNLOADS_DIR, 'game_events.csv');

// Recursively find all matches.json files
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
  console.log('[Merge] Starting Transfermarkt goals merge...');

  // 1. Load Players
  console.log('[Merge] Loading players.csv...');
  const playerMap = {};
  await new Promise((resolve, reject) => {
    fs.createReadStream(PLAYERS_CSV)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        if (row.player_id && row.name) {
          playerMap[row.player_id] = row.name;
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });
  console.log(`[Merge] Loaded ${Object.keys(playerMap).length} players.`);

  // 2. Load Games
  console.log('[Merge] Loading games.csv...');
  const gamesByDate = {};
  await new Promise((resolve, reject) => {
    fs.createReadStream(GAMES_CSV)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        const gameId = row.game_id;
        const date = row.date;
        const homeGoals = parseInt(row.home_club_goals, 10);
        const awayGoals = parseInt(row.away_club_goals, 10);
        const homeTeam = row.home_club_name;
        const awayTeam = row.away_club_name;
        
        if (date && !isNaN(homeGoals) && !isNaN(awayGoals)) {
          if (!gamesByDate[date]) gamesByDate[date] = [];
          gamesByDate[date].push({ gameId, homeGoals, awayGoals, homeTeam, awayTeam });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });
  console.log(`[Merge] Loaded games for ${Object.keys(gamesByDate).length} dates.`);

  // 3. Process Events and build goalsByGameId
  console.log('[Merge] Processing game_events.csv (this may take a minute)...');
  const goalsByGameId = {};
  let eventCount = 0;
  
  await new Promise((resolve, reject) => {
    fs.createReadStream(EVENTS_CSV)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        if (row.type === 'Goals') {
          const gameId = row.game_id;
          const minute = parseInt(row.minute, 10);
          const playerId = row.player_id;
          const clubName = row.club_name;
          const description = (row.description || '').toLowerCase();
          
          const scorer = playerMap[playerId] || 'Unknown';
          
          if (!goalsByGameId[gameId]) goalsByGameId[gameId] = [];
          
          goalsByGameId[gameId].push({
            team: clubName, 
            scorer: scorer,
            minute: isNaN(minute) ? null : minute,
            own_goal: description.includes('own-goal'),
            penalty: description.includes('penalty')
          });
          eventCount++;
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });
  console.log(`[Merge] Extracted ${eventCount} goals from events.`);

  // 4. Iterate through matches.json files and update
  console.log('[Merge] Updating matches.json files...');
  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  let totalMatchesUpdated = 0;
  let totalGoalsAttached = 0;

  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      let updatedInFile = 0;

      if (parsed && Array.isArray(parsed.matches)) {
        for (const match of parsed.matches) {
          // Skip if already has goals to prevent duplication
          if (match.goals && match.goals.length > 0) continue;

          const date = match.date;
          const ftHome = match.score?.ft?.home;
          const ftAway = match.score?.ft?.away;
          const homeTeamJson = match.home_team;
          const awayTeamJson = match.away_team;

          if (date && ftHome !== null && ftAway !== null && gamesByDate[date]) {
            // Find matching game by date and score
            const possibleGames = gamesByDate[date].filter(g => 
              (g.homeGoals === ftHome && g.awayGoals === ftAway) || 
              (g.awayGoals === ftHome && g.homeGoals === ftAway)
            );

            if (possibleGames.length > 0) {
              let bestMatch = null;
              if (possibleGames.length === 1) {
                bestMatch = possibleGames[0];
              } else {
                // If multiple games have same score on same day, try to match by team name
                bestMatch = possibleGames.find(g => 
                  g.homeTeam.toLowerCase().includes(homeTeamJson.toLowerCase()) || 
                  homeTeamJson.toLowerCase().includes(g.homeTeam.toLowerCase()) ||
                  g.awayTeam.toLowerCase().includes(awayTeamJson.toLowerCase()) || 
                  awayTeamJson.toLowerCase().includes(g.awayTeam.toLowerCase())
                ) || possibleGames[0];
              }

              const gameId = bestMatch.gameId;
              const tmGoals = goalsByGameId[gameId];

              if (tmGoals && tmGoals.length > 0) {
                const mappedGoals = tmGoals.map(g => {
                  let teamName = g.team;
                  if (bestMatch.homeGoals === ftHome && bestMatch.awayGoals === ftAway) {
                    if (g.team === bestMatch.homeTeam) teamName = homeTeamJson;
                    else if (g.team === bestMatch.awayTeam) teamName = awayTeamJson;
                  } else {
                    if (g.team === bestMatch.homeTeam) teamName = awayTeamJson;
                    else if (g.team === bestMatch.awayTeam) teamName = homeTeamJson;
                  }
                  return { ...g, team: teamName };
                });

                match.goals = mappedGoals;
                updatedInFile++;
                totalMatchesUpdated++;
                totalGoalsAttached += mappedGoals.length;
              }
            }
          }
        }

        if (updatedInFile > 0) {
          fs.writeFileSync(matchesFile, JSON.stringify(parsed, null, 2));
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  console.log(`\n[Merge] Done! Updated ${totalMatchesUpdated} matches with ${totalGoalsAttached} goals.`);
}

run().catch(err => {
  console.error('[Merge] Failed:', err);
  process.exit(1);
});