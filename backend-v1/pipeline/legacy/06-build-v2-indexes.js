'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const V2_HISTORY_DIR = path.join(
  ROOT,
  'public_data_v2',
  'knowledge',
  'football',
  'history'
);

const V2_INDEX_DIR = path.join(
  ROOT,
  'public_data_v2',
  'knowledge',
  'football',
  'indexes'
);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeName(value) {
  if (!value) return '';

  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;

  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (file.endsWith('.json')) {
      callback(fullPath);
    }
  }
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

async function buildIndexes() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 6: BUILD V2 INDEXES');
  console.log('============================================================\n');

  ensureDir(V2_INDEX_DIR);

  // ==========================================================
  // INDEX STRUCTURES
  // ==========================================================

  const teamMatchIndex = new Map();
  const h2hIndex = new Map();
  const scorerIndex = new Map();

  const matchIndex = {};
  const competitionIndex = {};
  const seasonIndex = {};
  const teamStats = {};

  let filesProcessed = 0;
  let matchesProcessed = 0;
  let goalsProcessed = 0;
  let invalidMatches = 0;

  console.log('🔍 Scanning V2 match files...');

  walkDir(V2_HISTORY_DIR, (filePath) => {
    try {
      const data = JSON.parse(
        fs.readFileSync(filePath, 'utf8')
      );

      if (!data || !Array.isArray(data.matches)) {
        return;
      }

      for (const match of data.matches) {
        matchesProcessed++;

        const {
          match_id,
          date,
          competition,
          competition_id,
          season,
          home_team,
          home_team_id,
          away_team,
          away_team_id,
          home_score,
          away_score,
          round
        } = match;

        if (
          !match_id ||
          !home_team_id ||
          !away_team_id
        ) {
          invalidMatches++;
          continue;
        }

        // ======================================================
        // 1. TEAM MATCH INDEX
        // ======================================================

        if (!teamMatchIndex.has(home_team_id)) {
          teamMatchIndex.set(home_team_id, []);
        }

        teamMatchIndex.get(home_team_id).push(match_id);

        if (!teamMatchIndex.has(away_team_id)) {
          teamMatchIndex.set(away_team_id, []);
        }

        teamMatchIndex.get(away_team_id).push(match_id);

        // ======================================================
        // 2. H2H INDEX
        // ======================================================

        const sortedIds = [
          home_team_id,
          away_team_id
        ].sort();

        const h2hKey =
          `${sortedIds[0]}_vs_${sortedIds[1]}`;

        if (!h2hIndex.has(h2hKey)) {
          h2hIndex.set(h2hKey, []);
        }

        h2hIndex.get(h2hKey).push(match_id);

        // ======================================================
        // 3. DIRECT MATCH INDEX
        // ======================================================

        matchIndex[match_id] = {
          match_id,
          date: date || null,
          competition: competition || null,
          competition_id: competition_id || null,
          season: season || null,

          home_team: home_team || null,
          home_team_id,

          away_team: away_team || null,
          away_team_id,

          home_score,
          away_score,

          round: round || null,

          source: match.source || null,

          file: path.relative(
            ROOT,
            filePath
          ).replace(/\\/g, '/')
        };

        // ======================================================
        // 4. COMPETITION INDEX
        // ======================================================

        const competitionKey =
          competition_id ||
          normalizeName(competition || 'unknown');

        if (!competitionIndex[competitionKey]) {
          competitionIndex[competitionKey] = {
            competition_id: competition_id || null,
            name: competition || 'Unknown',
            matches: []
          };
        }

        competitionIndex[competitionKey].matches.push(
          match_id
        );

        // ======================================================
        // 5. SEASON INDEX
        // ======================================================

        const seasonKey = season || 'unknown';

        if (!seasonIndex[seasonKey]) {
          seasonIndex[seasonKey] = [];
        }

        seasonIndex[seasonKey].push(match_id);

        // ======================================================
        // 6. TEAM STATISTICS
        // ======================================================

        if (!teamStats[home_team_id]) {
          teamStats[home_team_id] = {
            team_id: home_team_id,
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            home_matches: 0,
            home_wins: 0,
            home_draws: 0,
            home_losses: 0,
            away_matches: 0,
            away_wins: 0,
            away_draws: 0,
            away_losses: 0,
            goals_for: 0,
            goals_against: 0,
            home_goals_for: 0,
            home_goals_against: 0,
            away_goals_for: 0,
            away_goals_against: 0,
            clean_sheets: 0
          };
        }

        if (!teamStats[away_team_id]) {
          teamStats[away_team_id] = {
            team_id: away_team_id,
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            home_matches: 0,
            home_wins: 0,
            home_draws: 0,
            home_losses: 0,
            away_matches: 0,
            away_wins: 0,
            away_draws: 0,
            away_losses: 0,
            goals_for: 0,
            goals_against: 0,
            home_goals_for: 0,
            home_goals_against: 0,
            away_goals_for: 0,
            away_goals_against: 0,
            clean_sheets: 0
          };
        }

        const homeStats = teamStats[home_team_id];
        const awayStats = teamStats[away_team_id];

        const hs = Number(home_score);
        const as = Number(away_score);

        if (
          Number.isFinite(hs) &&
          Number.isFinite(as)
        ) {
          // Home
          homeStats.matches++;
          homeStats.home_matches++;

          homeStats.goals_for += hs;
          homeStats.goals_against += as;

          homeStats.home_goals_for += hs;
          homeStats.home_goals_against += as;

          // Away
          awayStats.matches++;
          awayStats.away_matches++;

          awayStats.goals_for += as;
          awayStats.goals_against += hs;

          awayStats.away_goals_for += as;
          awayStats.away_goals_against += hs;

          if (as === 0) {
            homeStats.clean_sheets++;
          }

          if (hs === as) {
            homeStats.draws++;
            homeStats.home_draws++;

            awayStats.draws++;
            awayStats.away_draws++;
          } else if (hs > as) {
            homeStats.wins++;
            homeStats.home_wins++;

            awayStats.losses++;
            awayStats.away_losses++;
          } else {
            homeStats.losses++;
            homeStats.home_losses++;

            awayStats.wins++;
            awayStats.away_wins++;
          }
        }

        // ======================================================
        // 7. SCORER INDEX
        // ======================================================

        if (Array.isArray(match.goals)) {
          for (const goal of match.goals) {
            if (!goal || !goal.scorer) continue;

            goalsProcessed++;

            const originalName =
              String(goal.scorer).trim();

            const scorerKey =
              normalizeName(originalName);

            if (!scorerKey) continue;

            if (!scorerIndex.has(scorerKey)) {
              scorerIndex.set(scorerKey, {
                name: originalName,
                goals: []
              });
            }

            scorerIndex.get(scorerKey).goals.push({
              match_id,
              date: date || null,
              team: goal.team || null,
              minute: goal.minute ?? null,
              own_goal: !!goal.own_goal,
              penalty: !!goal.penalty
            });
          }
        }
      }

      filesProcessed++;

    } catch (error) {
      console.warn(
        `⚠️ Failed to parse ${filePath}: ${error.message}`
      );
    }
  });

  console.log(
    `   ↳ Processed ${filesProcessed.toLocaleString()} files`
  );

  console.log(
    `   ↳ Processed ${matchesProcessed.toLocaleString()} matches`
  );

  console.log(
    `   ↳ Processed ${goalsProcessed.toLocaleString()} goals`
  );

  console.log(
    `   ↳ Invalid matches skipped: ${invalidMatches.toLocaleString()}\n`
  );

  // ==========================================================
  // FINALIZE MAPS
  // ==========================================================

  console.log('⚙️ Finalizing indexes...');

  const teamMatchObj = {};

  for (const [id, matches] of teamMatchIndex.entries()) {
    teamMatchObj[id] = matches;
  }

  const h2hObj = {};

  for (const [key, matches] of h2hIndex.entries()) {
    h2hObj[key] = matches;
  }

  const scorerObj = {};

  for (const [key, value] of scorerIndex.entries()) {
    scorerObj[key] = value;
  }

  // ==========================================================
  // WRITE
  // ==========================================================

  const teamPath =
    path.join(V2_INDEX_DIR, 'team_match_index.json');

  fs.writeFileSync(
    teamPath,
    JSON.stringify(teamMatchObj),
    'utf8'
  );

  console.log(
    `✅ Team Match Index written (${teamMatchIndex.size} teams)`
  );

  const h2hPath =
    path.join(V2_INDEX_DIR, 'h2h_index.json');

  fs.writeFileSync(
    h2hPath,
    JSON.stringify(h2hObj),
    'utf8'
  );

  console.log(
    `✅ H2H Index written (${h2hIndex.size} unique matchups)`
  );

  const scorerPath =
    path.join(V2_INDEX_DIR, 'scorer_index.json');

  fs.writeFileSync(
    scorerPath,
    JSON.stringify(scorerObj),
    'utf8'
  );

  console.log(
    `✅ Scorer Index written (${scorerIndex.size} unique scorers)`
  );

  const matchPath =
    path.join(V2_INDEX_DIR, 'match_index.json');

  fs.writeFileSync(
    matchPath,
    JSON.stringify(matchIndex),
    'utf8'
  );

  console.log(
    `✅ Match Index written (${Object.keys(matchIndex).length} matches)`
  );

  const competitionPath =
    path.join(V2_INDEX_DIR, 'competition_index.json');

  fs.writeFileSync(
    competitionPath,
    JSON.stringify(competitionIndex),
    'utf8'
  );

  console.log(
    `✅ Competition Index written (${Object.keys(competitionIndex).length} competitions)`
  );

  const seasonPath =
    path.join(V2_INDEX_DIR, 'season_index.json');

  fs.writeFileSync(
    seasonPath,
    JSON.stringify(seasonIndex),
    'utf8'
  );

  console.log(
    `✅ Season Index written (${Object.keys(seasonIndex).length} seasons)`
  );

  const statsPath =
    path.join(V2_INDEX_DIR, 'team_stats.json');

  fs.writeFileSync(
    statsPath,
    JSON.stringify(teamStats),
    'utf8'
  );

  console.log(
    `✅ Team Stats written (${Object.keys(teamStats).length} teams)`
  );

  // ==========================================================
  // AUDIT
  // ==========================================================

  const audit = {
    files_processed: filesProcessed,
    matches_processed: matchesProcessed,
    goals_processed: goalsProcessed,
    invalid_matches: invalidMatches,

    teams_indexed: teamMatchIndex.size,
    h2h_matchups: h2hIndex.size,
    unique_scorers: scorerIndex.size,

    matches_indexed: Object.keys(matchIndex).length,
    competitions_indexed: Object.keys(competitionIndex).length,
    seasons_indexed: Object.keys(seasonIndex).length,
    teams_stats_indexed: Object.keys(teamStats).length,

    generated_at: new Date().toISOString()
  };

  const auditPath =
    path.join(V2_INDEX_DIR, 'index_build_report.json');

  fs.writeFileSync(
    auditPath,
    JSON.stringify(audit, null, 2),
    'utf8'
  );

  console.log('\n============================================================');
  console.log(' STEP 6 COMPLETE');
  console.log('============================================================');

  console.log(
    `📁 Index Directory: ${V2_INDEX_DIR}`
  );

  console.log(
    `📊 Match indexes: ${Object.keys(matchIndex).length.toLocaleString()}`
  );

  console.log(
    `📊 Team indexes: ${teamMatchIndex.size.toLocaleString()}`
  );

  console.log(
    `📊 H2H indexes: ${h2hIndex.size.toLocaleString()}`
  );

  console.log(
    `📊 Scorer indexes: ${scorerIndex.size.toLocaleString()}`
  );

  console.log(
    `📊 Competition indexes: ${Object.keys(competitionIndex).length.toLocaleString()}`
  );

  console.log(
    `📊 Season indexes: ${Object.keys(seasonIndex).length.toLocaleString()}`
  );

  console.log(
    `📊 Team statistics: ${Object.keys(teamStats).length.toLocaleString()}`
  );

  console.log('\n🔒 V2 MATCH DATA WAS NOT MODIFIED.');
}

buildIndexes().catch(error => {
  console.error('❌ Indexing Failed:', error);
  process.exit(1);
});