'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname);
const OUTPUT_FILE = path.join(__dirname, 'script_inventory_report.json');

function getAllFiles(dir, base = '') {
  let results = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    const relativePath = path.join(base, item);

    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, relativePath));
    } else if (item.endsWith('.js') || item.endsWith('.py')) {
      results.push({
        filename: item,
        path: relativePath,
        size: stat.size,
        modified: stat.mtime
      });
    }
  }
  return results;
}

function categorizeScript(filename) {
  const name = filename.toLowerCase();
  
  if (name.includes('alias') || name.includes('identity') || name.includes('conflict')) {
    return 'Alias & Identity Repair';
  }
  if (name.includes('history') || name.includes('world_cup') || name.includes('h2h')) {
    return 'History Generation';
  }
  if (name.includes('generate') || name.includes('build')) {
    return 'Data Generation';
  }
  if (name.includes('merge') || name.includes('update') || name.includes('import')) {
    return 'Data Import & Merge';
  }
  if (name.includes('test') || name.includes('debug')) {
    return 'Testing & Debugging';
  }
  if (name.includes('audit') || name.includes('scan') || name.includes('check')) {
    return 'Auditing & Scanning';
  }
  if (name.includes('model') || name.includes('backtest') || name.includes('train') || name.includes('poisson')) {
    return 'ML & Prediction Models';
  }
  return 'Uncategorized';
}

console.log('============================================================');
console.log(' ZOKASCORE — SCRIPT INVENTORY GENERATOR');
console.log('============================================================\n');

const files = getAllFiles(SCRIPTS_DIR);
const inventory = {};

for (const file of files) {
  // Skip this inventory script itself
  if (file.filename === 'inventory-scripts.js') continue;

  const category = categorizeScript(file.filename);
  if (!inventory[category]) inventory[category] = [];
  
  inventory[category].push({
    filename: file.filename,
    path: file.path,
    sizeKB: (file.size / 1024).toFixed(2),
    lastModified: file.modified.toISOString().split('T')[0]
  });
}

// Sort categories alphabetically
const sortedInventory = {};
Object.keys(inventory).sort().forEach(key => {
  sortedInventory[key] = inventory[key].sort((a, b) => a.filename.localeCompare(b.filename));
});

try {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sortedInventory, null, 2), 'utf8');
  console.log(`✅ Inventory generated successfully!`);
  console.log(`📊 Total scripts found: ${files.length - 1}`); // -1 for this script
  console.log(`📁 Report saved to: ${OUTPUT_FILE}`);
  console.log('\nCategories Summary:');
  for (const [category, scripts] of Object.entries(sortedInventory)) {
    console.log(`  • ${category}: ${scripts.length} scripts`);
  }
} catch (e) {
  console.error(`❌ Failed to write inventory: ${e.message}`);
}