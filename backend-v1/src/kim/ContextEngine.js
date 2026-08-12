'use strict';

/**
 * ============================================================
 * KIM — CONTEXT ENGINE
 * ============================================================
 *
 * Responsibility:
 *   - Maintain structured conversational football context (activeContext)
 *   - Resolve pronouns and implicit references
 *   - Preserve teams, players, competitions, seasons, and years
 *   - Track active matches and historical datasets
 *   - Support multi-turn football conversations
 *
 * IMPORTANT:
 *   This engine does NOT determine final intent.
 *   It only maintains and resolves conversational context.
 * ============================================================
 */

class ContextEngine {
  constructor() {
    this.VERSION = '3.0.0';
    this.sessions = new Map();
    this.MAX_HISTORY = 20;
  }

  /* ============================================================
     SESSION MANAGEMENT
  ============================================================ */

  createSession() {
    return {
      lastIntent: null,
      lastEntities: [],
      
      // ★ FIX: Unified structured context object
      activeContext: {
        teams: [],
        players: [],
        competitions: [],
        countries: [],
        year: null,
        season: null,
        match: null,
        historicalEvent: null // Used for multi-turn history queries
      },
      
      activeDataset: null,
      lastResult: null,
      lastSubject: null,
      lastQuestion: null,
      lastMessage: null,
      
      history: [],
      updatedAt: Date.now()
    };
  }

  getOrCreateSession(uid) {
    const key = String(uid || 'anonymous');
    if (!this.sessions.has(key)) {
      this.sessions.set(key, this.createSession());
    }
    return this.sessions.get(key);
  }

  getContext(uid) {
    return this.sessions.get(String(uid || 'anonymous')) || {};
  }

  getActiveContext(uid) {
    const session = this.getContext(uid);
    return session.activeContext || {};
  }

  clear(uid) {
    this.sessions.delete(String(uid || 'anonymous'));
  }

  /* ============================================================
     CONTEXT UPDATE
  ============================================================ */

  updateContext(uid, intent, entities = [], metadata = {}) {
    const session = this.getOrCreateSession(uid);
    const safeEntities = Array.isArray(entities) ? entities : [];
    const ctx = session.activeContext;

    if (intent) session.lastIntent = intent;
    if (safeEntities.length > 0) session.lastEntities = safeEntities;

    // Extract and merge structured entities
    const teams = this.valuesByType(safeEntities, 'team');
    const players = this.valuesByType(safeEntities, 'player');
    const competitions = this.valuesByType(safeEntities, 'competition');
    const countries = this.valuesByType(safeEntities, 'country');
    const years = this.valuesByType(safeEntities, 'year');
    const seasons = this.valuesByType(safeEntities, 'season');

    if (teams.length) ctx.teams = this.mergeUnique(ctx.teams, teams);
    if (players.length) ctx.players = this.mergeUnique(ctx.players, players);
    if (competitions.length) ctx.competitions = this.mergeUnique(ctx.competitions, competitions);
    if (countries.length) ctx.countries = this.mergeUnique(ctx.countries, countries);
    
    // Single-value context properties (overwrite with latest)
    if (years.length) ctx.year = years[0];
    if (seasons.length) ctx.season = seasons[0];
    if (teams.length >= 2) ctx.match = { home: teams[0], away: teams[1] };

    // Metadata supplied by Orchestrator/DataResolver
    if (metadata.message) session.lastMessage = metadata.message;
    if (metadata.question) session.lastQuestion = metadata.question;
    else if (metadata.message) session.lastQuestion = metadata.message;
    
    if (metadata.result) session.lastResult = metadata.result;
    if (metadata.dataset) session.activeDataset = metadata.dataset;
    if (metadata.match) ctx.match = metadata.match;
    
    // ★ FIX: Track historical event context for multi-turn history queries
    if (metadata.historicalEvent) {
      ctx.historicalEvent = metadata.historicalEvent;
    } else if (intent && intent !== 'football_history' && intent !== 'match_result') {
      ctx.historicalEvent = null; // Clear if topic changes
    }

    // Determine primary conversational subject
    session.lastSubject = players[0] || teams[0] || competitions[0] || countries[0] || session.lastSubject || null;

    // Conversation history
    session.history.push({
      message: metadata.message || null,
      intent: intent || null,
      entities: safeEntities,
      timestamp: Date.now()
    });

    if (session.history.length > this.MAX_HISTORY) {
      session.history.shift();
    }

    session.updatedAt = Date.now();
    return session;
  }

