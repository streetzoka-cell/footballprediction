'use strict';

/**
 * ============================================================
 * KIM — MASTER QUESTION / ANSWER STORE
 * ============================================================
 * Local-first conversational knowledge store.
 * v2.2.0 - Added short-query false positive protection.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const QueryNormalizer = require('./QueryNormalizer');

const QA_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'qa');

class QuestionAnswerStore {
  constructor() {
    this.VERSION = '2.2.0';
    this.entries = [];
    this.byId = new Map();
    this.byIntent = new Map();
    this.byTag = new Map();
    this.questionIndex = new Map();

    this.stats = { files: 0, entries: 0, questions: 0, intents: 0, tags: 0 };
    this.load();
  }

  /* ============================================================
     LOAD & INDEX
  ============================================================ */

  load() {
    this.entries = [];
    this.byId.clear();
    this.byIntent.clear();
    this.byTag.clear();
    this.questionIndex.clear();

    if (!fs.existsSync(QA_DIR)) {
      logger.info(`[QuestionAnswerStore] Directory not found: ${QA_DIR}`);
      return;
    }

    this._readRecursive(QA_DIR);

    this.stats.entries = this.entries.length;
    this.stats.intents = this.byIntent.size;
    this.stats.tags = this.byTag.size;

    logger.info(`[QuestionAnswerStore] Loaded ${this.entries.length} knowledge entries.`);
  }

  _readRecursive(dir) {
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (error) {
      logger.error(`[QuestionAnswerStore] Failed reading ${dir}: ${error.message}`);
      return;
    }

    for (const file of files) {
      const fullPath = path.join(dir, file);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }

      if (stat.isDirectory()) {
        this._readRecursive(fullPath);
      } else if (file.toLowerCase().endsWith('.json')) {
        this._loadFile(fullPath);
      }
    }
  }

  _loadFile(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8').trim();
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
      if (!content) return;

      const data = JSON.parse(content);
      this.stats.files++;

      if (Array.isArray(data)) {
        data.forEach(entry => this.register(entry, filePath));
      } else if (Array.isArray(data.entries)) {
        data.entries.forEach(entry => this.register(entry, filePath));
      } else {
        this.register(data, filePath);
      }
    } catch (error) {
      logger.error(`[QuestionAnswerStore] Failed loading ${filePath}: ${error.message}`);
    }
  }

  register(rawEntry, sourceFile = null) {
    if (!rawEntry || typeof rawEntry !== 'object') return null;

    const entry = this._normalizeEntry(rawEntry, sourceFile);
    if (!entry.id || this.byId.has(entry.id)) return this.byId.get(entry.id);

    this.entries.push(entry);
    this.byId.set(entry.id, entry);

    if (entry.intent) {
      if (!this.byIntent.has(entry.intent)) this.byIntent.set(entry.intent, []);
      this.byIntent.get(entry.intent).push(entry);
    }

    for (const tag of entry.tags) {
      if (!this.byTag.has(tag)) this.byTag.set(tag, []);
      this.byTag.get(tag).push(entry);
    }

    for (const variant of entry.questionVariants) {
      if (variant.normalized && !this.questionIndex.has(variant.normalized)) {
        this.questionIndex.set(variant.normalized, entry);
        this.stats.questions++;
      }
    }

    return entry;
  }

  _normalizeEntry(raw, sourceFile) {
    const id = raw.id || raw.key || raw.slug || null;
    const rawQuestions = this._toArray(raw.questions || raw.variants || raw.patterns || raw.question);
    const rawAliases = this._toArray(raw.aliases || raw.keywords);
    const rawTags = this._toArray(raw.tags);
    
    const intent = raw.intent ? String(raw.intent).trim().toLowerCase() : null;

    const questionVariants = rawQuestions.map(q => {
      const rawStr = String(q).trim();
      return { raw: rawStr, normalized: QueryNormalizer.normalize(rawStr).searchable };
    }).filter(v => v.raw);

    const aliasVariants = rawAliases.map(a => {
      const rawStr = String(a).trim();
      return { raw: rawStr, normalized: QueryNormalizer.normalize(rawStr).searchable };
    }).filter(v => v.raw);

    const tags = rawTags.map(v => QueryNormalizer.normalize(v).searchable).filter(Boolean);

    return {
      id: String(id || '').trim(),
      intent,
      category: raw.category || null,
      topic: raw.topic || null,
      entityType: raw.entityType || raw.entity_type || null,
      entity: raw.entity || null,
      questions: [...new Set(questionVariants.map(v => v.raw))],
      aliases: [...new Set(aliasVariants.map(v => v.raw))],
      questionVariants,
      aliasVariants,
      tags: [...new Set(tags)],
      answer: raw.answer || raw.response || raw.text || null,
      answerTemplate: raw.answerTemplate || raw.answer_template || null,
      dataSource: raw.dataSource || raw.data_source || null,
      knowledgeRef: raw.knowledgeRef || raw.knowledge_ref || null,
      followUps: this._toArray(raw.followUps || raw.follow_ups),
      related: this._toArray(raw.related),
      priority: this._number(raw.priority, 0),
      confidence: this._number(raw.confidence, 0.85),
      enabled: raw.enabled !== false,
      sourceFile
    };
  }

  /* ============================================================
     LOOKUPS & SEARCH
  ============================================================ */

  findExact(question) {
    const normalized = QueryNormalizer.normalize(question).searchable;
    if (!normalized) return null;

    const entry = this.questionIndex.get(normalized);
    return entry && entry.enabled ? this._buildMatch(entry, 1, 'exact') : null;
  }

  getById(id) {
    return id ? this.byId.get(String(id)) || null : null;
  }

  getByIntent(intent) {
    if (!intent) return [];
    return [...(this.byIntent.get(String(intent).trim().toLowerCase()) || [])].filter(e => e.enabled);
  }

  getByTag(tag) {
    if (!tag) return [];
    const normalizedTag = QueryNormalizer.normalize(tag).searchable;
    return [...(this.byTag.get(normalizedTag) || [])].filter(e => e.enabled);
  }

  search(query, options = {}) {
    let { intent = null, topic = null, limit = 10, minScore = 0.35 } = options;
    const normalizedQuery = QueryNormalizer.normalize(query).searchable;

    if (!normalizedQuery) return [];

    const exact = this.findExact(query);
    if (exact) return [exact];

    // ★ FIX: Short-query false positive protection
    const queryTokens = normalizedQuery.split(' ');
    if (queryTokens.length <= 2) {
      minScore = Math.max(minScore, 0.80); // Require near-exact match for short queries
    }

    let candidates = this.entries.filter(entry => entry.enabled);

    if (intent) {
      const intentCandidates = this.getByIntent(intent);
      if (intentCandidates.length) candidates = intentCandidates;
    }

    if (topic) {
      const topicNormalized = QueryNormalizer.normalize(topic).searchable;
      candidates = candidates.filter(entry => 
        QueryNormalizer.normalize(entry.topic).searchable === topicNormalized || entry.tags.includes(topicNormalized)
      );
    }

    const results = [];
    for (const entry of candidates) {
      const score = this._scoreEntry(normalizedQuery, entry);
      if (score >= minScore) {
        results.push(this._buildMatch(entry, score, 'lexical_similarity'));
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  _scoreEntry(normalizedQuery, entry) {
    let bestScore = 0;
    const candidates = [...entry.questionVariants, ...entry.aliasVariants];

    for (const candidate of candidates) {
      const normalizedCandidate = candidate.normalized;
      if (!normalizedCandidate) continue;

      if (normalizedQuery === normalizedCandidate) {
        bestScore = Math.max(bestScore, 1);
        continue;
      }

      const score = this._tokenSimilarity(normalizedQuery, normalizedCandidate);
      bestScore = Math.max(bestScore, score);
    }

    const priorityBonus = Math.min(Math.max(entry.priority, 0) * 0.01, 0.10);
    const confidenceBonus = this._clamp((entry.confidence - 0.5) * 0.05, 0, 0.025);

    return this._clamp(bestScore + priorityBonus + confidenceBonus, 0, 1);
  }

  _tokenSimilarity(textA, textB) {
    const setA = new Set(textA.split(' ').filter(Boolean));
    const setB = new Set(textB.split(' ').filter(Boolean));

    if (!setA.size || !setB.size) return 0;

    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) intersection++;
    }

    const union = new Set([...setA, ...setB]).size;
    const jaccard = union ? intersection / union : 0;

    const smaller = Math.min(setA.size, setB.size);
    const containment = smaller ? intersection / smaller : 0;

    // ★ FIX: Length penalty to prevent short queries matching long QA strings
    const sizeDiff = Math.abs(setA.size - setB.size);
    const maxSize = Math.max(setA.size, setB.size);
    const lengthPenalty = maxSize > 0 ? 1 - (sizeDiff / maxSize) : 1;

    return ((jaccard * 0.55) + (containment * 0.45)) * lengthPenalty;
  }

  _buildMatch(entry, score, method) {
    return {
      id: entry.id,
      score: this._round(score, 4),
      method,
      confidence: entry.confidence,
      intent: entry.intent,
      category: entry.category,
      topic: entry.topic,
      entityType: entry.entityType,
      entity: entry.entity,
      answer: entry.answer,
      answerTemplate: entry.answerTemplate,
      dataSource: entry.dataSource,
      knowledgeRef: entry.knowledgeRef,
      followUps: [...entry.followUps],
      related: [...entry.related],
      entry
    };
  }

  /* ============================================================
     RESOLVE & RENDER
  ============================================================ */

  resolve(question, options = {}) {
    const { intent = null, topic = null, threshold = 0.65 } = options;

    const exact = this.findExact(question);
    if (exact) return exact;

    const results = this.search(question, { intent, topic, limit: 5, minScore: threshold });
    if (!results.length) return null;

    const [first, second] = results;
    if (second && Math.abs(first.score - second.score) < 0.05) {
      return { ambiguous: true, candidates: results.slice(0, 3) };
    }

    return first;
  }

  answer(question, options = {}) {
    const match = this.resolve(question, options);
    if (!match) return null;
    if (match.ambiguous) return match;

    return {
      answer: this._renderAnswer(match, options.variables || {}),
      source: match.dataSource || 'KIM Knowledge Store',
      confidence: match.confidence,
      matchScore: match.score,
      method: match.method,
      intent: match.intent,
      knowledgeRef: match.knowledgeRef,
      followUps: match.followUps,
      related: match.related
    };
  }

  _renderAnswer(match, variables = {}) {
    let answer = match.answer || match.answerTemplate;
    if (!answer) return null;

    return String(answer).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, key) => {
      const value = this._getNested(variables, key);
      return value !== undefined && value !== null ? String(value) : full;
    });
  }

  getRelated(entryOrId, limit = 5) {
    const entry = typeof entryOrId === 'string' ? this.getById(entryOrId) : entryOrId;
    if (!entry) return [];

    const related = [];

    for (const id of entry.related || []) {
      const relatedEntry = this.getById(id);
      if (relatedEntry) related.push(relatedEntry);
      if (related.length >= limit) break;
    }

    if (related.length < limit && entry.topic) {
      const topicEntries = this.entries.filter(c => c.id !== entry.id && c.topic === entry.topic && c.enabled);
      for (const candidate of topicEntries) {
        if (!related.some(item => item.id === candidate.id)) related.push(candidate);
        if (related.length >= limit) break;
      }
    }

    return related.slice(0, limit).map(item => ({
      id: item.id,
      question: item.questions[0] || null,
      intent: item.intent,
      topic: item.topic
    }));
  }

  /* ============================================================
     UTILITIES
  ============================================================ */

  getStats() {
    return {
      version: this.VERSION,
      files: this.stats.files,
      entries: this.entries.length,
      questions: this.stats.questions,
      intents: this.byIntent.size,
      tags: this.byTag.size,
      topics: new Set(this.entries.map(e => e.topic).filter(Boolean)).size
    };
  }

  reload() {
    this.stats = { files: 0, entries: 0, questions: 0, intents: 0, tags: 0 };
    this.load();
    return this.getStats();
  }

  _toArray(value) {
    if (value === null || value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  _number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  _round(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  _getNested(object, pathString) {
    return String(pathString).split('.').reduce((current, key) => {
      return (current === null || current === undefined) ? undefined : current[key];
    }, object);
  }
}

module.exports = new QuestionAnswerStore();