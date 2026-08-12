#!/usr/bin/env node

/**
 * ============================================================
 * ZOKASCORE — APPROVED TEAM IDENTITY PROMOTION
 * ============================================================
 *
 * SAFETY:
 *   - Reads ONLY approved_candidates.json
 *   - NEVER modifies historical match files
 *   - NEVER promotes rejected identities
 *   - NEVER automatically overwrites existing mappings
 *   - Creates a backup before production changes
 *   - Supports --dry-run
 *
 * Usage:
 *
 *   node scripts/promote-approved-identities.js --dry-run
 *
 *   node scripts/promote-approved-identities.js
 *
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const IDENTITY_SCAN_DIR = path.join(
  ROOT,
  "public_data",
  "knowledge",
  "football",
  "identity_scan"
);

const APPROVED_FILE = path.join(
  IDENTITY_SCAN_DIR,
  "approved_candidates.json"
);

/*
 * IMPORTANT:
 *
 * Do NOT guess the TeamMatcher production file.
 * We will discover it from the existing service configuration
 * before writing anything.
 */

const DRY_RUN =
  process.argv.includes("--dry-run");

console.log("");
console.log("============================================================");
console.log("   ZOKASCORE APPROVED TEAM IDENTITY PROMOTION");
console.log("============================================================");
console.log("");

console.log(
  `MODE: ${DRY_RUN ? "DRY-RUN — NO CHANGES" : "PRODUCTION"}`
);

console.log(
  `Approved file: ${APPROVED_FILE}`
);

console.log("");

/*
 * ------------------------------------------------------------
 * LOAD APPROVED CANDIDATES
 * ------------------------------------------------------------
 */

if (!fs.existsSync(APPROVED_FILE)) {
  console.error(
    "❌ approved_candidates.json was not found."
  );

  process.exit(1);
}

let approved;

try {
  approved = JSON.parse(
    fs.readFileSync(
      APPROVED_FILE,
      "utf8"
    )
  );
} catch (error) {
  console.error(
    "❌ Failed to parse approved_candidates.json"
  );

  console.error(error.message);

  process.exit(1);
}

/*
 * The adjudicator currently produced a single object,
 * not an array.
 *
 * Normalize it safely.
 */

if (!Array.isArray(approved)) {
  approved = [approved];
}

console.log(
  `Approved candidates: ${approved.length}`
);

console.log("");

/*
 * ------------------------------------------------------------
 * VALIDATE
 * ------------------------------------------------------------
 */

const validated = [];

for (const candidate of approved) {
  if (
    !candidate ||
    typeof candidate !== "object"
  ) {
    console.error(
      "❌ Invalid candidate entry."
    );

    process.exit(1);
  }

  const liveName =
    String(
      candidate.liveName || ""
    ).trim();

  const canonicalName =
    String(
      candidate.canonicalName || ""
    ).trim();

  const providerIds =
    Array.isArray(
      candidate.providerIds
    )
      ? candidate.providerIds
          .map(String)
          .filter(Boolean)
      : [];

  if (!liveName) {
    console.error(
      "❌ Candidate has no liveName."
    );

    process.exit(1);
  }

  if (!canonicalName) {
    console.error(
      "❌ Candidate has no canonicalName."
    );

    process.exit(1);
  }

  if (providerIds.length === 0) {
    console.error(
      `❌ Candidate "${liveName}" has no provider ID.`
    );

    process.exit(1);
  }

  validated.push({
    liveName,
    canonicalName,
    providerIds
  });
}

/*
 * ------------------------------------------------------------
 * DISPLAY EXACTLY WHAT WOULD BE PROMOTED
 * ------------------------------------------------------------
 */

console.log(
  "Candidates eligible for promotion:"
);

console.log("");

for (const candidate of validated) {
  console.log(
    `  ${candidate.liveName}`
  );

  console.log(
    `      → ${candidate.canonicalName}`
  );

  console.log(
    `      Provider IDs: ${candidate.providerIds.join(", ")}`
  );

  console.log("");
}

/*
 * ------------------------------------------------------------
 * SAFETY ASSERTION
 * ------------------------------------------------------------
 *
 * For the current adjudication result we expect:
 *
 *   B 1913 Odense
 *       →
 *   B1913 Odense
 *
 * This prevents accidentally promoting a completely
 * different candidate if the source file changes.
 */

if (validated.length !== 1) {
  console.error(
    "❌ SAFETY STOP: Expected exactly 1 approved identity."
  );

  console.error(
    `Found ${validated.length}.`
  );

  console.error(
    "Review approved_candidates.json before promotion."
  );

  process.exit(2);
}

const candidate =
  validated[0];

if (
  candidate.liveName !==
  "B 1913 Odense" ||
  candidate.canonicalName !==
  "B1913 Odense" ||
  !candidate.providerIds.includes("1698")
) {
  console.error(
    "❌ SAFETY STOP: Approved identity does not match the expected adjudication."
  );

  console.error(
    JSON.stringify(
      candidate,
      null,
      2
    )
  );

  process.exit(3);
}

console.log(
  "✅ Candidate passed strict safety validation."
);

console.log("");

/*
 * ------------------------------------------------------------
 * DRY RUN STOP
 * ------------------------------------------------------------
 */

if (DRY_RUN) {
  console.log(
    "============================================================"
  );

  console.log(
    "DRY-RUN COMPLETE"
  );

  console.log(
    "============================================================"
  );

  console.log("");

  console.log(
    "No files were modified."
  );

  console.log(
    "No historical data was modified."
  );

  process.exit(0);
}

/*
 * ------------------------------------------------------------
 * PRODUCTION PROMOTION
 * ------------------------------------------------------------
 *
 * We intentionally STOP here for now.
 *
 * The exact TeamMatcher persistence file must be identified
 * before we write anything to production.
 */

console.log(
  "============================================================"
);

console.log(
  "PRODUCTION WRITE NOT YET ENABLED"
);

console.log(
  "============================================================"
);

console.log("");

console.log(
  "The approved identity has passed validation."
);

console.log(
  "The production TeamMatcher storage file has NOT yet been modified."
);

console.log("");

console.log(
  "Next step: identify the exact TeamMatcher persistence file."
);

console.log(
  "This prevents us from accidentally writing to the wrong alias/map."
);

process.exit(0);