'use strict';

/**
 * ============================================================
 * ZOKASCORE — PUBLIC DATA ENCODING REPAIR
 * ============================================================
 *
 * Purpose:
 *   Repair UTF-8 mojibake throughout public_data/.
 *
 * Examples:
 *
 *   GÃ¶tze       -> Götze
 *   MÃ¼ller      -> Müller
 *   SolskjÃ¦r    -> Solskjær
 *   NazÃ¡rio     -> Nazário
 *   â€™          -> ’
 *   â€œ           -> “
 *   âš½          -> ⚽
 *   ðŸ˜‚         -> 😂
 *
 * IMPORTANT:
 *   This script modifies files.
 *
 *   ALWAYS make sure you have your independent
 *   public_data backup before running it.
 *
 * Usage:
 *
 *   DRY RUN:
 *     node scripts/repair-encoding.js --dry-run
 *
 *   REPAIR:
 *     node scripts/repair-encoding.js
 *
 *   Specific directory:
 *     node scripts/repair-encoding.js --dir public_data/knowledge/football
 *
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(
  process.argv.includes('--dir')
    ? process.argv[process.argv.indexOf('--dir') + 1]
    : path.join(process.cwd(), 'public_data')
);

const DRY_RUN = process.argv.includes('--dry-run');
const MAKE_BACKUPS = !process.argv.includes('--no-backup');

const REPORT_DIR = path.join(process.cwd(), 'encoding-repair-report');

const REPORT_JSON = path.join(
  REPORT_DIR,
  'encoding-repair-report.json'
);

const REPORT_TXT = path.join(
  REPORT_DIR,
  'encoding-repair-report.txt'
);

const ALLOWED_EXTENSIONS = new Set([
  '.json',
  '.jsonl',
  '.txt',
  '.csv',
  '.js',
  '.md',
  '.xml'
]);

const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.cache',
  'tmp',
  'temp'
]);

/**
 * ------------------------------------------------------------
 * Statistics
 * ------------------------------------------------------------
 */

const stats = {
  startedAt: new Date().toISOString(),

  filesScanned: 0,
  filesChanged: 0,
  filesSkipped: 0,
  filesFailed: 0,

  bytesScanned: 0,
  bytesWritten: 0,

  replacements: 0,

  suspiciousBefore: 0,
  suspiciousAfter: 0,

  backupsCreated: 0,

  examples: []
};

const MAX_EXAMPLES = 500;

/**
 * ------------------------------------------------------------
 * Mojibake detection
 * ------------------------------------------------------------
 *
 * We intentionally look for CHARACTER PATTERNS rather than
 * blindly replacing individual characters.
 *
 * This helps avoid damaging legitimate text.
 * ------------------------------------------------------------
 */

const MOJIBAKE_PATTERN =
  /(?:Ã.|Â.|â.|ðŸ.|�)/g;

/**
 * Additional suspicious sequences frequently produced by
 * UTF-8/Windows-1252 corruption.
 */

const SUSPICIOUS_PATTERNS = [
  /Ã[\x80-\xBF]/g,
  /Â[\x80-\xBF]/g,
  /â[\x80-\xBF]/g,
  /ðŸ[\x80-\xBF]/g,
  /�/g
];

/**
 * ------------------------------------------------------------
 * Check whether a string appears to contain mojibake.
 * ------------------------------------------------------------
 */

