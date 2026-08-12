'use strict';

const FootballKnowledgeBase = require('./FootballKnowledgeBase');

class FootballDataResolver {
  constructor() {
    this.VERSION = '3.1.0';
    this.DEFAULT_LIMIT = 20;
    this.MAX_LIMIT = 100;
    this.registry = this.loadRegistry();
  }

  loadRegistry() {
    try {
      const data = FootballKnowledgeBase.getHistoricalEntity('history/registry.json');
      if (data && Array.isArray(data.data.datasets)) {
        console.log(`[DataResolver] Loaded ${data.data.datasets.length} historical datasets into registry.`);
        return data.data.datasets;
      }
    } catch (e) {
      console.warn('[DataResolver] Could not load history/registry.json. Run scripts/generate-history-registry.js');
    }
    return [];
  }

  resolve(intent, message, entities = [], options = {}) {
    if (this.registry.length === 0) return null;

    const msg = message.toLowerCase();
    const queryType = this.detectQueryType(message);
    
    const dataset = this.findDataset(msg, entities, queryType);
    if (!dataset) return null;

    const teams = entities.filter(e => e.type === 'team').map(e => e.value);
    const year = this.findYear(entities);
    const season = this.findSeason(message);

    // ★ FIX 1: Chunked File Loading by Year
    // If dataset path is a directory (e.g. 'world_cup') and year exists, load the specific chunk
    let filePath = `history/${dataset.path}`;
    if (year && !dataset.path.endsWith('.json')) {
      filePath = `history/${dataset.path}/${year}.json`;
    }

    const historicalData = FootballKnowledgeBase.getHistoricalEntity(filePath);
    if (!historicalData || !historicalData.data) return null;

    const data = historicalData.data;
    const limit = Math.min(Number(options.limit) || this.DEFAULT_LIMIT, this.MAX_LIMIT);

    // ★ FIX 2: Query Type specific routing (Tournament Winners vs Matches)
    if (queryType === 'winner' || queryType === 'top_scorer') {
      const tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];
      if (tournaments.length === 0) return null;

      const tournament = year 
        ? tournaments.find(t => String(t.year) === String(year))
        : tournaments[tournaments.length - 1]; // Default to latest

      if (!tournament) return null;

      const field = queryType === 'winner' ? 'champion' : 'top_scorer';
      const value = tournament[field];

      if (value) {
        return {
          type: 'historical_record',
          queryType,
          dataset: { id: dataset.id, path: dataset.path, type: dataset.type },
          data: { tournament, field, value },
          confidence: 0.98,
          source: 'data-resolver'
        };
      }
    }

    // Default to matches resolution if data contains matches
    if (!Array.isArray(data.matches)) return null;
    let matches = data.matches;

    // Filter by year or season
    if (year) {
      matches = matches.filter(m => String(m.year) === String(year) || (m.date && m.date.startsWith(String(year))));
    }
    if (season) {
      matches = matches.filter(m => m.season === season);
    }

    // ★ FIX 4: Exact Team Matching with Aliases
    const normalizedTeams = teams.map(t => this.normalizeTeamName(t));
    if (normalizedTeams.length >= 2) {
      const team1 = normalizedTeams[0];
      const team2 = normalizedTeams[1];
      
      const exactMatches = matches.filter(m => {
        const home = this.normalizeTeamName(m.home_team);
        const away = this.normalizeTeamName(m.away_team);
        return (home === team1 && away === team2) || (home === team2 && away === team1);
      });
      
      if (exactMatches.length > 0) {
        matches = exactMatches;
      } else {
        matches = matches.filter(m => {
          const home = this.normalizeTeamName(m.home_team);
          const away = this.normalizeTeamName(m.away_team);
          return normalizedTeams.some(t => t === home || t === away);
        });
      }
    } else if (normalizedTeams.length === 1) {
      const team = normalizedTeams[0];
      matches = matches.filter(m => {
        const home = this.normalizeTeamName(m.home_team);
        const away = this.normalizeTeamName(m.away_team);
        return home === team || away === team;
      });
    }

    if (matches.length === 0) {
      return {
        type: 'historical_data_not_found',
        queryType,
        dataset: { id: dataset.id, path: dataset.path, type: dataset.type },
        data: { query: { teams, year, season } },
        confidence: 0.80,
        source: 'data-resolver'
      };
    }

    // ★ FIX 7 & 8: Aggregations (Summary & H2H)
    if (queryType === 'summary' && normalizedTeams.length === 1) {
      const summary = this.calculateTeamSummary(matches, teams[0]);
      return {
        type: 'historical_summary',
        queryType,
        dataset: { id: dataset.id, path: dataset.path, type: dataset.type },
        data: { summary },
        confidence: 0.95,
        source: 'data-resolver'
      };
    }

    if (queryType === 'h2h' && normalizedTeams.length === 2) {
      const h2h = this.calculateHeadToHead(matches, teams[0], teams[1]);
      return {
        type: 'historical_h2h',
        queryType,
        dataset: { id: dataset.id, path: dataset.path, type: dataset.type },
        data: { h2h },
        confidence: 0.95,
        source: 'data-resolver'
      };
    }

