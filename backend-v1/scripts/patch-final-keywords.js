const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');

const PATCHES = {
  "switch_of_play": { keywords: ["switching the ball", "switching play", "cross-field pass"] },
  "law_05_referee": { keywords: ["yellow card", "red card", "caution", "sent off"] },
  "law_07_duration": { keywords: ["add time for injuries", "stoppage time", "added time"] },
  "law_09_ball_in_out": { keywords: ["ball is on the line", "ball hits the ref", "ball out", "wholly crossed", "touches the line"] },
  "law_11_offside": { keywords: ["offside from a goal kick", "offside from a corner kick", "gaining an advantage", "deliberate play vs deflection"] },
  "law_12_fouls_misconduct": { keywords: ["direct free kick", "indirect free kick", "handball", "violent conduct"] },
  "law_14_penalty_kick": { keywords: ["kicker touches the ball twice", "encroaches", "moves early"] },
  "law_16_goal_kick": { keywords: ["leave the box", "picks up a goal kick"] },
  "law_17_corner_kick": { keywords: ["from a corner", "touches the ball twice from a corner"] }
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
        
        if (PATCHES[data.id]) {
          // Merge new keywords with existing ones (remove duplicates)
          const existingKeywords = data.keywords || [];
          const newKeywords = [...new Set([...existingKeywords, ...PATCHES[data.id].keywords])];
          data.keywords = newKeywords;
          
          fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
          console.log(`✅ Patched keywords for ${data.id}`);
        }
      } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
      }
    }
  });
}

processDir(KNOWLEDGE_DIR);
console.log('🎉 Final keyword patch complete!');