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
  "dangerous-conflicts-review.txt"
);

if (!fs.existsSync(INPUT)) {
  console.error("❌ dangerous_conflicts.json not found");
  process.exit(1);
}

const data = JSON.parse(
  fs.readFileSync(INPUT, "utf8")
);

const conflicts = Array.isArray(data)
  ? data
  : data.conflicts || data.dangerous || [];

let output = "";

output += "============================================================\n";
output += "ZOKASCORE — DANGEROUS TEAM IDENTITY REVIEW\n";
output += "============================================================\n\n";

output += `Total conflicts: ${conflicts.length}\n\n`;

conflicts.forEach((item, index) => {
  output += `------------------------------------------------------------\n`;
  output += `CONFLICT #${index + 1}\n`;
  output += `------------------------------------------------------------\n`;

  const fields = [
    ["Name A", item.nameA],
    ["Name B", item.nameB],
    ["Live Name", item.liveName],
    ["Historical Name", item.historicalName],
    ["Type", item.type || item.conflict],
    ["Message", item.message],
    ["Matcher Type", item.matcherType],
    ["Score", item.score],
    ["Identity Type", item.identityType],
    ["Resolved Type", item.resolvedType],
    ["Provider IDs", item.providerIds]
  ];

  for (const [label, value] of fields) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      output += `${label}: ${
        Array.isArray(value)
          ? value.join(", ")
          : value
      }\n`;
    }
  }

  output += "\n";
});

fs.writeFileSync(
  OUTPUT,
  output,
  "utf8"
);

console.log(`✅ Created: ${OUTPUT}`);
console.log(`📊 Conflicts: ${conflicts.length}`);