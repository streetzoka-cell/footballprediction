#!/usr/bin/env node

/**
 * ============================================================
 * ZOKASCORE TEAM IDENTITY SAFETY AUDITOR
 * ============================================================
 *
 * READ-ONLY.
 *
 * This script does NOT modify your data.
 *
 * It audits:
 *   - canonical team registry
 *   - alias registry
 *   - historical JSON data
 *   - duplicate identities
 *   - dangerous men's/women's merges
 *   - youth/reserve/amateur merges
 *   - suspicious aliases
 *   - unresolved mappings
 *
 * Usage:
 *
 *   node scripts/audit-team-identities.js
 *
 * Optional:
 *
 *   node scripts/audit-team-identities.js \
 *     --registry=public_data/team_registry.json \
 *     --aliases=public_data/team_aliases.json \
 *     --data=public_data
 *
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------

const ROOT = process.cwd();

const CONFIG = {
  registry:
    getArg("--registry") ||
    path.join(ROOT, "public_data", "team_registry.json"),

  aliases:
    getArg("--aliases") ||
    path.join(ROOT, "public_data", "team_aliases.json"),

  data:
    getArg("--data") ||
    path.join(ROOT, "public_data"),

  extensions: [".json"],

  ignoredDirectories: new Set([
    "node_modules",
    ".git",
    "cache",
    "logs"
  ])
};

// ------------------------------------------------------------
// ARGUMENTS
// ------------------------------------------------------------

function getArg(name) {
  const prefix = `${name}=`;

  const arg = process.argv.find(a => a.startsWith(prefix));

  if (!arg) return null;

  return arg.slice(prefix.length);
}

// ------------------------------------------------------------
// COLORS
// ------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
  bold: "\x1b[1m"
};

function red(x) {
  return `${C.red}${x}${C.reset}`;
}

function yellow(x) {
  return `${C.yellow}${x}${C.reset}`;
}

function green(x) {
  return `${C.green}${x}${C.reset}`;
}

function cyan(x) {
  return `${C.cyan}${x}${C.reset}`;
}

function gray(x) {
  return `${C.gray}${x}${C.reset}`;
}

function bold(x) {
  return `${C.bold}${x}${C.reset}`;
}

// ------------------------------------------------------------
// COUNTERS
// ------------------------------------------------------------

const issues = {
  critical: [],
  dangerous: [],
  warning: [],
  info: []
};

function critical(message, details = null) {
  issues.critical.push({ message, details });
}

function dangerous(message, details = null) {
  issues.dangerous.push({ message, details });
}

function warning(message, details = null) {
  issues.warning.push({ message, details });
}

function info(message, details = null) {
  issues.info.push({ message, details });
}

// ------------------------------------------------------------
// NORMALIZATION
// ------------------------------------------------------------

function normalizeName(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[().,/\\:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------
// IDENTITY CLASSIFICATION
// ------------------------------------------------------------

function identityFlags(name) {
  const n = normalizeName(name);

  return {
    women:
      /\b(w|women|womens|ladies|feminine|female)\b/.test(n),

    youth:
      /\b(u7|u8|u9|u10|u11|u12|u13|u14|u15|u16|u17|u18|u19|u20|u21|u22|u23)\b/.test(n),

    reserve:
      /\b(ii|iii|b|am|ama|amateur|reserve|reserves|2|3)\b/.test(n),

    academy:
      /\bacademy\b/.test(n),

    senior:
      !(
        /\b(w|women|womens|ladies|female)\b/.test(n) ||
        /\b(u7|u8|u9|u10|u11|u12|u13|u14|u15|u16|u17|u18|u19|u20|u21|u22|u23)\b/.test(n) ||
        /\b(ii|iii|b|am|ama|amateur|reserve|reserves|2|3)\b/.test(n) ||
        /\bacademy\b/.test(n)
      )
  };
}

function identityType(name) {
  const flags = identityFlags(name);

  if (flags.women) return "WOMEN";
  if (flags.youth) return "YOUTH";
  if (flags.reserve) return "RESERVE";
  if (flags.academy) return "ACADEMY";

  return "SENIOR";
}

// ------------------------------------------------------------
// JSON LOADER
// ------------------------------------------------------------

function loadJSON(file) {
  if (!fs.existsSync(file)) {
    warning(`File does not exist: ${file}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    critical(`Invalid JSON: ${file}`, error.message);
    return null;
  }
}

// ------------------------------------------------------------
// REGISTRY
// ------------------------------------------------------------

function loadRegistry() {
  const registry = loadJSON(CONFIG.registry);

  if (!registry || typeof registry !== "object") {
    return {
      byId: new Map(),
      canonicalNames: new Map()
    };
  }

  const byId = new Map();
  const canonicalNames = new Map();

  for (const [providerId, record] of Object.entries(registry)) {
    if (providerId.startsWith("_")) continue;

    if (!record || typeof record !== "object") {
      critical(
        `Invalid registry record for provider ID ${providerId}`
      );
      continue;
    }

    const canonical = record.canonical;

    if (!canonical || typeof canonical !== "string") {
      critical(
        `Provider ID ${providerId} has no valid canonical name`
      );
      continue;
    }

    const aliases = Array.isArray(record.aliases)
      ? record.aliases
      : [];

    byId.set(providerId, {
      providerId,
      canonical,
      aliases
    });

    const normalized = normalizeName(canonical);

    if (!canonicalNames.has(normalized)) {
      canonicalNames.set(normalized, []);
    }

    canonicalNames.get(normalized).push(providerId);

    for (const alias of aliases) {
      if (typeof alias !== "string") {
        warning(
          `Non-string alias for ${canonical}`,
          alias
        );
      }
    }
  }

  return {
    byId,
    canonicalNames
  };
}

// ------------------------------------------------------------
// ALIAS REGISTRY
// ------------------------------------------------------------

function loadAliases() {
  const aliases = loadJSON(CONFIG.aliases);

  if (!aliases || typeof aliases !== "object") {
    return new Map();
  }

  return new Map(
    Object.entries(aliases).map(([alias, canonical]) => [
      normalizeName(alias),
      {
        originalAlias: alias,
        canonical
      }
    ])
  );
}

// ------------------------------------------------------------
// CHECK REGISTRY DUPLICATES
// ------------------------------------------------------------

function checkCanonicalDuplicates(registry) {
  console.log(cyan("\n[1] Checking canonical identity duplicates..."));

  for (const [normalized, ids] of registry.canonicalNames) {
    if (ids.length <= 1) continue;

    const records = ids.map(id => registry.byId.get(id));

    const names = records.map(r => `${r.canonical} [${r.providerId}]`);

    dangerous(
      `Multiple provider IDs share the same canonical identity: ${normalized}`,
      names
    );
  }
}

// ------------------------------------------------------------
// CHECK ALIASES
// ------------------------------------------------------------

function checkAliases(registry, aliases) {
  console.log(cyan("[2] Checking alias safety..."));

  const aliasTargets = new Map();

  for (const [normalizedAlias, entry] of aliases) {
    const canonical = entry.canonical;

    // NULL / EMPTY
    if (canonical === null || canonical === undefined || canonical === "") {
      warning(
        `Unresolved alias: "${entry.originalAlias}"`
      );
      continue;
    }

    if (typeof canonical !== "string") {
      critical(
        `Alias has invalid canonical value: "${entry.originalAlias}"`,
        canonical
      );
      continue;
    }

    const normalizedCanonical = normalizeName(canonical);

    if (!aliasTargets.has(normalizedAlias)) {
      aliasTargets.set(normalizedAlias, []);
    }

    aliasTargets.get(normalizedAlias).push(canonical);

    // Alias identical to canonical is harmless.
    if (normalizedAlias === normalizedCanonical) {
      continue;
    }

    // Check whether canonical exists in provider registry.
    const matchingIds =
      registry.canonicalNames.get(normalizedCanonical) || [];

    if (matchingIds.length === 0) {
      warning(
        `Alias points to canonical name not present in provider registry`,
        {
          alias: entry.originalAlias,
          canonical
        }
      );
    }

    // --------------------------------------------------------
    // MEN / WOMEN
    // --------------------------------------------------------

    const aliasType = identityType(entry.originalAlias);
    const canonicalType = identityType(canonical);

    if (aliasType !== canonicalType) {
      dangerous(
        `Identity-type mismatch`,
        {
          alias: entry.originalAlias,
          aliasType,
          canonical,
          canonicalType
        }
      );
    }

    // --------------------------------------------------------
    // YOUTH / SENIOR
    // --------------------------------------------------------

    const aliasFlags = identityFlags(entry.originalAlias);
    const canonicalFlags = identityFlags(canonical);

    if (aliasFlags.youth !== canonicalFlags.youth) {
      dangerous(
        `Youth/senior identity merge detected`,
        {
          alias: entry.originalAlias,
          canonical
        }
      );
    }

    // --------------------------------------------------------
    // RESERVE / SENIOR
    // --------------------------------------------------------

    if (aliasFlags.reserve !== canonicalFlags.reserve) {
      dangerous(
        `Reserve/senior identity merge detected`,
        {
          alias: entry.originalAlias,
          canonical
        }
      );
    }

    // --------------------------------------------------------
    // ACADEMY
    // --------------------------------------------------------

    if (aliasFlags.academy !== canonicalFlags.academy) {
      dangerous(
        `Academy/non-academy identity merge detected`,
        {
          alias: entry.originalAlias,
          canonical
        }
      );
    }
  }

  // ----------------------------------------------------------
  // SAME ALIAS → MULTIPLE CANONICALS
  // ----------------------------------------------------------

  for (const [alias, targets] of aliasTargets) {
    const uniqueTargets = [
      ...new Set(targets.map(normalizeName))
    ];

    if (uniqueTargets.length > 1) {
      critical(
        `Same alias resolves to multiple canonical teams`,
        {
          alias,
          targets
        }
      );
    }
  }
}

// ------------------------------------------------------------
// KNOWN DANGEROUS PATTERNS
// ------------------------------------------------------------

function checkKnownDangerousMappings(aliases) {
  console.log(cyan("[3] Checking known dangerous mappings..."));

  const dangerousPatterns = [
    ["real madrid castilla", "real madrid"],
    ["barcelona b", "barcelona"],
    ["real madrid b", "real madrid"],
    ["real madrid ii", "real madrid"],
    ["chelsea u21", "chelsea"],
    ["chelsea u23", "chelsea"],
    ["liverpool u21", "liverpool"],
    ["manchester united u21", "manchester united"],
    ["manchester city u21", "manchester city"],
    ["arsenal u21", "arsenal"],
    ["lech poznan uam", "lech poznan"],
    ["fc ingolstadt 04 am", "ingolstadt"],
    ["hannover 96 am", "hannover"]
  ];

  for (const [alias, target] of dangerousPatterns) {
    const entry = aliases.get(normalizeName(alias));

    if (!entry) continue;

    if (
      normalizeName(entry.canonical) ===
      normalizeName(target)
    ) {
      critical(
        `Known dangerous mapping detected: ${alias} → ${target}`
      );
    }
  }
}

// ------------------------------------------------------------
// SCAN JSON FILES
// ------------------------------------------------------------

function getJSONFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const result = [];

  function walk(current) {
    let entries;

    try {
      entries = fs.readdirSync(current, {
        withFileTypes: true
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const full = path.join(current, entry.name);

      if (
        entry.isDirectory() &&
        !CONFIG.ignoredDirectories.has(entry.name)
      ) {
        walk(full);
      }

      if (
        entry.isFile() &&
        CONFIG.extensions.includes(
          path.extname(entry.name).toLowerCase()
        )
      ) {
        result.push(full);
      }
    }
  }

  walk(dir);

  return result;
}

// ------------------------------------------------------------
// EXTRACT TEAM-LIKE OBJECTS
// ------------------------------------------------------------

function inspectObject(
  obj,
  file,
  pathStack,
  registry,
  aliases
) {
  if (!obj || typeof obj !== "object") return;

  // ----------------------------------------------------------
  // TEAM OBJECT
  // ----------------------------------------------------------

  const teamName =
    obj.team?.name ||
    obj.teams?.home?.name ||
    obj.teams?.away?.name ||
    obj.homeTeam?.name ||
    obj.awayTeam?.name ||
    obj.home?.name ||
    obj.away?.name ||
    obj.teamName ||
    obj.homeTeam ||
    obj.awayTeam;

  const providerId =
    obj.team?.id ||
    obj.teams?.home?.id ||
    obj.teams?.away?.id ||
    obj.homeTeam?.id ||
    obj.awayTeam?.id ||
    obj.teamId;

  if (
    typeof teamName === "string" &&
    teamName.trim().length > 0
  ) {
    auditStoredTeam(
      teamName,
      providerId,
      file,
      pathStack.join("."),
      registry,
      aliases
    );
  }

  // ----------------------------------------------------------
  // RECURSION
  // ----------------------------------------------------------

  for (const [key, value] of Object.entries(obj)) {
    if (!value || typeof value !== "object") continue;

    inspectObject(
      value,
      file,
      [...pathStack, key],
      registry,
      aliases
    );
  }
}

// ------------------------------------------------------------
// STORED TEAM AUDIT
// ------------------------------------------------------------

function auditStoredTeam(
  name,
  providerId,
  file,
  objectPath,
  registry,
  aliases
) {
  const normalized = normalizeName(name);

  // ----------------------------------------------------------
  // PROVIDER ID EXISTS
  // ----------------------------------------------------------

  if (providerId !== undefined && providerId !== null) {
    const record = registry.byId.get(String(providerId));

    if (record) {
      const storedNormalized =
        normalizeName(name);

      const canonicalNormalized =
        normalizeName(record.canonical);

      if (storedNormalized !== canonicalNormalized) {
        const aliasList = record.aliases.map(normalizeName);

        if (!aliasList.includes(storedNormalized)) {
          warning(
            `Stored team name is not registered as canonical/alias`,
            {
              file,
              objectPath,
              providerId,
              storedName: name,
              canonical: record.canonical
            }
          );
        }
      }
    } else {
      warning(
        `Stored provider team ID is missing from canonical registry`,
        {
          file,
          objectPath,
          providerId,
          teamName: name
        }
      );
    }
  }

  // ----------------------------------------------------------
  // ALIAS
  // ----------------------------------------------------------

  const alias = aliases.get(normalized);

  if (alias) {
    const aliasType = identityType(name);
    const canonicalType = identityType(alias.canonical);

    if (aliasType !== canonicalType) {
      critical(
        `Stored data uses dangerous identity alias`,
        {
          file,
          objectPath,
          storedName: name,
          aliasTarget: alias.canonical
        }
      );
    }
  }

  // ----------------------------------------------------------
  // DANGEROUS NAME CLASSIFICATION
  // ----------------------------------------------------------

  const flags = identityFlags(name);

  if (
    flags.women ||
    flags.youth ||
    flags.reserve ||
    flags.academy
  ) {
    info(
      `Special identity detected`,
      {
        file,
        objectPath,
        teamName: name,
        type: identityType(name)
      }
    );
  }
}

// ------------------------------------------------------------
// AUDIT DATA
// ------------------------------------------------------------

function auditStoredData(registry, aliases) {
  console.log(cyan("[4] Scanning stored JSON data..."));

  const files = getJSONFiles(CONFIG.data);

  console.log(
    gray(`Found ${files.length} JSON files`)
  );

  let parsed = 0;

  for (const file of files) {
    // Don't scan registry/alias files twice.
    if (
      path.resolve(file) ===
        path.resolve(CONFIG.registry) ||
      path.resolve(file) ===
        path.resolve(CONFIG.aliases)
    ) {
      continue;
    }

    const data = loadJSON(file);

    if (!data) continue;

    parsed++;

    inspectObject(
      data,
      file,
      [],
      registry,
      aliases
    );
  }

  console.log(
    gray(`Parsed ${parsed} data files`)
  );
}

// ------------------------------------------------------------
// SPECIAL TEAM NAME CHECKS
// ------------------------------------------------------------

function checkSuspiciousCanonicalNames(registry) {
  console.log(cyan("[5] Checking canonical names..."));

  for (const record of registry.byId.values()) {
    const flags = identityFlags(record.canonical);

    // Canonical team explicitly marked as women/youth/reserve.
    // That's okay, but useful to report.

    if (
      flags.women ||
      flags.youth ||
      flags.reserve ||
      flags.academy
    ) {
      info(
        `Special canonical identity`,
        {
          providerId: record.providerId,
          canonical: record.canonical,
          type: identityType(record.canonical)
        }
      );
    }
  }
}

// ------------------------------------------------------------
// REPORT
// ------------------------------------------------------------

function printSection(title, entries, color) {
  if (!entries.length) return;

  console.log("\n" + color(bold(title)));

  for (const item of entries) {
    console.log("\n" + item.message);

    if (item.details !== null) {
      console.log(
        JSON.stringify(item.details, null, 2)
      );
    }
  }
}

function printSummary(registry, aliases) {
  console.log("\n");
  console.log(
    bold("============================================================")
  );
  console.log(
    bold("              ZOKASCORE IDENTITY AUDIT")
  );
  console.log(
    bold("============================================================")
  );

  console.log("");

  console.log(
    `Canonical provider IDs : ${registry.byId.size}`
  );

  console.log(
    `Aliases checked        : ${aliases.size}`
  );

  console.log(
    `Critical issues        : ${
      issues.critical.length
    }`
  );

  console.log(
    `Dangerous issues       : ${
      issues.dangerous.length
    }`
  );

  console.log(
    `Warnings               : ${
      issues.warning.length
    }`
  );

  console.log(
    `Informational          : ${
      issues.info.length
    }`
  );

  printSection(
    "CRITICAL — DATA MAY BE CORRUPTED",
    issues.critical,
    red
  );

  printSection(
    "DANGEROUS — MANUAL REVIEW REQUIRED",
    issues.dangerous,
    yellow
  );

  printSection(
    "WARNINGS",
    issues.warning,
    yellow
  );

  // Don't print every info item by default.
  if (issues.info.length) {
    console.log(
      "\n" +
        cyan(
          `INFO: ${issues.info.length} informational findings`
        )
    );
  }

  console.log("\n");

  if (issues.critical.length > 0) {
    console.log(
      red(
        "❌ IDENTITY SAFETY CHECK FAILED"
      )
    );

    console.log(
      red(
        "DO NOT automatically rewrite historical data."
      )
    );

    process.exitCode = 2;
    return;
  }

  if (issues.dangerous.length > 0) {
    console.log(
      yellow(
        "⚠️ IDENTITY CHECK PASSED WITH DANGEROUS FINDINGS"
      )
    );

    console.log(
      yellow(
        "Review the mappings before allowing automatic normalization."
      )
    );

    process.exitCode = 1;
    return;
  }

  if (issues.warning.length > 0) {
    console.log(
      yellow(
        "⚠️ IDENTITY CHECK PASSED WITH WARNINGS"
      )
    );

    process.exitCode = 0;
    return;
  }

  console.log(
    green(
      "✅ TEAM IDENTITY DATA LOOKS SAFE"
    )
  );

  process.exitCode = 0;
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

function main() {
  console.log(
    "\n" +
      bold(
        "ZOKASCORE — TEAM IDENTITY SAFETY AUDITOR"
      )
  );

  console.log(
    gray("READ-ONLY — no files will be modified.\n")
  );

  console.log(
    gray(`Registry: ${CONFIG.registry}`)
  );

  console.log(
    gray(`Aliases : ${CONFIG.aliases}`)
  );

  console.log(
    gray(`Data    : ${CONFIG.data}`)
  );

  const registry = loadRegistry();
  const aliases = loadAliases();

  checkCanonicalDuplicates(registry);

  checkAliases(
    registry,
    aliases
  );

  checkKnownDangerousMappings(
    aliases
  );

  auditStoredData(
    registry,
    aliases
  );

  checkSuspiciousCanonicalNames(
    registry
  );

  printSummary(
    registry,
    aliases
  );
}

main();