function looksCorrupted(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  if (text.includes('\uFFFD')) {
    return true;
  }

  return SUSPICIOUS_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/**
 * ------------------------------------------------------------
 * Decode one mojibake candidate.
 *
 * Common situation:
 *
 *   Original UTF-8 bytes
 *          ↓
 *   incorrectly decoded as Windows-1252
 *          ↓
 *   "GÃ¶tze"
 *
 * We reverse that operation.
 * ------------------------------------------------------------
 */

function decodeMojibakeCandidate(value) {
  try {
    const bytes = Buffer.from(value, 'latin1');

    const repaired = bytes.toString('utf8');

    if (!repaired || repaired.includes('\uFFFD')) {
      return value;
    }

    return repaired;
  } catch {
    return value;
  }
}

/**
 * ------------------------------------------------------------
 * Determine whether decoding actually improved the text.
 * ------------------------------------------------------------
 */

function corruptionScore(text) {
  if (!text) return 0;

  let score = 0;

  const matches = text.match(MOJIBAKE_PATTERN);

  if (matches) {
    score += matches.length * 10;
  }

  score += (text.match(/\uFFFD/g) || []).length * 20;

  return score;
}

/**
 * ------------------------------------------------------------
 * Repair a complete text string.
 *
 * We iterate several times because double-corrupted strings
 * can require more than one decoding pass.
 *
 * Example:
 *
 *   GÃƒÂ¶tze
 *        ↓
 *   GÃ¶tze
 *        ↓
 *   Götze
 * ------------------------------------------------------------
 */

function repairText(input) {
  if (!input || typeof input !== 'string') {
    return {
      text: input,
      changed: false,
      replacements: 0
    };
  }

  let current = input;
  let replacements = 0;

  for (let pass = 0; pass < 3; pass++) {
    if (!looksCorrupted(current)) {
      break;
    }

    const beforeScore = corruptionScore(current);

    const repaired = decodeMojibakeCandidate(current);

    if (
      repaired === current ||
      repaired.includes('\uFFFD')
    ) {
      break;
    }

    const afterScore = corruptionScore(repaired);

    /**
     * Only accept the transformation if the corruption
     * score actually improves.
     */
    if (afterScore < beforeScore) {
      current = repaired;
      replacements++;
    } else {
      break;
    }
  }

  return {
    text: current,
    changed: current !== input,
    replacements
  };
}

/**
 * ------------------------------------------------------------
 * Repair text while preserving line structure.
 *
 * This allows very large files to be processed without
 * constructing unnecessary intermediate objects.
 * ------------------------------------------------------------
 */

function repairFileContent(content, filePath) {
  let replacements = 0;
  let changed = false;

  const lines = content.split(/\r?\n/);

  const repairedLines = new Array(lines.length);

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];

    if (!looksCorrupted(original)) {
      repairedLines[i] = original;
      continue;
    }

    stats.suspiciousBefore++;

    const result = repairText(original);

    repairedLines[i] = result.text;

    if (result.changed) {
      changed = true;
      replacements += result.replacements;

      stats.suspiciousAfter +=
        looksCorrupted(result.text) ? 1 : 0;

      if (stats.examples.length < MAX_EXAMPLES) {
        stats.examples.push({
          file: path.relative(process.cwd(), filePath),
          line: i + 1,
          before: original.slice(0, 500),
          after: result.text.slice(0, 500)
        });
      }
    }
  }

  return {
    content: repairedLines.join('\n'),
    changed,
    replacements
  };
}

/**
 * ------------------------------------------------------------
 * File classification
 * ------------------------------------------------------------
 */

function shouldProcessFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * ------------------------------------------------------------
 * Recursive file discovery
 * ------------------------------------------------------------
 */

function findFiles(dir, output = []) {
  let entries;

  try {
    entries = fs.readdirSync(dir, {
      withFileTypes: true
    });
  } catch (error) {
    console.error(
      `[Scan] Cannot read directory: ${dir}`,
      error.message
    );

    return output;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }

      findFiles(fullPath, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (shouldProcessFile(fullPath)) {
      output.push(fullPath);
    }
  }

  return output;
}

/**
 * ------------------------------------------------------------
 * Backup
 * ------------------------------------------------------------
 *
 * A backup is created next to the original:
 *
 *   file.json
 *   file.json.bak
 *
 * Existing .bak files are never overwritten.
 * ------------------------------------------------------------
 */

function createBackup(filePath) {
  if (!MAKE_BACKUPS) {
    return;
  }

  const backupPath = `${filePath}.bak`;

  if (fs.existsSync(backupPath)) {
    return;
  }

  fs.copyFileSync(filePath, backupPath);

  stats.backupsCreated++;
}

/**
 * ------------------------------------------------------------
 * Validate JSON after repair
 * ------------------------------------------------------------
 */

function validateJson(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext !== '.json') {
    return true;
  }

  try {
    JSON.parse(content);
    return true;
  } catch (error) {
    console.error(
      `\n[VALIDATION FAILED] ${filePath}`
    );

    console.error(
      `  ${error.message}`
    );

    return false;
  }
}

/**
 * ------------------------------------------------------------
 * Process one file
 * ------------------------------------------------------------
 */

function processFile(filePath) {
  stats.filesScanned++;

  let buffer;

  try {
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    stats.filesFailed++;

    console.error(
      `[Read Failed] ${filePath}: ${error.message}`
    );

    return;
  }

  stats.bytesScanned += buffer.length;

  /**
   * UTF-8 is expected for the ZOKASCORE knowledge store.
   *
   * BOM is safely removed if present.
   */
  let content = buffer.toString('utf8');

  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const result = repairFileContent(
    content,
    filePath
  );

  if (!result.changed) {
    stats.filesSkipped++;
    return;
  }

  stats.filesChanged += 1;
  stats.replacements += result.replacements;

  /**
   * Critical safety check.
   */
  if (!validateJson(filePath, result.content)) {
    stats.filesFailed++;

    console.error(
      `[SKIPPED WRITE] Invalid repaired JSON: ${filePath}`
    );

    return;
  }

  if (DRY_RUN) {
    return;
  }

  try {
    createBackup(filePath);

    const outputBuffer = Buffer.from(
      result.content,
      'utf8'
    );

    fs.writeFileSync(
      filePath,
      outputBuffer
    );

    stats.bytesWritten += outputBuffer.length;

  } catch (error) {
    stats.filesFailed++;

    console.error(
      `[Write Failed] ${filePath}: ${error.message}`
    );
  }
}

