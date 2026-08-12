'use strict';

/**
 * ============================================================
 * KIM — PROFESSIONAL RESPONSE ENGINE
 * ============================================================
 * VERSION: 2.1.0
 *
 * Converts structured intelligence into natural KIM responses.
 * Strictly consumes contracts produced by ReasoningEngine or
 * FootballDataResolver.
 * ============================================================
 */

class ResponseEngine {
  constructor() {
    this.VERSION = '2.1.0';

    this.maxBullets = 7;
    this.maxSummaryLength = 900;

    this.openers = {
      analysis: ['Here’s what the numbers are saying.', 'Let’s break this one down properly.', 'The data gives us an interesting picture.', 'Alright, let’s look under the hood.'],
      comparison: ['Let’s put them side by side.', 'Here’s how they compare.', 'The numbers make this one interesting.', 'Let’s settle this with the data.'],
      prediction: ['Let’s look at the probabilities rather than guess.', 'Here’s the statistical picture.', 'The numbers lean one way, but football always keeps a few surprises.'],
      knowledge: ['Absolutely.', 'Here’s the football answer.', 'Good question.', 'Let’s clear that up.']
    };

    this.closers = [
      'That’s the statistical picture.',
      'Football can still ignore the spreadsheet, of course. 😂',
      'The numbers give us the edge; the match still has to be played.',
      'That’s where the evidence currently points.'
    ];
  }

  /* ==========================================================
     MAIN FORMATTER
  ========================================================== */

  format(input = {}) {
    const {
      response = '',
      intent = 'general',
      confidence = null,
      source = null,
      data = null,
      userMessage = '',
      memory = {},
      context = {},
      humor = null,
      mode = 'normal'
    } = input;

    // If another engine already produced a complete natural response, preserve it.
    if (typeof response === 'string' && response.trim()) {
      return this.clean(this.applyPersonalization(response, memory, context));
    }

    // Structured analytical data
    if (data) {
      return this.formatStructured(data, intent, { confidence, memory, context, mode });
    }

    // Absolute fallback
    return this.fallback(intent, userMessage);
  }

  /* ==========================================================
     STRUCTURED RESPONSE
  ========================================================== */

  formatStructured(data, intent, options = {}) {
    if (!data) return this.fallback(intent);

    switch (data.type) {
      case 'TEAM_ANALYSIS': return this.formatTeamAnalysis(data, options);
      case 'MATCHUP_ANALYSIS': return this.formatMatchup(data, options);
      case 'TEAM_COMPARISON': return this.formatComparison(data, options);
      case 'FORM_ANALYSIS': return this.formatForm(data, options);
      case 'KIM_STATISTICAL_ESTIMATE': return this.formatProbabilities(data, options);
      case 'MATCH_PROBABILITIES': return this.formatProbabilities(data, options); // Legacy alias support
      case 'historical_matches': return this.formatHistoricalMatches(data, options);
      case 'historical_record': return this.formatHistoricalRecord(data, options);
      case 'historical_h2h': return this.formatHistoricalH2H(data, options);
      default: return this.formatGeneric(data, options);
    }
  }

  /* ==========================================================
     HISTORICAL MATCH DATA (From FootballDataResolver)
  ========================================================== */

