// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/constants.js
// SINGLE SOURCE OF TRUTH — Business Logic, Types, and Paths
// ═══════════════════════════════════════════════════════════════

export const SPORT = Object.freeze({
  FOOTBALL: 'football',
  BASKETBALL: 'basketball',
});

export const PREDICTION_SOURCE = Object.freeze({
  ZOKA: 'zoka',
  USER: 'user',
});

export const PERIOD = Object.freeze({
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  GOAT: 'goat',
});

export const PERIOD_LABEL = Object.freeze({
  [PERIOD.DAILY]: 'Today',
  [PERIOD.WEEKLY]: 'This Week',
  [PERIOD.MONTHLY]: 'This Month',
  [PERIOD.GOAT]: 'All Time',
});

export const STATUS = Object.freeze({
  FOOTBALL_LIVE: Object.freeze(['1H', '2H', 'HT', 'ET', 'BT', 'P']),
  FOOTBALL_FINISHED: Object.freeze(['FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO']),
  FOOTBALL_SCHEDULED: Object.freeze(['TBD', 'NS', 'SUSP', 'PST', 'CANC', 'INT']),
  BASKETBALL_LIVE: Object.freeze(['1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'Q4', 'OT', 'HT']),
  BASKETBALL_FINISHED: Object.freeze(['FT', 'AOT', 'ABD']),
  BASKETBALL_SCHEDULED: Object.freeze(['NS', 'POST', 'CANC', 'SUSP']),
});

export const getStatusSets = (sport) => {
  if (sport === SPORT.BASKETBALL) {
    return {
      live: STATUS.BASKETBALL_LIVE,
      finished: STATUS.BASKETBALL_FINISHED,
      scheduled: STATUS.BASKETBALL_SCHEDULED,
    };
  }
  return {
    live: STATUS.FOOTBALL_LIVE,
    finished: STATUS.FOOTBALL_FINISHED,
    scheduled: STATUS.FOOTBALL_SCHEDULED,
  };
};

export const isLiveStatus = (status, sport = SPORT.FOOTBALL) =>
  getStatusSets(sport).live.includes(status);

export const isFinishedStatus = (status, sport = SPORT.FOOTBALL) =>
  getStatusSets(sport).finished.includes(status);

export const isScheduledStatus = (status, sport = SPORT.FOOTBALL) =>
  getStatusSets(sport).scheduled.includes(status);

export const RESULT_TYPE = Object.freeze({
  EXACT: 'exact',
  RESULT: 'result',
  MISS: 'miss',
  PENDING: 'pending',
});

export const POINTS = Object.freeze({
  [RESULT_TYPE.EXACT]: 10,
  [RESULT_TYPE.RESULT]: 3,
  [RESULT_TYPE.MISS]: 0,
  [RESULT_TYPE.PENDING]: 0,
});

export function calcPoints(predH, predA, actualH, actualA) {
  if (actualH == null || actualA == null) {
    return { points: POINTS[RESULT_TYPE.PENDING], type: RESULT_TYPE.PENDING };
  }
  if (predH === actualH && predA === actualA) {
    return { points: POINTS[RESULT_TYPE.EXACT], type: RESULT_TYPE.EXACT };
  }
  const predResult = predH > predA ? 'H' : predH < predA ? 'A' : 'D';
  const actualResult = actualH > actualA ? 'H' : actualH < actualA ? 'A' : 'D';
  if (predResult === actualResult) {
    return { points: POINTS[RESULT_TYPE.RESULT], type: RESULT_TYPE.RESULT };
  }
  return { points: POINTS[RESULT_TYPE.MISS], type: RESULT_TYPE.MISS };
}

// ★ NEW: ZOKAPICKS LEAGUE CONFIG
export const LEAGUE_CONFIG = Object.freeze({
  MIN_FEATURED: 3,
  MAX_FEATURED: 8,
  MAX_ZOKA: 8,
  LOCK_BEFORE_MINUTES: 60, // Locks 1 hour before kickoff
});

// ★ NEW: ACHIEVEMENTS DEFINITIONS
export const ACHIEVEMENTS = [
  { id: 'first_pred', name: 'First Step', icon: '👟', color: '#60a5fa', check: (p) => p.predictions >= 1 },
  { id: 'streak_5', name: '5-Day Streak', icon: '🔥', color: '#ef4444', check: (p) => p.streak >= 5 },
  { id: 'exact_10', name: 'Sharpshooter', icon: '🎯', color: '#f97116', check: (p) => p.exact >= 10 },
  { id: 'beat_zoka', name: 'Beat ZOKA', icon: '🏆', color: '#fbbf24', check: (p) => p.beatZoka },
  { id: 'top_10', name: 'Top 10', icon: '⭐', color: '#a855f7', check: (p) => p.bestRank <= 10 && p.bestRank > 0 },
];

/* ═══════════════════════════════════════════════════
   FIRESTORE COLLECTION/DOCUMENT PATHS
   ═══════════════════════════════════════════════════ */
export const PATHS = Object.freeze({
  FIXTURE_SNAPSHOTS: 'fixture_snapshots',
  REFERENCE_DATA: 'reference_data',
  ACTIVE_PREDICTIONS: 'active_predictions',
  PREDICTION_SNAPSHOTS: 'prediction_snapshots',
  USER_PREDICTIONS: 'user_predictions',
  PREDICTION_RESULTS: 'prediction_results',
  USER_POINTS_TOTAL: 'user_points_total',
  DAILY_LEADERBOARD: 'daily_leaderboard',
  LEADERBOARD_SUMMARIES: 'leaderboard_summaries',
  ZOKA_PICKS: 'zoka_picks',
  ZOKA_VOTE_STATS: 'zoka_vote_stats',
  MATCH_RESOLUTION_STATUS: 'match_resolution_status',
  USERS: 'users',
  REFERRALS: 'referral_visits',
});