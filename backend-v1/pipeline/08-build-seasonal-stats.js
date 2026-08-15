'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const V2_HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const V2_SEASONAL_DIR = path.join(ROOT, 'public_data_v2', 'stats', 'seasonal');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) walkDir(fullPath, callback);
    else if (file.endsWith('.json')) callback(fullPath);
  }
}

async function buildSeasonalStats() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 8: RICH SEASONAL INTELLIGENCE');
  console.log('============================================================\n');

  ensureDir(V2_SEASONAL_DIR);

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

  console.log('🔍 Loading V2 match backbone into memory...');
  const allMatches = [];
  walkDir(V2_HISTORY_DIR, (filePath) => {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data.matches)) {
        allMatches.push(...data.matches);
      }
    } catch (e) { /* ignore parse errors */ }
  });
  console.log(`   ↳ ${allMatches.length.toLocaleString()} matches loaded.\n`);

  // Group matches by season_key
  const seasonsMap = new Map();

  for (const match of allMatches) {
    const { season, match_id, home_score, away_score } = match;

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
    
    if (!season || !home_team_id || !away_team_id || isNaN(hs) || isNaN(as)) continue;

    if (!seasonsMap.has(season)) {
      seasonsMap.set(season, {});
    }

    const seasonData = seasonsMap.get(season);

    // Initialize teams if missing
    if (!seasonData[home_team_id]) {
      seasonData[home_team_id] = {
        matches: 0, wins: 0, draws: 0, losses: 0, standard_points: 0,
        goals_for: 0, goals_against: 0, 
        clean_sheets: 0, failed_to_score: 0,
        home: { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 },
        away: { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 },
        markets: { btts: 0, over_0_5: 0, over_1_5: 0, over_2_5: 0, over_3_5: 0 }
      };
    }
    
    if (!seasonData[away_team_id]) {
      seasonData[away_team_id] = {
        matches: 0, wins: 0, draws: 0, losses: 0, standard_points: 0,
        goals_for: 0, goals_against: 0, 
        clean_sheets: 0, failed_to_score: 0,
        home: { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 },
        away: { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, clean_sheets: 0, failed_to_score: 0 },
        markets: { btts: 0, over_0_5: 0, over_1_5: 0, over_2_5: 0, over_3_5: 0 }
      };
    }

    const homeStats = seasonData[home_team_id];
    const awayStats = seasonData[away_team_id];

    const totalGoals = hs + as;

    // --- HOME TEAM UPDATE ---
    homeStats.matches++;
    homeStats.goals_for += hs;
    homeStats.goals_against += as;
    homeStats.home.matches++;
    homeStats.home.goals_for += hs;
    homeStats.home.goals_against += as;

    if (hs > as) {
      homeStats.wins++; homeStats.standard_points += 3;
      homeStats.home.wins++;
    } else if (hs < as) {
      homeStats.losses++;
      homeStats.home.losses++;
    } else {
      homeStats.draws++; homeStats.standard_points += 1;
      homeStats.home.draws++;
    }

    if (as === 0) { homeStats.clean_sheets++; homeStats.home.clean_sheets++; }
    if (hs === 0) { homeStats.failed_to_score++; homeStats.home.failed_to_score++; }

    // --- AWAY TEAM UPDATE ---
    awayStats.matches++;
    awayStats.goals_for += as;
    awayStats.goals_against += hs;
    awayStats.away.matches++;
    awayStats.away.goals_for += as;
    awayStats.away.goals_against += hs;

    if (as > hs) {
      awayStats.wins++; awayStats.standard_points += 3;
      awayStats.away.wins++;
    } else if (as < hs) {
      awayStats.losses++;
      awayStats.away.losses++;
    } else {
      awayStats.draws++; awayStats.standard_points += 1;
      awayStats.away.draws++;
    }

    if (hs === 0) { awayStats.clean_sheets++; awayStats.away.clean_sheets++; }
    if (as === 0) { awayStats.failed_to_score++; awayStats.away.failed_to_score++; }

    // --- MARKETS UPDATE (Both Teams) ---
    if (hs > 0 && as > 0) {
      homeStats.markets.btts++;
      awayStats.markets.btts++;
    }
    if (totalGoals > 0) { homeStats.markets.over_0_5++; awayStats.markets.over_0_5++; }
    if (totalGoals > 1) { homeStats.markets.over_1_5++; awayStats.markets.over_1_5++; }
    if (totalGoals > 2) { homeStats.markets.over_2_5++; awayStats.markets.over_2_5++; }
    if (totalGoals > 3) { homeStats.markets.over_3_5++; awayStats.markets.over_3_5++; }
  }

  console.log('⚙️ Writing Rich Seasonal Statistics...');
  let seasonCount = 0;

  for (const [seasonKey, teams] of seasonsMap.entries()) {
    const seasonFilePath = path.join(V2_SEASONAL_DIR, `${seasonKey}.json`);
    
    const finalData = {};
    for (const [teamId, stats] of Object.entries(teams)) {
      // Derived Metrics & Averages
      stats.goal_difference = stats.goals_for - stats.goals_against;
      stats.win_percentage = stats.matches > 0 ? Number(((stats.wins / stats.matches) * 100).toFixed(2)) : 0;
      stats.goals_per_match = stats.matches > 0 ? Number((stats.goals_for / stats.matches).toFixed(2)) : 0;
      stats.goals_conceded_per_match = stats.matches > 0 ? Number((stats.goals_against / stats.matches).toFixed(2)) : 0;
      
      // Home Averages
      stats.home.win_percentage = stats.home.matches > 0 ? Number(((stats.home.wins / stats.home.matches) * 100).toFixed(2)) : 0;
      stats.home.goals_per_match = stats.home.matches > 0 ? Number((stats.home.goals_for / stats.home.matches).toFixed(2)) : 0;
      
      // Away Averages
      stats.away.win_percentage = stats.away.matches > 0 ? Number(((stats.away.wins / stats.away.matches) * 100).toFixed(2)) : 0;
      stats.away.goals_per_match = stats.away.matches > 0 ? Number((stats.away.goals_for / stats.away.matches).toFixed(2)) : 0;

      // Market Percentages
      stats.markets.btts_percentage = stats.matches > 0 ? Number(((stats.markets.btts / stats.matches) * 100).toFixed(2)) : 0;
      stats.markets.over_0_5_percentage = stats.matches > 0 ? Number(((stats.markets.over_0_5 / stats.matches) * 100).toFixed(2)) : 0;
      stats.markets.over_1_5_percentage = stats.matches > 0 ? Number(((stats.markets.over_1_5 / stats.matches) * 100).toFixed(2)) : 0;
      stats.markets.over_2_5_percentage = stats.matches > 0 ? Number(((stats.markets.over_2_5 / stats.matches) * 100).toFixed(2)) : 0;
      stats.markets.over_3_5_percentage = stats.matches > 0 ? Number(((stats.markets.over_3_5 / stats.matches) * 100).toFixed(2)) : 0;
      
      finalData[teamId] = stats;
    }

    fs.writeFileSync(seasonFilePath, JSON.stringify(finalData, null, 2), 'utf8');
    seasonCount++;
  }

  console.log(`✅ Wrote ${seasonCount} rich seasonal stat files.`);
  console.log('\n============================================================');
  console.log(' STEP 8 COMPLETE');
  console.log('============================================================');
  console.log(`📁 Seasonal Stats Directory: ${V2_SEASONAL_DIR}`);
  console.log('\n🔒 V2 MATCH DATA WAS NOT MODIFIED.');
}

buildSeasonalStats().catch(err => {
  console.error('❌ Seasonal Stats Build Failed:', err);
  process.exit(1);
});