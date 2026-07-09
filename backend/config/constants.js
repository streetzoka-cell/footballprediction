/*
 * constants.js
 * Budget-optimized — tomorrow-only daily fetch,
 * live polling with daily caps, no standings/leagues cron on free plan.
 */

// ───────────────────────────────────────────────
// Football Season — always current
// ───────────────────────────────────────────────
function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return month >= 7 ? year : year - 1;
}

const SEASON = getCurrentSeason();

// ───────────────────────────────────────────────
// Basketball Season — always current
// ───────────────────────────────────────────────
function getCurrentBasketballSeason() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

const BASKETBALL_SEASON = getCurrentBasketballSeason();

// ───────────────────────────────────────────────
// Date Helpers
// ───────────────────────────────────────────────
function formatDate(d) {
  return d.toISOString().split("T")[0];
}

function getDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

const TODAY = formatDate(new Date());
const YESTERDAY = getDateOffset(-1);
const TOMORROW = getDateOffset(1);

// ───────────────────────────────────────────────
// Football Leagues
// World Cup, UCL, Europa, Conference all active
// ───────────────────────────────────────────────
const LEAGUES = Object.freeze([
  // ═══ TOP 5 EUROPE ═══
  { id: 39,  name: "Premier League",         country: "England",  flag: "🏴",  season: SEASON, priority: 1,  active: true },
  { id: 140, name: "La Liga",                country: "Spain",    flag: "🇪🇸", season: SEASON, priority: 2,  active: true },
  { id: 135, name: "Serie A",                country: "Italy",    flag: "🇮🇹", season: SEASON, priority: 3,  active: true },
  { id: 78,  name: "Bundesliga",              country: "Germany",  flag: "🇩🇪", season: SEASON, priority: 4,  active: true },
  { id: 61,  name: "Ligue 1",                country: "France",   flag: "🇫🇷", season: SEASON, priority: 5,  active: true },

  // ═══ UEFA CLUB — ALL ACTIVE ═══
  { id: 2,   name: "UEFA Champions League",   country: "World",  flag: "🇪🇺", season: SEASON, priority: 6,  active: true },
  { id: 3,   name: "UEFA Europa League",     country: "World",  flag: "🇪🇺", season: SEASON, priority: 7,  active: true },
  { id: 848, name: "UEFA Conference League", country: "World",  flag: "🇪🇺", season: SEASON, priority: 8,  active: true },

  // ═══ INTERNATIONAL — ALL ACTIVE ═══
  { id: 1,   name: "World Cup",              country: "World",  flag: "🌍", season: SEASON, priority: 9,  active: true },
  { id: 4,   name: "Euro Championship",      country: "World",  flag: "🇪🇺", season: SEASON, priority: 10, active: true },
  { id: 5,   name: "UEFA Nations League",    country: "World",  flag: "🇪🇺", season: SEASON, priority: 11, active: true },

  // ═══ DOMESTIC CUPS ═══
  { id: 40,  name: "Championship",            country: "England", flag: "🏴",  season: SEASON, priority: 12, active: true },
  { id: 44,  name: "FA Cup",                 country: "England", flag: "🏴",  season: SEASON, priority: 13, active: true },
  { id: 45,  name: "League Cup",              country: "England", flag: "🏴",  season: SEASON, priority: 14, active: true },
  { id: 143, name: "Copa del Rey",           country: "Spain",   flag: "🇪🇸", season: SEASON, priority: 15, active: true },
  { id: 137, name: "Coppa Italia",           country: "Italy",   flag: "🇮🇹", season: SEASON, priority: 16, active: true },
  { id: 81,  name: "DFB Pokal",              country: "Germany", flag: "🇩🇪", season: SEASON, priority: 17, active: true },
  { id: 66,  name: "Coupe de France",        country: "France",  flag: "🇫🇷", season: SEASON, priority: 18, active: true },

  // ═══ SECONDARY EUROPE ═══
  { id: 94,  name: "Primeira Liga",          country: "Portugal",    flag: "🇵🇹", season: SEASON, priority: 19, active: true },
  { id: 88,  name: "Eredivisie",             country: "Netherlands", flag: "🇳🇱", season: SEASON, priority: 20, active: true },
  { id: 203, name: "Süper Lig",              country: "Turkey",      flag: "🇹🇷", season: SEASON, priority: 21, active: true },
  { id: 50,  name: "Premiership",            country: "Scotland",    flag: "🏴",  season: SEASON, priority: 22, active: true },

  // ═══ INACTIVE ═══
  { id: 144, name: "First Division A",       country: "Belgium",     flag: "🇧🇪", season: SEASON, priority: 23, active: false },
  { id: 121, name: "Bundesliga",             country: "Austria",     flag: "🇦🇹", season: SEASON, priority: 24, active: false },
  { id: 105, name: "Super League",           country: "Greece",      flag: "🇬🇷", season: SEASON, priority: 25, active: false },
  { id: 41,  name: "League One",             country: "England",     flag: "🏴",  season: SEASON, priority: 26, active: false },
  { id: 42,  name: "League Two",             country: "England",     flag: "🏴",  season: SEASON, priority: 27, active: false },
  { id: 43,  name: "National League",        country: "England",     flag: "🏴",  season: SEASON, priority: 28, active: false },
  { id: 141, name: "Segunda División",       country: "Spain",       flag: "🇪🇸", season: SEASON, priority: 29, active: false },
  { id: 136, name: "Serie B",                country: "Italy",       flag: "🇮🇹", season: SEASON, priority: 30, active: false },
  { id: 79,  name: "2. Bundesliga",           country: "Germany",     flag: "🇩🇪", season: SEASON, priority: 31, active: false },
  { id: 62,  name: "Ligue 2",                country: "France",      flag: "🇫🇷", season: SEASON, priority: 32, active: false },
  { id: 253, name: "MLS",                    country: "USA",        flag: "🇺🇸", season: SEASON, priority: 33, active: false },
  { id: 262, name: "Liga MX",                country: "Mexico",     flag: "🇲🇽", season: SEASON, priority: 34, active: false },
  { id: 71,  name: "Serie A",                country: "Brazil",     flag: "🇧🇷", season: SEASON, priority: 35, active: false },
  { id: 128, name: "Primera División",       country: "Argentina",  flag: "🇦🇷", season: SEASON, priority: 36, active: false },
]);

