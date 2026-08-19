'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const INTEL_DIR = path.join(ROOT, 'data', 'intelligence', 'seasonal');

const MASTER_FILE = path.join(DATA_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv');
const TEAMS_INDEX_FILE = path.join(INDEX_DIR, 'teams-index.json');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function clean(value) { return String(value ?? '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[.'’‘"`]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function compact(value) { return clean(value).replace(/\s+/g, ''); }
function safeNumber(value) { if (value === undefined || value === null || String(value).trim() === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function safeFilename(value) { return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').trim() || 'unknown'; }
function percentage(numerator, denominator) { if (!denominator) return 0; return Number(((numerator / denominator) * 100).toFixed(2)); }
function average(numerator, denominator) { if (!denominator) return 0; return Number((numerator / denominator).toFixed(2)); }
function deriveSeasonFromDate(dateValue) { const dateStr = String(dateValue ?? '').trim(); if (!dateStr) return null; const yearMatch = dateStr.match(/^(\d{4})/); return yearMatch ? yearMatch[1] : null; }

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

async function run() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 7: SEASONAL INTELLIGENCE');
  console.log('============================================================\n');

  if (!fs.existsSync(MASTER_FILE)) throw new Error(`MASTER file not found: ${MASTER_FILE}`);
  if (!fs.existsSync(TEAMS_INDEX_FILE)) throw new Error(`Teams index not found: ${TEAMS_INDEX_FILE}`);
  ensureDir(INTEL_DIR);

  console.log('[1/3] Loading canonical team index...');
  const teamsIndex = JSON.parse(fs.readFileSync(TEAMS_INDEX_FILE, 'utf8'));
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
  console.log(`   ↳ Ambiguous canonical names: ${ambiguousNameCount.toLocaleString()}\n`);

  console.log('[2/3] Aggregating seasonal statistics from MASTER...');
  const seasonsMap = new Map();
  const unresolvedTeams = new Map();

  let totalRows = 0, processedMatches = 0, skippedMissingSeason = 0, derivedSeasonFromDate = 0, skippedMissingDateForSeason = 0;
  let skippedMissingTeam = 0, skippedUnresolvedTeam = 0, skippedInvalidScore = 0, skippedSelfMatch = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(MASTER_FILE)
      .pipe(csv())
      .on('data', row => {
        totalRows++;
        let season = String(row.season ?? '').trim();
        if (!season) {
          skippedMissingSeason++;
          season = deriveSeasonFromDate(row.date);
          if (season) derivedSeasonFromDate++; else { skippedMissingDateForSeason++; return; }
        }

        const homeName = String(row.home_team ?? '').trim();
        const awayName = String(row.away_team ?? '').trim();
        if (!homeName || !awayName) { skippedMissingTeam++; return; }

        const homeId = teamNameToIdMap.get(compact(homeName));
        const awayId = teamNameToIdMap.get(compact(awayName));

        if (!homeId) unresolvedTeams.set(homeName, (unresolvedTeams.get(homeName) || 0) + 1);
        if (!awayId) unresolvedTeams.set(awayName, (unresolvedTeams.get(awayName) || 0) + 1);
        if (!homeId || !awayId) { skippedUnresolvedTeam++; return; }

        // SELF-MATCH SKIP
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

  console.log(`   ↳ Matches processed: ${processedMatches.toLocaleString()}`);
  console.log(`   ↳ Skipped (Self-match): ${skippedSelfMatch.toLocaleString()}`);
  console.log(`   ↳ Skipped (Unresolved team): ${skippedUnresolvedTeam.toLocaleString()}\n`);

  console.log('[3/3] Writing seasonal intelligence...');
  let seasonFilesWritten = 0, competitionProfilesWritten = 0, teamProfilesWritten = 0;

  for (const [season, competitionMap] of seasonsMap.entries()) {
    const finalData = { season, competitions: {} };
    for (const [competition, teams] of competitionMap.entries()) {
      const competitionData = { competition, teams: {} };
      for (const [teamId, stats] of Object.entries(teams)) {
        competitionData.teams[teamId] = finalizeTeamStats(stats);
        teamProfilesWritten++;
      }
      finalData.competitions[competition] = competitionData;
      competitionProfilesWritten++;
    }
    fs.writeFileSync(path.join(INTEL_DIR, `${safeFilename(season)}.json`), JSON.stringify(finalData, null, 2), 'utf8');
    seasonFilesWritten++;
  }

  const unresolvedReport = {
    generated_at: new Date().toISOString(),
    total_unresolved_names: unresolvedTeams.size,
    unresolved_teams: [...unresolvedTeams.entries()].sort((a, b) => b[1] - a[1]).map(([name, references]) => ({ name, references }))
  };
  fs.writeFileSync(path.join(INTEL_DIR, 'unresolved-team-residuals.json'), JSON.stringify(unresolvedReport, null, 2), 'utf8');

  console.log(`   ↳ Season files written: ${seasonFilesWritten.toLocaleString()}`);
  console.log(`   ↳ Team profiles: ${teamProfilesWritten.toLocaleString()}`);
  console.log(`   ↳ Unresolved team names: ${unresolvedTeams.size.toLocaleString()}`);
  console.log('\n============================================================');
  console.log(' STEP 7 COMPLETE');
  console.log('============================================================');
  console.log('🔒 ZOKASCORE_FINAL was NOT modified.\n');
}

run().catch(err => {
  console.error('\n============================================================');
  console.error('❌ STEP 7 FAILED');
  console.error('============================================================');
  console.error(err);
  process.exit(1);
});