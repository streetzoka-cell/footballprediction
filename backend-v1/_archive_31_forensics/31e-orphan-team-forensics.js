// C:\Users\COISA COMPUTERS\OneDrive\Desktop\Apk\footballprediction\backend-v1\pipeline\31e-orphan-team-forensics.js

'use strict';
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const REPORT_FILE = path.join(AUDIT_DIR, 'v2_integrity_report.json');
const OUTPUT_FILE = path.join(AUDIT_DIR, 'orphan_team_forensics_report.json');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const ENTITY_DIR = path.join(ROOT, 'data_audit', 'entity_resolution');
const CANONICAL_FILE = path.join(ENTITY_DIR, 'canonical_teams.json');
const ALIAS_FILE = path.join(ENTITY_DIR, 'team_alias_map.json');

const FILES = {
  games: path.join(SOURCE_DIR, 'games.csv'),
  appearances: path.join(SOURCE_DIR, 'appearances.csv'),
  game_events: path.join(SOURCE_DIR, 'game_events.csv'),
  players: path.join(SOURCE_DIR, 'players.csv'),
  player_valuations: path.join(SOURCE_DIR, 'player_valuations.csv'),
  ranking: path.join(SOURCE_DIR, 'ranking.csv'),
  results: path.join(SOURCE_DIR, 'results.csv'),
  matches: path.join(SOURCE_DIR, 'matches.csv'),
  goalscorers: path.join(SOURCE_DIR, 'goalscorers.csv'),
  shootouts: path.join(SOURCE_DIR, 'shootouts.csv'),
  clubs: path.join(SOURCE_DIR, 'clubs.csv')
};

const loadJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const uniqueSorted = (v) => [...new Set(v.filter(Boolean).map(x => String(x).trim()))].sort();

function cleanIntl(id) {
  let s = String(id).replace(/^INTL_/, '').replace(/_/g, ' ');
  const fixes = { 's o tom and pr ncipe': 'São Tomé and Príncipe', 'sz kely': 'Székely', 'k rp talja': 'Kárpátalja', 'd lvid k': 'Délvidék', 'ry ky': 'Ryūkyū', 'fr ya': 'Frøya', 'ynys m n': 'Ynys Môn' };
  for (const [a, b] of Object.entries(fixes)) s = s.replace(new RegExp(a, 'gi'), b);
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function readCsv(file, onRow) {
  return new Promise(resolve => {
    if (!fs.existsSync(file)) return resolve({ exists: false, rows: 0, headers: [] });
    let rows = 0, headers = [], finished = false;
    const stream = fs.createReadStream(file).pipe(csv());
    stream.on('headers', h => headers = h);
    stream.on('data', row => { rows++; try { onRow(row); } catch {} });
    stream.on('end', () => { if (!finished) { finished = true; resolve({ exists: true, rows, headers }); } });
    stream.on('error', () => { if (!finished) { finished = true; resolve({ exists: true, rows, headers }); } });
  });
}

function rawGamesIdVerification(file, orphanSet) {
  const result = { fileExists: false, idsFound: new Set(), occurrencesById: new Map(), error: null };
  if (!fs.existsSync(file)) return result;
  result.fileExists = true;
  try {
    const content = fs.readFileSync(file, 'utf8');
    const firstLineEnd = content.indexOf('\n');
    if (firstLineEnd === -1) return result;
    
    const columns = content.slice(0, firstLineEnd).replace(/\r/g, '').split(',');
    const homeIndex = columns.indexOf('home_club_id');
    const awayIndex = columns.indexOf('away_club_id');
    if (homeIndex === -1 && awayIndex === -1) { result.error = 'ID columns not found'; return result; }

    const lines = content.slice(firstLineEnd + 1).split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const fields = line.split(','); // Basic split for raw verification
      const ids = [];
      if (homeIndex >= 0 && fields[homeIndex]) ids.push(fields[homeIndex].replace(/^"|"$/g, '').trim());
      if (awayIndex >= 0 && fields[awayIndex]) ids.push(fields[awayIndex].replace(/^"|"$/g, '').trim());
      
      for (const id of ids) {
        if (orphanSet.has(id)) {
          result.idsFound.add(id);
          result.occurrencesById.set(id, (result.occurrencesById.get(id) || 0) + 1);
        }
      }
    }
  } catch (e) { result.error = e.message; }
  return result;
}