// ───────────────────────────────────────────────
// Basketball Leagues
// ───────────────────────────────────────────────
const BASKETBALL_LEAGUES = Object.freeze([
  { id: 12, name: "NBA",       country: "USA",      flag: "🇺🇸", season: BASKETBALL_SEASON, priority: 1, active: true },
  { id: 13, name: "EuroLeague", country: "Europe",   flag: "🇪🇺", season: BASKETBALL_SEASON, priority: 2, active: false },
  { id: 14, name: "EuroCup",    country: "Europe",   flag: "🇪🇺", season: BASKETBALL_SEASON, priority: 3, active: false },
  { id: 44, name: "Liga ACB",   country: "Spain",    flag: "🇪🇸", season: BASKETBALL_SEASON, priority: 4, active: false },
  { id: 34, name: "LBA",        country: "Italy",    flag: "🇮🇹", season: BASKETBALL_SEASON, priority: 5, active: false },
  { id: 32, name: "BBL",        country: "Germany",  flag: "🇩🇪", season: BASKETBALL_SEASON, priority: 6, active: false },
  { id: 36, name: "LNB Pro A",  country: "France",   flag: "🇫🇷", season: BASKETBALL_SEASON, priority: 7, active: false },
  { id: 49, name: "NBL",        country: "Australia", flag: "🇦🇺", season: BASKETBALL_SEASON, priority: 8, active: false },
]);

