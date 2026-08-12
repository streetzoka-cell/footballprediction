// backend-v1/scripts/audit-team-history.js
const fs = require('fs');
const path = require('path');
const { TeamMatcher, normalize } = require('../src/services/TeamMatcher');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history', 'clubs');
const FIXTURES_DIR = path.join(process.cwd(), 'public_data', 'fixtures');
const CLUBS_CSV = path.join(process.cwd(), 'clubs.csv');
const FORMER_NAMES_CSV = path.join(process.cwd(), 'former_names.csv');

const VALID_SEASONS = ['2018_2019', '2019_2020', '2020_2021', '2021_2022', '2022_2023', '2023_2024', '2024_2025'];

function getTodayStr() { return new Date().toISOString().split('T')[0]; }

function findMatchesFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) findMatchesFiles(filePath, fileList);
    else if (file === 'matches.json') fileList.push(filePath);
  }
  return fileList;
}

console.log(`[Audit] Scanning historical database for ${VALID_SEASONS.length} seasons...`);

const matcher = new TeamMatcher();
const { clubIdByNormName, aliasesByTeamId } = matcher.loadFromCSVs(CLUBS_CSV, FORMER_NAMES_CSV);

console.log(`[Audit] Loaded ${clubIdByNormName.size} club IDs from clubs.csv`);
console.log(`[Audit] Loaded ${aliasesByTeamId.size} teams with former-name aliases`);

const matchesFiles = findMatchesFiles(HISTORY_DIR);
let totalMatchesIndexed = 0;

for (const file of matchesFiles) {
  const parts = file.split(path.sep);
  const season = parts[parts.length - 2];
  if (!VALID_SEASONS.includes(season)) continue;

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed?.matches?.length) continue;

    for (const m of parsed.matches) {
      if (!m.home_team || !m.away_team) continue;
      const leagueName = `${parts[parts.length - 4].replace(/_/g, ' ')} ${parts[parts.length - 3].replace(/_/g, ' ')}`;

      const homeId = clubIdByNormName.get(normalize(m.home_team));
      const awayId = clubIdByNormName.get(normalize(m.away_team));

      matcher.addTeam(m.home_team, {
        teamId: homeId || m.home_team_id || null,
        aliases: homeId ? (aliasesByTeamId.get(String(homeId)) || []) : [],
        leagues: [leagueName], matches: 1,
      });

      matcher.addTeam(m.away_team, {
        teamId: awayId || m.away_team_id || null,
        aliases: awayId ? (aliasesByTeamId.get(String(awayId)) || []) : [],
        leagues: [leagueName], matches: 1,
      });
      totalMatchesIndexed++;
    }
  } catch (e) {}
}

console.log(`[Audit] Indexed ${matcher.size} unique historical teams from ${totalMatchesIndexed} matches.\n`);

if (matcher.warnings.length) {
  console.log(`[Audit] ⚠️  ${matcher.warnings.length} data quality warnings:`);
  matcher.warnings.slice(0, 10).forEach(w => console.log(`       ${w}`));
  console.log();
}

const todayStr = getTodayStr();
const fixturesPath = path.join(FIXTURES_DIR, `${todayStr}.json`);

if (!fs.existsSync(fixturesPath)) {
  console.error(`[Audit] No fixtures file found for ${todayStr}. Exiting.`);
  process.exit(1);
}

const fixturesRaw = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
const todaysFixtures = fixturesRaw.data || fixturesRaw.matches || [];

console.log(`[Audit] Resolving ${todaysFixtures.length} live fixtures against historical database...\n`);
console.log('─'.repeat(115));
console.log(' LIVE TEAM'.padEnd(24) + '│' + 'STATUS'.padEnd(14) + '│' + 'SCORE'.padEnd(7) + '│' + 'HISTORICAL MATCH');
console.log('─'.repeat(115));

const stats = { ID: 0, EXACT: 0, ALIAS: 0, STRONG: 0, REVIEW: 0, NO: 0 };

function resolveTeam(name, teamId) {
  if (!name) return null;
  const result = matcher.resolve(name, { teamId });
  if (!result) { stats.NO++; return null; }
  stats[result.type] = (stats[result.type] || 0) + 1;
  return result;
}

function formatStatus(type) {
  switch (type) {
    case 'ID':     return '🟢 ID    ';
    case 'EXACT':  return '✅ EXACT ';
    case 'ALIAS':  return '✅ ALIAS ';
    case 'STRONG': return '🟡 STRONG';
    case 'REVIEW': return '🟠 REVIEW';
    default:       return '❌ NO    ';
  }
}

for (const fx of todaysFixtures) {
  const homeName = fx.homeTeam?.name || fx.homeName;
  const awayName = fx.awayTeam?.name || fx.awayName;
  const homeId = fx.homeTeam?.id || fx.homeTeamId;
  const awayId = fx.awayTeam?.id || fx.awayTeamId;

  if (!homeName || !awayName) continue;

  const homeMatch = resolveTeam(homeName, homeId);
  const awayMatch = resolveTeam(awayName, awayId);

  const hStatus = homeMatch ? formatStatus(homeMatch.type) : '❌ NO    ';
  const aStatus = awayMatch ? formatStatus(awayMatch.type) : '❌ NO    ';
  const hScore = homeMatch ? homeMatch.score.toFixed(2) : ' —  ';
  const aScore = awayMatch ? awayMatch.score.toFixed(2) : ' —  ';

  console.log(` ${(homeName || '').substring(0, 22).padEnd(22)} │ ${hStatus} │ ${hScore} │ ${(homeMatch?.name || 'N/A').substring(0, 28).padEnd(28)}`);
  console.log(` ${(awayName || '').substring(0, 22).padEnd(22)} │ ${aStatus} │ ${aScore} │ ${(awayMatch?.name || 'N/A').substring(0, 28).padEnd(28)}`);
  console.log('─'.repeat(115));
}

const totalTeams = todaysFixtures.length * 2;
const resolved = totalTeams - stats.NO;
const autoSafe = totalTeams - stats.NO - stats.REVIEW;

console.log(`
╔════════════════════════════════════════════════════════════════╗
║  HISTORICAL TEAM RESOLUTION SUMMARY                           ║
╠════════════════════════════════════════════════════════════════╣
║  Historical database:   ${String(matcher.size).padStart(6)} teams             ║
║  Fixtures scanned:      ${String(todaysFixtures.length).padStart(6)} fixtures            ║
║  Teams attempted:       ${String(totalTeams).padStart(6)} teams               ║
╠════════════════════════════════════════════════════════════════╣
║  🟢 ID resolved:        ${String(stats.ID).padStart(6)}                       ║
║  ✅ EXACT normalized:   ${String(stats.EXACT).padStart(6)}                       ║
║  ✅ ALIAS matched:      ${String(stats.ALIAS).padStart(6)}                       ║
║  🟡 STRONG fuzzy (≥.85):${String(stats.STRONG).padStart(6)}                       ║
║  🟠 REVIEW fuzzy (.60+):${String(stats.REVIEW).padStart(6)}                       ║
║  ❌ No match:           ${String(stats.NO).padStart(6)}                       ║
╠════════════════════════════════════════════════════════════════╣
║  Coverage:              ${(resolved / totalTeams * 100).toFixed(1).padStart(5)}% (${resolved}/${totalTeams})           ║
║  Auto-safe for engine:  ${String(autoSafe).padStart(5)} (excludes REVIEW)   ║
╚════════════════════════════════════════════════════════════════╝

  🟠 REVIEW matches need manual alias mapping before entering ZIE/KIM.
  ❌ NO matches indicate genuine gaps in historical data.
`);