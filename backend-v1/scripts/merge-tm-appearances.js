// backend-v1/scripts/merge-tm-appearances.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const DOWNLOADS_DIR = 'C:\\Users\\COISA COMPUTERS\\Downloads';
const GAMES_CSV = path.join(DOWNLOADS_DIR, 'games.csv');
const APP_CSV = path.join(DOWNLOADS_DIR, 'appearances.csv');

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
  console.log('[App Merge] Starting Transfermarkt Appearances Sync...');

  // 1. Load Games to map game_id to Date + Score + Teams
  console.log('[App Merge] Loading games.csv...');
  const gamesByDate = {};
  await new Promise((resolve, reject) => {
    fs.createReadStream(GAMES_CSV).pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        const date = row.date;
        const hg = parseInt(row.home_club_goals, 10);
        const ag = parseInt(row.away_club_goals, 10);
        if (date && !isNaN(hg) && !isNaN(ag)) {
          if (!gamesByDate[date]) gamesByDate[date] = [];
          gamesByDate[date].push({ gameId: row.game_id, hg, ag, homeTeam: row.home_club_name, awayTeam: row.away_club_name });
        }
      }).on('end', resolve).on('error', reject);
  });

  // 2. Stream Appearances and group by game_id
  console.log('[App Merge] Streaming appearances.csv (this takes a minute)...');
  const appsByGameId = {};
  let appCount = 0;
  
  await new Promise((resolve, reject) => {
    fs.createReadStream(APP_CSV).pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        const gameId = row.game_id;
        if (!appsByGameId[gameId]) appsByGameId[gameId] = [];
        
        appsByGameId[gameId].push({
          player: row.player_name,
          team: row.player_club_id, // We will map this to the correct team name later if needed, or leave as ID
          goals: parseInt(row.goals, 10) || 0,
          assists: parseInt(row.assists, 10) || 0,
          minutes_played: parseInt(row.minutes_played, 10) || 0,
          yellow_cards: parseInt(row.yellow_cards, 10) || 0,
          red_cards: parseInt(row.red_cards, 10) || 0
        });
        appCount++;
      }).on('end', resolve).on('error', reject);
  });
  console.log(`[App Merge] Loaded ${appCount} appearances for ${Object.keys(appsByGameId).length} games.`);

  // 3. Update matches.json files
  console.log('[App Merge] Updating matches.json files...');
  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  let totalUpdated = 0;

  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      let updatedInFile = 0;

      if (parsed && Array.isArray(parsed.matches)) {
        for (const match of parsed.matches) {
          // Skip if we already attached player stats
          if (match.player_stats) continue;

          const date = match.date;
          const ftHome = match.score?.ft?.home;
          const ftAway = match.score?.ft?.away;

          if (date && ftHome !== null && ftAway !== null && gamesByDate[date]) {
            const possibleGames = gamesByDate[date].filter(g => 
              (g.hg === ftHome && g.ag === ftAway) || (g.ag === ftHome && g.hg === ftAway)
            );

            if (possibleGames.length > 0) {
              let bestMatch = possibleGames[0];
              if (possibleGames.length > 1) {
                bestMatch = possibleGames.find(g => 
                  g.homeTeam.toLowerCase().includes(match.home_team.toLowerCase()) || 
                  match.home_team.toLowerCase().includes(g.homeTeam.toLowerCase())
                ) || possibleGames[0];
              }

              const tmApps = appsByGameId[bestMatch.gameId];
              if (tmApps && tmApps.length > 0) {
                // Map the team IDs to the match team names
                const mappedApps = tmApps.map(app => {
                  let teamName = app.team;
                  if (bestMatch.hg === ftHome && bestMatch.ag === ftAway) {
                    // Normal mapping
                  } else {
                    // Swapped mapping (if we matched a swapped game)
                  }
                  // For now, we just attach the player stats. The frontend can match player names to teams.
                  return { 
                    player: app.player, 
                    goals: app.goals, 
                    assists: app.assists, 
                    minutes_played: app.minutes_played, 
                    yellow_cards: app.yellow_cards, 
                    red_cards: app.red_cards 
                  };
                });

                match.player_stats = mappedApps;
                updatedInFile++;
                totalUpdated++;
              }
            }
          }
        }
        if (updatedInFile > 0) fs.writeFileSync(matchesFile, JSON.stringify(parsed, null, 2));
      }
    } catch (e) {}
  }

  console.log(`\n[App Merge] Done! Attached player stats to ${totalUpdated} matches.`);
}

run().catch(err => { console.error('[App Merge] Failed:', err); process.exit(1); });