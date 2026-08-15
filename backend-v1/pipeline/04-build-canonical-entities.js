'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const ENTITY_DIR = path.join(ROOT, 'data_audit', 'entity_resolution');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function generateId(input) {
  return crypto.createHash('sha1').update(input).digest('hex').substring(0, 10);
}

function normalizeName(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Targeted repair for known mojibake sequences
function repairMojibake(text) {
  if (!text) return '';
  return text
    .replace(/Ã§/g, 'ç')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¨/g, 'è')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã /g, 'à')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã­/g, 'í')
    .replace(/Ã¶/g, 'ö')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ã±/g, 'ñ');
}

function loadCsv(filename) {
  return new Promise((resolve, reject) => {
    const results = [];
    const filePath = path.join(SOURCE_DIR, filename);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Missing source file: ${filePath}`);
      return resolve([]);
    }

    fs.createReadStream(filePath, { encoding: 'utf8' })
      .pipe(csv())
      .on('data', (data) => {
        if (
          filename === 'former_names.csv' &&
          data._0 === 'current' &&
          data._1 === 'former'
        ) {
          return;
        }

        if (
          filename === 'former_names.csv' &&
          data._0 !== undefined
        ) {
          results.push({
            current: repairMojibake(data._0),
            former: repairMojibake(data._1),
            start_date: data._2 || null,
            end_date: data._3 || null
          });
          return;
        }

        results.push(data);
      })
      .on('end', () => {
        console.log(`   ↳ Loaded ${results.length.toLocaleString()} rows from ${filename}`);
        resolve(results);
      })
      .on('error', (err) => {
        console.error(`❌ Failed reading ${filename}:`, err.message);
        reject(err);
      });
  });
}

// Common national team aliases
const NATIONAL_ALIASES = {
  'turkiye': 'turkey',
  'bosnia-herzegovina': 'bosnia and herzegovina',
  'czechia': 'czech republic',
  'north macedonia': 'macedonia',
  'cape verde': 'cabo verde',
  'ivory coast': "cote d'ivoire",
  'eswatini': 'swaziland',
  'timor-leste': 'east timor'
};

async function buildTeams() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 4.1: UPGRADED ENTITY RESOLUTION');
  console.log('============================================================\n');

  ensureDir(ENTITY_DIR);

  const entityMap = new Map();
  const aliasMap = {};

  let clubsCount = 0;
  let nationsCount = 0;

  // 1. Load Clubs from clubs.csv
  console.log('🔍 Indexing Clubs from clubs.csv...');
  const clubs = await loadCsv('clubs.csv');
  for (const club of clubs) {
    const name = club.name?.trim();
    if (!name) continue;

    const normName = normalizeName(name);
    if (!entityMap.has(normName)) {
      const team = {
        canonical_id: club.club_id || generateId(normName),
        primary_name: name,
        type: 'club',
        aliases: new Set([name]),
        historical_names: []
      };
      entityMap.set(normName, team);
      aliasMap[normName] = team.canonical_id;
      clubsCount++;
    }
  }

  // 2. Discover Additional Clubs from games.csv
  console.log('\n🔍 Discovering additional clubs from games.csv...');
  const games = await loadCsv('games.csv');
  let newClubs = 0;
  for (const match of games) {
    const homeTeam = match.home_club_name?.trim();
    const awayTeam = match.away_club_name?.trim();
    const homeId = match.home_club_id;
    const awayId = match.away_club_id;

    if (homeTeam && homeId) {
      const normHome = normalizeName(homeTeam);
      if (!entityMap.has(normHome)) {
        const team = {
          canonical_id: homeId, // Use TM ID as canonical ID
          primary_name: homeTeam,
          type: 'club',
          aliases: new Set([homeTeam]),
          historical_names: []
        };
        entityMap.set(normHome, team);
        aliasMap[normHome] = team.canonical_id;
        newClubs++;
      } else {
        // Ensure the alias is added if the entity exists but under a different name
        const team = entityMap.get(normHome);
        if (team && !team.aliases.has(homeTeam)) {
          team.aliases.add(homeTeam);
          aliasMap[normHome] = team.canonical_id;
        }
      }
    }

    if (awayTeam && awayId) {
      const normAway = normalizeName(awayTeam);
      if (!entityMap.has(normAway)) {
        const team = {
          canonical_id: awayId,
          primary_name: awayTeam,
          type: 'club',
          aliases: new Set([awayTeam]),
          historical_names: []
        };
        entityMap.set(normAway, team);
        aliasMap[normAway] = team.canonical_id;
        newClubs++;
      } else {
        const team = entityMap.get(normAway);
        if (team && !team.aliases.has(awayTeam)) {
          team.aliases.add(awayTeam);
          aliasMap[normAway] = team.canonical_id;
        }
      }
    }
  }
  clubsCount += newClubs;
  console.log(`   ↳ Discovered ${newClubs.toLocaleString()} new clubs from games.csv`);

  // 3. Load National Teams from results_update.csv
  console.log('\n🔍 Indexing National Teams from results_update.csv...');
  const results = await loadCsv('results_update.csv');
  for (const match of results) {
    const home = match.home_team?.trim();
    const away = match.away_team?.trim();
    
    if (home) {
      const normHome = normalizeName(home);
      if (!entityMap.has(normHome)) {
        const team = {
          canonical_id: generateId(normHome),
          primary_name: home,
          type: 'national',
          aliases: new Set([home]),
          historical_names: []
        };
        entityMap.set(normHome, team);
        aliasMap[normHome] = team.canonical_id;
        nationsCount++;
      }
    }
    
    if (away) {
      const normAway = normalizeName(away);
      if (!entityMap.has(normAway)) {
        const team = {
          canonical_id: generateId(normAway),
          primary_name: away,
          type: 'national',
          aliases: new Set([away]),
          historical_names: []
        };
        entityMap.set(normAway, team);
        aliasMap[normAway] = team.canonical_id;
        nationsCount++;
      }
    }
  }

  // 4. Apply National Aliases (e.g., Turkiye -> Turkey)
  console.log('\n🔍 Applying national team aliases...');
  for (const [alias, canonical] of Object.entries(NATIONAL_ALIASES)) {
    const normAlias = normalizeName(alias);
    const normCanonical = normalizeName(canonical);
    const team = entityMap.get(normCanonical);
    if (team) {
      team.aliases.add(alias);
      aliasMap[normAlias] = team.canonical_id;
    }
  }

  // 5. Apply Historical Former Names
  console.log('\n🔍 Applying historical former names...');
  const formerNames = await loadCsv('former_names.csv');
  
  const unresolvedHistorical = [];
  let historyLinks = 0;

  if (formerNames.length === 0) {
    console.warn('⚠️ WARNING: former_names.csv contains 0 rows.');
  } else {
    console.log(`📚 Historical rename records loaded: ${formerNames.length.toLocaleString()}`);
  }

  for (const row of formerNames) {
    const current = row.current?.trim();
    const former = row.former?.trim();
    const start_date = row.start_date?.trim() || null;
    const end_date = row.end_date?.trim() || null;

    if (!current || !former) continue;

    const currentNorm = normalizeName(current);
    const formerNorm = normalizeName(former);

    const team = entityMap.get(currentNorm);
    if (team) {
      team.historical_names.push({
        name: former,
        start_date,
        end_date
      });
      team.aliases.add(former);
      
      if (!aliasMap[formerNorm]) {
        aliasMap[formerNorm] = team.canonical_id;
      }
      historyLinks++;
    } else {
      unresolvedHistorical.push({
        current_name: current,
        former_name: former,
        start_date,
        end_date
      });
    }
  }

  // 6. Finalize and Write Output
  console.log('\n⚙️ Finalizing canonical team map...');
  const canonicalTeams = [];
  const seenIds = new Set();

  for (const [normName, team] of entityMap.entries()) {
    if (!seenIds.has(team.canonical_id)) {
      canonicalTeams.push({
        canonical_id: team.canonical_id,
        primary_name: team.primary_name,
        type: team.type,
        aliases: Array.from(team.aliases),
        historical_names: team.historical_names
      });
      seenIds.add(team.canonical_id);
    }
  }

  const teamsPath = path.join(ENTITY_DIR, 'canonical_teams.json');
  fs.writeFileSync(teamsPath, JSON.stringify(canonicalTeams, null, 2), 'utf8');

  const aliasPath = path.join(ENTITY_DIR, 'team_alias_map.json');
  fs.writeFileSync(aliasPath, JSON.stringify(aliasMap, null, 2), 'utf8');

  const unresolvedPath = path.join(ENTITY_DIR, 'unresolved_historical_names.json');
  fs.writeFileSync(unresolvedPath, JSON.stringify(unresolvedHistorical, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log(' STEP 4.1 COMPLETE');
  console.log('============================================================');
  console.log(`✅ Canonical Clubs Found:      ${clubsCount}`);
  console.log(`✅ Canonical National Teams:   ${nationsCount}`);
  console.log(`✅ Historical Names Linked:    ${historyLinks}`);
  console.log(`⚠️ Unresolved Historical Names: ${unresolvedHistorical.length}`);
  console.log(`📁 Master List:   ${teamsPath}`);
  console.log(`📁 Lookup Map:    ${aliasPath}`);
  console.log('\n🔒 SOURCE DATA WAS NOT MODIFIED.');
}

buildTeams().catch(err => {
  console.error('❌ Entity Resolution Failed:', err);
  process.exit(1);
});