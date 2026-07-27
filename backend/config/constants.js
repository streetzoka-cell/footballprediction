// Budget-optimized — smart midnight rollover, dynamic live polling, smart FT recovery.

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
// LEAGUE CONFIGURATION
// ───────────────────────────────────────────────
// ★ FETCH ALL LEAGUES EXACTLY LIKE LIVESCORE ★
// By setting TRACK_ALL_LEAGUES to true, the script will automatically fetch 
// every single league available on the API for the date (Friendlies, Lower tiers, 
// Women's, Youth, etc.) — exactly replicating the LiveScore app behavior. 
// The LEAGUES array below is kept to assign Priority and Tier metadata to the 
// top competitions so the budget optimizer knows which matches to poll most frequently.
const TRACK_ALL_LEAGUES = true; 
const BLOCKED_LEAGUE_IDS = new Set([]);

const LEAGUES = Object.freeze([
  // INTERNATIONAL & FRIENDLIES (Will be fetched automatically when TRACK_ALL_LEAGUES is true)
  { id: 1,   name: "World Cup",              country: "World",      flag: "🌍", season: SEASON, priority: 1,  tier: 1, active: true },
  { id: 4,   name: "Euro Championship",      country: "World",      flag: "🇪🇺", season: SEASON, priority: 2,  tier: 1, active: true },
  { id: 5,   name: "UEFA Nations League",    country: "World",      flag: "🇪🇺", season: SEASON, priority: 3,  tier: 1, active: true },
  { id: 2,   name: "UEFA Champions League",  country: "World",      flag: "🇪🇺", season: SEASON, priority: 4,  tier: 1, active: true },
  { id: 3,   name: "UEFA Europa League",     country: "World",      flag: "🇪🇺", season: SEASON, priority: 5,  tier: 1, active: true },
  { id: 848, name: "UEFA Conference League", country: "World",      flag: "🇪🇺", season: SEASON, priority: 6,  tier: 1, active: true },
  { id: 13,  name: "Copa Libertadores",      country: "World",      flag: "🌍", season: SEASON, priority: 7,  tier: 1, active: true },
  { id: 10,  name: "Club Friendlies",        country: "World",      flag: "🌍", season: SEASON, priority: 8,  tier: 2, active: true },

  // ENGLAND
  { id: 39,  name: "Premier League",         country: "England",    flag: "🏴",  season: SEASON, priority: 10, tier: 1, active: true },
  { id: 40,  name: "Championship",           country: "England",    flag: "🏴",  season: SEASON, priority: 11, tier: 2, active: true },
  { id: 41,  name: "League One",             country: "England",    flag: "🏴",  season: SEASON, priority: 12, tier: 3, active: true },
  { id: 42,  name: "League Two",             country: "England",    flag: "🏴",  season: SEASON, priority: 13, tier: 3, active: true },
  { id: 45,  name: "FA Cup",                 country: "England",    flag: "🏴",  season: SEASON, priority: 14, tier: 2, active: true },
  { id: 48,  name: "EFL Cup",                country: "England",    flag: "🏴",  season: SEASON, priority: 15, tier: 2, active: true },

  // SPAIN
  { id: 140, name: "La Liga",                country: "Spain",      flag: "🇪🇸", season: SEASON, priority: 20, tier: 1, active: true },
  { id: 141, name: "Segunda División",       country: "Spain",      flag: "🇪🇸", season: SEASON, priority: 21, tier: 2, active: true },
  { id: 143, name: "Copa del Rey",           country: "Spain",      flag: "🇪🇸", season: SEASON, priority: 22, tier: 2, active: true },

  // ITALY
  { id: 135, name: "Serie A",                country: "Italy",      flag: "🇮🇹", season: SEASON, priority: 30, tier: 1, active: true },
  { id: 136, name: "Serie B",                country: "Italy",      flag: "🇮🇹", season: SEASON, priority: 31, tier: 2, active: true },
  { id: 137, name: "Coppa Italia",           country: "Italy",      flag: "🇮🇹", season: SEASON, priority: 32, tier: 2, active: true },

  // GERMANY
  { id: 78,  name: "Bundesliga",             country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 40, tier: 1, active: true },
  { id: 79,  name: "2. Bundesliga",          country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 41, tier: 2, active: true },
  { id: 80,  name: "3. Liga",                country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 42, tier: 3, active: true },
  { id: 81,  name: "DFB Pokal",              country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 43, tier: 2, active: true },

  // FRANCE
  { id: 61,  name: "Ligue 1",                country: "France",     flag: "🇫🇷", season: SEASON, priority: 50, tier: 1, active: true },
  { id: 62,  name: "Ligue 2",                country: "France",     flag: "🇫🇷", season: SEASON, priority: 51, tier: 2, active: true },
  { id: 66,  name: "Coupe de France",        country: "France",     flag: "🇫🇷", season: SEASON, priority: 52, tier: 2, active: true },

  // OTHER EUROPEAN MAJORS
  { id: 94,  name: "Primeira Liga",          country: "Portugal",   flag: "🇵🇹", season: SEASON, priority: 60, tier: 1, active: true },
  { id: 88,  name: "Eredivisie",             country: "Netherlands",flag: "🇳🇱", season: SEASON, priority: 61, tier: 1, active: true },
  { id: 144, name: "First Division A",       country: "Belgium",    flag: "🇧🇪", season: SEASON, priority: 62, tier: 1, active: true },
  { id: 203, name: "Süper Lig",              country: "Turkey",     flag: "🇹🇷", season: SEASON, priority: 63, tier: 1, active: true },
  { id: 105, name: "Super League",           country: "Greece",     flag: "🇬🇷", season: SEASON, priority: 64, tier: 1, active: true },
  { id: 235, name: "Premiership",            country: "Scotland",   flag: "🏴",  season: SEASON, priority: 65, tier: 2, active: true },
  { id: 106, name: "Ekstraklasa",            country: "Poland",     flag: "🇵🇱", season: SEASON, priority: 66, tier: 2, active: true },
  { id: 333, name: "Premier League",         country: "Ukraine",    flag: "🇺🇦", season: SEASON, priority: 67, tier: 2, active: true },
  { id: 345, name: "First League",           country: "Czechia",    flag: "🇨🇿", season: SEASON, priority: 68, tier: 2, active: true },
  { id: 207, name: "Super League",           country: "Switzerland",flag: "🇨🇭", season: SEASON, priority: 69, tier: 2, active: true },
  { id: 218, name: "Bundesliga",             country: "Austria",    flag: "🇦🇹", season: SEASON, priority: 70, tier: 2, active: true },
  { id: 113, name: "Allsvenskan",            country: "Sweden",     flag: "🇸🇪", season: SEASON, priority: 71, tier: 2, active: true },
  { id: 103, name: "Eliteserien",            country: "Norway",     flag: "🇳🇴", season: SEASON, priority: 72, tier: 2, active: true },

  // AMERICAS
  { id: 71,  name: "Serie A",                country: "Brazil",     flag: "🇧🇷", season: SEASON, priority: 80, tier: 1, active: true },
  { id: 128, name: "Primera División",       country: "Argentina",  flag: "🇦🇷", season: SEASON, priority: 81, tier: 1, active: true },
  { id: 253, name: "MLS",                    country: "USA",        flag: "🇺🇸", season: SEASON, priority: 82, tier: 1, active: true },
  { id: 262, name: "Liga MX",                country: "Mexico",     flag: "🇲🇽", season: SEASON, priority: 83, tier: 1, active: true },

  // ASIA
  { id: 98,  name: "J1 League",              country: "Japan",      flag: "🇯🇵", season: SEASON, priority: 90, tier: 1, active: true },
  { id: 292, name: "K League 1",             country: "South Korea",flag: "🇰🇷", season: SEASON, priority: 91, tier: 1, active: true },
  { id: 307, name: "Saudi Pro League",       country: "Saudi Arabia",flag: "🇸🇦", season: SEASON, priority: 92, tier: 1, active: true },
  { id: 169, name: "Chinese Super League",   country: "China",      flag: "🇨🇳", season: SEASON, priority: 93, tier: 2, active: true },
  
  // NOTE: Because TRACK_ALL_LEAGUES is true, all other lower-tier leagues 
  // (e.g., Argentina Federal A, Norway 3. Division, USL League One, etc.) 
  // will be automatically fetched and stored in the database. 
  // They will be assigned a default priority/tier if not explicitly listed above.
]);

