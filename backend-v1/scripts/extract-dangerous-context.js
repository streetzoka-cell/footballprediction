const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const INPUT = path.join(
  ROOT,
  "public_data",
  "knowledge",
  "football",
  "identity_scan",
  "dangerous_conflicts.json"
);

const OUTPUT = path.join(
  ROOT,
  "dangerous-context.json"
);

const data = JSON.parse(
  fs.readFileSync(INPUT, "utf8")
);

const conflicts = Array.isArray(data)
  ? data
  : data.conflicts || data.dangerous || [];

const result = conflicts.map((c, index) => ({
  conflict_number: index + 1,

  nameA: c.nameA || null,
  nameB: c.nameB || null,

  liveName: c.liveName || null,
  historicalName: c.historicalName || null,

  identityType: c.identityType || null,
  resolvedType: c.resolvedType || null,

  conflict: c.conflict || c.type || null,
  message: c.message || null,

  matcherType: c.matcherType || null,
  score: c.score ?? null,

  providerIds: c.providerIds || [],

  sources: c.sources || []
}));

fs.writeFileSync(
  OUTPUT,
  JSON.stringify(result, null, 2)
);

console.log(
  `Created ${OUTPUT}`
);

console.log(
  `Conflicts: ${result.length}`
);