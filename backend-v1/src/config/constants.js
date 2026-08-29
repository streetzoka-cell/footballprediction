// backend-v1/src/config/constants.js

/**
 * ★ Self-correcting season. Providers use the STARTING year:
 *   Aug 2026 → season 2026 (the 2026/27 campaign).
 * July (month index 6) onward belongs to the upcoming season.
 * No more hardcoded value going stale every rollover.
 */
function computeCurrentSeason() {
  const now = new Date();
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? year : year - 1;
}

const CURRENT_SEASON = computeCurrentSeason();

const COLLECTIONS = {
  MATCHES_LIVE: 'matches_live',
  MATCHES_TODAY: 'matches_today',
  MATCHES_FINISHED: 'matches_finished',
  MATCHES_UPCOMING: 'matches_upcoming',
  MATCH_DETAILS: 'match_details',
  MATCH_EVENTS: 'match_events',
  LINEUPS: 'lineups',
  STATISTICS: 'statistics',
  STANDINGS: 'standings',
  TOP_SCORERS: 'top_scorers',
  PLAYERS: 'players',
  TEAMS: 'teams',
  LEAGUES: 'leagues',
  PREDICTIONS: 'predictions',
  ODDS: 'odds',
  VIDEOS: 'videos',
  META: 'meta',
  CACHE_INFO: 'cacheInfo',
  FIXTURE_SNAPSHOTS: 'fixture_snapshots',
  PROVIDER_HEALTH: 'provider_health',
};

const TTL = {
  LIVE: 60,
  TODAY_FIXTURES: 6 * 3600,
  FINISHED: 30 * 24 * 3600,
  STANDINGS: 6 * 3600,
  TOP_SCORERS: 24 * 3600,
  TEAMS: 30 * 24 * 3600,
  PLAYERS: 7 * 24 * 3600,
  LINEUPS: 24 * 3600,
  STATISTICS: 5 * 60,
  PREDICTIONS: 24 * 3600,
  ODDS: 4 * 3600,
  VIDEOS: 1 * 3600,
};

const STATUS = {
  FOOTBALL_LIVE: ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'],
  FOOTBALL_FINISHED: ['FT', 'AET', 'PEN', 'FINISHED'],
  FOOTBALL_UPCOMING: ['NS', 'TBD', 'SCHEDULED', 'TIMED'],
};

const API = {
  DAILY_BUDGET: 100,
  RESERVE: 10,
};

const LIVE_POLLING = {
  FOOTBALL_DAILY_LIVE_CAP: 80,
  MIN_BUDGET_TO_POLL: 10,

  IDLE_INTERVAL_MS: 300000,
  LOW_LIVE_INTERVAL_MS: 60000,
  MEDIUM_LIVE_INTERVAL_MS: 45000,
  HIGH_LIVE_INTERVAL_MS: 30000,
  MASSIVE_LIVE_INTERVAL_MS: 20000,
  NEAR_FINISH_INTERVAL_MS: 15000,

  RESERVE_FOR_DAILY_CRON: 10,
  MIN_POLLS_PER_LIVE_HOUR: 4,
  FT_CONFIRMATION_DELAY_MS: 30000,
  MAX_CONSECUTIVE_ERRORS: 5,
  ERROR_BACKOFF_MS: 60000,
};

function getDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDate(date) {
  if (date instanceof Date) return date.toISOString().split('T')[0];
  return date;
}

module.exports = {
  COLLECTIONS,
  TTL,
  STATUS,
  API,
  LIVE_POLLING,
  getDateOffset,
  formatDate,
  BATCH_MAX_OPS: 50,
  WRITE_TIMEOUT_MS: 15000,
  CURRENT_SEASON,
  DEFAULT_FOOTBALL_SEASON: CURRENT_SEASON,
};