  formatHistoricalMatches(data, options = {}) {
    const matches = data.data?.matches || data.matches || [];
    if (matches.length === 0) return "I couldn't find any matching historical fixtures for that.";

    const m = matches[0];
    const hs = m.home_score ?? m.score?.ft?.home;
    const as = m.away_score ?? m.score?.ft?.away;
    
    let answer = `**${m.home_team} ${hs} - ${as} ${m.away_team}**\n`;
    answer += `Date: ${m.date || m.year || 'N/A'}\n`;
    if (m.tournament) answer += `Tournament: ${m.tournament}\n`;
    if (m.round) answer += `Round: ${m.round}\n`;

    if (Array.isArray(m.goals) && m.goals.length > 0) {
      const sortedGoals = [...m.goals].sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0));
      answer += `\n**Goalscorers:**\n`;
      sortedGoals.forEach(g => {
        answer += `• ${g.minute}' ${g.team} — ${g.scorer}${g.own_goal ? ' (OG)' : ''}${g.penalty ? ' (P)' : ''}\n`;
      });
    }

    if (data.data?.total > 1 || data.total > 1) {
      const total = data.data?.total || data.total;
      answer += `\n*Found ${total} matches total.*`;
    }

    return this.clean(answer);
  }

  formatHistoricalRecord(data, options = {}) {
    const t = data.data?.tournament || data.tournament;
    const field = data.data?.field || data.field;
    const value = data.data?.value || data.value;

    if (!t || !field || !value) return "I found the tournament record, but the data is incomplete.";
    
    const tournamentName = (data.dataset?.path || '').split('/')[0].replace(/_/g, ' ');
    return this.clean(`The ${t.year} ${tournamentName} ${field.replace(/_/g, ' ')} was **${value}**.`);
  }

  formatHistoricalH2H(data, options = {}) {
    const h2h = data.data?.h2h || data.h2h;
    if (!h2h) return "I couldn't find the head-to-head data.";
    
    let answer = `**Head-to-Head: ${h2h.team1} vs ${h2h.team2}**\n\n`;
    answer += `**Total Meetings:** ${h2h.matches}\n`;
    answer += `**${h2h.team1} Wins:** ${h2h.team1Wins}\n`;
    answer += `**${h2h.team2} Wins:** ${h2h.team2Wins}\n`;
    answer += `**Draws:** ${h2h.draws}\n`;
    answer += `\n**Goal Markets:**\n- Over 2.5: ${h2h.over_2_5_pct || 'N/A'}%\n- BTTS: ${h2h.btts_pct || 'N/A'}%\n`;
    
    return this.clean(answer);
  }

  /* ==========================================================
     TEAM ANALYSIS
  ========================================================== */

  formatTeamAnalysis(result, options = {}) {
    const team = result.team || 'The team';
    const metrics = result.metrics || {};
    const lines = [];

    lines.push(`**${team}** — statistical analysis`);

    if (result.summary) {
      lines.push('');
      lines.push(result.summary);
    }

    const metricLines = [];

    if (this.hasNumber(metrics.played)) metricLines.push(`Matches: **${metrics.played}**`);
    if (this.hasNumber(metrics.winRate)) metricLines.push(`Win rate: **${this.formatPercent(metrics.winRate)}**`);
    if (this.hasNumber(metrics.pointsPerGame)) metricLines.push(`Points per game: **${this.formatNumber(metrics.pointsPerGame)}**`);
    if (this.hasNumber(metrics.goalsPerGame)) metricLines.push(`Goals per game: **${this.formatNumber(metrics.goalsPerGame)}**`);
    if (this.hasNumber(metrics.concededPerGame)) metricLines.push(`Goals conceded/game: **${this.formatNumber(metrics.concededPerGame)}**`);

    if (metricLines.length) {
      lines.push('');
      lines.push(metricLines.join(' · '));
    }

    if (Array.isArray(result.insights) && result.insights.length) {
      lines.push('');
      lines.push('**Key signals**');
      result.insights.slice(0, this.maxBullets).forEach(insight => lines.push(`• ${insight}`));
    }

    if (Array.isArray(result.warnings) && result.warnings.length) {
      lines.push('');
      lines.push('⚠️ **Data note**');
      result.warnings.slice(0, 3).forEach(warning => lines.push(`• ${warning}`));
    }

    const confidence = this.getConfidence(result, options);
    if (this.hasNumber(confidence)) {
      lines.push('');
      lines.push(this.confidenceLine(confidence));
    }

    return this.clean(lines.join('\n'));
  }

  /* ==========================================================
     MATCHUP
  ========================================================== */

  formatMatchup(result, options = {}) {
    const home = result.homeTeam || 'Home';
    const away = result.awayTeam || 'Away';
    const lines = [];

    lines.push(`**${home} vs ${away}**`);

    if (result.summary) {
      lines.push('');
      lines.push(result.summary);
    }

    if (result.verdict) {
      lines.push('');
      lines.push(`**Verdict:** ${result.verdict}`);
    }

    const metrics = result.metrics || {};
    const metricLines = [];

    if (this.hasNumber(metrics.homeElo)) {
      metricLines.push(`Elo: ${home} **${this.formatNumber(metrics.homeElo, 0)}**`);
    }

    if (this.hasNumber(metrics.awayElo)) {
      metricLines.push(`${away} **${this.formatNumber(metrics.awayElo, 0)}**`);
    }

    if (this.hasNumber(metrics.homeWinRate) && this.hasNumber(metrics.awayWinRate)) {
      metricLines.push(`Win rates: ${home} **${this.formatPercent(metrics.homeWinRate)}** · ${away} **${this.formatPercent(metrics.awayWinRate)}**`);
    }

    if (metricLines.length) {
      lines.push('');
      lines.push(metricLines.join('\n'));
    }

    if (Array.isArray(result.signals) && result.signals.length) {
      lines.push('');
      lines.push('**Signals**');
      result.signals.slice(0, this.maxBullets).forEach(signal => {
        lines.push(`• ${this.describeSignal(signal)}`);
      });
    }

    const confidence = this.getConfidence(result, options);
    if (this.hasNumber(confidence)) {
      lines.push('');
      lines.push(this.confidenceLine(confidence));
    }

    return this.clean(lines.join('\n'));
  }

  /* ==========================================================
     COMPARISON
  ============================================================ */

  formatComparison(result, options = {}) {
    const teamA = result.teamA || 'Team A';
    const teamB = result.teamB || 'Team B';
    const lines = [];

    lines.push(`**${teamA} vs ${teamB} — comparison**`);

    if (result.verdict) {
      lines.push('');
      lines.push(`**Verdict:** ${result.verdict}`);
    }

    const advantages = result.advantages || {};
    const a = Array.isArray(advantages[teamA]) ? advantages[teamA] : [];
    const b = Array.isArray(advantages[teamB]) ? advantages[teamB] : [];

    if (a.length) {
      lines.push('');
      lines.push(`**${teamA} edge**`);
      a.slice(0, this.maxBullets).forEach(item => lines.push(`• ${this.humanize(item)}`));
    }

    if (b.length) {
      lines.push('');
      lines.push(`**${teamB} edge**`);
      b.slice(0, this.maxBullets).forEach(item => lines.push(`• ${this.humanize(item)}`));
    }

    if (Array.isArray(result.metrics) && result.metrics.length) {
      lines.push('');
      lines.push('**Key numbers**');
      result.metrics.slice(0, this.maxBullets).forEach(metric => {
        lines.push(`• ${metric.category}: ${this.formatMetricComparison(metric, teamA, teamB)}`);
      });
    }

    const confidence = this.getConfidence(result, options);
    if (this.hasNumber(confidence)) {
      lines.push('');
      lines.push(this.confidenceLine(confidence));
    }

    return this.clean(lines.join('\n'));
  }

  /* ==========================================================
     FORM
  ========================================================== */

  formatForm(result, options = {}) {
    const team = result.team || 'The team';
    const record = result.record || {};
    const streak = result.streak || {};
    const lines = [];

    lines.push(`**${team} — recent form**`);

    if (result.summary) {
      lines.push('');
      lines.push(result.summary);
    }

    if (this.hasNumber(record.total)) {
      lines.push('');
      lines.push(`Record: **${record.wins || 0}W · ${record.draws || 0}D · ${record.losses || 0}L**`);
    }

    if (streak.type && streak.length) {
      lines.push(`Current streak: **${streak.length} ${this.streakWord(streak.type)}**`);
    }

    if (this.hasNumber(result.weightedPoints)) {
      lines.push(`Weighted form score: **${this.formatPercent(result.weightedPoints)}**`);
    }

    const confidence = this.getConfidence(result, options);
    if (this.hasNumber(confidence)) {
      lines.push('');
      lines.push(this.confidenceLine(confidence));
    }

    return this.clean(lines.join('\n'));
  }

  /* ==========================================================
     PROBABILITIES
  ============================================================ */

  formatProbabilities(result, options = {}) {
    const p = result?.probabilities || result?.probability || result?.probs || result || {};

    const homeWin = p.homeWin ?? p.home ?? p.homeProbability;
    const draw = p.draw ?? p.drawProbability;
    const awayWin = p.awayWin ?? p.away ?? p.awayProbability;

    const lines = [
      '**Statistical probability estimate**',
      '',
      `🏠 Home win: **${this.formatPercent(homeWin)}**`,
      `🤝 Draw: **${this.formatPercent(draw)}**`,
      `✈️ Away win: **${this.formatPercent(awayWin)}**`
    ];

    const warning = result?.warning || result?.warnings?.[0] || options?.warning;

    if (warning) {
      lines.push('');
      lines.push(`⚠️ ${warning}`);
    }

    return this.clean(lines.join('\n'));
  }

  /* ==========================================================
     GENERIC STRUCTURED DATA
  ============================================================ */

  formatGeneric(data, options = {}) {
    if (typeof data === 'string') return this.clean(data);
    if (data.summary) return this.clean(data.summary);
    if (data.verdict) return this.clean(data.verdict);
    return this.fallback(options.intent || 'general');
  }

  /* ==========================================================
     PERSONALIZATION
  ============================================================ */

  applyPersonalization(response, memory, context = {}) {
    const safeMemory = memory || {};
    let result = String(response || '');

    if (safeMemory.name && !this.containsName(result, safeMemory.name)) {
      if (result.length < 350 && context.allowPersonalization !== false) {
        result = `${safeMemory.name}, ${result.charAt(0).toLowerCase()}${result.slice(1)}`;
      }
    }

    return result;
  }

  containsName(text, name) {
    if (!name) return false;
    return new RegExp(`\\b${this.escapeRegex(name)}\\b`, 'i').test(text);
  }

  /* ==========================================================
     CONFIDENCE & SIGNALS
  ============================================================ */

  getConfidence(result = {}, options = {}) {
    const candidates = [
      result?.confidence,
      result?.data?.confidence,
      result?.meta?.confidence,
      options?.confidence
    ];

    for (const value of candidates) {
      if (this.hasNumber(value)) {
        return value;
      }
    }

    return null;
  }

  confidenceLine(confidence) {
    const value = Number(confidence);
    if (!Number.isFinite(value)) return '';

    const percent = value <= 1 ? Math.round(value * 100) : Math.round(value);

    if (percent >= 85) return `Confidence: ${percent}% — strong evidence.`;
    if (percent >= 70) return `Confidence: ${percent}% — reasonably strong evidence.`;
    if (percent >= 50) return `Confidence: ${percent}% — moderate evidence.`;
    return `Confidence: ${percent}% — limited evidence, so take this cautiously.`;
  }

  describeSignal(signal = {}) {
    if (typeof signal === 'string') {
      return this.humanizeSignal(signal);
    }

    if (!signal || typeof signal !== 'object') {
      return 'Signal';
    }

    const rawType = signal.type ?? signal.name ?? signal.signal ?? signal.label ?? signal.category ?? 'Signal';
    const type = this.humanizeSignal(rawType);

    const winner = signal.winner ?? signal.favors ?? signal.team ?? signal.advantage ?? null;
    const strength = signal.strength ?? signal.confidence ?? signal.level ?? null;

    const parts = [type];

    if (winner) {
      parts.push(`favors **${winner}**`);
    }

    if (strength) {
      const strengthStr = String(strength).toLowerCase();
      if (['strong', 'moderate', 'weak'].includes(strengthStr)) {
        parts.push(`(${strengthStr})`);
      } else {
        parts.push(`(${this.humanize(strength)})`);
      }
    }

    return parts.join(' ');
  }

  /* ==========================================================
     METRIC COMPARISON
  ============================================================ */

  formatMetricComparison(metric, teamA, teamB) {
    const a = this.formatNumber(metric.teamA, 2);
    const b = this.formatNumber(metric.teamB, 2);

    if (metric.leader) {
      return `${teamA}: **${a}** · ${teamB}: **${b}** — edge: **${metric.leader}**`;
    }

    return `${teamA}: **${a}** · ${teamB}: **${b}**`;
  }

  formatMetricValue(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    if (value >= 0 && value <= 1) return value.toFixed(2);
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  /* ==========================================================
     HUMANIZATION
  ============================================================ */

  humanize(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  humanizeSignal(value) {
    const key = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');

    const aliases = {
      home_advantage: 'Home Advantage',
      home_form: 'Home Form',
      away_form: 'Away Form',
      goal_trend: 'Goal Trend',
      goals_trend: 'Goal Trend',
      recent_form: 'Recent Form',
      head_to_head: 'Head-to-Head',
      h2h: 'Head-to-Head',
      attacking_form: 'Attacking Form',
      defensive_form: 'Defensive Form',
      scoring_form: 'Scoring Form',
      defensive_strength: 'Defensive Strength',
      home_strength: 'Home Strength',
      away_strength: 'Away Strength'
    };

    return aliases[key] || this.humanize(value);
  }

  streakWord(type) {
    switch (String(type).toUpperCase()) {
      case 'W': return 'wins';
      case 'D': return 'draws';
      case 'L': return 'losses';
      default: return 'matches';
    }
  }

  /* ==========================================================
     FALLBACK
  ============================================================ */

  fallback(intent = 'general', message = '') {
    switch (intent) {
      case 'prediction': return `I can analyze the match, but I need the relevant teams or match data first.`;
      case 'team_form': return `Give me the team and I'll break down their recent form.`;
      case 'team_comparison': return `Give me the two teams and I'll compare them across the numbers.`;
      case 'match_analysis': return `Give me the matchup and I'll break down the important signals.`;
      case 'football_knowledge': return `Ask me the football question directly and I'll work through it.`;
      default: return `I'm with you. Tell me what you want to know and we'll figure it out. ⚽🧠`;
    }
  }

  /* ==========================================================
     CLEAN OUTPUT
  ============================================================ */

  clean(text) {
    let result = String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (result.length > this.maxSummaryLength) {
      result = result.slice(0, this.maxSummaryLength).trim();
      result += '…';
    }

    return result;
  }

  /* ==========================================================
     FORMAT HELPERS (STRICT & NULL-SAFE)
  ============================================================ */

  formatPercent(value) {
    if (value === null || value === undefined) return 'N/A';
    
    const n = Number(value);
    if (!Number.isFinite(n)) return 'N/A';

    const percent = n >= 0 && n <= 1 ? n * 100 : n;
    const rounded = Math.round(percent * 10) / 10;

    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
  }

  formatNumber(value, decimals = 2) {
    if (value === null || value === undefined) return 'N/A';
    
    const n = Number(value);
    if (!Number.isFinite(n)) return 'N/A';
    return n.toFixed(decimals);
  }

  hasNumber(value) {
    if (value === null || value === undefined || typeof value === 'boolean') {
      return false;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed !== '' && Number.isFinite(Number(trimmed));
    }

    return false;
  }

  escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* ==========================================================
     COMPOSE ALIAS
  ========================================================== */
  compose(input = {}) {
    return this.format(input);
  }
}

module.exports = new ResponseEngine();