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

export const LEAGUE_COLORS = Object.freeze({
  39: '#3d195b', 140: '#ee8707', 135: '#024494', 78: '#d20515',
  61: '#091c3e', 2: '#001838', 3: '#ff6b00', 848: '#2d6a4f',
  1: '#1a3c6e', 4: '#003366', 5: '#004d99', 40: '#5c2d91',
  44: '#2d4a22', 45: '#1a1a2e', 143: '#c60b1e', 137: '#024494',
  81: '#d20515', 66: '#091c3e', 94: '#006600', 88: '#e63e21',
  203: '#c8102e', 50: '#003087', 253: '#0047AB', 262: '#006341',
  71: '#009C3B', 128: '#75AADB', 12: '#1D428A', 13: '#003399',
  14: '#cc0000', 34: '#008c45', 32: '#000000', 36: '#002395',
  49: '#00843d', 115: '#002868', 116: '#DD0000', 114: '#003DA5',
  119: '#00205B', 132: '#CE1126', 766: '#7B2D8B', 891: '#FF6600',
  33: '#00843D', 35: '#FEBE10', 37: '#003DA5', 38: '#00205B',
  41: '#009B3A', 42: '#FFD700', 43: '#006233', 60: '#7B2D8B',
  62: '#002868',
});

export const DEFAULT_LEAGUE_COLOR = '#1e293b';
export const getLeagueColor = (id) => LEAGUE_COLORS[id] || DEFAULT_LEAGUE_COLOR;

export const BASKETBALL_LEAGUE_PRIORITY = Object.freeze({
  12: 100, 13: 95, 44: 85, 34: 82, 36: 80, 32: 78, 33: 76,
  14: 72, 119: 70, 116: 68, 114: 66, 37: 64, 35: 62,
  132: 58, 49: 56, 115: 54, 766: 52, 891: 50,
  38: 45, 42: 43, 43: 41, 41: 40, 45: 38, 40: 36,
  62: 30, 60: 28, 61: 26,
});

export const getBasketballLeaguePriority = (leagueId) =>
  BASKETBALL_LEAGUE_PRIORITY[Number(leagueId)] || 20;

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
});