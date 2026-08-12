const kim = require('../src/kim/KimOrchestrator');

const tests = [

  // ============================================================
  // 1. WORLD CUP
  // ============================================================

  {
    uid: 'wc-001',
    message: 'Who won the 2014 FIFA World Cup?',
    required: ['Germany'],
    forbidden: ['Brazil', 'Argentina']
  },

  {
    uid: 'wc-002',
    message: 'What was the score of Brazil vs Germany in the 2014 World Cup?',
    expectIntent: 'match_result',
    required: ['Brazil 1 - 7 Germany'],
    forbidden: ['2 - 1', '1 - 0']
  },

  {
    uid: 'wc-003',
    message: 'Who scored the winning goal in the 2014 World Cup final?',
    required: ['Götze', 'Gotze'],
    forbidden: ['Messi', 'Neymar']
  },

  {
    uid: 'wc-004',
    message: 'Who won the 2002 World Cup?',
    required: ['Brazil'],
    forbidden: ['Germany', 'Argentina']
  },

  {
    uid: 'wc-005',
    message: 'Which country has won the most FIFA World Cups?',
    required: ['Brazil', '5', 'five'],
    forbidden: ['Germany', 'Argentina']
  },

  {
    uid: 'wc-006',
    message: 'Who won the 2022 World Cup?',
    required: ['Argentina'],
    forbidden: ['France', 'Brazil']
  },

  {
    uid: 'wc-007',
    message: 'Who did Argentina beat in the 2022 World Cup final?',
    required: ['France'],
    forbidden: ['Brazil', 'Croatia']
  },

  {
    uid: 'wc-008',
    message: 'Who scored a hat-trick in the 2022 World Cup final?',
    required: ['Mbappé', 'Mbappe'],
    forbidden: ['Messi scored the hat-trick']
  },

  {
    uid: 'wc-009',
    message: 'Which African country reached the 2022 World Cup semi-final?',
    required: ['Morocco'],
    forbidden: ['Egypt', 'Nigeria', 'Ghana']
  },


  // ============================================================
  // 2. INTERNATIONAL FOOTBALL
  // ============================================================

  {
    uid: 'intl-001',
    message: 'Which country has won the most international football World Cups?',
    required: ['Brazil'],
    forbidden: ['Germany']
  },

  {
    uid: 'intl-002',
    message: 'Who has scored the most goals in men’s international football?',
    required: ['Cristiano Ronaldo', 'Ronaldo'],
    forbidden: ['Messi']
  },

  {
    uid: 'intl-003',
    message: 'Which country won Euro 2016?',
    required: ['Portugal'],
    forbidden: ['France', 'Germany']
  },

  {
    uid: 'intl-004',
    message: 'Which country won Euro 2020?',
    required: ['Italy'],
    forbidden: ['England', 'France']
  },

  {
    uid: 'intl-005',
    message: 'Which country won Copa América 2021?',
    required: ['Argentina'],
    forbidden: ['Brazil']
  },

  {
    uid: 'intl-006',
    message: 'Which country has won AFCON the most times?',
    required: ['Egypt'],
    forbidden: ['Nigeria', 'Cameroon']
  },


  // ============================================================
  // 3. CHAMPIONS LEAGUE
  // ============================================================

  {
    uid: 'ucl-001',
    message: 'Which club has won the Champions League the most times?',
    required: ['Real Madrid'],
    forbidden: ['Barcelona', 'Bayern']
  },

  {
    uid: 'ucl-002',
    message: 'Who won the 2005 Champions League final?',
    required: ['Liverpool'],
    forbidden: ['AC Milan won']
  },

  {
    uid: 'ucl-003',
    message: 'What was the score in the 2005 Champions League final?',
    expectIntent: 'match_result',
    required: ['3 - 3', '3-3'],
    forbidden: ['2 - 1', '1 - 0']
  },

  {
    uid: 'ucl-004',
    message: 'Who scored the winning goal in the 1999 Champions League final?',
    required: ['Solskjær', 'Solskjaer'],
    forbidden: ['Beckham scored the winner']
  },

  {
    uid: 'ucl-005',
    message: 'Which club won the 2012 Champions League?',
    required: ['Chelsea'],
    forbidden: ['Bayern', 'Barcelona']
  },

  {
    uid: 'ucl-006',
    message: 'Who scored the winning goal in the 2012 Champions League final?',
    required: ['Drogba'],
    forbidden: ['Lampard', 'Robben']
  },


  // ============================================================
  // 4. EUROPA LEAGUE
  // ============================================================

  {
    uid: 'uel-001',
    message: 'Which club has won the Europa League the most times?',
    required: ['Sevilla'],
    forbidden: ['Liverpool', 'Chelsea']
  },

  {
    uid: 'uel-002',
    message: 'Who won the 2016 Europa League?',
    required: ['Sevilla'],
    forbidden: ['Liverpool']
  },

  {
    uid: 'uel-003',
    message: 'Who won the 2023 Europa League?',
    required: ['Sevilla'],
    forbidden: ['Roma', 'Manchester United']
  },


  // ============================================================
  // 5. CONFERENCE LEAGUE
  // ============================================================

  {
    uid: 'uecl-001',
    message: 'Who won the first UEFA Conference League?',
    required: ['Roma'],
    forbidden: ['Feyenoord']
  },

  {
    uid: 'uecl-002',
    message: 'Who won the 2023 Europa Conference League?',
    required: ['West Ham'],
    forbidden: ['Fiorentina']
  },


  // ============================================================
  // 6. PREMIER LEAGUE
  // ============================================================

  {
    uid: 'epl-001',
    message: 'Who won the first Premier League title?',
    required: ['Manchester United'],
    forbidden: ['Arsenal', 'Liverpool']
  },

  {
    uid: 'epl-002',
    message: 'Who is the Premier League all-time top scorer?',
    required: ['Alan Shearer', 'Shearer'],
    forbidden: ['Haaland', 'Henry']
  },

  {
    uid: 'epl-003',
    message: 'Which club went unbeaten in the 2003/04 Premier League season?',
    required: ['Arsenal'],
    forbidden: ['Manchester United', 'Chelsea']
  },

  {
    uid: 'epl-004',
    message: 'Who scored 36 Premier League goals in 2022/23?',
    required: ['Haaland'],
    forbidden: ['Kane', 'Salah']
  },

  {
    uid: 'epl-005',
    message: 'Which club plays at Anfield?',
    required: ['Liverpool'],
    forbidden: ['Everton']
  },

  {
    uid: 'epl-006',
    message: 'Which club plays at Old Trafford?',
    required: ['Manchester United'],
    forbidden: ['Manchester City']
  },


  // ============================================================
  // 7. SERIE A
  // ============================================================

  {
    uid: 'seriea-001',
    message: 'Which club has won Serie A the most times?',
    required: ['Juventus'],
    forbidden: ['Inter', 'Milan']
  },

  {
    uid: 'seriea-002',
    message: 'Who won Serie A in the 2023/24 season?',
    required: ['Inter'],
    forbidden: ['Juventus', 'Milan']
  },

  {
    uid: 'seriea-003',
    message: 'Which club is nicknamed the Old Lady?',
    required: ['Juventus'],
    forbidden: ['Inter']
  },

  {
    uid: 'seriea-004',
    message: 'Who is one of Serie A’s greatest all-time goalscorers, known as the Divine Ponytail?',
    required: ['Roberto Baggio', 'Baggio'],
    forbidden: ['Del Piero']
  },


  // ============================================================
  // 8. LA LIGA
  // ============================================================

  {
    uid: 'laliga-001',
    message: 'Which club has won La Liga the most times?',
    required: ['Real Madrid'],
    forbidden: ['Barcelona']
  },

  {
    uid: 'laliga-002',
    message: 'Which club plays at Camp Nou?',
    required: ['Barcelona'],
    forbidden: ['Real Madrid']
  },

  {
    uid: 'laliga-003',
    message: 'Who won La Liga in the 2023/24 season?',
    required: ['Real Madrid'],
    forbidden: ['Barcelona', 'Atlético']
  },


  // ============================================================
  // 9. BUNDESLIGA
  // ============================================================

  {
    uid: 'bundesliga-001',
    message: 'Which club has won the Bundesliga the most times?',
    required: ['Bayern Munich', 'Bayern'],
    forbidden: ['Dortmund']
  },

  {
    uid: 'bundesliga-002',
    message: 'Which club ended Bayern Munich’s Bundesliga dominance in 2023/24?',
    required: ['Bayer Leverkusen', 'Leverkusen'],
    forbidden: ['Dortmund', 'Leipzig']
  },

  {
    uid: 'bundesliga-003',
    message: 'Which German club is known as Die Schwarzgelben?',
    required: ['Borussia Dortmund', 'Dortmund'],
    forbidden: ['Bayern Munich']
  },


  // ============================================================
  // 10. LIGUE 1
  // ============================================================

  {
    uid: 'ligue1-001',
    message: 'Which French club has won Ligue 1 the most times?',
    required: ['Paris Saint-Germain', 'PSG'],
    forbidden: ['Marseille']
  },

  {
    uid: 'ligue1-002',
    message: 'Which club did Kylian Mbappé play for in France before leaving for Real Madrid?',
    required: ['PSG', 'Paris Saint-Germain'],
    forbidden: ['Lyon', 'Marseille']
  },


  // ============================================================
  // 11. AFRICAN FOOTBALL
  // ============================================================

  {
    uid: 'africa-001',
    message: 'Which country has won AFCON the most times?',
    required: ['Egypt'],
    forbidden: ['Cameroon', 'Nigeria']
  },

  {
    uid: 'africa-002',
    message: 'Which African country reached the 2022 World Cup semi-final?',
    required: ['Morocco'],
    forbidden: ['Ghana', 'Nigeria']
  },

  {
    uid: 'africa-003',
    message: 'Which country won AFCON 2023?',
    required: ['Ivory Coast', 'Côte d’Ivoire'],
    forbidden: ['Nigeria']
  },


  // ============================================================
  // 12. KENYAN FOOTBALL
  // ============================================================

  {
    uid: 'kenya-001',
    message: 'What is Kenya’s national football team commonly called?',
    required: ['Harambee Stars'],
    forbidden: ['Black Stars']
  },

  {
    uid: 'kenya-002',
    message: 'Which club is one of the most successful in Kenyan football and is known as Gor Mahia?',
    required: ['Gor Mahia'],
    forbidden: ['AFC Leopards']
  },


  // ============================================================
  // 13. CLUB WORLD CUP
  // ============================================================

  {
    uid: 'cwc-001',
    message: 'Which club has historically won the FIFA Club World Cup the most times?',
    required: ['Real Madrid'],
    forbidden: ['Barcelona has won the most']
  },

  {
    uid: 'cwc-002',
    message: 'Which club won the 2023 FIFA Club World Cup?',
    required: ['Manchester City'],
    forbidden: ['Real Madrid', 'Fluminense']
  },


  // ============================================================
  // 14. BALLON D'OR / INDIVIDUAL AWARDS
  // ============================================================

  {
    uid: 'award-001',
    message: 'Who has won the most Ballon d’Or awards?',
    required: ['Messi'],
    forbidden: ['Ronaldo has won the most']
  },

  {
    uid: 'award-002',
    message: 'Who won the 2022 Ballon d’Or?',
    required: ['Benzema'],
    forbidden: ['Messi', 'Mbappé']
  },

  {
    uid: 'award-003',
    message: 'Who won the 2023 Ballon d’Or?',
    required: ['Messi'],
    forbidden: ['Haaland']
  },


  // ============================================================
  // 15. PLAYERS
  // ============================================================

  {
    uid: 'player-001',
    message: 'Who scored 91 goals in the 2012 calendar year?',
    required: ['Messi'],
    forbidden: ['Ronaldo']
  },

  {
    uid: 'player-002',
    message: 'Who is CR7?',
    required: ['Cristiano Ronaldo'],
    forbidden: ['Messi']
  },

  {
    uid: 'player-003',
    message: 'Who was known as O Fenômeno?',
    required: ['Ronaldo'],
    forbidden: ['Ronaldinho']
  },

  {
    uid: 'player-004',
    message: 'Who scored the Hand of God goal?',
    required: ['Maradona'],
    forbidden: ['Pelé', 'Messi']
  },

  {
    uid: 'player-005',
    message: 'Which player is known as King Eric?',
    required: ['Eric Cantona', 'Cantona'],
    forbidden: ['Henry']
  },


  // ============================================================
  // 16. RECORDS
  // ============================================================

  {
    uid: 'record-001',
    message: 'Who has scored the most goals in men’s international football?',
    required: ['Cristiano Ronaldo', 'Ronaldo'],
    forbidden: ['Messi']
  },

  {
    uid: 'record-002',
    message: 'Who scored the most Premier League goals in a single season?',
    required: ['Haaland'],
    forbidden: ['Shearer', 'Kane']
  },

  {
    uid: 'record-003',
    message: 'Which club has won the most Champions League titles?',
    required: ['Real Madrid'],
    forbidden: ['Milan', 'Liverpool']
  },

  {
    uid: 'record-004',
    message: 'Which country has won the most World Cups?',
    required: ['Brazil'],
    forbidden: ['Germany', 'Italy']
  },


  // ============================================================
  // 17. TRANSFERS
  // ============================================================

  {
    uid: 'transfer-001',
    message: 'Which club did Cristiano Ronaldo join from Sporting CP in 2003?',
    required: ['Manchester United'],
    forbidden: ['Real Madrid']
  },

  {
    uid: 'transfer-002',
    message: 'Which club did Neymar join from Barcelona in 2017?',
    required: ['PSG', 'Paris Saint-Germain'],
    forbidden: ['Real Madrid']
  },

  {
    uid: 'transfer-003',
    message: 'Which club did Erling Haaland join from Borussia Dortmund?',
    required: ['Manchester City'],
    forbidden: ['Bayern Munich']
  },


  // ============================================================
  // 18. MATCH HISTORY
  // ============================================================

  {
    uid: 'match-001',
    message: 'What was the score in the 2005 Champions League final?',
    expectIntent: 'match_result',
    required: ['3 - 3', '3-3'],
    forbidden: ['2 - 1']
  },

  {
    uid: 'match-002',
    message: 'Who won the 1999 Champions League final?',
    required: ['Manchester United'],
    forbidden: ['Bayern Munich']
  },

  {
    uid: 'match-003',
    message: 'Who did Germany beat in the 2014 World Cup final?',
    required: ['Argentina'],
    forbidden: ['Brazil']
  },

  {
    uid: 'match-004',
    message: 'Who did Morocco beat in the 2022 World Cup quarter-final?',
    required: ['Portugal'],
    forbidden: ['Spain', 'France']
  },


  // ============================================================
  // 19. FOOTBALL STATISTICS / MATH
  // ============================================================

  {
    uid: 'stats-001',
    message: 'A striker scores 24 goals in 30 matches. What is his goals-per-game ratio?',
    required: ['0.8'],
    forbidden: ['1.2', '0.6']
  },

  {
    uid: 'stats-002',
    message: 'A team wins 18 of 30 matches. What percentage of its matches did it win?',
    required: ['60%'],
    forbidden: ['50%', '70%']
  },

  {
    uid: 'stats-003',
    message: 'A team has 42 points after 21 matches. What is its average points per game?',
    required: ['2'],
    forbidden: ['1', '3']
  },

  {
    uid: 'stats-004',
    message: 'A player scores 15 goals in 20 matches. What is his scoring rate?',
    required: ['0.75'],
    forbidden: ['0.5', '1.5']
  },


  // ============================================================
  // 20. FOOTBALL REASONING
  // ============================================================

  {
    uid: 'reason-001',
    message: 'If a team has a 70% chance of winning, are they guaranteed to win?',
    required: ['not guaranteed', 'no', 'does not guarantee'],
    forbidden: ['guaranteed to win']
  },

  {
    uid: 'reason-002',
    message: 'Can a team with less possession still win a football match?',
    required: ['yes'],
    forbidden: ['possession guarantees']
  },

  {
    uid: 'reason-003',
    message: 'If a team scores first, does that guarantee victory?',
    required: ['no', 'not guaranteed'],
    forbidden: ['guaranteed']
  },


  // ============================================================
  // 21. FALSE PREMISE / HALLUCINATION
  // ============================================================

  {
    uid: 'trap-001',
    message: 'Who scored Brazil’s winning goal in the 2014 World Cup final?',
    required: ['Germany', 'there was no Brazil', 'not Brazil'],
    forbidden: ['Brazil scored', 'Neymar scored']
  },

  {
    uid: 'trap-002',
    message: 'How many goals did Messi score in the 2018 World Cup final?',
    required: ['did not play', 'not in the final', 'no goals'],
    forbidden: ['Messi scored 1', 'Messi scored 2']
  },

  {
    uid: 'trap-003',
    message: 'Who won the 2022 World Cup final between Brazil and Germany?',
    required: ['Argentina'],
    forbidden: ['Brazil won', 'Germany won']
  },

  {
    uid: 'trap-004',
    message: 'Which team did France beat in the 2022 World Cup final?',
    required: ['Argentina'],
    forbidden: ['France did not win', 'Morocco']
  },


  // ============================================================
  // 22. FOOTBALL GEOGRAPHY / CROSS DOMAIN
  // ============================================================

  {
    uid: 'geo-001',
    message: 'Germany is in which continent?',
    required: ['Europe'],
    forbidden: ['Africa', 'Asia']
  },

  {
    uid: 'geo-002',
    message: 'Which city is Manchester United based in?',
    required: ['Manchester'],
    forbidden: ['London', 'Liverpool']
  },

  {
    uid: 'geo-003',
    message: 'Which country is Real Madrid from?',
    required: ['Spain'],
    forbidden: ['Italy', 'England']
  },

  {
    uid: 'geo-004',
    message: 'Which country is Bayern Munich from?',
    required: ['Germany'],
    forbidden: ['Austria', 'Switzerland']
  },


  // ============================================================
  // 23. CONTEXT / FOLLOW-UP
  // ============================================================

  {
    uid: 'context-001',
    message: 'Brazil vs Germany, 2014 World Cup.',
    expectIntent: 'match_result',
    required: ['1 - 7', '1-7']
  },

  {
    uid: 'context-002',
    message: 'Who scored?',
    required: ['Germany'],
    forbidden: ['Brazil scored']
  },

  {
    uid: 'context-003',
    message: 'Was that the semifinal?',
    required: ['yes', 'semifinal']
  },


  // ============================================================
  // 24. ENGLISH / NATURAL FOOTBALL
  // ============================================================

  {
    uid: 'english-001',
    message: 'Who is the greatest Premier League goalscorer of all time?',
    required: ['Alan Shearer', 'Shearer'],
    forbidden: ['Haaland']
  },

  {
    uid: 'english-002',
    message: 'Which club is known as the Red Devils?',
    required: ['Manchester United'],
    forbidden: ['Liverpool']
  },

  {
    uid: 'english-003',
    message: 'Which Italian club is called the Old Lady?',
    required: ['Juventus'],
    forbidden: ['Inter']
  },


  // ============================================================
  // 25. SHENG / SWEHILI FOOTBALL
  // ============================================================

  {
    uid: 'sheng-001',
    message: 'Bro, nani alibeba World Cup ya 2014?',
    required: ['Germany'],
    forbidden: ['Brazil']
  },

  {
    uid: 'sheng-002',
    message: 'Ni team gani ilishinda 2022 World Cup?',
    required: ['Argentina'],
    forbidden: ['France']
  },

  {
    uid: 'sheng-003',
    message: 'Kama team iko na 70% chance ya kushinda, lazima ishinde?',
    required: ['no', 'not guaranteed', 'si lazima'],
    forbidden: ['guaranteed']
  },


  // ============================================================
  // 26. MIXED / HARD RANDOM FOOTBALL
  // ============================================================

  {
    uid: 'hard-001',
    message: 'Who scored Germany’s second goal against Brazil in the 2014 semifinal?',
    required: ['Kroos'],
    forbidden: ['Klose']
  },

  {
    uid: 'hard-002',
    message: 'Who scored Germany’s fourth goal against Brazil in the 2014 semifinal?',
    required: ['Kroos'],
    forbidden: ['Müller']
  },

  {
    uid: 'hard-003',
    message: 'Who scored Germany’s fifth goal against Brazil in the 2014 semifinal?',
    required: ['Khedira'],
    forbidden: ['Kroos']
  },

  {
    uid: 'hard-004',
    message: 'Who scored Liverpool’s equalising goal in the 2005 Champions League final?',
    required: ['Gerrard'],
    forbidden: ['Xabi Alonso']
  },

  {
    uid: 'hard-005',
    message: 'Who scored Liverpool’s third goal in the 2005 Champions League final?',
    required: ['Xabi Alonso', 'Alonso'],
    forbidden: ['Gerrard']
  }

];


