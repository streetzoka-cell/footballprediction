
// backend-v1/src/services/TeamMatcher.js
const fs = require('fs');
const path = require('path');

// ─── Unicode-safe normalizer ──────────────────────────────────────────────
// IMPORTANT:
// This function is ONLY for matching/comparison.
// It NEVER modifies the original team names or alias file.
//
// Examples:
//   "Bodø/Glimt"       -> "bodo glimt"
//   "Pogoń Szczecin"   -> "pogon szczecin"
//   "Žalgiris Vilnius" -> "zalgiris vilnius"
//   "KÍ Klaksvík"      -> "ki klaksvik"
const normalize = (str) => {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics for matching
    .toLowerCase()

    // Split concatenated club suffixes:
    // AthleticFC -> Athletic FC
    // SpartaPrague is intentionally handled by token matching below.
    .replace(
      /([a-z])(fc|cf|sc|afc|fk|sk|sv|if|ik|jk|ac|as|rc|cd|ss|nk|bk|tk|vc|sd|ca|ud|rb|gf)(?!\p{L})/gu,
      '$1 $2'
    )

    // Split letters from numbers:
    // B1913 -> B 1913
    // U20  -> U 20
    .replace(/(\p{L})(?=\p{N})/gu, '$1 ')

    // Everything else becomes a space.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')

    .replace(/\s+/g, ' ')
    .trim();
};

// ─── Stopwords removed before token comparison ─────────────────────────────
// NOTE:
// Do NOT remove city, town, united, etc.
// Those can distinguish genuinely different clubs.
const STOPWORDS = new Set([
  'fc', 'cf', 'sc', 'afc', 'fk', 'sk', 'sv', 'if', 'ik', 'jk', 'ac', 'as',
  'rc', 'cd', 'ss', 'nk', 'bk', 'tk', 'vc', 'sd', 'ca', 'ud', 'rb', 'gf',

  'club',
  'football',
  'foot',
  'ball',
  'soccer',

  'women',
  'w',
  'ladies',

  'u20',
  'u21',
  'u23',
  'u19',
  'u17',
  'u18',
  'u16',

  'the',
  'de',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una'
]);

function meaningfulTokens(name) {
  return normalize(name)
    .split(' ')
    .filter(token => token.length >= 3 && !STOPWORDS.has(token));
}

// ─── Jaccard similarity ───────────────────────────────────────────────────
function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;

  let common = 0;

  for (const token of setA) {
    if (setB.has(token)) common++;
  }

  const union = setA.size + setB.size - common;

  return union ? common / union : 0;
}

// ─── Minimal CSV parser ───────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  result.push(current);

  return result;
}

function loadCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim());

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCSVLine(lines[0]);

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });

    return obj;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TeamMatcher
