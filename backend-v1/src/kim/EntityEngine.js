'use strict';

/**
 * ============================================================
 * KIM — ENTITY ENGINE
 * ============================================================
 * Extracts meaningful entities from human messages.
 * Dynamically loads team/player aliases from disk to scale 
 * with the 4M+ historical record system.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

class EntityEngine {
  constructor() {
    this.VERSION = '2.1.0';

    // Path to the dynamically generated entity registry
    this.REGISTRY_PATH = path.join(
      process.cwd(), 
      'public_data', 
      'knowledge', 
      'football', 
      'history', 
      'entity_registry.json'
    );

    // 1. Competitions
    this.COMPETITIONS = [
      { canonical: 'Premier League', aliases: ['premier league', 'epl', 'pl'] },
      { canonical: 'UEFA Champions League', aliases: ['champions league', 'ucl'] },
      { canonical: 'UEFA Europa League', aliases: ['europa league', 'uel'] },
      { canonical: 'UEFA Conference League', aliases: ['conference league', 'uecl'] },
      { canonical: 'World Cup', aliases: ['world cup', 'fifa world cup'] },
      { canonical: 'Club World Cup', aliases: ['club world cup'] },
      { canonical: 'Africa Cup of Nations', aliases: ['africa cup of nations', 'afcon'] },
      { canonical: 'Copa America', aliases: ['copa america'] },
      { canonical: 'UEFA European Championship', aliases: ['euros', 'european championship'] },
      { canonical: 'La Liga', aliases: ['la liga'] },
      { canonical: 'Serie A', aliases: ['serie a'] },
      { canonical: 'Bundesliga', aliases: ['bundesliga'] },
      { canonical: 'Ligue 1', aliases: ['ligue 1'] },
      { canonical: 'FA Cup', aliases: ['fa cup'] },
      { canonical: 'Carabao Cup', aliases: ['carabao cup', 'efl cup'] },
      { canonical: 'Community Shield', aliases: ['community shield'] },
      { canonical: 'Coppa Italia', aliases: ['coppa italia'] },
      { canonical: 'DFB Pokal', aliases: ['dfb pokal'] },
      { canonical: 'Copa del Rey', aliases: ['copa del rey'] },
      { canonical: 'MLS', aliases: ['mls'] },
      { canonical: 'Eredivisie', aliases: ['eredivisie'] },
      { canonical: 'Primeira Liga', aliases: ['primeira liga'] },
      { canonical: 'Super Lig', aliases: ['super lig'] },
      { canonical: 'CAF Champions League', aliases: ['caf champions league'] },
      { canonical: 'CAF Confederation Cup', aliases: ['caf confederation cup'] },
      { canonical: 'Kenya Premier League', aliases: ['kenya premier league', 'fkf premier league'] }
    ];

    // 2. Concepts
    this.CONCEPTS = [
      { canonical: 'Offside', aliases: ['offside', 'offsides'] },
      { canonical: 'VAR', aliases: ['var'] },
      { canonical: 'Penalty', aliases: ['penalty', 'penalties'] },
      { canonical: 'Free Kick', aliases: ['free kick'] },
      { canonical: 'Corner', aliases: ['corner', 'corners'] },
      { canonical: 'Throw In', aliases: ['throw in'] },
      { canonical: 'Goal Kick', aliases: ['goal kick'] },
      { canonical: 'Red Card', aliases: ['red card'] },
      { canonical: 'Yellow Card', aliases: ['yellow card'] },
      { canonical: 'Formation', aliases: ['formation', 'formations'] },
      { canonical: 'Tactics', aliases: ['tactics'] },
      { canonical: 'Pressing', aliases: ['pressing'] },
      { canonical: 'Gegenpressing', aliases: ['gegenpressing'] },
      { canonical: 'Counter Attack', aliases: ['counter attack', 'counterattack'] },
      { canonical: 'Possession', aliases: ['possession'] },
      { canonical: 'Expected Goals', aliases: ['xg', 'expected goals'] },
      { canonical: 'Both Teams To Score', aliases: ['btts', 'both teams to score'] },
      { canonical: 'Clean Sheet', aliases: ['clean sheet'] },
      { canonical: 'Hat Trick', aliases: ['hat trick', 'hat-trick'] },
      { canonical: 'Extra Time', aliases: ['extra time'] },
      { canonical: 'Penalty Shootout', aliases: ['penalty shootout', 'shootout'] },
      { canonical: 'Home Advantage', aliases: ['home advantage'] },
      { canonical: 'Away Form', aliases: ['away form'] },
      { canonical: 'Form', aliases: ['form'] },
      { canonical: 'Head To Head', aliases: ['h2h', 'head to head'] },
      { canonical: 'Elo', aliases: ['elo'] },
      { canonical: 'Transfer', aliases: ['transfer', 'transfers'] },
      { canonical: 'Loan', aliases: ['loan'] },
      { canonical: 'Release Clause', aliases: ['release clause'] },
      { canonical: 'Buyout Clause', aliases: ['buyout clause'] },
      { canonical: 'Aggregate', aliases: ['aggregate'] },
      { canonical: 'Away Goals', aliases: ['away goals'] }
    ];

    // 3. Relative Time
    this.RELATIVE_TIME = [
      'today', 'tonight', 'tomorrow', 'yesterday', 'last night',
      'this morning', 'this afternoon', 'this evening',
      'next week', 'last week', 'next month', 'last month',
      'this season', 'last season', 'next season',
      'recently', 'recent', 'earlier', 'previous', 'next', 'upcoming'
    ].map(item => ({ canonical: item, aliases: [item] }));

    // 4. Positions
    this.POSITIONS = [
      { canonical: 'Goalkeeper', aliases: ['goalkeeper', 'keeper', 'gk'] },
      { canonical: 'Defender', aliases: ['defender'] },
      { canonical: 'Centre Back', aliases: ['centre back', 'center back', 'cb'] },
      { canonical: 'Left Back', aliases: ['left back', 'lb'] },
      { canonical: 'Right Back', aliases: ['right back', 'rb'] },
      { canonical: 'Wing Back', aliases: ['wing back', 'wb'] },
      { canonical: 'Midfielder', aliases: ['midfielder', 'mid'] },
      { canonical: 'Defensive Midfielder', aliases: ['defensive midfielder', 'cdm'] },
      { canonical: 'Central Midfielder', aliases: ['central midfielder', 'cm'] },
      { canonical: 'Attacking Midfielder', aliases: ['attacking midfielder', 'cam'] },
      { canonical: 'Winger', aliases: ['winger'] },
      { canonical: 'Left Winger', aliases: ['left winger', 'lw'] },
      { canonical: 'Right Winger', aliases: ['right winger', 'rw'] },
      { canonical: 'Striker', aliases: ['striker', 'st'] },
      { canonical: 'Forward', aliases: ['forward'] },
      { canonical: 'Centre Forward', aliases: ['centre forward', 'center forward', 'cf'] }
    ];

    // 5. Countries
    this.COUNTRIES = [
      'kenya', 'uganda', 'tanzania', 'rwanda', 'burundi', 'nigeria', 'ghana',
      'senegal', 'cameroon', 'egypt', 'morocco', 'algeria', 'tunisia',
      'south africa', 'england', 'scotland', 'wales', 'ireland', 'france',
      'spain', 'germany', 'italy', 'portugal', 'netherlands', 'belgium',
      'brazil', 'argentina', 'uruguay', 'colombia', 'mexico', 'united states',
      'japan', 'south korea'
    ].map(item => ({
      canonical: item === 'united states' ? 'USA' : this.titleCase(item),
      aliases: [item, ...(item === 'united states' ? ['usa'] : [])]
    }));

    // 6. Base Known Teams (Fallback / Core)
    this.TEAMS = [
      { canonical: 'Arsenal', aliases: ['arsenal', 'arsenal fc', 'gunners'] },
      { canonical: 'Chelsea', aliases: ['chelsea', 'chelsea fc', 'blues'] },
      { canonical: 'Liverpool', aliases: ['liverpool', 'liverpool fc', 'reds'] },
      { canonical: 'Manchester United', aliases: ['manchester united', 'man united', 'man utd', 'man u', 'red devils'] },
      { canonical: 'Manchester City', aliases: ['manchester city', 'man city', 'cityzens'] },
      { canonical: 'Tottenham', aliases: ['tottenham', 'tottenham hotspur', 'spurs'] },
      { canonical: 'Barcelona', aliases: ['barcelona', 'barca', 'fc barcelona'] },
      { canonical: 'Real Madrid', aliases: ['real madrid', 'madrid', 'los blancos'] },
      { canonical: 'Bayern Munich', aliases: ['bayern munich', 'bayern', 'fc bayern'] },
      { canonical: 'Juventus', aliases: ['juventus', 'juve'] },
      { canonical: 'Inter Milan', aliases: ['inter milan', 'inter'] },
      { canonical: 'AC Milan', aliases: ['ac milan', 'milan'] },
      { canonical: 'Paris Saint Germain', aliases: ['psg', 'paris saint germain', 'paris saint-germain'] },
      { canonical: 'Ajax', aliases: ['ajax'] },
      { canonical: 'Borussia Dortmund', aliases: ['borussia dortmund', 'dortmund', 'bvb'] },
      { canonical: 'Gor Mahia', aliases: ['gor mahia', 'gor'] },
      { canonical: 'AFC Leopards', aliases: ['afc leopards', 'ingwe'] },
      
      // National Teams
      { canonical: 'Brazil', aliases: ['brazil', 'selecao'] },
      { canonical: 'Germany', aliases: ['germany', 'die mannschaft'] },
      { canonical: 'Spain', aliases: ['spain', 'la roja'] },
      { canonical: 'France', aliases: ['france', 'les bleus'] },
      { canonical: 'Argentina', aliases: ['argentina', 'la albiceleste'] },
      { canonical: 'Italy', aliases: ['italy', 'azzurri'] },
      { canonical: 'England', aliases: ['england', 'three lions'] },
      { canonical: 'Netherlands', aliases: ['netherlands', 'holland', 'oranje'] },
      { canonical: 'Portugal', aliases: ['portugal', 'selecao das quinas'] },
      { canonical: 'Belgium', aliases: ['belgium', 'red devils'] },
      { canonical: 'Croatia', aliases: ['croatia', 'vatreni'] },
      { canonical: 'Uruguay', aliases: ['uruguay', 'la celeste'] },
      { canonical: 'Mexico', aliases: ['mexico', 'el tri'] },
      { canonical: 'United States', aliases: ['united states', 'usa', 'usmnt'] },
      { canonical: 'Kenya', aliases: ['kenya', 'harambee stars'] }
    ];

    // 7. Base Known Players (Fallback / Core)
    this.PLAYERS = [
      { canonical: 'Bukayo Saka', aliases: ['bukayo saka', 'saka'] },
      { canonical: 'Mohamed Salah', aliases: ['mohamed salah', 'mo salah', 'salah'] },
      { canonical: 'Erling Haaland', aliases: ['erling haaland', 'haaland'] },
      { canonical: 'Kylian Mbappe', aliases: ['kylian mbappe', 'mbappe', 'mbappé'] },
      { canonical: 'Vinicius Junior', aliases: ['vinicius junior', 'vinicius jr', 'vinicius', 'vini jr'] },
      { canonical: 'Lionel Messi', aliases: ['lionel messi', 'messi'] },
      { canonical: 'Cristiano Ronaldo', aliases: ['cristiano ronaldo', 'ronaldo', 'cr7'] },
      { canonical: 'Kevin De Bruyne', aliases: ['kevin de bruyne', 'de bruyne'] }
    ];

    // Load dynamic entities from disk (adds to the base arrays above)
    this.loadDynamicFootballEntities();

    // Compile dictionaries into high-performance matchers
    this._matchers = {
      competitions: this._buildMatcher(this.COMPETITIONS),
      concepts: this._buildMatcher(this.CONCEPTS),
      positions: this._buildMatcher(this.POSITIONS),
      countries: this._buildMatcher(this.COUNTRIES),
      relativeTime: this._buildMatcher(this.RELATIVE_TIME),
      teams: this._buildMatcher(this.TEAMS),
      players: this._buildMatcher(this.PLAYERS)
    };
  }

  /* ============================================================
     DYNAMIC DICTIONARY EXTENSION
  ============================================================ */

  // ★ FIX: Load aliases from disk without creating circular dependencies
  loadDynamicFootballEntities() {
    try {
      if (!fs.existsSync(this.REGISTRY_PATH)) {
        console.warn(`[EntityEngine] entity_registry.json not found at ${this.REGISTRY_PATH}. Using base entities only.`);
        return;
      }

      const fileContent = fs.readFileSync(this.REGISTRY_PATH, 'utf8').trim();
      if (!fileContent) return;

      const registry = JSON.parse(fileContent);
      if (!registry || typeof registry !== 'object') return;

      let loadedTeams = 0;
      let loadedPlayers = 0;

      if (Array.isArray(registry.teams)) {
        for (const team of registry.teams) {
          if (team?.canonical && Array.isArray(team.aliases)) {
            // Avoid duplicating base entities if they are already in the registry
            const exists = this.TEAMS.some(t => t.canonical === team.canonical);
            if (!exists) {
              this.TEAMS.push({
                canonical: team.canonical,
                aliases: team.aliases.map(a => String(a).toLowerCase())
              });
              loadedTeams++;
            }
          }
        }
      }

      if (Array.isArray(registry.players)) {
        for (const player of registry.players) {
          if (player?.canonical && Array.isArray(player.aliases)) {
            const exists = this.PLAYERS.some(p => p.canonical === player.canonical);
            if (!exists) {
              this.PLAYERS.push({
                canonical: player.canonical,
                aliases: player.aliases.map(a => String(a).toLowerCase())
              });
              loadedPlayers++;
            }
          }
        }
      }

      console.info(
        `[EntityEngine] Dynamically loaded ${loadedTeams} teams and ${loadedPlayers} players from registry.`
      );
    } catch (error) {
      console.error('[EntityEngine] Failed to load dynamic entity registry:', error.message);
    }
  }

  addTeam(canonical, aliases) {
    this.TEAMS.push({ canonical, aliases: aliases.map(a => a.toLowerCase()) });
    this._matchers.teams = this._buildMatcher(this.TEAMS);
  }

  addPlayer(canonical, aliases) {
    this.PLAYERS.push({ canonical, aliases: aliases.map(a => a.toLowerCase()) });
    this._matchers.players = this._buildMatcher(this.PLAYERS);
  }

  // Allows hot-reloading of entities without restarting the app
  reloadDynamicEntities() {
    // Reset to base arrays
    this.TEAMS = this.TEAMS.filter(t => 
      ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester United', 'Manchester City', 'Tottenham', 'Barcelona', 'Real Madrid', 'Bayern Munich', 'Juventus', 'Inter Milan', 'AC Milan', 'Paris Saint Germain', 'Ajax', 'Borussia Dortmund', 'Gor Mahia', 'AFC Leopards', 'Brazil', 'Germany', 'Spain', 'France', 'Argentina', 'Italy', 'England', 'Netherlands', 'Portugal', 'Belgium', 'Croatia', 'Uruguay', 'Mexico', 'United States', 'Kenya'].includes(t.canonical)
    );
    this.PLAYERS = this.PLAYERS.filter(p => 
      ['Bukayo Saka', 'Mohamed Salah', 'Erling Haaland', 'Kylian Mbappe', 'Vinicius Junior', 'Lionel Messi', 'Cristiano Ronaldo', 'Kevin De Bruyne'].includes(p.canonical)
    );

    this.loadDynamicFootballEntities();

    this._matchers.teams = this._buildMatcher(this.TEAMS);
    this._matchers.players = this._buildMatcher(this.PLAYERS);
  }

  /* ============================================================
     PUBLIC API
  ============================================================ */

  extract(message) {
    const original = typeof message === 'string' ? message : String(message ?? '');
    const text = this.normalize(original);

    let entities = [];

    // Regex-based extractions
    entities.push(...this._extractYears(text));
    entities.push(...this._extractSeasons(text));
    entities.push(...this._extractScorelines(text));
    entities.push(...this._extractComparisons(text));
    entities.push(...this._extractMatchReferences(text));

    // Dictionary-based extractions
    entities.push(...this._extractWithMatcher(text, this._matchers.competitions, 'competition', 0.98));
    entities.push(...this._extractWithMatcher(text, this._matchers.concepts, 'football_concept', 0.92));
    entities.push(...this._extractWithMatcher(text, this._matchers.positions, 'position', 0.90));
    entities.push(...this._extractWithMatcher(text, this._matchers.countries, 'country', 0.95));
    entities.push(...this._extractWithMatcher(text, this._matchers.relativeTime, 'relative_time', 0.90));
    entities.push(...this._extractWithMatcher(text, this._matchers.teams, 'team', 0.94));
    entities.push(...this._extractWithMatcher(text, this._matchers.players, 'player', 0.93));

    return this.deduplicate(entities);
  }

  /* ============================================================
     CORE EXTRACTION LOGIC
  ============================================================ */

  _extractWithMatcher(text, matcher, type, baseConfidence = 0.95, highConfidence = 0.99) {
    if (!matcher.regex) return [];

    const entities = [];
    let match;
    matcher.regex.lastIndex = 0; // Reset regex state

    while ((match = matcher.regex.exec(text)) !== null) {
      const raw = match[0];
      const canonical = matcher.map.get(raw.toLowerCase());

      // If the raw text matches the canonical name exactly, higher confidence
      const isCanonical = raw.toLowerCase() === canonical.toLowerCase();

      entities.push({
        type,
        value: canonical,
        raw,
        confidence: isCanonical ? highConfidence : baseConfidence
      });
    }

    return entities;
  }

  _extractYears(text) {
    const matches = text.match(/\b(?:19|20)\d{2}\b/g);
    if (!matches) return [];

    return matches.map(year => ({
      type: 'year',
      value: Number(year),
      raw: year,
      confidence: 1
    }));
  }

  _extractSeasons(text) {
    const entities = [];
    const patterns = [
      /\b(20\d{2})\/(20\d{2})\b/g,
      /\b(20\d{2})-(20\d{2})\b/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          type: 'season',
          value: `${match[1]}/${match[2]}`,
          startYear: Number(match[1]),
          endYear: Number(match[2]),
          raw: match[0],
          confidence: 1
        });
      }
    }

    return entities;
  }

  _extractScorelines(text) {
    const entities = [];
    const standardPattern = /\b(\d+)\s*[-:]\s*(\d+)\b/g;
    const nilPattern = /\b(\d+)\s+nil\b/gi;

    let match;
    while ((match = standardPattern.exec(text)) !== null) {
      const num1 = Number(match[1]);
      const num2 = Number(match[2]);

      // Sanity check: avoid matching years/seasons as scorelines
      if (num1 <= 20 && num2 <= 20) {
        entities.push({
          type: 'scoreline',
          value: `${match[1]}-${match[2]}`,
          homeScore: num1,
          awayScore: num2,
          raw: match[0],
          confidence: 0.98
        });
      }
    }

    while ((match = nilPattern.exec(text)) !== null) {
      entities.push({
        type: 'scoreline',
        value: `${match[1]}-0`,
        homeScore: Number(match[1]),
        awayScore: 0,
        raw: match[0],
        confidence: 0.95
      });
    }

    return entities;
  }

  _extractComparisons(text) {
    const pattern = /\b(?:vs|versus|v\.?|against|compared with|compared to|better than|stronger than|weaker than)\b/i;
    if (pattern.test(text)) {
      return [{
        type: 'comparison',
        value: true,
        confidence: 0.95
      }];
    }
    return [];
  }

  _extractMatchReferences(text) {
    const pattern = /\b(last match|last game|next match|next game|upcoming match|previous match|that match|that game|this match|this game)\b/i;
    const match = text.match(pattern);

    if (match) {
      return [{
        type: 'match_reference',
        value: match[1].toLowerCase(),
        raw: match[0],
        confidence: 0.92
      }];
    }
    return [];
  }

  /* ============================================================
     HELPERS & UTILITIES
  ============================================================ */

  /**
   * Compiles an array of { canonical, aliases } into a single fast RegExp and a lookup Map.
   */
  _buildMatcher(dictionary) {
    // Safety check to prevent crashes if a dictionary is malformed
    if (!Array.isArray(dictionary)) {
      console.warn('[EntityEngine] Dictionary is not an array, skipping matcher.');
      return { regex: null, map: new Map() };
    }

    const phrases = [];
    const map = new Map();

    for (const item of dictionary) {
      if (!item || !item.aliases) continue;
      for (const alias of item.aliases) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        phrases.push(escaped);
        map.set(alias.toLowerCase(), item.canonical);
      }
    }

    if (phrases.length === 0) {
      return { regex: null, map };
    }

    // Sort by length descending to prioritize longer matches (e.g., "manchester united" over "man")
    phrases.sort((a, b) => b.length - a.length);

    const regex = new RegExp(`\\b(${phrases.join('|')})\\b`, 'gi');
    return { regex, map };
  }

  normalize(text) {
    return String(text ?? '')
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  titleCase(text) {
    return String(text)
      .replace(/\w\S*/g, word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      );
  }

  deduplicate(entities) {
    const result = [];
    const seen = new Set();

    for (const entity of entities) {
      const key = [
        entity.type,
        entity.value,
        entity.raw || ''
      ].join('|').toLowerCase();

      if (seen.has(key)) continue;

      seen.add(key);
      result.push(entity);
    }

    // Highest-confidence entities first
    return result.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  /* ============================================================
     CONVENIENCE QUERY HELPERS
  ============================================================ */

  getByType(entities, type) {
    return entities.filter(entity => entity.type === type);
  }

  firstByType(entities, type) {
    return entities.find(entity => entity.type === type) || null;
  }

  teams(entities) { return this.getByType(entities, 'team'); }
  players(entities) { return this.getByType(entities, 'player'); }
  competitions(entities) { return this.getByType(entities, 'competition'); }
  years(entities) { return this.getByType(entities, 'year'); }
  concepts(entities) { return this.getByType(entities, 'football_concept'); }
  countries(entities) { return this.getByType(entities, 'country'); }
  scorelines(entities) { return this.getByType(entities, 'scoreline'); }
}

module.exports = new EntityEngine();