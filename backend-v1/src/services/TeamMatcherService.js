const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { TeamMatcher, normalize } = require('./TeamMatcher');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history', 'clubs');
const CLUBS_CSV = path.join(process.cwd(), 'clubs.csv');
const FORMER_NAMES_CSV = path.join(process.cwd(), 'former_names.csv');
const IDENTITY_MAP_PATH = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'aliases', 'team_identity_map.json');
const MANUAL_ALIASES_PATH = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'aliases', 'team_aliases.json');
const TEAM_IDENTITY_PATH = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'teams', 'team_identity.json');

let matcherInstance = null;
let identityMap = null;
let manualAliases = null;
let teamIdentityRegistry = null;

function findMatchesFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) findMatchesFiles(filePath, fileList);
    else if (file === 'matches.json') fileList.push(filePath);
  }
  return fileList;
}

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    logger.warn(`[TeamMatcherService] Failed to parse ${filePath}: ${e.message}`);
  }
  return null;
}

function getMatcher() {
  if (matcherInstance) return matcherInstance;
  
  logger.info('[TeamMatcherService] Initializing TeamMatcher (this may take a few seconds)...');
  matcherInstance = new TeamMatcher();
  
  identityMap = loadJson(IDENTITY_MAP_PATH) || {};
  manualAliases = loadJson(MANUAL_ALIASES_PATH) || {};
  teamIdentityRegistry = loadJson(TEAM_IDENTITY_PATH) || {};
  
  logger.info(`[TeamMatcherService] Loaded ${Object.keys(identityMap).length} pre-calculated mappings.`);
  logger.info(`[TeamMatcherService] Loaded ${Object.keys(manualAliases).length} manual aliases/blocklists.`);
  logger.info(`[TeamMatcherService] Loaded ${Object.keys(teamIdentityRegistry).length} Gold Standard ID mappings.`);
  
  const { clubIdByNormName, aliasesByTeamId } = matcherInstance.loadFromCSVs(CLUBS_CSV, FORMER_NAMES_CSV);
  
  const validSeasons = ['2018_2019', '2019_2020', '2020_2021', '2021_2022', '2022_2023', '2023_2024', '2024_2025'];
  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  
  for (const file of matchesFiles) {
    const parts = file.split(path.sep);
    const season = parts[parts.length - 2];
    if (!validSeasons.includes(season)) continue;

    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!parsed?.matches?.length) continue;

      for (const m of parsed.matches) {
        if (!m.home_team || !m.away_team) continue;
        
        const homeId = clubIdByNormName.get(normalize(m.home_team));
        const awayId = clubIdByNormName.get(normalize(m.away_team));

        matcherInstance.addTeam(m.home_team, {
          teamId: homeId || m.home_team_id || null,
          aliases: homeId ? (aliasesByTeamId.get(String(homeId)) || []) : [],
          leagues: [`${parts[parts.length - 4]} ${parts[parts.length - 3]}`],
          matches: 1,
        });
        matcherInstance.addTeam(m.away_team, {
          teamId: awayId || m.away_team_id || null,
          aliases: awayId ? (aliasesByTeamId.get(String(awayId)) || []) : [],
          leagues: [`${parts[parts.length - 4]} ${parts[parts.length - 3]}`],
          matches: 1,
        });
      }
    } catch (e) {}
  }
  
  logger.info(`[TeamMatcherService] TeamMatcher initialized with ${matcherInstance.size} teams.`);
  return matcherInstance;
}

// Helper to resolve raw names to canonical slugs for file paths
function getCanonicalSlug(name, teamId) {
  if (!name) return '';
  
  const lowerName = String(name).toLowerCase().trim();

  // 1. Gold Standard: Provider Team ID (e.g., "496" -> Juventus)
  if (teamId && teamIdentityRegistry[String(teamId)]) {
    const canonicalName = teamIdentityRegistry[String(teamId)].canonical;
    return canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // 2. Pre-calculated Identity Map (Instant O(1) lookup)
  if (identityMap && identityMap[lowerName]) {
    const canonicalName = identityMap[lowerName];
    return canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // 3. Manual Aliases & Blocklist (strictly enforce nulls)
  if (manualAliases && manualAliases.hasOwnProperty(lowerName)) {
    const canonicalName = manualAliases[lowerName];
    if (!canonicalName) return ''; // ★ BLOCKLIST ENFORCED! Return empty string, do not guess.
    return canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // 4. Fallback to the strict fuzzy matcher
  const matcher = getMatcher();
  const resolved = matcher.resolve(name);
  const canonicalName = resolved?.name || name;
  return String(canonicalName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

module.exports = { getMatcher, getCanonicalSlug };