// ═══════════════════════════════════════════════════════════════════════════
class TeamMatcher {
  constructor(options = {}) {
    this.teams = [];

    this.exactIndex = new Map();
    this.aliasIndex = new Map();
    this.teamIdIndex = new Map();
    this.tokenIndex = new Map();

    this.dataQualityWarnings = [];

    // Alias-file statistics
    this.aliasStats = {
      loaded: 0,
      applied: 0,
      unresolved: 0,
      duplicates: 0,
      invalid: 0
    };

    // Default location for ZOKASCORE's football alias knowledge.
    this.aliasFilePath =
      options.aliasFilePath ||
      path.join(
        process.cwd(),
        'public_data',
        'knowledge',
        'football',
        'aliases',
        'team_aliases.json'
      );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Add a canonical team
  // ────────────────────────────────────────────────────────────────────────
  addTeam(
    name,
    {
      teamId = null,
      aliases = [],
      leagues = [],
      matches = 0
    } = {}
  ) {
    const normalized = normalize(name);

    if (!normalized) {
      this.dataQualityWarnings.push(
        `Empty normalized name from: "${name}"`
      );
    } else if (normalized.length < 3) {
      this.dataQualityWarnings.push(
        `Very short normalized name "${normalized}" from: "${name}"`
      );
    }

    // Existing normalized team
    if (normalized && this.exactIndex.has(normalized)) {
      const existingIdx = this.exactIndex.get(normalized);
      const existing = this.teams[existingIdx];

      if (leagues.length) {
        leagues.forEach(league => existing.leagues.add(league));
      }

      existing.matches += matches;

      if (teamId && !existing.teamId) {
        existing.teamId = teamId;
        this.teamIdIndex.set(String(teamId), existingIdx);
      }

      // Add any new aliases supplied later.
      for (const alias of aliases) {
        this._registerAlias(alias, existingIdx);
      }

      return existingIdx;
    }

    const tokens = new Set(meaningfulTokens(name));
    const idx = this.teams.length;

    this.teams.push({
      name,
      normalized,
      tokenSet: tokens,
      teamId,
      leagues: new Set(leagues),
      matches,
      aliases: []
    });

    if (normalized) {
      this.exactIndex.set(normalized, idx);
    }

    if (teamId) {
      this.teamIdIndex.set(String(teamId), idx);
    }

    // Register supplied aliases.
    for (const alias of aliases) {
      this._registerAlias(alias, idx);
    }

    // Register canonical team tokens.
    for (const token of tokens) {
      this._registerToken(token, idx);
    }

    return idx;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Register one alias against an existing team
  // ────────────────────────────────────────────────────────────────────────
  _registerAlias(alias, teamIdx) {
    if (alias === null || alias === undefined) {
      return false;
    }

    const aliasString = String(alias).trim();

    if (!aliasString) {
      return false;
    }

    const aliasNorm = normalize(aliasString);

    if (!aliasNorm) {
      this.dataQualityWarnings.push(
        `Empty normalized alias from: "${aliasString}"`
      );
      return false;
    }

    // If alias is actually identical to canonical name,
    // there is no need to duplicate it.
    const team = this.teams[teamIdx];

    if (!team) {
      return false;
    }

    if (aliasNorm === team.normalized) {
      return false;
    }

    // Do not silently overwrite an existing alias.
    if (this.aliasIndex.has(aliasNorm)) {
      const existingIdx = this.aliasIndex.get(aliasNorm);

      if (existingIdx !== teamIdx) {
        this.dataQualityWarnings.push(
          `Alias collision: "${aliasString}" already belongs to "${this.teams[existingIdx].name}" but was also requested for "${team.name}"`
        );

        this.aliasStats.duplicates++;
        return false;
      }

      return false;
    }

    this.aliasIndex.set(aliasNorm, teamIdx);

    if (!team.aliases.includes(aliasString)) {
      team.aliases.push(aliasString);
    }

    for (const token of meaningfulTokens(aliasString)) {
      this._registerToken(token, teamIdx);
    }

    return true;
  }

  _registerToken(token, teamIdx) {
    if (!token) return;

    if (!this.tokenIndex.has(token)) {
      this.tokenIndex.set(token, new Set());
    }

    this.tokenIndex.get(token).add(teamIdx);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Load CSV knowledge
  // ────────────────────────────────────────────────────────────────────────
  loadFromCSVs(clubsCsvPath, formerNamesCsvPath) {
    const clubs = loadCSV(clubsCsvPath);

    const clubNameById = new Map();
    const clubIdByNormName = new Map();

    for (const club of clubs) {
      const id = club.club_id || club.id;
      const name = club.pretty_name || club.name;

      if (id && name) {
        clubNameById.set(String(id), name);
        clubIdByNormName.set(
          normalize(name),
          String(id)
        );
      }
    }

    const formerNames = loadCSV(formerNamesCsvPath);
    const aliasesByTeamId = new Map();

    for (const former of formerNames) {
      const id = String(
        former.current_team_id || former.team_id || ''
      );

      const alias =
        former.former_name ||
        former.name ||
        '';

      if (id && alias) {
        if (!aliasesByTeamId.has(id)) {
          aliasesByTeamId.set(id, []);
        }

        aliasesByTeamId.get(id).push(alias);
      }
    }

    return {
      clubNameById,
      clubIdByNormName,
      aliasesByTeamId
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Load team_aliases.json
  //
  // Format:
  //
  // {
  //   "bodo glimt": "Bodø/Glimt",
  //   "fk zalgiris vilnius": "Žalgiris Vilnius",
  //   "bss sporting club": null
  // }
  //
  // The KEY is the incoming/provider name.
  // The VALUE is the canonical team name already in this matcher.
  // ────────────────────────────────────────────────────────────────────────
  loadAliasFile(filePath = this.aliasFilePath) {
    if (!filePath) {
      this.dataQualityWarnings.push(
        'No team alias file path supplied.'
      );
      return {
        loaded: 0,
        applied: 0,
        unresolved: 0,
        duplicates: 0,
        invalid: 0
      };
    }

    if (!fs.existsSync(filePath)) {
      this.dataQualityWarnings.push(
        `Team alias file not found: "${filePath}"`
      );

      return {
        loaded: 0,
        applied: 0,
        unresolved: 0,
        duplicates: 0,
        invalid: 0
      };
    }

    let aliases;

    try {
      // Explicit UTF-8 read.
      //
      // IMPORTANT:
      // We NEVER perform latin1/Windows-1252 conversion here.
      // The knowledge file is expected to already be valid UTF-8.
      const raw = fs.readFileSync(filePath, 'utf8');

      aliases = JSON.parse(raw);
    } catch (error) {
      this.dataQualityWarnings.push(
        `Failed to load team alias file "${filePath}": ${error.message}`
      );

      return {
        loaded: 0,
        applied: 0,
        unresolved: 0,
        duplicates: 0,
        invalid: 1
      };
    }

    if (
      !aliases ||
      typeof aliases !== 'object' ||
      Array.isArray(aliases)
    ) {
      this.dataQualityWarnings.push(
        `Team alias file must contain a JSON object: "${filePath}"`
      );

      return {
        loaded: 0,
        applied: 0,
        unresolved: 0,
        duplicates: 0,
        invalid: 1
      };
    }

    const stats = {
      loaded: 0,
      applied: 0,
      unresolved: 0,
      duplicates: 0,
      invalid: 0
    };

    for (const [alias, canonicalName] of Object.entries(aliases)) {
      stats.loaded++;

      // null means intentionally unresolved / disabled.
      if (
        canonicalName === null ||
        canonicalName === undefined ||
        String(canonicalName).trim() === ''
      ) {
        continue;
      }

      if (
        typeof canonicalName !== 'string' ||
        typeof alias !== 'string'
      ) {
        stats.invalid++;

        this.dataQualityWarnings.push(
          `Invalid alias entry: ${JSON.stringify({
            alias,
            canonicalName
          })}`
        );

        continue;
      }

      const canonicalNorm = normalize(canonicalName);
      const aliasNorm = normalize(alias);

      if (!canonicalNorm || !aliasNorm) {
        stats.invalid++;

        this.dataQualityWarnings.push(
          `Invalid normalized alias: "${alias}" -> "${canonicalName}"`
        );

        continue;
      }

      // The canonical team MUST already exist.
      if (!this.exactIndex.has(canonicalNorm)) {
        stats.unresolved++;

        this.dataQualityWarnings.push(
          `Alias target not found: "${alias}" -> "${canonicalName}"`
        );

        continue;
      }

      const teamIdx = this.exactIndex.get(canonicalNorm);

      // Alias identical to canonical name.
      if (aliasNorm === canonicalNorm) {
        continue;
      }

      // Existing alias belonging to another team.
      if (this.aliasIndex.has(aliasNorm)) {
        const existingIdx = this.aliasIndex.get(aliasNorm);

        if (existingIdx !== teamIdx) {
          stats.duplicates++;

          this.dataQualityWarnings.push(
            `Alias collision: "${alias}" -> "${canonicalName}" conflicts with "${this.teams[existingIdx].name}"`
          );
        }

        continue;
      }

      if (this._registerAlias(alias, teamIdx)) {
        stats.applied++;
      }
    }

    this.aliasStats = {
      loaded: stats.loaded,
      applied: stats.applied,
      unresolved: stats.unresolved,
      duplicates: stats.duplicates,
      invalid: stats.invalid
    };

    return { ...this.aliasStats };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Convenience method:
  //
  // Load CSV knowledge AND the ZOKASCORE alias knowledge file.
  //
  // IMPORTANT:
  // Teams must already have been added before calling loadAliasFile().
  // ────────────────────────────────────────────────────────────────────────
  loadKnowledge({
    clubsCsvPath = null,
    formerNamesCsvPath = null,
    aliasFilePath = this.aliasFilePath
  } = {}) {
    let csvKnowledge = {
      clubNameById: new Map(),
      clubIdByNormName: new Map(),
      aliasesByTeamId: new Map()
    };

    if (clubsCsvPath || formerNamesCsvPath) {
      csvKnowledge = this.loadFromCSVs(
        clubsCsvPath,
        formerNamesCsvPath
      );
    }

    const aliasStats = this.loadAliasFile(aliasFilePath);

    return {
      ...csvKnowledge,
      aliasStats
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Resolve team
  // ────────────────────────────────────────────────────────────────────────
  resolve(name, { teamId = null } = {}) {
    const queryTokens = new Set(
      meaningfulTokens(name)
    );

    // ─────────────────────────────────────────────────────────────────────
    // 0. Team ID lookup — gold standard
    // ─────────────────────────────────────────────────────────────────────
    if (
      teamId &&
      this.teamIdIndex.has(String(teamId))
    ) {
      const idx = this.teamIdIndex.get(String(teamId));
      const team = this.teams[idx];

      const idNameScore = jaccard(
        queryTokens,
        team.tokenSet
      );

      // Prevent cross-provider ID collisions.
      if (
        idNameScore >= 0.50 ||
        queryTokens.size === 0
      ) {
        return {
          ...this._result(idx),
          score: 1,
          type: 'ID'
        };
      }

      // Collision detected.
      // Fall through to name matching.
    }

    const normalized = normalize(name);

    if (!normalized || normalized.length < 4) {
      return null;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1. Knowledge-file / CSV alias exact match
    // ─────────────────────────────────────────────────────────────────────
    if (this.aliasIndex.has(normalized)) {
      const idx = this.aliasIndex.get(normalized);

      return {
        ...this._result(idx),
        score: 1,
        type: 'ALIAS'
      };
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Exact canonical normalized match
    // ─────────────────────────────────────────────────────────────────────
    if (this.exactIndex.has(normalized)) {
      const idx = this.exactIndex.get(normalized);

      return {
        ...this._result(idx),
        score: 1,
        type: 'EXACT'
      };
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. Token-based fuzzy matching
    // ─────────────────────────────────────────────────────────────────────
    if (!queryTokens.size) {
      return null;
    }

    const candidates = new Set();

    for (const token of queryTokens) {
      const teamIndices = this.tokenIndex.get(token);

      if (!teamIndices) continue;

      for (const idx of teamIndices) {
        candidates.add(idx);
      }
    }

    let best = null;

    for (const idx of candidates) {
      const team = this.teams[idx];

      const score = jaccard(
        queryTokens,
        team.tokenSet
      );

      if (!best || score > best.score) {
        best = {
          idx,
          score
        };
      }
    }

    if (!best || best.score < 0.60) {
      return null;
    }

    const type =
      best.score >= 0.85
        ? 'STRONG'
        : 'REVIEW';

    return {
      ...this._result(best.idx),
      score: best.score,
      type
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Result object
  // ────────────────────────────────────────────────────────────────────────
  _result(idx) {
    const team = this.teams[idx];

    return {
      name: team.name,
      teamId: team.teamId,
      normalized: team.normalized,
      leagues: [...team.leagues],
      matches: team.matches,
      aliases: [...team.aliases]
    };
  }

  get size() {
    return this.teams.length;
  }

  get warnings() {
    return this.dataQualityWarnings;
  }

  get aliasCount() {
    return this.aliasIndex.size;
  }

  get aliasStatistics() {
    return { ...this.aliasStats };
  }
}

module.exports = {
  TeamMatcher,
  normalize,
  meaningfulTokens,
  jaccard
};
