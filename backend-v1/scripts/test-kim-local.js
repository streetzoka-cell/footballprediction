const kimEngine = require('../src/services/KimLocalEngine');

const testSuite = [
  // 1. WORLD CUP HISTORY (35 Tests)
  { query: "Who won the 2014 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 2018 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the first World Cup?", expectedId: "world_cup_tournaments" },
  { query: "What was the 2022 World Cup final score?", expectedId: "world_cup_finals" },
  { query: "Who has won the World Cup most?", expectedId: "world_cup_records" },
  { query: "How many teams played in the 1998 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "How many matches were played in 2022?", expectedId: "world_cup_tournaments" },
  { query: "Winner of the 2010 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 2002 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Top scorer in 2022?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 2006 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Runner up in 2014?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1986 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1994 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1970 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the last World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 2006 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1958 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 2018 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1990 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1934 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1950 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1966 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1978 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1982 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who won the 1998 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1990 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1978 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1982 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1970 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1962 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1954 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1938 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1930 World Cup?", expectedId: "world_cup_tournaments" },
  { query: "Who hosted the 1950 World Cup?", expectedId: "world_cup_tournaments" },

  // 2. TACTICS & CONCEPTS (45 Tests)
  { query: "What is gegenpressing?", expectedId: "gegenpressing" },
  { query: "Define counter pressing.", expectedId: "gegenpressing" },
  { query: "How does gegenpressing work?", expectedId: "gegenpressing" },
  { query: "Why do teams use gegenpressing?", expectedId: "gegenpressing" },
  { query: "What are the weaknesses of gegenpressing?", expectedId: "gegenpressing" },
  { query: "Explain a false 9", expectedId: "false_9" },
  { query: "What is a false nine?", expectedId: "false_9" },
  { query: "How does a false 9 work?", expectedId: "false_9" },
  { query: "Advantages of a false 9", expectedId: "false_9" },
  { query: "Weaknesses of a false 9", expectedId: "false_9" },
  { query: "What is a low block?", expectedId: "low_block" },
  { query: "Define parking the bus.", expectedId: "low_block" },
  { query: "How does a low block work?", expectedId: "low_block" },
  { query: "Why use a low block?", expectedId: "low_block" },
  { query: "Weaknesses of a low block", expectedId: "low_block" },
  { query: "What is compactness?", expectedId: "compactness" },
  { query: "Explain defensive compactness.", expectedId: "compactness" },
  { query: "Advantages of compactness", expectedId: "compactness" },
  { query: "What is build-up play?", expectedId: "build_up" },
  { query: "Explain playing out from the back.", expectedId: "build_up" },
  { query: "How does build-up play beat a high press?", expectedId: "build_up" },
  { query: "Risks of building from the back", expectedId: "build_up" },
  { query: "What is a switch of play?", expectedId: "switch_of_play" },
  { query: "Define changing the point of attack.", expectedId: "switch_of_play" },
  { query: "Advantages of switching the ball", expectedId: "switch_of_play" },
  { query: "What is an overlap?", expectedId: "overlap" },
  { query: "Explain overlapping runs.", expectedId: "overlap" },
  { query: "How does an overlap work?", expectedId: "overlap" },
  { query: "What is numerical superiority?", expectedId: "numerical_superiority" },
  { query: "Explain creating an overload.", expectedId: "numerical_superiority" },
  { query: "What is a pressing trap?", expectedId: "pressing_trap" },
  { query: "How does a pressing trap work?", expectedId: "pressing_trap" },
  { query: "What is a counter attack?", expectedId: "counter_attack" },
  { query: "Explain transition attack.", expectedId: "counter_attack" },
  { query: "What is rest defence?", expectedId: "rest_defence" },
  { query: "Explain defensive balance.", expectedId: "rest_defence" },
  { query: "What is man marking?", expectedId: "man_marking" },
  { query: "Explain man-to-man marking.", expectedId: "man_marking" },
  { query: "What is a mid block?", expectedId: "mid_block" },
  { query: "Define half-court press.", expectedId: "mid_block" },
  { query: "What is width and depth?", expectedId: "width_and_depth" },
  { query: "Explain stretching the pitch.", expectedId: "width_and_depth" },
  { query: "What are half-spaces?", expectedId: "half_spaces" },
  { query: "Explain the inside channel.", expectedId: "half_spaces" },
  { query: "What is between the lines?", expectedId: "between_lines" },

  // 3. FORMATIONS & COMPARISONS (30 Tests)
  { query: "What is a 4-3-3 formation?", expectedId: "4-3-3" },
  { query: "Explain 4-3-3.", expectedId: "4-3-3" },
  { query: "Strengths of 4-3-3", expectedId: "4-3-3" },
  { query: "Weaknesses of 4-3-3", expectedId: "4-3-3" },
  { query: "What is a 4-2-3-1 formation?", expectedId: "4-2-3-1" },
  { query: "Explain 4-2-3-1.", expectedId: "4-2-3-1" },
  { query: "Strengths of 4-2-3-1", expectedId: "4-2-3-1" },
  { query: "Weaknesses of 4-2-3-1", expectedId: "4-2-3-1" },
  { query: "What is a 4-4-2 formation?", expectedId: "4-4-2" },
  { query: "Explain 4-4-2.", expectedId: "4-4-2" },
  { query: "Strengths of 4-4-2", expectedId: "4-4-2" },
  { query: "Weaknesses of 4-4-2", expectedId: "4-4-2" },
  { query: "What is a 3-5-2 formation?", expectedId: "3-5-2" },
  { query: "Explain 3-5-2.", expectedId: "3-5-2" },
  { query: "Strengths of 3-5-2", expectedId: "3-5-2" },
  { query: "Weaknesses of 3-5-2", expectedId: "3-5-2" },
  { query: "What is a 3-4-3 formation?", expectedId: "3-4-3" },
  { query: "Explain 3-4-3.", expectedId: "3-4-3" },
  { query: "4-3-3 vs 4-2-3-1", expectedId: "comparison" },
  { query: "4-3-3 vs 4-4-2", expectedId: "comparison" },
  { query: "4-2-3-1 vs 4-4-2", expectedId: "comparison" },
  { query: "4-3-3 vs 3-5-2", expectedId: "comparison" },
  { query: "3-5-2 vs 3-4-3", expectedId: "comparison" },
  { query: "4-4-2 vs 3-5-2", expectedId: "comparison" },
  { query: "Compare 4-3-3 and 4-2-3-1", expectedId: "comparison" },
  { query: "Compare 4-3-3 with 4-4-2", expectedId: "comparison" },
  { query: "Difference between 4-3-3 and 4-2-3-1", expectedId: "comparison" },
  { query: "Difference between 4-3-3 and 4-4-2", expectedId: "comparison" },
  { query: "Difference between 3-5-2 and 3-4-3", expectedId: "comparison" },
  { query: "Difference between 4-4-2 and 3-5-2", expectedId: "comparison" },

  // 4. POSITIONS (40 Tests)
  { query: "What is a sweeper keeper?", expectedId: "sweeper_keeper" },
  { query: "Explain modern goalkeeper.", expectedId: "sweeper_keeper" },
  { query: "How does a sweeper keeper work?", expectedId: "sweeper_keeper" },
  { query: "Weaknesses of a sweeper keeper", expectedId: "sweeper_keeper" },
  { query: "What is a center-back?", expectedId: "center_back" },
  { query: "Explain central defender.", expectedId: "center_back" },
  { query: "How does a center-back work?", expectedId: "center_back" },
  { query: "Weaknesses of a center-back", expectedId: "center_back" },
  { query: "What is a defensive midfielder?", expectedId: "defensive_midfielder" },
  { query: "Explain number 6.", expectedId: "defensive_midfielder" },
  { query: "How does a defensive midfielder work?", expectedId: "defensive_midfielder" },
  { query: "Weaknesses of a defensive midfielder", expectedId: "defensive_midfielder" },
  { query: "What is an attacking midfielder?", expectedId: "attacking_midfielder" },
  { query: "Explain number 10.", expectedId: "attacking_midfielder" },
  { query: "How does an attacking midfielder work?", expectedId: "attacking_midfielder" },
  { query: "Weaknesses of an attacking midfielder", expectedId: "attacking_midfielder" },
  { query: "What is a striker?", expectedId: "striker" },
  { query: "Explain number 9.", expectedId: "striker" },
  { query: "How does a striker work?", expectedId: "striker" },
  { query: "Weaknesses of a striker", expectedId: "striker" },
  { query: "What is a fullback?", expectedId: "fullback" },
  { query: "Explain left back.", expectedId: "fullback" },
  { query: "How does a fullback work?", expectedId: "fullback" },
  { query: "Weaknesses of a fullback", expectedId: "fullback" },
  { query: "What is a wingback?", expectedId: "wingback" },
  { query: "Explain right wing-back.", expectedId: "wingback" },
  { query: "How does a wingback work?", expectedId: "wingback" },
  { query: "Weaknesses of a wingback", expectedId: "wingback" },
  { query: "What is an inside forward?", expectedId: "inside_forward" },
  { query: "Explain inverted winger.", expectedId: "inside_forward" },
  { query: "How does an inside forward work?", expectedId: "inside_forward" },
  { query: "Weaknesses of an inside forward", expectedId: "inside_forward" },
  { query: "What is a target man?", expectedId: "target_man" },
  { query: "Explain target forward.", expectedId: "target_man" },
  { query: "How does a target man work?", expectedId: "target_man" },
  { query: "Advantages of a target man", expectedId: "target_man" },
  { query: "What is a regista?", expectedId: "regista" },
  { query: "What is a trequartista?", expectedId: "trequartista" },
  { query: "What is a double pivot?", expectedId: "double_pivot" },
  { query: "Explain two defensive midfielders.", expectedId: "double_pivot" },

  // 5. TERMINOLOGY (45 Tests)
  { query: "What is xG?", expectedId: "expected_goals" },
  { query: "Define expected goals.", expectedId: "expected_goals" },
  { query: "How does xG work?", expectedId: "expected_goals" },
  { query: "What is xA?", expectedId: "expected_assists" },
  { query: "Define expected assists.", expectedId: "expected_assists" },
  { query: "What is PPDA?", expectedId: "ppda" },
  { query: "Define pressing intensity.", expectedId: "ppda" },
  { query: "What are progressive carries?", expectedId: "progressive_carries" },
  { query: "Define ball carrying.", expectedId: "progressive_carries" },
  { query: "What is a clean sheet?", expectedId: "clean_sheet" },
  { query: "Define shutout.", expectedId: "clean_sheet" },
  { query: "What is a hat-trick?", expectedId: "hat_trick" },
  { query: "Define three goals.", expectedId: "hat_trick" },
  { query: "What is a brace?", expectedId: "brace" },
  { query: "Explain regista.", expectedId: "regista" },
  { query: "What is a double pivot?", expectedId: "double_pivot" },
  { query: "What is a trequartista?", expectedId: "trequartista" },
  { query: "What is a target man?", expectedId: "target_man" },
  { query: "Explain target forward.", expectedId: "target_man" },
  { query: "What is gegenpressing?", expectedId: "gegenpressing" },
  { query: "Define counter pressing.", expectedId: "gegenpressing" },
  { query: "What is a false 9?", expectedId: "false_9" },
  { query: "Explain false nine.", expectedId: "false_9" },
  { query: "What is a low block?", expectedId: "low_block" },
  { query: "Define parking the bus.", expectedId: "low_block" },
  { query: "What is compactness?", expectedId: "compactness" },
  { query: "What is build-up play?", expectedId: "build_up" },
  { query: "Explain playing out from the back.", expectedId: "build_up" },
  { query: "What is a switch of play?", expectedId: "switch_of_play" },
  { query: "Define changing the point of attack.", expectedId: "switch_of_play" },
  { query: "What is an overlap?", expectedId: "overlap" },
  { query: "Explain overlapping runs.", expectedId: "overlap" },
  { query: "What is numerical superiority?", expectedId: "numerical_superiority" },
  { query: "Explain creating an overload.", expectedId: "numerical_superiority" },
  { query: "What is a pressing trap?", expectedId: "pressing_trap" },
  { query: "What is a counter attack?", expectedId: "counter_attack" },
  { query: "What is rest defence?", expectedId: "rest_defence" },
  { query: "What is man marking?", expectedId: "man_marking" },
  { query: "What is a mid block?", expectedId: "mid_block" },
  { query: "What is width and depth?", expectedId: "width_and_depth" },
  { query: "What are half-spaces?", expectedId: "half_spaces" },
  { query: "What is between the lines?", expectedId: "between_lines" },
  { query: "What is a target man?", expectedId: "target_man" },
  { query: "What is a regista?", expectedId: "regista" },
  { query: "What is a trequartista?", expectedId: "trequartista" },

  // 6. IFAB LAWS (100 Tests)
  // Law 1
  { query: "What is the field of play?", expectedId: "law_01_field_of_play" },
  { query: "Dimensions of the pitch?", expectedId: "law_01_field_of_play" },
  { query: "What is the goal area?", expectedId: "law_01_field_of_play" },
  { query: "What is the penalty area?", expectedId: "law_01_field_of_play" },
  { query: "What are the markings?", expectedId: "law_01_field_of_play" },
  { query: "What are the goals?", expectedId: "law_01_field_of_play" },
  // Law 2
  { query: "What is the ball?", expectedId: "law_02_ball" },
  { query: "Specifications of the ball?", expectedId: "law_02_ball" },
  { query: "What happens if the ball bursts?", expectedId: "law_02_ball" },
  { query: "Replacement of a defective ball?", expectedId: "law_02_ball" },
  { query: "How much should a football weigh?", expectedId: "law_02_ball" },
  // Law 3
  { query: "What is the minimum number of players?", expectedId: "law_03_players" },
  { query: "How many players on a team?", expectedId: "law_03_players" },
  { query: "Substitution procedure?", expectedId: "law_03_players" },
  { query: "Can a substitute enter before the player leaves?", expectedId: "law_03_players" },
  { query: "What happens if a team has 6 players?", expectedId: "law_03_players" },
  // Law 4
  { query: "What is compulsory equipment?", expectedId: "law_04_equipment" },
  { query: "Can a player tape over their wedding ring?", expectedId: "law_04_equipment" },
  { query: "What are the rules on jewelry?", expectedId: "law_04_equipment" },
  { query: "What colors must teams wear?", expectedId: "law_04_equipment" },
  { query: "What is a shinguard?", expectedId: "law_04_equipment" },
  // Law 5
  { query: "What is the referee's authority?", expectedId: "law_05_referee" },
  { query: "Can a referee change a decision?", expectedId: "law_05_referee" },
  { query: "What is advantage?", expectedId: "law_05_referee" },
  { query: "When can a referee stop for an injury?", expectedId: "law_05_referee" },
  { query: "What is a yellow card?", expectedId: "law_12_fouls_misconduct" }, // Fixed ID
  // Law 6
  { query: "What is VAR?", expectedId: "law_06_match_officials" },
  { query: "What does an assistant referee do?", expectedId: "law_06_match_officials" },
  { query: "Who is the fourth official?", expectedId: "law_06_match_officials" },
  { query: "What situations can VAR review?", expectedId: "law_06_match_officials" },
  { query: "Who has the final say with VAR?", expectedId: "law_06_match_officials" },
  // Law 7
  { query: "How long is a football match?", expectedId: "law_07_duration" },
  { query: "What is half-time?", expectedId: "law_07_duration" },
  { query: "What is stoppage time?", expectedId: "law_07_duration" },
  { query: "What happens if a match is abandoned?", expectedId: "law_07_duration" },
  { query: "Can the referee add time for injuries?", expectedId: "law_07_duration" },
  // Law 8
  { query: "What is a kick-off?", expectedId: "law_08_start_restart" },
  { query: "Can you score directly from kick-off?", expectedId: "law_08_start_restart" },
  { query: "What is a dropped ball?", expectedId: "law_08_start_restart" },
  { query: "Who gets the ball if play is stopped inside the box?", expectedId: "law_08_start_restart" },
  { query: "Who gets the ball if play is stopped outside the box?", expectedId: "law_08_start_restart" },
  // Law 9
  { query: "When is the ball out of play?", expectedId: "law_09_ball_in_out" },
  { query: "If the ball is on the line, is it out?", expectedId: "law_09_ball_in_out" },
  { query: "What happens if the ball hits the referee?", expectedId: "law_09_ball_in_out" },
  { query: "What if the ball hits the ref and goes in the goal?", expectedId: "law_09_ball_in_out" },
  { query: "Is the ball out if it touches the line?", expectedId: "law_09_ball_in_out" },
  // Law 10
  { query: "How is a goal scored?", expectedId: "law_10_match_outcome" },
  { query: "Who is the winning team?", expectedId: "law_10_match_outcome" },
  { query: "What is a penalty shootout?", expectedId: "law_10_match_outcome" },
  { query: "Can a goal be disallowed for a foul?", expectedId: "law_10_match_outcome" },
  { query: "What happens if a penalty shootout is tied after 5 kicks?", expectedId: "law_10_match_outcome" },
  // Law 11
  { query: "What is the offside rule?", expectedId: "law_11_offside" },
  { query: "What is an offside position?", expectedId: "law_11_offside" },
  { query: "Is being offside a foul?", expectedId: "law_11_offside" },
  { query: "What is an offside offense?", expectedId: "law_11_offside" },
  { query: "Can you be offside from a goal kick?", expectedId: "law_11_offside" },
  { query: "Can you be offside from a throw-in?", expectedId: "law_11_offside" },
  { query: "Can you be offside from a corner kick?", expectedId: "law_11_offside" },
  { query: "What is interfering with play?", expectedId: "law_11_offside" },
  { query: "What is gaining an advantage?", expectedId: "law_11_offside" },
  { query: "What is deliberate play vs deflection?", expectedId: "law_11_offside" },
  // Law 12
  { query: "What is a direct free kick?", expectedId: "law_12_fouls_misconduct" },
  { query: "What is an indirect free kick?", expectedId: "law_12_fouls_misconduct" },
  { query: "What is a handball?", expectedId: "law_12_fouls_misconduct" },
  { query: "Can you score with your hand accidentally?", expectedId: "law_12_fouls_misconduct" },
  { query: "What is a red card?", expectedId: "law_12_fouls_misconduct" }, // Fixed ID
  { query: "What is DOGSO?", expectedId: "law_12_fouls_misconduct" },
  { query: "What is serious foul play?", expectedId: "law_12_fouls_misconduct" },
  { query: "Can a goalkeeper handle a backpass?", expectedId: "law_12_fouls_misconduct" },
  { query: "What is violent conduct?", expectedId: "law_12_fouls_misconduct" },
  { query: "What is a yellow card?", expectedId: "law_12_fouls_misconduct" }, // Fixed ID
  // Law 13
  { query: "What is a free kick?", expectedId: "law_13_free_kicks" },
  { query: "Can you score directly from a direct free kick?", expectedId: "law_13_free_kicks" },
  { query: "Can you score directly from an indirect free kick?", expectedId: "law_13_free_kicks" },
  { query: "How far must opponents be from a free kick?", expectedId: "law_13_free_kicks" },
  { query: "What happens if an opponent is too close to a quick free kick?", expectedId: "law_13_free_kicks" },
  // Law 14
  { query: "What is a penalty kick?", expectedId: "law_14_penalty_kick" },
  { query: "How far is the penalty spot?", expectedId: "law_14_penalty_kick" },
  { query: "Where must the goalkeeper be during a penalty?", expectedId: "law_14_penalty_kick" },
  { query: "What is encroachment?", expectedId: "law_14_penalty_kick" },
  { query: "What happens if the kicker touches the ball twice?", expectedId: "law_14_penalty_kick" },
  { query: "Can a penalty be retaken?", expectedId: "law_14_penalty_kick" },
  { query: "What if the goalkeeper moves early and saves it?", expectedId: "law_14_penalty_kick" },
  { query: "What if an attacker encroaches and scores?", expectedId: "law_14_penalty_kick" },
  // Law 15
  { query: "What is a throw-in?", expectedId: "law_15_throw_in" },
  { query: "Can you score directly from a throw-in?", expectedId: "law_15_throw_in" },
  { query: "How must a throw-in be taken?", expectedId: "law_15_throw_in" },
  { query: "Where must the feet be for a throw-in?", expectedId: "law_15_throw_in" },
  { query: "What happens if a throw-in is taken incorrectly?", expectedId: "law_15_throw_in" },
  // Law 16
  { query: "What is a goal kick?", expectedId: "law_16_goal_kick" },
  { query: "Can you score directly from a goal kick?", expectedId: "law_16_goal_kick" },
  { query: "Does the ball have to leave the box for a goal kick?", expectedId: "law_16_goal_kick" },
  { query: "Where must opponents be for a goal kick?", expectedId: "law_16_goal_kick" },
  { query: "What if the keeper picks up a goal kick?", expectedId: "law_16_goal_kick" },
  // Law 17
  { query: "What is a corner kick?", expectedId: "law_17_corner_kick" },
  { query: "Can you score directly from a corner kick?", expectedId: "law_17_corner_kick" },
  { query: "Can you move the corner flag?", expectedId: "law_17_corner_kick" },
  { query: "How far must opponents be from a corner?", expectedId: "law_17_corner_kick" },
  { query: "What if the kicker touches the ball twice from a corner?", expectedId: "law_17_corner_kick" }
];

async function runTests() {
  console.log(
  `🧠 Starting Kim Local Master Test Suite (${testSuite.length} Tests)...\n`
);
  let passed = 0;
  let failed = 0;
  const failedTests = [];

  for (const test of testSuite) {
    const result = await kimEngine.resolveQuery(test.query);
    
    const isLocal = result.status === "ANSWERED_LOCALLY";
    const hasCorrectId = result.routedKnowledge?.includes(test.expectedId) || (test.expectedId === 'comparison' && result.routedKnowledge?.length >= 2);
    
    if (isLocal && hasCorrectId) {
      passed++;
    } else {
      failed++;
      failedTests.push({
        query: test.query,
        expectedId: test.expectedId,
        routedIds: result.routedKnowledge,
        reason: !isLocal ? 'Did not answer locally' : 'Routed to wrong concept'
      });
    }
  }

  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`Total Tests: ${testSuite.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n--- FAILED TESTS ---');
    failedTests.forEach(t => {
      console.log(`❌ "${t.query}"`);
      console.log(`   Expected ID: "${t.expectedId}" | Routed to: [${t.routedIds?.join(', ')}] | Reason: ${t.reason}\n`);
    });
  }

  if (failed === 0) {
    console.log('\n🏆 PERFECT SCORE! Kim is a flawless local football genius.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the routing logic or JSON data.');
  }
}

runTests().catch(console.error);