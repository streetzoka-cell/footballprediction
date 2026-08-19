'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — STEP 8: INTELLIGENCE VALIDATION
 * ============================================================
 *
 * PURPOSE
 * -------
 * Independently validate the Step 7 seasonal intelligence
 * artifacts against the canonical MASTER CSV.
 *
 * INPUT
 * -----
 * data/source/ZOKASCORE_FINAL/ZOKASCORE_PUBLIC_MASTER.csv
 * data/indexes/teams-index.json
 * data/intelligence/seasonal/<season>.json
 *
 * OUTPUT
 * ------
 * data/intelligence/seasonal/validation-report.json
 *
 * VALIDATION MODEL
 * ----------------
 * MASTER
 *   ↓
 * independent canonical team resolution
 *   ↓
 * independent season resolution
 *   ↓
 * independent competition resolution
 *   ↓
 * independent statistical aggregation
 *   ↓
 * compare against Step 7 artifacts
 *
 * IMPORTANT
 * ---------
 * - Step 8 does NOT trust Step 7 calculations.
 * - Step 8 independently recalculates the statistics.
 * - Canonical source data is NEVER modified.
 * - No fuzzy matching.
 * - No alias guessing.
 * - No synthetic IDs.
 * - Missing season is derived from date exactly as Step 7.
 * - Invalid scores are skipped.
 * - Unresolved teams are excluded.
 * - Self-matches are strictly excluded (aligned with Step 7 & 10).
 * - Competition context is preserved.
 *
 * A mismatch in any core statistic produces FAIL.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');

const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const INTEL_DIR = path.join(ROOT, 'data', 'intelligence');
const SEASONAL_DIR = path.join(INTEL_DIR, 'seasonal');

