'use strict';

/**
 * ============================================================
 * KIM — PROFESSIONAL CONVERSATION ENGINE
 * ============================================================
 * Conversational intelligence layer for KIM.
 * ============================================================
 */

class ConversationEngine {
  constructor() {
    this.VERSION = '2.4.0'; // Version bumped for activeContext architecture

    /** @type {Map<string, Session>} */
    this.sessions = new Map();

    this.MAX_TURNS = 30;
    this.MAX_TOPICS = 10;
    this.MAX_SESSIONS = 5000;

    this.SESSION_TTL = 30 * 60 * 1000; // 30 minutes
    this.CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

    this._cleanupTimer = setInterval(
      () => this.purgeStaleSessions(),
      this.CLEANUP_INTERVAL
    );
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }

    this.PATTERNS = [
      { id: 'greeting',       test: /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|leo uko aje)\b/i, confidence: 0.98 },
      { id: 'goodbye',        test: /\b(bye|goodbye|see you|talk later|gotta go|i have to go|catch you|later)\b/, confidence: 0.98 },
      { id: 'thanks',         test: /\b(thanks|thank you|appreciate it|much appreciated|cheers)\b/, confidence: 0.97 },
      
      { id: 'casual',         test: /\b(how are you|how's it going|what's up|whats up|you good|how have you been|how are things|how are you doing|story za bure|uko aje|msee|bana)\b/i, confidence: 0.95 },
      
      { id: 'acknowledgement', test: /^(okay|ok|alright|sure|yes|yeah|yep|yup|exactly|true|right|nice|cool|great|got it|understood)\b/, confidence: 0.94 },
      { id: 'expand',         test: /\b(tell me more|more|go deeper|continue|explain more|what else|keep going|elaborate|expand|dive deeper)\b/, confidence: 0.96 },
      { id: 'why',            test: /^(why|but why|how come)\b/, confidence: 0.97 },
      { id: 'how',            test: /^(how|how does|how can|how would|how do)\b/, confidence: 0.95 },
      { id: 'confirmation',   test: /\b(is that right|are you sure|really|seriously|you sure|are you certain)\b/, confidence: 0.95 },
      { id: 'opinion',        test: /\b(what do you think|your opinion|do you think|who do you think|in your view)\b/, confidence: 0.92 },
      
      { id: 'challenge',      test: /\b(prove it|bet you can't|can you handle|test you|challenge you|are you really|stump you|cap|nah that's cap)\b/i, confidence: 0.90 },
      
