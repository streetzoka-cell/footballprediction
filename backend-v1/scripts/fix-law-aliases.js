const fs = require('fs');
const path = require('path');

const LAWS_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'laws');

const ALIAS_MAP = {
  "law_01_field_of_play": ["pitch", "field of play", "dimensions", "markings", "goal area", "crossbar", "goalpost", "touchline", "goal line"],
  "law_02_ball": ["ball", "the ball", "match ball", "football specifications", "defective ball"],
  "law_03_players": ["players", "substitutes", "substitution", "minimum players", "extra person"],
  "law_04_equipment": ["equipment", "jewelry", "shinguard", "kit", "shirt", "tape", "wedding ring"],
  "law_05_referee": ["referee", "advantage", "whistle", "injury", "caution", "sent off", "disciplinary"],
  "law_06_match_officials": ["var", "assistant referee", "linesman", "fourth official", "match official", "video assistant"],
  "law_07_duration": ["duration", "half time", "stoppage time", "added time", "abandoned", "time lost", "extra time"],
  "law_08_start_restart": ["kick-off", "kickoff", "dropped ball", "restart of play", "start of play"],
  "law_09_ball_in_out": ["out of play", "in play", "wholly crossed", "touchline", "goal line", "referee contact"],
  "law_10_match_outcome": ["goal scored", "winning team", "draw", "penalty shootout", "kicks from the penalty mark", "outcome of the match"],
  "law_11_offside": ["offside", "offside rule", "offside position", "active play"],
  "law_12_fouls_misconduct": ["handball", "foul", "misconduct", "red card", "yellow card", "dogso", "dangerous play", "tackle"],
  "law_13_free_kicks": ["free kick", "direct free kick", "indirect free kick", "wall", "10 yards", "retake"],
  "law_14_penalty_kick": ["penalty kick", "penalty", "spot kick", "encroachment", "penalty spot"],
  "law_15_throw_in": ["throw-in", "throw in", "throwin"],
  "law_16_goal_kick": ["goal kick", "goalkick"],
  "law_17_corner_kick": ["corner kick", "corner", "corner arc", "corner flag"]
};

fs.readdirSync(LAWS_DIR).forEach(file => {
  if (file.endsWith('.json')) {
    const filePath = path.join(LAWS_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8').trim();
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    
    let data = JSON.parse(content);
    
    if (!data.aliases && ALIAS_MAP[data.id]) {
      data.aliases = ALIAS_MAP[data.id];
      data.category = "laws";
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`✅ Added aliases to ${file}`);
    }
  }
});
console.log('Done!');