'use strict';

/**
 * ============================================================
 * KIM — RESPONSE ENGINE MASTER TEST (PRO EDITION)
 * ============================================================
 *
 * Comprehensive validation for:
 *   - Structured Analytical Formatting (Team, Matchup, Comparison, Form, Probabilities)
 *   - Edge Cases & Malformed Data Handling
 *   - Confidence Resolution & Thresholds
 *   - Signal Humanization & Description
 *   - Metric Formatting & Comparisons
 *   - Output Cleaning, Limits, & Sanitization
 *
 * Run:
 *   node scripts/test-response-engine-master.js
 * ============================================================
 */

const ResponseEngine = require('../src/kim/ResponseEngine');

let passed = 0;
let failed = 0;
let total = 0;
const failures = [];

/* ============================================================
   TEST HELPERS
   ============================================================ */

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed++;
    failures.push({ name, error: error.message });
    console.log(`  ❌ ${name}`);
    console.log(`     ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, value, message) {
  assert(String(text).includes(value), message || `Expected output to contain: "${value}"`);
}

function assertNotIncludes(text, value, message) {
  assert(!String(text).includes(value), message || `Expected output NOT to contain: "${value}"`);
}

function assertType(value, type, message) {
  assert(typeof value === type, message || `Expected ${type}, received ${typeof value}`);
}

function assertString(value) {
  assertType(value, 'string');
  assert(value.trim().length > 0, 'Expected non-empty string');
}

/* ============================================================
   HEADER
   ============================================================ */

console.log('');
console.log('============================================================');
console.log(' KIM — RESPONSE ENGINE MASTER TEST (PRO EDITION)');
console.log('============================================================');
console.log('');
console.log(`Version: ${ResponseEngine.VERSION}`);
console.log(`Max bullets: ${ResponseEngine.maxBullets}`);
console.log(`Max summary length: ${ResponseEngine.maxSummaryLength}`);
console.log('');

/* ============================================================
   1. ENGINE INITIALIZATION
   ============================================================ */

console.log('1. ENGINE INITIALIZATION');
console.log('------------------------------------------------------------');

test('ResponseEngine is loaded', () => assert(ResponseEngine, 'ResponseEngine is undefined'));
test('ResponseEngine exposes format()', () => assert(typeof ResponseEngine.format === 'function', 'format() missing'));
test('ResponseEngine exposes compose()', () => assert(typeof ResponseEngine.compose === 'function', 'compose() missing'));
test('ResponseEngine exposes formatStructured()', () => assert(typeof ResponseEngine.formatStructured === 'function', 'formatStructured() missing'));
test('Engine version is defined', () => assertString(ResponseEngine.VERSION));

/* ============================================================
   2. BASIC FORMAT & FALLBACKS
   ============================================================ */

console.log('');
console.log('2. BASIC FORMAT & FALLBACKS');
console.log('------------------------------------------------------------');

test('Empty input returns fallback', () => {
  const result = ResponseEngine.format({});
  assertString(result);
  assertIncludes(result, '⚽🧠');
});

test('General fallback works', () => {
  const result = ResponseEngine.format({ intent: 'general' });
  assertIncludes(result, '⚽🧠');
});

test('Prediction fallback works', () => {
  const result = ResponseEngine.format({ intent: 'prediction' });
  assertIncludes(result, 'match');
});

test('Team form fallback works', () => {
  const result = ResponseEngine.format({ intent: 'team_form' });
  assertIncludes(result, 'recent form');
});

test('Comparison fallback works', () => {
  const result = ResponseEngine.format({ intent: 'team_comparison' });
  assertIncludes(result, 'two teams');
});

test('Match analysis fallback works', () => {
  const result = ResponseEngine.format({ intent: 'match_analysis' });
  assertIncludes(result, 'matchup');
});

test('Football knowledge fallback works', () => {
  const result = ResponseEngine.format({ intent: 'football_knowledge' });
  assertIncludes(result, 'football question');
});

/* ============================================================
   3. NATURAL RESPONSE PASSTHROUGH & CLEANING
   ============================================================ */

console.log('');
console.log('3. NATURAL RESPONSE PASSTHROUGH & CLEANING');
console.log('------------------------------------------------------------');

test('Existing natural response is preserved', () => {
  const response = 'Manchester United have been excellent recently.';
  const result = ResponseEngine.format({ response });
  assertIncludes(result, response);
});

test('Natural response is cleaned (CRLF)', () => {
  const result = ResponseEngine.format({ response: 'Hello   \r\n\r\n\r\n  football fans!   ' });
  assertString(result);
  assertNotIncludes(result, '\r');
  assertNotIncludes(result, '\n\n\n');
});

test('Natural response with null memory does not crash', () => {
  const result = ResponseEngine.format({ response: 'Hello', memory: null });
  assertString(result);
});

/* ============================================================
   4. TEAM ANALYSIS (Full Data)
   ============================================================ */

console.log('');
console.log('4. TEAM ANALYSIS (Full Data)');
console.log('------------------------------------------------------------');

const teamAnalysis = {
  type: 'TEAM_ANALYSIS',
  team: 'Manchester City',
  summary: 'Manchester City have produced strong attacking numbers across the sample.',
  metrics: {
    played: 20,
    winRate: 0.75,
    pointsPerGame: 2.35,
    goalsPerGame: 2.4,
    concededPerGame: 0.8
  },
  insights: ['Excellent attacking output', 'Strong possession profile', 'High chance creation', 'Consistent home performances'],
  warnings: ['Small sample size'],
  confidence: 0.88
};

test('TEAM_ANALYSIS renders team name', () => {
  const result = ResponseEngine.format({ data: teamAnalysis, intent: 'team_analysis' });
  assertIncludes(result, 'Manchester City');
});

test('TEAM_ANALYSIS renders summary', () => {
  const result = ResponseEngine.format({ data: teamAnalysis });
  assertIncludes(result, 'strong attacking numbers');
});

test('TEAM_ANALYSIS formats played', () => {
  const result = ResponseEngine.format({ data: teamAnalysis });
  assertIncludes(result, 'Matches: **20**');
});

test('TEAM_ANALYSIS formats win rate', () => {
  const result = ResponseEngine.format({ data: teamAnalysis });
  assertIncludes(result, 'Win rate: **75%**');
});

test('TEAM_ANALYSIS formats PPG', () => {
  const result = ResponseEngine.format({ data: teamAnalysis });
  assertIncludes(result, 'Points per game: **2.35**');
});

test('TEAM_ANALYSIS formats goals', () => {
  const result = ResponseEngine.format({ data: teamAnalysis });
  assertIncludes(result, 'Goals per game: **2.40**');
});

test('TEAM_ANALYSIS formats conceded', () => {
  const result = ResponseEngine.format({ data: teamAnalysis });
  assertIncludes(result, 'Goals conceded/game: **0.80**');
});

test('TEAM_ANALYSIS renders insights', () => {
  const result = ResponseEngine.format({ data: teamAnalysis });
  assertIncludes(result, '**Key signals**');
  assertIncludes(result, 'Excellent attacking output');
});

test('TEAM_ANALYSIS renders warnings', () => {
  const result = ResponseEngine.format({ data: teamAnalysis });
  assertIncludes(result, '⚠️ **Data note**');
  assertIncludes(result, 'Small sample size');
});

test('TEAM_ANALYSIS renders confidence (88%)', () => {
  const result = ResponseEngine.format({ data: teamAnalysis });
  assertIncludes(result, 'Confidence: 88%');
});

/* ============================================================
   5. TEAM ANALYSIS (Missing/Partial Data)
   ============================================================ */

console.log('');
console.log('5. TEAM ANALYSIS (Missing/Partial Data)');
console.log('------------------------------------------------------------');

test('Missing metrics does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_ANALYSIS', team: 'Test FC' } });
  assertString(result);
  assertIncludes(result, 'Test FC');
  assertNotIncludes(result, 'Matches:');
});

test('Missing insights does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_ANALYSIS', team: 'Test FC' } });
  assertString(result);
  assertNotIncludes(result, '**Key signals**');
});

test('Missing warnings does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_ANALYSIS', team: 'Test FC' } });
  assertString(result);
  assertNotIncludes(result, '⚠️ **Data note**');
});

test('Missing confidence does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_ANALYSIS', team: 'Test FC' } });
  assertString(result);
  assertNotIncludes(result, 'Confidence:');
});

test('Empty insights array does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_ANALYSIS', team: 'Test FC', insights: [] } });
  assertString(result);
  assertNotIncludes(result, '**Key signals**');
});

test('Confidence passed in options works', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_ANALYSIS', team: 'Test FC' }, confidence: 0.65 });
  assertIncludes(result, 'Confidence: 65%');
});

/* ============================================================
   6. MATCHUP ANALYSIS (Full Data)
   ============================================================ */

console.log('');
console.log('6. MATCHUP ANALYSIS (Full Data)');
console.log('------------------------------------------------------------');

const matchup = {
  type: 'MATCHUP_ANALYSIS',
  homeTeam: 'Arsenal',
  awayTeam: 'Liverpool',
  summary: 'Arsenal hold a slight statistical advantage at home.',
  verdict: 'Arsenal have the stronger overall profile.',
  metrics: {
    homeElo: 1875,
    awayElo: 1840,
    homeWinRate: 0.68,
    awayWinRate: 0.61
  },
  signals: [
    { type: 'HOME_FORM', winner: 'Arsenal', strength: 'strong' },
    { type: 'ATTACK', winner: 'Liverpool', strength: 'moderate' }
  ],
  confidence: 0.76
};

test('MATCHUP renders both teams', () => {
  const result = ResponseEngine.format({ data: matchup });
  assertIncludes(result, 'Arsenal vs Liverpool');
});

test('MATCHUP renders verdict', () => {
  const result = ResponseEngine.format({ data: matchup });
  assertIncludes(result, '**Verdict:**');
  assertIncludes(result, 'Arsenal have the stronger overall profile.');
});

test('MATCHUP renders Elo', () => {
  const result = ResponseEngine.format({ data: matchup });
  assertIncludes(result, 'Elo: Arsenal **1875**');
  assertIncludes(result, 'Liverpool **1840**');
});

test('MATCHUP renders win rates', () => {
  const result = ResponseEngine.format({ data: matchup });
  assertIncludes(result, 'Win rates: Arsenal **68%** · Liverpool **61%**');
});

test('MATCHUP renders signals', () => {
  const result = ResponseEngine.format({ data: matchup });
  assertIncludes(result, '**Signals**');
  assertIncludes(result, 'Home Form favors **Arsenal** (strong)');
  assertIncludes(result, 'Attack favors **Liverpool** (moderate)');
});

test('MATCHUP renders confidence (76%)', () => {
  const result = ResponseEngine.format({ data: matchup });
  assertIncludes(result, 'Confidence: 76%');
});

/* ============================================================
   7. MATCHUP ANALYSIS (Missing/Partial Data)
   ============================================================ */

console.log('');
console.log('7. MATCHUP ANALYSIS (Missing/Partial Data)');
console.log('------------------------------------------------------------');

test('Missing summary does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'MATCHUP_ANALYSIS', homeTeam: 'A', awayTeam: 'B' } });
  assertString(result);
  assertIncludes(result, 'A vs B');
});

test('Missing verdict does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'MATCHUP_ANALYSIS', homeTeam: 'A', awayTeam: 'B' } });
  assertString(result);
  assertNotIncludes(result, '**Verdict:**');
});

test('Missing metrics does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'MATCHUP_ANALYSIS', homeTeam: 'A', awayTeam: 'B' } });
  assertString(result);
  assertNotIncludes(result, 'Elo:');
});

test('Missing signals does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'MATCHUP_ANALYSIS', homeTeam: 'A', awayTeam: 'B' } });
  assertString(result);
  assertNotIncludes(result, '**Signals**');
});

test('Null signals does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'MATCHUP_ANALYSIS', homeTeam: 'A', awayTeam: 'B', signals: null } });
  assertString(result);
});

/* ============================================================
   8. TEAM COMPARISON (Full Data)
   ============================================================ */

console.log('');
console.log('8. TEAM COMPARISON (Full Data)');
console.log('------------------------------------------------------------');

const comparison = {
  type: 'TEAM_COMPARISON',
  teamA: 'Barcelona',
  teamB: 'Real Madrid',
  verdict: 'Real Madrid have the stronger overall statistical profile.',
  advantages: {
    Barcelona: ['Possession', 'Chance creation', 'Home form'],
    'Real Madrid': ['Transition attack', 'Defensive efficiency', 'Away results']
  },
  metrics: [
    { category: 'Goals per game', teamA: 2.3, teamB: 2.5, leader: 'Real Madrid' },
    { category: 'Points per game', teamA: 2.1, teamB: 2.4, leader: 'Real Madrid' }
  ],
  confidence: 0.81
};

test('COMPARISON renders both teams', () => {
  const result = ResponseEngine.format({ data: comparison });
  assertIncludes(result, 'Barcelona vs Real Madrid — comparison');
});

test('COMPARISON renders verdict', () => {
  const result = ResponseEngine.format({ data: comparison });
  assertIncludes(result, '**Verdict:** Real Madrid have the stronger');
});

test('COMPARISON renders Team A advantages', () => {
  const result = ResponseEngine.format({ data: comparison });
  assertIncludes(result, '**Barcelona edge**');
  assertIncludes(result, '• Possession');
});

test('COMPARISON renders Team B advantages', () => {
  const result = ResponseEngine.format({ data: comparison });
  assertIncludes(result, '**Real Madrid edge**');
  assertIncludes(result, '• Transition Attack');
});

test('COMPARISON renders metrics', () => {
  const result = ResponseEngine.format({ data: comparison });
  assertIncludes(result, '**Key numbers**');
  assertIncludes(result, 'Goals per game: Barcelona: **2.30** · Real Madrid: **2.50** — edge: **Real Madrid**');
});

test('COMPARISON renders confidence (81%)', () => {
  const result = ResponseEngine.format({ data: comparison });
  assertIncludes(result, 'Confidence: 81%');
});

/* ============================================================
   9. TEAM COMPARISON (Missing/Partial Data)
   ============================================================ */

console.log('');
console.log('9. TEAM COMPARISON (Missing/Partial Data)');
console.log('------------------------------------------------------------');

test('Missing advantages does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_COMPARISON', teamA: 'A', teamB: 'B' } });
  assertString(result);
  assertNotIncludes(result, 'edge');
});

test('Missing metrics does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_COMPARISON', teamA: 'A', teamB: 'B' } });
  assertString(result);
  assertNotIncludes(result, '**Key numbers**');
});

test('Metric without leader does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_COMPARISON', teamA: 'A', teamB: 'B', metrics: [{ category: 'Test', teamA: 1, teamB: 2 }] } });
  assertString(result);
  assertIncludes(result, 'Test: A: **1.00** · B: **2.00**');
  assertNotIncludes(result, 'edge:');
});

/* ============================================================
   10. FORM ANALYSIS (Full Data)
   ============================================================ */

console.log('');
console.log('10. FORM ANALYSIS (Full Data)');
console.log('------------------------------------------------------------');

const form = {
  type: 'FORM_ANALYSIS',
  team: 'Chelsea',
  summary: 'Chelsea have been inconsistent but are showing signs of improvement.',
  record: { total: 10, wins: 5, draws: 3, losses: 2 },
  streak: { type: 'W', length: 3 },
  weightedPoints: 0.72,
  confidence: 0.74
};

test('FORM renders team', () => {
  const result = ResponseEngine.format({ data: form });
  assertIncludes(result, 'Chelsea — recent form');
});

test('FORM renders record', () => {
  const result = ResponseEngine.format({ data: form });
  assertIncludes(result, 'Record: **5W · 3D · 2L**');
});

test('FORM renders winning streak', () => {
  const result = ResponseEngine.format({ data: form });
  assertIncludes(result, 'Current streak: **3 wins**');
});

test('FORM renders weighted score', () => {
  const result = ResponseEngine.format({ data: form });
  assertIncludes(result, 'Weighted form score: **72%**');
});

test('FORM renders confidence (74%)', () => {
  const result = ResponseEngine.format({ data: form });
  assertIncludes(result, 'Confidence: 74%');
});

/* ============================================================
   11. FORM ANALYSIS (Missing/Partial Data)
   ============================================================ */

console.log('');
console.log('11. FORM ANALYSIS (Missing/Partial Data)');
console.log('------------------------------------------------------------');

test('Missing record does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'FORM_ANALYSIS', team: 'Test FC' } });
  assertString(result);
  assertNotIncludes(result, 'Record:');
});

test('Missing streak does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'FORM_ANALYSIS', team: 'Test FC' } });
  assertString(result);
  assertNotIncludes(result, 'Current streak:');
});

test('Streak with zero length does not render', () => {
  const result = ResponseEngine.format({ data: { type: 'FORM_ANALYSIS', team: 'Test FC', streak: { type: 'W', length: 0 } } });
  assertString(result);
  assertNotIncludes(result, 'Current streak:');
});

test('Missing weightedPoints does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'FORM_ANALYSIS', team: 'Test FC' } });
  assertString(result);
  assertNotIncludes(result, 'Weighted form score:');
});

/* ============================================================
   12. MATCH PROBABILITIES (Full Data)
   ============================================================ */

console.log('');
console.log('12. MATCH PROBABILITIES (Full Data)');
console.log('------------------------------------------------------------');

const probabilities = {
  type: 'MATCH_PROBABILITIES',
  probabilities: { homeWin: 0.52, draw: 0.27, awayWin: 0.21 },
  warning: 'Probabilities are estimates, not guarantees.'
};

test('PROBABILITIES render title', () => {
  const result = ResponseEngine.format({ data: probabilities });
  assertIncludes(result, '**Statistical probability estimate**');
});

test('PROBABILITIES render home win', () => {
  const result = ResponseEngine.format({ data: probabilities });
  assertIncludes(result, '🏠 Home win: **52%**');
});

test('PROBABILITIES render draw', () => {
  const result = ResponseEngine.format({ data: probabilities });
  assertIncludes(result, '🤝 Draw: **27%**');
});

test('PROBABILITIES render away win', () => {
  const result = ResponseEngine.format({ data: probabilities });
  assertIncludes(result, '✈️ Away win: **21%**');
});

test('PROBABILITIES render warning', () => {
  const result = ResponseEngine.format({ data: probabilities });
  assertIncludes(result, '⚠️ Probabilities are estimates');
});

/* ============================================================
   13. MATCH PROBABILITIES (Missing/Partial Data)
   ============================================================ */

console.log('');
console.log('13. MATCH PROBABILITIES (Missing/Partial Data)');
console.log('------------------------------------------------------------');

test('Missing warning does not crash', () => {
  const result = ResponseEngine.format({ data: { type: 'MATCH_PROBABILITIES', probabilities: { homeWin: 0.5, draw: 0.3, awayWin: 0.2 } } });
  assertString(result);
  assertNotIncludes(result, '⚠️');
});

test('Invalid probability data renders N/A', () => {
  const result = ResponseEngine.format({ data: { type: 'MATCH_PROBABILITIES', probabilities: { homeWin: 'abc', draw: null, awayWin: undefined } } });
  assertString(result);
  assertIncludes(result, '🏠 Home win: **N/A**');
  assertIncludes(result, '🤝 Draw: **N/A**');
  assertIncludes(result, '✈️ Away win: **N/A**');
});

test('Flat probability object works', () => {
  const result = ResponseEngine.format({ data: { type: 'MATCH_PROBABILITIES', homeWin: 0.4, draw: 0.3, awayWin: 0.3 } });
  assertIncludes(result, '🏠 Home win: **40%**');
});

/* ============================================================
   14. GENERIC STRUCTURED DATA
   ============================================================ */

console.log('');
console.log('14. GENERIC STRUCTURED DATA');
console.log('------------------------------------------------------------');

test('Generic summary works', () => {
  const result = ResponseEngine.format({ data: { type: 'UNKNOWN', summary: 'This is a generic football summary.' } });
  assertIncludes(result, 'generic football summary');
});

test('Generic verdict works', () => {
  const result = ResponseEngine.format({ data: { type: 'UNKNOWN', verdict: 'Team A has the statistical edge.' } });
  assertIncludes(result, 'Team A has the statistical edge');
});

test('Generic string data works', () => {
  const result = ResponseEngine.format({ data: 'Football is unpredictable.' });
  assertIncludes(result, 'Football is unpredictable.');
});

test('Generic empty object returns fallback', () => {
  const result = ResponseEngine.format({ data: {} });
  assertString(result);
  assertIncludes(result, '⚽🧠');
});

/* ============================================================
   15. PERSONALIZATION
   ============================================================ */

console.log('');
console.log('15. PERSONALIZATION');
console.log('------------------------------------------------------------');

test('Personalization does not crash', () => {
  const result = ResponseEngine.applyPersonalization('Let us analyze this match.', { name: 'Kim' });
  assertString(result);
  assertIncludes(result, 'Kim, let us analyze this match.');
});

test('Existing name is not duplicated', () => {
  const result = ResponseEngine.applyPersonalization('Kim, this is an interesting match.', { name: 'Kim' });
  assert(result.match(/Kim/gi).length === 1, 'Name was duplicated');
});

test('Missing name does not alter response', () => {
  const input = 'This is a football analysis.';
  const result = ResponseEngine.applyPersonalization(input, {});
  assert(result === input, 'Response unexpectedly changed');
});

test('Long response is not personalized', () => {
  const longText = 'This is a very long analytical response that exceeds the character limit for personalization. '.repeat(10);
  const result = ResponseEngine.applyPersonalization(longText, { name: 'Kim' });
  assert(!result.startsWith('Kim,'), 'Long response was unexpectedly personalized');
});

test('Personalization disabled in context', () => {
  const result = ResponseEngine.applyPersonalization('Let us analyze this match.', { name: 'Kim' }, { allowPersonalization: false });
  assert(result === 'Let us analyze this match.', 'Response was personalized despite context flag');
});

/* ============================================================
   16. CONFIDENCE RESOLUTION & THRESHOLDS
   ============================================================ */

console.log('');
console.log('16. CONFIDENCE RESOLUTION & THRESHOLDS');
console.log('------------------------------------------------------------');

test('Confidence 0.90 => 90% (strong)', () => {
  const result = ResponseEngine.confidenceLine(0.90);
  assertIncludes(result, '90%');
  assertIncludes(result, 'strong evidence');
});

test('Confidence 0.85 => 85% (boundary strong)', () => {
  const result = ResponseEngine.confidenceLine(0.85);
  assertIncludes(result, '85%');
  assertIncludes(result, 'strong evidence');
});

test('Confidence 0.84 => 84% (reasonably strong)', () => {
  const result = ResponseEngine.confidenceLine(0.84);
  assertIncludes(result, '84%');
  assertIncludes(result, 'reasonably strong evidence');
});

test('Confidence 0.70 => 70% (boundary reasonably strong)', () => {
  const result = ResponseEngine.confidenceLine(0.70);
  assertIncludes(result, '70%');
  assertIncludes(result, 'reasonably strong evidence');
});

test('Confidence 0.69 => 69% (moderate)', () => {
  const result = ResponseEngine.confidenceLine(0.69);
  assertIncludes(result, '69%');
  assertIncludes(result, 'moderate evidence');
});

test('Confidence 0.50 => 50% (boundary moderate)', () => {
  const result = ResponseEngine.confidenceLine(0.50);
  assertIncludes(result, '50%');
  assertIncludes(result, 'moderate evidence');
});

test('Confidence 0.49 => 49% (limited)', () => {
  const result = ResponseEngine.confidenceLine(0.49);
  assertIncludes(result, '49%');
  assertIncludes(result, 'limited evidence');
});

test('Confidence 85 => 85% (integer support)', () => {
  const result = ResponseEngine.confidenceLine(85);
  assertIncludes(result, '85%');
});

test('Invalid confidence returns empty string', () => {
  const result = ResponseEngine.confidenceLine('invalid');
  assert(result === '', 'Invalid confidence should return empty string');
});

test('getConfidence resolves from result', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_ANALYSIS', team: 'T', confidence: 0.95 } });
  assertIncludes(result, 'Confidence: 95%');
});

test('getConfidence resolves from options', () => {
  const result = ResponseEngine.format({ data: { type: 'TEAM_ANALYSIS', team: 'T' }, confidence: 0.65 });
  assertIncludes(result, 'Confidence: 65%');
});

/* ============================================================
   17. SIGNAL DESCRIPTION & HUMANIZATION
   ============================================================ */

console.log('');
console.log('17. SIGNAL DESCRIPTION & HUMANIZATION');
console.log('------------------------------------------------------------');

test('Signal with winner and strength works', () => {
  const result = ResponseEngine.describeSignal({ type: 'HOME_ADVANTAGE', winner: 'Arsenal', strength: 'strong' });
  assertIncludes(result, 'Home Advantage favors **Arsenal** (strong)');
});

test('Signal with winner, no strength works', () => {
  const result = ResponseEngine.describeSignal({ type: 'HOME_ADVANTAGE', winner: 'Arsenal' });
  assertIncludes(result, 'Home Advantage favors **Arsenal**');
  assertNotIncludes(result, '(');
});

test('Signal without winner works', () => {
  const result = ResponseEngine.describeSignal({ type: 'GOAL_TREND' });
  assertIncludes(result, 'Goal Trend');
  assertNotIncludes(result, 'favors');
});

test('Signal string input works', () => {
  const result = ResponseEngine.describeSignal('home_advantage');
  assertIncludes(result, 'Home Advantage');
});

test('humanizeSignal maps specific aliases', () => {
  assert(ResponseEngine.humanizeSignal('home_advantage') === 'Home Advantage');
  assert(ResponseEngine.humanizeSignal('home_form') === 'Home Form');
  assert(ResponseEngine.humanizeSignal('goal_trend') === 'Goal Trend');
  assert(ResponseEngine.humanizeSignal('h2h') === 'Head-to-Head');
});

test('humanizeSignal falls back to humanize', () => {
  assert(ResponseEngine.humanizeSignal('unknown_signal') === 'Unknown Signal');
});

/* ============================================================
   18. METRIC COMPARISON & VALUES
   ============================================================ */

console.log('');
console.log('18. METRIC COMPARISON & VALUES');
console.log('------------------------------------------------------------');

test('formatMetricComparison with leader', () => {
  const result = ResponseEngine.formatMetricComparison({ teamA: 1.5, teamB: 2.0, leader: 'B' }, 'A', 'B');
  assertIncludes(result, 'A: **1.50** · B: **2.00** — edge: **B**');
});

test('formatMetricComparison without leader', () => {
  const result = ResponseEngine.formatMetricComparison({ teamA: 1.5, teamB: 2.0 }, 'A', 'B');
  assertIncludes(result, 'A: **1.50** · B: **2.00**');
  assertNotIncludes(result, 'edge:');
});

test('formatMetricValue handles non-numbers', () => {
  assert(ResponseEngine.formatMetricValue('abc') === 'N/A');
  assert(ResponseEngine.formatMetricValue(null) === 'N/A');
  assert(ResponseEngine.formatMetricValue(undefined) === 'N/A');
});

test('formatMetricValue handles integers', () => {
  assert(ResponseEngine.formatMetricValue(10) === '10');
});

test('formatMetricValue handles decimals', () => {
  assert(ResponseEngine.formatMetricValue(1.234) === '1.23');
});

/* ============================================================
   19. HUMANIZATION & STREAKS
   ============================================================ */

console.log('');
console.log('19. HUMANIZATION & STREAKS');
console.log('------------------------------------------------------------');

test('humanize converts snake_case', () => {
  assert(ResponseEngine.humanize('home_form') === 'Home Form');
});

test('humanize converts kebab-case', () => {
  assert(ResponseEngine.humanize('away-form') === 'Away Form');
});

test('humanize handles null input', () => {
  assert(ResponseEngine.humanize(null) === '');
});

test('humanize handles empty string', () => {
  assert(ResponseEngine.humanize('') === '');
});

test('W streak becomes wins', () => assert(ResponseEngine.streakWord('W') === 'wins'));
test('D streak becomes draws', () => assert(ResponseEngine.streakWord('D') === 'draws'));
test('L streak becomes losses', () => assert(ResponseEngine.streakWord('L') === 'losses'));
test('Unknown streak becomes matches', () => assert(ResponseEngine.streakWord('X') === 'matches'));

/* ============================================================
   20. FORMAT HELPERS (Comprehensive Edge Cases)
   ============================================================ */

console.log('');
console.log('20. FORMAT HELPERS (Comprehensive Edge Cases)');
console.log('------------------------------------------------------------');

test('formatPercent handles decimal (0.65)', () => assert(ResponseEngine.formatPercent(0.65) === '65%'));
test('formatPercent handles whole percentage (65)', () => assert(ResponseEngine.formatPercent(65) === '65%'));
test('formatPercent handles decimal percentage (0.655)', () => assert(ResponseEngine.formatPercent(0.655) === '65.5%'));
test('formatPercent handles zero (0)', () => assert(ResponseEngine.formatPercent(0) === '0%'));
test('formatPercent handles invalid string', () => assert(ResponseEngine.formatPercent('abc') === 'N/A'));
test('formatPercent handles null', () => assert(ResponseEngine.formatPercent(null) === 'N/A'));
test('formatPercent handles undefined', () => assert(ResponseEngine.formatPercent(undefined) === 'N/A'));

test('formatNumber works (2.345)', () => assert(ResponseEngine.formatNumber(2.345) === '2.35'));
test('formatNumber handles integers (100, 0)', () => assert(ResponseEngine.formatNumber(100, 0) === '100'));
test('formatNumber handles invalid string', () => assert(ResponseEngine.formatNumber('abc') === 'N/A'));
test('formatNumber handles null', () => assert(ResponseEngine.formatNumber(null) === 'N/A'));
test('formatNumber handles negative', () => assert(ResponseEngine.formatNumber(-1.5) === '-1.50'));

test('hasNumber detects numbers (10)', () => assert(ResponseEngine.hasNumber(10) === true));
test('hasNumber detects numeric strings ("10")', () => assert(ResponseEngine.hasNumber('10') === true));
test('hasNumber rejects invalid strings ("abc")', () => assert(ResponseEngine.hasNumber('abc') === false));
test('hasNumber rejects null', () => assert(ResponseEngine.hasNumber(null) === false));
test('hasNumber rejects undefined', () => assert(ResponseEngine.hasNumber(undefined) === false));
test('hasNumber rejects true', () => assert(ResponseEngine.hasNumber(true) === false));

/* ============================================================
   21. OUTPUT LIMITS & CLEANING
   ============================================================ */

console.log('');
console.log('21. OUTPUT LIMITS & CLEANING');
console.log('------------------------------------------------------------');

test('Maximum bullets are respected', () => {
  const insights = Array.from({ length: 20 }, (_, i) => `Insight ${i + 1}`);
  const result = ResponseEngine.format({ data: { type: 'TEAM_ANALYSIS', team: 'Test FC', insights } });
  const bulletCount = result.split('\n').filter(line => line.startsWith('• ')).length;
  assert(bulletCount <= ResponseEngine.maxBullets, `Too many bullets: ${bulletCount}`);
});

test('Long responses are truncated', () => {
  const huge = 'A'.repeat(2000);
  const result = ResponseEngine.clean(huge);
  assert(result.length <= ResponseEngine.maxSummaryLength + 1, `Output too long: ${result.length}`);
  assertIncludes(result, '…');
});

test('CRLF is normalized', () => {
  const result = ResponseEngine.clean('Hello\r\nWorld');
  assertNotIncludes(result, '\r');
});

test('Excessive blank lines are removed', () => {
  const result = ResponseEngine.clean('One\n\n\n\n\nTwo');
  assert(!result.includes('\n\n\n'), 'Excessive blank lines remain');
});

test('Trailing whitespace is removed', () => {
  const result = ResponseEngine.clean('Hello   \nWorld   ');
  assert(!result.includes('   \n'), 'Trailing whitespace remains');
});

test('Empty string cleaning returns empty', () => {
  const result = ResponseEngine.clean('');
  assert(result === '', 'Expected empty string');
});

test('Null cleaning returns empty', () => {
  const result = ResponseEngine.clean(null);
  assert(result === '', 'Expected empty string');
});

/* ============================================================
   22. MALFORMED DATA / EDGE CASES
   ============================================================ */

console.log('');
console.log('22. MALFORMED DATA / EDGE CASES');
console.log('------------------------------------------------------------');

test('Null data does not crash', () => {
  const result = ResponseEngine.format({ data: null });
  assertString(result);
});

test('Empty object does not crash', () => {
  const result = ResponseEngine.format({ data: {} });
  assertString(result);
});

test('Array data does not crash', () => {
  const result = ResponseEngine.format({ data: [] });
  assertString(result);
});

test('String data does not crash', () => {
  const result = ResponseEngine.format({ data: 'Just a string' });
  assertIncludes(result, 'Just a string');
});

/* ============================================================
   23. COMPOSE ALIAS
   ============================================================ */

console.log('');
console.log('23. COMPOSE ALIAS');
console.log('------------------------------------------------------------');

test('compose() behaves like format()', () => {
  const input = { response: 'ZOKASCORE knows football.' };
  const a = ResponseEngine.format(input);
  const b = ResponseEngine.compose(input);
  assert(a === b, 'compose() differs from format()');
});

/* ============================================================
   24. REALISTIC KIM SCENARIOS
   ============================================================ */

console.log('');
console.log('24. REALISTIC KIM SCENARIOS');
console.log('------------------------------------------------------------');

test('Realistic Arsenal vs Liverpool analysis', () => {
  const result = ResponseEngine.format({
    intent: 'match_analysis',
    userMessage: 'Who has the advantage between Arsenal and Liverpool?',
    data: {
      type: 'MATCHUP_ANALYSIS',
      homeTeam: 'Arsenal',
      awayTeam: 'Liverpool',
      summary: 'Arsenal enter the matchup with a stronger home profile.',
      verdict: 'Arsenal have the statistical edge.',
      metrics: { homeElo: 1880, awayElo: 1845, homeWinRate: 0.71, awayWinRate: 0.64 },
      signals: [
        { type: 'HOME_FORM', winner: 'Arsenal', strength: 'strong' },
        { type: 'ATTACKING_FORM', winner: 'Liverpool', strength: 'moderate' }
      ],
      confidence: 0.79
    }
  });
  assertString(result);
  assertIncludes(result, 'Arsenal');
  assertIncludes(result, 'Liverpool');
  assertIncludes(result, '79%');
});

test('Realistic team analysis', () => {
  const result = ResponseEngine.format({
    intent: 'team_analysis',
    data: {
      type: 'TEAM_ANALYSIS',
      team: 'Manchester United',
      summary: 'United have shown improved defensive stability.',
      metrics: { played: 25, winRate: 0.60, pointsPerGame: 1.95, goalsPerGame: 1.8, concededPerGame: 1.1 },
      insights: ['Improved defensive structure', 'Better home results', 'Attack remains inconsistent'],
      confidence: 0.73
    }
  });
  assertString(result);
  assertIncludes(result, 'Manchester United');
  assertIncludes(result, '60%');
});

test('Realistic prediction probabilities', () => {
  const result = ResponseEngine.format({
    intent: 'prediction',
    data: {
      type: 'MATCH_PROBABILITIES',
      probabilities: { homeWin: 0.47, draw: 0.29, awayWin: 0.24 },
      warning: 'These probabilities describe the model estimate, not certainty.'
    }
  });
  assertIncludes(result, '47%');
  assertIncludes(result, '29%');
  assertIncludes(result, '24%');
  assertIncludes(result, 'not certainty');
});

/* ============================================================
   25. SAFETY / OUTPUT SANITY
   ============================================================ */

console.log('');
console.log('25. OUTPUT SANITY');
console.log('------------------------------------------------------------');

test('All major response types return strings', () => {
  const datasets = [teamAnalysis, matchup, comparison, form, probabilities];
  datasets.forEach(data => {
    const result = ResponseEngine.format({ data });
    assertString(result);
  });
});

test('No response returns undefined', () => {
  const inputs = [{}, { data: {} }, { data: teamAnalysis }, { data: matchup }, { data: comparison }, { data: form }, { data: probabilities }];
  inputs.forEach(input => {
    const result = ResponseEngine.format(input);
    assert(result !== undefined, 'Response returned undefined');
  });
});

test('No response returns null', () => {
  const result = ResponseEngine.format({});
  assert(result !== null, 'Response returned null');
});

/* ============================================================
   FINAL REPORT
   ============================================================ */

console.log('');
console.log('============================================================');
console.log(' MASTER TEST RESULTS (PRO EDITION)');
console.log('============================================================');

console.log(`Total:  ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

const percentage = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
console.log(`Score:  ${percentage}%`);

console.log('');

if (failed === 0) {
  console.log('🎯 RESPONSE ENGINE STATUS: HEALTHY');
  console.log('✅ All master tests passed.');
  console.log('🧠 KIM response formatting layer is ready.');
  console.log('');
  process.exit(0);
}

console.log('🚨 RESPONSE ENGINE STATUS: NEEDS FIXES');
console.log('');
console.log('Failed tests:');

failures.forEach((failure, index) => {
  console.log(`${index + 1}. ${failure.name}`);
  console.log(`   ${failure.error}`);
});

console.log('');
process.exit(1);