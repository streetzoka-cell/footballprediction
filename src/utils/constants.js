// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/constants.js
// SINGLE SOURCE OF TRUTH — All shared constants and types
// ═══════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   SPORT TYPES
   ═══════════════════════════════════════════════════ */
export const SPORT = {
  FOOTBALL: 'football',
  BASKETBALL: 'basketball',
};

export const SPORT_PREFIX = {
  [SPORT.FOOTBALL]: 'ft',
  [SPORT.BASKETBALL]: 'bb',
};

/* ═══════════════════════════════════════════════════
   MATCH STATUS CONSTANTS
   ═══════════════════════════════════════════════════ */
export const STATUS = {
  // Football
  FOOTBALL_LIVE: Object.freeze(['1H', '2H', 'HT', 'ET', 'BT', 'P']),
  FOOTBALL_FINISHED: Object.freeze(['FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO']),
  FOOTBALL_SCHEDULED: Object.freeze(['TBD', 'NS', 'SUSP', 'PST', 'CANC', 'INT']),
  
  // Basketball
  BASKETBALL_LIVE: Object.freeze(['1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'Q4', 'OT', 'HT']),
  BASKETBALL_FINISHED: Object.freeze(['FT', 'AOT', 'ABD']),
  BASKETBALL_SCHEDULED: Object.freeze(['NS', 'POST', 'CANC', 'SUSP']),
};

/** Get live/finished/scheduled arrays for any sport */
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

/** Check if a status indicates live match */
export const isLiveStatus = (status, sport = SPORT.FOOTBALL) => {
  return getStatusSets(sport).live.includes(status);
};

/** Check if a status indicates finished match */
export const isFinishedStatus = (status, sport = SPORT.FOOTBALL) => {
  return getStatusSets(sport).finished.includes(status);
};

/** Check if a status indicates scheduled match */
export const isScheduledStatus = (status, sport = SPORT.FOOTBALL) => {
  return getStatusSets(sport).scheduled.includes(status);
};

/* ═══════════════════════════════════════════════════
   PREDICTION RESULT TYPES
   ═══════════════════════════════════════════════════ */
export const RESULT_TYPE = {
  EXACT: 'exact',    // +10 points
  RESULT: 'result',  // +3 points
  MISS: 'miss',      // +0 points
  PENDING: 'pending', // Not yet resolved
};

export const POINTS = {
  [RESULT_TYPE.EXACT]: 10,
  [RESULT_TYPE.RESULT]: 3,
  [RESULT_TYPE.MISS]: 0,
  [RESULT_TYPE.PENDING]: 0,
};

/* ═══════════════════════════════════════════════════
   LEAGUE COLORS
   ═══════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════
   BASKETBALL LEAGUE PRIORITY
   ═══════════════════════════════════════════════════ */
export const BASKETBALL_LEAGUE_PRIORITY = Object.freeze({
  12: 100, 13: 95, 44: 85, 34: 82, 36: 80, 32: 78, 33: 76,
  14: 72, 119: 70, 116: 68, 114: 66, 37: 64, 35: 62,
  132: 58, 49: 56, 115: 54, 766: 52, 891: 50,
  38: 45, 42: 43, 43: 41, 41: 40, 45: 38, 40: 36,
  62: 30, 60: 28, 61: 26,
});

export const getBasketballLeaguePriority = (leagueId) => {
  return BASKETBALL_LEAGUE_PRIORITY[Number(leagueId)] || 20;
};

/* ═══════════════════════════════════════════════════
   CACHE TTL (milliseconds)
   ═══════════════════════════════════════════════════ */
export const TTL = Object.freeze({
  FIXTURE_SNAPSHOT:       5 * 60 * 1000,       // 5 min — live scores
  FIXTURE_SNAPSHOT_IDLE:  30 * 60 * 1000,      // 30 min — no live matches
  REFERENCE:              24 * 60 * 60 * 1000, // 24 hours
  ACTIVE_PREDICTIONS:     10 * 60 * 1000,      // 10 min
  DAILY_LEADERBOARD:      10 * 60 * 1000,      // 10 min
  ZOKA_PICKS:             30 * 60 * 1000,      // 30 min
  ZOKA_VOTES:             10 * 60 * 1000,      // 10 min
  USER_DATA:              10 * 60 * 1000,      // 10 min
  HISTORICAL:             60 * 60 * 1000,      // 1 hour
  STALE_GRACE:            30 * 60 * 1000,      // 30 min grace
});

/* ═══════════════════════════════════════════════════
   TIMEOUT (milliseconds)
   ═══════════════════════════════════════════════════ */
export const TIMEOUT = Object.freeze({
  SNAPSHOT_READ:    6000,
  COLLECTION_QUERY: 5000,
  USER_QUERY:       6000,
  REFERENCE:        4000,
  USER_LOAD_SAFETY: 7000,
  HIST_LOAD_SAFETY: 8000,
});

/* ═══════════════════════════════════════════════════
   POLLING INTERVALS (milliseconds)
   ═══════════════════════════════════════════════════ */
export const POLL_INTERVAL = Object.freeze({
  LIVE_ACTIVE:  30000,   // 30s when live matches exist
  LIVE_IDLE:    300000,  // 5 min when no live matches
  TODAY_ACTIVE: 60000,   // 1 min for today fixtures
  BACKOFF_MAX:  1500000, // 25 min max backoff
});

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

/** Build snapshot document ID for a sport+date */
export const getSnapshotDocId = (sport, dateStr) => {
  if (sport === SPORT.BASKETBALL) {
    return `basketball_${dateStr}`;
  }
  return dateStr;
};

/** Build reference data document ID */
export const getRefDocId = (type, sport = SPORT.FOOTBALL) => {
  const prefix = sport === SPORT.BASKETBALL ? 'bb_' : '';
  return `${prefix}${type}`;
};

/* ═══════════════════════════════════════════════════
   CACHE KEY BUILDERS
   ═══════════════════════════════════════════════════ */
export const CACHE_KEY = {
  snapshot: (sport, dateStr) => `snap:${SPORT_PREFIX[sport]}:${dateStr}`,
  reference: (docId) => `snap:ref:${docId}`,
  activePredictions: (dateStr) => `active:${dateStr}`,
  dailyLeaderboard: (dateStr) => `dlb:${dateStr}`,
  zokaPicks: (dateStr) => `zoka:${dateStr}`,
  zokaVotes: (dateStr) => `zokaVotes:${dateStr}`,
  userPredictions: (uid, dateStr) => `myPreds:${uid}:${dateStr}`,
  predictionResults: (uid, dateStr) => `myResults:${uid}:${dateStr}`,
  userPoints: (uid) => `upt:${uid}`,
  historical: (period) => `hist:${period}`,
};

/* ═══════════════════════════════════════════════════
   POINTS CALCULATION
   ═══════════════════════════════════════════════════ */
export function calcPoints(predH, predA, actualH, actualA) {
  if (actualH == null || actualA == null) {
    return { points: POINTS.PENDING, type: RESULT_TYPE.PENDING };
  }
  if (predH === actualH && predA === actualA) {
    return { points: POINTS.EXACT, type: RESULT_TYPE.EXACT };
  }
  const predResult = predH > predA ? 'H' : predH < predA ? 'A' : 'D';
  const actualResult = actualH > actualA ? 'H' : actualH < actualA ? 'A' : 'D';
  if (predResult === actualResult) {
    return { points: POINTS.RESULT, type: RESULT_TYPE.RESULT };
  }
  return { points: POINTS.MISS, type: RESULT_TYPE.MISS };
}


/* ═══════════════════════════════════════════════════
   TRANSFORMED MATCH SHAPE (documentation)
   ═══════════════════════════════════════════════════ */
/**
 * @typedef {Object} TransformedMatch
 * @property {string} id - Match ID (string)
 * @property {string} sport - 'football' | 'basketball'
 * @property {string} date - ISO date string
 * @property {string} kickoff - Formatted time "HH:MM"
 * @property {number|null} timestamp - Unix timestamp
 * @property {Object} homeTeam - { id, name, abbr, color }
 * @property {Object} awayTeam - { id, name, abbr, color }
 * @property {string} homeId - Home team ID
 * @property {string} awayId - Away team ID
 * @property {string|null} homeLogo - Logo URL
 * @property {string|null} awayLogo - Logo URL
 * @property {Object} league - { id, name, color, emblem, country, flag, type, season, round }
 * @property {string} leagueKey - League ID string
 * @property {string} leagueCountry - Country name
 * @property {string} status - Short status code
 * @property {string} rawStatus - Same as status
 * @property {string} statusLong - Long status description
 * @property {number|null} homeScore - Home score
 * @property {number|null} awayScore - Away score
 * @property {Object} score - Score breakdown object
 * @property {boolean} isLive - Currently playing
 * @property {boolean} isFinished - Match ended
 * @property {boolean} isScheduled - Not started
 * @property {string|null} minute - Current minute or period
 * @property {string|null} venue - Venue name
 * @property {string|null} referee - Referee name
 */