const MASTER_FILE = path.join(DATA_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv');
const TEAMS_INDEX_FILE = path.join(INDEX_DIR, 'teams-index.json');
const VALIDATION_FILE = path.join(SEASONAL_DIR, 'validation-report.json');

function clean(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[.'’‘"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value) { return clean(value).replace(/\s+/g, ''); }

function safeNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeFilename(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').trim() || 'unknown';
}

function deriveSeasonFromDate(dateValue) {
  const dateStr = String(dateValue ?? '').trim();
  if (!dateStr) return null;
  const yearMatch = dateStr.match(/^(\d{4})/);
  return yearMatch ? yearMatch[1] : null;
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function average(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(2));
}

function createTeamStats(teamId, teamName) {
  return {
    team_id: teamId, team_name: teamName, matches: 0, wins: 0, draws: 0, losses: 0, standard_points: 0,
    goals_for: 0, goals_against: 0, goal_difference: 0, clean_sheets: 0, failed_to_score: 0,
    home: { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 },
    away: { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 },
    markets: { btts: 0, over_0_5: 0, over_1_5: 0, over_2_5: 0, over_3_5: 0 }
  };
}

function updateTeamStats(stats, gf, ga, venue) {
  stats.matches++; stats.goals_for += gf; stats.goals_against += ga;
  if (gf > ga) { stats.wins++; stats.standard_points += 3; } else if (gf < ga) { stats.losses++; } else { stats.draws++; stats.standard_points += 1; }
  if (ga === 0) stats.clean_sheets++; if (gf === 0) stats.failed_to_score++;
  const v = stats[venue]; v.matches++; v.goals_for += gf; v.goals_against += ga;
  if (gf > ga) v.wins++; else if (gf < ga) v.losses++; else v.draws++;
  if (ga === 0) v.clean_sheets++; if (gf === 0) v.failed_to_score++;
  const tg = gf + ga; if (gf > 0 && ga > 0) stats.markets.btts++;
  if (tg > 0) stats.markets.over_0_5++; if (tg > 1) stats.markets.over_1_5++; if (tg > 2) stats.markets.over_2_5++; if (tg > 3) stats.markets.over_3_5++;
}

function finalizeTeamStats(stats) {
  stats.goal_difference = stats.goals_for - stats.goals_against;
  stats.win_percentage = percentage(stats.wins, stats.matches);
  stats.goals_per_match = average(stats.goals_for, stats.matches);
  stats.goals_conceded_per_match = average(stats.goals_against, stats.matches);
  stats.home.win_percentage = percentage(stats.home.wins, stats.home.matches);
  stats.home.goals_per_match = average(stats.home.goals_for, stats.home.matches);
  stats.home.goals_conceded_per_match = average(stats.home.goals_against, stats.home.matches);
  stats.away.win_percentage = percentage(stats.away.wins, stats.away.matches);
  stats.away.goals_per_match = average(stats.away.goals_for, stats.away.matches);
  stats.away.goals_conceded_per_match = average(stats.away.goals_against, stats.away.matches);
  stats.markets.btts_percentage = percentage(stats.markets.btts, stats.matches);
  stats.markets.over_0_5_percentage = percentage(stats.markets.over_0_5, stats.matches);
  stats.markets.over_1_5_percentage = percentage(stats.markets.over_1_5, stats.matches);
  stats.markets.over_2_5_percentage = percentage(stats.markets.over_2_5, stats.matches);
  stats.markets.over_3_5_percentage = percentage(stats.markets.over_3_5, stats.matches);
  return stats;
}

function compareValue(mismatches, label, expected, actual) {
  if (expected !== actual) {
    mismatches.push({ field: label, expected, actual });
    return false;
  }
  return true;
}

function compareTeamStats(expected, actual, location) {
  const mismatches = [];
  if (!actual) {
    mismatches.push({ field: location, expected: 'profile exists', actual: 'missing' });
    return mismatches;
  }

  const coreFields = ['team_id', 'team_name', 'matches', 'wins', 'draws', 'losses', 'standard_points', 'goals_for', 'goals_against', 'goal_difference', 'clean_sheets', 'failed_to_score', 'win_percentage', 'goals_per_match', 'goals_conceded_per_match'];
  for (const field of coreFields) compareValue(mismatches, `${location}.${field}`, expected[field], actual[field]);

  const venueFields = ['matches', 'wins', 'draws', 'losses', 'goals_for', 'goals_against', 'clean_sheets', 'failed_to_score', 'win_percentage', 'goals_per_match', 'goals_conceded_per_match'];
  for (const venue of ['home', 'away']) {
    for (const field of venueFields) compareValue(mismatches, `${location}.${venue}.${field}`, expected[venue][field], actual[venue]?.[field]);
  }

  const marketFields = ['btts', 'over_0_5', 'over_1_5', 'over_2_5', 'over_3_5', 'btts_percentage', 'over_0_5_percentage', 'over_1_5_percentage', 'over_2_5_percentage', 'over_3_5_percentage'];
  for (const field of marketFields) compareValue(mismatches, `${location}.markets.${field}`, expected.markets[field], actual.markets?.[field]);

  return mismatches;
}

async function run() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 8: INTELLIGENCE VALIDATION');
  console.log('============================================================\n');

  if (!fs.existsSync(MASTER_FILE)) throw new Error(`MASTER file not found: ${MASTER_FILE}`);
  if (!fs.existsSync(TEAMS_INDEX_FILE)) throw new Error(`Teams index not found: ${TEAMS_INDEX_FILE}`);
  if (!fs.existsSync(SEASONAL_DIR)) throw new Error(`Seasonal intelligence directory not found: ${SEASONAL_DIR}`);

  console.log('[1/4] Loading canonical team index...');
  const teamsIndex = JSON.parse(fs.readFileSync(TEAMS_INDEX_FILE, 'utf8'));
  
  // FIX: Count the actual canonical teams in the registry, not the name mappings
  const canonicalTeamCount = Object.keys(teamsIndex).length;
  
  const teamNameToIdMap = new Map();
  let ambiguousNameCount = 0;

  for (const [teamId, profile] of Object.entries(teamsIndex)) {
    if (!profile || !profile.name) continue;
    const normalizedName = compact(profile.name);
    if (!normalizedName) continue;
    if (teamNameToIdMap.has(normalizedName)) {
      if (teamNameToIdMap.get(normalizedName) !== teamId) {
        ambiguousNameCount++;
        teamNameToIdMap.delete(normalizedName);
      }
      continue;
    }
    teamNameToIdMap.set(normalizedName, teamId);
  }
  console.log(`   ↳ Canonical teams indexed: ${canonicalTeamCount.toLocaleString()}`);
  console.log(`   ↳ Ambiguous canonical names: ${ambiguousNameCount.toLocaleString()}\n`);

  console.log('[2/4] Independently recalculating seasonal intelligence from MASTER...');
  const seasonsMap = new Map();
  const unresolvedTeams = new Map();
  let totalRows = 0, processedMatches = 0, explicitSeasonRows = 0, derivedSeasonRows = 0, skippedMissingSeason = 0, skippedMissingTeam = 0, skippedUnresolvedTeam = 0, skippedInvalidScore = 0, skippedSelfMatch = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(MASTER_FILE)
      .pipe(csv())
      .on('data', row => {
        totalRows++;
        let season = String(row.season ?? '').trim();
        if (season) explicitSeasonRows++; else {
          season = deriveSeasonFromDate(row.date);
          if (season) derivedSeasonRows++; else { skippedMissingSeason++; return; }
        }

        const homeName = String(row.home_team ?? '').trim();
        const awayName = String(row.away_team ?? '').trim();
        if (!homeName || !awayName) { skippedMissingTeam++; return; }

        const homeId = teamNameToIdMap.get(compact(homeName));
        const awayId = teamNameToIdMap.get(compact(awayName));
        if (!homeId) unresolvedTeams.set(homeName, (unresolvedTeams.get(homeName) || 0) + 1);
        if (!awayId) unresolvedTeams.set(awayName, (unresolvedTeams.get(awayName) || 0) + 1);
        if (!homeId || !awayId) { skippedUnresolvedTeam++; return; }

        // FIX: Self-match exclusion strictly aligned with Step 7 & 10
        if (homeId === awayId) { skippedSelfMatch++; return; }

        const homeScore = safeNumber(row.home_score);
        const awayScore = safeNumber(row.away_score);
        if (homeScore === null || awayScore === null) { skippedInvalidScore++; return; }

        const competition = String(row.competition ?? row.competition_name ?? row.league ?? 'UNKNOWN_COMPETITION').trim() || 'UNKNOWN_COMPETITION';

        if (!seasonsMap.has(season)) seasonsMap.set(season, new Map());
        const seasonMap = seasonsMap.get(season);
        if (!seasonMap.has(competition)) seasonMap.set(competition, {});
        const competitionData = seasonMap.get(competition);

        if (!competitionData[homeId]) competitionData[homeId] = createTeamStats(homeId, homeName);
        if (!competitionData[awayId]) competitionData[awayId] = createTeamStats(awayId, awayName);

        updateTeamStats(competitionData[homeId], homeScore, awayScore, 'home');
        updateTeamStats(competitionData[awayId], awayScore, homeScore, 'away');
        processedMatches++;
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`   ↳ Matches independently processed: ${processedMatches.toLocaleString()}`);
  console.log(`   ↳ Skipped (Self-match): ${skippedSelfMatch.toLocaleString()}\n`);

  console.log('[3/4] Comparing independent calculations against Step 7 artifacts...');
  const mismatches = [];
  let seasonsExpected = 0, seasonsFound = 0, competitionsExpected = 0, competitionsFound = 0, teamProfilesExpected = 0, teamProfilesFound = 0;

  for (const [season, competitionMap] of seasonsMap.entries()) {
    seasonsExpected++;
    const seasonFile = path.join(SEASONAL_DIR, `${safeFilename(season)}.json`);
    if (!fs.existsSync(seasonFile)) { mismatches.push({ type: 'missing_season_file', season }); continue; }
    seasonsFound++;

    let generated;
    try { generated = JSON.parse(fs.readFileSync(seasonFile, 'utf8')); } catch (err) { mismatches.push({ type: 'invalid_season_json', season, error: err.message }); continue; }
    if (generated.season !== season) mismatches.push({ type: 'season_field_mismatch', season, expected: season, actual: generated.season });

    const generatedCompetitions = generated.competitions || {};
    const expectedCompetitionNames = new Set(competitionMap.keys());
    const actualCompetitionNames = new Set(Object.keys(generatedCompetitions));

    for (const competition of expectedCompetitionNames) {
      competitionsExpected++;
      if (!actualCompetitionNames.has(competition)) { mismatches.push({ type: 'missing_competition', season, competition }); continue; }
      competitionsFound++;

      const expectedTeams = competitionMap.get(competition);
      const generatedCompetition = generatedCompetitions[competition];
      if (!generatedCompetition || !generatedCompetition.teams) { mismatches.push({ type: 'invalid_competition_profile', season, competition }); continue; }

      const generatedTeams = generatedCompetition.teams;
      const expectedTeamIds = new Set(Object.keys(expectedTeams));
      const actualTeamIds = new Set(Object.keys(generatedTeams));

      for (const teamId of expectedTeamIds) {
        teamProfilesExpected++;
        if (!actualTeamIds.has(teamId)) { mismatches.push({ type: 'missing_team_profile', season, competition, team_id: teamId }); continue; }
        teamProfilesFound++;

        const expectedStats = finalizeTeamStats(expectedTeams[teamId]);
        const actualStats = generatedTeams[teamId];
        const teamMismatches = compareTeamStats(expectedStats, actualStats, `${season}/${competition}/${teamId}`);

        for (const mismatch of teamMismatches) {
          mismatches.push({ type: 'statistic_mismatch', season, competition, team_id: teamId, ...mismatch });
        }
      }
      for (const teamId of actualTeamIds) {
        if (!expectedTeamIds.has(teamId)) mismatches.push({ type: 'unexpected_team_profile', season, competition, team_id: teamId });
      }
    }
    for (const competition of actualCompetitionNames) {
      if (!expectedCompetitionNames.has(competition)) mismatches.push({ type: 'unexpected_competition', season, competition });
    }
  }

  const generatedSeasonFiles = fs.readdirSync(SEASONAL_DIR).filter(file => file.endsWith('.json') && file !== 'validation-report.json' && file !== 'unresolved-team-residuals.json');
  const expectedSeasonFilenames = new Set([...seasonsMap.keys()].map(safeFilename).map(season => `${season}.json`));
  for (const file of generatedSeasonFiles) {
    if (!expectedSeasonFilenames.has(file)) mismatches.push({ type: 'unexpected_season_file', file });
  }

  console.log('[4/4] Validating forensic residual report...');
  const residualFile = path.join(SEASONAL_DIR, 'unresolved-team-residuals.json');
  let residualReportValid = true;

  if (!fs.existsSync(residualFile)) {
    residualReportValid = false;
    mismatches.push({ type: 'missing_unresolved_residual_report' });
  } else {
    let generatedResiduals;
    try { generatedResiduals = JSON.parse(fs.readFileSync(residualFile, 'utf8')); } catch (err) { residualReportValid = false; mismatches.push({ type: 'invalid_unresolved_residual_report', error: err.message }); }

    if (generatedResiduals) {
      const expectedResidualNames = [...unresolvedTeams.keys()].sort();
      const actualResidualNames = Array.isArray(generatedResiduals.unresolved_teams) ? generatedResiduals.unresolved_teams.map(item => item.name).sort() : [];

      if (generatedResiduals.total_unresolved_names !== expectedResidualNames.length) {
        residualReportValid = false;
        mismatches.push({ type: 'residual_count_mismatch', expected: expectedResidualNames.length, actual: generatedResiduals.total_unresolved_names });
      }
      if (JSON.stringify(expectedResidualNames) !== JSON.stringify(actualResidualNames)) {
        residualReportValid = false;
        mismatches.push({ type: 'residual_names_mismatch', expected: expectedResidualNames, actual: actualResidualNames });
      }

      const generatedResidualMap = new Map();
      if (Array.isArray(generatedResiduals.unresolved_teams)) {
        for (const item of generatedResiduals.unresolved_teams) generatedResidualMap.set(item.name, item.references);
      }

      for (const [name, references] of unresolvedTeams.entries()) {
        const actual = generatedResidualMap.get(name);
        if (actual !== references) {
          residualReportValid = false;
          mismatches.push({ type: 'residual_reference_count_mismatch', name, expected: references, actual });
        }
      }
    }
  }

  const status = mismatches.length === 0 ? 'PASS' : 'FAIL';
  const report = {
    generated_at: new Date().toISOString(),
    status,
    master_rows_scanned: totalRows,
    master_matches_processed: processedMatches,
    explicit_season_rows: explicitSeasonRows,
    derived_season_rows: derivedSeasonRows,
    skipped_missing_season: skippedMissingSeason,
    skipped_missing_team: skippedMissingTeam,
    skipped_unresolved_team: skippedUnresolvedTeam,
    skipped_self_match: skippedSelfMatch, // FIX: Added to report
    skipped_invalid_score: skippedInvalidScore,
    canonical_team_indexed: canonicalTeamCount,
    ambiguous_canonical_names: ambiguousNameCount,
    seasons_expected: seasonsExpected,
    seasons_found: seasonsFound,
    competition_profiles_expected: competitionsExpected,
    competition_profiles_found: competitionsFound,
    team_profiles_expected: teamProfilesExpected,
    team_profiles_found: teamProfilesFound,
    unresolved_team_names_expected: unresolvedTeams.size,
    unresolved_residual_report_valid: residualReportValid,
    mismatch_count: mismatches.length,
    mismatches
  };

  fs.writeFileSync(VALIDATION_FILE, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log(` STEP 8 VALIDATION COMPLETE: ${status}`);
  console.log('============================================================');
  console.log(`MASTER rows scanned       : ${totalRows.toLocaleString()}`);
  console.log(`Matches independently     : ${processedMatches.toLocaleString()}`);
  console.log(`Seasons expected/found    : ${seasonsExpected}/${seasonsFound}`);
  console.log(`Competitions expected/found: ${competitionsExpected}/${competitionsFound}`);
  console.log(`Teams expected/found      : ${teamProfilesExpected}/${teamProfilesFound}`);
  console.log(`Unresolved names          : ${unresolvedTeams.size.toLocaleString()}`);
  console.log(`Mismatches                : ${mismatches.length.toLocaleString()}`);
  console.log(`📁 Validation report: ${VALIDATION_FILE}\n`);

  if (status === 'FAIL') process.exit(1);
}

run().catch(err => {
  console.error('\n============================================================');
  console.error('❌ STEP 8 FAILED');
  console.error('============================================================');
  console.error(err);
  process.exit(1);
});