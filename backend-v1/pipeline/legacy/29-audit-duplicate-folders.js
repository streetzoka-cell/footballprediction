// pipeline/29-audit-duplicate-folders.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');

const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

console.log('🔍 Scanning for duplicate history folders (Dry Run / Audit)...\n');

const folders = fs.readdirSync(HISTORY_DIR).filter(f => fs.statSync(path.join(HISTORY_DIR, f)).isDirectory());
const slugMap = new Map();

for (const folder of folders) {
  const slug = slugify(folder);
  if (!slugMap.has(slug)) slugMap.set(slug, []);
  slugMap.get(slug).push(folder);
}

let duplicateGroups = 0;

for (const [slug, folderList] of slugMap.entries()) {
  if (folderList.length > 1) {
    duplicateGroups++;
    console.log('============================================================');
    console.log(`🚨 DUPLICATE SLUG GROUP: "${slug}"`);
    console.log(`Folders: ${folderList.join(', ')}`);
    
    const folderStats = {};

    // Analyze each folder
    for (const f of folderList) {
      const folderPath = path.join(HISTORY_DIR, f);
      const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.json'));
      
      let totalMatches = 0;
      let legacyIdCount = 0;
      let canonicalIdCount = 0;

      for (const file of files) {
        const filePath = path.join(folderPath, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (Array.isArray(data.matches)) {
            for (const match of data.matches) {
              totalMatches++;
              
              // Count Legacy vs Canonical IDs
              if (match.home_team_id) {
                if (String(match.home_team_id).startsWith('INTL_')) legacyIdCount++; else canonicalIdCount++;
              }
              if (match.away_team_id) {
                if (String(match.away_team_id).startsWith('INTL_')) legacyIdCount++; else canonicalIdCount++;
              }
            }
          }
        } catch (e) {}
      }
      
      folderStats[f] = { files: files.length, totalMatches, legacyIdCount, canonicalIdCount };
    }

    // Compare and Recommend
    let keepFolder = folderList[0];
    let bestScore = -1;

    for (const f of folderList) {
      const stat = folderStats[f];
      // Score heavily favors canonical IDs
      const score = stat.canonicalIdCount - stat.legacyIdCount;
      if (score > bestScore) {
        bestScore = score;
        keepFolder = f;
      }
    }

    for (const f of folderList) {
      const stat = folderStats[f];
      console.log(`\n  Folder: ${f}`);
      console.log(`    Files: ${stat.files} | Matches: ${stat.totalMatches}`);
      console.log(`    Canonical IDs: ${stat.canonicalIdCount} | Legacy (INTL_) IDs: ${stat.legacyIdCount}`);
      
      if (f === keepFolder) {
        console.log(`    ✅ RECOMMEND KEEP (Highest canonical ID count)`);
      } else {
        console.log(`    🗑️  RECOMMEND QUARANTINE`);
      }
    }
  }
}

if (duplicateGroups === 0) {
  console.log('\n✅ No duplicate slug folders found.');
} else {
  console.log('\n============================================================');
  console.log(' AUDIT COMPLETE');
  console.log('============================================================');
  console.log(`Found ${duplicateGroups} duplicate folder groups.`);
  console.log('Review the recommendations above. No files were modified or deleted.');
}