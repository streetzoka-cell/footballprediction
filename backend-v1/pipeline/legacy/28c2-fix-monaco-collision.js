// pipeline/28c2-fix-monaco-collision.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENTITY_IDENTITY_FILE = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes', 'entity_identity_index.json');

console.log('> Loading entity identity index...');
const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));

if (entityIndex['INTL_monaco']) {
  console.log('Found INTL_monaco. Removing to resolve collision with AS Monaco (162).');
  delete entityIndex['INTL_monaco'];
  fs.writeFileSync(ENTITY_IDENTITY_FILE, JSON.stringify(entityIndex, null, 2), 'utf8');
  console.log('✅ Collision resolved. File saved.');
} else {
  console.log('INTL_monaco not found. No changes made.');
}