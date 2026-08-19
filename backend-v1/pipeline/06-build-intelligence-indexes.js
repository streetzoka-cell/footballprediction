'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const INTEL_DIR = path.join(ROOT, 'data', 'intelligence');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function clean(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[.'’‘`"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value) {
  return clean(value).replace(/\s+/g, '');
}

function safeNumber(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function safeFilename(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ============================================================
// ★ NEW: Safe Write function to bypass Windows OneDrive locks
// ============================================================
function safeWriteFileSync(filePath, data) {
  const maxRetries = 5;
  const retryDelay = 500; // 0.5 seconds
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.writeFileSync(filePath, data);
      return; // Success!
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        console.warn(`[WARN] File locked by OneDrive, retrying in ${retryDelay}ms... (${filePath})`);
        // Sleep synchronously to wait for OneDrive to release the lock
        const start = Date.now();
        while (Date.now() - start < retryDelay) { /* busy wait */ }
      } else {
        throw err; // Different error, throw it
      }
    }
  }
  throw new Error(`Failed to write file after ${maxRetries} retries: ${filePath}`);
}

function createTeamStats() {
  return {
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals_for: 0,
    goals_against: 0,
    recent_form: [] // ★ NEW: Track last 5 results
  };
}

function createH2HStats() {
  return {
    matches: 0,
    team_a_wins: 0,
    team_b_wins: 0,
    draws: 0
  };
}

function createPlayerStats() {
  return {
    appearances: 0,
    goals: 0,
    assists: 0,
    yellow_cards: 0,
    red_cards: 0
  };
}

async function run() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — PHASE C: BUILD INTELLIGENCE INDEXES');
  console.log('============================================================\n');

  ensureDir(INTEL_DIR);
  ensureDir(path.join(INTEL_DIR, 'teams'));
  ensureDir(path.join(INTEL_DIR, 'h2h'));
  ensureDir(path.join(INTEL_DIR, 'players'));

  /*
   * ==========================================================
   * 1. LOAD CANONICAL TEAM INDEX
   * ==========================================================
   */

  console.log('[1/4] Loading MASTER metadata and canonical Team Index...');

  const teamsIndex = JSON.parse(
    fs.readFileSync(
      path.join(INDEX_DIR, 'teams-index.json'),
      'utf8'
    )
  );

  const teamNameToIds = new Map();

  for (const [teamId, profile] of Object.entries(teamsIndex)) {
    const name = profile?.name;

    if (!name) continue;

    const normalized = compact(name);

    if (!normalized) continue;

    if (!teamNameToIds.has(normalized)) {
      teamNameToIds.set(normalized, []);
    }

    teamNameToIds.get(normalized).push(teamId);
  }

  /*
   * Only uniquely identifiable names are resolved.
   * Ambiguous names remain unresolved intentionally.
   */
  const teamNameToIdMap = new Map();

  let ambiguousTeamNames = 0;

  for (const [name, ids] of teamNameToIds.entries()) {
    if (ids.length === 1) {
      teamNameToIdMap.set(name, ids[0]);
    } else {
      ambiguousTeamNames++;
    }
  }

  console.log(
    `   ↳ Canonical teams indexed: ${Object.keys(teamsIndex).length.toLocaleString()}`
  );

  console.log(
    `   ↳ Unique team-name mappings: ${teamNameToIdMap.size.toLocaleString()}`
  );

  console.log(
    `   ↳ Ambiguous team names: ${ambiguousTeamNames.toLocaleString()}\n`
  );

  /*
   * ==========================================================
   * 2. LOAD MASTER AND BUILD MATCH INDEX
   * ==========================================================
   */

  console.log('[2/4] Loading canonical MASTER matches...');

  const matches = Object.create(null);

  let masterRows = 0;
  let excludedRows = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(
      path.join(DATA_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv')
    )
      .pipe(csv())
      .on('data', row => {
        masterRows++;

        const matchId = String(
          row.zokascore_match_id ?? ''
        ).trim();

        const date = String(
          row.date ?? ''
        ).trim();

        const homeName = String(
          row.home_team ?? ''
        ).trim();

        const awayName = String(
          row.away_team ?? ''
        ).trim();

        if (!matchId || !date || !homeName || !awayName) {
          excludedRows++;
          return;
        }

        const homeId = teamNameToIdMap.get(
          compact(homeName)
        );

        const awayId = teamNameToIdMap.get(
          compact(awayName)
        );

        if (!homeId || !awayId) {
          excludedRows++;
          return;
        }

        const homeScore = safeNumber(row.home_score);
        const awayScore = safeNumber(row.away_score);

        const validScore =
          homeScore !== null &&
          awayScore !== null &&
          homeScore >= 0 &&
          awayScore >= 0;

        matches[matchId] = {
          date,
          home_team: homeName,
          away_team: awayName,
          home_team_id: homeId,
          away_team_id: awayId,
          home_score: homeScore,
          away_score: awayScore,
          has_valid_score: validScore,
          competition: String(
            row.competition ?? ''
          ).trim()
        };
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(
    `   ↳ MASTER rows read: ${masterRows.toLocaleString()}`
  );

  console.log(
    `   ↳ Canonical matches indexed: ${Object.keys(matches).length.toLocaleString()}`
  );

  console.log(
    `   ↳ Rows excluded: ${excludedRows.toLocaleString()}\n`
  );

  /*
   * ==========================================================
   * 3. BUILD TEAM + H2H INTELLIGENCE
   * ==========================================================
   */

  console.log('[3/4] Building Team and H2H intelligence...');

  const teamData = Object.create(null);
  const h2hData = Object.create(null);

  let validMatchCount = 0;
  let invalidScoreCount = 0;
  let selfMatchCount = 0;

  for (const match of Object.values(matches)) {
    if (!match.has_valid_score) {
      invalidScoreCount++;
      continue;
    }

    /*
     * A match where both sides resolve to the same canonical
     * team is not a valid team/H2H statistical event.
     */
    if (
      match.home_team_id === match.away_team_id
    ) {
      selfMatchCount++;
      continue;
    }

    const hs = match.home_score;
    const as = match.away_score;

    validMatchCount++;

    const homeId = match.home_team_id;
    const awayId = match.away_team_id;

    if (!teamData[homeId]) {
      teamData[homeId] = createTeamStats();
    }

    if (!teamData[awayId]) {
      teamData[awayId] = createTeamStats();
    }

    /*
     * HOME TEAM
     */
    teamData[homeId].matches++;
    teamData[homeId].goals_for += hs;
    teamData[homeId].goals_against += as;

    /*
     * AWAY TEAM
     */
    teamData[awayId].matches++;
    teamData[awayId].goals_for += as;
    teamData[awayId].goals_against += hs;

    /*
     * RESULT
     */
    if (hs > as) {
      teamData[homeId].wins++;
      teamData[awayId].losses++;
      teamData[homeId].recent_form.push('W'); // ★ NEW
      teamData[awayId].recent_form.push('L'); // ★ NEW
    } else if (as > hs) {
      teamData[awayId].wins++;
      teamData[homeId].losses++;
      teamData[homeId].recent_form.push('L'); // ★ NEW
      teamData[awayId].recent_form.push('W'); // ★ NEW
    } else {
      teamData[homeId].draws++;
      teamData[awayId].draws++;
      teamData[homeId].recent_form.push('D'); // ★ NEW
      teamData[awayId].recent_form.push('D'); // ★ NEW
    }

    /*
     * ========================================================
     * H2H
     *
     * Canonical orientation is determined ONLY by sorted
     * canonical team IDs.
     * ========================================================
     */

    const [teamA, teamB] = [homeId, awayId].sort();

    const h2hKey = `${teamA}_vs_${teamB}`;

    if (!h2hData[h2hKey]) {
      h2hData[h2hKey] = createH2HStats();
    }

    const h2h = h2hData[h2hKey];

    h2h.matches++;

    if (hs > as) {
      if (homeId === teamA) {
        h2h.team_a_wins++;
      } else {
        h2h.team_b_wins++;
      }
    } else if (as > hs) {
      if (awayId === teamA) {
        h2h.team_a_wins++;
      } else {
        h2h.team_b_wins++;
      }
    } else {
      h2h.draws++;
    }
  }

  console.log(
    `   ↳ Valid matches processed: ${validMatchCount.toLocaleString()}`
  );

  console.log(
    `   ↳ Teams generated: ${Object.keys(teamData).length.toLocaleString()}`
  );

  console.log(
    `   ↳ H2H pairs generated: ${Object.keys(h2hData).length.toLocaleString()}`
  );

  console.log(
    `   ↳ Invalid-score matches skipped: ${invalidScoreCount.toLocaleString()}`
  );

  console.log(
    `   ↳ Self-team matches skipped: ${selfMatchCount.toLocaleString()}\n`
  );

  /*
   * ==========================================================
   * WRITE TEAM INTELLIGENCE
   * ==========================================================
   */

  console.log('[4/4] Writing intelligence artifacts...');

  for (const [teamId, stats] of Object.entries(teamData)) {
    const profile = {
      team: teamId,
      ...stats,
      recent_form: stats.recent_form.slice(-5).reverse() // ★ NEW: Keep last 5, most recent first
    };

    safeWriteFileSync( // ★ Changed to safeWriteFileSync
      path.join(
        INTEL_DIR,
        'teams',
        `${safeFilename(teamId)}.json`
      ),
      JSON.stringify(profile, null, 2)
    );
  }

  safeWriteFileSync( // ★ Changed to safeWriteFileSync
    path.join(
      INTEL_DIR,
      'team-intelligence-index.json'
    ),
    JSON.stringify(teamData, null, 2)
  );

  /*
   * ==========================================================
   * WRITE H2H INTELLIGENCE
   * ==========================================================
   */

  safeWriteFileSync( // ★ Changed to safeWriteFileSync
    path.join(
      INTEL_DIR,
      'h2h',
      'summaries.json'
    ),
    JSON.stringify(h2hData, null, 2)
  );

  safeWriteFileSync( // ★ Changed to safeWriteFileSync
    path.join(
      INTEL_DIR,
      'h2h-intelligence-index.json'
    ),
    JSON.stringify(h2hData, null, 2)
  );

  /*
   * ==========================================================
   * PLAYER INTELLIGENCE
   * ==========================================================
   */

  console.log('[4/4] Building Player intelligence from APPEARANCES...');

  const playerData = Object.create(null);

  const crosswalk = JSON.parse(
    fs.readFileSync(
      path.join(
        INDEX_DIR,
        'match-id-crosswalk.json'
      ),
      'utf8'
    )
  );

  const playerIndex = JSON.parse(
    fs.readFileSync(
      path.join(
        INDEX_DIR,
        'players-index.json'
      ),
      'utf8'
    )
  );

  let appearanceRows = 0;
  let appearanceUsed = 0;
  let appearanceExcluded = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(
      path.join(
        DATA_DIR,
        'ZOKASCORE_APPEARANCES.csv'
      )
    )
      .pipe(csv())
      .on('data', row => {
        appearanceRows++;

        const sourceMatchId = String(
          row.zokascore_match_id ?? ''
        ).trim();

        if (!sourceMatchId) {
          appearanceExcluded++;
          return;
        }

        const canonicalMatchId =
          crosswalk[sourceMatchId] ||
          sourceMatchId;

        const match = matches[canonicalMatchId];

        if (!match) {
          appearanceExcluded++;
          return;
        }

        const playerId = String(
          row.zokascore_player_id ?? ''
        ).trim();

        if (!playerId) {
          appearanceExcluded++;
          return;
        }

        if (!playerData[playerId]) {
          playerData[playerId] = createPlayerStats();
        }

        const stats = playerData[playerId];

        stats.appearances++;

        stats.goals +=
          safeNumber(row.goals) ?? 0;

        stats.assists +=
          safeNumber(row.assists) ?? 0;

        stats.yellow_cards +=
          safeNumber(row.yellow_cards) ?? 0;

        stats.red_cards +=
          safeNumber(row.red_cards) ?? 0;

        appearanceUsed++;
      })
      .on('end', resolve)
      .on('error', reject);
  });

  /*
   * Write player profiles.
   */

  for (const [playerId, stats] of Object.entries(playerData)) {
    const profile = {
      player_id: playerId,
      name: playerIndex[playerId]?.name || 'Unknown',
      ...stats
    };

    safeWriteFileSync( // ★ Changed to safeWriteFileSync
      path.join(
        INTEL_DIR,
        'players',
        `player_${safeFilename(playerId)}.json`
      ),
      JSON.stringify(profile, null, 2)
    );
  }

  safeWriteFileSync( // ★ Changed to safeWriteFileSync
    path.join(
      INTEL_DIR,
      'player-intelligence-index.json'
    ),
    JSON.stringify(playerData, null, 2)
  );

  console.log(
    `   ↳ APPEARANCE rows: ${appearanceRows.toLocaleString()}`
  );

  console.log(
    `   ↳ APPEARANCE rows used: ${appearanceUsed.toLocaleString()}`
  );

  console.log(
    `   ↳ APPEARANCE rows excluded: ${appearanceExcluded.toLocaleString()}`
  );

  console.log(
    `   ↳ Player profiles written: ${Object.keys(playerData).length.toLocaleString()}\n`
  );

  /*
   * ==========================================================
   * FINAL SUMMARY
   * ==========================================================
   */

  console.log('============================================================');
  console.log(' PHASE C COMPLETE');
  console.log('============================================================');

  console.log(
    `Teams       : ${Object.keys(teamData).length.toLocaleString()}`
  );

  console.log(
    `H2H pairs   : ${Object.keys(h2hData).length.toLocaleString()}`
  );

  console.log(
    `Players     : ${Object.keys(playerData).length.toLocaleString()}`
  );

  console.log(
    `MASTER rows : ${masterRows.toLocaleString()}`
  );

  console.log(
    `Valid matches: ${validMatchCount.toLocaleString()}`
  );

  console.log(
    `Ambiguous team names: ${ambiguousTeamNames.toLocaleString()}`
  );

  console.log('\n🔒 Canonical source files were NOT modified.');
  console.log('============================================================');
}

run().catch(err => {
  console.error('\n❌ Intelligence build failed:');
  console.error(err);
  process.exit(1);
});