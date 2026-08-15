'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const V2_DIR = path.join(ROOT, 'public_data_v2');
const INDEX_DIR = path.join(V2_DIR, 'knowledge', 'football', 'indexes');
const STATS_DIR = path.join(V2_DIR, 'stats');

class KnowledgeQueryEngine {
  constructor() {
    this.VERSION = '1.0.0';
    this.cache = {};
    
    // Explicit mapping for common short names to prevent ambiguous matches
    this.COMMON_SHORT_NAMES = {
      'arsenal': '11',
      'chelsea': '631',
      'liverpool': '31',
      'man united': '985',
      'man utd': '985',
      'man city': '281',
      'tottenham': '148',
      'spurs': '148',
      'barcelona': '131',
      'barca': '131',
      'real madrid': '418',
      'madrid': '418',
      'bayern munich': '27',
      'bayern': '27',
      'dortmund': '16',
      'juventus': '506',
      'juve': '506',
      'inter': '46',
      'inter milan': '46',
      'ac milan': '5',
      'milan': '5',
      'psg': '583',
      'paris saint germain': '583',
      'napoli': '6195',
      'roma': '12',
      'lazio': '398',
      'atletico madrid': '13',
      'atletico': '13',
      'sevilla': '368',
      'valencia': '1049',
      'villarreal': '1050',
      'benfica': '294',
      'porto': '720',
      'sporting cp': '336',
      'sporting': '336',
      'ajax': '610',
      'psv': '383',
      'feyenoord': '234',
      'celtic': '371',
      'rangers': '124'
    };
  }

