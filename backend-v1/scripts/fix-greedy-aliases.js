const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');

// Generic single-word aliases to remove from Laws to prevent collisions
const GREEDY_ALIASES = [
  'ball', 'players', 'equipment', 'referee', 'var', 'duration', 'kick-off', 'kickoff',
  'out of play', 'in play', 'goal', 'draw', 'foul', 'free kick', 'penalty', 'throw-in', 
  'goal kick', 'corner kick', 'corner', 'field', 'pitch', 'match', 'time', 'card', 'yellow', 'red'
];

function processDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (file.endsWith('.json')) {
      try {
        let content = fs.readFileSync(fullPath, 'utf8').trim();
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        const data = JSON.parse(content);
        
        if (data.aliases && data.id && data.id.startsWith('law_')) {
          let modified = false;
          
          data.aliases = data.aliases.filter(alias => {
            if (GREEDY_ALIASES.includes(alias.toLowerCase())) {
              console.log(`❌ Removing greedy alias '${alias}' from ${data.id}`);
              modified = true;
              return false;
            }
            return true;
          });

          if (modified) {
            fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
            console.log(`✅ Cleaned aliases in ${file}`);
          }
        }
      } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
      }
    }
  });
}

processDir(KNOWLEDGE_DIR);
console.log('🎉 Greedy alias cleanup complete!');