// ───────────────────────────────────────────────
// Status Codes
// ───────────────────────────────────────────────
const STATUS = Object.freeze({
  NOT_STARTED: "NS", FIRST_HALF: "1H", HALF_TIME: "HT",
  SECOND_HALF: "2H", EXTRA_TIME: "ET", EXTRA_TIME_HALFTIME: "BT",
  PENALTY: "P", FULL_TIME: "FT", AFTER_EXTRA_TIME: "AET",
  AFTER_PENALTIES: "PEN", POSTPONED: "PST", CANCELLED: "CANC",
  SUSPENDED: "SUSP", INTERRUPTED: "INT", ABANDONED: "ABD",
  AWARDED: "AWD", WALKOVER: "WO", LIVE: "LIVE",
});

const LIVE_STATUSES = Object.freeze([
  STATUS.FIRST_HALF, STATUS.HALF_TIME, STATUS.SECOND_HALF,
  STATUS.EXTRA_TIME, STATUS.EXTRA_TIME_HALFTIME, STATUS.PENALTY,
]);

const FINISHED_STATUSES = Object.freeze([
  STATUS.FULL_TIME, STATUS.AFTER_EXTRA_TIME, STATUS.AFTER_PENALTIES,
  STATUS.ABANDONED, STATUS.AWARDED, STATUS.WALKOVER,
]);

const BASKETBALL_STATUS = Object.freeze({
  NOT_STARTED: "NS", FIRST_QUARTER: "1Q", BETWEEN_Q1_Q2: "Q1",
  SECOND_QUARTER: "2Q", BETWEEN_Q2_Q3: "Q2", THIRD_QUARTER: "3Q",
  BETWEEN_Q3_Q4: "Q3", FOURTH_QUARTER: "4Q", OVERTIME: "OT",
  FINISHED: "FT", POSTPONED: "POSTP", CANCELLED: "CANC",
  SUSPENDED: "SUSP", ABANDONED: "ABD", LIVE: "LIVE",
});

const BASKETBALL_LIVE_STATUSES = Object.freeze([
  BASKETBALL_STATUS.FIRST_QUARTER, BASKETBALL_STATUS.BETWEEN_Q1_Q2,
  BASKETBALL_STATUS.SECOND_QUARTER, BASKETBALL_STATUS.BETWEEN_Q2_Q3,
  BASKETBALL_STATUS.THIRD_QUARTER, BASKETBALL_STATUS.BETWEEN_Q3_Q4,
  BASKETBALL_STATUS.FOURTH_QUARTER, BASKETBALL_STATUS.OVERTIME,
]);

const BASKETBALL_FINISHED_STATUSES = Object.freeze([
  BASKETBALL_STATUS.FINISHED, BASKETBALL_STATUS.ABANDONED,
]);

// ───────────────────────────────────────────────
// Collections
// ───────────────────────────────────────────────
const COLLECTIONS = Object.freeze({
  LIVE_FIXTURES: "liveFixtures",
  YESTERDAY_FIXTURES: "yesterdayFixtures",
  TODAY_FIXTURES: "todayFixtures",
  TOMORROW_FIXTURES: "tomorrowFixtures",
  FINISHED_FIXTURES: "finishedFixtures",
  STANDINGS: "standings",
  LEAGUES: "leagues",
  TEAMS: "teams",
  BASKETBALL_LIVE_FIXTURES: "basketballLiveFixtures",
  BASKETBALL_YESTERDAY_FIXTURES: "basketballYesterdayFixtures",
  BASKETBALL_TODAY_FIXTURES: "basketballTodayFixtures",
  BASKETBALL_TOMORROW_FIXTURES: "basketballTomorrowFixtures",
  BASKETBALL_FINISHED_FIXTURES: "basketballFinishedFixtures",
  BASKETBALL_STANDINGS: "basketballStandings",
  BASKETBALL_LEAGUES: "basketballLeagues",
  BASKETBALL_TEAMS: "basketballTeams",
  META: "meta",
});

const META_DOCS = Object.freeze({
  FOOTBALL_SCHEDULER: "footballScheduler",
  BASKETBALL_SCHEDULER: "basketballScheduler",
  FOOTBALL_BUDGET: "footballBudget",
  BASKETBALL_BUDGET: "basketballBudget",
});

