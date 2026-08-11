const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');
const ENTITIES_DIR = path.join(KNOWLEDGE_DIR, 'entities');
const GAPS_LOG_PATH = path.join(process.cwd(), 'logs', 'kim_knowledge_gaps.json');

let KNOWLEDGE_GRAPH_CACHE = null;
let TEAM_INTEL_CACHE = null;
let RECORDS_CACHE = null;

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
  logger.info(`[KimEngine] Loaded ${KNOWLEDGE_GRAPH_CACHE.length} core concepts into Knowledge Graph.`);
  return KNOWLEDGE_GRAPH_CACHE;
}

// ★ NEW: Load Team Intelligence and Records dynamically
function loadTeamIntel(teamSlug) {
  if (!fs.existsSync(ENTITIES_DIR)) return null;
  const filePath = path.join(ENTITIES_DIR, 'team_intelligence', `${teamSlug}.json`);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) { return null; }
  }
  return null;
}

function loadH2H(teamASlug, teamBSlug) {
  if (!fs.existsSync(ENTITIES_DIR)) return null;
  const teams = [teamASlug, teamBSlug].sort();
  const filePath = path.join(ENTITIES_DIR, 'h2h', `${teams[0]}_${teams[1]}.json`);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) { return null; }
  }
  return null;
}

class KimLocalEngine {
  constructor() {
    this.graph = loadKnowledgeGraph();
  }

