// Budget-optimized — smart midnight rollover, dynamic live polling, smart FT recovery.
// ★ Upgraded for 1500 calls/day limit (Greedy & Instant polling)

// ───────────────────────────────────────────────
// DATES & SEASONS
// ───────────────────────────────────────────────
function getCurrentSeason() {
  const now = new Date();
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function getCurrentBasketballSeason() {
  const now = new Date();
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function formatDate(d) { return d.toISOString().split("T")[0]; }
function getDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}
function getLocalDateFromUtc(utcDateStr) {
  if (!utcDateStr) return null;
  try { return new Date(utcDateStr).toISOString().split("T")[0]; } catch { return null; }
}

const SEASON = getCurrentSeason();
const BASKETBALL_SEASON = getCurrentBasketballSeason();
const TODAY = getDateOffset(0);
const YESTERDAY = getDateOffset(-1);
const TOMORROW = getDateOffset(1);

// ───────────────────────────────────────────────
// LEAGUE CONFIGURATION (★ Mapped to GOAL API IDs)
// ───────────────────────────────────────────────
const TRACK_ALL_LEAGUES = true; 
const BLOCKED_LEAGUE_IDS = new Set([]);

const LEAGUES = Object.freeze([
  // INTERNATIONAL & FRIENDLIES
  { id: "cmr77dw4s00fmrx069yvhf8ce", name: "World Cup", country: "World", flag: "🌍", season: SEASON, priority: 1, tier: 1, active: true },
  { id: "cmr77dw4800ferx06u57oohrh", name: "Euro Championship", country: "World", flag: "🇪🇺", season: SEASON, priority: 2, tier: 1, active: true },
  { id: "cmr77dw4800fgrx06rwmig2h8", name: "UEFA Nations League", country: "World", flag: "🇪🇺", season: SEASON, priority: 3, tier: 1, active: true },
  { id: "cmr77dw3900f5rx06j05wgzv4", name: "UEFA Champions League", country: "World", flag: "🇪🇺", season: SEASON, priority: 4, tier: 1, active: true },
  { id: "cmr77dw3900f6rx06tuqwft2d", name: "UEFA Europa League", country: "World", flag: "🇪🇺", season: SEASON, priority: 5, tier: 1, active: true },
  { id: "cmr77dw3900f9rx06laad8onf", name: "UEFA Conference League", country: "World", flag: "🇪🇺", season: SEASON, priority: 6, tier: 1, active: true },
  { id: "cmr77dvhg0019rx06c0fx6cwh", name: "Copa Libertadores", country: "World", flag: "🌍", season: SEASON, priority: 7, tier: 1, active: true },

  // ENGLAND
  { id: "cmr77dvkr005nrx06lp7rvp49", name: "Premier League", country: "England", flag: "🏴", season: SEASON, priority: 10, tier: 1, active: true },
  { id: "cmr77dvkr005hrx068xaahpuh", name: "Championship", country: "England", flag: "🏴", season: SEASON, priority: 11, tier: 2, active: true },

  // SPAIN
  { id: "cmr77dvnt006nrx063v3w622e", name: "La Liga", country: "Spain", flag: "🇪🇸", season: SEASON, priority: 20, tier: 1, active: true },
  { id: "cmr77dvnt006orx06io7l06lv", name: "Segunda División", country: "Spain", flag: "🇪🇸", season: SEASON, priority: 21, tier: 2, active: true },

  // ITALY
  { id: "cmr77dvpd006yrx06zig7907g", name: "Serie A", country: "Italy", flag: "🇮🇹", season: SEASON, priority: 30, tier: 1, active: true },
  { id: "cmr77dvpd006zrx06dmggkel8", name: "Serie B", country: "Italy", flag: "🇮🇹", season: SEASON, priority: 31, tier: 2, active: true },

  // GERMANY
  { id: "cmr77dvgm0002rx06rt2uqxii", name: "Bundesliga", country: "Germany", flag: "🇩🇪", season: SEASON, priority: 40, tier: 1, active: true },
  { id: "cmr77dvgm0001rx060h6ivt4p", name: "2. Bundesliga", country: "Germany", flag: "🇩🇪", season: SEASON, priority: 41, tier: 2, active: true },

  // FRANCE
  { id: "cmr77dvqg007crx06q1kaceyo", name: "Ligue 1", country: "France", flag: "🇫🇷", season: SEASON, priority: 50, tier: 1, active: true },

  // OTHER EUROPEAN MAJORS
  { id: "cmr77dvun00adrx06xz20yfxe", name: "Primeira Liga", country: "Portugal", flag: "🇵🇹", season: SEASON, priority: 60, tier: 1, active: true },
  { id: "cmr77dvrh007vrx0664phtxs5", name: "Eredivisie", country: "Netherlands", flag: "🇳🇱", season: SEASON, priority: 61, tier: 1, active: true },
  { id: "cmr77dw9g00gvrx06jlglb47m", name: "First Division A", country: "Belgium", flag: "🇧🇪", season: SEASON, priority: 62, tier: 1, active: true },
  { id: "cmr77dw0q00eprx06rqew3m48", name: "Süper Lig", country: "Turkey", flag: "🇹🇷", season: SEASON, priority: 63, tier: 1, active: true },
  { id: "cmr77dwe100j5rx064jkxo63c", name: "Premiership", country: "Scotland", flag: "🏴", season: SEASON, priority: 65, tier: 2, active: true },
  { id: "cmr77dwdf00ixrx06z6havnxo", name: "Premier League", country: "Ukraine", flag: "🇺🇦", season: SEASON, priority: 67, tier: 2, active: true },
  
  // AMERICAS
  { id: "cmr77dvww00bfrx061thkr8z4", name: "Serie A", country: "Brazil", flag: "🇧🇷", season: SEASON, priority: 80, tier: 1, active: true },
  { id: "cmr77dvtx009krx06tw1t8obh", name: "MLS", country: "USA", flag: "🇺🇸", season: SEASON, priority: 82, tier: 1, active: true },
  { id: "cmr77dvsv008srx06mier6t7r", name: "Liga MX", country: "Mexico", flag: "🇲🇽", season: SEASON, priority: 83, tier: 1, active: true },

  // ASIA
  { id: "cmr77dx7h00rvrx060kholaxg", name: "J1 League", country: "Japan", flag: "🇯🇵", season: SEASON, priority: 90, tier: 1, active: true },
]);

const BASKETBALL_LEAGUES = Object.freeze([
  { id: 12, name: "NBA", country: "USA", flag: "🇺🇸", season: BASKETBALL_SEASON, priority: 1, tier: 1, active: true },
  { id: 13, name: "EuroLeague", country: "Europe", flag: "🇪🇺", season: BASKETBALL_SEASON, priority: 2, tier: 2, active: true },
]);

const STATUS = Object.freeze({
  FOOTBALL_LIVE: Object.freeze(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED']),
  FOOTBALL_FINISHED: Object.freeze(['FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO']),
  FOOTBALL_SCHEDULED: Object.freeze(['TBD', 'NS', 'SUSP', 'PST', 'CANC', 'INT']),
  BASKETBALL_LIVE: Object.freeze(['1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'Q4', 'OT', 'HT']),
  BASKETBALL_FINISHED: Object.freeze(['FT', 'AOT', 'ABD']),
  BASKETBALL_SCHEDULED: Object.freeze(['NS', 'POST', 'CANC', 'SUSP']),
  FIRST_HALF: "1H", HALF_TIME: "HT", SECOND_HALF: "2H", EXTRA_TIME: "ET", EXTRA_TIME_HALFTIME: "BT", PENALTY: "P",
  FULL_TIME: "FT", AFTER_EXTRA_TIME: "AET", AFTER_PENALTIES: "PEN", POSTPONED: "PST", CANCELLED: "CANC", SUSPENDED: "SUSP",
  INTERRUPTED: "INT", ABANDONED: "ABD", AWARDED: "AWD", WALKOVER: "WO", NOT_STARTED: "NS",
});

const LIVE_STATUSES = Object.freeze([ STATUS.FIRST_HALF, STATUS.HALF_TIME, STATUS.SECOND_HALF, STATUS.EXTRA_TIME, STATUS.EXTRA_TIME_HALFTIME, STATUS.PENALTY ]);
const FINISHED_STATUSES = Object.freeze([ STATUS.FULL_TIME, STATUS.AFTER_EXTRA_TIME, STATUS.AFTER_PENALTIES, STATUS.ABANDONED, STATUS.AWARDED, STATUS.WALKOVER ]);
const RESOLVED_STATUSES = Object.freeze([ ...FINISHED_STATUSES, STATUS.POSTPONED, STATUS.CANCELLED, STATUS.SUSPENDED, STATUS.INTERRUPTED ]);
const BASKETBALL_STATUS = Object.freeze({ NOT_STARTED: "NS", FIRST_QUARTER: "1Q", BETWEEN_Q1_Q2: "Q1", SECOND_QUARTER: "2Q", BETWEEN_Q2_Q3: "Q2", THIRD_QUARTER: "3Q", BETWEEN_Q3_Q4: "Q3", FOURTH_QUARTER: "4Q", OVERTIME: "OT", FINISHED: "FT", POSTPONED: "POST", CANCELLED: "CANC", SUSPENDED: "SUSP", ABANDONED: "ABD", LIVE: "LIVE" });
const BASKETBALL_LIVE_STATUSES = Object.freeze([ BASKETBALL_STATUS.FIRST_QUARTER, BASKETBALL_STATUS.BETWEEN_Q1_Q2, BASKETBALL_STATUS.SECOND_QUARTER, BASKETBALL_STATUS.BETWEEN_Q2_Q3, BASKETBALL_STATUS.THIRD_QUARTER, BASKETBALL_STATUS.BETWEEN_Q3_Q4, BASKETBALL_STATUS.FOURTH_QUARTER, BASKETBALL_STATUS.OVERTIME ]);
const BASKETBALL_FINISHED_STATUSES = Object.freeze([ BASKETBALL_STATUS.FINISHED, BASKETBALL_STATUS.ABANDONED ]);

const COLLECTIONS = Object.freeze({
  LIVE_FIXTURES: "liveFixtures", YESTERDAY_FIXTURES: "yesterdayFixtures", TODAY_FIXTURES: "todayFixtures", TOMORROW_FIXTURES: "tomorrowFixtures", FINISHED_FIXTURES: "finishedFixtures", STANDINGS: "standings", LEAGUES: "leagues", TEAMS: "teams", BASKETBALL_LIVE_FIXTURES: "basketballLiveFixtures", BASKETBALL_YESTERDAY_FIXTURES: "basketballYesterdayFixtures", BASKETBALL_TODAY_FIXTURES: "basketballTodayFixtures", BASKETBALL_TOMORROW_FIXTURES: "basketballTomorrowFixtures", BASKETBALL_FINISHED_FIXTURES: "basketballFinishedFixtures", BASKETBALL_STANDINGS: "basketballStandings", BASKETBALL_LEAGUES: "basketballLeagues", BASKETBALL_TEAMS: "basketballTeams", META: "meta",
});
const META_DOCS = Object.freeze({ FOOTBALL_SCHEDULER: "footballScheduler", BASKETBALL_SCHEDULER: "basketballScheduler", FOOTBALL_BUDGET: "footballBudget", BASKETBALL_BUDGET: "basketballBudget" });

// ───────────────────────────────────────────────
// API & SCHEDULER (★ Upgraded for 1500 calls/day)
// ───────────────────────────────────────────────
const API = Object.freeze({ PAGE_SIZE: 100, DAILY_BUDGET: 1500 });
const SCHEDULER = Object.freeze({ FIXTURES_DAILY: "0 3 * * *", BASKETBALL_FIXTURES_DAILY: "0 3 * * *" });

const LIVE_POLLING = Object.freeze({
  FOOTBALL_DAILY_LIVE_CAP: 1000,
  BASKETBALL_DAILY_LIVE_CAP: 100,
  IDLE_INTERVAL_MS:           300000,
  LOW_LIVE_INTERVAL_MS:       30000,
  MEDIUM_LIVE_INTERVAL_MS:    30000,
  HIGH_LIVE_INTERVAL_MS:      30000,
  MASSIVE_LIVE_INTERVAL_MS:   30000,
  NEAR_FINISH_INTERVAL_MS:    15000,
  RESERVE_FOR_DAILY_CRON:     100,
  MIN_BUDGET_TO_POLL:         10,
  BUDGET_NORMAL_THRESHOLD:    500,
  BUDGET_CRITICAL_THRESHOLD:  150,
  FT_CONFIRMATION_DELAY_MS:   15000,
  MAX_CONSECUTIVE_ERRORS:     3,
  ERROR_BACKOFF_MS:           30000,
});

const FT_RECOVERY = Object.freeze({ ENABLED: true, MIN_BUDGET_TO_FETCH: 10, COOLDOWN_MS: 900000, DEDUP_KEY: "ftRecoveredAt" });
const RETRY = Object.freeze({ MAX_ATTEMPTS: 3, BASE_DELAY_MS: 2000, MAX_DELAY_MS: 30000, JITTER: true });
const BATCH_MAX_OPS = 450;
const WRITE_TIMEOUT_MS = 30000;
const SPORT = Object.freeze({ FOOTBALL: "football", BASKETBALL: "basketball" });

module.exports = Object.freeze({
  TODAY, YESTERDAY, TOMORROW, formatDate, getDateOffset, getLocalDateFromUtc,
  LEAGUES, SEASON, STATUS, LIVE_STATUSES, FINISHED_STATUSES, RESOLVED_STATUSES,
  BASKETBALL_LEAGUES, BASKETBALL_SEASON, BASKETBALL_STATUS, BASKETBALL_LIVE_STATUSES, BASKETBALL_FINISHED_STATUSES,
  COLLECTIONS, META_DOCS, API, SCHEDULER, LIVE_POLLING, FT_RECOVERY, RETRY, BATCH_MAX_OPS, WRITE_TIMEOUT_MS, SPORT, TRACK_ALL_LEAGUES, BLOCKED_LEAGUE_IDS,
});