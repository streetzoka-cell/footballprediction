/*
 * basketballApi.js
 * Central Axios client for API-Basketball.
 * Same budget tracking pattern as api.js but
 * independent counters — separate 100/day limit.
 */

const axios = require("axios");
const env = require("./env");
const logger = require("../utils/logger");
const { LIVE_POLLING } = require("./constants");

// ───────────────────────────────────────────────
// Is basketball configured?
// ───────────────────────────────────────────────
const isBasketballConfigured = Boolean(env.API_BASKETBALL_KEY);

// ───────────────────────────────────────────────
// Daily Request Budget Tracker
// ───────────────────────────────────────────────
let remainingRequests = null;
let lastResetDate = null;

function getTodayUTC() {
  return new Date().toISOString().split("T")[0];
}

function resetIfNewDay() {
  const today = getTodayUTC();
  if (lastResetDate !== today) {
    remainingRequests = null;
    lastResetDate = today;
    liveRequestsToday = 0;
    logger.info(`[BasketballAPI] New day (${today}) — budget + live counter reset`);
  }
}

function getBasketballRemainingRequests() {
  resetIfNewDay();
  return remainingRequests;
}

function isBasketballBudgetAvailable(required = 1) {
  resetIfNewDay();
  if (remainingRequests === null) return true;
  return remainingRequests >= required;
}

function updateFromHeader(headerValue) {
  if (headerValue !== undefined && headerValue !== null) {
    const parsed = parseInt(headerValue, 10);
    if (!isNaN(parsed)) {
      remainingRequests = parsed;
    }
  }
}

// ───────────────────────────────────────────────
// Live Request Counter
// ───────────────────────────────────────────────
let liveRequestsToday = 0;

function getBasketballLiveRequestsToday() {
  resetIfNewDay();
  return liveRequestsToday;
}

function isBasketballLiveCapAvailable() {
  resetIfNewDay();
  return liveRequestsToday < LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP;
}

function incrementBasketballLiveCounter() {
  resetIfNewDay();
  liveRequestsToday++;
  return liveRequestsToday;
}

// ───────────────────────────────────────────────
// Axios Instance — only created if key exists
// ───────────────────────────────────────────────
let basketballApi = null;

if (isBasketballConfigured) {
  basketballApi = axios.create({
    baseURL: env.API_BASKETBALL_BASE_URL,
    timeout: 15000,
    headers: {
      "x-apisports-key": env.API_BASKETBALL_KEY,
    },
  });

  // Request interceptor
  basketballApi.interceptors.request.use(
    (config) => {
      resetIfNewDay();

      if (remainingRequests !== null && remainingRequests <= 0) {
        const err = new Error(
          `Basketball API budget exhausted (0/100). Blocked: ${config.method?.toUpperCase()} ${config.url}`
        );
        err.code = "BUDGET_EXHAUSTED";
        logger.warn(`[BasketballAPI] ⛔ ${err.message}`);
        return Promise.reject(err);
      }

      const params = config.params ? JSON.stringify(config.params) : "";
      const budget = remainingRequests !== null ? `${remainingRequests}/100` : "???/100";

      logger.info(
        `[BasketballAPI] → ${config.method?.toUpperCase()} ${config.url} ${params} [${budget}]`
      );

      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor
  basketballApi.interceptors.response.use(
    (response) => {
      const headerRemaining =
        response.headers?.["x-ratelimit-requests-remaining"];
      updateFromHeader(headerRemaining);

      logger.info(
        `[BasketballAPI] ← ${response.config.url} [${remainingRequests}/100]`
      );

      return response.data;
    },
    (error) => {
      if (error.code === "BUDGET_EXHAUSTED") {
        return Promise.reject(error);
      }

      if (error.response) {
        const { status, data, config } = error.response;
        const message =
          data?.errors?.access ||
          data?.message ||
          "Unknown API error";

        switch (status) {
          case 401:
            logger.error("[BasketballAPI] Unauthorized — invalid API key");
            break;
          case 403:
            logger.error(`[BasketballAPI] Forbidden — ${message}`);
            break;
          case 429:
            logger.warn("[BasketballAPI] Rate limit hit — forcing budget to 0");
            remainingRequests = 0;
            break;
          default:
            if (status >= 500) {
              logger.error(`[BasketballAPI] Server error (${status})`);
            } else {
              logger.error(`[BasketballAPI] ${config?.url} (${status}) — ${message}`);
            }
        }
      } else if (error.code === "ECONNABORTED") {
        logger.error("[BasketballAPI] Request timed out");
      } else {
        logger.error(`[BasketballAPI] ${error.message}`);
      }

      return Promise.reject(error);
    }
  );
}

// ───────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────
module.exports = {
  basketballApi,
  isBasketballConfigured,
  getBasketballRemainingRequests,
  isBasketballBudgetAvailable,
  getBasketballLiveRequestsToday,
  isBasketballLiveCapAvailable,
  incrementBasketballLiveCounter,
};