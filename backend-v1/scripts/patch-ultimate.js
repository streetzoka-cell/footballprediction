const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');

// Forcefully overwrite aliases and keywords to eliminate all collisions
const ULTIMATE_PATCHES = {
  "switch_of_play": {
    aliases: ["switch of play", "switching play", "cross-field pass", "changing the point of attack"],
    keywords: ["switching the ball", "switching play", "cross-field pass"]
  },
  "law_02_ball": {
    aliases: ["the ball", "match ball", "football specifications", "defective ball"],
    keywords: ["weigh", "circumference", "pressure", "bursts"]
  },
  "law_05_referee": {
    aliases: ["referee", "advantage", "whistle", "caution", "sent off", "disciplinary"],
    keywords: ["advantage", "decision", "caution", "sent off"]
  },
  "law_07_duration": {
    aliases: ["duration", "half time", "stoppage time", "added time", "abandoned", "time lost", "extra time"],
    keywords: ["how long", "half-time", "stoppage", "added time", "injuries", "add time for injuries"]
  },
  "law_09_ball_in_out": {
    aliases: ["out of play", "in play", "wholly crossed", "touchline", "goal line", "referee contact"],
    keywords: ["out of play", "in play", "line", "referee", "ball is on the line", "ball hits the ref", "ball out", "touches the line", "goes in the goal"]
  },
  "law_11_offside": {
    aliases: ["offside", "offside rule", "offside position", "active play"],
    keywords: ["interfering", "gaining an advantage", "deliberate play", "deflection", "offside from a goal kick", "offside from a corner kick"]
  },
  "law_12_fouls_misconduct": {
    aliases: ["handball", "foul", "misconduct", "dogso", "dangerous play", "tackle", "violent conduct"],
    keywords: ["direct free kick", "indirect free kick", "handball", "backpass", "violent", "score with your hand", "yellow card", "red card"]
  },
  "law_13_free_kicks": {
    aliases: ["free kick", "wall", "10 yards", "retake"],
    keywords: ["free kick", "opponents", "distance", "directly"]
  },
  "law_14_penalty_kick": {
    aliases: ["penalty kick", "penalty", "spot kick", "encroachment", "penalty spot"],
    keywords: ["penalty spot", "encroaches", "goalkeeper line", "moves early", "kicker touches the ball twice"]
  },
  "law_16_goal_kick": {
    aliases: ["goal kick", "goalkick"],
    keywords: ["goal kick", "penalty area", "leave the box", "picks up"]
  },
  "law_17_corner_kick": {
    aliases: ["corner kick", "corner arc", "corner flag"],
    keywords: ["corner kick", "corner flag", "directly", "corner", "from a corner", "touches the ball twice from a corner"]
  }
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
        
        if (ULTIMATE_PATCHES[data.id]) {
          // Forcefully overwrite
          data.aliases = ULTIMATE_PATCHES[data.id].aliases;
          data.keywords = ULTIMATE_PATCHES[data.id].keywords;
          
          fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
          console.log(`✅ Overwrote aliases/keywords for ${data.id}`);
        }
      } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
      }
    }
  });
}

processDir(KNOWLEDGE_DIR);
console.log('🎉 Ultimate patch complete!');