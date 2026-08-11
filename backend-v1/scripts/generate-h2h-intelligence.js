// backend-v1/scripts/generate-h2h-intelligence.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const OUTPUT_DIR = path.join(HISTORY_DIR, 'entities', 'h2h');

const slugify = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

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
  console.log('[H2H] Starting Head-to-Head Intelligence Generation...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  const h2hMap = {};

  console.log(`[H2H] Scanning ${matchesFiles.length} match files...`);

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
        const date = match.date;

        if (!homeTeam || !awayTeam || ftHome === null || ftAway === null || !date) continue;

        const homeSlug = slugify(homeTeam);
        const awaySlug = slugify(awayTeam);
        
        // Consistent key: alphabetically sorted team slugs
        const teams = [homeSlug, awaySlug].sort();
        const h2hKey = `${teams[0]}_${teams[1]}`;

        if (!h2hMap[h2hKey]) {
          h2hMap[h2hKey] = {
            teamA: teams[0], // Alphabetically first
            teamB: teams[1],
            meetings: 0,
            teamA_wins: 0,
            teamB_wins: 0,
            draws: 0,
            teamA_goals: 0,
            teamB_goals: 0,
            teamA_clean_sheets: 0,
            teamB_clean_sheets: 0,
            btts: 0,
            over_1_5: 0,
            over_2_5: 0,
            over_3_5: 0,
            biggest_teamA_win: { margin: 0, score: null, date: null },
            biggest_teamB_win: { margin: 0, score: null, date: null },
            matches: [] // Store all matches to slice for last_5, 10, 20
          };
        }

        const h2h = h2hMap[h2hKey];
        h2h.meetings++;
        
        // Determine which team is Home/Away in this specific match
        const isAHome = homeSlug === h2h.teamA;
        const teamAScore = isAHome ? ftHome : ftAway;
        const teamBScore = isAHome ? ftAway : ftHome;

        h2h.teamA_goals += teamAScore;
        h2h.teamB_goals += teamBScore;

        if (teamAScore > teamBScore) {
          h2h.teamA_wins++;
          const margin = teamAScore - teamBScore;
          if (margin > h2h.biggest_teamA_win.margin) {
            h2h.biggest_teamA_win = { margin, score: `${teamAScore}-${teamBScore}`, date };
          }
        } else if (teamBScore > teamAScore) {
          h2h.teamB_wins++;
          const margin = teamBScore - teamAScore;
          if (margin > h2h.biggest_teamB_win.margin) {
            h2h.biggest_teamB_win = { margin, score: `${teamBScore}-${teamAScore}`, date };
          }
        } else {
          h2h.draws++;
        }

        if (teamBScore === 0) h2h.teamA_clean_sheets++;
        if (teamAScore === 0) h2h.teamB_clean_sheets++;

        const totalGoals = teamAScore + teamBScore;
        if (teamAScore > 0 && teamBScore > 0) h2h.btts++;
        if (totalGoals > 1) h2h.over_1_5++;
        if (totalGoals > 2) h2h.over_2_5++;
        if (totalGoals > 3) h2h.over_3_5++;

        h2h.matches.push({
          date,
          teamA: h2h.teamA,
          teamB: h2h.teamB,
          teamA_score: teamAScore,
          teamB_score: teamBScore,
          teamA_home: isAHome
        });

      }
    } catch (e) {}
  }

  console.log(`[H2H] Saving ${Object.keys(h2hMap).length} H2H intelligence files...`);
  let savedCount = 0;

  for (const key in h2hMap) {
    const h2h = h2hMap[key];
    
    // Sort matches by date ascending, then slice for Last 5, 10, 20
    h2h.matches.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const last5 = h2h.matches.slice(-5).reverse();
    const last10 = h2h.matches.slice(-10).reverse();
    const last20 = h2h.matches.slice(-20).reverse();

    // Calculate percentages
    const pct = (val) => h2h.meetings > 0 ? parseFloat(((val / h2h.meetings) * 100).toFixed(1)) : 0;

    const payload = {
      id: key,
      teamA: h2h.teamA,
      teamB: h2h.teamB,
      meetings: h2h.meetings,
      teamA_wins: h2h.teamA_wins,
      teamB_wins: h2h.teamB_wins,
      draws: h2h.draws,
      teamA_goals: h2h.teamA_goals,
      teamB_goals: h2h.teamB_goals,
      teamA_clean_sheets: h2h.teamA_clean_sheets,
      teamB_clean_sheets: h2h.teamB_clean_sheets,
      btts_pct: pct(h2h.btts),
      over_1_5_pct: pct(h2h.over_1_5),
      over_2_5_pct: pct(h2h.over_2_5),
      over_3_5_pct: pct(h2h.over_3_5),
      biggest_teamA_win: h2h.biggest_teamA_win,
      biggest_teamB_win: h2h.biggest_teamB_win,
      last_5: last5,
      last_10: last10,
      last_20: last20
    };

    const filePath = path.join(OUTPUT_DIR, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    savedCount++;
  }

  console.log(`\n[H2H] Done! Saved ${savedCount} H2H intelligence files to /entities/h2h/`);
}

run().catch(err => { console.error('[H2H] Failed:', err); process.exit(1); });