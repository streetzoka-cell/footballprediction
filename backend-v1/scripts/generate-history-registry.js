const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const OUTPUT_FILE = path.join(HISTORY_DIR, 'registry.json');

function findMatchesFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findMatchesFiles(filePath, fileList);
    } else if (file === 'matches.json') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

console.log('[Registry] Scanning history directory for matches.json files...');

const matchesFiles = findMatchesFiles(HISTORY_DIR);
const registry = [];

for (const filePath of matchesFiles) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    
    if (parsed && Array.isArray(parsed.matches)) {
      const relativePath = path.relative(HISTORY_DIR, filePath).replace(/\\/g, '/');
      const parts = relativePath.split('/');
      const tournamentSlug = parts[0]; 
      
      let aliases = [];
      if (Array.isArray(parsed.aliases)) {
        aliases = parsed.aliases.map(a => a.toLowerCase());
      }
      
      if (!aliases.includes(tournamentSlug.replace(/_/g, ' '))) {
        aliases.push(tournamentSlug.replace(/_/g, ' '));
      }

      registry.push({
        path: relativePath,
        aliases: aliases,
        matchCount: parsed.matches.length
      });
    }
  } catch (e) {
    // Skip malformed files
  }
}

const payload = {
  id: 'history_registry',
  generatedAt: new Date().toISOString(),
  datasets: registry
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
console.log(`[Registry] Done! Indexed ${registry.length} datasets into registry.json`);