// ───────────────────────────────────────────────
// API Config
// ───────────────────────────────────────────────
const API = Object.freeze({
  PAGE_SIZE: 100,
  DAILY_BUDGET: 100,
});

// ───────────────────────────────────────────────
// Cron — only tomorrow fetch at 3 AM UTC
// Standings & Leagues REMOVED — too expensive
// for free plan (19 req each = 38/week).
// Enable these when you upgrade.
// ───────────────────────────────────────────────
const SCHEDULER = Object.freeze({
  FIXTURES_DAILY: "0 3 * * *",
  // STANDINGS: "0 3 * * 0",    // DISABLED — 19 req/week
  // LEAGUES: "0 3 * * 0",      // DISABLED — 19 req/week
  BASKETBALL_FIXTURES_DAILY: "0 3 * * *",
  // BASKETBALL_LEAGUES: "0 3 * * 0",  // DISABLED
});

// ───────────────────────────────────────────────
// Live Polling — BUDGET-HARDENED
//
// Key change: DAILY_CAP per sport.
// Football gets 25 live requests/day max.
// Basketball gets 15 live requests/day max.
// That + 2 daily + 2 startup = 44 total.
// 56 requests reserved for safety.
//
// Intervals are SLOWER to stretch the cap:
//   Has live:    2 min (was 1 min)
//   No live:     10 min (was 5 min)
//   Low budget:  10 min
//   Critical:    30 min
//   Cap reached: 60 min (just check if new day reset)
// ───────────────────────────────────────────────
const LIVE_POLLING = Object.freeze({
  // Per-sport daily caps
  FOOTBALL_DAILY_LIVE_CAP: 25,
  BASKETBALL_DAILY_LIVE_CAP: 15,

  // Intervals (milliseconds)
  ACTIVE_INTERVAL_MS: 120000,        // 2 min — when live games exist
  NO_LIVE_CHECK_INTERVAL_MS: 600000, // 10 min — idle check
  LOW_BUDGET_INTERVAL_MS: 600000,    // 10 min — conserving
  CRITICAL_INTERVAL_MS: 1800000,     // 30 min — almost empty
  CAP_REACHED_INTERVAL_MS: 3600000,  // 60 min — wait for midnight

  // Budget thresholds
  LOW_BUDGET_THRESHOLD: 30,
  CRITICAL_BUDGET_THRESHOLD: 10,
  MIN_BUDGET_TO_POLL: 3,

  // Error handling
  MAX_CONSECUTIVE_ERRORS: 3,
  ERROR_BACKOFF_MS: 60000,
});

const FT_FETCH = Object.freeze({
  ENABLED: true,
  MIN_BUDGET_TO_FETCH: 10,
  DEDUP_KEY: "ftFetchedAt",
});

const RETRY = Object.freeze({
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 2000,
  MAX_DELAY_MS: 30000,
  JITTER: true,
});

const BATCH_MAX_OPS = 450;
const WRITE_TIMEOUT_MS = 30000;

const SPORT = Object.freeze({
  FOOTBALL: "football",
  BASKETBALL: "basketball",
});

// ───────────────────────────────────────────────
// Export
// ───────────────────────────────────────────────
module.exports = Object.freeze({
  TODAY, YESTERDAY, TOMORROW, formatDate, getDateOffset,
  LEAGUES, SEASON, STATUS, LIVE_STATUSES, FINISHED_STATUSES,
  BASKETBALL_LEAGUES, BASKETBALL_SEASON, BASKETBALL_STATUS,
  BASKETBALL_LIVE_STATUSES, BASKETBALL_FINISHED_STATUSES,
  COLLECTIONS, META_DOCS, API, SCHEDULER, LIVE_POLLING,
  FT_FETCH, RETRY, BATCH_MAX_OPS, WRITE_TIMEOUT_MS, SPORT,
  getCurrentSeason, getCurrentBasketballSeason,
});