// backend-v1/scripts/generate-club-profiles.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const OUTPUT_DIR = path.join(HISTORY_DIR, 'entities', 'clubs');

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
  console.log('[Clubs] Starting Club Aggregation...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  const clubsMap = {};

  console.log(`[Clubs] Scanning ${matchesFiles.length} match files...`);

  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.matches)) continue;

      // Extract competition info from the file path or payload
      const compParts = matchesFile.split(path.sep);
      const seasonFolder = compParts[compParts.length - 2];
      const compFolder = compParts[compParts.length - 3];
      const countryFolder = compParts[compParts.length - 4];

      const competitionName = `${countryFolder} ${compFolder}`.replace(/_/g, ' ');

      for (const match of parsed.matches) {
        const homeTeam = match.home_team;
        const awayTeam = match.away_team;
        if (!homeTeam || !awayTeam) continue;

        // Initialize Home Team
        if (!clubsMap[homeTeam]) {
          clubsMap[homeTeam] = {
            name: homeTeam,
            history: { played: 0, win: 0, draw: 0, loss: 0, goals_for: 0, goals_against: 0 },
            seasons: new Set(),
            competitions: new Set()
          };
        }
        
        // Initialize Away Team
        if (!clubsMap[awayTeam]) {
          clubsMap[awayTeam] = {
            name: awayTeam,
            history: { played: 0, win: 0, draw: 0, loss: 0, goals_for: 0, goals_against: 0 },
            seasons: new Set(),
            competitions: new Set()
          };
        }

        const ftHome = match.score?.ft?.home;
        const ftAway = match.score?.ft?.away;
        if (ftHome === null || ftAway === null || isNaN(ftHome) || isNaN(ftAway)) continue;

        // Update Home Stats
        clubsMap[homeTeam].history.played++;
        clubsMap[homeTeam].history.goals_for += ftHome;
        clubsMap[homeTeam].history.goals_against += ftAway;
        clubsMap[homeTeam].seasons.add(seasonFolder);
        clubsMap[homeTeam].competitions.add(competitionName);

        // Update Away Stats
        clubsMap[awayTeam].history.played++;
        clubsMap[awayTeam].history.goals_for += ftAway;
        clubsMap[awayTeam].history.goals_against += ftHome;
        clubsMap[awayTeam].seasons.add(seasonFolder);
        clubsMap[awayTeam].competitions.add(competitionName);

        // Wins/Draws/Losses
        if (ftHome > ftAway) {
          clubsMap[homeTeam].history.win++;
          clubsMap[awayTeam].history.loss++;
        } else if (ftHome < ftAway) {
          clubsMap[homeTeam].history.loss++;
          clubsMap[awayTeam].history.win++;
        } else {
          clubsMap[homeTeam].history.draw++;
          clubsMap[awayTeam].history.draw++;
        }
      }
    } catch (e) {}
  }

  console.log(`[Clubs] Saving ${Object.keys(clubsMap).length} club profiles...`);
  let savedCount = 0;

  for (const clubName in clubsMap) {
    const club = clubsMap[clubName];
    const payload = {
      id: clubName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name: club.name,
      history: club.history,
      seasons: Array.from(club.seasons).sort(),
      competitions: Array.from(club.competitions)
    };

    const filePath = path.join(OUTPUT_DIR, `${payload.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    savedCount++;
  }

  console.log(`\n[Clubs] Done! Saved ${savedCount} club profiles to /entities/clubs/`);
}

run().catch(err => { console.error('[Clubs] Failed:', err); process.exit(1); });