function buildEntityIndexes(canonical, aliasMap) {
  const primary = new Map(), historical = new Map(), aliases = new Map();
  for (const t of canonical) {
    if (!t?.canonical_id) continue;
    const id = String(t.canonical_id);
    if (t.primary_name) primary.set(normalize(t.primary_name), id);
    for (const n of (t.historical_names || [])) historical.set(normalize(n), id);
    for (const a of (t.aliases || [])) { const k = normalize(a); if (!primary.has(k)) aliases.set(k, id); }
  }
  for (const [n, id] of Object.entries(aliasMap || {})) aliases.set(normalize(n), String(id));
  return { primary, aliases, historical };
}

function resolveName(name, indexes) {
  const key = normalize(name);
  if (!key) return { matchType: 'REVIEW_REQUIRED', canonicalId: null };
  if (indexes.primary.has(key)) return { matchType: 'EXACT_MATCH', canonicalId: indexes.primary.get(key) };
  if (indexes.aliases.has(key)) return { matchType: 'ALIAS_MATCH', canonicalId: indexes.aliases.get(key) };
  if (indexes.historical.has(key)) return { matchType: 'HISTORICAL_NAME_MATCH', canonicalId: indexes.historical.get(key) };
  return { matchType: 'REVIEW_REQUIRED', canonicalId: null };
}

function extractIdsForSource(source, row) {
  const ids = [];
  const check = (...keys) => { for (const k of keys) if (row[k]) ids.push(String(row[k])); };
  if (source === 'games') check('home_club_id', 'away_club_id');
  if (source === 'appearances') check('player_club_id', 'current_club_id', 'club_id');
  if (source === 'game_events') check('club_id');
  if (source === 'players') check('current_club_id', 'club_id');
  if (source === 'player_valuations') check('current_club_id', 'club_id');
  if (source === 'ranking') check('club_id');
  if (['results', 'matches', 'goalscorers', 'shootouts'].includes(source)) check('home_team_id', 'away_team_id', 'home_club_id', 'away_club_id');
  return ids;
}

