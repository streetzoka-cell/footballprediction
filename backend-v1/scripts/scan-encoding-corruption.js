'use strict';

/**
 * ============================================================
 * ZOKASCORE — ENCODING FORENSIC SCANNER
 * ============================================================
 *
 * PURPOSE:
 *   Read-only scan of public_data for likely UTF-8 mojibake.
 *
 * IMPORTANT:
 *   - NEVER modifies files
 *   - NEVER rewrites files
 *   - NEVER creates backups
 *   - Scans text files recursively
 *   - Reports exact files containing suspicious characters
 *
 * Usage:
 *
 *   node scripts/scan-encoding-corruption.js
 *
 * Optional:
 *
 *   node scripts/scan-encoding-corruption.js --all
 *
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'public_data');

const REPORT_DIR = path.join(
  process.cwd(),
  'encoding-repair-report'
);

const JSON_REPORT = path.join(
  REPORT_DIR,
  'encoding-forensic-report.json'
);

const TXT_REPORT = path.join(
  REPORT_DIR,
  'encoding-forensic-report.txt'
);

// ------------------------------------------------------------
// Configuration
// ------------------------------------------------------------

const MAX_SAMPLE_PER_FILE = 20;
const MAX_REPORT_FILES = 10000;
const PROGRESS_INTERVAL = 1000;

// Text extensions commonly found in your football database.
// We deliberately exclude obvious binary files.
const TEXT_EXTENSIONS = new Set([
  '.json',
  '.jsonl',
  '.txt',
  '.csv',
  '.tsv',
  '.ndjson',
  '.xml',
  '.html',
  '.htm',
  '.md',
  '.yaml',
  '.yml'
]);

// Known mojibake indicators.
//
// These are NOT automatically proof of corruption.
// They are forensic indicators that require contextual
// inspection.
const BAD_PATTERNS = [
  {
    name: 'UTF8_AS_LATIN1_A',
    regex: /Ã./g,
    description: 'Typical UTF-8 decoded as Latin-1/CP1252'
  },

  {
    name: 'UTF8_AS_LATIN1_B',
    regex: /Â./g,
    description: 'Typical UTF-8 spacing/symbol corruption'
  },

  {
    name: 'UTF8_AS_CP1252_QUOTES',
    regex: /â€™|â€œ|â€|â€˜|â€¦|â€“|â€”|â€¢/g,
    description: 'Typical corrupted punctuation'
  },

  {
    name: 'UTF8_AS_CP1252_SYMBOLS',
    regex: /â.|ðŸ.|ï¿½/g,
    description: 'Typical corrupted symbols/emoji'
  },

  {
    name: 'REPLACEMENT_CHARACTER',
    regex: /�/g,
    description: 'Unicode replacement character'
  },

  {
    name: 'CORRUPTED_LATIN',
    regex: /(?:Ã.|Â.|â.|ðŸ.|ï¿½)/g,
    description: 'Combined mojibake signature'
  }
];

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function isTextFile(file) {
  return TEXT_EXTENSIONS.has(
    path.extname(file).toLowerCase()
  );
}

function collectFiles(dir, output = []) {
  let entries;

  try {
    entries = fs.readdirSync(dir, {
      withFileTypes: true
    });
  } catch (error) {
    console.error(
      `[ERROR] Cannot read directory: ${dir}`
    );
    return output;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectFiles(fullPath, output);
      continue;
    }

    if (entry.isFile() && isTextFile(entry.name)) {
      output.push(fullPath);
    }
  }

  return output;
}

function countMatches(text, regex) {
  regex.lastIndex = 0;

  let count = 0;
  while (regex.exec(text) !== null) {
    count++;
  }

  regex.lastIndex = 0;

  return count;
}

function getLineNumber(text, index) {
  let line = 1;

  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
    }
  }

  return line;
}

function getContext(text, index, length = 120) {
  const start = Math.max(0, index - 60);
  const end = Math.min(
    text.length,
    index + length
  );

  return text
    .slice(start, end)
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function findMatches(text) {
  const matches = [];

  for (const pattern of BAD_PATTERNS) {
    pattern.regex.lastIndex = 0;

    let match;

    while (
      (match = pattern.regex.exec(text)) !== null
    ) {
      if (
        matches.length >=
        MAX_SAMPLE_PER_FILE
      ) {
        return matches;
      }

      matches.push({
        type: pattern.name,
        description: pattern.description,
        character: match[0],
        index: match.index,
        line: getLineNumber(
          text,
          match.index
        ),
        context: getContext(
          text,
          match.index
        )
      });
    }

    pattern.regex.lastIndex = 0;
  }

  return matches;
}

function calculateScore(text) {
  let score = 0;

  for (const pattern of BAD_PATTERNS) {
    score += countMatches(
      text,
      pattern.regex
    );
  }

  return score;
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(
      filePath,
      'utf8'
    );
  } catch (error) {
    return null;
  }
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

async function main() {
  console.log('');
  console.log('='.repeat(64));
  console.log(
    ' ZOKASCORE — ENCODING FORENSIC SCANNER'
  );
  console.log('='.repeat(64));
  console.log('');

  console.log(`Root directory: ${ROOT}`);
  console.log('');
  console.log(
    'MODE: READ-ONLY — NO FILES WILL BE MODIFIED'
  );
  console.log('');

  if (!fs.existsSync(ROOT)) {
    console.error(
      `[FATAL] public_data not found:\n${ROOT}`
    );
    process.exit(1);
  }

  fs.mkdirSync(REPORT_DIR, {
    recursive: true
  });

  console.log(
    '[Scan] Collecting text files...'
  );

  const files = collectFiles(ROOT);

  console.log(
    `[Scan] Found ${files.length.toLocaleString()} text files.`
  );

  console.log('');
  console.log(
    '[Scan] Searching for suspicious encoding signatures...'
  );
  console.log('');

  const startedAt =
    new Date().toISOString();

  const suspiciousFiles = [];
  const patternTotals = {};

  let filesScanned = 0;
  let filesFailed = 0;
  let bytesScanned = 0;
  let suspiciousOccurrences = 0;

  const allPatternNames =
    BAD_PATTERNS.map(p => p.name);

  for (const filePath of files) {
    filesScanned++;

    const buffer = (() => {
      try {
        return fs.readFileSync(filePath);
      } catch {
        return null;
      }
    })();

    if (!buffer) {
      filesFailed++;
      continue;
    }

    bytesScanned += buffer.length;

    // UTF-8 decoding.
    const text =
      buffer.toString('utf8');

    const score =
      calculateScore(text);

    if (score > 0) {
      const relativePath =
        path.relative(
          ROOT,
          filePath
        ).replace(/\\/g, '/');

      const matches =
        findMatches(text);

      const patternCounts = {};

      for (const pattern of BAD_PATTERNS) {
        const count =
          countMatches(
            text,
            pattern.regex
          );

        if (count > 0) {
          patternCounts[pattern.name] =
            count;

          patternTotals[pattern.name] =
            (patternTotals[pattern.name] || 0) +
            count;

          suspiciousOccurrences += count;
        }
      }

      suspiciousFiles.push({
        file: relativePath,
        bytes: buffer.length,
        score,
        patternCounts,
        samples: matches
      });

      if (
        suspiciousFiles.length >=
        MAX_REPORT_FILES
      ) {
        console.log(
          `[WARN] Reached report limit of ${MAX_REPORT_FILES.toLocaleString()} files.`
        );
        break;
      }
    }

    if (
      filesScanned % PROGRESS_INTERVAL === 0 ||
      filesScanned === files.length
    ) {
      const percent =
        files.length
          ? (
              (filesScanned /
                files.length) *
              100
            ).toFixed(1)
          : '100.0';

      process.stdout.write(
        `\r[Progress] ${percent}% | ` +
        `${filesScanned.toLocaleString()}/` +
        `${files.length.toLocaleString()} | ` +
        `Suspicious files: ` +
        `${suspiciousFiles.length.toLocaleString()}`
      );
    }
  }

  console.log('');
  console.log('');

  const finishedAt =
    new Date().toISOString();

  const report = {
    scanner: 'ZOKASCORE Encoding Forensic Scanner',
    mode: 'READ_ONLY',

    root: ROOT,

    startedAt,
    finishedAt,

    filesDiscovered: files.length,
    filesScanned,
    filesFailed,

    bytesScanned,

    suspiciousFiles:
      suspiciousFiles.length,

    suspiciousOccurrences,

    patternTotals,

    patternsChecked:
      BAD_PATTERNS.map(p => ({
        name: p.name,
        description: p.description
      })),

    examples:
      suspiciousFiles
        .slice(0, 500)
        .map(item => ({
          file: item.file,
          score: item.score,
          patternCounts:
            item.patternCounts,
          samples:
            item.samples.slice(0, 10)
        })),

    files:
      suspiciousFiles
  };

  fs.writeFileSync(
    JSON_REPORT,
    JSON.stringify(
      report,
      null,
      2
    ),
    'utf8'
  );

  // ----------------------------------------------------------
  // Human-readable report
  // ----------------------------------------------------------

  const lines = [];

  lines.push(
    '============================================================'
  );

  lines.push(
    'ZOKASCORE ENCODING FORENSIC REPORT'
  );

  lines.push(
    '============================================================'
  );

  lines.push('');

  lines.push(
    'MODE: READ-ONLY — NO FILES MODIFIED'
  );

  lines.push('');

  lines.push(
    `Root: ${ROOT}`
  );

  lines.push('');

  lines.push(
    `Files discovered: ${files.length}`
  );

  lines.push(
    `Files scanned:    ${filesScanned}`
  );

  lines.push(
    `Files failed:     ${filesFailed}`
  );

  lines.push(
    `Suspicious files: ${suspiciousFiles.length}`
  );

  lines.push(
    `Suspicious hits:  ${suspiciousOccurrences}`
  );

  lines.push(
    `Bytes scanned:    ${bytesScanned.toLocaleString()}`
  );

  lines.push('');

  lines.push(
    '------------------------------------------------------------'
  );

  lines.push(
    'PATTERN COUNTS'
  );

  lines.push(
    '------------------------------------------------------------'
  );

  for (const name of allPatternNames) {
    lines.push(
      `${name}: ${patternTotals[name] || 0}`
    );
  }

  lines.push('');

  lines.push(
    '------------------------------------------------------------'
  );

  lines.push(
    'SUSPICIOUS FILES'
  );

  lines.push(
    '------------------------------------------------------------'
  );

  if (!suspiciousFiles.length) {
    lines.push('');
    lines.push(
      'NO SUSPICIOUS ENCODING SIGNATURES FOUND.'
    );
    lines.push('');
    lines.push(
      'This means the scanner found no known'
    );
    lines.push(
      'UTF-8/Latin-1/CP1252 mojibake patterns'
    );
    lines.push(
      'in the scanned text files.'
    );
  } else {
    for (
      const item of suspiciousFiles
    ) {
      lines.push('');
      lines.push(
        `FILE: ${item.file}`
      );
      lines.push(
        `SCORE: ${item.score}`
      );

      lines.push(
        `PATTERNS: ${JSON.stringify(
          item.patternCounts
        )}`
      );

      for (
        const sample of item.samples
      ) {
        lines.push(
          `  Line ${sample.line} | ` +
          `${sample.type} | ` +
          `"${sample.character}"`
        );

        lines.push(
          `  Context: ${sample.context}`
        );
      }
    }
  }

  lines.push('');

  lines.push(
    '============================================================'
  );

  lines.push(
    'END OF REPORT'
  );

  lines.push(
    '============================================================'
  );

  fs.writeFileSync(
    TXT_REPORT,
    lines.join('\n'),
    'utf8'
  );

  // ----------------------------------------------------------
  // Console summary
  // ----------------------------------------------------------

  console.log('');
  console.log(
    '='.repeat(64)
  );
  console.log(
    ' FORENSIC SCAN COMPLETE'
  );
  console.log(
    '='.repeat(64)
  );
  console.log('');

  console.log(
    `Files scanned:       ${filesScanned.toLocaleString()}`
  );

  console.log(
    `Files failed:        ${filesFailed.toLocaleString()}`
  );

  console.log(
    `Suspicious files:    ${suspiciousFiles.length.toLocaleString()}`
  );

  console.log(
    `Suspicious hits:     ${suspiciousOccurrences.toLocaleString()}`
  );

  console.log('');

  console.log(
    `JSON report: ${JSON_REPORT}`
  );

  console.log(
    `TXT report:  ${TXT_REPORT}`
  );

  console.log('');

  if (suspiciousFiles.length === 0) {
    console.log(
      'RESULT: CLEAN — no known mojibake signatures detected.'
    );
    console.log('');
    console.log(
      'IMPORTANT: No files were modified.'
    );
  } else {
    console.log(
      'RESULT: SUSPICIOUS CONTENT FOUND.'
    );

    console.log('');
    console.log(
      'DO NOT run an encoding repair yet.'
    );

    console.log(
      'Inspect the forensic report first.'
    );
  }

  console.log('');
}

main().catch(error => {
  console.error('');
  console.error(
    '[FATAL]',
    error
  );
  process.exit(1);
});