const BASKETBALL_LEAGUES = Object.freeze([
  { id: 12, name: "NBA",        country: "USA",      flag: "🇺🇸", season: BASKETBALL_SEASON, priority: 1, tier: 1, active: true },
  { id: 13, name: "EuroLeague", country: "Europe",   flag: "🇪🇺", season: BASKETBALL_SEASON, priority: 2, tier: 2, active: true },
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
const BASKETBALL_STATUS = Object.freeze({ NOT_STARTED: "NS", FIRST_QUARTER: "1Q", BETWEEN_Q1_Q2: "Q1", SECOND_QUARTER: "2Q", BETWEEN_Q2_Q3: "Q2", THIRD_QUARTER: "3Q", BETWEEN_Q3_Q4: "Q3", FOURTH_QUARTER: "4Q", OVERTIME: "OT", FINISHED: "FT", POSTPONED: "POSTP", CANCELLED: "CANC", SUSPENDED: "SUSP", ABANDONED: "ABD", LIVE: "LIVE" });
const BASKETBALL_LIVE_STATUSES = Object.freeze([ BASKETBALL_STATUS.FIRST_QUARTER, BASKETBALL_STATUS.BETWEEN_Q1_Q2, BASKETBALL_STATUS.SECOND_QUARTER, BASKETBALL_STATUS.BETWEEN_Q2_Q3, BASKETBALL_STATUS.THIRD_QUARTER, BASKETBALL_STATUS.BETWEEN_Q3_Q4, BASKETBALL_STATUS.FOURTH_QUARTER, BASKETBALL_STATUS.OVERTIME ]);
const BASKETBALL_FINISHED_STATUSES = Object.freeze([ BASKETBALL_STATUS.FINISHED, BASKETBALL_STATUS.ABANDONED ]);

const COLLECTIONS = Object.freeze({
  LIVE_FIXTURES: "liveFixtures", YESTERDAY_FIXTURES: "yesterdayFixtures", TODAY_FIXTURES: "todayFixtures", TOMORROW_FIXTURES: "tomorrowFixtures", FINISHED_FIXTURES: "finishedFixtures", STANDINGS: "standings", LEAGUES: "leagues", TEAMS: "teams", BASKETBALL_LIVE_FIXTURES: "basketballLiveFixtures", BASKETBALL_YESTERDAY_FIXTURES: "basketballYesterdayFixtures", BASKETBALL_TODAY_FIXTURES: "basketballTodayFixtures", BASKETBALL_TOMORROW_FIXTURES: "basketballTomorrowFixtures", BASKETBALL_FINISHED_FIXTURES: "basketballFinishedFixtures", BASKETBALL_STANDINGS: "basketballStandings", BASKETBALL_LEAGUES: "basketballLeagues", BASKETBALL_TEAMS: "basketballTeams", META: "meta",
});
const META_DOCS = Object.freeze({ FOOTBALL_SCHEDULER: "footballScheduler", BASKETBALL_SCHEDULER: "basketballScheduler", FOOTBALL_BUDGET: "footballBudget", BASKETBALL_BUDGET: "basketballBudget" });

const API = Object.freeze({ PAGE_SIZE: 100, DAILY_BUDGET: 100 });
const SCHEDULER = Object.freeze({ FIXTURES_DAILY: "0 3 * * *", BASKETBALL_FIXTURES_DAILY: "0 3 * * *" });

// ★ SMART BUDGET TUNING (100 calls/day max)
// Density aware: 41+ matches = 3m, 16-40 = 5m, 6-15 = 10m, 1-5 = 15m. IDLE = 30m.
// Dynamic Pacing: Will mathematically stretch intervals if budget is running low to NEVER finish before midnight.
const LIVE_POLLING = Object.freeze({
  FOOTBALL_DAILY_LIVE_CAP: 90,
  BASKETBALL_DAILY_LIVE_CAP: 20,
  IDLE_INTERVAL_MS:           1800000, // 30 min
  LOW_LIVE_INTERVAL_MS:       900000,  // 15 min (1–5 live matches)
  MEDIUM_LIVE_INTERVAL_MS:    600000,  // 10 min (6–15 live matches)
  HIGH_LIVE_INTERVAL_MS:      300000,  // 5 min  (16–40 live matches)
  MASSIVE_LIVE_INTERVAL_MS:   180000,  // 3 min  (41+ live matches)
  NEAR_FINISH_INTERVAL_MS:    300000,  // 5 min  (80'+ / ET / PEN)
  RESERVE_FOR_DAILY_CRON:     5,       // Strictly reserve 5 calls for daily cron jobs
  MIN_BUDGET_TO_POLL:         2,
  BUDGET_NORMAL_THRESHOLD:    25,
  BUDGET_CRITICAL_THRESHOLD:  10,
  FT_CONFIRMATION_DELAY_MS:   30000,
  MAX_CONSECUTIVE_ERRORS:     3,
  ERROR_BACKOFF_MS:           60000,
});

const FT_RECOVERY = Object.freeze({ ENABLED: true, MIN_BUDGET_TO_FETCH: 2, COOLDOWN_MS: 900000, DEDUP_KEY: "ftRecoveredAt" });
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