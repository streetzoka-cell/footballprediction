const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');

const FIXES = {
  "build_up": { aliases: ["build from the back", "building from the back", "playing out from the back", "build-up", "building up", "build up play"] },
  "switch_of_play": { aliases: ["switching the ball", "switching play", "cross-field pass", "changing the point of attack"] },
  "overlap": { aliases: ["overlap", "overlapping run", "overlapping runs", "overlapping fullback"] },
  "inside_forward": { aliases: ["inside forward", "inverted winger", "wide forward"] },
  "law_01_field_of_play": { aliases: ["pitch", "field of play", "dimensions", "markings", "goal area", "crossbar", "goalpost", "touchline", "goal line", "penalty area", "goals"] },
  "law_05_referee": { aliases: ["referee", "advantage", "whistle", "injury", "caution", "sent off", "disciplinary", "yellow card", "red card"] },
  "law_07_duration": { aliases: ["duration", "half time", "stoppage time", "added time", "abandoned", "time lost", "extra time", "injuries"] },
  "law_08_start_restart": { aliases: ["kick-off", "kickoff", "dropped ball", "restart of play", "start of play", "play is stopped", "stopped"] },
  "law_09_ball_in_out": { aliases: ["out of play", "in play", "wholly crossed", "touchline", "goal line", "referee contact", "hits the referee"] },
  "law_12_fouls_misconduct": { aliases: ["handball", "foul", "misconduct", "red card", "yellow card", "dogso", "dangerous play", "tackle", "violent conduct", "score with your hand"] },
  "law_13_free_kicks": { aliases: ["free kick", "direct free kick", "indirect free kick", "wall", "10 yards", "retake"] },
  "law_14_penalty_kick": { aliases: ["penalty kick", "penalty", "spot kick", "encroachment", "penalty spot", "kicker", "touches the ball twice"] },
  "law_16_goal_kick": { aliases: ["goal kick", "goalkick"] },
  "law_17_corner_kick": { aliases: ["corner kick", "corner arc", "corner flag", "corner"] }
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
          fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
          console.log(`✅ Updated aliases for ${data.id}`);
        }
      } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
      }
    }
  });
}

processDir(KNOWLEDGE_DIR);
console.log('🎉 Final alias update complete!');