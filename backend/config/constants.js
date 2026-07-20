// Budget-optimized — smart midnight rollover, dynamic live polling, smart FT recovery.

// ───────────────────────────────────────────────
// DATES & SEASONS
// ───────────────────────────────────────────────
function getCurrentSeason() {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 3600000); 
  return eat.getUTCMonth() >= 7 ? eat.getUTCFullYear() : eat.getUTCFullYear() - 1;
}

function getCurrentBasketballSeason() {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 3600000);
  const year = eat.getUTCFullYear();
  return eat.getUTCMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function formatDate(d) {
  const eat = new Date(d.getTime() + 3 * 3600000);
  return eat.toISOString().split("T")[0];
}

function getDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

function getLocalDateFromUtc(utcDateStr) {
  if (!utcDateStr) return null;
  try {
    const d = new Date(utcDateStr);
    const eat = new Date(d.getTime() + 3 * 3600000);
    return eat.toISOString().split("T")[0];
  } catch {
    return null;
  }
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

const BLOCKED_LEAGUE_IDS = new Set([
  // Add any obscure league IDs here to block them
]);

const LEAGUES = Object.freeze([
  // ─── FRIENDLIES & INTERNATIONAL (Active in Summer) ───
  { id: 1,   name: "World Cup",              country: "World",      flag: "🌍", season: SEASON, priority: 1,  tier: 1, active: true },
  { id: 4,   name: "Euro Championship",      country: "World",      flag: "🇪🇺", season: SEASON, priority: 2,  tier: 1, active: true },
  { id: 5,   name: "UEFA Nations League",    country: "World",      flag: "🇪🇺", season: SEASON, priority: 3,  tier: 1, active: true },
  { id: 679, name: "U20 World Cup",          country: "World",      flag: "🌍", season: SEASON, priority: 4,  tier: 1, active: true },
  
  // ─── ENGLAND ───
  { id: 39,  name: "Premier League",         country: "England",    flag: "🏴",  season: SEASON, priority: 5,  tier: 1, active: true },
  { id: 40,  name: "Championship",           country: "England",    flag: "🏴",  season: SEASON, priority: 6,  tier: 2, active: true },
  { id: 41,  name: "League One",             country: "England",    flag: "🏴",  season: SEASON, priority: 7,  tier: 3, active: true },
  { id: 42,  name: "League Two",             country: "England",    flag: "🏴",  season: SEASON, priority: 8,  tier: 3, active: true },
  { id: 45,  name: "FA Cup",                 country: "England",    flag: "🏴",  season: SEASON, priority: 9,  tier: 2, active: true },
  { id: 48,  name: "EFL Cup",                country: "England",    flag: "🏴",  season: SEASON, priority: 10, tier: 2, active: true },

  // ─── SPAIN ───
  { id: 140, name: "La Liga",                country: "Spain",      flag: "🇪🇸", season: SEASON, priority: 11, tier: 1, active: true },
  { id: 141, name: "Segunda División",       country: "Spain",      flag: "🇪🇸", season: SEASON, priority: 12, tier: 2, active: true },
  { id: 143, name: "Copa del Rey",           country: "Spain",      flag: "🇪🇸", season: SEASON, priority: 13, tier: 2, active: true },

  // ─── ITALY ───
  { id: 135, name: "Serie A",                country: "Italy",      flag: "🇮🇹", season: SEASON, priority: 14, tier: 1, active: true },
  { id: 136, name: "Serie B",                country: "Italy",      flag: "🇮🇹", season: SEASON, priority: 15, tier: 2, active: true },
  { id: 137, name: "Coppa Italia",           country: "Italy",      flag: "🇮🇹", season: SEASON, priority: 16, tier: 2, active: true },

  // ─── GERMANY ───
  { id: 78,  name: "Bundesliga",             country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 17, tier: 1, active: true },
  { id: 79,  name: "2. Bundesliga",          country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 18, tier: 2, active: true },
  { id: 80,  name: "3. Liga",                country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 19, tier: 3, active: true },
  { id: 81,  name: "DFB Pokal",              country: "Germany",    flag: "🇩🇪", season: SEASON, priority: 20, tier: 2, active: true },

  // ─── FRANCE ───
  { id: 61,  name: "Ligue 1",                country: "France",     flag: "🇫🇷", season: SEASON, priority: 21, tier: 1, active: true },
  { id: 62,  name: "Ligue 2",                country: "France",     flag: "🇫🇷", season: SEASON, priority: 22, tier: 2, active: true },
  { id: 66,  name: "Coupe de France",        country: "France",     flag: "🇫🇷", season: SEASON, priority: 23, tier: 2, active: true },

  // ─── OTHER EUROPEAN MAJORS ───
  { id: 94,  name: "Primeira Liga",          country: "Portugal",   flag: "🇵🇹", season: SEASON, priority: 24, tier: 1, active: true },
  { id: 88,  name: "Eredivisie",             country: "Netherlands",flag: "🇳🇱", season: SEASON, priority: 25, tier: 1, active: true },
  { id: 144, name: "First Division A",       country: "Belgium",    flag: "🇧🇪", season: SEASON, priority: 26, tier: 1, active: true },
  { id: 203, name: "Süper Lig",              country: "Turkey",     flag: "🇹🇷", season: SEASON, priority: 27, tier: 1, active: true },
  { id: 105, name: "Super League",           country: "Greece",     flag: "🇬🇷", season: SEASON, priority: 28, tier: 1, active: true },
  { id: 235, name: "Premiership",            country: "Scotland",   flag: "🏴",  season: SEASON, priority: 29, tier: 2, active: true },

  // ─── SUMMER EUROPEAN LEAGUES (Active July/August) ───
  { id: 106, name: "Ekstraklasa",            country: "Poland",     flag: "🇵🇱", season: SEASON, priority: 30, tier: 2, active: true },
  { id: 333, name: "Premier League",         country: "Ukraine",    flag: "🇺🇦", season: SEASON, priority: 31, tier: 2, active: true },
  { id: 345, name: "First League",           country: "Czechia",    flag: "🇨🇿", season: SEASON, priority: 33, tier: 2, active: true },
  { id: 207, name: "Super League",           country: "Switzerland",flag: "🇨🇭", season: SEASON, priority: 34, tier: 2, active: true },
  { id: 218, name: "Bundesliga",             country: "Austria",    flag: "🇦🇹", season: SEASON, priority: 35, tier: 2, active: true },

  // ─── SUMMER LEAGUES (Americas) ───
  { id: 71,  name: "Serie A",                country: "Brazil",     flag: "🇧🇷", season: SEASON, priority: 36, tier: 2, active: true },
  { id: 72,  name: "Serie B",                country: "Brazil",     flag: "🇧🇷", season: SEASON, priority: 37, tier: 2, active: true },
  { id: 84,  name: "Copa do Brasil",         country: "Brazil",     flag: "🇧🇷", season: SEASON, priority: 38, tier: 2, active: true },
  { id: 128, name: "Primera División",       country: "Argentina",  flag: "🇦🇷", season: SEASON, priority: 39, tier: 2, active: true },
  { id: 129, name: "Primera Nacional",       country: "Argentina",  flag: "🇦🇷", season: SEASON, priority: 40, tier: 3, active: true },
  { id: 234, name: "Copa Argentina",         country: "Argentina",  flag: "🇦🇷", season: SEASON, priority: 41, tier: 3, active: true },
  { id: 253, name: "MLS",                    country: "USA",        flag: "🇺🇸", season: SEASON, priority: 42, tier: 2, active: true },
  { id: 262, name: "Liga MX",                country: "Mexico",     flag: "🇲🇽", season: SEASON, priority: 43, tier: 2, active: true },
  { id: 242, name: "Ecuador Serie A",        country: "Ecuador",    flag: "🇪🇨", season: SEASON, priority: 44, tier: 3, active: true },
  { id: 250, name: "Primera División",       country: "Paraguay",   flag: "🇵🇾", season: SEASON, priority: 45, tier: 3, active: true },
  { id: 263, name: "Primera División",       country: "Chile",      flag: "🇨🇱", season: SEASON, priority: 46, tier: 3, active: true },
  { id: 271, name: "Primera División",       country: "Peru",       flag: "🇵🇪", season: SEASON, priority: 47, tier: 3, active: true },
  { id: 239, name: "Primera A",              country: "Colombia",   flag: "🇨🇴", season: SEASON, priority: 48, tier: 3, active: true },
  { id: 270, name: "Primera División",       country: "Uruguay",    flag: "🇺🇾", season: SEASON, priority: 49, tier: 3, active: true },

  // ─── ASIA & MIDDLE EAST ───
  { id: 98,  name: "J1 League",              country: "Japan",      flag: "🇯🇵", season: SEASON, priority: 50, tier: 2, active: true },
  { id: 99,  name: "J2 League",              country: "Japan",      flag: "🇯🇵", season: SEASON, priority: 51, tier: 3, active: true },
  { id: 292, name: "K League 1",             country: "South Korea",flag: "🇰🇷", season: SEASON, priority: 52, tier: 2, active: true },
  { id: 293, name: "K League 2",             country: "South Korea",flag: "🇰🇷", season: SEASON, priority: 53, tier: 3, active: true },
  { id: 307, name: "Saudi Pro League",       country: "Saudi Arabia",flag: "🇸🇦", season: SEASON, priority: 54, tier: 2, active: true },
  { id: 169, name: "Chinese Super League",   country: "China",      flag: "🇨🇳", season: SEASON, priority: 55, tier: 2, active: true },

  // ─── NORDIC (Summer) ───
  { id: 103, name: "Eliteserien",            country: "Norway",     flag: "🇳🇴", season: SEASON, priority: 56, tier: 2, active: true },
  { id: 113, name: "Allsvenskan",            country: "Sweden",     flag: "🇸🇪", season: SEASON, priority: 57, tier: 2, active: true },
  { id: 114, name: "Superettan",             country: "Sweden",     flag: "🇸🇪", season: SEASON, priority: 58, tier: 3, active: true },
  { id: 244, name: "Veikkausliiga",          country: "Finland",    flag: "🇫🇮", season: SEASON, priority: 59, tier: 3, active: true },
  { id: 119, name: "Superliga",              country: "Denmark",    flag: "🇩🇰", season: SEASON, priority: 60, tier: 2, active: true },
  { id: 188, name: "Premier Division",       country: "Ireland",    flag: "🇮🇪", season: SEASON, priority: 61, tier: 3, active: true },
  { id: 164, name: "Urvalsdeild",            country: "Iceland",    flag: "🇮🇸", season: SEASON, priority: 62, tier: 3, active: true },

  // ─── CONTINENTAL CLUB CUPS ───
  { id: 2,   name: "UEFA Champions League",  country: "World",      flag: "🇪🇺", season: SEASON, priority: 63, tier: 1, active: true },
  { id: 3,   name: "UEFA Europa League",     country: "World",      flag: "🇪🇺", season: SEASON, priority: 64, tier: 1, active: true },
  { id: 848, name: "UEFA Conference League", country: "World",      flag: "🇪🇺", season: SEASON, priority: 65, tier: 1, active: true },
  { id: 13,  name: "Copa Libertadores",      country: "World",      flag: "🌍", season: SEASON, priority: 66, tier: 2, active: true },
  { id: 11,  name: "Copa Sudamericana",      country: "World",      flag: "🌍", season: SEASON, priority: 67, tier: 2, active: true },
  { id: 17,  name: "AFC Champions League",   country: "World",      flag: "🌍", season: SEASON, priority: 68, tier: 2, active: true },
]);

const TOP_TEAMS_LIST = [
  'manchester united', 'manchester city', 'liverpool', 'chelsea', 'arsenal', 'tottenham hotspur', 'tottenham',
  'real madrid', 'barcelona', 'atletico madrid', 'athletic bilbao', 'sevilla', 'valencia',
  'bayern munich', 'borussia dortmund', 'rb leipzig', 'bayer leverkusen',
  'paris saint germain', 'psg', 'marseille', 'lyon',
  'juventus', 'inter', 'ac milan', 'napoli', 'roma', 'lazio', 'atalanta',
  'benfica', 'porto', 'sporting cp',
  'ajax', 'psv eindhoven', 'feyenoord',
  'celtic', 'rangers',
  'flamengo', 'palmeiras', 'corinthians', 'sao paulo',
  'boca juniors', 'river plate'
];
const TOP_TEAMS_SET = new Set(TOP_TEAMS_LIST);

const BASKETBALL_LEAGUES = Object.freeze([
  { id: 12, name: "NBA",        country: "USA",      flag: "🇺🇸", season: BASKETBALL_SEASON, priority: 1, tier: 1, active: true },
  { id: 13, name: "EuroLeague", country: "Europe",   flag: "🇪🇺", season: BASKETBALL_SEASON, priority: 2, tier: 2, active: true },
]);

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

const API = Object.freeze({ PAGE_SIZE: 100, DAILY_BUDGET: 100 });
const SCHEDULER = Object.freeze({ FIXTURES_DAILY: "0 3 * * *", BASKETBALL_FIXTURES_DAILY: "0 3 * * *" });

// ───────────────────────────────────────────────
// SMART POLLING & BUDGET STRATEGY
// ───────────────────────────────────────────────
const LIVE_POLLING = Object.freeze({
  // ── DAILY CAPS ──
  FOOTBALL_DAILY_LIVE_CAP: 50,
  BASKETBALL_DAILY_LIVE_CAP: 15,

  // ── LIVE-COUNT-BASED INTERVALS (desired) ──
  IDLE_INTERVAL_MS:        3600000,  // 60 min  — 0 live matches
  LOW_LIVE_INTERVAL_MS:    900000,   // 15 min  — 1–10 live
  MEDIUM_LIVE_INTERVAL_MS: 600000,   // 10 min  — 11–30 live
  HIGH_LIVE_INTERVAL_MS:   300000,   //  5 min  — 31–60 live
  MASSIVE_LIVE_INTERVAL_MS:300000,   //  5 min  — 61+ live (Was 3m, now 5m to save budget)
  NEAR_FINISH_INTERVAL_MS: 300000,   //  5 min  — any match at 80'+ (Was 2m, now 5m)

  // ── BUDGET-TIER FLOORS ──
  BUDGET_HEALTHY_THRESHOLD:  30,
  BUDGET_NORMAL_THRESHOLD:   15,
  BUDGET_CRITICAL_THRESHOLD: 8,
  MIN_BUDGET_TO_POLL:        3,

  BUDGET_NORMAL_FLOOR_MS:    900000,   // 15 min
  BUDGET_CRITICAL_FLOOR_MS:  1800000,  // 30 min
  BUDGET_RESERVE_FLOOR_MS:   3600000,  // 1 hour

  // ── CAP-TIER FLOORS ──
  CAP_NORMAL_REMAINING:    15,
  CAP_CRITICAL_REMAINING:  5,
  CAP_FT_RESERVE:          4,

  CAP_LOW_FLOOR_MS:          900000,   // 15 min
  CAP_CRITICAL_FLOOR_MS:     1800000,  // 30 min
  CAP_EXHAUSTED_INTERVAL_MS: 3600000,  // 1 hour

  FT_CONFIRMATION_DELAY_MS: 60000,
  MAX_CONSECUTIVE_ERRORS: 3,
  ERROR_BACKOFF_MS:       60000,
});

const FT_RECOVERY = Object.freeze({ ENABLED: true, MIN_BUDGET_TO_FETCH: 5, COOLDOWN_MS: 900000, DEDUP_KEY: "ftRecoveredAt" });
const RETRY = Object.freeze({ MAX_ATTEMPTS: 3, BASE_DELAY_MS: 2000, MAX_DELAY_MS: 30000, JITTER: true });
const BATCH_MAX_OPS = 450;
const WRITE_TIMEOUT_MS = 30000;
const SPORT = Object.freeze({ FOOTBALL: "football", BASKETBALL: "basketball" });

module.exports = Object.freeze({
  TODAY, YESTERDAY, TOMORROW, formatDate, getDateOffset, getLocalDateFromUtc,
  LEAGUES, SEASON, STATUS, LIVE_STATUSES, FINISHED_STATUSES,
  BASKETBALL_LEAGUES, BASKETBALL_SEASON, BASKETBALL_STATUS,
  BASKETBALL_LIVE_STATUSES, BASKETBALL_FINISHED_STATUSES,
  COLLECTIONS, META_DOCS, API, SCHEDULER, LIVE_POLLING, FT_RECOVERY,
  RETRY, BATCH_MAX_OPS, WRITE_TIMEOUT_MS, SPORT, TRACK_ALL_LEAGUES,
  BLOCKED_LEAGUE_IDS, 
  TOP_TEAMS_LIST, TOP_TEAMS_SET, 
  getCurrentSeason, getCurrentBasketballSeason,
});