      { id: 'casual',         test: /\b(insane goal|crazy match|watched a goal|good game|brooooo|what did i just watch|not good for my heart|90\+\d|minute winner|💀|🔥🔥)\b/i, confidence: 0.90 }
    ];

    this.INTENT_TOPIC_MAP = {
      match_analysis: 'match analysis',
      team_form: 'team form',
      team_comparison: 'team comparison',
      prediction: 'match prediction',
      standings: 'league standings',
      fixtures: 'fixtures',
      results: 'results',
      player_stats: 'player statistics',
      tournament: 'football tournaments',
      tactics: 'football tactics',
      rules: 'football rules'
    };

    this.TOPIC_KEYWORDS = [
      ['premier league', 'Premier League'],
      ['champions league', 'Champions League'],
      ['europa league', 'Europa League'],
      ['world cup', 'World Cup'],
      ['afcon', 'AFCON'],
      ['transfer', 'transfers'],
      ['offside', 'offside'],
      ['penalty', 'penalties'],
      ['var', 'VAR'],
      ['formation', 'formations'],
      ['tactics', 'tactics']
    ];

    this.MOOD_KEYWORDS = {
      positive: ['love', 'great', 'amazing', 'brilliant', 'beautiful', 'happy', 'excited'],
      negative: ['hate', 'terrible', 'awful', 'bad', 'rubbish', 'frustrated', 'angry'],
      curious:  ['curious', 'wonder', 'interesting', 'weird', 'strange']
    };
  }

  /* ============================================================
     SESSION MANAGEMENT
  ============================================================ */

  getSession(uid = 'anonymous') {
    if (!this.sessions.has(uid)) {
      if (this.sessions.size >= this.MAX_SESSIONS) {
        this.purgeStaleSessions(true);
      }
      this.sessions.set(uid, this._createSession());
    }

    const session = this.sessions.get(uid);
    session.lastActivity = Date.now();
    return session;
  }

  _createSession() {
    return {
      turns: [],
      topics: [],
      currentTopic: null,
      lastQuestion: null,
      lastAnswer: null,
      lastIntent: null,
      lastEntities: [],
      awaitingFollowUp: false,
      mood: 'neutral',
      startedAt: Date.now(),
      lastActivity: Date.now(),
      
      // ★ FIX: Unified activeContext instead of fragmented state
      activeContext: {
        teams: [],
        players: [],
        competition: null,
        season: null,
        match: null,
        intent: null,
        historicalEvent: null
      }
    };
  }

  reset(uid) {
    if (uid) this.sessions.delete(uid);
  }

  purgeStaleSessions(forceShrink = false) {
    const now = Date.now();
    let oldestUid = null;
    let oldestTime = Infinity;

    for (const [uid, session] of this.sessions) {
      const age = now - session.lastActivity;

      if (forceShrink && session.lastActivity < oldestTime) {
        oldestTime = session.lastActivity;
        oldestUid = uid;
      }

      if (age > this.SESSION_TTL) {
        this.sessions.delete(uid);
      }
    }

    if (forceShrink && this.sessions.size >= this.MAX_SESSIONS && oldestUid) {
      this.sessions.delete(oldestUid);
    }
  }

  /* ============================================================
     STATE MANAGEMENT (Active Context)
  ============================================================ */

  // ★ FIX: Maintain structured entities for entity inheritance
  updateActiveContext(uid, metadata) {
    const session = this.getSession(uid);
    const ctx = session.activeContext;
    
    if (metadata.intent) ctx.intent = metadata.intent;
    
    // Update historical context
    if (metadata.historicalEvent) {
      ctx.historicalEvent = metadata.historicalEvent;
    } else if (metadata.intent && metadata.intent !== 'football_history' && metadata.intent !== 'match_result') {
      ctx.historicalEvent = null; // Clear stale historical context if topic changes
    }

    // Update structured entities
    if (Array.isArray(metadata.entities) && metadata.entities.length > 0) {
      const teams = metadata.entities.filter(e => e.type === 'team').map(e => e.value);
      const players = metadata.entities.filter(e => e.type === 'player').map(e => e.value);
      const competition = metadata.entities.find(e => e.type === 'competition');
      const season = metadata.entities.find(e => e.type === 'season' || e.type === 'year');

      if (teams.length > 0) ctx.teams = teams;
      if (players.length > 0) ctx.players = players;
      if (competition) ctx.competition = competition.value;
      if (season) ctx.season = season.value;
    }
  }

  setActiveMatch(uid, match) {
    const session = this.getSession(uid);
    session.activeContext.match = match;
  }

  clearActiveMatch(uid) {
    const session = this.getSession(uid);
    session.activeContext.match = null;
  }

  /* ============================================================
     TURN RECORDING
  ============================================================ */

  recordTurn(uid, userMessage, assistantMessage, metadata = {}) {
    const session = this.getSession(uid);

    session.turns.push({
      user: String(userMessage ?? ''),
      assistant: String(assistantMessage ?? ''),
      intent: metadata.intent ?? null,
      entities: Array.isArray(metadata.entities) ? metadata.entities : [],
      topic: metadata.topic ?? null,
      timestamp: Date.now()
    });

    if (session.turns.length > this.MAX_TURNS) {
      session.turns = session.turns.slice(-this.MAX_TURNS);
    }

    session.lastQuestion = String(userMessage ?? '');
    session.lastAnswer = String(assistantMessage ?? '');

    if (metadata.intent) session.lastIntent = metadata.intent;
    if (Array.isArray(metadata.entities) && metadata.entities.length) {
      session.lastEntities = metadata.entities;
    }
    if (metadata.topic) this.setTopic(uid, metadata.topic);
    if (metadata.mood) session.mood = metadata.mood;
    
    // Update active context based on the turn
    this.updateActiveContext(uid, metadata);

    return session;
  }

  /* ============================================================
     TOPIC MANAGEMENT
  ============================================================ */

  setTopic(uid, topic) {
    if (!topic) return;

    const session = this.getSession(uid);
    const normalized = String(topic).trim().toLowerCase();
    if (!normalized) return;

    session.currentTopic = normalized;

    session.topics = session.topics.filter(item => item !== normalized);
    session.topics.unshift(normalized);

    if (session.topics.length > this.MAX_TOPICS) {
      session.topics = session.topics.slice(0, this.MAX_TOPICS);
    }
  }

  getCurrentTopic(uid) {
    return this.getSession(uid).currentTopic;
  }

  getTopics(uid) {
    return [...this.getSession(uid).topics];
  }

  hasTopicDrifted(uid, candidateTopic) {
    if (!candidateTopic) return false;
    const current = this.getCurrentTopic(uid);
    if (!current) return false;
    return current !== String(candidateTopic).trim().toLowerCase();
  }

  /* ============================================================
     CLASSIFICATION
  ============================================================ */

  classify(message = '') {
    const rawMsg = String(message || '').trim();

    if (!rawMsg) return { type: 'empty', confidence: 1 };

    const emojiOnly = rawMsg.length > 0 && !/[a-zA-Z0-9]/.test(rawMsg);
    if (emojiOnly) {
      return { type: 'casual', confidence: 0.95 };
    }

    const msg = this.normalize(rawMsg);
    if (!msg) return { type: 'empty', confidence: 1 };

    if (/^(bro+|bruh+|dude+|man+|hmm+|uh+|wow+|damn+|really\??|lol+|lmao+|okay+|ok+|alright+)\s*[😂🤣😭😅😆😊🙂🙃❤️🔥]*$/i.test(msg)) {
      return { type: 'casual', confidence: 0.90 };
    }

    for (const pattern of this.PATTERNS) {
      if (pattern.test.test(msg)) {
        return { type: pattern.id, confidence: pattern.confidence };
      }
    }

    return { type: 'unknown', confidence: 0.4 };
  }

  inferMood(message = '') {
    const msg = this.normalize(message);
    if (!msg) return 'neutral';

    for (const [mood, keywords] of Object.entries(this.MOOD_KEYWORDS)) {
      if (keywords.some(word => msg.includes(word))) return mood;
    }
    return 'neutral';
  }

  /* ============================================================
     RESPONSE ROUTER
  ============================================================ */

  respond(uid, message, context = {}) {
    const session = this.getSession(uid);
    const { type } = this.classify(message);

    if (/\b(heart|stress)\b/i.test(message)) {
      return `😂 Bro, football is terrible for the heart. One 90+7' winner and your blood pressure is doing extra time too. 😭⚽`;
    }

    // Yield "why", "how", and "expand" to the Knowledge/Data layers 
    // IF there is an active match or historical event context. 
    if (['why', 'how', 'expand'].includes(type)) {
      if (session.activeContext.match || session.activeContext.historicalEvent || session.lastIntent === 'football_history') {
        return null; 
      }
    }

    switch (type) {
      case 'greeting':       return this.greeting(session, context);
      case 'goodbye':        return this.goodbye(session);
      case 'thanks':         return this.thanks(session);
      case 'acknowledgement': return this.acknowledgement(session);
      case 'expand':         return this.expand(session);
      case 'why':            return this.followUp(session, 'why');
      case 'how':            return this.followUp(session, 'how');
      case 'confirmation':   return this.confirmation(session);
      case 'opinion':        return this.opinion(session);
      case 'challenge':      return this.challenge(session);
      case 'casual':         return this.casual(session, context);
      default:               return null;
    }
  }

  /* ============================================================
     RESPONSE BUILDERS
  ============================================================ */

  greeting(session, context = {}) {
    const name = context.name ? ` ${context.name}` : '';
    const topic = session.currentTopic;

    if (topic) {
      return (
        `Hey${name}. 👋 I'm here. ` +
        `We were talking about ${this._fmtTopic(topic)}. Want to continue? ⚽`
      );
    }

    return this.random([
      `Hey${name}. 👋 KIM is online. What are we investigating today? ⚽`,
      `Hello${name}. 😎 What football mystery are we solving?`,
      `Hey${name}. ⚽ Ready when you are.`,
      `Welcome back${name}. Let's talk football. 🧠⚽`
    ]);
  }

  goodbye(session) {
    if (session.currentTopic) {
      return (
        `Alright, I'll leave ${this._fmtTopic(session.currentTopic)} alone for now. 😂 ` +
        `Come back whenever you're ready. ⚽`
      );
    }
    return this.random([
      'Later. 👋⚽',
      'See you next time. Keep the football arguments alive. 😂⚽',
      'Catch you later. KIM will be here. 🧠⚽'
    ]);
  }

  thanks(session) {
    if (session.currentTopic) {
      return (
        `Anytime. 😎 If you want to go deeper into ${this._fmtTopic(session.currentTopic)}, just ask.`
      );
    }
    return this.random([
      'Anytime. 😎⚽',
      'Always. That is what I am here for. 🧠⚽',
      'You got it. 😂',
      'No problem. Keep the questions coming.'
    ]);
  }

  acknowledgement(session) {
    if (session.lastIntent === 'match_analysis' || session.currentTopic) {
      return `Exactly. 😎 There's usually another layer if you want to dig deeper.`;
    }
    return this.random([
      'Exactly. 😎',
      'Yep. We are on the same page.',
      'That’s the idea. ⚽',
      'Now you’re thinking like KIM. 😂'
    ]);
  }

  expand(session) {
    if (!session.lastAnswer) {
      session.awaitingFollowUp = true;
      return `Absolutely. Give me the question and we'll go deeper. ⚽`;
    }

    if (session.currentTopic) {
      session.awaitingFollowUp = true;
      return (
        `Absolutely. Let's go deeper into **${this._fmtTopic(session.currentTopic, true)}**. ` +
        `I can break down the numbers, context, strengths, weaknesses, and what they mean.`
      );
    }

    return (
      `Absolutely. Tell me which part you want to go deeper on, ` +
      `and I'll break it down.`
    );
  }

  followUp(session, type) {
    if (!session.lastAnswer) return null;

    if (type === 'why') {
      return (
        `Good question. The reason comes down to the evidence behind the previous answer. ` +
        `If you want, I can break down exactly which numbers or signals are driving it.`
      );
    }

    if (type === 'how') {
      return (
        `The short version: I combine the available signals rather than relying on a single number. ` +
        `I can walk you through the calculation step by step.`
      );
    }

    return null;
  }

  confirmation(session) {
    return (
      `I'm confident in what the available data supports, ` +
      `but football doesn't come with guarantees. ⚽ ` +
      `If the evidence is weak, I'd rather tell you that than pretend certainty.`
    );
  }

  opinion(session) {
    if (session.currentTopic) {
      return (
        `I can give you my football view on **${this._fmtTopic(session.currentTopic, true)}**, ` +
        `but I'll separate opinion from what the data actually proves.`
      );
    }
    return (
      `I can give you an opinion. 😎 ` +
      `Just remember: I'll separate what the numbers show from what is subjective.`
    );
  }

  challenge(session) {
    return this.random([
      `Bring it on. I'll show you the numbers. 😎`,
      `Oh, we're testing KIM now? 😂 I respect it. Ask the hard one.`,
      `Challenge accepted. But if the numbers embarrass you, don't blame me. 😂⚽`,
      `Alright. Put me under pressure. 🧠⚽`
    ]);
  }

  casual(session, context = {}) {
    const name = context.name ? ` ${context.name}` : '';
    return this.random([
      `I'm good${name}. Running on football data and questionable amounts of confidence. 😂⚽`,
      `Operational. 🧠⚽ Waiting for the next football question.`,
      `I'm doing what I do best — turning football data into arguments. 😂`,
      `All systems behaving. For now. 😏⚽`
    ]);
  }

  /* ============================================================
     CONTEXT & HISTORY
  ============================================================ */

  getConversationContext(uid) {
    const session = this.getSession(uid);
    return {
      currentTopic: session.currentTopic,
      topics: [...session.topics],
      lastQuestion: session.lastQuestion,
      lastAnswer: session.lastAnswer,
      lastIntent: session.lastIntent,
      lastEntities: [...session.lastEntities],
      mood: session.mood,
      turnCount: session.turns.length,
      idleMs: Date.now() - session.lastActivity,
      activeMatch: session.activeContext.match ? {...session.activeContext.match} : null,
      // ★ FIX: Deep copy activeContext so callers don't mutate session state
      activeContext: session.activeContext ? JSON.parse(JSON.stringify(session.activeContext)) : null
    };
  }

  getRecentTurns(uid, count = 10) {
    const session = this.getSession(uid);
    return session.turns.slice(-count).map(turn => ({
      user: turn.user,
      assistant: turn.assistant,
      intent: turn.intent,
      entities: turn.entities,
      topic: turn.topic,
      timestamp: turn.timestamp
    }));
  }

  /* ============================================================
     FOLLOW-UP DETECTION
  ============================================================ */

  isFollowUp(uid, message) {
    const session = this.getSession(uid);
    if (!session.lastQuestion) return false;

    const msg = this.normalize(message);
    if (!msg) return false;

    const wordCount = msg.split(' ').filter(Boolean).length;
    if (wordCount === 0) return false;

    if (wordCount <= 3) return true;

    if (/\b(what about|how about|what if|who about|and then|and also)\b/.test(msg)) {
      return true;
    }

    if (wordCount <= 5 && /^(and|also|then|why|how|so|but)\b/.test(msg)) {
      return true;
    }

    if (/\b(they|them|their|he|his|she|her|it|that|those|these)\b/.test(msg)) {
      return true;
    }

    return false;
  }

  /* ============================================================
     TOPIC INFERENCE
  ============================================================ */

  // ★ FIX: Safely extract meaningful value from entity object
  inferTopic(intent, entities = [], message = '') {
    if (Array.isArray(entities) && entities.length) {
      const entity = entities[0];
      if (typeof entity === 'string') return entity;
      if (entity?.value) return entity.value;
      if (entity?.name) return entity.name;
    }

    if (intent && this.INTENT_TOPIC_MAP[intent]) {
      return this.INTENT_TOPIC_MAP[intent];
    }

    const msg = this.normalize(message);
    for (const [needle, label] of this.TOPIC_KEYWORDS) {
      if (msg.includes(needle)) return label;
    }

    return null;
  }

  /* ============================================================
     PROCESS TURN (high-level entry)
  ============================================================ */

  processTurn(uid, message, metadata = {}) {
    const session = this.getSession(uid);
    const msg = this.normalize(message);

    const inferredTopic =
      metadata.topic ||
      this.inferTopic(metadata.intent, metadata.entities, message);

    if (inferredTopic) {
      this.setTopic(uid, inferredTopic);
    }

    const mood = metadata.mood || this.inferMood(message);
    session.mood = mood;

    const classification = this.classify(message);

    if (classification.type === 'expand' || classification.type === 'why' || classification.type === 'how') {
      session.awaitingFollowUp = true;
    } else if (session.awaitingFollowUp && classification.type !== 'unknown') {
      session.awaitingFollowUp = false;
    }

    const context = this.getConversationContext(uid);

    return {
      conversationalType: classification.type,
      confidence: classification.confidence,
      isFollowUp: this.isFollowUp(uid, message),
      topic: inferredTopic || session.currentTopic,
      mood,
      context
    };
  }

  /* ============================================================
     STATS & UTILITIES
  ============================================================ */

  stats() {
    return {
      version: this.VERSION,
      activeSessions: this.sessions.size,
      maxSessions: this.MAX_SESSIONS,
      sessionTtlMs: this.SESSION_TTL
    };
  }

  normalize(text) {
    return String(text ?? '')
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  random(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return items[Math.floor(Math.random() * items.length)];
  }

  _fmtTopic(topic, bold = false) {
    const label = String(topic ?? '').trim();
    if (!label) return '';
    const safe = label.replace(/[*`_]/g, '');
    return bold ? `**${safe}**` : safe;
  }

  shutdown() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }
}

module.exports = new ConversationEngine();