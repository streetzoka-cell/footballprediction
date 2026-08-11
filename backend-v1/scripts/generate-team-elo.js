// backend-v1/scripts/generate-team-elo.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const OUTPUT_DIR = path.join(HISTORY_DIR, 'entities', 'team_elo');

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
  console.log('[Elo] Starting Historical Elo Calculation...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  const allMatches = [];

  // 1. Collect all matches and extract season from path
  console.log('[Elo] Collecting and sorting matches...');
  for (const matchesFile of matchesFiles) {
    try {
      // Extract season from path (e.g., .../2023_2024/matches.json)
      const parts = matchesFile.split(path.sep);
      let season = 'unknown';
      const seasonFolder = parts[parts.length - 2];
      if (seasonFolder.match(/^\d{4}_\d{4}$/)) {
        season = seasonFolder;
      } else if (seasonFolder.match(/^\d{4}$/)) {
        season = seasonFolder;
      }

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
            ftAway: parseInt(ftAway, 10),
            season: season
          });
        }
      }
    } catch (e) {}
  }

  // Sort chronologically
  allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`[Elo] Sorted ${allMatches.length} matches. Calculating ratings...`);

  const teamData = {};

  function getTeam(name) {
    if (!teamData[name]) {
      teamData[name] = {
        current_elo: 1500.0,
        peak_elo: 1500.0,
        lowest_elo: 1500.0,
        seasons: {} // { "2023_2024": { sum: 1500, count: 0 } }
      };
    }
    return teamData[name];
  }

  // Elo Calculation Parameters
  const K = 20.0; // Standard K-Factor
  const HOME_ADVANTAGE = 100.0; // Equivalent to ~64% win rate for equal teams

  for (const m of allMatches) {
    const home = getTeam(m.home_team);
    const away = getTeam(m.away_team);

    const homeElo = home.current_elo + HOME_ADVANTAGE;
    const awayElo = away.current_elo;

    // Expected Scores
    const expHome = 1 / (1 + Math.pow(10, (awayElo - homeElo) / 400));
    const expAway = 1 - expHome;

    // Actual Scores (1 for Win, 0.5 for Draw, 0 for Loss)
    let actHome, actAway;
    if (m.ftHome > m.ftAway) { actHome = 1.0; actAway = 0.0; }
    else if (m.ftHome < m.ftAway) { actHome = 0.0; actAway = 1.0; }
    else { actHome = 0.5; actAway = 0.5; }

    // Goal Difference Multiplier (makes big wins matter more)
    const goalDiff = Math.abs(m.ftHome - m.ftAway);
    let goalMult = 1.0;
    if (goalDiff === 2) goalMult = 1.5;
    else if (goalDiff === 3) goalMult = 1.75;
    else if (goalDiff >= 4) goalMult = 1.75 + ((goalDiff - 3) * 0.5);

    // Update Ratings
    home.current_elo += K * goalMult * (actHome - expHome);
    away.current_elo += K * goalMult * (actAway - expAway);

    // Track Peak / Lowest
    if (home.current_elo > home.peak_elo) home.peak_elo = home.current_elo;
    if (home.current_elo < home.lowest_elo) home.lowest_elo = home.current_elo;
    if (away.current_elo > away.peak_elo) away.peak_elo = away.current_elo;
    if (away.current_elo < away.lowest_elo) away.lowest_elo = away.current_elo;

    // Track Season Averages
    if (!home.seasons[m.season]) home.seasons[m.season] = { sum: 0, count: 0 };
    home.seasons[m.season].sum += home.current_elo;
    home.seasons[m.season].count++;

    if (!away.seasons[m.season]) away.seasons[m.season] = { sum: 0, count: 0 };
    away.seasons[m.season].sum += away.current_elo;
    away.seasons[m.season].count++;
  }

  console.log(`[Elo] Saving ${Object.keys(teamData).length} team Elo files...`);
  let savedCount = 0;

  for (const teamName in teamData) {
    const data = teamData[teamName];
    const seasonAverages = {};

    for (const s in data.seasons) {
      if (data.seasons[s].count > 0) {
        seasonAverages[s] = parseFloat((data.seasons[s].sum / data.seasons[s].count).toFixed(2));
      }
    }

    const payload = {
      id: teamName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      team: teamName,
      current_elo: parseFloat(data.current_elo.toFixed(2)),
      peak_elo: parseFloat(data.peak_elo.toFixed(2)),
      lowest_elo: parseFloat(data.lowest_elo.toFixed(2)),
      seasons: seasonAverages
    };

    const filePath = path.join(OUTPUT_DIR, `${payload.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    savedCount++;
  }

  console.log(`\n[Elo] Done! Saved ${savedCount} team Elo profiles.`);
}

run().catch(err => { console.error('[Elo] Failed:', err); process.exit(1); });