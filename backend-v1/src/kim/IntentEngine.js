'use strict';

const EntityEngine = require('./EntityEngine');

class IntentEngine {
  constructor() {
    this.VERSION = '3.2.0';
    this.config = {
      maxCandidates: 8,
      explanationCandidates: 5,
      minimumConfidence: 0.35,
      strongConfidence: 0.85,
      ambiguityMargin: 0.08,
      maxConfidence: 0.999,
      contextualConfidence: 0.96
    };
    this.rules = this.buildRules();
  }

  buildRules() {
    return [
      { intent: 'prediction', priority: 12, confidence: 0.96, patterns: [/\bpredict\b/i, /\bpredict(?:ion|ions)?\b/i, /\bwho will win\b/i, /\bwho is likely to win\b/i, /\bwinning chance\b/i, /\bwin probability\b/i, /\bprobability of winning\b/i, /\bchances of winning\b/i, /\bwho do you think will win\b/i, /\bwho do you fancy\b/i, /\btip\b/i, /\btips\b/i, /\bbetting tip\b/i] },
      { intent: 'match_analysis', priority: 12, confidence: 0.96, patterns: [/\banaly[sz]e\b/i, /\banaly[sz]e the match\b/i, /\banalysis\b/i, /\bbreak down\b/i, /\bpreview\b/i, /\bmatch preview\b/i, /\bhow do you see\b/i, /\btactical analysis\b/i, /\btactical breakdown\b/i, /\bhow will .* play\b/i] },
      
      { intent: 'live_matches', priority: 11, confidence: 0.96, patterns: [/\blive matches\b/i, /\blive games\b/i, /\bwhat is live\b/i, /\bwhat's live\b/i, /\blive score\b/i, /\blive scores\b/i, /\bcurrently playing\b/i, /\bplaying right now\b/i, /\bwho is playing now\b/i, /\bmatches live\b/i, /\bgames live\b/i] },
      { intent: 'match_result', priority: 11, confidence: 0.94, patterns: [/\bwho won\b/i, /\bwho lost\b/i, /\bwhat was the score\b/i, /\bfinal score\b/i, /\bmatch result\b/i, /\bresult of\b/i, /\bhow did .* finish\b/i, /\bwhat happened in .* match\b/i] },
      { intent: 'head_to_head', priority: 11, confidence: 0.94, patterns: [/\bhead to head\b/i, /\bh2h\b/i, /\bh2h history\b/i, /\bhistory between\b/i, /\brecord between\b/i, /\bmeetings between\b/i, /\bprevious meetings\b/i, /\bhow many times .* played\b/i] },
      
      { intent: 'fixtures', priority: 10, confidence: 0.93, patterns: [/\bfixtures\b/i, /\bfixture\b/i, /\bupcoming matches\b/i, /\bnext matches\b/i, /\bnext game\b/i, /\bnext match\b/i, /\bwho is playing\b/i, /\bmatches today\b/i, /\bgames today\b/i, /\bplaying tomorrow\b/i, /\bnext fixture\b/i] },
      { intent: 'player_analysis', priority: 10, confidence: 0.92, patterns: [/\bplayer stats\b/i, /\bplayer statistics\b/i, /\bplayer form\b/i, /\bhow good is .* player\b/i, /\bhow many goals has\b/i, /\bgoals .* scored\b/i, /\bassists\b/i, /\bappearances\b/i, /\bperformance of\b/i, /\bhow has .* played\b/i] },
      
      { intent: 'team_comparison', priority: 9, confidence: 0.84, patterns: [/\bcompare\b/i, /\bcomparison\b/i, /\bbetter than\b/i, /\bstronger than\b/i, /\bweaker than\b/i, /\bwho is better\b/i, /\bwho is stronger\b/i, /\bwhich team is better\b/i, /\bwhich is better\b/i, /\bversus\b/i] },
      { intent: 'team_form', priority: 9, confidence: 0.92, patterns: [/\bform\b/i, /\brecent form\b/i, /\blast matches\b/i, /\brecent results\b/i, /\bhow have .* been\b/i, /\bhow has .* been\b/i, /\bhow are .* doing\b/i, /\bcurrent form\b/i] },
      { intent: 'team_analysis', priority: 9, confidence: 0.91, patterns: [/\bteam stats\b/i, /\bteam statistics\b/i, /\bhow good is\b/i, /\bhow strong is\b/i, /\bteam performance\b/i, /\bstrength of\b/i, /\bteam profile\b/i] },
      { intent: 'competition', priority: 9, confidence: 0.90, patterns: [/\bstandings\b/i, /\btable\b/i, /\bleague table\b/i, /\bwho leads\b/i, /\bwho is top\b/i, /\btop of the table\b/i, /\bcompetition\b/i, /\bleague leaders\b/i, /\bpoints table\b/i] },
      
      { intent: 'football_knowledge', priority: 8, confidence: 0.90, patterns: [/\bwhat is\b/i, /\bwhat does\b/i, /\bexplain\b/i, /\bmeaning of\b/i, /\bhow does\b/i, /\bwhy does\b/i, /\bwhy is\b/i, /\bwhat are the rules\b/i, /\brule\b/i, /\blaw of the game\b/i, /\bfootball law\b/i, /\bwho has won\b/i, /\bmost titles\b/i, /\bmost times\b/i] },
      { intent: 'identity', priority: 8, confidence: 0.98, patterns: [/\bwho are you\b/i, /\bwhat are you\b/i, /\bwhat is your name\b/i, /\bwho made you\b/i, /\bwho built you\b/i, /\bwhat can you do\b/i, /\bwhat do you know\b/i] },
      
      { intent: 'casual', priority: 5, confidence: 0.86, patterns: [/\bhello\b/i, /\bhi\b/i, /\bhey\b/i, /\bthanks\b/i, /\bthank you\b/i, /\bgood morning\b/i, /\bgood afternoon\b/i, /\bgood evening\b/i, /\bgood night\b/i, /\bhow are you\b/i, /\bi'm bored\b/i, /\bi am bored\b/i, /\bwhat's up\b/i, /\bwhats up\b/i] }
    ];
  }

  resolve(message, memory = {}) {
    const originalText = String(message || '').trim();
    if (!originalText) return { intent: 'empty', entities: [], confidence: 1, signals: [] };

    const text = this.normalizeText(originalText);
    const activeContext = memory?.activeContext || {};
    const entities = this.extractEntities(originalText);
    const lexicalSignals = this.detectLexicalSignals(text);

    const contextual = this.resolveContextualIntent(text, entities, activeContext);
    if (contextual) {
      return {
        intent: contextual.intent,
        entities: contextual.entities || entities,
        confidence: contextual.confidence,
        signals: {
          contextual: true,
          matchedPatterns: contextual.matchedPatterns || 0,
          entityCount: entities.length,
          inheritedContext: true,
          candidates: [],
          lexicalSignals
        }
      };
    }

    const candidates = this.buildCandidates(text, entities, lexicalSignals, activeContext);

if (!candidates.length) {
  const teamCount = entities.filter(e => e.type === 'team').length;
  const playerCount = entities.filter(e => e.type === 'player').length;

  if (teamCount > 0 && playerCount === 0) {
    return {
      intent: 'team_analysis',
      entities,
      confidence: 0.70,
      signals: {
        matchedPatterns: 0,
        entityCount: entities.length,
        contextual: false,
        candidates: [],
        lexicalSignals,
        fallback: true
      }
    };
  }

  if (playerCount > 0 && teamCount === 0) {
    return {
      intent: 'player_analysis',
      entities,
      confidence: 0.70,
      signals: {
        matchedPatterns: 0,
        entityCount: entities.length,
        contextual: false,
        candidates: [],
        lexicalSignals,
        fallback: true
      }
    };
  }

  return {
    intent: 'general',
    entities,
    confidence: 0.45,
    signals: {
      matchedPatterns: 0,
      entityCount: entities.length,
      contextual: false,
      candidates: [],
      lexicalSignals
    }
  };
}


    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.confidence - a.confidence;
    });

    const best = candidates[0];
    const ambiguity = this.detectAmbiguity(candidates);
    const finalConfidence = this.calibrateConfidence(best, ambiguity);

    // ★ FIX: Entity-Aware Fallback for natural language queries
    // If no strong rule matched (defaults to general), but a team/player exists,
    // route to their respective analysis intents.
    const teamCount = entities.filter(e => e.type === 'team').length;
    const playerCount = entities.filter(e => e.type === 'player').length;

    if (best.intent === 'general') {
      if (teamCount > 0 && playerCount === 0) {
        return { intent: 'team_analysis', entities, confidence: 0.70, signals: { matchedPatterns: 0, entityCount: entities.length, contextual: false, candidates: [], lexicalSignals, fallback: true } };
      }
      if (playerCount > 0 && teamCount === 0) {
        return { intent: 'player_analysis', entities, confidence: 0.70, signals: { matchedPatterns: 0, entityCount: entities.length, contextual: false, candidates: [], lexicalSignals, fallback: true } };
      }
    }

    return {
      intent: best.intent,
      entities,
      confidence: finalConfidence,
      signals: {
        contextual: false,
        matchedPatterns: best.matchedPatterns,
        entityCount: entities.length,
        lexicalSignals,
        ambiguity,
        candidates: candidates.slice(0, this.config.explanationCandidates).map(c => ({
          intent: c.intent,
          priority: c.priority,
          confidence: c.confidence,
          score: c.score,
          matchedPatterns: c.matchedPatterns,
          reasons: c.reasons
        }))
      }
    };
  }