    // ★ FIX 6 & 9: Structured result with limit/pagination
    const limitedMatches = matches.slice(0, limit);
    return {
      type: 'historical_matches',
      queryType,
      dataset: { id: dataset.id, path: dataset.path, type: dataset.type },
      data: {
        total: matches.length,
        returned: limitedMatches.length,
        matches: limitedMatches
      },
      metadata: {
        filteredByYear: Boolean(year),
        filteredByTeams: normalizedTeams.length > 0,
        generatedAt: Date.now()
      },
      confidence: 0.95,
      source: 'data-resolver'
    };
  }

  /* ============================================================
     QUERY CLASSIFICATION & HELPERS
  ============================================================ */

  // ★ FIX 3: Add query classification
  detectQueryType(message) {
    const msg = message.toLowerCase();

    if (/\b(who won|winner|champion|champions)\b/i.test(msg)) return 'winner';
    if (/\b(top scorer|top goalscorer|golden boot|most goals)\b/i.test(msg)) return 'top_scorer';
    if (/\b(standings|table|position|rank)\b/i.test(msg)) return 'standings';
    if (/\b(record|records|most|highest|lowest|all time)\b/i.test(msg)) return 'records';
    if (/\b(elo|rating|ratings)\b/i.test(msg)) return 'elo';
    if (/\b(manager|coach|managed|coached)\b/i.test(msg)) return 'manager';
    if (/\b(performance|how.*do|summary|stats|statistics)\b/i.test(msg)) return 'summary';
    if (/\b(player|goals|assists|appearances)\b/i.test(msg)) return 'player_statistics';
    if (/\b(head to head|h2h)\b/i.test(msg)) return 'h2h';
    if (/\b(match|matches|score|result|results|vs|versus)\b/i.test(msg)) return 'matches';

    return 'general';
  }

  // ★ FIX 4: Exact team matching with aliases
  normalizeTeamName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/\b(fc|cf|sc|afc|club)\b/g, '')
      .replace(/\b(united)\b/g, 'utd')
      .replace(/\s+/g, ' ')
      .trim();
  }

  findYear(entities) {
    const yearEntity = entities.find(e => e.type === 'year');
    return yearEntity ? yearEntity.value : null;
  }

  // ★ FIX 5: Add proper date/season filter
  findSeason(message) {
    const seasonMatch = message.match(/\b(19\d{2}|20\d{2})\s*[\/-]\s*(\d{2,4})\b/);
    if (seasonMatch) {
      return `${seasonMatch[1]}/${seasonMatch[2]}`;
    }
    return null;
  }

  findDataset(msg, entities, queryType) {
    const isMatchQuery = queryType === 'matches' || entities.some(e => e.type === 'team') || /\b(match|score|beat|result|vs|versus|play)\b/i.test(msg);
    if (!isMatchQuery && queryType === 'general') return null;

    const competitionEntity = entities.find(e => e.type === 'competition');
    const competitionValue = competitionEntity ? competitionEntity.value.toLowerCase().replace(/\s+/g, '_') : '';

    let bestMatch = null;

    for (const ds of this.registry) {
      const folderName = ds.path.split('/')[0];
      const folderNameReadable = folderName.replace(/_/g, ' ');

      if (competitionValue && folderName.includes(competitionValue)) {
        return ds;
      }
      
      if (msg.includes(folderNameReadable)) {
        return ds;
      }
      
      for (const alias of ds.aliases) {
        if (alias.length > 3 && msg.includes(alias)) {
          if (!bestMatch) bestMatch = ds;
          if (alias === 'world cup' && folderName === 'world_cup') {
            return ds;
          }
        }
      }
    }
    
    return bestMatch;
  }

  /* ============================================================
     AGGREGATIONS
  ============================================================ */

  // ★ FIX 7: Add aggregation
  calculateTeamSummary(matches, team) {
    const normalizedTeam = this.normalizeTeamName(team);
    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;

    for (const match of matches) {
      const home = this.normalizeTeamName(match.home_team);
      const away = this.normalizeTeamName(match.away_team);
      const homeScore = Number(match.home_score ?? match.score?.ft?.home);
      const awayScore = Number(match.away_score ?? match.score?.ft?.away);

      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

      if (home === normalizedTeam) {
        goalsFor += homeScore;
        goalsAgainst += awayScore;
        if (homeScore > awayScore) wins++;
        else if (homeScore === awayScore) draws++;
        else losses++;
      } else if (away === normalizedTeam) {
        goalsFor += awayScore;
        goalsAgainst += homeScore;
        if (awayScore > homeScore) wins++;
        else if (awayScore === homeScore) draws++;
        else losses++;
      }
    }

    const total = wins + draws + losses;
    return {
      team,
      matches: total,
      wins, draws, losses,
      goalsFor, goalsAgainst,
      winRate: total ? Number(((wins / total) * 100).toFixed(2)) : 0
    };
  }

  // ★ FIX 8: Add head-to-head calculation
  calculateHeadToHead(matches, team1, team2) {
    const norm1 = this.normalizeTeamName(team1);
    const norm2 = this.normalizeTeamName(team2);
    
    let t1Wins = 0, t2Wins = 0, draws = 0, t1Goals = 0, t2Goals = 0;
    const h2hMatches = [];

    for (const match of matches) {
      const home = this.normalizeTeamName(match.home_team);
      const away = this.normalizeTeamName(match.away_team);
      
      if ((home === norm1 && away === norm2) || (home === norm2 && away === norm1)) {
        h2hMatches.push(match);
        const homeScore = Number(match.home_score ?? match.score?.ft?.home);
        const awayScore = Number(match.away_score ?? match.score?.ft?.away);
        
        if (home === norm1) {
          t1Goals += homeScore;
          t2Goals += awayScore;
          if (homeScore > awayScore) t1Wins++;
          else if (homeScore === awayScore) draws++;
          else t2Wins++;
        } else {
          t1Goals += awayScore;
          t2Goals += homeScore;
          if (awayScore > homeScore) t1Wins++;
          else if (awayScore === homeScore) draws++;
          else t2Wins++;
        }
      }
    }

    return {
      team1, team2,
      matches: h2hMatches.length,
      team1Wins: t1Wins,
      team2Wins: t2Wins,
      draws,
      team1Goals: t1Goals,
      team2Goals: t2Goals
    };
  }
}

module.exports = new FootballDataResolver();