/**
 * ------------------------------------------------------------
 * Reports
 * ------------------------------------------------------------
 */

function writeReports() {
  fs.mkdirSync(REPORT_DIR, {
    recursive: true
  });

  stats.finishedAt = new Date().toISOString();

  fs.writeFileSync(
    REPORT_JSON,
    JSON.stringify(stats, null, 2),
    'utf8'
  );

  const lines = [];

  lines.push(
    '============================================================'
  );

  lines.push(
    'ZOKASCORE ENCODING REPAIR REPORT'
  );

  lines.push(
    '============================================================'
  );

  lines.push('');

  lines.push(`Mode: ${
    DRY_RUN ? 'DRY RUN — NO FILES MODIFIED' : 'REPAIR'
  }`);

  lines.push(`Root: ${ROOT_DIR}`);

  lines.push('');

  lines.push(`Files scanned:       ${stats.filesScanned}`);
  lines.push(`Files changed:       ${stats.filesChanged}`);
  lines.push(`Files skipped:       ${stats.filesSkipped}`);
  lines.push(`Files failed:        ${stats.filesFailed}`);

  lines.push('');

  lines.push(`Bytes scanned:       ${stats.bytesScanned}`);
  lines.push(`Bytes written:       ${stats.bytesWritten}`);

  lines.push('');

  lines.push(`Replacements:        ${stats.replacements}`);
  lines.push(`Backups created:     ${stats.backupsCreated}`);

  lines.push('');

  lines.push(
    '------------------------------------------------------------'
  );

  lines.push('SAMPLE CHANGES');

  lines.push(
    '------------------------------------------------------------'
  );

  for (const example of stats.examples) {
    lines.push('');

    lines.push(
      `${example.file}:${example.line}`
    );

    lines.push(
      `BEFORE: ${example.before}`
    );

    lines.push(
      `AFTER:  ${example.after}`
    );
  }

  fs.writeFileSync(
    REPORT_TXT,
    lines.join('\n'),
    'utf8'
  );
}

/**
 * ------------------------------------------------------------
 * Main
 * ------------------------------------------------------------
 */

function main() {
  console.log('');
  console.log(
    '============================================================'
  );

  console.log(
    ' ZOKASCORE — BULK ENCODING REPAIR'
  );

  console.log(
    '============================================================'
  );

  console.log('');

  console.log(
    `Root directory: ${ROOT_DIR}`
  );

  console.log(
    `Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE REPAIR'}`
  );

  console.log(
    `Backups: ${MAKE_BACKUPS ? 'ENABLED' : 'DISABLED'}`
  );

  console.log('');

  if (!fs.existsSync(ROOT_DIR)) {
    console.error(
      `[ERROR] Directory does not exist: ${ROOT_DIR}`
    );

    process.exit(1);
  }

  const files = findFiles(ROOT_DIR);

  console.log(
    `[Scan] Found ${files.length.toLocaleString()} text files.`
  );

  console.log('');

  for (let i = 0; i < files.length; i++) {
    processFile(files[i]);

    if (
      (i + 1) % 1000 === 0 ||
      i === files.length - 1
    ) {
      process.stdout.write(
        `\r[Progress] ${(
          ((i + 1) / files.length) * 100
        ).toFixed(1)}%`
      );
    }
  }

  console.log('');
  console.log('');

  writeReports();

  console.log(
    '============================================================'
  );

  console.log(' COMPLETE');

  console.log(
    '============================================================'
  );

  console.log('');

  console.log(
    `Files scanned:   ${stats.filesScanned.toLocaleString()}`
  );

  console.log(
    `Files changed:   ${stats.filesChanged.toLocaleString()}`
  );

  console.log(
    `Replacements:    ${stats.replacements.toLocaleString()}`
  );

  console.log(
    `Files failed:    ${stats.filesFailed.toLocaleString()}`
  );

  console.log('');

  console.log(
    `Report JSON: ${REPORT_JSON}`
  );

  console.log(
    `Report TXT:  ${REPORT_TXT}`
  );

  console.log('');

  if (DRY_RUN) {
    console.log(
      'DRY RUN complete. No files were modified.'
    );
  } else {
    console.log(
      'Encoding repair complete.'
    );

    console.log(
      'Original files have .bak backups where changes were made.'
    );
  }

  console.log('');
}

main();