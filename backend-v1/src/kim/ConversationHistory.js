'use strict';

/**
 * ============================================================
 * KIM — CONVERSATION HISTORY ENGINE
 * ============================================================
 * Responsible for short-term conversational history.
 * Tracks raw message turns for LLM context and debugging.
 * ============================================================
 */

class ConversationHistory {
  constructor() {
    this.VERSION = '2.0.0';
    this.sessions = new Map();
    this.maxMessages = 20;
    this.sessionTTL = 6 * 60 * 60 * 1000; // 6 hours

    // ★ FIX: Automatic cleanup interval for expired sessions
    this._cleanupTimer = setInterval(() => this.cleanupExpired(), 60 * 60 * 1000);
    if (this._cleanupTimer.unref) this._cleanupTimer.unref();
  }

  /* ==========================================================
     SESSION MANAGEMENT
  ========================================================== */

  normalizeUid(uid) {
    return String(uid || 'anonymous').trim() || 'anonymous';
  }

  ensureSession(uid) {
    const userId = this.normalizeUid(uid);
    let session = this.sessions.get(userId);

    if (!session) {
      session = {
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.sessions.set(userId, session);
    }

    session.updatedAt = Date.now();
    return session;
  }

  /* ==========================================================
     ADD MESSAGES
  ========================================================== */

  addMessage(uid, message) {
    if (!message) return null;

    const session = this.ensureSession(uid);
    const normalized = this.normalizeMessage(message);

    if (!normalized) return null;

    session.messages.push(normalized);

    // Keep only the newest messages
    if (session.messages.length > this.maxMessages) {
      session.messages = session.messages.slice(-this.maxMessages);
    }

    session.updatedAt = Date.now();
    return normalized;
  }

  addTurn(uid, userMessage, assistantMessage, metadata = {}) {
    if (userMessage) {
      this.addMessage(uid, { role: 'user', content: userMessage });
    }
    if (assistantMessage) {
      this.addMessage(uid, { role: 'assistant', content: assistantMessage, ...metadata });
    }
    return this.getHistory(uid);
  }

  normalizeMessage(message) {
    if (typeof message === 'string') {
      const content = message.trim();
      if (!content) return null;
      return { role: 'user', content, timestamp: Date.now() };
    }

    if (typeof message !== 'object') return null;

    const role = message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user';
    const content = String(message.content || '').trim();

    if (!content) return null;

    return {
      role,
      content,
      timestamp: Number.isFinite(Number(message.timestamp)) ? Number(message.timestamp) : Date.now()
    };
  }

  /* ==========================================================
     RETRIEVAL
  ========================================================== */

  getHistory(uid, limit = this.maxMessages) {
    const session = this.sessions.get(this.normalizeUid(uid));
    if (!session) return [];

    const safeLimit = Math.max(1, Math.min(Number(limit) || this.maxMessages, this.maxMessages));

    return session.messages.slice(-safeLimit).map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  getMessages(uid, limit = this.maxMessages) {
    const session = this.sessions.get(this.normalizeUid(uid));
    if (!session) return [];

    const safeLimit = Math.max(1, Math.min(Number(limit) || this.maxMessages, this.maxMessages));
    return session.messages.slice(-safeLimit).map(msg => ({ ...msg }));
  }

  getLastMessage(uid, role = null) {
    const messages = this.getMessages(uid);
    if (!messages.length) return null;

    if (!role) return messages[messages.length - 1];

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === role) return messages[i];
    }
    return null;
  }

  getLastUserMessage(uid) { return this.getLastMessage(uid, 'user'); }
  getLastAssistantMessage(uid) { return this.getLastMessage(uid, 'assistant'); }

  /* ==========================================================
     UTILITIES
  ========================================================== */

  size(uid) {
    const session = this.sessions.get(this.normalizeUid(uid));
    return session ? session.messages.length : 0;
  }

  clear(uid) {
    return this.sessions.delete(this.normalizeUid(uid));
  }

  clearAll() {
    this.sessions.clear();
  }

  export(uid) {
    const session = this.sessions.get(this.normalizeUid(uid));
    if (!session) return null;

    return {
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages.map(msg => ({ ...msg }))
    };
  }

  import(uid, data) {
    if (!data || !Array.isArray(data.messages)) return false;

    const userId = this.normalizeUid(uid);
    const messages = data.messages
      .map(msg => this.normalizeMessage(msg))
      .filter(Boolean)
      .slice(-this.maxMessages);

    this.sessions.set(userId, {
      messages,
      createdAt: Number.isFinite(Number(data.createdAt)) ? Number(data.createdAt) : Date.now(),
      updatedAt: Date.now()
    });

    return true;
  }

  buildModelHistory(uid, limit = this.maxMessages) {
    return this.getHistory(uid, limit);
  }

  search(uid, query, limit = 5) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];

    const messages = this.getMessages(uid);
    return messages.filter(msg => msg.content.toLowerCase().includes(q)).slice(-limit);
  }

  getRecentText(uid, limit = this.maxMessages) {
    return this.getMessages(uid, limit)
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
  }

  /* ==========================================================
     MAINTENANCE
  ========================================================== */

  cleanupExpired() {
    const now = Date.now();
    let removed = 0;

    for (const [uid, session] of this.sessions) {
      if (now - session.updatedAt > this.sessionTTL) {
        this.sessions.delete(uid);
        removed++;
      }
    }
    return removed;
  }

  getStats() {
    let totalMessages = 0;
    for (const session of this.sessions.values()) {
      totalMessages += session.messages.length;
    }

    return {
      version: this.VERSION,
      sessions: this.sessions.size,
      messages: totalMessages,
      maxMessages: this.maxMessages,
      sessionTTL: this.sessionTTL
    };
  }
}

module.exports = new ConversationHistory();