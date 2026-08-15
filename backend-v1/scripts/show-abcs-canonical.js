// scripts/show-abcs-canonical.js

const fs = require("fs");

const teams = JSON.parse(
  fs.readFileSync(
    "data_audit/entity_resolution/canonical_teams.json",
    "utf8"
  )
);

const targets = [
  "aruba",
  "curacao",
  "bonaire",
  "suriname"
];

for (const team of teams) {
  const name = String(team.canonical_name || "").toLowerCase();

  if (targets.some(target => name.includes(target))) {
    console.log(JSON.stringify(team, null, 2));
  }
}