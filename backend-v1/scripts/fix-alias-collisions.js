const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');

const REMOVALS = {
  "law_02_ball": ["ball"],
  "inside_forward": ["inverted winger"],
  "striker": ["number 9", "target man"],
  "attacking_midfielder": ["number 10", "false 9"],
  "4-2-3-1": ["double pivot"]
};

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
        
        if (data.aliases && REMOVALS[data.id]) {
          let modified = false;
          
          data.aliases = data.aliases.filter(alias => {
            if (REMOVALS[data.id].includes(alias.toLowerCase())) {
              console.log(`❌ Removing '${alias}' from ${data.id}`);
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
console.log('🎉 Alias collision cleanup complete!');