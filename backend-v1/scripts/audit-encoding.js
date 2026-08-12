const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

function findJSONFiles(dir, fileList = []) {
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findJSONFiles(filePath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

console.log('[Audit] Scanning 96,000+ files for encoding issues...');
const files = findJSONFiles(HISTORY_DIR);

let mojibakeCount = 0;
let invalidJsonCount = 0;
const suspiciousFiles = [];

for (const file of files) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    
    // Check for common mojibake patterns
    if (raw.includes('Ã©') || raw.includes('Ã¡') || raw.includes('Ã³') || raw.includes('Ã±') || raw.includes('Ã¼')) {
      mojibakeCount++;
      suspiciousFiles.push(file);
    }
    
    // Verify it's valid JSON
    JSON.parse(raw);
  } catch (e) {
    invalidJsonCount++;
    suspiciousFiles.push(`INVALID JSON: ${file} - ${e.message}`);
  }
}

console.log('\n========================================');
console.log(' ENCODING & JSON AUDIT COMPLETE');
console.log('========================================');
console.log(`Files scanned  : ${files.length}`);
console.log(`Mojibake found  : ${mojibakeCount}`);
console.log(`Invalid JSON    : ${invalidJsonCount}`);
console.log('========================================');

if (suspiciousFiles.length > 0) {
  console.log('\nSuspicious files:');
  suspiciousFiles.slice(0, 10).forEach(f => console.log(` - ${f}`));
} else {
  console.log('\n✅ Your historical database is perfectly clean and ready for KIM!');
}