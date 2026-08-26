'use strict';
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const INTEL_DIR = path.join(ROOT, 'data', 'intelligence');
const SEASONAL_DIR = path.join(INTEL_DIR, 'seasonal');

const MASTER_FILE = path.join(DATA_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv');
const FIX_PROPOSAL_PATH = path.join(ROOT, 'data_audit','canonical_gate','fix-proposals.json');
const TEAMS_INDEX_FILE = path.join(INDEX_DIR, 'teams-index.json');
const VALIDATION_FILE = path.join(SEASONAL_DIR, 'validation-report.json');

function clean(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[.\'’‘`"]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function compact(value) { return clean(value).replace(/\s+/g, ''); }
function safeNumber(value) { if (value === undefined || value === null || String(value).trim() === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function safeFilename(value) { return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').trim() || 'unknown'; }
function deriveSeasonFromDate(dateValue) { const dateStr = String(dateValue ?? '').trim(); if (!dateStr) return null; const yearMatch = dateStr.match(/^(\d{4})/); return yearMatch ? yearMatch[1] : null; }
function percentage(numerator, denominator) { if (!denominator) return 0; return Number(((numerator / denominator) * 100).toFixed(2)); }
function average(numerator, denominator) { if (!denominator) return 0; return Number((numerator / denominator).toFixed(2)); }
function createTeamStats(teamId, teamName) {
  return { team_id: teamId, team_name: teamName, matches: 0, wins: 0, draws: 0, losses: 0, standard_points: 0, goals_for: 0, goals_against: 0, goal_difference: 0, clean_sheets: 0, failed_to_score: 0, home: { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 }, away: { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 }, markets: { btts: 0, over_0_5: 0, over_1_5: 0, over_2_5: 0, over_3_5: 0 } };
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
  if (expected !== actual) { mismatches.push({ field: label, expected, actual }); return false; } return true;
}
function compareTeamStats(expected, actual, location) {
  const mismatches = [];
  if (!actual) { mismatches.push({ field: location, expected: 'profile exists', actual: 'missing' }); return mismatches; }
  const coreFields = ['team_id', 'team_name', 'matches', 'wins', 'draws', 'losses', 'standard_points', 'goals_for', 'goals_against', 'goal_difference', 'clean_sheets', 'failed_to_score', 'win_percentage', 'goals_per_match', 'goals_conceded_per_match'];
  for (const field of coreFields) compareValue(mismatches, `${location}.${field}`, expected[field], actual[field]);
  const venueFields = ['matches', 'wins', 'draws', 'losses', 'goals_for', 'goals_against', 'clean_sheets', 'failed_to_score', 'win_percentage', 'goals_per_match', 'goals_conceded_per_match'];
  for (const venue of ['home', 'away']) { for (const field of venueFields) compareValue(mismatches, `${location}.${venue}.${field}`, expected[venue][field], actual[venue]?.[field]); }
  const marketFields = ['btts', 'over_0_5', 'over_1_5', 'over_2_5', 'over_3_5', 'btts_percentage', 'over_0_5_percentage', 'over_1_5_percentage', 'over_2_5_percentage', 'over_3_5_percentage'];
  for (const field of marketFields) compareValue(mismatches, `${location}.markets.${field}`, expected.markets[field], actual.markets?.[field]);
  return mismatches;
}
async function run() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 8: INTELLIGENCE VALIDATION (FIXED IMPORT)');
  console.log('============================================================\n');
  if (!fs.existsSync(MASTER_FILE)) throw new Error(`MASTER file not found: ${MASTER_FILE}`);
  if (!fs.existsSync(TEAMS_INDEX_FILE)) throw new Error(`Teams index not found: ${TEAMS_INDEX_FILE}`);
  if (!fs.existsSync(SEASONAL_DIR)) throw new Error(`Seasonal intelligence directory not found: ${SEASONAL_DIR}`);
  console.log('[1/4] Loading canonical team index...');
  const teamsIndex = JSON.parse(fs.readFileSync(TEAMS_INDEX_FILE, 'utf8'));
  // Load alias dedup map like 06/07
  let aliasToKeep = new Map();
  if(fs.existsSync(FIX_PROPOSAL_PATH)){ try{ const fp=JSON.parse(fs.readFileSync(FIX_PROPOSAL_PATH,'utf8')); for(const g of fp.duplicate_match_ids||[]){ for(const id of g.ids){ if(id!==g.keep) aliasToKeep.set(id,g.keep); } } console.log(`[VALIDATION] Loaded ${fp.duplicate_match_ids?.length||0} duplicate groups - skipping ${aliasToKeep.size} alias IDs`); }catch(e){} }
  const canonicalTeamCount = Object.keys(teamsIndex).length;
  const teamNameToIdMap = new Map(); let ambiguousNameCount = 0;
  const teamNameToIds = new Map();
  for (const [teamId, profile] of Object.entries(teamsIndex)) {
    if (!profile || !profile.name) continue;
    const normalizedName = compact(profile.name);
    if (!normalizedName) continue;
    if(!teamNameToIds.has(normalizedName)) teamNameToIds.set(normalizedName, []);
    teamNameToIds.get(normalizedName).push(teamId);
  }
  for(const [name, ids] of teamNameToIds.entries()){
    if(ids.length===1){ teamNameToIdMap.set(name, ids[0]); }
    else { ambiguousNameCount++; const keep = ids[0]; teamNameToIdMap.set(name, keep); console.log(`[VALIDATION] Team alias keep: ${keep} for "${name}" duplicates: ${ids.join(',')}`); }
  }
  console.log(`   ↳ Canonical teams indexed: ${canonicalTeamCount.toLocaleString()}`);
  console.log(`   ↳ Unique mappings: ${teamNameToIdMap.size.toLocaleString()}`);
  console.log(`   ↳ Ambiguous: ${ambiguousNameCount.toLocaleString()}\n`);
  console.log('[2/4] Independently recalculating...');
  const seasonsMap = new Map(); const unresolvedTeams = new Map();
  let totalRows = 0, processedMatches = 0, explicitSeasonRows = 0, derivedSeasonRows = 0, skippedMissingSeason = 0, skippedMissingTeam = 0, skippedUnresolvedTeam = 0, skippedInvalidScore = 0, skippedSelfMatch = 0;
  let aliasSkipped=0;
  await new Promise((resolve, reject) => {
    fs.createReadStream(MASTER_FILE).pipe(csv()).on('data', row => {
        const mid = String(row.zokascore_match_id||'').trim();
        if(aliasToKeep.has(mid)){ aliasSkipped++; return; }
        totalRows++;
        let season = String(row.season ?? '').trim();
        if (season) explicitSeasonRows++; else { season = deriveSeasonFromDate(row.date); if (season) derivedSeasonRows++; else { skippedMissingSeason++; return; } }
        const homeName = String(row.home_team ?? '').trim(); const awayName = String(row.away_team ?? '').trim();
        if (!homeName || !awayName) { skippedMissingTeam++; return; }
        const homeId = teamNameToIdMap.get(compact(homeName)); const awayId = teamNameToIdMap.get(compact(awayName));
        if (!homeId) unresolvedTeams.set(homeName, (unresolvedTeams.get(homeName) || 0) + 1);
        if (!awayId) unresolvedTeams.set(awayName, (unresolvedTeams.get(awayName) || 0) + 1);
        if (!homeId || !awayId) { skippedUnresolvedTeam++; return; }
        if (homeId === awayId) { skippedSelfMatch++; return; }
        const homeScore = safeNumber(row.home_score); const awayScore = safeNumber(row.away_score);
        if (homeScore === null || awayScore === null) { skippedInvalidScore++; return; }
        const competition = String(row.competition ?? row.competition_name ?? row.league ?? 'UNKNOWN_COMPETITION').trim() || 'UNKNOWN_COMPETITION';
        if (!seasonsMap.has(season)) seasonsMap.set(season, new Map());
        const seasonMap = seasonsMap.get(season); if (!seasonMap.has(competition)) seasonMap.set(competition, {});
        const competitionData = seasonMap.get(competition);
        if (!competitionData[homeId]) competitionData[homeId] = createTeamStats(homeId, homeName);
        if (!competitionData[awayId]) competitionData[awayId] = createTeamStats(awayId, awayName);
        updateTeamStats(competitionData[homeId], homeScore, awayScore, 'home');
        updateTeamStats(competitionData[awayId], awayScore, homeScore, 'away');
        processedMatches++;
      }).on('end', resolve).on('error', reject);
  });
  console.log(`   ↳ Independently processed: ${processedMatches.toLocaleString()} (alias skipped: ${aliasSkipped})`);
  console.log(`   ↳ Skipped self: ${skippedSelfMatch} | Invalid score: ${skippedInvalidScore} | Unresolved team: ${skippedUnresolvedTeam}\n`);
  console.log('[3/4] Comparing against Step 7 artifacts...');
  const mismatches = []; let seasonsExpected = 0, seasonsFound = 0, competitionsExpected = 0, competitionsFound = 0, teamProfilesExpected = 0, teamProfilesFound = 0;
  for (const [season, competitionMap] of seasonsMap.entries()) {
    seasonsExpected++; const seasonFile = path.join(SEASONAL_DIR, `${safeFilename(season)}.json`);
    if (!fs.existsSync(seasonFile)) { mismatches.push({ type: 'missing_season_file', season }); continue; } seasonsFound++;
    let generated; try { generated = JSON.parse(fs.readFileSync(seasonFile, 'utf8')); } catch (err) { mismatches.push({ type: 'invalid_season_json', season, error: err.message }); continue; }
    const generatedCompetitions = generated.competitions || {}; const expectedCompetitionNames = new Set(competitionMap.keys()); const actualCompetitionNames = new Set(Object.keys(generatedCompetitions));
    for (const competition of expectedCompetitionNames) {
      competitionsExpected++; if (!actualCompetitionNames.has(competition)) { mismatches.push({ type: 'missing_competition', season, competition }); continue; } competitionsFound++;
      const expectedTeams = competitionMap.get(competition); const generatedCompetition = generatedCompetitions[competition];
      if (!generatedCompetition || !generatedCompetition.teams) { mismatches.push({ type: 'invalid_competition_profile', season, competition }); continue; }
      const generatedTeams = generatedCompetition.teams; const expectedTeamIds = new Set(Object.keys(expectedTeams)); const actualTeamIds = new Set(Object.keys(generatedTeams));
      for (const teamId of expectedTeamIds) {
        teamProfilesExpected++; if (!actualTeamIds.has(teamId)) { mismatches.push({ type: 'missing_team_profile', season, competition, team_id: teamId }); continue; } teamProfilesFound++;
        const expectedStats = finalizeTeamStats(expectedTeams[teamId]); const actualStats = generatedTeams[teamId];
        const teamMismatches = compareTeamStats(expectedStats, actualStats, `${season}/${competition}/${teamId}`);
        for (const mismatch of teamMismatches) mismatches.push({ type: 'statistic_mismatch', season, competition, team_id: teamId, ...mismatch });
      }
    }
  }
  console.log(`   ↳ Seasons expected/found: ${seasonsExpected}/${seasonsFound}`);
  console.log(`   ↳ Competitions expected/found: ${competitionsExpected}/${competitionsFound}`);
  console.log(`   ↳ Teams expected/found: ${teamProfilesExpected}/${teamProfilesFound}`);
  console.log(`   ↳ Mismatches: ${mismatches.length}\n`);
  console.log('[4/4] Validation report...');
  const status = mismatches.length === 0 ? 'PASS' : 'FAIL';
  const report = { generated_at: new Date().toISOString(), status, master_rows_scanned: totalRows, master_matches_processed: processedMatches, explicit_season_rows: explicitSeasonRows, derived_season_rows: derivedSeasonRows, skipped_missing_season: skippedMissingSeason, skipped_missing_team: skippedMissingTeam, skipped_unresolved_team: skippedUnresolvedTeam, skipped_self_match: skippedSelfMatch, skipped_invalid_score: skippedInvalidScore, canonical_team_indexed: canonicalTeamCount, ambiguous_canonical_names: ambiguousNameCount, seasons_expected: seasonsExpected, seasons_found: seasonsFound, competition_profiles_expected: competitionsExpected, competition_profiles_found: competitionsFound, team_profiles_expected: teamProfilesExpected, team_profiles_found: teamProfilesFound, unresolved_team_names_expected: unresolvedTeams.size, mismatch_count: mismatches.length, mismatches: mismatches.slice(0,100) };
  fs.writeFileSync(VALIDATION_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log('\n============================================================');
  console.log(` STEP 8 VALIDATION COMPLETE: ${status}`);
  console.log('============================================================');
  console.log(`Report: ${VALIDATION_FILE}\n`);
  if (status === 'FAIL') { console.log('First 5 mismatches:', JSON.stringify(mismatches.slice(0,5), null, 2)); process.exit(1); }
}
run().catch(err => { console.error('\n❌ STEP 8 FAILED'); console.error(err); process.exit(1); });