  loadJson(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  normalizeName(value) {
    if (!value) return '';
    let str = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    str = str.replace(/([a-z])([A-Z])/g, '$1 $2');
    return str.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  getMatchIndex() {
    if (!this.cache.matchIndex) this.cache.matchIndex = this.loadJson(path.join(INDEX_DIR, 'match_index.json')) || {};
    return this.cache.matchIndex;
  }

  getH2HIndex() {
    if (!this.cache.h2hIndex) this.cache.h2hIndex = this.loadJson(path.join(INDEX_DIR, 'h2h_index.json')) || {};
    return this.cache.h2hIndex;
  }

  getTeamAliasIndex() {
    if (!this.cache.teamAliasIndex) this.cache.teamAliasIndex = this.loadJson(path.join(INDEX_DIR, 'team_alias_index.json')) || {};
    return this.cache.teamAliasIndex;
  }

  getPlayersIndex() {
    if (!this.cache.playersIndex) this.cache.playersIndex = this.loadJson(path.join(STATS_DIR, 'players', 'players_index.json')) || { players: [] };
    return this.cache.playersIndex;
  }

  getH2HSummaries() {
    if (!this.cache.h2hSummaries) this.cache.h2hSummaries = this.loadJson(path.join(STATS_DIR, 'h2h', 'h2h_summaries.json')) || [];
    return this.cache.h2hSummaries;
  }

  formatResponse(status, data, completeness = 'complete', message = '') {
    return { status, source: 'zokascore_v2', completeness, data, message };
  }

  // --- TEAM OPERATIONS ---

  findTeam(name) {
    const normName = this.normalizeName(name);
    const index = this.getTeamAliasIndex();

    // 0. Check explicit short-name map first
    if (this.COMMON_SHORT_NAMES[normName]) {
      const id = this.COMMON_SHORT_NAMES[normName];
      const team = index[id];
      if (team) return this.formatResponse('ok', { team_id: id, ...team });
    }

    // 1. Exact name / alias match
    for (const [id, team] of Object.entries(index)) {
      const teamName = this.normalizeName(team.name);
      const aliases = Array.isArray(team.aliases) ? team.aliases.map(a => this.normalizeName(a)) : [];

      if (teamName === normName || aliases.includes(normName)) {
        return this.formatResponse('ok', { team_id: id, ...team });
      }
    }

    // 2. Controlled short-name resolution (unambiguous only)
    const candidates = [];
    for (const [id, team] of Object.entries(index)) {
      const teamName = this.normalizeName(team.name);
      const aliases = Array.isArray(team.aliases) ? team.aliases.map(a => this.normalizeName(a)) : [];
      const names = [teamName, ...aliases];

      const matches = names.some(candidate => {
        if (!candidate) return false;
        if (candidate.startsWith(normName + ' ')) return true;
        if (candidate.endsWith(' ' + normName)) return true;
        return false;
      });

      if (matches) candidates.push({ team_id: id, ...team });
    }

    if (candidates.length === 1) return this.formatResponse('ok', candidates[0]);
    if (candidates.length > 1) return this.formatResponse('ambiguous', candidates, 'partial', `Multiple teams match '${name}'`);

    return this.formatResponse('not_found', null, 'unknown', `Team '${name}' not found`);
  }

  searchTeams(query) {
    const normQuery = this.normalizeName(query);
    const index = this.getTeamAliasIndex();
    const results = [];

    for (const [id, team] of Object.entries(index)) {
      if (this.normalizeName(team.name).includes(normQuery) || (team.aliases || []).some(a => this.normalizeName(a).includes(normQuery))) {
        results.push({ team_id: id, name: team.name, type: team.type });
      }
    }

    if (results.length > 0) return this.formatResponse('ok', results);
    return this.formatResponse('not_found', [], 'unknown', `No teams found matching '${query}'`);
  }

  getTeamHistory(teamId) {
    const stats = this.loadJson(path.join(STATS_DIR, 'teams', `${teamId}.json`));
    if (stats) return this.formatResponse('ok', stats);
    return this.formatResponse('not_found', null, 'unknown', `Team stats for '${teamId}' not found`);
  }

  getTeamSeason(teamId, season) {
    const seasonData = this.loadJson(path.join(STATS_DIR, 'seasonal', `${season}.json`));
    if (seasonData && seasonData[String(teamId)]) {
      return this.formatResponse('ok', seasonData[String(teamId)]);
    }
    return this.formatResponse('not_found', null, 'unknown', `Team '${teamId}' stats for season '${season}' not found`);
  }

  // --- MATCH OPERATIONS ---

  getMatch(matchId) {
    const index = this.getMatchIndex();
    const match = index[String(matchId)];
    if (match) return this.formatResponse('ok', match);
    return this.formatResponse('not_found', null, 'unknown', `Match '${matchId}' not found`);
  }

  getH2H(teamAId, teamBId) {
    const h2hKey = [String(teamAId), String(teamBId)].sort().join('_vs_');
    const summaries = this.getH2HSummaries();
    const summary = summaries.find(s => s.h2h_id === h2hKey);

    if (summary) return this.formatResponse('ok', summary);
    return this.formatResponse('not_found', null, 'unknown', `H2H between '${teamAId}' and '${teamBId}' not found`);
  }

  // --- PLAYER OPERATIONS ---

  findPlayer(name) {
    const normName = this.normalizeName(name);
    const index = this.getPlayersIndex();
    
    let player = index.players.find(p => this.normalizeName(p.player_key) === normName);
    if (!player) {
      player = index.players.find(p => this.normalizeName(p.name) === normName);
    }

    if (player) return this.formatResponse('ok', player);
    return this.formatResponse('not_found', null, 'unknown', `Player '${name}' not found`);
  }

  searchPlayers(query) {
    const normQuery = this.normalizeName(query);
    const index = this.getPlayersIndex();
    const results = index.players.filter(p => 
      this.normalizeName(p.name).includes(normQuery) || this.normalizeName(p.player_key).includes(normQuery)
    );

    if (results.length > 0) return this.formatResponse('ok', results);
    return this.formatResponse('not_found', [], 'unknown', `No players found matching '${query}'`);
  }

  getPlayerStats(playerId) {
    const stats = this.loadJson(path.join(STATS_DIR, 'players', `player_${playerId}.json`));
    if (stats) {
      const completeness = stats.source === 'historical_unmatched' ? 'partial' : 'complete';
      return this.formatResponse('ok', stats, completeness);
    }
    return this.formatResponse('not_found', null, 'unknown', `Player profile '${playerId}' not found`);
  }
}

module.exports = new KnowledgeQueryEngine();