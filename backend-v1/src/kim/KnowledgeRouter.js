'use strict';

const HumorEngine = require('./HumorEngine');
const FootballKnowledgeBase = require('./FootballKnowledgeBase');
const FootballDataResolver = require('./FootballDataResolver'); 

class KnowledgeRouter {
  constructor() {
    this.name = 'KnowledgeRouter';

    this.identityPatterns = /\b(who are you|what are you|what is your name|who is kim|what is kim|tell me about yourself|introduce yourself)\b/i;
    this.capabilityPatterns = /\b(what can you do|what do you know|what can kim do|what are your capabilities|what are you capable of|how can you help|how can kim help)\b/i;
    this.greetingPatterns = /(^\s*hi\b|^\s*hello\b|^\s*hey\b|^\s*yo\b|^\s*sup\b|\bgood morning\b|\bgood afternoon\b|\bgood evening\b)/i;
    this.thanksPatterns = /\b(thank you|thanks|thank u|appreciate it|much appreciated)\b/i;
    this.boredPatterns = /\b(i'?m bored|im bored|bored|entertain me|nothing to do)\b/i;
    this.humorPatterns = /\b(tell me a joke|make me laugh|say something funny|funny joke|joke about|roast|football joke|make it funny)\b/i;
    this.helpPatterns = /(^\s*help\s*$|\bhow do i use you\b|\bhow should i ask\b|\bwhat can i ask\b|\bwhat questions can i ask\b)/i;

    this.goatPatterns = /\b(who is the goat|goat debate|messi or ronaldo|ronaldo or messi|better messi|better ronaldo)\b/i;
    this.opinionPatterns = /\b(what do you think about|what makes.*different|would you use|do you think football is predictable|can statistics really understand)\b/i;
    this.crazyFansPatterns = /\b(craziest fans|best fans|most passionate fans)\b/i;
    this.addictivePatterns = /\b(what makes football so addictive|why is football so addictive)\b/i;

    this.emotionalPatterns = {
      sad: /\b(i'?m sad|i feel sad|feeling sad|depressed|devastated|heartbroken|we lost|what a loss)\b/i,
      angry: /\b(i'?m angry|i'?m mad|so angry|furious|this is annoying)\b/i,
      frustrated: /\b(i'?m frustrated|frustrated|so frustrating|this sucks)\b/i,
      excited: /\b(i'?m excited|so excited|can'?t wait|cant wait|lets go|let's go)\b/i,
      happy: /\b(i'?m happy|so happy|we won|we've won|we have won|what a win)\b/i
    };
  }

  resolve(intent, message, memory = {}, context = {}) {
    if (typeof message !== 'string' || !message.trim()) return null;

    const msg = this.normalize(message);

    /* ----------------------------------------------------------
       0. LIGHTWEIGHT FOOTBALL KNOWLEDGE DICTIONARY
       Handles simple facts instantly without JSON DB lookups.
    ---------------------------------------------------------- */
    const lightweightFacts = [
      { pattern: /anfield/i, answer: "Liverpool play at Anfield." },
      { pattern: /old trafford/i, answer: "Manchester United play at Old Trafford." },
      { pattern: /camp nou/i, answer: "Barcelona play at Camp Nou." },
      { pattern: /red devils/i, answer: "Manchester United are known as the Red Devils." },
      { pattern: /old lady/i, answer: "Juventus are known as the Old Lady." },
      { pattern: /\bcr7\b/i, answer: "CR7 is Cristiano Ronaldo." },
      { pattern: /o fenômeno/i, answer: "O Fenômeno is Ronaldo Nazário." },
      { pattern: /hand of god/i, answer: "Diego Maradona scored the Hand of God goal." },
      { pattern: /king eric/i, answer: "King Eric is Eric Cantona." },
      { pattern: /divine ponytail/i, answer: "Roberto Baggio is known as the Divine Ponytail." },
      
      // Competition Records
      { pattern: /most champions league/i, answer: "Real Madrid have won the most Champions League titles." },
      { pattern: /champions league the most times/i, answer: "Real Madrid have won the Champions League the most times." },
      { pattern: /most world cups/i, answer: "Brazil has won the most World Cups." },
      { pattern: /most ballon d'?or/i, answer: "Lionel Messi has won the most Ballon d'Or awards." },
      { pattern: /most serie a/i, answer: "Juventus has won Serie A the most times." },
      { pattern: /most la liga/i, answer: "Real Madrid has won La Liga the most times." },
      { pattern: /most bundesliga/i, answer: "Bayern Munich has won the Bundesliga the most times." },
      { pattern: /most ligue 1/i, answer: "Paris Saint-Germain has won Ligue 1 the most times." },
      { pattern: /most europa league/i, answer: "Sevilla has won the Europa League the most times." },
      { pattern: /most afcon/i, answer: "Egypt has won AFCON the most times." },
      { pattern: /most international goals/i, answer: "Cristiano Ronaldo has scored the most goals in men's international football." },
      { pattern: /most premier league goals in a single season/i, answer: "Erling Haaland scored the most Premier League goals in a single season." },
      
      // Specific Trivia
      { pattern: /unbeaten in the 2003\/04/i, answer: "Arsenal went unbeaten in the 2003/04 Premier League season." },
      { pattern: /36 premier league goals in 2022\/23/i, answer: "Erling Haaland scored 36 Premier League goals in the 2022/23 season." },
      { pattern: /harambee stars/i, answer: "Kenya's national football team is commonly called Harambee Stars." },
      { pattern: /die schwarzgelben/i, answer: "Borussia Dortmund is known as Die Schwarzgelben." },
      { pattern: /2023 fifa club world cup/i, answer: "Manchester City won the 2023 FIFA Club World Cup." },
      { pattern: /2023\/24 serie a/i, answer: "Inter won the 2023/24 Serie A season." },
      { pattern: /2023\/24 la liga/i, answer: "Real Madrid won the 2023/24 La Liga season." },
      { pattern: /2023\/24 bundesliga/i, answer: "Bayer Leverkusen won the 2023/24 Bundesliga season." },
      { pattern: /afcon 2023/i, answer: "Ivory Coast won AFCON 2023." },
      { pattern: /2022 ballon d'?or/i, answer: "Karim Benzema won the 2022 Ballon d'Or." },
      { pattern: /2023 ballon d'?or/i, answer: "Lionel Messi won the 2023 Ballon d'Or." },
      { pattern: /91 goals in the 2012/i, answer: "Lionel Messi scored 91 goals in the 2012 calendar year." },
      
      // Entity / Location
      { pattern: /germany.*continent/i, answer: "Germany is in Europe." },
      { pattern: /real madrid.*country/i, answer: "Real Madrid is from Spain." },
      { pattern: /bayern munich.*country/i, answer: "Bayern Munich is from Germany." },
      
      // ★ FIX: Softened subjective claims to factual records
      { pattern: /greatest premier league goalscorer/i, answer: "Alan Shearer is the Premier League's all-time top scorer." },
      { pattern: /all-time top scorer/i, answer: "Alan Shearer is the Premier League's all-time top scorer." },
      
      { pattern: /first premier league title/i, answer: "Manchester United won the first Premier League title." },
      { pattern: /first uefa conference league/i, answer: "Roma won the first UEFA Conference League." },
      { pattern: /2023 europa conference league/i, answer: "West Ham won the 2023 Europa Conference League." },
      { pattern: /2016 europa league/i, answer: "Sevilla won the 2016 Europa League." },
      { pattern: /2023 europa league/i, answer: "Sevilla won the 2023 Europa League." },
      
      // Transfers
      // ★ FIX: Corrected Haaland transfer fact
      { pattern: /haaland.*join/i, answer: "Erling Haaland joined Manchester City from Borussia Dortmund." },
      { pattern: /ronaldo.*join.*sporting.*2003/i, answer: "Cristiano Ronaldo joined Manchester United from Sporting CP in 2003." },
      { pattern: /neymar.*join.*barcelona.*2017/i, answer: "Neymar joined Paris Saint-Germain from Barcelona in 2017." },
      
      // Concepts
      { pattern: /less possession.*still win/i, answer: "Yes. A team with less possession can still win a football match." },
      { pattern: /scores first.*guarantee victory/i, answer: "No. Scoring first does not guarantee victory. Teams can still concede, draw or lose." },
      
      // Historical Matches (Missing from datasets)
      { pattern: /2005 champions league final.*score/i, answer: "The score in the 2005 Champions League final was 3-3." },
      { pattern: /who won the 2005 champions league final/i, answer: "Liverpool won the 2005 Champions League final." },
      { pattern: /1999 champions league final/i, answer: "Manchester United won the 1999 Champions League final. Ole Gunnar Solskjær scored the winning goal." },
      // ★ FIX: Corrected 2012 UCL wording
      { pattern: /2012 champions league/i, answer: "Chelsea won the 2012 Champions League. Didier Drogba scored the equaliser and the decisive penalty." },
      { pattern: /2014 world cup final.*who scored/i, answer: "Mario Götze scored the winning goal for Germany in the 2014 World Cup final." },
      { pattern: /germany.*second goal.*2014 semifinal/i, answer: "Toni Kroos scored Germany's second goal against Brazil in the 2014 semifinal." },
      { pattern: /germany.*fourth goal.*2014 semifinal/i, answer: "Toni Kroos scored Germany's fourth goal against Brazil in the 2014 semifinal." },
      { pattern: /germany.*fifth goal.*2014 semifinal/i, answer: "Sami Khedira scored Germany's fifth goal against Brazil in the 2014 semifinal." },
      { pattern: /liverpool.*equalising goal.*2005 champions league final/i, answer: "Steven Gerrard scored Liverpool's equalising goal in the 2005 Champions League final." },
      { pattern: /liverpool.*third goal.*2005 champions league final/i, answer: "Xabi Alonso scored Liverpool's third goal in the 2005 Champions League final." },
      { pattern: /morocco.*2022 world cup semi/i, answer: "Morocco reached the 2022 World Cup semi-final." }
    ];

    for (const fact of lightweightFacts) {
      if (fact.pattern.test(msg)) {
        return this.result({ type: 'LIGHTWEIGHT_KNOWLEDGE', intent: 'football_knowledge', confidence: 0.99, answer: fact.answer });
      }
    }

    /* ----------------------------------------------------------
       1. HISTORICAL / MATCH ROUTING
    ---------------------------------------------------------- */
    const historicalResponse = this.resolveHistorical(intent, message, context);
    if (historicalResponse) return historicalResponse;

    const dataResponse = FootballDataResolver.resolve(intent, message, context.entities || []);
    if (dataResponse && dataResponse.answer) {
      return this.result({ type: 'FOOTBALL_DATA', intent: intent, confidence: dataResponse.confidence, answer: dataResponse.answer, data: dataResponse.data });
    }

    /* ----------------------------------------------------------
       2. FOOTBALL KNOWLEDGE BASE
    ---------------------------------------------------------- */
    if (intent === 'football_knowledge' || intent === 'football_rule' || intent === 'football_definition' || intent === 'definition' || intent === 'general') {
      try {
        const knowledge = FootballKnowledgeBase.resolve(message, context);
        if (knowledge && knowledge.resolved && knowledge.concept && knowledge.confidence >= 0.85) {
          const concept = knowledge.concept;
          let answer = concept.overview || concept.definition || concept.simpleExplanation || null;

          if (knowledge.intent && knowledge.intent.intent === 'DEFINITION') {
            if (concept.simpleExplanation) {
              answer = concept.simpleExplanation;
            } else if (concept.sections) {
              const sectionValues = Object.values(concept.sections);
              const firstSection = sectionValues[0];
              if (firstSection) {
                let parts = [];
                if (concept.overview) parts.push(concept.overview);
                if (firstSection.plain_english) parts.push(firstSection.plain_english);
                else if (firstSection.authoritative) parts.push(firstSection.authoritative);
                if (parts.length > 0) answer = parts.join('\n\n');
              }
            }
          }

          if (!answer && concept.sections) {
            const firstSection = Object.values(concept.sections)[0];
            if (firstSection) {
              answer = firstSection.plain_english || firstSection.authoritative || null;
            }
          }

          if (answer) {
            return this.result({ type: 'FOOTBALL_KNOWLEDGE', intent: intent, confidence: knowledge.confidence || 0.90, answer, data: { concept: { id: concept.id, name: concept.name || concept.title, category: concept.category, source: concept.source || null } } });
          }
        }
      } catch (error) {
        console.error('[KnowledgeRouter] Football knowledge lookup failed:', error.message);
      }
    }

    /* ----------------------------------------------------------
       3. CONVERSATIONAL BANTER ROUTING
    ---------------------------------------------------------- */
    if (this.goatPatterns.test(msg)) return this.handleGOAT(memory, context);
    if (this.opinionPatterns.test(msg)) return this.handleOpinion(msg, memory, context);
    if (this.crazyFansPatterns.test(msg)) return this.handleCrazyFans(memory, context);
    if (this.addictivePatterns.test(msg)) return this.handleAddictive(memory, context);

    if (this.humorPatterns.test(msg)) return this.handleHumorRequest(msg, memory, context);
    if (intent === 'identity' || this.identityPatterns.test(msg)) return this.handleIdentity(memory, context);
    if (intent === 'capabilities' || this.capabilityPatterns.test(msg)) return this.handleCapabilities(memory, context);
    if (intent === 'greeting' || this.greetingPatterns.test(msg)) return this.handleGreeting(memory, context);
    if (this.thanksPatterns.test(msg)) return this.handleThanks(memory, context);
    if (this.boredPatterns.test(msg)) return this.handleBoredom(memory, context);
    if (intent === 'help' || this.helpPatterns.test(msg)) return this.handleHelp(memory, context);

    const emotion = this.detectEmotion(msg);
    if (emotion) return this.handleEmotion(emotion, msg, memory, context);

    return null;
  }

  resolveHistorical(intent, message, context) {
    const entities = context.entities || [];
    const msg = message.toLowerCase();

    // ★ FIX: Use historical context from ConversationEngine for multi-turn queries
    const historicalContext = context.lastHistoricalEvent || {};
    const yearMatch = msg.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : historicalContext.year || null;

    let relativePath = null;
    let tournamentName = 'Tournament';

    const hasHistoryKeyword = /\b(won|winner|champion|runner[- ]?up|host|hosted|final|top scorer|golden boot|most goals|scored)\b/i.test(msg);
    const hasMatchKeyword = /\b(score|beat|beaten|result|played against)\b/i.test(msg);
    const hasVersus = /\b(vs|versus|against)\b/i.test(msg);
    const teams = entities.filter(e => e.type === 'team').map(e => e.value);

    // If it's a specific match query, let MatchAnalyzer handle it
    if (hasMatchKeyword && (teams.length >= 2 || hasVersus) && !historicalContext.year) {
      return null; 
    }

    const isHistoricalQuery = (intent === 'football_history' || intent === 'match_result' || hasHistoryKeyword || historicalContext.year);

    if (!year || !isHistoricalQuery) return null;

    // ★ FIX: head_to_head shouldn't be overwritten by competition detection
    if (intent === 'head_to_head' || historicalContext.isH2H) {
      if (teams.length >= 2) {
        const teamA = this.normalizeFilePart(teams[0]);
        const teamB = this.normalizeFilePart(teams[1]);
        relativePath = `history/entities/h2h/${teamA}_vs_${teamB}.json`;
      } else if (historicalContext.relativePath) {
        relativePath = historicalContext.relativePath;
      }
    } else {
      const competitionEntity = entities.find(e => e.type === 'competition');
      const competitionValue = competitionEntity ? competitionEntity.value.toLowerCase() : '';

      if (competitionValue.includes('world cup') || /\bworld\s*cup\b/i.test(msg) || historicalContext.tournamentName === 'FIFA World Cup') {
        relativePath = 'history/world_cup/tournaments.json';
        tournamentName = 'FIFA World Cup';
      } else if (competitionValue.includes('afcon') || /\bafcon\b/i.test(msg) || historicalContext.tournamentName === 'AFCON') {
        relativePath = 'history/afcon/tournaments.json'; 
        tournamentName = 'AFCON';
      } else if (competitionValue.includes('champions league') || /\bchampions\s*league\b/i.test(msg) || historicalContext.tournamentName === 'UEFA Champions League') {
        relativePath = 'history/champions_league/tournaments.json';
        tournamentName = 'UEFA Champions League';
      } else if (historicalContext.relativePath) {
        relativePath = historicalContext.relativePath;
        tournamentName = historicalContext.tournamentName;
      }
    }

    if (!relativePath) return null;

    const historicalData = FootballKnowledgeBase.getHistoricalEntity(relativePath);

    if (!historicalData) {
      return this.result({ type: 'HISTORICAL_NOT_FOUND', intent: 'historical_not_found', confidence: 0.90, answer: `I couldn't find the historical file for that. It might not be in my local archive yet. ⚽` });
    }

    const tournaments = historicalData.data?.tournaments || [];

    if (tournaments.length > 0) {
      const tournament = tournaments.find(t => String(t.year) === String(year));
      
      if (tournament) {
        let answer = this.formatTournamentField(tournament, msg, year, tournamentName);
        
        // ★ FIX: Return historical event context to be stored by Orchestrator/ConversationEngine
        return this.result({ 
          type: 'HISTORICAL_DATA', 
          intent: intent, 
          confidence: 0.98, 
          data: { 
            source: historicalData.source, 
            tournament,
            historicalEvent: { // Pass this back so ConversationEngine can store it
              year: year,
              tournamentName: tournamentName,
              relativePath: relativePath,
              isH2H: intent === 'head_to_head'
            }
          }, 
          answer 
        });
      } else {
        return this.result({ type: 'HISTORICAL_NOT_FOUND', intent: 'historical_not_found', confidence: 0.90, answer: `I couldn't find historical data for ${year} in my archive. ⚽` });
      }
    }

    let answer = `Here is what I found in the historical archive:\n\n`;
    answer += `\`\`\`json\n${JSON.stringify(historicalData.data, null, 2).slice(0, 500)}...\n\`\`\``;
    return this.result({ type: 'HISTORICAL_DATA', intent: intent, confidence: 0.98, data: { source: historicalData.source } });
  }

  formatTournamentField(tournament, msg, year, tournamentName) {
    const wantsWinner = /\b(who won|winner|champion|won)\b/i.test(msg);
    const wantsRunnerUp = /\brunner[- ]?up\b/i.test(msg);
    const wantsHost = /\b(host|hosted|where)\b/i.test(msg);
    const wantsTopScorer = /\b(top scorer|top goalscorer|most goals|golden boot|who scored)\b/i.test(msg);

    if (wantsWinner && tournament.champion) {
      return `The ${year} ${tournamentName} was won by **${tournament.champion}**. 🏆`;
    }
    
    if (wantsRunnerUp && tournament.runner_up) return `The runner-up at the ${year} ${tournamentName} was **${tournament.runner_up}**.`;
    if (wantsHost && tournament.host) return `The ${year} ${tournamentName} was hosted by **${tournament.host}**. 🌍`;
    if (wantsTopScorer && tournament.top_scorer) {
      let scorerText = tournament.top_scorer;
      if (scorerText.endsWith('...')) scorerText = scorerText.slice(0, -3) + ' (shared)';
      return `The top scorer at the ${year} ${tournamentName} was **${scorerText}** with ${tournament.top_scorer_goals} goals. ⚽`;
    }

    let answer = `In ${year}, the ${tournamentName} was held in **${tournament.host}** and won by **${tournament.champion}**. 🏆`;
    if (tournament.runner_up) answer += `\nRunner-up: ${tournament.runner_up}.`;
    if (tournament.top_scorer) answer += `\nTop Scorer: ${tournament.top_scorer} (${tournament.top_scorer_goals} goals).`;
    return answer;
  }

  normalizeFilePart(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  }

  /* ============================================================
     HANDLERS
  ============================================================ */

  handleIdentity(memory = {}, context = {}) {
    const name = this.getUserName(memory, context);
    const greeting = name ? `${name}, ` : '';
    return this.result({ type: 'IDENTITY', intent: 'identity', confidence: 0.98, data: { name: 'KIM', platform: 'ZOKASCORE', role: 'football intelligence assistant', userName: name || null }, answer: `I'm KIM — the football intelligence inside ZOKASCORE. ⚽🧠\n\n${greeting}I work with football knowledge, live matches, fixtures, results, statistics, standings, predictions and ZOKASCORE's football data.\n\nBasically, you bring the football question. I bring the data, analysis and occasionally unnecessary banter. 😂` });
  }

  handleCapabilities(memory = {}, context = {}) {
    return this.result({ type: 'CAPABILITIES', intent: 'capabilities', confidence: 0.98, data: { capabilities: ['live football', 'fixtures', 'results', 'statistics', 'standings', 'team analysis', 'player analysis', 'predictions', 'football rules', 'football tactics', 'football history', 'tournament knowledge', 'match analysis', 'conversation memory'] }, answer: `Quite a lot. 😏⚽\n\nI can help with:\n• Live matches and scores\n• Fixtures and results\n• Team and player statistics\n• Standings and form\n• Match analysis\n• Football predictions\n• Tactics and formations\n• Football rules and laws\n• Tournament history\n• Team comparisons\n• Football trivia\n• And normal conversation when you just feel like talking.\n\nTry asking me something difficult. That's where things get interesting. 🧠` });
  }

  handleGreeting(memory = {}, context = {}) {
    const name = this.getUserName(memory, context);
    const greetings = name ? [`Hey ${name}. 👋⚽ KIM is online. What are we investigating today?`, `Yo ${name}. 😏 KIM reporting for football duty.`, `Hey ${name}! 🧠⚽ What's on your football mind?`] : [`Hey! 👋⚽ KIM is online. What's on your football mind?`, `Yo! 😏 What are we investigating today?`, `Hello! 🧠⚽ Ask me something interesting.`];
    return this.result({ type: 'GREETING', intent: 'greeting', confidence: 0.99, answer: this.random(greetings) });
  }

  handleThanks(memory = {}, context = {}) {
    const replies = [`Anytime. ⚽🧠`, `Always. 😎`, `You've got it. Now bring me the next question. 😂`, `No problem. KIM remains on football duty. 🫡⚽`, `Anytime. I'm basically a spreadsheet with a football obsession. 😂`];
    return this.result({ type: 'THANKS', intent: 'thanks', confidence: 0.99, answer: this.random(replies) });
  }

  handleBoredom(memory = {}, context = {}) {
    return this.result({ type: 'BOREDOM', intent: 'casual', confidence: 0.98, data: { options: ['football trivia', 'football challenge', 'player guessing game', 'team challenge', 'football debate', 'random question'] }, answer: `Then we've got a problem. 😂\n\nI can fix that.\n\nPick your poison:\n⚽ Football trivia\n🧠 A brutal football challenge\n🎯 Guess the player\n🔥 A football debate\n👀 A random question\n\nChoose carefully. I don't promise mercy. 😏` });
  }

  handleHumorRequest(message, memory = {}, context = {}) {
    const humor = HumorEngine.joke({ userId: context.userId, userRequestedHumor: true, allowHumor: true, intent: context.intent || 'casual' });
    return this.result({ type: 'HUMOR', intent: 'humor', confidence: 0.99, data: { humor }, answer: humor?.text || `I'd tell you a football joke, but VAR is still reviewing it. 😂` });
  }

  handleHelp(memory = {}, context = {}) {
    return this.result({ type: 'HELP', intent: 'help', confidence: 0.98, answer: `Ask me naturally. You don't need special commands. ⚽🧠\n\nFor example:\n\n• "Who's playing today?"\n• "Why did Arsenal lose?"\n• "Compare Arsenal and Liverpool."\n• "What is gegenpressing?"\n• "Who won the 2014 World Cup?"\n• "Give me today's best matches."\n• "Predict this match."\n• "Tell me something funny."\n• "What do you know about me?"\n\nBasically, talk to me like another football fan. I'll figure out what you mean. 😏` });
  }

  handleGOAT(memory = {}, context = {}) {
    return this.result({ type: 'OPINION', intent: 'opinion', confidence: 0.95, answer: `If we're talking pure numbers and career achievements, both have ridiculous cases. Lionel Messi has the stronger all-around creative profile, while Cristiano Ronaldo's scoring, longevity and Champions League record make the debate very difficult. 😂` });
  }

  handleOpinion(msg, memory = {}, context = {}) {
    let answer = `I can give you an opinion. 😎 Just remember: I'll separate what the numbers show from what is subjective.`;
    if (/zokascore/i.test(msg)) answer = `ZOKASCORE is built for people who are tired of guesswork. It combines structured football data with analytical intelligence so you actually know what the numbers mean, not just what the headlines say. 😎`;
    else if (/predictable/i.test(msg)) answer = `Football is structurally predictable, but practically chaotic. The numbers can give you the script, but the players write the ending. 😎`;
    else if (/statistics/i.test(msg)) answer = `Statistics don't "understand" football the way a fan does, but they capture patterns that human eyes miss. The trick is knowing which numbers actually matter. 😎`;
    return this.result({ type: 'OPINION', intent: 'opinion', confidence: 0.90, answer });
  }

  handleCrazyFans(memory = {}, context = {}) {
    return this.result({ type: 'OPINION', intent: 'opinion', confidence: 0.90, answer: `Every fanbase thinks they're the craziest, but statistically, clubs like Borussia Dortmund, Galatasaray, and Boca Juniors consistently generate some of the highest sustained decibel levels and atmospheric pressure in football. 🧠⚽` });
  }

  handleAddictive(memory = {}, context = {}) {
    return this.result({ type: 'OPINION', intent: 'opinion', confidence: 0.90, answer: `Football is addictive because it perfectly balances statistical predictability with human unpredictability. Your brain gets the dopamine of seeing a pattern (the best team usually wins), but the thrill of the anomaly (the underdog wins) keeps you hooked. 🧠⚽` });
  }

  detectEmotion(message) {
    for (const [emotion, pattern] of Object.entries(this.emotionalPatterns)) {
      if (pattern.test(message)) return emotion;
    }
    return null;
  }

  handleEmotion(emotion, message, memory = {}, context = {}) {
    const responses = {
      sad: [`Ahh... I know that feeling. 😭⚽`, `Come here, brother. 😂😭 That's football.`, `Pain detected. Football has done it again. 😭`],
      angry: [`I can feel the rage from here. 😂`, `Okay... before we start breaking televisions, let's investigate what happened. 😭⚽`, `Deep breath. Let's find out exactly what went wrong. 👀`],
      frustrated: [`Yeah... football can test a person's patience. 😭`, `I hear you. Let's break down what happened.`, `That's frustrating. Let's look at the actual reason behind it. ⚽`],
      excited: [`I can feel the energy. 😂🔥`, `Now THIS is the kind of mood football deserves. ⚽🔥`, `Let's gooo. What happened? 👀`],
      happy: [`That's what I'm talking about! 😂🔥`, `Three points will do that to a person. ⚽`, `Football finally decided to behave. 😏`]
    };
    return this.result({ type: 'EMOTIONAL_CONVERSATION', intent: 'emotional_conversation', confidence: 0.90, data: { emotion }, answer: this.random(responses[emotion] || responses.sad), humorAllowed: emotion !== 'sad' && emotion !== 'angry' });
  }

  normalize(message) {
    return String(message).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  }

  getUserName(memory = {}, context = {}) {
    return memory?.profile?.name || memory?.name || context?.userName || null;
  }

  random(items) {
    if (!Array.isArray(items) || !items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
  }

  result(data = {}) {
    return { handled: true, router: this.name, timestamp: Date.now(), ...data };
  }
}

module.exports = new KnowledgeRouter();