// Budget-optimized — smart midnight rollover, dynamic live polling, smart FT recovery.

// ───────────────────────────────────────────────
// DATES & SEASONS
// ───────────────────────────────────────────────
function getCurrentSeason() {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

function getCurrentBasketballSeason() {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

function getDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

const SEASON = getCurrentSeason();
const BASKETBALL_SEASON = getCurrentBasketballSeason();
const TODAY = formatDate(new Date());
const YESTERDAY = getDateOffset(-1);
const TOMORROW = getDateOffset(1);

// ───────────────────────────────────────────────
// LEAGUE CONFIGURATION
// ───────────────────────────────────────────────
const TRACK_ALL_LEAGUES = true;

// Tier 1: Daily, Live, FT Recovery, Standings, Teams
// Tier 2: Daily, FT Recovery (No Live)
// Tier 3: Daily, FT Recovery only (No Live, No Standings)
const LEAGUES = Object.freeze([
  // TIER 1: Major European Leagues & International Tournaments
  { id: 39,  name: "Premier League",         country: "England",    flag: "🏴",  season: SEASON, priority: 1,  tier: 1, active: true },
  { id: 140, name: "La Liga",                country: "Spain",      flag: "🇪🇸", season: SEASON, priority: 2,  tier: 1, active: true },
  { id: 135, name: "Serie A",                country: "Italy",      flag: "🇮🇹", season: SEASON, priority: 3,  tier: 1, active: true },
  { id: 78,  name: "Bundesliga",             country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 4,  tier: 1, active: true },
  { id: 61,  name: "Ligue 1",                country: "France",     flag: "🇫🇷", season: SEASON, priority: 5,  tier: 1, active: true },
  { id: 2,   name: "UEFA Champions League",  country: "World",      flag: "🇪🇺", season: SEASON, priority: 6,  tier: 1, active: true },
  { id: 3,   name: "UEFA Europa League",     country: "World",      flag: "🇪🇺", season: SEASON, priority: 7,  tier: 1, active: true },
  { id: 848, name: "UEFA Conference League", country: "World",      flag: "🇪🇺", season: SEASON, priority: 8,  tier: 1, active: true },
  { id: 1,   name: "World Cup",              country: "World",      flag: "🌍", season: SEASON, priority: 9,  tier: 1, active: true },
  { id: 4,   name: "Euro Championship",      country: "World",      flag: "🇪🇺", season: SEASON, priority: 10, tier: 1, active: true },
  { id: 5,   name: "UEFA Nations League",    country: "World",      flag: "🇪🇺", season: SEASON, priority: 11, tier: 1, active: true },
  { id: 679, name: "U20 World Cup",          country: "World",      flag: "🌍", season: SEASON, priority: 12, tier: 1, active: true },

  // TIER 2: Summer Leagues & Global Active Leagues
  { id: 71,  name: "Serie A",                country: "Brazil",     flag: "🇧🇷", season: SEASON, priority: 13, tier: 2, active: true },
  { id: 72,  name: "Serie B",                country: "Brazil",     flag: "🇧🇷", season: SEASON, priority: 14, tier: 2, active: true },
  { id: 128, name: "Primera División",       country: "Argentina",  flag: "🇦🇷", season: SEASON, priority: 15, tier: 2, active: true },
  { id: 129, name: "Primera Nacional",       country: "Argentina",  flag: "🇦🇷", season: SEASON, priority: 16, tier: 2, active: true },
  { id: 253, name: "MLS",                    country: "USA",        flag: "🇺🇸", season: SEASON, priority: 17, tier: 2, active: true },
  { id: 113, name: "Allsvenskan",            country: "Sweden",     flag: "🇸🇪", season: SEASON, priority: 18, tier: 2, active: true },
  { id: 103, name: "Eliteserien",            country: "Norway",     flag: "🇳🇴", season: SEASON, priority: 19, tier: 2, active: true },
  { id: 119, name: "Superliga",              country: "Denmark",    flag: "🇩🇰", season: SEASON, priority: 20, tier: 2, active: true },
  { id: 244, name: "Veikkausliiga",          country: "Finland",    flag: "🇫🇮", season: SEASON, priority: 21, tier: 2, active: true },
  { id: 98,  name: "J1 League",              country: "Japan",      flag: "🇯🇵", season: SEASON, priority: 22, tier: 2, active: true },
  { id: 292, name: "K League 1",             country: "South Korea",flag: "🇰🇷", season: SEASON, priority: 23, tier: 2, active: true },
  { id: 307, name: "Saudi Pro League",       country: "Saudi Arabia",flag: "🇸🇦", season: SEASON, priority: 24, tier: 2, active: true },
  { id: 169, name: "Chinese Super League",   country: "China",      flag: "🇨🇳", season: SEASON, priority: 25, tier: 2, active: true },
  { id: 40,  name: "Championship",           country: "England",    flag: "🏴",  season: SEASON, priority: 26, tier: 2, active: true },
  { id: 94,  name: "Primeira Liga",          country: "Portugal",   flag: "🇵🇹", season: SEASON, priority: 27, tier: 2, active: true },
  { id: 88,  name: "Eredivisie",             country: "Netherlands",flag: "🇳🇱", season: SEASON, priority: 28, tier: 2, active: true },
  { id: 203, name: "Süper Lig",              country: "Turkey",     flag: "🇹🇷", season: SEASON, priority: 29, tier: 2, active: true },

  // TIER 3: Lower Divisions & Obscure Competitions
  { id: 131, name: "Primera B Metropolitana",country: "Argentina",  flag: "🇦🇷", season: SEASON, priority: 30, tier: 3, active: true },
  { id: 44,  name: "FA Cup",                 country: "England",    flag: "🏴",  season: SEASON, priority: 31, tier: 3, active: false },
  { id: 45,  name: "League Cup",             country: "England",    flag: "🏴",  season: SEASON, priority: 32, tier: 3, active: false },
  { id: 143, name: "Copa del Rey",           country: "Spain",      flag: "🇪🇸", season: SEASON, priority: 33, tier: 3, active: false },
  { id: 137, name: "Coppa Italia",           country: "Italy",      flag: "🇮🇹", season: SEASON, priority: 34, tier: 3, active: false },
  { id: 81,  name: "DFB Pokal",              country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 35, tier: 3, active: false },
  { id: 66,  name: "Coupe de France",        country: "France",     flag: "🇫🇷", season: SEASON, priority: 36, tier: 3, active: false },
  { id: 50,  name: "Premiership",            country: "Scotland",   flag: "🏴",  season: SEASON, priority: 37, tier: 3, active: false },
  { id: 144, name: "First Division A",       country: "Belgium",    flag: "🇧🇪", season: SEASON, priority: 38, tier: 3, active: false },
  { id: 121, name: "Bundesliga",             country: "Austria",    flag: "🇦🇹", season: SEASON, priority: 39, tier: 3, active: false },
  { id: 105, name: "Super League",           country: "Greece",     flag: "🇬🇷", season: SEASON, priority: 40, tier: 3, active: false },
  { id: 41,  name: "League One",             country: "England",    flag: "🏴",  season: SEASON, priority: 41, tier: 3, active: false },
  { id: 42,  name: "League Two",             country: "England",    flag: "🏴",  season: SEASON, priority: 42, tier: 3, active: false },
  { id: 43,  name: "National League",        country: "England",    flag: "🏴",  season: SEASON, priority: 43, tier: 3, active: false },
  { id: 141, name: "Segunda División",       country: "Spain",      flag: "🇪🇸", season: SEASON, priority: 44, tier: 3, active: false },
  { id: 136, name: "Serie B",                country: "Italy",      flag: "🇮🇹", season: SEASON, priority: 45, tier: 3, active: false },
  { id: 79,  name: "2. Bundesliga",          country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 46, tier: 3, active: false },
  { id: 62,  name: "Ligue 2",                country: "France",     flag: "🇫🇷", season: SEASON, priority: 47, tier: 3, active: false },
  { id: 262, name: "Liga MX",                country: "Mexico",     flag: "🇲🇽", season: SEASON, priority: 48, tier: 3, active: false },
]);

const BASKETBALL_LEAGUES = Object.freeze([
  { id: 12, name: "NBA",        country: "USA",      flag: "🇺🇸", season: BASKETBALL_SEASON, priority: 1, tier: 1, active: true },
  { id: 13, name: "EuroLeague", country: "Europe",   flag: "🇪🇺", season: BASKETBALL_SEASON, priority: 2, tier: 2, active: true },
  { id: 14, name: "EuroCup",    country: "Europe",   flag: "🇪🇺", season: BASKETBALL_SEASON, priority: 3, tier: 2, active: false },
  { id: 44, name: "Liga ACB",   country: "Spain",    flag: "🇪🇸", season: BASKETBALL_SEASON, priority: 4, tier: 2, active: false },
  { id: 34, name: "LBA",        country: "Italy",    flag: "🇮🇹", season: BASKETBALL_SEASON, priority: 5, tier: 3, active: false },
  { id: 32, name: "BBL",        country: "Germany",  flag: "🇩🇪", season: BASKETBALL_SEASON, priority: 6, tier: 3, active: false },
  { id: 36, name: "LNB Pro A",  country: "France",   flag: "🇫🇷", season: BASKETBALL_SEASON, priority: 7, tier: 3, active: false },
  { id: 49, name: "NBL",        country: "Australia",flag: "🇦🇺", season: BASKETBALL_SEASON, priority: 8, tier: 3, active: false },
]);

// ───────────────────────────────────────────────
// STATUS CODES
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
// COLLECTIONS & META
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
// API & SCHEDULER CONFIG
// ───────────────────────────────────────────────
const API = Object.freeze({
  PAGE_SIZE: 100,
  DAILY_BUDGET: 100,
});

const SCHEDULER = Object.freeze({
  FIXTURES_DAILY: "0 3 * * *",
  BASKETBALL_FIXTURES_DAILY: "0 3 * * *",
});

// ───────────────────────────────────────────────
// SMART POLLING & BUDGET STRATEGY
// ───────────────────────────────────────────────
const LIVE_POLLING = Object.freeze({
  // ── DAILY CAPS ──
  // Football: 60 (↑ from 40). Leaves ~40 for basketball(15) + daily(2) +
  // yesterday backfill(1) + retries + manual refresh + safety margin.
  // Even on a 1k-match day, pacing prevents depletion.
  FOOTBALL_DAILY_LIVE_CAP: 60,
  BASKETBALL_DAILY_LIVE_CAP: 15,

  // ── LIVE-COUNT-BASED INTERVALS (desired, used when budget is healthy) ──
  // These are the "ideal" intervals per the user's spec.
  IDLE_INTERVAL_MS:        3600000,  // 60 min  — no live matches
  LOW_LIVE_INTERVAL_MS:    900000,   // 15 min  — 1–5 live
  MEDIUM_LIVE_INTERVAL_MS: 600000,   // 10 min  — 6–15 live
  HIGH_LIVE_INTERVAL_MS:   300000,   //  5 min  — 16+ live
  NEAR_FINISH_INTERVAL_MS: 150000,   // 2.5 min — any match at 80'+ or ET/BT/P

  // ── BUDGET-TIER FLOORS (override desired interval when budget tightens) ──
  // > 50 remaining        → HEALTHY  (no floor — use desired interval)
  // 20–50 remaining       → NORMAL   (floor: 30 min)
  // 10–20 remaining       → CRITICAL (floor: 1 hour)
  // < 10 remaining        → RESERVE  (floor: 2 hours)
  // 0 remaining           → EXHAUSTED (skip entirely)
  BUDGET_HEALTHY_THRESHOLD:  50,
  BUDGET_NORMAL_THRESHOLD:   20,
  BUDGET_CRITICAL_THRESHOLD: 10,
  MIN_BUDGET_TO_POLL:        3,

  BUDGET_NORMAL_FLOOR_MS:    1800000,  // 30 min
  BUDGET_CRITICAL_FLOOR_MS:  3600000,  // 1 hour
  BUDGET_RESERVE_FLOOR_MS:   7200000,  // 2 hours

  // ── CAP-TIER FLOORS (override when daily live-cap is nearly exhausted) ──
  // > 15 cap calls left    → OK       (no floor)
  // 6–15 cap calls left    → LOW      (floor: 15 min)
  // 1–5 cap calls left     → CRITICAL (floor: 30 min)
  // 0 cap calls left       → EXHAUSTED (poll every 1 hour — free, no API call)
  CAP_NORMAL_REMAINING:    15,
  CAP_CRITICAL_REMAINING:  5,
  CAP_FT_RESERVE:          4,  // Always hold 4 calls for FT recovery sweeps

  CAP_LOW_FLOOR_MS:          900000,   // 15 min
  CAP_CRITICAL_FLOOR_MS:     1800000,  // 30 min
  CAP_EXHAUSTED_INTERVAL_MS: 3600000,  // 1 hour (service short-circuits — 0 API cost)

  // ── FT RECOVERY ──
  FT_CONFIRMATION_DELAY_MS: 60000,  // 1 min — immediate re-poll after last live game ends

  // ── ERROR HANDLING ──
  MAX_CONSECUTIVE_ERRORS: 3,
  ERROR_BACKOFF_MS:       60000,
});

// ───────────────────────────────────────────────
// FT RECOVERY STRATEGY
// ───────────────────────────────────────────────
const FT_RECOVERY = Object.freeze({
  ENABLED: true,
  MIN_BUDGET_TO_FETCH: 5,
  COOLDOWN_MS: 900000, // 15 mins between bulk FT recovery sweeps
  DEDUP_KEY: "ftRecoveredAt",
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
// EXPORTS
// ───────────────────────────────────────────────
module.exports = Object.freeze({
  TODAY, YESTERDAY, TOMORROW, formatDate, getDateOffset,
  LEAGUES, SEASON, STATUS, LIVE_STATUSES, FINISHED_STATUSES,
  BASKETBALL_LEAGUES, BASKETBALL_SEASON, BASKETBALL_STATUS,
  BASKETBALL_LIVE_STATUSES, BASKETBALL_FINISHED_STATUSES,
  COLLECTIONS, META_DOCS, API, SCHEDULER, LIVE_POLLING, FT_RECOVERY,
  RETRY, BATCH_MAX_OPS, WRITE_TIMEOUT_MS, SPORT,
  TRACK_ALL_LEAGUES,
  getCurrentSeason, getCurrentBasketballSeason,
});