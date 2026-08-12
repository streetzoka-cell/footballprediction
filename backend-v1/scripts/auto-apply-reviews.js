const fs = require('fs');
const path = require('path');

const ALIASES_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'aliases');
const REVIEW_PATH = path.join(ALIASES_DIR, 'team_review_list.json');
const ALIASES_PATH = path.join(ALIASES_DIR, 'team_aliases.json');

// 1. Load existing manual aliases
let aliases = {};
if (fs.existsSync(ALIASES_PATH)) {
  try {
    aliases = JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf8'));
  } catch (e) {}
}

// 2. Load the review list
if (!fs.existsSync(REVIEW_PATH)) {
  console.log('No review list found. Run generate-team-mapping.js first.');
  process.exit(0);
}

const reviewList = JSON.parse(fs.readFileSync(REVIEW_PATH, 'utf8'));
let addedCount = 0;

// 3. Automatically add them to the alias map
for (const review of reviewList) {
  const key = review.suggestedAlias || review.liveName.toLowerCase().trim();
  
  // Only add if it doesn't already exist
  if (!aliases[key]) {
    aliases[key] = review.historicalName;
    console.log(`✅ Auto-mapped: "${key}" -> "${review.historicalName}"`);
    addedCount++;
  }
}

// 4. Save the updated aliases
fs.writeFileSync(ALIASES_PATH, JSON.stringify(aliases, null, 2));

console.log(`\n[Done] Automatically added ${addedCount} aliases to team_aliases.json.`);
console.log('Now run "node scripts/generate-team-mapping.js" again to finalize the safe map.');