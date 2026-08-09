const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'laws');

// Restore aliases and add specific keywords to prevent collisions
const FIXES = {
  "law_01_field_of_play": {
    aliases: ["pitch", "field of play", "dimensions", "markings", "goal area", "crossbar", "goalpost", "touchline", "goal line", "penalty area"],
    keywords: ["penalty area", "goal area", "dimensions", "markings"]
  },
  "law_02_ball": {
    aliases: ["ball", "the ball", "match ball", "football specifications", "defective ball"],
    keywords: ["weigh", "circumference", "pressure", "bursts"]
  },
  "law_03_players": {
    aliases: ["players", "substitutes", "substitution", "minimum players", "extra person"],
    keywords: ["minimum number", "substitute", "enter"]
  },
  "law_04_equipment": {
    aliases: ["equipment", "jewelry", "shinguard", "kit", "shirt", "tape", "wedding ring"],
    keywords: ["compulsory", "colors", "shinguard"]
  },
  "law_05_referee": {
    aliases: ["referee", "advantage", "whistle", "injury", "caution", "sent off", "disciplinary", "yellow card", "red card"],
    keywords: ["advantage", "decision", "injury"]
  },
  "law_06_match_officials": {
    aliases: ["var", "assistant referee", "linesman", "fourth official", "match official", "video assistant"],
    keywords: ["var", "assistant", "review"]
  },
  "law_07_duration": {
    aliases: ["duration", "half time", "stoppage time", "added time", "abandoned", "time lost", "extra time"],
    keywords: ["how long", "half-time", "stoppage", "added time"]
  },
  "law_08_start_restart": {
    aliases: ["kick-off", "kickoff", "dropped ball", "restart of play", "start of play"],
    keywords: ["kick-off", "dropped ball", "stopped"]
  },
  "law_09_ball_in_out": {
    aliases: ["out of play", "in play", "wholly crossed", "touchline", "goal line", "referee contact"],
    keywords: ["out of play", "in play", "line", "referee"]
  },
  "law_10_match_outcome": {
    aliases: ["goal scored", "winning team", "draw", "penalty shootout", "kicks from the penalty mark", "outcome of the match"],
    keywords: ["winning team", "draw", "shootout", "disallowed"]
  },
  "law_11_offside": {
    aliases: ["offside", "offside rule", "offside position", "active play"],
    keywords: ["interfering", "gaining an advantage", "deliberate play", "deflection"]
  },
  "law_12_fouls_misconduct": {
    aliases: ["handball", "foul", "misconduct", "red card", "yellow card", "dogso", "dangerous play", "tackle", "violent conduct"],
    keywords: ["direct free kick", "indirect free kick", "handball", "backpass", "violent"]
  },
  "law_13_free_kicks": {
    aliases: ["free kick", "direct free kick", "indirect free kick", "wall", "10 yards", "retake"],
    keywords: ["free kick", "opponents", "distance"]
  },
  "law_14_penalty_kick": {
    aliases: ["penalty kick", "penalty", "spot kick", "encroachment", "penalty spot"],
    keywords: ["penalty spot", "encroachment", "goalkeeper line", "twice"]
  },
  "law_15_throw_in": {
    aliases: ["throw-in", "throw in", "throwin"],
    keywords: ["throw-in", "feet", "delivered"]
  },
  "law_16_goal_kick": {
    aliases: ["goal kick", "goalkick"],
    keywords: ["goal kick", "penalty area", "leave the box"]
  },
  "law_17_corner_kick": {
    aliases: ["corner kick", "corner arc", "corner flag"],
    keywords: ["corner kick", "corner flag", "directly"]
  }
};

fs.readdirSync(KNOWLEDGE_DIR).forEach(file => {
  const filePath = path.join(KNOWLEDGE_DIR, file);
  try {
    let content = fs.readFileSync(filePath, 'utf8').trim();
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    const data = JSON.parse(content);
    
    if (FIXES[data.id]) {
      data.aliases = FIXES[data.id].aliases;
      data.keywords = FIXES[data.id].keywords;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`✅ Fixed aliases/keywords for ${data.id}`);
    }
  } catch (e) {
    console.error(`Error processing ${file}: ${e.message}`);
  }
});
console.log('🎉 Law aliases/keywords restoration complete!');