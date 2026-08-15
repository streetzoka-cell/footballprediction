'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const ENTITY_DIR = path.join(ROOT, 'data_audit', 'entity_resolution');
const V2_DIR = path.join(ROOT, 'public_data');
const V2_HISTORY_DIR = path.join(V2_DIR, 'knowledge', 'football', 'history');
const V2_AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_build_audit');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

function loadCsv(filename) {
  return new Promise((resolve) => {
    const results = [];
    const filePath = path.join(SOURCE_DIR, filename);
    if (!fs.existsSync(filePath)) return resolve([]);
    
    fs.createReadStream(filePath, { encoding: 'utf8' })
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results));
  });
}

async function buildV2() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 5: BUILD V2 MATCH BACKBONE');
  console.log('============================================================\n');

  ensureDir(V2_HISTORY_DIR);
  ensureDir(V2_AUDIT_DIR);

  // 1. Load Entity Map
  console.log('🔍 Loading canonical entity map...');
  const aliasMapPath = path.join(ENTITY_DIR, 'team_alias_map.json');
  if (!fs.existsSync(aliasMapPath)) {
    console.error('❌ FATAL: team_alias_map.json not found. Run Step 4 first.');
    process.exit(1);
  }
  const aliasMap = JSON.parse(fs.readFileSync(aliasMapPath, 'utf8'));

  // 2. Index Goalscorers and Shootouts by Match Key
  console.log('🔗 Indexing goalscorers and shootouts...');
  const goalscorers = await loadCsv('goalscorers_update.csv');
  const goalsMap = new Map();
  
  for (const goal of goalscorers) {
    const date = goal.date?.trim();
    const home = normalizeName(goal.home_team);
    const away = normalizeName(goal.away_team);
    if (!date || !home || !away) continue;

    const matchKey = `${date}_${home}_${away}`;
    if (!goalsMap.has(matchKey)) goalsMap.set(matchKey, []);
    
    goalsMap.get(matchKey).push({
      team: goal.team?.trim(),
      scorer: goal.scorer?.trim(),
      minute: parseInt(goal.minute, 10) || null,
      own_goal: goal.own_goal === 'True',
      penalty: goal.penalty === 'True'
    });
  }

  const shootouts = await loadCsv('shootouts_update.csv');
  const shootoutsMap = new Map();
  
  for (const shootout of shootouts) {
    const date = shootout.date?.trim();
    const home = normalizeName(shootout.home_team);
    const away = normalizeName(shootout.away_team);
    if (!date || !home || !away) continue;

    const matchKey = `${date}_${home}_${away}`;
    shootoutsMap.set(matchKey, {
      winner: shootout.winner?.trim(),
      first_shooter: shootout.first_shooter?.trim() || null
    });
  }

  // 3. Process Matches
  console.log('\n⚙️ Processing matches...');
  const matchesByCompetition = new Map();
  const seenMatchIds = new Set();
  const unmatchedTeams = new Set();
  
  let totalProcessed = 0;
  let totalDuplicates = 0;
  let totalWritten = 0;

  // Helper to safely get Canonical ID
  const getCanonicalId = (name) => {
    const norm = normalizeName(name);
    const id = aliasMap[norm];
    if (!id) unmatchedTeams.add(name);
    return id || `UNMATCHED_${norm}`; // Fallback so we don't lose the record
  };

  // Process International Matches (results_update.csv)
  console.log('   ↳ Processing International Matches...');
  const intlMatches = await loadCsv('results_update.csv');
  for (const match of intlMatches) {
    const date = match.date?.trim();
    const homeTeam = match.home_team?.trim();
    const awayTeam = match.away_team?.trim();
    if (!date || !homeTeam || !awayTeam) continue;

    const matchKey = `${date}_${normalizeName(homeTeam)}_${normalizeName(awayTeam)}`;
    const matchId = `INTL_${matchKey}`; // Generate deterministic ID for international matches

    if (seenMatchIds.has(matchId)) {
      totalDuplicates++;
      continue;
    }
    seenMatchIds.add(matchId);

    const homeId = getCanonicalId(homeTeam);
    const awayId = getCanonicalId(awayTeam);
    
    const matchRecord = {
      match_id: matchId,
      date,
      competition: match.tournament?.trim() || 'International Friendly',
      competition_id: null,
      season: date.substring(0, 4),
      home_team: homeTeam,
      home_team_id: homeId,
      away_team: awayTeam,
      away_team_id: awayId,
      home_score: parseInt(match.home_score, 10),
      away_score: parseInt(match.away_score, 10),
      round: null,
      stadium: match.city ? `${match.city}, ${match.country}` : null,
      attendance: null,
      goals: goalsMap.get(matchKey) || [],
      shootout: shootoutsMap.get(matchKey) || null,
      source: 'international_history'
    };

    // Sort goals by minute
    if (matchRecord.goals.length > 0) {
      matchRecord.goals.sort((a, b) => (a.minute || 999) - (b.minute || 999));
    }

    const compKey = normalizeName(matchRecord.competition).replace(/\s+/g, '_');
    if (!matchesByCompetition.has(compKey)) {
      matchesByCompetition.set(compKey, {
        name: matchRecord.competition,
        seasons: new Map()
      });
    }

    const compData = matchesByCompetition.get(compKey);
    if (!compData.seasons.has(matchRecord.season)) {
      compData.seasons.set(matchRecord.season, []);
    }
    compData.seasons.get(matchRecord.season).push(matchRecord);
    totalProcessed++;
  }

  // Process Club Matches (games.csv)
  console.log('   ↳ Processing Club Matches...');
  const clubMatches = await loadCsv('games.csv');
  for (const match of clubMatches) {
    const matchId = `TM_${match.game_id}`;
    if (seenMatchIds.has(matchId)) {
      totalDuplicates++;
      continue;
    }
    seenMatchIds.add(matchId);

    const date = match.date?.trim();
    if (!date) continue;

    // TM already provides IDs, but we verify they are in our entity map
    const homeTeam = match.home_club_name?.trim();
    const awayTeam = match.away_club_name?.trim();
    const homeId = match.home_club_id;
    const awayId = match.away_club_id;

    if (homeTeam && !aliasMap[normalizeName(homeTeam)]) unmatchedTeams.add(homeTeam);
    if (awayTeam && !aliasMap[normalizeName(awayTeam)]) unmatchedTeams.add(awayTeam);

    const matchRecord = {
      match_id: matchId,
      date,
      competition: match.competition_id?.trim() || 'Unknown Club Competition',
      competition_id: match.competition_id?.trim() || null,
      season: match.season?.trim() || date.substring(0, 4),
      home_team: homeTeam,
      home_team_id: homeId,
      away_team: awayTeam,
      away_team_id: awayId,
      home_score: parseInt(match.home_club_goals, 10),
      away_score: parseInt(match.away_club_goals, 10),
      round: match.round?.trim() || null,
      stadium: match.stadium?.trim() || null,
      attendance: parseInt(match.attendance, 10) || null,
      goals: [], // TM goals are in game_events.csv, handled in a later step if needed
      shootout: null,
      source: 'transfermarkt'
    };

    const compKey = normalizeName(matchRecord.competition).replace(/\s+/g, '_');
    if (!matchesByCompetition.has(compKey)) {
      matchesByCompetition.set(compKey, {
        name: matchRecord.competition,
        seasons: new Map()
      });
    }

    const compData = matchesByCompetition.get(compKey);
    if (!compData.seasons.has(matchRecord.season)) {
      compData.seasons.set(matchRecord.season, []);
    }
    compData.seasons.get(matchRecord.season).push(matchRecord);
    totalProcessed++;
  }

  // 4. Write V2 Files
  console.log('\n📁 Writing V2 chunked files...');
  for (const [compKey, compData] of matchesByCompetition.entries()) {
    const compDir = path.join(V2_HISTORY_DIR, compKey);
    ensureDir(compDir);

    for (const [season, matches] of compData.seasons.entries()) {
      const filePath = path.join(compDir, `${season}.json`);
      const data = {
        competition: compData.name,
        season: season,
        total_matches: matches.length,
        matches: matches
      };

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      totalWritten++;
    }
  }

  // 5. Save Audit Report
  const auditReport = {
    total_matches_processed: totalProcessed,
    total_duplicates_removed: totalDuplicates,
    total_files_written: totalWritten,
    total_competitions: matchesByCompetition.size,
    unmatched_teams: Array.from(unmatchedTeams)
  };

  fs.writeFileSync(
    path.join(V2_AUDIT_DIR, 'v2_match_build_report.json'),
    JSON.stringify(auditReport, null, 2),
    'utf8'
  );

  console.log('\n============================================================');
  console.log(' STEP 5 COMPLETE');
  console.log('============================================================');
  console.log(`✅ Total Matches Processed:  ${totalProcessed.toLocaleString()}`);
  console.log(`✅ Duplicates Removed:       ${totalDuplicates.toLocaleString()}`);
  console.log(`✅ Total V2 Files Written:   ${totalWritten.toLocaleString()}`);
  console.log(`⚠️ Unmatched Teams Found:    ${unmatchedTeams.size}`);
  console.log(`📁 V2 Output:                ${V2_HISTORY_DIR}`);
  console.log(`📁 Audit Report:             ${V2_AUDIT_DIR}/v2_match_build_report.json`);
  console.log('\n🔒 SOURCE DATA WAS NOT MODIFIED.');
}

buildV2().catch(err => {
  console.error('❌ V2 Build Failed:', err);
  process.exit(1);
});