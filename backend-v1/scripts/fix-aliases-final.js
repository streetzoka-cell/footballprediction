const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');

// 1. Delete duplicate file
const invertedWingerPath = path.join(KNOWLEDGE_DIR, 'tactics', 'attacking', 'inverted_winger.json');
if (fs.existsSync(invertedWingerPath)) {
  fs.unlinkSync(invertedWingerPath);
  console.log('🗑️ Deleted duplicate file: inverted_winger.json');
}

// 2. Forcefully set correct aliases and keywords
const FIXES = {
  "law_02_ball": {
    aliases: ["the ball", "match ball", "football specifications", "defective ball"],
    keywords: ["weigh", "circumference", "pressure", "bursts"]
  },
  "law_05_referee": {
    aliases: ["referee", "advantage", "whistle", "injury", "caution", "sent off", "disciplinary", "yellow card", "red card"],
    keywords: ["advantage", "decision", "injury", "caution"]
  },
  "law_07_duration": {
    aliases: ["duration", "half time", "stoppage time", "added time", "abandoned", "time lost", "extra time"],
    keywords: ["how long", "half-time", "stoppage", "added time", "injuries"]
  },
  "law_08_start_restart": {
    aliases: ["kick-off", "kickoff", "dropped ball", "restart of play", "start of play", "play is stopped"],
    keywords: ["kick-off", "dropped ball", "stopped", "box"]
  },
  "law_09_ball_in_out": {
    aliases: ["out of play", "in play", "wholly crossed", "touchline", "goal line", "referee contact", "hits the referee"],
    keywords: ["out of play", "in play", "line", "referee"]
  },
  "law_12_fouls_misconduct": {
    aliases: ["handball", "foul", "misconduct", "red card", "dogso", "dangerous play", "tackle", "violent conduct"],
    keywords: ["direct free kick", "indirect free kick", "handball", "backpass", "violent", "score with your hand"]
  },
  "law_13_free_kicks": {
    aliases: ["free kick", "direct free kick", "indirect free kick", "wall", "10 yards", "retake"],
    keywords: ["free kick", "opponents", "distance", "directly"]
  },
  "law_14_penalty_kick": {
    aliases: ["penalty kick", "penalty", "spot kick", "encroachment", "penalty spot"],
    keywords: ["penalty spot", "encroachment", "goalkeeper line", "twice", "moves early"]
  },
  "law_16_goal_kick": {
    aliases: ["goal kick", "goalkick"],
    keywords: ["goal kick", "penalty area", "leave the box", "picks up"]
  },
  "law_17_corner_kick": {
    aliases: ["corner kick", "corner arc", "corner flag"],
    keywords: ["corner kick", "corner flag", "directly", "corner"]
  },
  "inside_forward": {
    aliases: ["inside forward", "inverted winger", "wide forward"],
    keywords: ["cut inside", "stronger foot"]
  },
  "switch_of_play": {
    aliases: ["switch of play", "switching the ball", "switching play", "cross-field pass", "changing the point of attack"],
    keywords: ["rapidly", "opposite side"]
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
        
        if (FIXES[data.id]) {
          data.aliases = FIXES[data.id].aliases;
          data.keywords = FIXES[data.id].keywords;
          fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
          console.log(`✅ Fixed aliases/keywords for ${data.id}`);
        }
      } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
      }
    }
  });
}

processDir(KNOWLEDGE_DIR);
console.log('🎉 Definitive alias fix complete!');