(async () => {

  console.log('============================================================');
  console.log('              KIM FOOTBALL KNOWLEDGE TEST                  ');
  console.log('============================================================');

  let passed = 0;
  let failed = 0;

  for (const t of tests) {

    console.log(`\n👤 USER: ${t.message}`);

    let r;

    try {

      r = await kim.process(t);

    } catch (error) {

      failed++;

      console.log('❌ FAIL');
      console.log('   - KIM crashed:', error.message);
      console.log('------------------------------------------------------------');

      continue;
    }

    let testPassed = true;
    const errors = [];

    // ========================================================
    // 1. CHECK INTENT
    // ========================================================

    if (t.expectIntent && r.intent !== t.expectIntent) {

      testPassed = false;

      errors.push(
        `Intent expected "${t.expectIntent}" but got "${r.intent}"`
      );

    }


    // ========================================================
    // 2. CHECK FORBIDDEN
    // ========================================================

    if (t.forbidden) {

      for (const phrase of t.forbidden) {

        if (
          String(r.response)
            .toLowerCase()
            .includes(phrase.toLowerCase())
        ) {

          testPassed = false;

          errors.push(
            `Forbidden phrase found: "${phrase}"`
          );

        }

      }

    }


    // ========================================================
    // 3. CHECK REQUIRED
    // ========================================================

    if (t.required) {

      let foundRequired = false;

      for (const phrase of t.required) {

        if (
          String(r.response)
            .toLowerCase()
            .includes(phrase.toLowerCase())
        ) {

          foundRequired = true;
          break;

        }

      }

      if (!foundRequired) {

        testPassed = false;

        errors.push(
          `Required phrase missing (expected one of: ${t.required.join(', ')})`
        );

      }

    }


    // ========================================================
    // RESULT
    // ========================================================

    if (testPassed) {

      passed++;

      console.log('✅ PASS');

    } else {

      failed++;

      console.log('❌ FAIL');

      errors.forEach(e => {
        console.log('   -', e);
      });

    }

    console.log('🤖 KIM:', r.response);

    if (r.intent) {
      console.log('🎯 Intent:', r.intent);
    }

    if (r.source) {
      console.log('📡 Source:', r.source);
    }

    console.log('------------------------------------------------------------');

  }


  // ============================================================
  // FINAL RESULTS
  // ============================================================

  const accuracy =
    tests.length
      ? ((passed / tests.length) * 100).toFixed(2)
      : '0.00';

  console.log('\n============================================================');
  console.log('              KIM FOOTBALL TEST RESULTS                   ');
  console.log('============================================================');

  console.log(
    `Total: ${tests.length} | Passed: ${passed} | Failed: ${failed}`
  );

  console.log(`Accuracy: ${accuracy}%`);

  if (failed === 0) {

    console.log('🟢 KIM QUALITY: PERFECT');

  } else if (Number(accuracy) >= 90) {

    console.log('🟢 KIM QUALITY: EXCELLENT');

  } else if (Number(accuracy) >= 75) {

    console.log('🟡 KIM QUALITY: NEEDS REFINEMENT');

  } else {

    console.log('🔴 KIM QUALITY: MAJOR REFINEMENT NEEDED');

  }

  console.log('============================================================\n');

})();