async function main() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  console.log('🔍 Pipeline 31e — Orphan Team Forensics\n============================================================\n');

  const report = loadJson(REPORT_FILE);
  if (!report?.informational_findings?.orphan_team_ids) throw new Error('orphan_team_ids not found in v2_integrity_report.json');

  const orphans = report.informational_findings.orphan_team_ids.map(String);
  const intl = orphans.filter(id => id.startsWith('INTL_'));
  const numeric = orphans.filter(id => /^\d+$/.test(id));
  const orphanSet = new Set(numeric);

  const canonical = loadJson(CANONICAL_FILE) || [];
  const aliasMap = loadJson(ALIAS_FILE) || {};
  const indexes = buildEntityIndexes(canonical, aliasMap);

  const numericEvidence = new Map();
  for (const id of numeric) {
    numericEvidence.set(id, {
      orphanId: id,
      type: 'NUMERIC',
      sourceEvidence: {
        games: { occurrences: 0, homeNames: new Set(), awayNames: new Set(), competitions: new Set(), seasons: new Set(), samples: [] },
        appearances: { found: false, occurrences: 0 },
        game_events: { found: false, occurrences: 0 },
        players: { found: false, occurrences: 0 },
        player_valuations: { found: false, occurrences: 0 },
        ranking: { found: false, occurrences: 0 },
        results: { found: false, occurrences: 0 },
        matches: { found: false, occurrences: 0 },
        goalscorers: { found: false, occurrences: 0 },
        shootouts: { found: false, occurrences: 0 },
        clubs: { found: false, occurrences: 0, name: null }
      }
    });
  }

  // 1. GAMES.CSV
  console.log('🔎 Scanning games.csv...');
  const gamesResult = await readCsv(FILES.games, row => {
    const homeId = String(row.home_club_id || '');
    const awayId = String(row.away_club_id || '');
    
    const processMatch = (id, side) => {
      if (orphanSet.has(id)) {
        const e = numericEvidence.get(id);
        e.sourceEvidence.games.occurrences++;
        
        const nameKey = `${side}_club_name`;
        if (row[nameKey]) e.sourceEvidence.games[side === 'home' ? 'homeNames' : 'awayNames'].add(String(row[nameKey]).trim());
        
        if (row.competition_id) e.sourceEvidence.games.competitions.add(String(row.competition_id));
        if (row.season) e.sourceEvidence.games.seasons.add(String(row.season));
        
        // Capture a raw sample of the first 3 rows to inspect exact schema
        if (e.sourceEvidence.games.samples.length < 3) {
          e.sourceEvidence.games.samples.push({ ...row });
        }
      }
    };
    
    processMatch(homeId, 'home');
    processMatch(awayId, 'away');
  });
  console.log(`   Headers detected: ${gamesResult.headers.join(', ')}\n`);

  // 2. CLUBS.CSV
  console.log('🔎 Scanning clubs.csv...');
  await readCsv(FILES.clubs, row => {
    const id = String(row.club_id || '');
    if (orphanSet.has(id)) {
      const e = numericEvidence.get(id);
      e.sourceEvidence.clubs.found = true;
      e.sourceEvidence.clubs.occurrences++;
      if (row.name) e.sourceEvidence.clubs.name = String(row.name).trim();
    }
  });

  // 3. SECONDARY SOURCES
  const secondarySources = ['appearances', 'game_events', 'players', 'player_valuations', 'ranking', 'results', 'matches', 'goalscorers', 'shootouts'];
  for (const source of secondarySources) {
    console.log(`🔎 Scanning ${source}.csv...`);
    await readCsv(FILES[source], row => {
      for (const id of extractIdsForSource(source, row)) {
        if (orphanSet.has(id)) {
          const e = numericEvidence.get(id);
          if (e.sourceEvidence[source]) {
            e.sourceEvidence[source].found = true;
            e.sourceEvidence[source].occurrences++;
          }
        }
      }
    });
  }

  // 4. RAW VERIFICATION
  console.log('\n🔬 Performing independent raw games.csv verification...');
  const rawVerification = rawGamesIdVerification(FILES.games, orphanSet);

  // 5. RESOLUTION & REPORT BUILDING
  const findings = [];

  for (const id of intl) {
    const name = cleanIntl(id);
    const res = resolveName(name, indexes);
    findings.push({
      orphanId: id, type: 'INTL', resolvedNames: [name],
      entityMatches: res.canonicalId ? [{ name, matchType: res.matchType, canonicalId: res.canonicalId }] : [],
      classification: res.matchType, canonicalMatchId: res.canonicalId,
      recommendation: res.canonicalId ? 'MAP_TO_EXISTING' : 'REVIEW_REQUIRED'
    });
  }

  for (const id of numeric) {
    const e = numericEvidence.get(id);
    const games = e.sourceEvidence.games;
    const resolvedNames = uniqueSorted([...games.homeNames, ...games.awayNames]);
    const entityMatches = resolvedNames.map(n => { const r = resolveName(n, indexes); return { name: n, matchType: r.matchType, canonicalId: r.canonicalId }; });
    const matchedIds = uniqueSorted(entityMatches.map(x => x.canonicalId));

    let classification = 'REVIEW_REQUIRED', canonicalMatchId = null;
    if (matchedIds.length === 1) {
      canonicalMatchId = matchedIds[0];
      if (entityMatches.some(x => x.matchType === 'EXACT_MATCH')) classification = 'EXACT_MATCH';
      else if (entityMatches.some(x => x.matchType === 'ALIAS_MATCH')) classification = 'ALIAS_MATCH';
      else if (entityMatches.some(x => x.matchType === 'HISTORICAL_NAME_MATCH')) classification = 'HISTORICAL_NAME_MATCH';
    } else if (matchedIds.length > 1) {
      classification = 'REVIEW_REQUIRED';
    }

    const serE = (obj) => { const r = {}; for (const [k, v] of Object.entries(obj)) { r[k] = v instanceof Set ? [...v] : v; } return r; };

    findings.push({
      orphanId: id, type: 'NUMERIC',
      sourceEvidence: {
        games: { ...serE(games), rawVerificationOccurrences: rawVerification.occurrencesById.get(id) || 0 },
        appearances: e.sourceEvidence.appearances,
        game_events: e.sourceEvidence.game_events,
        players: e.sourceEvidence.players,
        player_valuations: e.sourceEvidence.player_valuations,
        ranking: e.sourceEvidence.ranking,
        results: e.sourceEvidence.results,
        matches: e.sourceEvidence.matches,
        goalscorers: e.sourceEvidence.goalscorers,
        shootouts: e.sourceEvidence.shootouts,
        clubs: e.sourceEvidence.clubs
      },
      resolvedNames, entityMatches, classification, canonicalMatchId,
      recommendation: canonicalMatchId ? 'MAP_TO_EXISTING' : 'REVIEW_REQUIRED'
    });
  }

  const summary = {
    totalOrphans: findings.length, intlOrphans: intl.length, numericOrphans: numeric.length,
    exactMatches: findings.filter(x => x.classification === 'EXACT_MATCH').length,
    aliasMatches: findings.filter(x => x.classification === 'ALIAS_MATCH').length,
    historicalMatches: findings.filter(x => x.classification === 'HISTORICAL_NAME_MATCH').length,
    reviewRequired: findings.filter(x => x.classification === 'REVIEW_REQUIRED').length,
    numericFoundInGamesParsed: numeric.filter(id => numericEvidence.get(id).sourceEvidence.games.occurrences > 0).length,
    numericFoundInGamesRaw: rawVerification.idsFound.size,
    numericFoundInClubs: numeric.filter(id => numericEvidence.get(id).sourceEvidence.clubs.found).length,
    numericWithResolvedNames: findings.filter(x => x.type === 'NUMERIC' && x.resolvedNames.length > 0).length,
    numericWithoutResolvedNames: findings.filter(x => x.type === 'NUMERIC' && x.resolvedNames.length === 0).length
  };

  const sourceCoverage = {};
  const sourcesToCheck = ['games', 'appearances', 'game_events', 'players', 'player_valuations', 'ranking', 'results', 'matches', 'goalscorers', 'shootouts', 'clubs'];
  for (const source of sourcesToCheck) {
    sourceCoverage[source] = numeric.filter(id => {
      const ev = numericEvidence.get(id).sourceEvidence[source];
      return ev && (ev.occurrences > 0 || ev.found === true);
    }).length;
  }

  const output = { generatedAt: new Date().toISOString(), readOnly: true, pipeline: '31e', summary, sourceCoverage, findings };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('\n============================================================\n PIPELINE 31e COMPLETE\n============================================================');
  console.log(`Total Orphans:                 ${summary.totalOrphans}`);
  console.log(`INTL Orphans:                  ${summary.intlOrphans}`);
  console.log(`Numeric Orphans:               ${summary.numericOrphans}\n`);
  console.log(`Numeric in games.csv (parsed): ${summary.numericFoundInGamesParsed}`);
  console.log(`Numeric in games.csv (raw):    ${summary.numericFoundInGamesRaw}`);
  console.log(`Numeric in clubs.csv:          ${summary.numericFoundInClubs}\n`);
  console.log(`Exact Matches:                 ${summary.exactMatches}`);
  console.log(`Alias Matches:                 ${summary.aliasMatches}`);
  console.log(`Historical Matches:            ${summary.historicalMatches}`);
  console.log(`Review Required:               ${summary.reviewRequired}\n`);
  console.log(`With Historical Names:         ${summary.numericWithResolvedNames}`);
  console.log(`Without Historical Names:      ${summary.numericWithoutResolvedNames}\n`);
  console.log(`📄 ${OUTPUT_FILE}`);
  console.log('🛡️ READ-ONLY: no source/entity files modified.');
}

main().catch(e => { console.error('❌ Pipeline 31e failed:', e.stack || e.message); process.exit(1); });