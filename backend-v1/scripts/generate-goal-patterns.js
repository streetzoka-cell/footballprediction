// backend-v1/scripts/generate-goal-patterns.js
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
  console.log('[Patterns] Starting Goal Pattern Generation...');
  
  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  const teamPatterns = {};

  function initStats() {
    return {
      total_goals: 0,
      over_1_5: 0,
      over_2_5: 0,
      over_3_5: 0,
      btts: 0,
      scoreless: 0, // Changed from oot_0_0
      played: 0
    };
  }

  function getTeam(name) {
    if (!teamPatterns[name]) {
      teamPatterns[name] = {
        overall: initStats(),
        home: initStats(),
        away: initStats()
      };
    }
    return teamPatterns[name];
  }

  console.log(`[Patterns] Scanning ${matchesFiles.length} match files...`);

  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.matches)) continue;

      for (const match of parsed.matches) {
        const ftHome = match.score?.ft?.home;
        const ftAway = match.score?.ft?.away;
        const homeTeam = match.home_team;
        const awayTeam = match.away_team;

        if (ftHome !== null && ftAway !== null && !isNaN(ftHome) && !isNaN(ftAway) && homeTeam && awayTeam) {
          const home = getTeam(homeTeam);
          const away = getTeam(awayTeam);

          const totalGoals = parseInt(ftHome, 10) + parseInt(ftAway, 10);
          const btts = parseInt(ftHome, 10) > 0 && parseInt(ftAway, 10) > 0;

          const update = (stat) => {
            stat.played++;
            stat.total_goals += totalGoals;
            if (totalGoals > 1) stat.over_1_5++;
            if (totalGoals > 2) stat.over_2_5++;
            if (totalGoals > 3) stat.over_3_5++;
            if (btts) stat.btts++;
            if (totalGoals === 0) stat.scoreless++;
          };

          update(home.overall);
          update(away.overall);
          update(home.home);
          update(away.away);
        }
      }
    } catch (e) {}
  }

  console.log(`[Patterns] Updating ${Object.keys(teamPatterns).length} team intelligence files...`);
  let updatedCount = 0;

  for (const teamName in teamPatterns) {
    const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filePath = path.join(INTEL_DIR, `${slug}.json`);

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const teamIntel = JSON.parse(raw);

        const calcPct = (stat) => stat.played > 0 ? {
          avg_goals: parseFloat((stat.total_goals / stat.played).toFixed(2)),
          over_1_5_pct: parseFloat(((stat.over_1_5 / stat.played) * 100).toFixed(1)),
          over_2_5_pct: parseFloat(((stat.over_2_5 / stat.played) * 100).toFixed(1)),
          over_3_5_pct: parseFloat(((stat.over_3_5 / stat.played) * 100).toFixed(1)),
          btts_pct: parseFloat(((stat.btts / stat.played) * 100).toFixed(1)),
          scoreless_pct: parseFloat(((stat.scoreless / stat.played) * 100).toFixed(1)) // Fixed key name
        } : {};

        teamIntel.goal_patterns = {
          overall: calcPct(teamPatterns[teamName].overall),
          home: calcPct(teamPatterns[teamName].home),
          away: calcPct(teamPatterns[teamName].away)
        };

        fs.writeFileSync(filePath, JSON.stringify(teamIntel, null, 2));
        updatedCount++;
      } catch (e) {}
    }
  }

  console.log(`\n[Patterns] Done! Updated ${updatedCount} team files with goal patterns.`);
}

run().catch(err => { console.error('[Patterns] Failed:', err); process.exit(1); });