  /* ============================================================
     ENTITY RESOLUTION
  ============================================================ */

  resolveEntities(uid, currentEntities = [], message = '') {
    const session = this.getContext(uid);
    const entities = Array.isArray(currentEntities) ? [...currentEntities] : [];
    const text = String(message || '').toLowerCase().trim();

    if (!text) return entities;

    // 1. Explicit entities always take priority
    if (entities.length > 0) {
      return this.resolveFollowUpEntities(session, entities, text);
    }

    // 2. Pronoun resolution
    if (this.containsPronoun(text)) {
      const resolved = this.resolvePronouns(session, text);
      if (resolved.length > 0) return resolved;
    }

    // 3. Context-only follow-up
    if (this.isContextualFollowUp(text)) {
      return this.getBestContextEntities(session);
    }

    return entities;
  }

  /* ============================================================
     FOLLOW-UP RESOLUTION
  ============================================================ */

  resolveFollowUpEntities(session, entities, text) {
    const hasWhatAbout = /\bwhat about\b|\bhow about\b/i.test(text);
    if (!hasWhatAbout) return entities;

    const currentTeams = this.valuesByType(entities, 'team');
    const ctx = session.activeContext;

    if (currentTeams.length === 1 && ctx.match?.home && ctx.match?.away) {
      const newTeam = currentTeams[0];
      const previousOtherTeam = [ctx.match.home, ctx.match.away].find(
        team => team.toLowerCase() !== newTeam.toLowerCase()
      );

      if (previousOtherTeam) {
        return [
          ...entities,
          {
            type: 'team',
            value: previousOtherTeam,
            raw: previousOtherTeam,
            confidence: 0.88,
            source: 'context'
          }
        ];
      }
    }
    return entities;
  }

  /* ============================================================
     PRONOUN RESOLUTION
  ============================================================ */

  containsPronoun(text) {
    return /\b(they|them|their|he|him|his|she|her|it|its|that team|that player|that club|the other one|the latter|the former)\b/i.test(text);
  }

  resolvePronouns(session, text) {
    const resolved = [];
    const ctx = session.activeContext;

    // Team pronouns
    if (/\b(they|them|their|that team|that club|it|its)\b/i.test(text)) {
      if (ctx.teams.length > 0) {
        resolved.push({
          type: 'team',
          value: ctx.teams[0],
          raw: 'context',
          confidence: 0.86,
          source: 'context'
        });
      }
    }

    // Player pronouns
    if (/\b(he|him|his|she|her|that player)\b/i.test(text)) {
      if (ctx.players.length > 0) {
        resolved.push({
          type: 'player',
          value: ctx.players[0],
          raw: 'context',
          confidence: 0.86,
          source: 'context'
        });
      }
    }

    // "the other one" / "the latter" / "the former"
    if (/\b(the other one|the latter|the former)\b/i.test(text) && ctx.match) {
      let value = null;
      if (/\bthe latter\b/i.test(text)) value = ctx.match.away;
      else if (/\bthe former\b/i.test(text)) value = ctx.match.home;
      else if (ctx.teams.length > 0) {
        value = ctx.match.home?.toLowerCase() === ctx.teams[0].toLowerCase() 
          ? ctx.match.away 
          : ctx.match.home;
      }

      if (value) {
        resolved.push({
          type: 'team',
          value,
          raw: 'context',
          confidence: 0.82,
          source: 'context'
        });
      }
    }

    return this.deduplicate(resolved);
  }

