const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const LAWS_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'laws');
const TACTICS_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'tactics');

// ★ UPDATED: Dictionary now includes Laws (1-17) and Tactics (tactic_01...)
const KNOWLEDGE_KEYWORDS = {
  // Laws (1-17)
  1: ['pitch', 'field of play', 'dimensions', 'markings', 'goal area', 'crossbar', 'goalpost', 'touchline', 'goal line'],
  2: ['defective ball', 'ball bursts', 'ball pressure', 'ball weight', 'circumference', 'football weigh'],
  3: ['number of players', 'substitute', 'substitution', 'captain', 'extra person', 'minimum players', 'enter the pitch'],
  4: ['equipment', 'jewelry', 'shinguard', 'kit', 'shirt', 'ring', 'tape', 'socks', 'shorts', 'footwear', 'compulsory items'],
  5: ['referee', 'advantage', 'whistle', 'injury', 'caution', 'sent off', 'disciplinary', 'change a decision'],
  6: ['var', 'assistant referee', 'linesman', 'fourth official', 'match official', 'video assistant'],
  7: ['duration', 'half time', 'stoppage time', 'added time', 'abandoned', 'time lost', 'extra time'],
  8: ['kick-off', 'kickoff', 'dropped ball', 'restart of play', 'start of play'],
  9: ['out of play', 'in play', 'wholly crossed', 'touchline', 'goal line', 'referee contact', 'deflects off the referee'],
  10: ['goal scored', 'winning team', 'draw', 'penalty shootout', 'kicks from the penalty mark', 'outcome of the match', 'shootout', 'scoring team'],
  11: ['offside', 'active play', 'deliberate play', 'deflection', 'interfere', 'gaining an advantage'],
  12: ['handball', 'foul', 'misconduct', 'red card', 'yellow card', 'dogso', 'dangerous play', 'tackle', 'strikes', 'kicks', 'sanction', "striker's arm"],
  13: ['free kick', 'direct free kick', 'indirect free kick', 'wall', '10 yards', 'retake'],
  14: ['penalty kick', 'penalty spot', 'encroachment', 'goalkeeper line', 'penalty mark', 'penalty taker', 'saves the penalty'],
  15: ['throw-in', 'throw in', 'throwin'],
  16: ['goal kick', 'goalkick'],
  17: ['corner kick', 'corner arc', 'corner flag', 'cornerkick'],
  
  // Tactics 01 - Foundations
  'tactic_01': [
    'width', 'depth', 'stretch the pitch', 'compactness', 'compact', 'shrink the pitch', 
    'numerical superiority', 'overload', 'between the lines', 'half-spaces', 'half space', 
    'foundational principle', 'tactical foundation'
  ]
};

// Cache laws in memory
let ALL_KNOWLEDGE_CACHE = null;
function loadAllKnowledge() {
  if (ALL_KNOWLEDGE_CACHE) return ALL_KNOWLEDGE_CACHE;
  
  ALL_KNOWLEDGE_CACHE = [];
  
  // Helper to read and parse JSON safely
  const safeReadJSON = (filePath) => {
    try {
      let c = fs.readFileSync(filePath, 'utf8').trim();
      if (c.charCodeAt(0) === 0xFEFF) c = c.slice(1);
      return JSON.parse(c);
    } catch { return null; }
  };

  // Load Laws
  if (fs.existsSync(LAWS_DIR)) {
    ALL_KNOWLEDGE_CACHE.push(...fs.readdirSync(LAWS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => safeReadJSON(path.join(LAWS_DIR, f))));
  }
  
  // Load Tactics
  if (fs.existsSync(TACTICS_DIR)) {
    ALL_KNOWLEDGE_CACHE.push(...fs.readdirSync(TACTICS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => safeReadJSON(path.join(TACTICS_DIR, f))));
  }
  
  ALL_KNOWLEDGE_CACHE = ALL_KNOWLEDGE_CACHE.filter(Boolean);
  return ALL_KNOWLEDGE_CACHE;
}

class KimLocalEngine {
  constructor() {
    this.knowledgeBase = loadAllKnowledge();
  }

