#!/usr/bin/env node

/**
 * ============================================================
 * ZOKASCORE — AUTOMATIC TEAM IDENTITY SCANNER (v2)
 * ============================================================
 *
 * ARCHITECTURE:
 *   SCAN -> Extract -> Normalize/Deduplicate
 *     -> TeamMatcherService -> Classify -> Generate Reports
 *
 * SAFETY RULES:
 *   1. NEVER modify historical data.
 *   2. NEVER modify fixtures.
 *   3. NEVER modify TeamMatcher data.
 *   4. NEVER automatically create aliases or merge teams.
 *   5. Treat B, II, III, U21, U23, Women, Ladies, Academy,
 *      Reserve, etc., as strict identity boundaries.
 *   6. Deduplicate repeated findings.
 *   7. Record every source file where an identity occurs.
 *   8. Preserve actual historical spelling.
 *
 * OUTPUT DIRECTORY (Isolated & Reversible):
 *   public_data/knowledge/football/identity_scan/
 *     ├── scan_summary.json
 *     ├── safe_candidates.json
 *     ├── review_candidates.json
 *     ├── dangerous_conflicts.json
 *     └── discovered_teams.json
 *
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

const { getMatcher } = require("../src/services/TeamMatcherService");

// ============================================================
// PATHS
// ============================================================

const ROOT = process.cwd();

const HISTORY_DIR = path.join(ROOT, "public_data", "knowledge", "football", "history");
const FIXTURES_DIR = path.join(ROOT, "public_data", "fixtures");
const OUTPUT_DIR = path.join(ROOT, "public_data", "knowledge", "football", "identity_scan");

const OUTPUTS = {
  summary: path.join(OUTPUT_DIR, "scan_summary.json"),
  safe: path.join(OUTPUT_DIR, "safe_candidates.json"),
  review: path.join(OUTPUT_DIR, "review_candidates.json"),
  dangerous: path.join(OUTPUT_DIR, "dangerous_conflicts.json"),
  discovered: path.join(OUTPUT_DIR, "discovered_teams.json")
};

// ============================================================
// COLORS
// ============================================================

const C = {
  reset: "\x1b[0m", red: "\x1b[31m", yellow: "\x1b[33m",
  green: "\x1b[32m", cyan: "\x1b[36m", gray: "\x1b[90m", bold: "\x1b[1m"
};

const c = {
  red: x => `${C.red}${x}${C.reset}`,
  yellow: x => `${C.yellow}${x}${C.reset}`,
  green: x => `${C.green}${x}${C.reset}`,
  cyan: x => `${C.cyan}${x}${C.reset}`,
  gray: x => `${C.gray}${x}${C.reset}`,
  bold: x => `${C.bold}${x}${C.reset}`
};

// ============================================================
// NORMALIZATION & IDENTITY BOUNDARIES
// ============================================================

function normalizeName(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[().,/\\:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identityFlags(name) {
  const n = normalizeName(name);
  return {
    women: /\b(w|women|womens|ladies|female|feminine)\b/.test(n),
    youth: /\bu(?:7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23)\b/.test(n),
    reserve: /\b(ii|iii|iv|b|2|3|reserve|reserves|am|ama|amateur)\b/.test(n),
    academy: /\bacademy\b/.test(n)
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

function identityConflict(a, b) {
  const fa = identityFlags(a);
  const fb = identityFlags(b);

  if (fa.women !== fb.women) return { type: "WOMEN_SENIOR_CONFLICT", message: "Women's/senior identity conflict" };
  if (fa.youth !== fb.youth) return { type: "YOUTH_SENIOR_CONFLICT", message: "Youth/senior identity conflict" };
  if (fa.reserve !== fb.reserve) return { type: "RESERVE_SENIOR_CONFLICT", message: "Reserve/senior identity conflict" };
  if (fa.academy !== fb.academy) return { type: "ACADEMY_SENIOR_CONFLICT", message: "Academy/senior identity conflict" };

  return null;
}

// ============================================================
// FILE & JSON UTILITIES
// ============================================================

function findJSONFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      findJSONFiles(fullPath, result);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".json") {
      result.push(fullPath);
    }
  }
  return result;
}

function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// ============================================================
// TEAM COLLECTION (DEDUPLICATED)
// ============================================================

const teams = new Map();

/**
 * normalized name -> {
 *   originalNames: Set<string>, // Preserve actual spellings
 *   normalized: string,
 *   identityType: string,
 *   providerIds: Set<string>,
 *   sources: Array<{ file: string, path: string, type: string }>,
 *   appearances: number
 * }
 */
