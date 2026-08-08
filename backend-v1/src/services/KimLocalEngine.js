const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');
const GAPS_LOG_PATH = path.join(process.cwd(), 'logs', 'kim_knowledge_gaps.json');

let KNOWLEDGE_GRAPH_CACHE = null;

function loadKnowledgeGraph() {
  if (KNOWLEDGE_GRAPH_CACHE) return KNOWLEDGE_GRAPH_CACHE;
  
  KNOWLEDGE_GRAPH_CACHE = [];
  if (!fs.existsSync(KNOWLEDGE_DIR)) return KNOWLEDGE_GRAPH_CACHE;

  const readDirRecursive = (dir) => {
    fs.readdirSync(dir).forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        readDirRecursive(fullPath);
      } else if (file.endsWith('.json')) {
        try {
          let c = fs.readFileSync(fullPath, 'utf8').trim();
          if (c.charCodeAt(0) === 0xFEFF) c = c.slice(1);
          const data = JSON.parse(c);
          if (data.id || data.lawNumber) KNOWLEDGE_GRAPH_CACHE.push(data);
        } catch (e) {
          logger.warn(`[KimEngine] Failed to parse ${file}: ${e.message}`);
        }
      }
    });
  };

  readDirRecursive(KNOWLEDGE_DIR);
  logger.info(`[KimEngine] Loaded ${KNOWLEDGE_GRAPH_CACHE.length} concepts into Knowledge Graph.`);
  return KNOWLEDGE_GRAPH_CACHE;
}

class KimLocalEngine {
  constructor() {
    this.graph = loadKnowledgeGraph();
  }

