'use strict';

const QueryNormalizer = require('./QueryNormalizer');
const QuestionAnswerStore = require('./QuestionAnswerStore');
const MemoryEngine = require('./MemoryEngine');
const FootballDataResolver = require('./FootballDataResolver');
const FootballKnowledgeBase = require('./FootballKnowledgeBase');

/**
 * ============================================================
 * KIM — QUERY ROUTER (INTEGRATION LAYER)
 * ============================================================
 * Enforces the strict pipeline:
 * Normalize -> Memory -> Context -> QA -> Knowledge -> Data
 * ============================================================
 */

class QueryRouter {
  constructor() {
    this.VERSION = '1.0.0';
  }

  async route(uid, rawMessage, intent, entities, context = {}) {
    // 1. Normalize the query
    const normalized = QueryNormalizer.normalize(rawMessage);

    // 2. Exact QA Match (Highest priority for static knowledge)
    const qaMatch = QuestionAnswerStore.findExact(normalized.searchable);
    if (qaMatch) {
      return {
        source: 'qa_store',
        answer: qaMatch.answer,
        confidence: 1.0,
        intent: qaMatch.intent
      };
    }

    // 3. Memory-Aware Resolution
    const userMemory = MemoryEngine.getMemory(uid);
    const favoriteTeam = userMemory.football.favorite_team;

    // Contextual follow-up: "Who are we playing tomorrow?" -> "Who is Arsenal playing tomorrow?"
    let resolvedMessage = normalized.searchable;
    if (favoriteTeam && /\b(we|our|us)\b/i.test(resolvedMessage)) {
      resolvedMessage = resolvedMessage.replace(/\b(we|our|us)\b/gi, favoriteTeam);
    }

    // 4. Football Data Resolution (Historical & Live)
    if (intent === 'match_result' || intent === 'fixtures' || intent === 'head_to_head') {
      const dataResult = FootballDataResolver.resolve(intent, resolvedMessage, entities);
      if (dataResult && dataResult.answer) {
        return {
          source: 'football_data',
          answer: dataResult.answer,
          confidence: dataResult.confidence,
          data: dataResult.data
        };
      }
    }

    // 5. Football Knowledge Base (Concepts, Rules, Tactics)
    if (intent === 'football_knowledge' || intent === 'football_rule') {
      const knowledge = FootballKnowledgeBase.resolve(resolvedMessage);
      if (knowledge && knowledge.resolved) {
        return {
          source: 'football_knowledge',
          answer: knowledge.concept.simpleExplanation || knowledge.concept.definition,
          confidence: knowledge.confidence,
          data: { concept: knowledge.concept.id }
        };
      }
    }

    // 6. Fuzzy QA Match (Fallback for conversational edges)
    const fuzzyQa = QuestionAnswerStore.resolve(normalized.searchable, { threshold: 0.70 });
    if (fuzzyQa && !fuzzyQa.ambiguous) {
      return {
        source: 'qa_store_fuzzy',
        answer: fuzzyQa.answer,
        confidence: fuzzyQa.score,
        intent: fuzzyQa.intent
      };
    }

    // 7. Unresolved (Hand over to Orchestrator for LLM/Conversational fallback)
    return null;
  }
}

module.exports = new QueryRouter();