function registerTeam({ name, providerId = null, file, source, objectPath = null }) {
  if (typeof name !== "string" || !name.trim()) return;

  const cleanName = name.trim();
  const normalized = normalizeName(cleanName);
  if (!normalized) return;

  if (!teams.has(normalized)) {
    teams.set(normalized, {
      originalNames: new Set(),
      normalized,
      identityType: identityType(cleanName),
      providerIds: new Set(),
      sources: [],
      appearances: 0
    });
  }

  const entry = teams.get(normalized);
  entry.originalNames.add(cleanName);

  if (providerId !== null && providerId !== undefined) {
    entry.providerIds.add(String(providerId));
  }

  const relFile = path.relative(ROOT, file);
  
  // Prevent duplicate source logging for the exact same file/path
  const srcExists = entry.sources.some(s => s.file === relFile && s.path === objectPath);
  if (!srcExists) {
    entry.sources.push({ file: relFile, path: objectPath, type: source });
  }

  entry.appearances++;
}

// ============================================================
// SCANNERS
// ============================================================

function scanHistoryFile(file) {
  const data = loadJSON(file);
  if (!data) return;

  if (Array.isArray(data.matches)) {
    data.matches.forEach((match, index) => {
      if (!match || typeof match !== "object") return;

      registerTeam({ name: match.home_team, file, source: "history", objectPath: `matches[${index}].home_team` });
      registerTeam({ name: match.away_team, file, source: "history", objectPath: `matches[${index}].away_team` });

      registerTeam({
        name: match.homeTeam?.name,
        providerId: match.homeTeam?.id || match.homeTeamId,
        file, source: "history", objectPath: `matches[${index}].homeTeam`
      });
      registerTeam({
        name: match.awayTeam?.name,
        providerId: match.awayTeam?.id || match.awayTeamId,
        file, source: "history", objectPath: `matches[${index}].awayTeam`
      });
    });
  }

  scanGenericObjects(data, file, []);
}

function scanGenericObjects(value, file, stack) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanGenericObjects(item, file, [...stack, index]));
    return;
  }

  const candidates = [
    { name: value.team?.name, id: value.team?.id, path: "team" },
    { name: value.homeTeam?.name, id: value.homeTeam?.id, path: "homeTeam" },
    { name: value.awayTeam?.name, id: value.awayTeam?.id, path: "awayTeam" },
    { name: value.teams?.home?.name, id: value.teams?.home?.id, path: "teams.home" },
    { name: value.teams?.away?.name, id: value.teams?.away?.id, path: "teams.away" }
  ];

  for (const candidate of candidates) {
    if (typeof candidate.name === "string") {
      registerTeam({
        name: candidate.name,
        providerId: candidate.id,
        file, source: "nested",
        objectPath: [...stack, candidate.path].join(".")
      });
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") {
      scanGenericObjects(child, file, [...stack, key]);
    }
  }
}

function scanFixtureFile(file) {
  const data = loadJSON(file);
  if (!data) return;

  let matches = [];
  if (Array.isArray(data)) matches = data;
  else if (Array.isArray(data.matches)) matches = data.matches;
  else if (Array.isArray(data.data)) matches = data.data;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (!match || typeof match !== "object") continue;

    registerTeam({
      name: match.homeTeam?.name || match.homeName || match.home_team,
      providerId: match.homeTeam?.id || match.homeTeamId,
      file, source: "fixture", objectPath: `matches[${i}].home`
    });

    registerTeam({
      name: match.awayTeam?.name || match.awayName || match.away_team,
      providerId: match.awayTeam?.id || match.awayTeamId,
      file, source: "fixture", objectPath: `matches[${i}].away`
    });
  }
}

