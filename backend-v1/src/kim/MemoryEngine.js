'use strict';

/**
 * ============================================================
 * KIM — PROFESSIONAL MEMORY ENGINE
 * ============================================================
 * Responsibilities:
 *   - Persistent user memory (Long-term facts, preferences)
 *   - Football profile tracking
 *   - Recent conversation context (Short-term state)
 *   - Explicit remember / forget commands
 *   - Automatic fact extraction from natural language
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'user_memory.json');

const MAX_RECENT_MESSAGES = 30;
const MAX_TOPICS = 30;
const MAX_FACTS = 100;
const MAX_PREFERENCES = 50;

class MemoryEngine {
  constructor() {
    this.VERSION = '2.1.0';
    this.memory = this.loadMemory();
    this.writeTimer = null;
    this.ensureDataDirectory();

    // Pre-compiled extraction regexes
        // In MemoryEngine constructor:
    this._namePatterns = [
      /\bmy name is ([a-z][a-z'-]{1,30})\b/i,
      /\bcall me ([a-z][a-z'-]{1,30})\b/i,
      /\byou can call me ([a-z][a-z'-]{1,30})\b/i,
      // ★ FIX: Added "i am" because QueryNormalizer expands "I'm" before MemoryEngine sees it
      /\bi am (?!(?:an?|the|from|just|so|very|not|going|getting|feeling|doing|sure|fine|good|okay|bored|tired|hungry|excited|angry|sad|happy|back|here|ready)\b)([a-z][a-z'-]{1,30})\b/i,
      // Keep "i'm" as a fallback in case raw text is passed directly
      /\bi'm (?!(?:an?|the|from|just|so|very|not|going|getting|feeling|doing|sure|fine|good|okay|bored|tired|hungry|excited|angry|sad|happy|back|here|ready)\b)([a-z][a-z'-]{1,30})\b/i
    ];


    // ★ FIX: Strict boundary matching with trailing conversational filler catcher
    this._teamPatterns = [
      /\bi support ([a-z][a-z\s&.'-]+?)\s*(?:bro|man|now|currently|\.|,|$)/i,
      /\bmy team is ([a-z][a-z\s&.'-]+?)\s*(?:bro|man|now|currently|\.|,|$)/i,
      /\bi am a ([a-z][a-z\s&.'-]+?) fan\b/i,
      /\bi'm a ([a-z][a-z\s&.'-]+?) fan\b/i,
      /\bi support the ([a-z][a-z\s&.'-]+?)\s*(?:bro|man|now|currently|\.|,|$)/i
    ];

    // ★ FIX: Removed "I love" to prevent saving teams/objects as players
    this._playerPatterns = [
      /\bmy favorite player is ([a-z][a-z .'-]{2,50})\b/i,
      /\bmy favourite player is ([a-z][a-z .'-]{2,50})\b/i,
      /\bmy favorite footballer is ([a-z][a-z .'-]{2,50})\b/i
    ];

    this._leaguePatterns = [
      /\bmy favorite league is ([a-z0-9 '&.-]{2,50})\b/i,
      /\bmy favourite league is ([a-z0-9 '&.-]{2,50})\b/i
    ];

    this._preferencePatterns = [
      /\bi prefer ([^.!?]+)/i,
      /\bi like ([^.!?]+)/i,
      /\bi don't like ([^.!?]+)/i,
      /\bi hate ([^.!?]+)/i
    ];

    this._nameBlacklist = ['bored', 'tired', 'hungry', 'excited', 'angry', 'sad', 'happy', 'back', 'fine', 'good', 'okay', 'here', 'ready'];
  }

  /* ============================================================
     STORAGE
  ============================================================ */

  ensureDataDirectory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (error) {
      console.error('[MemoryEngine] Failed creating data directory:', error.message);
    }
  }

  loadMemory() {
    try {
      if (!fs.existsSync(MEMORY_FILE)) return {};
      const raw = fs.readFileSync(MEMORY_FILE, 'utf8').trim();
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      
      return parsed;
    } catch (error) {
      console.error('[MemoryEngine] Failed loading memory:', error.message);
      return {};
    }
  }

  scheduleSave() {
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.saveMemory(), 250);
  }

  saveMemory() {
    this.ensureDataDirectory();
    const tempFile = `${MEMORY_FILE}.tmp`;

    try {
      fs.writeFileSync(tempFile, JSON.stringify(this.memory, null, 2), 'utf8');
      fs.renameSync(tempFile, MEMORY_FILE); // Atomic replacement
    } catch (error) {
      console.error('[MemoryEngine] Failed saving memory:', error.message);
    }
  }

  /* ============================================================
     USER MEMORY STRUCTURE
  ============================================================ */

  createUserMemory(uid) {
    return {
      version: 2,
      user_id: uid,
      profile: { name: null, display_name: null },
      football: {
        favorite_team: null,
        favorite_players: [],
        favorite_leagues: [],
        favorite_national_team: null
      },
      preferences: [],
      facts: [],
      topics: [],
      recent_messages: [],
      conversation: {
        current_topic: null,
        current_entity: null,
        previous_entity: null,
        last_intent: null,
        last_user_message: null,
        last_kim_message: null
      },
      statistics: {
        messages: 0,
        first_seen: Date.now(),
        last_seen: Date.now()
      }
    };
  }

  getMemory(uid) {
    if (!uid) uid = 'anonymous';

    if (!this.memory[uid]) {
      this.memory[uid] = this.createUserMemory(uid);
      this.scheduleSave();
    }

    this.migrateUserMemory(this.memory[uid]);
    return this.memory[uid];
  }

  migrateUserMemory(userMem) {
    if (!userMem.profile) {
      userMem.profile = { name: userMem.name || null, display_name: null };
    }
    if (!userMem.football) {
      userMem.football = {
        favorite_team: userMem.favorite_team || null,
        favorite_players: [],
        favorite_leagues: [],
        favorite_national_team: null
      };
    }
    if (!Array.isArray(userMem.preferences)) userMem.preferences = [];
    if (!Array.isArray(userMem.facts)) userMem.facts = [];
    if (!Array.isArray(userMem.topics)) userMem.topics = [];
    if (!Array.isArray(userMem.recent_messages)) userMem.recent_messages = [];
    if (!userMem.conversation) {
      userMem.conversation = {
        current_topic: null, current_entity: null, previous_entity: null,
        last_intent: null, last_user_message: null, last_kim_message: null
      };
    }
    if (!userMem.statistics) {
      userMem.statistics = { messages: 0, first_seen: Date.now(), last_seen: Date.now() };
    }

    if (!userMem.profile.name && userMem.name) userMem.profile.name = userMem.name;
    if (!userMem.football.favorite_team && userMem.favorite_team) {
      userMem.football.favorite_team = userMem.favorite_team;
    }
  }

  /* ============================================================
     CONVERSATION & MESSAGE TRACKING
  ============================================================ */

   rememberMessage(uid, role, content, metadata = {}) {
    const userMem = this.getMemory(uid);
    if (!content) return userMem;

    userMem.recent_messages.push({
      role,
      content: String(content),
      timestamp: Date.now(),
      intent: metadata.intent || null,
      entity: metadata.entity || null,
      topic: metadata.topic || null
    });

    if (userMem.recent_messages.length > MAX_RECENT_MESSAGES) {
      userMem.recent_messages = userMem.recent_messages.slice(-MAX_RECENT_MESSAGES);
    }

    // ★ FIX: Only increment message counter for user messages
    if (role === 'user') {
      userMem.statistics.messages++;
    }
    
    userMem.statistics.last_seen = Date.now();
    this.scheduleSave();
    return userMem;
  }

  
  updateConversation(uid, data = {}) {
    const conversation = this.getMemory(uid).conversation;

    if (data.current_topic !== undefined) conversation.current_topic = data.current_topic;
    
    if (data.current_entity !== undefined) {
      conversation.previous_entity = conversation.current_entity;
      conversation.current_entity = data.current_entity;
    }
    
    if (data.last_intent !== undefined) conversation.last_intent = data.last_intent;
    if (data.last_user_message !== undefined) conversation.last_user_message = data.last_user_message;
    if (data.last_kim_message !== undefined) conversation.last_kim_message = data.last_kim_message;

    this.scheduleSave();
    return conversation;
  }

  getConversation(uid) {
    return this.getMemory(uid).conversation;
  }

  /* ============================================================
     FACTS & PREFERENCES
  ============================================================ */

  addFact(uid, key, value, options = {}) {
    const userMem = this.getMemory(uid);
    if (!key || value === null || value === undefined) return null;

    const normalizedKey = this.normalizeKey(key);
    const existing = userMem.facts.find(fact => fact.key === normalizedKey);

    const fact = {
      key: normalizedKey,
      value,
      confidence: options.confidence ?? 0.90,
      source: options.source || 'conversation',
      explicit: options.explicit ?? false,
      updated_at: Date.now()
    };

    if (existing) {
      Object.assign(existing, fact);
    } else {
      userMem.facts.push(fact);
    }

    this.trimArray(userMem.facts, MAX_FACTS);
    this.scheduleSave();
    return fact;
  }

  getFact(uid, key) {
    const normalized = this.normalizeKey(key);
    return this.getMemory(uid).facts.find(fact => fact.key === normalized) || null;
  }

  getFacts(uid) {
    return [...this.getMemory(uid).facts];
  }

  removeFact(uid, key) {
    const userMem = this.getMemory(uid);
    const normalized = this.normalizeKey(key);
    const before = userMem.facts.length;

    userMem.facts = userMem.facts.filter(fact => fact.key !== normalized);
    const changed = before !== userMem.facts.length;

    if (changed) this.scheduleSave();
    return changed;
  }

  addPreference(uid, preference, options = {}) {
    const userMem = this.getMemory(uid);
    if (!preference) return null;

    const normalized = this.normalizeText(preference);
    const existing = userMem.preferences.find(item => item.value === normalized);

    if (existing) {
      existing.updated_at = Date.now();
      this.scheduleSave();
      return existing;
    }

    const item = {
      value: normalized,
      confidence: options.confidence ?? 0.85,
      source: options.source || 'conversation',
      explicit: options.explicit ?? false,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    userMem.preferences.push(item);
    this.trimArray(userMem.preferences, MAX_PREFERENCES);
    this.scheduleSave();
    return item;
  }

  getPreferences(uid) {
    return [...this.getMemory(uid).preferences];
  }

  /* ============================================================
     FOOTBALL PROFILE
  ============================================================ */

  setFavoriteTeam(uid, team, options = {}) {
    if (!team) return null;
    const value = this.cleanEntity(team);
    const userMem = this.getMemory(uid);
    
    userMem.football.favorite_team = value;
    this.addFact(uid, 'favorite_team', value, {
      confidence: options.confidence ?? 0.95,
      source: options.source || 'conversation',
      explicit: options.explicit ?? true
    });

    this.scheduleSave();
    return value;
  }

  getFavoriteTeam(uid) {
    return this.getMemory(uid).football.favorite_team;
  }

  addFavoritePlayer(uid, player, options = {}) {
    if (!player) return null;
    const value = this.cleanEntity(player);
    const userMem = this.getMemory(uid);

    if (!userMem.football.favorite_players.some(item => this.normalizeText(item) === this.normalizeText(value))) {
      userMem.football.favorite_players.push(value);
    }

    this.trimArray(userMem.football.favorite_players, MAX_PREFERENCES);
    this.scheduleSave();
    return value;
  }

  addFavoriteLeague(uid, league, options = {}) {
    if (!league) return null;
    const value = this.cleanEntity(league);
    const userMem = this.getMemory(uid);

    if (!userMem.football.favorite_leagues.some(item => this.normalizeText(item) === this.normalizeText(value))) {
      userMem.football.favorite_leagues.push(value);
    }

    this.trimArray(userMem.football.favorite_leagues, MAX_PREFERENCES);
    this.scheduleSave();
    return value;
  }

  /* ============================================================
     USER NAME
  ============================================================ */

  setName(uid, name, options = {}) {
    if (!name) return null;
    const cleaned = this.cleanName(name);
    if (!cleaned) return null;

    const userMem = this.getMemory(uid);
    userMem.profile.name = cleaned;
    userMem.profile.display_name = cleaned;
    userMem.name = cleaned;

    this.addFact(uid, 'name', cleaned, {
      confidence: options.confidence ?? 0.98,
      source: options.source || 'conversation',
      explicit: options.explicit ?? true
    });

    this.scheduleSave();
    return cleaned;
  }

  getName(uid) {
    return this.getMemory(uid).profile.name;
  }

  /* ============================================================
     AUTOMATIC FACT EXTRACTION
  ============================================================ */

  extractAndSave(uid, message) {
    if (!message || typeof message !== 'string') return this.getMemory(uid);
    
    const msg = this.normalizeText(message);
    const userMem = this.getMemory(uid);

    // 1. Name
    for (const pattern of this._namePatterns) {
      const match = msg.match(pattern);
      if (match?.[1]) {
        const name = match[1].toLowerCase();
        if (!this._nameBlacklist.includes(name)) {
          this.setName(uid, match[1], { explicit: true, confidence: 0.96 });
          break;
        }
      }
    }

    // 2. Favorite Team
    for (const pattern of this._teamPatterns) {
      const match = msg.match(pattern);
      if (match?.[1]) {
        const team = this.cleanEntity(match[1]);
        if (team && !this.looksLikeGenericPhrase(team)) {
          this.setFavoriteTeam(uid, team, { explicit: true, confidence: 0.94 });
          break;
        }
      }
    }

    // 3. Favorite Player
    for (const pattern of this._playerPatterns) {
      const match = msg.match(pattern);
      if (match?.[1]) {
        this.addFavoritePlayer(uid, this.cleanEntity(match[1]), { explicit: true, confidence: 0.88 });
        break;
      }
    }

    // 4. Favorite League
    for (const pattern of this._leaguePatterns) {
      const match = msg.match(pattern);
      if (match?.[1]) {
        this.addFavoriteLeague(uid, this.cleanEntity(match[1]), { explicit: true, confidence: 0.92 });
        break;
      }
    }

    // 5. Preferences
    for (const pattern of this._preferencePatterns) {
      const match = msg.match(pattern);
      if (match?.[1]) {
        this.addPreference(uid, match[0].trim(), { explicit: true, confidence: 0.82 });
        break;
      }
    }

    return userMem;
  }

  /* ============================================================
     EXPLICIT MEMORY COMMANDS
  ============================================================ */

  remember(uid, key, value) {
    if (!key || value === undefined) return false;
    this.addFact(uid, key, value, {
      explicit: true,
      confidence: 1.0,
      source: 'explicit_memory_request'
    });
    return true;
  }

  forget(uid, key) {
    if (!uid || !key) return false;
    const normalized = this.normalizeKey(key);
    const removedFact = this.removeFact(uid, normalized);
    const userMem = this.getMemory(uid);
    let changed = removedFact;

    if (normalized === 'name' && userMem.profile.name) {
      userMem.profile.name = null;
      userMem.profile.display_name = null;
      userMem.name = null;
      changed = true;
    }

    if (normalized === 'favorite_team' && userMem.football.favorite_team) {
      userMem.football.favorite_team = null;
      userMem.favorite_team = null;
      changed = true;
    }

    if (changed) this.scheduleSave();
    
    // ★ FIX: Return the freshly updated memory object to prevent stale returns
    return this.getMemory(uid);
  }

  forgetEverything(uid) {
    if (!uid) return false;
    
    // ★ FIX: Properly delete the memory and return a fresh object
    delete this.memory[uid];
    this.scheduleSave();
    return this.getMemory(uid);
  }

  /* ============================================================
     TOPICS & CONTEXT
  ============================================================ */

  rememberTopic(uid, topic) {
    if (!topic) return;
    const userMem = this.getMemory(uid);
    const normalized = this.normalizeText(topic);

    userMem.topics = userMem.topics.filter(item => item.value !== normalized);
    userMem.topics.push({ value: normalized, timestamp: Date.now() });

    this.trimArray(userMem.topics, MAX_TOPICS);
    this.scheduleSave();
  }

  getRecentTopics(uid) {
    return [...this.getMemory(uid).topics].reverse();
  }

  getRecentMessages(uid, limit = 10) {
    const messages = this.getMemory(uid).recent_messages;
    return messages.slice(-Math.max(1, Math.min(limit, MAX_RECENT_MESSAGES)));
  }

  getContext(uid) {
    const userMem = this.getMemory(uid);
    return {
      profile: { name: userMem.profile.name, display_name: userMem.profile.display_name },
      football: {
        favorite_team: userMem.football.favorite_team,
        favorite_players: [...userMem.football.favorite_players],
        favorite_leagues: [...userMem.football.favorite_leagues],
        favorite_national_team: userMem.football.favorite_national_team
      },
      preferences: [...userMem.preferences],
      facts: [...userMem.facts],
      topics: this.getRecentTopics(uid).slice(0, 10),
      recent_messages: this.getRecentMessages(uid, 10),
      conversation: { ...userMem.conversation }
    };
  }

  getMemorySummary(uid) {
    const mem = this.getMemory(uid);
    return {
      name: mem.profile.name,
      favoriteTeam: mem.football.favorite_team,
      favoritePlayers: [...mem.football.favorite_players],
      favoriteLeagues: [...mem.football.favorite_leagues],
      preferences: [...mem.preferences],
      facts: [...mem.facts],
      currentTopic: mem.conversation.current_topic,
      currentEntity: mem.conversation.current_entity,
      previousEntity: mem.conversation.previous_entity,
      lastIntent: mem.conversation.last_intent,
      messageCount: mem.statistics.messages,
      firstSeen: mem.statistics.first_seen,
      lastSeen: mem.statistics.last_seen
    };
  }

  search(uid, query) {
    const mem = this.getMemory(uid);
    const q = this.normalizeText(query);
    const results = [];

    for (const fact of mem.facts) {
      if (this.normalizeText(`${fact.key} ${fact.value}`).includes(q)) {
        results.push({ type: 'fact', ...fact });
      }
    }

    for (const preference of mem.preferences) {
      if (preference.value.includes(q)) results.push({ type: 'preference', ...preference });
    }

    for (const topic of mem.topics) {
      if (topic.value.includes(q)) results.push({ type: 'topic', ...topic });
    }

    return results;
  }

  /* ============================================================
     UTILITIES
  ============================================================ */

  normalizeText(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  normalizeKey(key) {
    return this.normalizeText(key).replace(/\s+/g, '_');
  }

  cleanName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').split(' ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  // ★ FIX: Added deep cleanup for conversational filler and emojis
  cleanEntity(value) {
    if (!value) return '';
    
    // Remove emojis and non-alphanumeric chars (except spaces, letters, numbers)
    let cleaned = String(value).toLowerCase().replace(/[^\p{L}\p{N}\s&.'-]/gu, ' ').trim();
    
    // Remove common conversational filler words at the end
    const fillerWords = ['bro', 'man', 'though', 'anyway', 'now', 'currently', 'actually', 'mate'];
    const words = cleaned.split(/\s+/);
    
    while (words.length > 1 && fillerWords.includes(words[words.length - 1])) {
      words.pop();
    }
    
    // Capitalize properly
    return words.join(' ').replace(/\s+/g, ' ').trim();
  }

  looksLikeGenericPhrase(value) {
    const generic = ['football', 'soccer', 'good', 'best', 'big', 'great', 'real'];
    return generic.includes(this.normalizeText(value));
  }

  trimArray(array, max) {
    if (Array.isArray(array) && array.length > max) {
      array.splice(0, array.length - max);
    }
  }

  getStats() {
    const users = Object.keys(this.memory);
    let facts = 0;
    let messages = 0;

    for (const uid of users) {
      const mem = this.memory[uid];
      facts += mem.facts?.length || 0;
      messages += mem.statistics?.messages || 0;
    }

    return {
      users: users.length,
      facts,
      messages,
      memoryFile: MEMORY_FILE,
      maxRecentMessages: MAX_RECENT_MESSAGES,
      maxFacts: MAX_FACTS,
      maxPreferences: MAX_PREFERENCES
    };
  }

  health() {
    return {
      healthy: true,
      memoryFile: MEMORY_FILE,
      users: Object.keys(this.memory).length,
      stats: this.getStats()
    };
  }

  reload() {
    this.memory = this.loadMemory();
    return this.getStats();
  }

  flush() {
    clearTimeout(this.writeTimer);
    this.saveMemory();
  }
}

module.exports = new MemoryEngine();