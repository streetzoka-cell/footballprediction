// backend-v1/scripts/merge-tm-events-pro.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const DOWNLOADS_DIR = 'C:\\Users\\COISA COMPUTERS\\Downloads';
const GAMES_CSV = path.join(DOWNLOADS_DIR, 'games.csv');
const PLAYERS_CSV = path.join(DOWNLOADS_DIR, 'players.csv');
const EVENTS_CSV = path.join(DOWNLOADS_DIR, 'game_events.csv');

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
  console.log('[Pro Merge] Starting Ultimate Transfermarkt Events Sync...');

  // 1. Load Players
  console.log('[Pro Merge] Loading players...');
  const playerMap = {};
  await new Promise((resolve, reject) => {
    fs.createReadStream(PLAYERS_CSV).pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => { if (row.player_id && row.name) playerMap[row.player_id] = row.name; })
      .on('end', resolve).on('error', reject);
  });

  // 2. Load Games
  console.log('[Pro Merge] Loading games...');
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

  // 3. Process Events (Goals, Cards, Subs)
  console.log('[Pro Merge] Processing 1M+ game events (this takes a minute)...');
  const eventsByGameId = {};
  await new Promise((resolve, reject) => {
    fs.createReadStream(EVENTS_CSV).pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        const gameId = row.game_id;
        if (!eventsByGameId[gameId]) eventsByGameId[gameId] = { goals: [], cards: [], subs: [] };
        
        const minute = parseInt(row.minute, 10);
        const player = playerMap[row.player_id] || 'Unknown';
        const club = row.club_name;
        const desc = (row.description || '').toLowerCase();

        if (row.type === 'Goals') {
          eventsByGameId[gameId].goals.push({
            team: club, scorer: player, minute: isNaN(minute) ? null : minute,
            own_goal: desc.includes('own-goal'), penalty: desc.includes('penalty')
          });
        } 
        else if (row.type === 'Cards') {
          let cardType = 'yellow';
          if (desc.includes('red card') || desc.includes('second yellow')) cardType = 'red';
          eventsByGameId[gameId].cards.push({ team: club, player, minute: isNaN(minute) ? null : minute, type: cardType });
        } 
        else if (row.type === 'Substitutions') {
          const subIn = playerMap[row.player_in_id] || 'Unknown';
          eventsByGameId[gameId].subs.push({ team: club, minute: isNaN(minute) ? null : minute, player_out: player, player_in: subIn });
        }
      }).on('end', resolve).on('error', reject);
  });

  // 4. Update matches.json files
  console.log('[Pro Merge] Updating matches.json files...');
  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  let totalUpdated = 0;

  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      let updatedInFile = 0;

      if (parsed && Array.isArray(parsed.matches)) {
        for (const match of parsed.matches) {
          if (match.tm_synced) continue; // Skip if already synced

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

              const tmEvents = eventsByGameId[bestMatch.gameId];
              if (tmEvents) {
                const mapTeam = (tmName) => {
                  if (bestMatch.hg === ftHome && bestMatch.ag === ftAway) {
                    if (tmName === bestMatch.homeTeam) return match.home_team;
                    if (tmName === bestMatch.awayTeam) return match.away_team;
                  } else {
                    if (tmName === bestMatch.homeTeam) return match.away_team;
                    if (tmName === bestMatch.awayTeam) return match.home_team;
                  }
                  return tmName;
                };

                match.goals = tmEvents.goals.map(g => ({ ...g, team: mapTeam(g.team) }));
                match.cards = tmEvents.cards.map(c => ({ ...c, team: mapTeam(c.team) }));
                match.substitutions = tmEvents.subs.map(s => ({ ...s, team: mapTeam(s.team) }));
                match.tm_synced = true; // Mark as synced so we never duplicate
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

  console.log(`\n[Pro Merge] Done! Synced goals, cards, and subs for ${totalUpdated} matches.`);
}

run().catch(err => { console.error('[Pro Merge] Failed:', err); process.exit(1); });