// ============================================================
// MATCHER & RESOLUTION
// ============================================================

let matcher = null;

try {
  matcher = getMatcher();
  console.log(c.green("[Scanner] TeamMatcherService loaded."));
} catch (error) {
  console.log(c.yellow("[Scanner] TeamMatcherService unavailable. Continuing with local identity analysis."));
}

function resolveTeam(entry) {
  if (!matcher) return null;

  // Prefer Provider ID resolution
  for (const id of [...entry.providerIds]) {
    try {
      const resolved = matcher.resolve([...entry.originalNames][0], { teamId: id });
      if (resolved) return resolved;
    } catch {}
  }

  // Fallback to exact normalized name resolution
  try {
    return matcher.resolve(entry.normalized);
  } catch {
    return null;
  }
}

// ============================================================
// CLASSIFICATION ENGINE
// ============================================================

function classifyIdentities() {
  const safe = [];
  const review = [];
  const dangerous = [];

  console.log(c.cyan(`\n[Scanner] Classifying ${teams.size} unique normalized team identities...`));

  for (const entry of teams.values()) {
    const resolved = resolveTeam(entry);
    const primaryName = [...entry.originalNames][0];

    const baseRecord = {
      discoveredName: primaryName,
      originalNames: [...entry.originalNames],
      normalized: entry.normalized,
      identityType: entry.identityType,
      providerIds: [...entry.providerIds],
      appearances: entry.appearances,
      sources: entry.sources
    };

    if (!resolved) {
      review.push({
        ...baseRecord,
        reason: "UNRESOLVED",
        message: "No confident match in TeamMatcher database."
      });
      continue;
    }

    const resolvedName = resolved.name || resolved.canonical || resolved.team;
    if (!resolvedName) {
      review.push({
        ...baseRecord,
        reason: "INVALID_MATCH",
        message: "Matcher returned an invalid identity."
      });
      continue;
    }

    // CRITICAL: IDENTITY BOUNDARY CHECK
    const conflict = identityConflict(primaryName, resolvedName);

    if (conflict) {
      dangerous.push({
        ...baseRecord,
        historicalName: resolvedName,
        resolvedType: identityType(resolvedName),
        conflictType: conflict.type,
        message: conflict.message,
        matcherScore: resolved.score ?? null,
        matcherType: resolved.type ?? null,
        reason: "BOUNDARY_CONFLICT"
      });
      continue;
    }

    // Classify based on Matcher Confidence
    const safeTypes = ["ID", "EXACT", "ALIAS", "STRONG"];

    if (safeTypes.includes(resolved.type)) {
      safe.push({
        ...baseRecord,
        historicalName: resolvedName,
        matcherType: resolved.type,
        matcherScore: resolved.score ?? 1.0,
        reason: "SAFE_MATCH"
      });
    } else {
      review.push({
        ...baseRecord,
        historicalName: resolvedName,
        resolvedType: identityType(resolvedName),
        matcherScore: resolved.score ?? null,
        matcherType: resolved.type ?? null,
        reason: "FUZZY_MATCH_REVIEW"
      });
    }
  }

  return { safe, review, dangerous };
}