  normalizeText(text) {
    return text.toLowerCase().replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  containsPhrase(text, phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  }

  // 1. Upgraded Intent Detection (Regex-based, finds anywhere in sentence)
  detectIntent(message) {
    const msg = this.normalizeText(message);

    if (/\b(vs|versus|difference between|compare|comparison)\b/.test(msg)) return 'comparison';
    
    // Historical/Competition Intents
    if (/\b(top scorer|golden boot|top goalscorer)\b/.test(msg)) return 'top_scorers';
    if (/\b(host|hosted|hosting)\b/.test(msg)) return 'hosts';
    if (/\b(how many teams|number of teams)\b/.test(msg)) return 'teams';
    if (/\b(attendance|spectators|crowd)\b/.test(msg)) return 'attendance';
        if (/\b(most titles|most wins|most championships|most world cups|won the.*most|most world)\b/.test(msg)) return 'records';
    if (/\b(most goals|most goals in a tournament|record goals)\b/.test(msg)) return 'records';
    if (/\b(who won|winner of|who hosted|history of|historical)\b/.test(msg) || /\b(19\d{2}|20\d{2})\b/.test(msg)) {
      if (msg.includes('world cup') || msg.includes('champions league') || msg.includes('euros') || msg.includes('copa america')) {
        return 'historical_fact';
      }
    }

    if (/\b(what is|what's|whats|define|definition|meaning of|explain)\b/.test(msg)) return 'definition';
    if (/\b(how does|how do|how is|how are|how works|how does it work|how to)\b/.test(msg)) return 'how_it_works';
    if (/\b(why|advantage|advantages|benefit|benefits|purpose|used for)\b/.test(msg)) return 'advantages';
    if (/\b(weakness|weaknesses|flaw|flaws|risk|risks|danger|disadvantage|disadvantages|problem)\b/.test(msg)) return 'weaknesses';
    if (/\b(when should|when to|when do|when is|when would)\b/.test(msg)) return 'when_to_use';
    
    return 'general';
  }

  // 2. Section-Aware Detection for Laws
  detectLawSection(message, concept) {
    const msg = this.normalizeText(message);

    if (/\b(goal|score|own goal|goalkeeper|handle|pick up)\b/.test(msg)) {
      if (concept.sections?.scoring_and_goalkeepers) return 'scoring_and_goalkeepers';
      if (concept.sections?.scoring) return 'scoring';
    }
    if (/\b(take|procedure|how|feet|distance|position|placed)\b/.test(msg)) {
      if (concept.sections?.procedure) return 'procedure';
    }
    if (/\b(foul|offence|infringement|touch twice|second touch|retake|illegal)\b/.test(msg)) {
      if (concept.sections?.infringements) return 'infringements';
    }

    return null;
  }

      // 3. Upgraded Semantic Concept Scorer (Phrase boundaries + Contextual Boosts)
  scoreConcept(message, concept) {
    const msg = this.normalizeText(message);
    let score = 0;

    const name = this.normalizeText(concept.name || concept.title || '');
    const aliases = (concept.aliases || []).map(a => this.normalizeText(a));
    const keywords = concept.keywords || []; 
    
    if (this.containsPhrase(msg, name)) score += 100;
    if (aliases.some(a => this.containsPhrase(msg, a))) score += 80;
    if (keywords.some(k => this.containsPhrase(msg, this.normalizeText(k)))) score += 30;
    if (concept.category && this.containsPhrase(msg, concept.category)) score += 30;

    // Secondary signal: generic word overlap (lower weight)
    const textBlob = this.normalizeText(JSON.stringify(concept));
    const msgWords = msg.split(' ');
    msgWords.forEach(word => {
      if (word.length > 3 && textBlob.includes(word)) score += 2;
    });

    // ★ NEW: Contextual Boosts for Historical/Competition Data (ID-Specific)
    const hasYear = /\b(19\d{2}|20\d{2})\b/.test(msg);
    const id = concept.id || '';
    
    // If user asks for a year, boost the tournaments/finals files
    if (hasYear) {
      if (id === 'world_cup_finals' && msg.includes('final')) score += 500; // "2022 final score"
      else if (id === 'world_cup_tournaments') score += 500; // "Who won in 2014"
    }
    
    // If user asks for "most" or "records", boost the records file
    if (id === 'world_cup_records' && (msg.includes('most') || msg.includes('record') || msg.includes('best'))) {
      score += 500;
    }
    
    // If user asks for format/teams, boost the format file
    if (id === 'world_cup_format' && (msg.includes('format') || msg.includes('structure') || msg.includes('how many teams'))) {
      score += 500;
    }

    return score;
  }
  
    // 4. Upgraded Answer Builder (Section-aware + Intent mapping)
  buildAnswer(intent, concept, message) {
    let response = `**${concept.name || concept.title}**\n\n`;

    // Logic for Competitions / History
    if (concept.tournaments || concept.records || concept.finals || concept.matches) {
      const msg = this.normalizeText(message);
      
      // Handle records queries
            if ((intent === 'records' || msg.includes('most') || msg.includes('record')) && concept.records) {
        let recResponse = `**${concept.name}**\n\n`;
        let foundSpecific = false;
        
        for (const [key, value] of Object.entries(concept.records)) {
          const keyPhrase = key.replace(/_/g, ' ');
          if (msg.includes(keyPhrase) || (msg.includes('most') && key.includes('most'))) {
            recResponse += `**${keyPhrase.toUpperCase()}:**\n${JSON.stringify(value, null, 2)}\n\n`;
            foundSpecific = true;
          }
        }
        
        if (!foundSpecific) {
          recResponse += `Here are the key records:\n\n`;
          for (const [key, value] of Object.entries(concept.records)) {
            recResponse += `**${key.replace(/_/g, ' ').toUpperCase()}:** ${JSON.stringify(value)}\n`;
          }
        }
        return recResponse;
      }
      
      // Handle tournament queries
      if (concept.tournaments) {
        const yearMatch = msg.match(/\b(19\d{2}|20\d{2})\b/);
        
        if (yearMatch) {
          const year = parseInt(yearMatch[0]);
          const tournament = concept.tournaments.find(t => t.year === year);
          
          if (tournament) {
            let tResponse = `**${year} ${concept.name}**\n\n`;
            
            if (intent === 'top_scorers' || msg.includes('top scorer') || msg.includes('golden boot')) {
              tResponse += `**Top Scorer:** ${tournament.top_scorer} (${tournament.top_scorer_goals} goals)`;
            } else if (intent === 'hosts' || msg.includes('host')) {
              tResponse += `**Host:** ${tournament.host}`;
            } else if (intent === 'teams' || msg.includes('how many teams')) {
              tResponse += `**Teams:** ${tournament.teams}\n**Matches:** ${tournament.matches}`;
            } else if (intent === 'attendance') {
              tResponse += `**Attendance:** ${tournament.attendance.toLocaleString()}`;
            } else {
              // General info / Winners
              tResponse += `**Host:** ${tournament.host}\n`;
              tResponse += `**Champion:** ${tournament.champion}\n`;
              tResponse += `**Runner-up:** ${tournament.runner_up}\n`;
              tResponse += `**Top Scorer:** ${tournament.top_scorer} (${tournament.top_scorer_goals} goals)\n`;
              tResponse += `**Teams:** ${tournament.teams}\n`;
              tResponse += `**Matches:** ${tournament.matches}\n`;
              tResponse += `**Attendance:** ${tournament.attendance.toLocaleString()}`;
            }
            return tResponse;
          } else {
            return `I don't have a record of a ${concept.name} in ${year}.`;
          }
        } else {
          // No year specified - show summary
          const recent = concept.tournaments[0];
          let tResponse = `**${concept.name}**\n\n`;
          tResponse += `I have data for ${concept.tournaments.length} tournaments.\n\n`;
          tResponse += `**Most Recent (${recent.year}):**\n`;
          tResponse += `Host: ${recent.host}\n`;
          tResponse += `Champion: ${recent.champion}\n`;
          tResponse += `Runner-up: ${recent.runner_up}\n\n`;
          tResponse += `Ask me about a specific year (e.g., "Who won in 2014?")`;
          return tResponse;
        }
      }

      // Handle finals queries
      if (concept.finals) {
        const yearMatch = msg.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) {
          const year = parseInt(yearMatch[0]);
          const final = concept.finals.find(f => f.year === year);
          if (final) {
            let fResponse = `**${year} World Cup Final**\n\n`;
            fResponse += `**Winner:** ${final.winner}\n`;
            fResponse += `**Runner-up:** ${final.runner_up}\n`;
            fResponse += `**Score:** ${final.score}\n`;
            if (final.shootout) fResponse += `**Penalties:** ${final.shootout}\n`;
            fResponse += `**Venue:** ${final.venue}`;
            return fResponse;
          }
        }
      }

      // Handle matches queries (Head-to-Head)
      if (concept.matches) {
        const yearMatch = msg.match(/\b(19\d{2}|20\d{2})\b/);
        const teamsMentioned = [];
        // Simple check for team names in the message (requires a team dictionary for full accuracy, but works for basic queries)
        // For now, we'll just search by year if no specific final is found.
        
        if (msg.includes('play') || msg.includes('meet') || msg.includes('face')) {
           // A real implementation would parse team names here.
           // For now, returning a general message if no year/final is matched.
        }
      }
    }

    // Logic for Laws (Section-based knowledge)
    if (concept.sections) {
      const sectionKey = this.detectLawSection(message, concept);

      if (sectionKey) {
        const section = concept.sections[sectionKey];
        response += section.plain_english || section.authoritative || '';

        if (section.authoritative && section.plain_english && section.authoritative !== section.plain_english) {
          response += `\n\n**Law:** ${section.authoritative}`;
        }
        return response;
      }
      
      // Fallback to overview if no specific section matched
      response += concept.overview || '';
      return response;
    }

    // Logic for Tactics/Formations (Intent-based knowledge)
    const supportedIntents = concept.intents || ['definition'];
    const actualIntent = supportedIntents.includes(intent) ? intent : 'general';

    if (actualIntent === 'definition' || actualIntent === 'general') {
      response += concept.definition || concept.overview || '';
      if (concept.core_principle) response += `\n\n**Core Principle:** ${concept.core_principle}`;
    } else if (actualIntent === 'how_it_works') {
      response += concept.core_principle || concept.definition || '';
      if (concept.triggers) response += `\n\n**Triggers:** ${concept.triggers.join(', ')}`;
      if (concept.common_patterns) response += `\n\n**Common Patterns:**\n- ${concept.common_patterns.join('\n- ')}`;
    } else if (actualIntent === 'advantages' || actualIntent === 'purpose') {
      response += concept.advantages ? `**Advantages:**\n- ${concept.advantages.join('\n- ')}` : 'No specific advantages listed.';
      if (concept.objectives) response += `\n\n**Objectives:**\n- ${concept.objectives.join('\n- ')}`;
    } else if (actualIntent === 'weaknesses') {
      response += concept.weaknesses ? `**Weaknesses & Risks:**\n- ${concept.weaknesses.join('\n- ')}` : 'No specific weaknesses listed.';
    } else if (actualIntent === 'when_to_use') {
      response += concept.triggers ? `**Best used when:**\n- ${concept.triggers.join('\n- ')}` : 'No specific triggers listed.';
    } else {
      response = concept.overview || concept.definition || '';
    }

    return response;
  }


  // 5. Comparison Builder
  buildComparisonAnswer(concept1, concept2) {
    let response = `**Tactical Comparison: ${concept1.name} vs ${concept2.name}**\n\n`;
    
    response += `**${concept1.name}:**\n`;
    response += `${concept1.definition || concept1.overview || ''}\n`;
    if (concept1.advantages) response += `*Strengths:* ${concept1.advantages.join(', ')}\n`;
    if (concept1.weaknesses) response += `*Weaknesses:* ${concept1.weaknesses.join(', ')}\n\n`;
    
    response += `**${concept2.name}:**\n`;
    response += `${concept2.definition || concept2.overview || ''}\n`;
    if (concept2.advantages) response += `*Strengths:* ${concept2.advantages.join(', ')}\n`;
    if (concept2.weaknesses) response += `*Weaknesses:* ${concept2.weaknesses.join(', ')}\n\n`;
    
    response += `**Key Difference:**\n`;
    response += `${concept1.name} primarily relies on ${concept1.core_principle || 'its structural framework'}, whereas ${concept2.name} relies on ${concept2.core_principle || 'its structural framework'}.`;
    
    return response;
  }

  // 6. Knowledge Gap Recorder
  recordKnowledgeGap(message, bestScore) {
    try {
      let gaps = [];
      if (fs.existsSync(GAPS_LOG_PATH)) {
        gaps = JSON.parse(fs.readFileSync(GAPS_LOG_PATH, 'utf8'));
      }
      gaps.push({ question: message, timestamp: new Date().toISOString(), confidence: bestScore });
      if (gaps.length > 100) gaps = gaps.slice(-100);
      fs.writeFileSync(GAPS_LOG_PATH, JSON.stringify(gaps, null, 2));
    } catch (e) {
      logger.warn('[KimEngine] Failed to record gap:', e.message);
    }
  }

  // Main entry point
  async resolveQuery(message) {
    const intent = this.detectIntent(message);
    
    // Handle Comparisons (Strict parsing)
    if (intent === 'comparison') {
      let parts = [];
      
      if (message.toLowerCase().includes('difference between')) {
        let cleanMsg = this.normalizeText(message).replace('difference between', '').replace('what is the', '');
        parts = cleanMsg.split(/\s+and\s+/i);
      } else if (message.toLowerCase().includes('compare')) {
        let cleanMsg = this.normalizeText(message).replace('compare', '').replace('with', 'and');
        parts = cleanMsg.split(/\s+and\s+/i);
      } else {
        parts = this.normalizeText(message).split(/\s+vs\s+|\s+versus\s+/i);
      }
      
      if (parts.length >= 2) {
        const subject1 = parts[0].trim();
        const subject2 = parts[1].trim();
        
        let match1 = null, score1 = 0;
        let match2 = null, score2 = 0;
        
        for (const concept of this.graph) {
          const s1 = this.scoreConcept(subject1, concept);
          const s2 = this.scoreConcept(subject2, concept);
          if (s1 > score1) { score1 = s1; match1 = concept; }
          if (s2 > score2) { score2 = s2; match2 = concept; }
        }
        
        if (score1 >= 80 && score2 >= 80 && match1.id !== match2.id) {
          const answer = this.buildComparisonAnswer(match1, match2);
          return { status: "ANSWERED_LOCALLY", evidence: answer, confidence: 1.0, routedKnowledge: [match1.id, match2.id] };
        }
      }
    }

    // Standard Single-Concept Resolution
    let bestMatch = null;
    let bestScore = 0;
    let secondBestScore = 0;

    for (const concept of this.graph) {
      const score = this.scoreConcept(message, concept);
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestMatch = concept;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    // Confidence Gate: Require strong score AND a clear margin from the second-best match
    const LOCAL_THRESHOLD = 80;
    const MIN_SCORE_MARGIN = 20;
    
    // Allow historical/competition intents to bypass strict intent list checking if concept matches
    const isHistoryOrComp = bestMatch && (bestMatch.tournaments || bestMatch.records);
    const canAnswer = 
      bestScore >= LOCAL_THRESHOLD && 
      (bestScore - secondBestScore >= MIN_SCORE_MARGIN) &&
      (intent === 'general' || isHistoryOrComp || bestMatch.intents?.includes(intent) || bestMatch.sections);

    if (canAnswer) {
      const answer = this.buildAnswer(intent, bestMatch, message);
      return {
        status: "ANSWERED_LOCALLY",
        evidence: answer,
        confidence: Math.min(bestScore / 100, 1.0), // Capped at 1.0
        routedKnowledge: [bestMatch.id || bestMatch.lawNumber]
      };
    } else {
      this.recordKnowledgeGap(message, bestScore);
      
      return {
        status: "UNCERTAIN",
        evidence: bestMatch && bestScore >= 60 ? this.buildAnswer('general', bestMatch, message) : "",
        confidence: Math.min(bestScore / 100, 1.0),
        routedKnowledge: bestMatch ? [bestMatch.id || bestMatch.lawNumber] : []
      };
    }
  }
}

module.exports = new KimLocalEngine();