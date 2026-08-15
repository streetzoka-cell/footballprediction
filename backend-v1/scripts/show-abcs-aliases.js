// scripts/show-abcs-aliases.js

const fs = require("fs");

const aliases = JSON.parse(
  fs.readFileSync(
    "data_audit/entity_resolution/team_alias_map.json",
    "utf8"
  )
);

const targets = [
  "aruba",
  "curacao",
  "bonaire",
  "suriname"
];

for (const [alias, canonicalId] of Object.entries(aliases)) {
  const key = String(alias).toLowerCase();

  if (targets.some(target => key.includes(target))) {
    console.log(`${alias} => ${canonicalId}`);
  }
}