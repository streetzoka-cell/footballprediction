const fs = require('fs');
const path = require('path');

// Update this path to where you downloaded the Kaggle CSVs
const KAGGLE_DATA_DIR = path.join(process.cwd(), 'data', 'kaggle_world_cup');
const OUTPUT_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history', 'world_cup');

// Simple CSV Parser (handles basic commas and quotes)
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else current += char;
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });
}

function generateKnowledge() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Generate tournaments.json
  const wcCsvPath = path.join(KAGGLE_DATA_DIR, 'world_cup.csv');
  let tournaments = [];
  if (fs.existsSync(wcCsvPath)) {
    const wcData = parseCSV(fs.readFileSync(wcCsvPath, 'utf8'));
    tournaments = wcData.map(row => ({
      year: parseInt(row.Year),
      host: row.Host,
      teams: parseInt(row.Teams),
      champion: row.Champion,
      runner_up: row['Runner-Up'],
      top_scorer: row.TopScorrer.split(' - ')[0].trim(),
      top_scorer_goals: parseInt(row.TopScorrer.split(' - ')[1] || 0),
      attendance: parseInt(row.Attendance),
      matches: parseInt(row.Matches)
    })).sort((a, b) => b.year - a.year);

    fs.writeFileSync(path.join(OUTPUT_DIR, 'tournaments.json'), JSON.stringify({
      id: "world_cup_tournaments",
      name: "FIFA World Cup Tournaments",
      aliases: ["world cup history", "world cup tournaments", "world cup years"],
      category: "history",
      intents: ["definition", "winners", "hosts", "top_scorers", "teams", "attendance"],
      tournaments
    }, null, 2));
    console.log(`✅ Generated tournaments.json with ${tournaments.length} tournaments.`);
  } else {
    console.warn('⚠️ world_cup.csv not found. Skipping tournaments.json.');
  }

  // 2. Generate finals.json and matches.json
  const matchesCsvPath = path.join(KAGGLE_DATA_DIR, 'matches_1930_2022.csv');
  let finals = [];
  let matches = [];
  
  if (fs.existsSync(matchesCsvPath)) {
    const matchesData = parseCSV(fs.readFileSync(matchesCsvPath, 'utf8'));
    
    matchesData.forEach(row => {
      const matchObj = {
        year: parseInt(row.Year),
        round: row.Round,
        home_team: row.home_team,
        away_team: row.away_team,
        home_score: parseInt(row.home_score),
        away_score: parseInt(row.away_score),
        venue: row.Venue,
        host: row.Host
      };
      
      if (row.home_penalty || row.away_penalty) {
        matchObj.shootout = `${row.home_team} ${row.home_penalty} - ${row.away_penalty} ${row.away_team}`;
      }
      
      matches.push(matchObj);

      if (row.Round === 'Final') {
        finals.push({
          year: parseInt(row.Year),
          winner: row.home_score > row.away_score ? row.home_team : row.away_team,
          runner_up: row.home_score > row.away_score ? row.away_team : row.home_team,
          score: `${row.home_score} - ${row.away_score}`,
          venue: row.Venue,
          shootout: matchObj.shootout || null
        });
      }
    });

    fs.writeFileSync(path.join(OUTPUT_DIR, 'finals.json'), JSON.stringify({
      id: "world_cup_finals",
      name: "FIFA World Cup Finals",
      aliases: ["world cup final", "world cup final score", "final match"],
      category: "history",
      intents: ["definition", "winners", "hosts"],
      finals: finals.sort((a, b) => b.year - a.year)
    }, null, 2));
    console.log(`✅ Generated finals.json with ${finals.length} finals.`);

    fs.writeFileSync(path.join(OUTPUT_DIR, 'matches.json'), JSON.stringify({
      id: "world_cup_matches",
      name: "FIFA World Cup Matches",
      aliases: ["world cup matches", "world cup games", "head to head", "h2h"],
      category: "history",
      intents: ["definition"],
      matches: matches.sort((a, b) => b.year - a.year)
    }, null, 2));
    console.log(`✅ Generated matches.json with ${matches.length} matches.`);
  } else {
    console.warn('⚠️ matches_1930_2022.csv not found. Skipping finals.json and matches.json.');
  }

  // 3. Generate records.json (Calculated from tournaments)
  if (tournaments.length > 0) {
    const titleCounts = {};
    tournaments.forEach(t => {
      titleCounts[t.champion] = (titleCounts[t.champion] || 0) + 1;
    });
    const mostTitlesTeam = Object.keys(titleCounts).reduce((a, b) => titleCounts[a] > titleCounts[b] ? a : b);

    const records = {
      id: "world_cup_records",
      name: "FIFA World Cup Records",
      aliases: ["world cup records", "world cup most", "world cup best"],
      category: "history",
      intents: ["definition"],
      records: {
        most_titles: {
          team: mostTitlesTeam,
          count: titleCounts[mostTitlesTeam],
          years: tournaments.filter(t => t.champion === mostTitlesTeam).map(t => t.year)
        },
        most_appearances: {
          team: "Brazil",
          count: 22,
          note: "Only team to appear in all 22 tournaments"
        }
      }
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'records.json'), JSON.stringify(records, null, 2));
    console.log('✅ Generated records.json.');
  }

  // 4. Generate format.json (Curated)
  const format = {
    id: "world_cup_format",
    name: "FIFA World Cup Format",
    aliases: ["world cup format", "how the world cup works", "world cup structure"],
    category: "history",
    intents: ["definition", "how_it_works"],
    definition: "The FIFA World Cup format has evolved over time. The current format features 32 teams (expanding to 48 in 2026) competing over a month in the host nation(s). It consists of a group stage followed by a knockout bracket.",
    history: [
      { era: "1930-1978", format: "16 teams (mostly), single group stage followed by knockout rounds." },
      { era: "1982-1994", format: "24 teams, expanded to include a Round of 16." },
      { era: "1998-2022", format: "32 teams, 8 groups of 4, top 2 advance to Round of 16." },
      { era: "2026 onwards", format: "48 teams, 12 groups of 4, top 2 plus 8 best third-place teams advance to Round of 32." }
    ]
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'format.json'), JSON.stringify(format, null, 2));
  console.log('✅ Generated format.json.');
}

generateKnowledge();
console.log('\n🎉 World Cup knowledge generation complete!');