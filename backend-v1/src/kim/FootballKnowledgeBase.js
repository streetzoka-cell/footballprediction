'use strict';

/**
 * ============================================================
 * KIM — PROFESSIONAL FOOTBALL KNOWLEDGE BASE
 * ============================================================
 *
 * Responsibility:
 *   - Load lightweight football knowledge (laws, tactics, etc.) into memory
 *   - Normalize natural-language queries
 *   - Resolve multiple football concepts
 *   - Detect question intent, query type, and source type
 *   - Score concepts with confidence
 *   - Provide safe, lazy-loaded access to massive historical data files
 *   - Discover and route historical datasets
 *
 * IMPORTANT:
 *   This module retrieves KNOWLEDGE.
 *   It intentionally does NOT generate final conversational responses,
 *   access live football APIs, manage conversation memory, or make predictions.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football');

const LIGHTWEIGHT_DIRS = [
  'aliases',
  'competitions',
  'laws',
  'tactics',
  'terminology',
  'positions',
  'formations',
  'statistics',
  'awards'
];

const LAZY_DIRS = [
  'history',
  'identity_scan',
  'clubs',
  'national_teams',
  'players',
  'managers'
];

class FootballKnowledgeBase {
  constructor() {
    this.graph = [];
    this.byId = new Map();
    this.aliasIndex = new Map();
    this.keywordIndex = new Map();
    this.categoryIndex = new Map();
    
    // ★ FIX 1: Historical dataset registry cache
    this.historicalRegistry = null;
    this.historicalDatasetIndex = new Map();
    
    // Cache for regex patterns to avoid recompiling on every query
    this._phraseRegexCache = new Map();

    this.stats = {
      filesLoaded: 0,
      conceptsLoaded: 0,
      aliasesIndexed: 0,
      keywordsIndexed: 0,
      categoriesIndexed: 0
    };

    this.intentPatterns = this.buildIntentPatterns();

    // Load only lightweight concepts into RAM
    this.loadLightweightGraph();
    this.buildIndexes();
    this.loadHistoricalRegistry();

    logger.info(
      `[KnowledgeBase] Ready. Loaded ${this.graph.length} lightweight concepts. ` +
      `Historical corpus remains lazy-loaded.`
    );
  }

  /* ============================================================
     CONFIGURATION
  ============================================================ */

  // ★ FIX 4: Expanded historical query classification
  buildIntentPatterns() {
    return {
      DEFINITION: ['what is', 'what are', 'what does', 'what do', 'define', 'definition', 'meaning of', 'meaning', 'explain', 'tell me about'],
      WHY: ['why', 'why does', 'why do', 'why is', 'why are', 'how come', 'what causes', 'reason for'],
      HOW: ['how does', 'how do', 'how can', 'how is', 'how are', 'how to'],
      HOW_MANY: ['how many', 'how much', 'number of', 'amount of'],
      EXAMPLE: ['example', 'examples', 'give me an example', 'give examples', 'show me an example', 'for example'],
      ADVANTAGES: ['advantage', 'advantages', 'benefit', 'benefits', 'strength', 'strengths', 'good about', 'pros'],
      WEAKNESSES: ['weakness', 'weaknesses', 'disadvantage', 'disadvantages', 'problem', 'problems', 'downside', 'downsides', 'cons'],
      COMPARISON: ['compare', 'comparison', 'difference between', 'difference', 'versus', 'vs', 'better than', 'similarity', 'similarities'],
      RULE: ['rule', 'rules', 'law', 'laws', 'allowed', 'illegal', 'legal', 'foul'],
      STATISTICS: ['stats', 'statistics', 'record', 'records', 'numbers'],
      WHO: ['who', 'which player', 'which team', 'who was', 'who is'],
      WHEN: ['when', 'what year', 'which year', 'date'],
      WHERE: ['where', 'which country', 'which stadium', 'location', 'host'],
      BEST: ['best', 'greatest', 'top', 'highest', 'most'],
      WORST: ['worst', 'lowest', 'least', 'fewest'],
      LATEST: ['latest', 'recent', 'last', 'current'],
      FIRST: ['first', 'initial', 'maiden'],
      WINNER: ['winner', 'won', 'champion', 'champions'],
      RUNNER_UP: ['runner up', 'runner-up', 'second place', 'finished second'],
      LIST: ['list', 'name', 'names', 'give me', 'show me'],
      
      // Historical specific intents
      HISTORICAL_MATCH: ['match history', 'matches between', 'games between', 'historical matches', 'past matches', 'previous meetings', 'all matches', 'matches played'],
      HISTORICAL_RESULT: ['who won', 'what was the score', 'final score', 'result', 'won against', 'beat'],
      HISTORICAL_RECORD: ['most wins', 'most goals', 'biggest win', 'largest win', 'highest scoring', 'longest'],
      TOURNAMENT_HISTORY: ['tournament history', 'past winners', 'previous winners', 'historical winners', 'all winners', 'winners list']
    };
  }

  /* ============================================================
     LOADING & INDEXING
  ============================================================ */

  loadLightweightGraph() {
    this.graph = [];

    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      logger.warn(`[KnowledgeBase] Knowledge directory does not exist: ${KNOWLEDGE_DIR}`);
      return;
    }

    for (const relativeDir of LIGHTWEIGHT_DIRS) {
      const dir = path.join(KNOWLEDGE_DIR, relativeDir);
      if (!fs.existsSync(dir)) continue;
      
      this._readLightweightDir(dir);
    }

    this.stats.conceptsLoaded = this.graph.length;
  }

  _readLightweightDir(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      logger.error(`[KnowledgeBase] Failed reading directory ${dir}: ${error.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        this._readLightweightDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        this._loadJsonFile(fullPath);
      }
    }
  }

  _loadJsonFile(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8').trim();
      if (!content) return;

      // Remove UTF-8 BOM if present
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }

      const data = JSON.parse(content);
      const records = Array.isArray(data) ? data : [data];

      for (const record of records) {
        if (!record || typeof record !== 'object') continue;
        
        if (record.id || record.lawNumber || record.name || record.title) {
          this.graph.push({ ...record, __sourceFile: filePath });
          this.stats.filesLoaded++;
        }
      }
    } catch (error) {
      logger.warn(`[KnowledgeBase] Failed loading ${filePath}: ${error.message}`);
    }
  }

  buildIndexes() {
    this.byId.clear();
    this.aliasIndex.clear();
    this.keywordIndex.clear();
    this.categoryIndex.clear();

    for (const concept of this.graph) {
      const id = this.getConceptId(concept);
      if (id) this.byId.set(id, concept);

      const category = this.normalizeText(concept.category || concept.type || concept.topic || 'general');
      if (!this.categoryIndex.has(category)) this.categoryIndex.set(category, []);
      this.categoryIndex.get(category).push(concept);

      const aliases = this.getAliases(concept);
      for (const alias of aliases) {
        const normalized = this.normalizeText(alias);
        if (!normalized) continue;
        if (!this.aliasIndex.has(normalized)) this.aliasIndex.set(normalized, []);
        this.aliasIndex.get(normalized).push(concept);
        this.stats.aliasesIndexed++;
      }

      const keywords = this.getKeywords(concept);
      for (const keyword of keywords) {
        const normalized = this.normalizeText(keyword);
        if (!normalized) continue;
        if (!this.keywordIndex.has(normalized)) this.keywordIndex.set(normalized, []);
        this.keywordIndex.get(normalized).push(concept);
        this.stats.keywordsIndexed++;
      }
    }

    this.stats.categoriesIndexed = this.categoryIndex.size;
  }

  /* ============================================================
     HISTORICAL DATASET REGISTRY
  ============================================================ */

  // ★ FIX 1 & 2: Add a historical dataset index
  loadHistoricalRegistry() {
    if (this.historicalRegistry) {
      return this.historicalRegistry;
    }

    const registry = this.loadJsonFileLazy('history/registry.json');

    if (!registry || !Array.isArray(registry.datasets)) {
      logger.warn('[KnowledgeBase] Historical registry unavailable.');
      this.historicalRegistry = [];
      return this.historicalRegistry;
    }

    this.historicalRegistry = registry.datasets;
    this.historicalDatasetIndex.clear();

    for (const dataset of this.historicalRegistry) {
      if (!dataset || !dataset.path) continue;

      const pathKey = String(dataset.path).toLowerCase();
      this.historicalDatasetIndex.set(pathKey, dataset);

      if (Array.isArray(dataset.aliases)) {
        for (const alias of dataset.aliases) {
          const normalized = this.normalizeText(alias);
          if (normalized) {
            this.historicalDatasetIndex.set(normalized, dataset);
          }
        }
      }
    }

    logger.info(
      `[KnowledgeBase] Historical registry loaded: ${this.historicalRegistry.length} datasets.`
    );

    return this.historicalRegistry;
  }

  findHistoricalDatasets(query, options = {}) {
    const { limit = 10 } = options;

    const registry = this.loadHistoricalRegistry();
    const normalizedQuery = this.normalizeText(query);

    if (!normalizedQuery) return [];

    const results = [];

    for (const dataset of registry) {
      const pathText = this.normalizeText(dataset.path || '');
      const aliases = Array.isArray(dataset.aliases)
        ? dataset.aliases.map(alias => this.normalizeText(alias))
        : [];

      let score = 0;

      if (pathText === normalizedQuery) {
        score += 100;
      }

      if (pathText.includes(normalizedQuery)) {
        score += 60;
      }

      for (const alias of aliases) {
        if (alias === normalizedQuery) {
          score += 90;
        } else if (alias.includes(normalizedQuery)) {
          score += 50;
        } else if (normalizedQuery.includes(alias)) {
          score += 40;
        }
      }

      if (score > 0) {
        results.push({ dataset, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  // ★ FIX 3: Add a safe historical dataset getter
  getHistoricalDataset(datasetPath) {
    if (!datasetPath) return null;

    const registry = this.loadHistoricalRegistry();
    const normalized = this.normalizeText(datasetPath);

    const dataset =
      registry.find(item => this.normalizeText(item.path || '') === normalized) ||
      this.historicalDatasetIndex.get(normalized);

    if (!dataset || !dataset.path) {
      return null;
    }

    return this.getHistoricalEntity(`history/${dataset.path}`);
  }

  /* ============================================================
     LAZY HISTORICAL ACCESS
  ============================================================ */

  resolveLazyEntityFile(relativePath) {
    if (!relativePath) return null;

    const safePath = path.normalize(relativePath);

    // Prevent directory traversal attacks
    if (safePath.includes('..') || path.isAbsolute(safePath)) {
      return null;
    }

    const fullPath = path.join(KNOWLEDGE_DIR, safePath);

    if (!fullPath.startsWith(KNOWLEDGE_DIR)) {
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    return fullPath;
  }

  loadJsonFileLazy(relativePath) {
    const filePath = this.resolveLazyEntityFile(relativePath);
    if (!filePath) return null;

    try {
      let content = fs.readFileSync(filePath, 'utf8').trim();
      if (!content) return null;

      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }

      return JSON.parse(content);
    } catch (error) {
      logger.warn(`[KnowledgeBase] Failed lazy loading ${relativePath}: ${error.message}`);
      return null;
    }
  }

  getHistoricalEntity(relativePath) {
    const data = this.loadJsonFileLazy(relativePath);
    if (!data) return null;

    return {
      source: relativePath,
      data
    };
  }

  /* ============================================================
     TEXT NORMALIZATION & MATCHING
  ============================================================ */

  normalizeText(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[’']/g, "'")
      .replace(/[-_/]/g, ' ')
      .replace(/[^\p{L}\p{N}\s']/gu, ' ') // Keep letters, numbers, spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  tokenize(text) {
    return this.normalizeText(text).split(/\s+/).filter(Boolean);
  }

  containsPhrase(text, phrase) {
    const normalizedText = this.normalizeText(text);
    const normalizedPhrase = this.normalizeText(phrase);

    if (!normalizedText || !normalizedPhrase) return false;

    let regex = this._phraseRegexCache.get(normalizedPhrase);
    if (!regex) {
      const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i');
      this._phraseRegexCache.set(normalizedPhrase, regex);
    }

    return regex.test(normalizedText);
  }

  /* ============================================================
     CONCEPT HELPERS
  ============================================================ */

  getConceptId(concept) {
    return String(concept.id || concept.lawNumber || concept.slug || concept.name || concept.title || '')
      .trim().toLowerCase().replace(/\s+/g, '-');
  }

  getConceptName(concept) {
    return concept.name || concept.title || concept.label || concept.id || concept.lawNumber || 'Unknown football concept';
  }

  getAliases(concept) {
    const aliases = Array.isArray(concept.aliases) ? concept.aliases : [];
    const name = this.getConceptName(concept);
    return [...new Set([name, ...aliases].filter(Boolean))];
  }

  getKeywords(concept) {
    const keywords = Array.isArray(concept.keywords) ? concept.keywords : [];
    return [...new Set(keywords.filter(Boolean))];
  }

  getRelatedConcepts(concept) {
    const related = concept.related_concepts || concept.relatedConcepts || concept.related || [];
    return Array.isArray(related) ? related : [];
  }

  /* ============================================================
     INTENT & QUERY DETECTION
  ============================================================ */

  detectIntent(message) {
    const normalized = this.normalizeText(message);
    const scores = {};

    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      let score = 0;
      for (const pattern of patterns) {
        if (this.containsPhrase(normalized, pattern)) {
          score += pattern.split(/\s+/).length * 10;
        }
      }
      scores[intent] = score;
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    if (!sorted.length || sorted[0][1] === 0) {
      return { intent: 'GENERAL', confidence: 0, scores };
    }

    const [intent, score] = sorted[0];
    const secondScore = sorted[1]?.[1] || 0;

    return {
      intent,
      confidence: this.calculateIntentConfidence(score, secondScore),
      scores
    };
  }

  calculateIntentConfidence(best, second) {
    if (!best) return 0;
    const margin = best - second;
    return Math.min(1, Math.max(0, 0.55 + Math.min(best / 100, 0.25) + Math.min(margin / 100, 0.20)));
  }

  detectQueryType(message) {
    const text = this.normalizeText(message);

    const patterns = [
      { type: 'winner', patterns: ['who won', 'winner', 'champion', 'who was champion'] },
      { type: 'runner_up', patterns: ['runner up', 'runner-up', 'second place', 'finished second'] },
      { type: 'top_scorer', patterns: ['top scorer', 'top goalscorer', 'golden boot', 'most goals'] },
      { type: 'record', patterns: ['record', 'highest', 'lowest', 'most', 'least'] },
      { type: 'history', patterns: ['history', 'historically', 'past', 'all time', 'ever'] },
      { type: 'statistics', patterns: ['stats', 'statistics', 'numbers', 'appearances', 'goals', 'assists'] },
      { type: 'comparison', patterns: ['compare', 'versus', 'vs', 'better than', 'difference between'] }
    ];

    for (const item of patterns) {
      if (item.patterns.some(pattern => this.containsPhrase(text, pattern))) {
        return item.type;
      }
    }
    return 'general';
  }

  getSourceType(query) {
    const text = this.normalizeText(query);

    if (
      text.includes('today') ||
      text.includes('currently') ||
      text.includes('live') ||
      text.includes('right now')
    ) {
      return 'live';
    }

    if (/\b(19\d{2}|20\d{2})\b/.test(text) || text.includes('history') || text.includes('all time')) {
      return 'historical';
    }

    return 'knowledge';
  }

  resolveHistoricalQuery(message, entities = {}) {
    const queryType = this.detectQueryType(message);
    return {
      source: 'history',
      queryType,
      entities,
      lazy: true
    };
  }

  // ★ FIX 5: Add historical query analysis using extracted entities
  analyzeHistoricalQuery(message, entities = []) {
    const normalized = this.normalizeText(message);

    const yearEntity = entities.find(e => e.type === 'year');
    const seasonEntity = entities.find(e => e.type === 'season');

    const teams = entities
      .filter(e => e.type === 'team')
      .map(e => e.value);

    const competitions = entities
      .filter(e => e.type === 'competition')
      .map(e => e.value);

    const historical =
      Boolean(yearEntity) ||
      Boolean(seasonEntity) ||
      /\b(history|historical|past|previous|all time|record)\b/i.test(normalized);

    return {
      historical,
      year: yearEntity?.value ?? null,
      season: seasonEntity?.value ?? null,
      teams,
      competitions
    };
  }

  /* ============================================================
     CONCEPT SCORING & RESOLUTION
  ============================================================ */

  scoreConcept(message, concept) {
    const msg = this.normalizeText(message);
    if (!msg || !concept) return { score: 0, matches: [], signals: {} };

    let score = 0;
    const matches = [];
    const signals = { exactName: 0, alias: 0, keyword: 0, tokenOverlap: 0, category: 0, questionField: 0 };

    const name = this.normalizeText(this.getConceptName(concept));
    const aliases = this.getAliases(concept).map(a => this.normalizeText(a)).filter(Boolean);
    const keywords = this.getKeywords(concept).map(k => this.normalizeText(k)).filter(Boolean);

    // 1. Exact canonical name
    if (name && this.containsPhrase(msg, name)) {
      score += 120;
      signals.exactName += 120;
      matches.push({ type: 'name', value: name, score: 120 });
    }

    // 2. Aliases
    for (const alias of aliases) {
      if (alias === name) continue;
      if (this.containsPhrase(msg, alias)) {
        score += 80;
        signals.alias += 80;
        matches.push({ type: 'alias', value: alias, score: 80 });
      }
    }

    // 3. Keywords
    for (const keyword of keywords) {
      if (this.containsPhrase(msg, keyword)) {
        score += 35;
        signals.keyword += 35;
        matches.push({ type: 'keyword', value: keyword, score: 35 });
      }
    }

    // 4. Token overlap
    const messageTokens = new Set(this.tokenize(msg));
    const nameTokens = this.tokenize(name);
    if (nameTokens.length) {
      const overlapping = nameTokens.filter(token => messageTokens.has(token));
      if (overlapping.length) {
        const overlapScore = Math.round((overlapping.length / nameTokens.length) * 30);
        score += overlapScore;
        signals.tokenOverlap += overlapScore;
        matches.push({ type: 'token_overlap', value: overlapping, score: overlapScore });
      }
    }

    // 5. Question fields
    const questionFields = [
      ...(Array.isArray(concept.questions) ? concept.questions : []),
      ...this.extractQuestionValues(concept.questions)
    ];

    for (const question of questionFields) {
      if (question && this.similarityPhraseMatch(msg, question)) {
        score += 25;
        signals.questionField += 25;
        matches.push({ type: 'question', value: question, score: 25 });
        break;
      }
    }

    return { score, matches, signals };
  }

  extractQuestionValues(questions) {
    if (!questions || typeof questions !== 'object' || Array.isArray(questions)) return [];
    return Object.values(questions).filter(value => typeof value === 'string');
  }

  similarityPhraseMatch(message, phrase) {
    const a = new Set(this.tokenize(message));
    const b = new Set(this.tokenize(phrase));
    if (!a.size || !b.size) return false;

    let overlap = 0;
    for (const token of b) {
      if (a.has(token)) overlap++;
    }
    return overlap / b.size >= 0.6;
  }

  resolveConcepts(message, options = {}) {
    const { maxResults = 5, minimumScore = 35 } = options;
    const results = [];

    for (const concept of this.graph) {
      const result = this.scoreConcept(message, concept);
      if (result.score >= minimumScore) {
        results.push({ concept, ...result });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  resolve(message, options = {}) {
    const { minimumConfidence = 0.65, minimumScore = 80, margin = 15 } = options;
    if (!message || typeof message !== 'string') return null;

    const intent = this.detectIntent(message);
    const candidates = this.resolveConcepts(message, { maxResults: 5, minimumScore });
    if (!candidates.length) return null;

    const best = candidates[0];
    const second = candidates[1];

    const scoreConfidence = this.calculateConceptConfidence(best.score, second?.score || 0);
    const confidence = Math.min(1, scoreConfidence * 0.75 + intent.confidence * 0.25);

    if (best.score < minimumScore || confidence < minimumConfidence || (second && best.score - second.score < margin)) {
      return { resolved: false, confidence, intent, candidates: candidates.map(c => this.serializeCandidate(c)) };
    }

    return {
      resolved: true,
      confidence,
      intent,
      concept: best.concept,
      matches: best.matches,
      candidates: candidates.map(c => this.serializeCandidate(c))
    };
  }

  calculateConceptConfidence(best, second) {
    if (!best) return 0;
    const normalizedScore = Math.min(best / 180, 1);
    const margin = Math.max(0, best - second);
    const marginScore = Math.min(margin / 80, 1);
    return (normalizedScore * 0.7) + (marginScore * 0.3);
  }

  serializeCandidate = (candidate) => {
    return {
      id: candidate.concept ? this.getConceptId(candidate.concept) : null,
      name: candidate.concept ? this.getConceptName(candidate.concept) : null,
      score: candidate.score,
      matches: candidate.matches
    };
  }

  /* ============================================================
     FULL QUERY ANALYSIS
  ============================================================ */

  analyze(message, options = {}) {
    const normalized = this.normalizeText(message);
    const intent = this.detectIntent(normalized);
    const concepts = this.resolveConcepts(normalized, options);

    const yearMatch = normalized.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    return {
      message,
      normalized,
      intent,
      year,
      concepts: concepts.map(c => this.serializeCandidate(c)),
      topConcept: concepts[0] ? {
        id: this.getConceptId(concepts[0].concept),
        name: this.getConceptName(concepts[0].concept),
        confidence: this.calculateConceptConfidence(concepts[0].score, concepts[1]?.score || 0)
      } : null,
      isComparison: intent.intent === 'COMPARISON' || concepts.length >= 2,
      isHistorical: Boolean(year),
      timestamp: Date.now()
    };
  }

  explainResolution(message) {
    const analysis = this.analyze(message);

    return {
      query: message,
      intent: analysis.intent,
      queryType: this.detectQueryType(message),
      sourceType: this.getSourceType(message),
      topConcept: analysis.topConcept,
      concepts: analysis.concepts,
      historical: analysis.isHistorical
    };
  }

  /* ============================================================
     HISTORICAL TOURNAMENT ENGINE
  ============================================================ */

  queryTournament(message, concept) {
    if (!concept || !Array.isArray(concept.tournaments)) return null;

    const normalized = this.normalizeText(message);
    const yearMatch = normalized.match(/\b(19\d{2}|20\d{2})\b/);
    const requestedYear = yearMatch ? Number(yearMatch[1]) : null;

    let tournament = null;

    if (requestedYear) {
      tournament = concept.tournaments.find(item => Number(item.year) === requestedYear);
    }

    if (!tournament) {
      const wantsRecent = normalized.includes('last') || normalized.includes('latest') || normalized.includes('recent') || normalized.includes('most recent');
      if (wantsRecent) {
        tournament = this.getLatestTournament(concept.tournaments);
      }
    }

    const field = this.detectTournamentField(normalized);

    if (tournament && field) {
      return {
        type: 'TOURNAMENT_FIELD',
        tournament,
        field,
        value: tournament[field] ?? null
      };
    }

    return {
      type: tournament ? 'TOURNAMENT' : 'TOURNAMENT_NOT_FOUND',
      requestedYear,
      tournament: tournament || null,
      availableYears: concept.tournaments
        .map(item => Number(item.year))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
    };
  }

  getLatestTournament(tournaments) {
    return [...tournaments].sort((a, b) => Number(b.year || 0) - Number(a.year || 0))[0] || null;
  }

  detectTournamentField(message) {
    const fields = [
      { field: 'champion', patterns: ['winner', 'won', 'champion', 'winner was', 'who won'] },
      { field: 'runner_up', patterns: ['runner up', 'runner-up', 'second', 'finished second'] },
      { field: 'host', patterns: ['host', 'hosted', 'host country', 'where'] },
      { field: 'top_scorer', patterns: ['top scorer', 'top goalscorer', 'most goals', 'golden boot'] },
      { field: 'top_scorer_goals', patterns: ['how many goals', 'goals did the top scorer'] }
    ];

    for (const item of fields) {
      for (const pattern of item.patterns) {
        if (this.containsPhrase(message, pattern)) return item.field;
      }
    }
    return null;
  }

  /* ============================================================
     KNOWLEDGE EXTRACTION & SEARCH
  ============================================================ */

  getKnowledge(concept) {
    if (!concept) return null;

    return {
      id: this.getConceptId(concept),
      name: this.getConceptName(concept),
      category: concept.category || concept.type || concept.topic || 'general',
      definition: concept.definition || concept.overview || null,
      simpleExplanation: concept.simple_explanation || concept.simpleExplanation || null,
      deepExplanation: concept.deep_explanation || concept.deepExplanation || null,
      corePrinciple: concept.core_principle || concept.corePrinciple || null,
      advantages: Array.isArray(concept.advantages) ? concept.advantages : [],
      weaknesses: Array.isArray(concept.weaknesses) ? concept.weaknesses : [],
      examples: Array.isArray(concept.examples) ? concept.examples : [],
      relatedConcepts: this.getRelatedConcepts(concept),
      questions: concept.questions || null,
      aliases: this.getAliases(concept),
      keywords: this.getKeywords(concept),
      tournaments: Array.isArray(concept.tournaments) ? concept.tournaments : null,
      sections: concept.sections || null
    };
  }

  searchByCategory(category, options = {}) {
    const { limit = 20 } = options;
    const normalized = this.normalizeText(category);
    const concepts = this.categoryIndex.get(normalized) || [];
    return concepts.slice(0, limit).map(concept => this.getKnowledge(concept));
  }

  getById(id) {
    if (!id) return null;
    
    const normalized = this.normalizeText(id);
    if (!normalized) return null;

    // 1. Direct canonical ID lookup
    const direct = this.byId.get(normalized);
    if (direct) {
      return this.getKnowledge(direct);
    }

    // 2. Exact alias/name lookup
    const aliasMatches = this.aliasIndex.get(normalized);
    if (aliasMatches && aliasMatches.length > 0) {
      return this.getKnowledge(aliasMatches[0]);
    }

    // 3. Try slug-style ID (e.g. "offside rule" -> "offside-rule")
    const slug = normalized.replace(/\s+/g, '-');
    const slugMatch = this.byId.get(slug);
    if (slugMatch) {
      return this.getKnowledge(slugMatch);
    }

    return null;
  }

  getRelated(conceptOrId, limit = 10) {
    const concept = typeof conceptOrId === 'string' ? this.byId.get(conceptOrId.toLowerCase()) : conceptOrId;
    if (!concept) return [];

    const related = this.getRelatedConcepts(concept);
    const results = [];

    for (const item of related) {
      const id = typeof item === 'string' ? item : item?.id;
      if (!id) continue;

      const relatedConcept = this.byId.get(String(id).toLowerCase());
      if (relatedConcept) {
        results.push(this.getKnowledge(relatedConcept));
      }
    }

    return results.slice(0, limit);
  }

  /* ============================================================
     UTILITIES
  ============================================================ */

  getStats() {
    return {
      ...this.stats,
      directory: KNOWLEDGE_DIR,
      graphSize: this.graph.length,
      lazyHistory: true,
      lightweightDirectories: [...LIGHTWEIGHT_DIRS],
      lazyDirectories: [...LAZY_DIRS],
      indexSizes: {
        ids: this.byId.size,
        aliases: this.aliasIndex.size,
        keywords: this.keywordIndex.size,
        categories: this.categoryIndex.size
      }
    };
  }

  health() {
    return {
      healthy: true, 
      knowledgeDirectory: KNOWLEDGE_DIR,
      concepts: this.graph.length,
      lazyHistory: true,
      indexesReady: this.byId.size > 0 || this.aliasIndex.size > 0 || this.keywordIndex.size > 0,
      stats: this.getStats()
    };
  }

  reload() {
    this.graph = [];
    this.byId.clear();
    this.aliasIndex.clear();
    this.keywordIndex.clear();
    this.categoryIndex.clear();
    this._phraseRegexCache.clear();
    
    // Clear historical caches
    this.historicalRegistry = null;
    this.historicalDatasetIndex.clear();
    
    this.stats = { filesLoaded: 0, conceptsLoaded: 0, aliasesIndexed: 0, keywordsIndexed: 0, categoriesIndexed: 0 };

    this.loadLightweightGraph();
    this.buildIndexes();
    this.loadHistoricalRegistry();

    logger.info(`[KnowledgeBase] Reloaded ${this.graph.length} lightweight football concepts.`);
    return this.getStats();
  }
}

module.exports = new FootballKnowledgeBase();