  // Phase 2: Intent Analyzer
  analyzeIntent(message) {
    const msg = message.toLowerCase();
    let routedIds = new Set();
    
    for (const [id, keywords] of Object.entries(KNOWLEDGE_KEYWORDS)) {
      if (keywords.some(keyword => msg.includes(keyword))) {
        // For Laws, convert back to number. For Tactics, keep as string ID.
        routedIds.add(id.startsWith('tactic_') ? id : Number(id));
      }
    }
    return Array.from(routedIds);
  }

  // Phase 3 & 5: Evidence Retriever
  retrieveEvidence(message, routedIds) {
    const msg = message.toLowerCase();
    let evidenceChunks = [];

    for (const item of this.knowledgeBase) {
      // Match either lawNumber (number) or id (string for tactics)
      const itemId = item.id ? item.id : item.lawNumber;
      
      if (routedIds.includes(itemId)) {
        // Add overview
        evidenceChunks.push({ id: itemId, type: 'overview', text: item.overview, weight: 1.0 });
        
        // Add sections
        for (const key in item.sections) {
          const sec = item.sections[key];
          let sectionText = `${sec.title}:\n${sec.plain_english}`;
          
          // Include trade-offs if they exist (for Tactics)
          if (sec.trade_offs) {
            sectionText += `\nTrade-offs: ${sec.trade_offs}`;
          }
          
          evidenceChunks.push({ id: itemId, type: 'section', title: sec.title, text: sectionText, weight: 1.5 });
        }

        // Add scenarios (High weight)
        if (item.scenarios) {
          item.scenarios.forEach(s => {
            evidenceChunks.push({ id: itemId, type: 'scenario', text: `Scenario: ${s.scenario} Question: ${s.question} Answer: ${s.answer}`, weight: 2.0 });
          });
        }

        // Add misconceptions (If they exist, mainly for Laws)
        if (item.misconceptions) {
          item.misconceptions.forEach(m => {
            evidenceChunks.push({ id: itemId, type: 'misconception', text: `Myth: ${m.myth} Fact: ${m.fact}`, weight: 1.8 });
          });
        }
      }
    }
    return evidenceChunks;
  }

  // Phase 4: Confidence Scoring
  calculateConfidence(message, evidenceChunks) {
    if (evidenceChunks.length === 0) return 0;
    
    const msg = message.toLowerCase();
    const msgWords = msg.match(/\b(\w+)\b/g) || [];
    let totalScore = 0;
    let maxPossibleScore = 0;

    for (const chunk of evidenceChunks) {
      let chunkScore = 0;
      const chunkText = chunk.text.toLowerCase();
      
      // Calculate word overlap
      msgWords.forEach(word => {
        if (word.length > 3 && chunkText.includes(word)) {
          chunkScore += 0.1;
        }
      });

      // Boost score based on chunk type weight
      totalScore += chunkScore * chunk.weight;
      maxPossibleScore += (msgWords.length * 0.1) * chunk.weight;
    }

    // Normalize score to 0.0 - 1.0
    let confidence = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;
    
    // Cap at 1.0
    return Math.min(confidence, 1.0);
  }

  // Main entry point
  async resolveQuery(message) {
    const intent = this.analyzeIntent(message);
    if (intent.length === 0) {
      return { status: "UNCERTAIN", evidence: [], confidence: 0 };
    }

    const evidence = this.retrieveEvidence(message, intent);
    const confidence = this.calculateConfidence(message, evidence);

    // If we have strong evidence and multiple matching keywords, we can answer locally
    const hasStrongEvidence = confidence >= 0.15 || evidence.some(e => e.type === 'scenario' && message.toLowerCase().includes(e.text.toLowerCase().split(' ')[5]));

    if (hasStrongEvidence) {
      // Format local answer
      const contextStr = evidence.map(e => e.text).join('\n\n');
      return { 
        status: "ANSWERED_LOCALLY", 
        evidence: contextStr, 
        confidence,
        routedKnowledge: intent
      };
    } else {
      // Weak match, send to Gemini Gate
      return { 
        status: "UNCERTAIN", 
        evidence: evidence.map(e => e.text).join('\n\n'), 
        confidence,
        routedKnowledge: intent
      };
    }
  }
}

module.exports = new KimLocalEngine();