'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

const V2_HISTORY_DIR = path.join(
  ROOT,
  'public_data',
  'knowledge',
  'football',
  'history'
);

const V2_STATS_DIR = path.join(
  ROOT,
  'public_data',
  'stats'
);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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

/**
 * Normalize a player name for identity matching.
 */
function normalizePlayerName(value) {
  if (!value) return '';

  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Generate a deterministic, Windows-safe player ID.
 *
 * The actual player name remains inside the JSON.
 */
function makePlayerId(playerName) {
  const normalized = normalizePlayerName(playerName);

  return crypto
    .createHash('sha1')
    .update(normalized, 'utf8')
    .digest('hex')
    .substring(0, 16);
}

/**
 * Safe filename fallback.
 */
function safeFilename(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim() || 'unknown';
}

async function buildIntelligence() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 7: BUILD FOOTBALL INTELLIGENCE');
  console.log('============================================================\n');

  const teamsDir = path.join(V2_STATS_DIR, 'teams');
  const h2hDir = path.join(V2_STATS_DIR, 'h2h');
  const playersDir = path.join(V2_STATS_DIR, 'players');

  ensureDir(teamsDir);
  ensureDir(h2hDir);
  ensureDir(playersDir);

  // === CANONICAL ENTITY RESOLUTION ===
  const ENTITY_DIR = path.join(ROOT, 'data_audit', 'entity_resolution');
  const aliasMap = JSON.parse(fs.readFileSync(path.join(ENTITY_DIR, 'team_alias_map.json'), 'utf8'));
  const canonicalTeams = JSON.parse(fs.readFileSync(path.join(ENTITY_DIR, 'canonical_teams.json'), 'utf8'));
  const historicalToCanonicalMap = new Map();

  if (Array.isArray(canonicalTeams)) {
    for (const team of canonicalTeams) {
      if (team && team.canonical_id) historicalToCanonicalMap.set(String(team.canonical_id), String(team.canonical_id));
    }
  }
  if (aliasMap && typeof aliasMap === 'object') {
    for (const [historicalId, canonicalId] of Object.entries(aliasMap)) {
      historicalToCanonicalMap.set(String(historicalId), String(canonicalId));
    }
  }
  const processedMatchIds = new Set(); // Dedupe tracker

  // ==========================================================
  // 1. LOAD MATCH BACKBONE
  // ==========================================================

  console.log('🔍 Loading V2 match backbone into memory...');

  const allMatches = [];

  walkDir(V2_HISTORY_DIR, (filePath) => {
    try {
      const data = JSON.parse(
        fs.readFileSync(filePath, 'utf8')
      );

      if (Array.isArray(data.matches)) {
        allMatches.push(...data.matches);
      }
    } catch (e) {
      console.warn(
        `⚠️ Failed to read ${filePath}: ${e.message}`
      );
    }
  });

  console.log(
    `   ↳ ${allMatches.length.toLocaleString()} matches loaded.\n`
  );

  // ==========================================================
  // 2. AGGREGATION
  // ==========================================================

  console.log(
    '⚙️ Aggregating Team, H2H, and Player data...'
  );

  const teamData = {};
  const h2hData = {};
  const playerData = {};

  for (const match of allMatches) {

    const {
      match_id,
      date,
      home_score,
      away_score
    } = match;

    // 1. SKIP DUPLICATES
    if (processedMatchIds.has(String(match_id))) continue;
    processedMatchIds.add(String(match_id));

    // 2. RESOLVE TO CANONICAL IDs
    const rawHomeId = String(match.home_team_id);
    const rawAwayId = String(match.away_team_id);
    const home_team_id = historicalToCanonicalMap.get(rawHomeId) || rawHomeId;
    const away_team_id = historicalToCanonicalMap.get(rawAwayId) || rawAwayId;

    const hs = parseInt(home_score, 10);
    const as = parseInt(away_score, 10);

    if (
      !home_team_id ||
      !away_team_id ||
      Number.isNaN(hs) ||
      Number.isNaN(as)
    ) {
      continue;
    }

    // ========================================================
    // TEAM AGGREGATION
    // ========================================================

    if (!teamData[home_team_id]) {
      teamData[home_team_id] = {
        matches: []
      };
    }

    if (!teamData[away_team_id]) {
      teamData[away_team_id] = {
        matches: []
      };
    }

    teamData[home_team_id].matches.push({
      match_id,
      date,
      opponent_id: away_team_id,
      gf: hs,
      ga: as,
      venue: 'H'
    });

    teamData[away_team_id].matches.push({
      match_id,
      date,
      opponent_id: home_team_id,
      gf: as,
      ga: hs,
      venue: 'A'
    });

    // ========================================================
    // H2H AGGREGATION
    // ========================================================

    const teamIds = [
      home_team_id,
      away_team_id
    ].sort();

    const teamAId = teamIds[0];
    const teamBId = teamIds[1];

    const h2hKey =
      `${teamAId}_vs_${teamBId}`;

    if (!h2hData[h2hKey]) {
      h2hData[h2hKey] = {
        team_a_id: teamAId,
        team_b_id: teamBId,
        matches: [],
        team_a_wins: 0,
        team_b_wins: 0,
        draws: 0,
        team_a_goals: 0,
        team_b_goals: 0
      };
    }

    const h2h = h2hData[h2hKey];

    h2h.matches.push({
      match_id,
      date,
      home_team_id,
      away_team_id,
      home_score: hs,
      away_score: as
    });

    if (hs > as) {
      if (home_team_id === teamAId) {
        h2h.team_a_wins++;
      } else {
        h2h.team_b_wins++;
      }
    } else if (as > hs) {
      if (away_team_id === teamAId) {
        h2h.team_a_wins++;
      } else {
        h2h.team_b_wins++;
      }
    } else {
      h2h.draws++;
    }

    if (home_team_id === teamAId) {
      h2h.team_a_goals += hs;
      h2h.team_b_goals += as;
    } else {
      h2h.team_a_goals += as;
      h2h.team_b_goals += hs;
    }

    // ========================================================
    // PLAYER AGGREGATION
    // ========================================================

    if (Array.isArray(match.goals)) {

      for (const goal of match.goals) {

        if (!goal.scorer) continue;

        const originalName = goal.scorer.trim();

        if (!originalName) continue;

        const normalizedName =
          normalizePlayerName(originalName);

        if (!normalizedName) continue;

        if (!playerData[normalizedName]) {

          playerData[normalizedName] = {
            player_id: makePlayerId(originalName),
            name: originalName,
            goals: 0,
            penalties: 0,
            own_goals: 0,
            matches_scored_in: new Set(),
            teams: new Set()
          };
        }

        const player = playerData[normalizedName];

        if (!goal.own_goal) {

          player.goals++;

          if (goal.penalty) {
            player.penalties++;
          }

        } else {

          player.own_goals++;
        }

        player.matches_scored_in.add(match_id);

        if (goal.team) {
          player.teams.add(
            normalizePlayerName(goal.team)
          );
        }
      }
    }
  }

  // ==========================================================
  // 3. TEAM PROFILES
  // ==========================================================

  console.log('\n📁 Writing Rich Team Profiles...');

  let teamCount = 0;

  for (const [teamId, data] of Object.entries(teamData)) {

    data.matches.sort(
      (a, b) =>
        new Date(a.date) - new Date(b.date)
    );

    const stats = {
      total: {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        clean_sheets: 0,
        failed_to_score: 0
      },

      home: {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        clean_sheets: 0,
        failed_to_score: 0
      },

      away: {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        clean_sheets: 0,
        failed_to_score: 0
      },

      markets: {
        btts: 0,
        over_1_5: 0,
        over_2_5: 0
      }
    };

    for (const m of data.matches) {

      const venueKey =
        m.venue === 'H'
          ? 'home'
          : 'away';

      stats.total.matches++;
      stats[venueKey].matches++;

      stats.total.goals_for += m.gf;
      stats.total.goals_against += m.ga;

      stats[venueKey].goals_for += m.gf;
      stats[venueKey].goals_against += m.ga;

      if (m.gf > m.ga) {
        stats.total.wins++;
        stats[venueKey].wins++;
      } else if (m.gf < m.ga) {
        stats.total.losses++;
        stats[venueKey].losses++;
      } else {
        stats.total.draws++;
        stats[venueKey].draws++;
      }

      if (m.ga === 0) {
        stats.total.clean_sheets++;
        stats[venueKey].clean_sheets++;
      }

      if (m.gf === 0) {
        stats.total.failed_to_score++;
        stats[venueKey].failed_to_score++;
      }

      const totalGoals =
        m.gf + m.ga;

      if (m.gf > 0 && m.ga > 0) {
        stats.markets.btts++;
      }

      if (totalGoals > 1) {
        stats.markets.over_1_5++;
      }

      if (totalGoals > 2) {
        stats.markets.over_2_5++;
      }
    }

    const recent5 =
      data.matches
        .slice(-5)
        .reverse();

    const formSequence =
      recent5
        .map(m =>
          m.gf > m.ga
            ? 'W'
            : m.gf === m.ga
              ? 'D'
              : 'L'
        )
        .join('-');

    const profile = {
      team_id: teamId,

      total_matches:
        stats.total.matches,

      wins:
        stats.total.wins,

      draws:
        stats.total.draws,

      losses:
        stats.total.losses,

      goals_for:
        stats.total.goals_for,

      goals_against:
        stats.total.goals_against,

      goal_difference:
        stats.total.goals_for -
        stats.total.goals_against,

      win_percentage:
        stats.total.matches
          ? Number(
              (
                stats.total.wins /
                stats.total.matches *
                100
              ).toFixed(2)
            )
          : 0,

      home: {
        ...stats.home,

        win_percentage:
          stats.home.matches
            ? Number(
                (
                  stats.home.wins /
                  stats.home.matches *
                  100
                ).toFixed(2)
              )
            : 0
      },

      away: {
        ...stats.away,

        win_percentage:
          stats.away.matches
            ? Number(
                (
                  stats.away.wins /
                  stats.away.matches *
                  100
                ).toFixed(2)
              )
            : 0
      },

      clean_sheets:
        stats.total.clean_sheets,

      failed_to_score:
        stats.total.failed_to_score,

      markets: {
        btts_percentage:
          stats.total.matches
            ? Number(
                (
                  stats.markets.btts /
                  stats.total.matches *
                  100
                ).toFixed(2)
              )
            : 0,

        over_1_5_percentage:
          stats.total.matches
            ? Number(
                (
                  stats.markets.over_1_5 /
                  stats.total.matches *
                  100
                ).toFixed(2)
              )
            : 0,

        over_2_5_percentage:
          stats.total.matches
            ? Number(
                (
                  stats.markets.over_2_5 /
                  stats.total.matches *
                  100
                ).toFixed(2)
              )
            : 0
      },

      recent_form: {
        sequence: formSequence,

        last_5_goals_for:
          recent5.reduce(
            (sum, m) => sum + m.gf,
            0
          ),

        last_5_goals_against:
          recent5.reduce(
            (sum, m) => sum + m.ga,
            0
          )
      }
    };

    fs.writeFileSync(
      path.join(
        teamsDir,
        `${safeFilename(teamId)}.json`
      ),
      JSON.stringify(profile, null, 2),
      'utf8'
    );

    teamCount++;
  }

  console.log(
    `✅ Wrote ${teamCount} rich team profiles.`
  );

  // ==========================================================
  // 4. H2H
  // ==========================================================

  console.log('\n📁 Writing Rich H2H Summaries...');

  const h2hSummary = [];

  for (const [key, data] of Object.entries(h2hData)) {

    const totalGoals =
      data.team_a_goals +
      data.team_b_goals;

    h2hSummary.push({
      h2h_id: key,

      team_a_id:
        data.team_a_id,

      team_b_id:
        data.team_b_id,

      total_matches:
        data.matches.length,

      team_a_wins:
        data.team_a_wins,

      team_b_wins:
        data.team_b_wins,

      draws:
        data.draws,

      team_a_goals:
        data.team_a_goals,

      team_b_goals:
        data.team_b_goals,

      average_goals:
        data.matches.length
          ? Number(
              (
                totalGoals /
                data.matches.length
              ).toFixed(2)
            )
          : 0
    });
  }

  fs.writeFileSync(
    path.join(
      h2hDir,
      'h2h_summaries.json'
    ),
    JSON.stringify(
      h2hSummary,
      null,
      2
    ),
    'utf8'
  );

  console.log(
    `✅ Wrote ${h2hSummary.length} rich H2H summaries.`
  );

  // ==========================================================
  // 5. PLAYER STATISTICS
  // ==========================================================

  console.log('\n📁 Writing Player Statistics...');

  let playerCount = 0;

  // Frontend/search manifest
  const playerIndex = [];

  for (const [normalizedName, data] of Object.entries(playerData)) {

    const playerId =
      data.player_id ||
      makePlayerId(data.name);

    const filename =
      `player_${playerId}.json`;

    const profile = {

      player_id:
        playerId,

      player_key:
        normalizedName,

      name:
        data.name,

      total_goals:
        data.goals,

      penalties:
        data.penalties,

      own_goals:
        data.own_goals,

      matches_scored_in:
        data.matches_scored_in.size,

      goals_per_scoring_match:
        data.matches_scored_in.size > 0
          ? Number(
              (
                data.goals /
                data.matches_scored_in.size
              ).toFixed(2)
            )
          : 0,

      teams:
        Array.from(data.teams)
    };

    fs.writeFileSync(
      path.join(playersDir, filename),
      JSON.stringify(
        profile,
        null,
        2
      ),
      'utf8'
    );

    playerIndex.push({
      player_id: playerId,
      player_key: normalizedName,
      name: data.name,
      file: filename,
      total_goals: data.goals
    });

    playerCount++;
  }

  // ==========================================================
  // 6. PLAYER INDEX
  // ==========================================================

  playerIndex.sort(
    (a, b) =>
      b.total_goals -
      a.total_goals
  );

  fs.writeFileSync(
    path.join(
      playersDir,
      'players_index.json'
    ),
    JSON.stringify(
      {
        total_players:
          playerIndex.length,

        players:
          playerIndex
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    `✅ Wrote ${playerCount} player profiles.`
  );

  console.log(
    `✅ Wrote player search index.`
  );

  // ==========================================================
  // COMPLETE
  // ==========================================================

  console.log('\n============================================================');
  console.log(' STEP 7 COMPLETE');
  console.log('============================================================');

  console.log(
    `📊 Matches analyzed:     ${allMatches.length.toLocaleString()}`
  );

  console.log(
    `📊 Teams:                ${teamCount.toLocaleString()}`
  );

  console.log(
    `📊 H2H pairs:            ${h2hSummary.length.toLocaleString()}`
  );

  console.log(
    `📊 Players:              ${playerCount.toLocaleString()}`
  );

  console.log(
    `📁 Stats Directory:      ${V2_STATS_DIR}`
  );

  console.log(
    '\n🔒 V2 MATCH DATA WAS NOT MODIFIED.'
  );
}

buildIntelligence().catch(err => {
  console.error(
    '❌ Intelligence Build Failed:',
    err
  );

  process.exit(1);
});