  normalizeText(text) {
    return text.toLowerCase().replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  slugify(text) {
    return this.normalizeText(text).replace(/\s+/g, '_');
  }

  containsPhrase(text, phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  }

  detectIntent(message) {
    const msg = this.normalizeText(message);

    if (/\b(vs|versus|head to head|h2h)\b/.test(msg)) return 'h2h';
    if (/\b(top scorer|golden boot|top goalscorer|all time top)\b/.test(msg)) return 'top_scorers_competition';
    if (/\b(form|recent results|last 5|last 10|how are they doing)\b/.test(msg)) return 'team_form';
    if (/\b(elo|strength|how good are|win rate|stats|home record|away record|goal patterns|over 2 5|btts|comebacks|resilience)\b/.test(msg)) return 'team_stats';
    
    if (/\b(vs|versus|difference between|compare|comparison)\b/.test(msg)) return 'comparison';
    if (/\b(host|hosted|hosting)\b/.test(msg)) return 'hosts';
    if (/\b(how many teams|number of teams|teams played)\b/.test(msg)) return 'teams';
    if (/\b(attendance|spectators|crowd)\b/.test(msg)) return 'attendance';
    if (/\b(most titles|most wins|most championships|most world cups|won the.*most|most world|who has won the most)\b/.test(msg)) return 'records';
    if (/\b(most goals|most goals in a tournament|record goals)\b/.test(msg)) return 'records';
    if (/\b(who won|winner of|who hosted|history of|historical|first world cup)\b/.test(msg) || /\b(19\d{2}|20\d{2})\b/.test(msg)) {
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

  // ★ NEW: Extract team names from message to find intel files
  extractTeamNames(message) {
    const msg = this.normalizeText(message);
    let parts = [];
    if (msg.includes(' vs ') || msg.includes(' v ') || msg.includes(' versus ')) {
      parts = msg.split(/\s+vs\s+|\s+v\s+|\s+versus\s+/i);
    } else if (msg.includes(' and ')) {
      parts = msg.split(/\s+and\s+/i);
    }
    
    if (parts.length >= 2) {
      // Clean up trailing words like "history", "stats", "form"
      const cleanPart = (p) => p.replace(/\b(history|stats|form|record|h2h|head to head|elo|strength)\b/g, '').trim();
      return [cleanPart(parts[0]), cleanPart(parts[1])];
    }
    return [];
  }

  scoreConcept(message, concept) {
    const msg = this.normalizeText(message);
    let score = 0;
    let matchCount = 0;

    const name = this.normalizeText(concept.name || concept.title || '');
    const aliases = (concept.aliases || []).map(a => this.normalizeText(a));
    const keywords = (concept.keywords || []).map(k => this.normalizeText(k));
    
    if (name && this.containsPhrase(msg, name)) {
      score += 100;
      matchCount++;
    }
    keywords.forEach(k => { if (k && this.containsPhrase(msg, k)) { score += 80; matchCount++; } });
    aliases.forEach(a => { if (a && this.containsPhrase(msg, a)) { score += 60; matchCount++; } });

    const hasYear = /\b(19\d{2}|20\d{2})\b/.test(msg);
    const id = concept.id || '';
    
    if (hasYear) {
      if (id === 'world_cup_finals' && msg.includes('final')) score += 50;
      else if (id === 'world_cup_tournaments') score += 50;
    }
    if (id === 'world_cup_tournaments' && (msg.includes('first') || msg.includes('last') || msg.includes('recent'))) score += 50;
    if (id === 'world_cup_records' && (msg.includes('most') || msg.includes('record') || msg.includes('best'))) score += 50;
    if (id === 'world_cup_format' && (/\bformat\b/.test(msg) || msg.includes('structure') || (msg.includes('how many teams') && !hasYear))) score += 50;

    if (matchCount === 1 && score < 80) score = score / 2; 
    return score;
  }
  
  buildAnswer(intent, concept, message) {
    let response = `**${concept.name || concept.title}**\n\n`;

    if (concept.tournaments || concept.records || concept.finals || concept.matches || concept.format) {
      const msg = this.normalizeText(message);
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
      if (concept.tournaments) {
        let yearToFind = null;
        const yearMatch = msg.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) yearToFind = parseInt(yearMatch[0]);
        else if (msg.includes('first')) yearToFind = 1930;
        else if (msg.includes('last') || msg.includes('latest') || msg.includes('recent')) yearToFind = concept.tournaments[0].year;
        
        if (yearToFind) {
          const year = yearToFind;
          const tournament = concept.tournaments.find(t => t.year === year);
          if (tournament) {
            let tResponse = `**${year} ${concept.name}**\n\n`;
            if (intent === 'top_scorers' || msg.includes('top scorer') || msg.includes('golden boot')) tResponse += `**Top Scorer:** ${tournament.top_scorer} (${tournament.top_scorer_goals} goals)`;
            else if (intent === 'hosts' || msg.includes('host')) tResponse += `**Host:** ${tournament.host}`;
            else if (intent === 'teams' || msg.includes('how many teams') || msg.includes('teams played')) tResponse += `**Teams:** ${tournament.teams}\n**Matches:** ${tournament.matches}`;
            else if (intent === 'attendance') tResponse += `**Attendance:** ${tournament.attendance.toLocaleString()}`;
            else {
              tResponse += `**Host:** ${tournament.host}\n**Champion:** ${tournament.champion}\n**Runner-up:** ${tournament.runner_up}\n**Top Scorer:** ${tournament.top_scorer} (${tournament.top_scorer_goals} goals)\n**Teams:** ${tournament.teams}\n**Matches:** ${tournament.matches}\n**Attendance:** ${tournament.attendance.toLocaleString()}`;
            }
            return tResponse;
          } else return `I don't have a record of a ${concept.name} in ${year}.`;
        } else {
          const recent = concept.tournaments[0];
          let tResponse = `**${concept.name}**\n\nI have data for ${concept.tournaments.length} tournaments.\n\n**Most Recent (${recent.year}):**\nHost: ${recent.host}\nChampion: ${recent.champion}\nRunner-up: ${recent.runner_up}\n\nAsk me about a specific year (e.g., "Who won in 2014?")`;
          return tResponse;
        }
      }
      if (concept.finals) {
        const yearMatch = msg.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) {
          const year = parseInt(yearMatch[0]);
          const final = concept.finals.find(f => f.year === year);
          if (final) {
            let fResponse = `**${year} World Cup Final**\n\n**Winner:** ${final.winner}\n**Runner-up:** ${final.runner_up}\n**Score:** ${final.score}\n`;
            if (final.shootout) fResponse += `**Penalties:** ${final.shootout}\n`;
            fResponse += `**Venue:** ${final.venue}`;
            return fResponse;
          }
        }
      }
      if (concept.format) {
        let fResponse = `**${concept.name}**\n\n${concept.definition}\n\n`;
        if (concept.history && concept.history.length > 0) {
          fResponse += `**Historical Formats:**\n`;
          concept.history.forEach(h => { fResponse += `- ${h.era}: ${h.format}\n`; });
        }
        return fResponse;
      }
    }

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
      response += concept.overview || '';
      return response;
    }

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

  // ★ NEW: Build Team Intelligence Answer
  buildTeamIntelAnswer(intent, teamIntel) {
    let res = `**${teamIntel.name} Intelligence**\n\n`;
    
    if (intent === 'team_form') {
      res += `**Recent Form (Last 10):**\n`;
      teamIntel.recent_form.slice(-5).forEach(m => {
        res += `- ${m.date}: ${m.opp} (${m.venue}) ${m.gf}-${m.ga} -> ${m.res}\n`;
      });
    } else if (intent === 'team_stats') {
      res += `**Overall:** ${teamIntel.overall.win}W ${teamIntel.overall.draw}D ${teamIntel.overall.loss}L\n`;
      res += `**Home:** ${teamIntel.home.win}W ${teamIntel.home.draw}D ${teamIntel.home.loss}L (Win Rate: ${((teamIntel.home.win/teamIntel.home.played)*100).toFixed(1)}%)\n`;
      res += `**Away:** ${teamIntel.away.win}W ${teamIntel.away.draw}D ${teamIntel.away.loss}L (Win Rate: ${((teamIntel.away.win/teamIntel.away.played)*100).toFixed(1)}%)\n`;
      if (teamIntel.goal_patterns) {
        res += `\n**Goal Patterns:**\n`;
        res += `- Over 2.5: ${teamIntel.goal_patterns.overall.over_2_5_pct}%\n`;
        res += `- BTTS: ${teamIntel.goal_patterns.overall.btts_pct}%\n`;
      }
      if (teamIntel.resilience) {
        res += `\n**Resilience:**\n- Comeback Wins: ${teamIntel.resilience.comeback_wins}\n- Lead Protection Rate: ${teamIntel.resilience.lead_protection_rate}%\n`;
      }
    } else {
      res += `**Overall Record:** ${teamIntel.overall.played} played, ${teamIntel.overall.win} wins, ${teamIntel.overall.draw} draws, ${teamIntel.overall.loss} losses.`;
    }
    return res;
  }

  // ★ NEW: Build H2H Answer
  buildH2HAnswer(h2h) {
    let res = `**Head-to-Head: ${h2h.teamA.replace(/_/g, ' ')} vs ${h2h.teamB.replace(/_/g, ' ')}**\n\n`;
    res += `**Total Meetings:** ${h2h.meetings}\n`;
    res += `**${h2h.teamA.replace(/_/g, ' ')} Wins:** ${h2h.teamA_wins}\n`;
    res += `**${h2h.teamB.replace(/_/g, ' ')} Wins:** ${h2h.teamB_wins}\n`;
    res += `**Draws:** ${h2h.draws}\n`;
    res += `\n**Goal Markets:**\n- Over 2.5: ${h2h.over_2_5_pct}%\n- BTTS: ${h2h.btts_pct}%\n`;
    
    if (h2h.last_5 && h2h.last_5.length > 0) {
      res += `\n**Last 5 Meetings:**\n`;
      h2h.last_5.slice(0, 5).forEach(m => {
        res += `- ${m.date}: ${m.teamA.replace(/_/g, ' ')} ${m.teamA_score} - ${m.teamB_score} ${m.teamB.replace(/_/g, ' ')}\n`;
      });
    }
    return res;
  }

  buildComparisonAnswer(concept1, concept2) {
    let response = `**Tactical Comparison: ${concept1.name} vs ${concept2.name}**\n\n`;
    response += `**${concept1.name}:**\n${concept1.definition || concept1.overview || ''}\n`;
    if (concept1.advantages) response += `*Strengths:* ${concept1.advantages.join(', ')}\n`;
    if (concept1.weaknesses) response += `*Weaknesses:* ${concept1.weaknesses.join(', ')}\n\n`;
    response += `**${concept2.name}:**\n${concept2.definition || concept2.overview || ''}\n`;
    if (concept2.advantages) response += `*Strengths:* ${concept2.advantages.join(', ')}\n`;
    if (concept2.weaknesses) response += `*Weaknesses:* ${concept2.weaknesses.join(', ')}\n\n`;
    response += `**Key Difference:**\n${concept1.name} primarily relies on ${concept1.core_principle || 'its structural framework'}, whereas ${concept2.name} relies on ${concept2.core_principle || 'its structural framework'}.`;
    return response;
  }

  recordKnowledgeGap(message, bestScore, intent, entities = []) {
    try {
      let gaps = [];
      if (fs.existsSync(GAPS_LOG_PATH)) gaps = JSON.parse(fs.readFileSync(GAPS_LOG_PATH, 'utf8'));
      
      gaps.push({
        question: message,
        timestamp: new Date().toISOString(),
        intent: intent,
        entities: entities, 
        matchScore: bestScore,
        answer_status: "UNKNOWN",
        reason: bestScore < 80 ? "missing_knowledge_concept" : "low_confidence_margin"
      });
      
      if (gaps.length > 500) gaps = gaps.slice(-500);
      fs.writeFileSync(GAPS_LOG_PATH, JSON.stringify(gaps, null, 2));
    } catch (e) {
      logger.warn('[KimEngine] Failed to record gap:', e.message);
    }
  }

  async resolveQuery(message) {
    const intent = this.detectIntent(message);
    const msg = this.normalizeText(message);

    // ★ NEW: Team Intelligence & H2H Resolution
    const teams = this.extractTeamNames(msg);
    
    if (intent === 'h2h' && teams.length >= 2) {
      const h2h = loadH2H(this.slugify(teams[0]), this.slugify(teams[1]));
      if (h2h) {
        return { status: "ANSWERED_LOCALLY", evidence: this.buildH2HAnswer(h2h), confidence: 1.0, routedKnowledge: [h2h.id] };
      }
    }

    if ((intent === 'team_form' || intent === 'team_stats') && teams.length >= 1) {
      const teamIntel = loadTeamIntel(this.slugify(teams[0]));
      if (teamIntel) {
        return { status: "ANSWERED_LOCALLY", evidence: this.buildTeamIntelAnswer(intent, teamIntel), confidence: 1.0, routedKnowledge: [teamIntel.id] };
      }
    }

    // Existing Concept Graph Resolution
    if (intent === 'comparison') {
      let parts = [];
      if (msg.includes('difference between')) {
        let cleanMsg = msg.replace('difference between', '').replace('what is the', '');
        parts = cleanMsg.split(/\s+and\s+/i);
      } else if (msg.includes('compare')) {
        let cleanMsg = msg.replace('compare', '').replace('with', 'and');
        parts = cleanMsg.split(/\s+and\s+/i);
      } else {
        parts = msg.split(/\s+vs\s+|\s+versus\s+/i);
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

    const SCORE_THRESHOLD = 80;
    const MARGIN_THRESHOLD = 20;
    const canAnswer = bestScore >= SCORE_THRESHOLD && (bestScore - secondBestScore) >= MARGIN_THRESHOLD;
    const confidence = canAnswer ? Math.min(((bestScore - secondBestScore) / 100) + (bestScore / 200), 1.0) : Math.min(bestScore / 200, 0.5);

    if (canAnswer) {
      const answer = this.buildAnswer(intent, bestMatch, message);
      return { 
        status: "ANSWERED_LOCALLY", 
        evidence: answer, 
        confidence, 
        routedKnowledge: [bestMatch.id || bestMatch.lawNumber] 
      };
    } else {
      if (bestScore >= SCORE_THRESHOLD && (bestScore - secondBestScore) < MARGIN_THRESHOLD) {
        return {
          status: "CLARIFICATION_REQUIRED",
          evidence: "I found multiple possible matches for your question. Could you provide a bit more detail (like a year or specific team)?",
          confidence: 0.5,
          routedKnowledge: []
        };
      }
      
      this.recordKnowledgeGap(message, bestScore, intent);
      return { 
        status: "UNCERTAIN", 
        evidence: bestMatch && bestScore >= 60 ? this.buildAnswer('general', bestMatch, message) : "", 
        confidence, 
        routedKnowledge: bestMatch ? [bestMatch.id || bestMatch.lawNumber] : [] 
      };
    }
  }
}

module.exports = new KimLocalEngine();