  /* ============================================================
     CONTEXTUAL FOLLOW-UP DETECTION
  ============================================================ */

  isContextualFollowUp(text) {
    return (
      /\bwhat about\b/i.test(text) ||
      /\bhow about\b/i.test(text) ||
      /\band them\b/i.test(text) ||
      /\band he\b/i.test(text) ||
      /\band she\b/i.test(text) ||
      /\bwhat about them\b/i.test(text) ||
      /\bwhat about him\b/i.test(text) ||
      /\bwhat about her\b/i.test(text) ||
      /\btheir form\b/i.test(text) ||
      /\btheir stats\b/i.test(text) ||
      /\btheir record\b/i.test(text) ||
      /\btheir results\b/i.test(text) ||
      /\bnext\b/i.test(text)
    );
  }

  /* ============================================================
     BEST CONTEXT
  ============================================================ */

  getBestContextEntities(session) {
    if (!session) return [];
    const ctx = session.activeContext;

    // Prefer active match
    if (ctx.match) {
      return [
        { type: 'team', value: ctx.match.home, raw: 'context', confidence: 0.80, source: 'context' },
        { type: 'team', value: ctx.match.away, raw: 'context', confidence: 0.80, source: 'context' }
      ];
    }

    // Then player
    if (ctx.players.length > 0) {
      return [{ type: 'player', value: ctx.players[0], raw: 'context', confidence: 0.80, source: 'context' }];
    }

    // Then team
    if (ctx.teams.length > 0) {
      return [{ type: 'team', value: ctx.teams[0], raw: 'context', confidence: 0.80, source: 'context' }];
    }

    // Finally previous entities
    return session.lastEntities || [];
  }

  /* ============================================================
     QUERY HELPERS
  ============================================================ */

  getLastIntent(uid) { return this.getContext(uid).lastIntent || null; }
  getLastSubject(uid) { return this.getContext(uid).lastSubject || null; }
  getActiveTeam(uid) { return this.getActiveContext(uid).teams?.[0] || null; }
  getActivePlayer(uid) { return this.getActiveContext(uid).players?.[0] || null; }
  getActiveMatch(uid) { return this.getActiveContext(uid).match || null; }
  getActiveCompetition(uid) { return this.getActiveContext(uid).competitions?.[0] || null; }
  getLastResult(uid) { return this.getContext(uid).lastResult || null; }

  /* ============================================================
     INTERNAL HELPERS
  ============================================================ */

  valuesByType(entities, type) {
    return entities
      .filter(entity => entity && entity.type === type)
      .map(entity => entity.value)
      .filter(value => value !== undefined && value !== null);
  }

  mergeUnique(existing = [], incoming = []) {
    const result = [...existing];
    for (const value of incoming) {
      if (value !== undefined && value !== null && !result.some(v => String(v).toLowerCase() === String(value).toLowerCase())) {
        result.push(value);
      }
    }
    return result;
  }

  deduplicate(entities) {
    const seen = new Set();
    const result = [];
    for (const entity of entities) {
      const key = `${entity.type}|${String(entity.value).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(entity);
    }
    return result;
  }

  /* ============================================================
     DEBUG / HEALTH
  ============================================================ */

  inspect(uid) {
    const context = this.getContext(uid);
    const ctx = context.activeContext || {};
    return {
      version: this.VERSION,
      activeTeam: ctx.teams?.[0] || null,
      activePlayer: ctx.players?.[0] || null,
      activeMatch: ctx.match || null,
      activeCompetition: ctx.competitions?.[0] || null,
      activeYear: ctx.year || null,
      activeDataset: context.activeDataset || null,
      lastIntent: context.lastIntent || null,
      lastSubject: context.lastSubject || null,
      lastMessage: context.lastMessage || null,
      historyLength: context.history?.length || 0,
      updatedAt: context.updatedAt || null
    };
  }

  stats() {
    return {
      version: this.VERSION,
      sessions: this.sessions.size,
      maxHistory: this.MAX_HISTORY
    };
  }
}

module.exports = new ContextEngine();