// ============================================================
// SERIALIZATION & REPORTING
// ============================================================

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function main() {
  console.log("\n" + c.bold("============================================================"));
  console.log(c.bold("       ZOKASCORE AUTOMATIC TEAM IDENTITY SCANNER v2       "));
  console.log(c.bold("============================================================"));
  console.log("");

  console.log(c.gray("MODE: READ-ONLY SCAN & REPORT"));
  console.log(c.gray(`History:  ${HISTORY_DIR}`));
  console.log(c.gray(`Fixtures: ${FIXTURES_DIR}`));
  console.log(c.gray(`Output:   ${OUTPUT_DIR} (Isolated)`));
  console.log("");

  // 1. SCAN HISTORY
  const historyFiles = findJSONFiles(HISTORY_DIR);
  console.log(c.cyan(`[Scanner] Found ${historyFiles.length} historical JSON files.`));
  for (const file of historyFiles) scanHistoryFile(file);

  // 2. SCAN FIXTURES
  const fixtureFiles = findJSONFiles(FIXTURES_DIR);
  console.log(c.cyan(`[Scanner] Found ${fixtureFiles.length} fixture JSON files.`));
  for (const file of fixtureFiles) scanFixtureFile(file);

  console.log(c.green(`[Scanner] Discovered ${teams.size} unique normalized team identities.\n`));

  // 3. CLASSIFY
  const { safe, review, dangerous } = classifyIdentities();

  // 4. PREPARE FULL DISCOVERED TEAMS REPORT
  const discoveredTeams = [...teams.values()].map(entry => ({
    discoveredName: [...entry.originalNames][0],
    originalNames: [...entry.originalNames],
    normalized: entry.normalized,
    identityType: entry.identityType,
    providerIds: [...entry.providerIds],
    appearances: entry.appearances,
    sources: entry.sources
  }));

  const summary = {
    generated_at: new Date().toISOString(),
    architecture: "zokascore-local-history",
    read_only: true,
    totals: {
      unique_team_names: teams.size,
      historical_files_scanned: historyFiles.length,
      fixture_files_scanned: fixtureFiles.length,
      safe_candidates: safe.length,
      review_required: review.length,
      dangerous_conflicts: dangerous.length
    },
    rules_enforced: [
      "No historical data modified",
      "No fixtures modified",
      "No aliases auto-created",
      "Strict Youth/Women/Reserve/Academy boundaries enforced"
    ]
  };

  // 5. ENSURE OUTPUT DIRECTORY EXISTS
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 6. SAVE REPORTS
  saveJSON(OUTPUTS.summary, summary);
  saveJSON(OUTPUTS.safe, safe);
  saveJSON(OUTPUTS.review, review);
  saveJSON(OUTPUTS.dangerous, dangerous);
  saveJSON(OUTPUTS.discovered, discoveredTeams);

  // ==========================================================
  // FINAL SUMMARY
  // ==========================================================

  console.log(c.bold("============================================================"));
  console.log(c.bold("                     SCAN COMPLETE                         "));
  console.log(c.bold("============================================================"));
  console.log("");

  console.log(`Unique team names : ${teams.size}`);
  console.log(c.green(`Safe candidates  : ${safe.length}`));
  console.log(c.yellow(`Needs review     : ${review.length}`));
  console.log(c.red(`Dangerous (Blocked): ${dangerous.length}`));
  console.log("");

  console.log(c.cyan("Reports generated:"));
  console.log(`  ${path.relative(ROOT, OUTPUTS.summary)}`);
  console.log(`  ${path.relative(ROOT, OUTPUTS.safe)}`);
  console.log(`  ${path.relative(ROOT, OUTPUTS.review)}`);
  console.log(`  ${path.relative(ROOT, OUTPUTS.dangerous)}`);
  console.log(`  ${path.relative(ROOT, OUTPUTS.discovered)}`);
  console.log("");

  if (dangerous.length > 0) {
    console.log(c.red(`❌ BLOCKED: ${dangerous.length} dangerous identity conflicts were detected and isolated.`));
    console.log(c.gray("   Review dangerous_conflicts.json. No data was merged or modified."));
  }

  if (review.length > 0) {
    console.log(c.yellow(`⚠️ NOTICE: ${review.length} identities require human review.`));
    console.log(c.gray("   Review review_candidates.json."));
  }

  if (dangerous.length === 0 && review.length === 0) {
    console.log(c.green("✅ ALL DISCOVERED TEAM IDENTITIES PASSED AUTOMATIC SAFETY CHECK"));
  }

  // Always exit 0 because this script is strictly a read-only reporter
  process.exitCode = 0;
}

main();