  normalizeText(text) {
    return String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  }

  detectLexicalSignals(text) {
    return {
      question: /\?$/.test(text) || /^(who|what|when|where|why|how|which|is|are|can|do|does|did|will)\b/i.test(text),
      comparison: /\b(vs|versus|against|better|stronger|weaker|compare)\b/i.test(text),
      prediction: /\b(predict|prediction|likely|probability|chance|win)\b/i.test(text),
      historical: /\b(history|historical|previous|past|old|record|ever)\b/i.test(text),
      recent: /\b(today|tonight|tomorrow|yesterday|recent|currently|now|latest)\b/i.test(text),
      temporal: /\b(today|tomorrow|yesterday|last|next|recent|current|latest)\b/i.test(text),
      explanation: /\b(why|how|explain|meaning|what is|what does)\b/i.test(text),
      ranking: /\b(top|best|worst|highest|lowest|rank|ranking|leader)\b/i.test(text),
      casual: /\b(hello|hi|hey|bro|bana|sasa|maze|msee|lol|😂|😭)\b/i.test(text),
      directAction: /\b(show|give|tell|find|check|predict|compare|analyze|analyse|explain)\b/i.test(text),
      negation: /\b(not|never|don't|dont|didn't|didnt|isn't|isnt|wasn't|wasnt|can't|cant|no)\b/i.test(text)
    };
  }

  buildCandidates(text, entities, lexicalSignals, activeContext) {
    const candidates = [];
    const teamCount = entities.filter(e => e.type === 'team').length;
    const playerCount = entities.filter(e => e.type === 'player').length;
    const competitionCount = entities.filter(e => e.type === 'competition').length;
    const comparisonEntity = entities.some(e => e.type === 'comparison');

    for (const rule of this.rules) {
      const matchedPatterns = rule.patterns.filter(pattern => pattern.test(text));
      if (!matchedPatterns.length) continue;

      let score = rule.confidence;
      const reasons = [`${matchedPatterns.length} pattern(s) matched`];

      if (rule.intent === 'team_comparison' && teamCount >= 2) { score += 0.08; reasons.push('two or more teams detected'); }
      if (rule.intent === 'prediction' && teamCount >= 2) { score += 0.04; reasons.push('multiple teams support prediction'); }
      if (rule.intent === 'match_analysis' && teamCount >= 2) { score += 0.05; reasons.push('multiple teams support match analysis'); }
      if (rule.intent === 'player_analysis' && playerCount >= 1) { score += 0.06; reasons.push('player entity detected'); }
      if (rule.intent === 'competition' && competitionCount >= 1) { score += 0.06; reasons.push('competition entity detected'); }
      if (rule.intent === 'team_comparison' && comparisonEntity) { score += 0.05; reasons.push('comparison entity detected'); }

      if (rule.intent === 'prediction' && lexicalSignals.prediction) score += 0.04;
      if (rule.intent === 'team_comparison' && lexicalSignals.comparison) score += 0.04;
      if (rule.intent === 'football_knowledge' && lexicalSignals.explanation) score += 0.03;
      if (rule.intent === 'competition' && lexicalSignals.ranking) score += 0.03;
      if (rule.intent === 'match_result' && lexicalSignals.recent) score += 0.02;
      if (rule.intent === 'fixtures' && lexicalSignals.temporal) score += 0.03;
      if (rule.intent === 'live_matches' && /\b(now|currently|live|right now)\b/i.test(text)) score += 0.05;
      if (rule.intent === 'identity' && /\b(you|your|yourself)\b/i.test(text)) score += 0.04;
      if (rule.intent === 'casual' && lexicalSignals.casual) score += 0.03;

      score += rule.priority * 0.002;

      candidates.push({
        intent: rule.intent,
        priority: rule.priority,
        confidence: Math.min(score, this.config.maxConfidence),
        score: Math.min(score, this.config.maxConfidence),
        matchedPatterns: matchedPatterns.length,
        reasons
      });
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, this.config.maxCandidates);
  }

  resolveContextualIntent(text, entities, activeContext) {
    if (!activeContext) return null;

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const inheritedTeams = Array.isArray(activeContext.teams) ? activeContext.teams : [];
    const inheritedPlayers = Array.isArray(activeContext.players) ? activeContext.players : [];

    if (/\bwhat about\b|\bhow about\b/i.test(text)) {
      const mergedEntities = this.mergeContextEntities(entities, inheritedTeams, inheritedPlayers);
      return { intent: activeContext.intent || 'follow_up', entities: mergedEntities, confidence: entities.length ? 0.97 : 0.91, matchedPatterns: 1 };
    }

    const pronounFollowUp = wordCount <= 8 && /\b(their|them|they|he|she|his|her|it|that|those|these)\b/i.test(text);
    
    // ★ FIX: Exclude "What is" and "Who is" from short follow-ups so they route to Knowledge
    const isKnowledgeQuestion = /\bwhat is\b/i.test(text) || /\bwho is\b/i.test(text);
    const shortQuestion = wordCount <= 5 && /^(who|why|how|when|where|what|which)\b/i.test(text) && !isKnowledgeQuestion;

    if (pronounFollowUp || shortQuestion) {
      const mergedEntities = this.mergeContextEntities(entities, inheritedTeams, inheritedPlayers);
      return { intent: this.inferFollowUpIntent(text, activeContext), entities: mergedEntities, confidence: this.config.contextualConfidence, matchedPatterns: 1 };
    }

    const hasPlayers = entities.some(entity => entity.type === 'player');
    if (hasPlayers && /\b(goals?|assists?|stats?|form|better|good|best|performance|appearances?)\b/i.test(text)) {
      return { intent: 'player_analysis', confidence: 0.97, matchedPatterns: 1 };
    }

    if (activeContext.matchId && wordCount <= 10) {
      if (/\bscore|result|won|lost|finished|finish\b/i.test(text)) return { intent: 'match_result', confidence: 0.96, matchedPatterns: 1 };
      if (/\bwhy|how|performance|tactics|play\b/i.test(text)) return { intent: 'match_analysis', confidence: 0.94, matchedPatterns: 1 };
    }

    return null;
  }

  inferFollowUpIntent(text, activeContext) {
    if (/\bwho scored\b/i.test(text)) return 'match_result';
    if (/\bwhy\b/i.test(text)) return 'match_analysis';
    if (/\bhow\b/i.test(text)) return activeContext.intent || 'follow_up';
    if (/\bwhen\b/i.test(text)) return 'fixtures';
    if (/\bwho\b/i.test(text)) return activeContext.intent || 'follow_up';
    return activeContext.intent || 'follow_up';
  }

  mergeContextEntities(currentEntities, teams, players) {
    const merged = [...currentEntities];

    for (const team of teams) {
      if (!merged.some(entity => entity.value === team)) merged.push({ type: 'team', value: team, source: 'context' });
    }

    for (const player of players) {
      if (!merged.some(entity => entity.value === player)) merged.push({ type: 'player', value: player, source: 'context' });
    }

    return merged;
  }

  detectAmbiguity(candidates) {
    if (candidates.length < 2) return { ambiguous: false, margin: 1, competing: [] };
    const first = candidates[0];
    const second = candidates[1];
    const margin = first.score - second.score;
    const ambiguous = margin < this.config.ambiguityMargin;
    return { ambiguous, margin: Number(margin.toFixed(4)), competing: ambiguous ? [first.intent, second.intent] : [] };
  }

  calibrateConfidence(candidate, ambiguity) {
    let confidence = candidate.confidence;
    if (ambiguity?.ambiguous) confidence -= 0.08;
    if (candidate.matchedPatterns >= 2) confidence += 0.02;
    return Number(Math.min(this.config.maxConfidence, Math.max(this.config.minimumConfidence, confidence)).toFixed(3));
  }

  extractEntities(message) {
    try {
      return EntityEngine.extract(message);
    } catch (error) {
      console.error('[IntentEngine] Entity extraction failed:', error.message);
      return [];
    }
  }

  isIntent(message, intent, memory = {}) {
    return this.resolve(message, memory).intent === intent;
  }

  getEntities(message) { return this.extractEntities(message); }
  getTeams(message) { return EntityEngine.teams(this.extractEntities(message)); }
  getPlayers(message) { return EntityEngine.players(this.extractEntities(message)); }
  getCompetitions(message) { return EntityEngine.competitions(this.extractEntities(message)); }

  explain(message, memory = {}) {
    const result = this.resolve(message, memory);
    return { version: this.VERSION, message, intent: result.intent, confidence: result.confidence, entities: result.entities, signals: result.signals };
  }

  getStats() {
    return {
      version: this.VERSION,
      ruleCount: this.rules.length,
      intents: [...new Set(this.rules.map(rule => rule.intent))],
      configuration: { ...this.config }
    };
  }
}

module.exports = new IntentEngine();