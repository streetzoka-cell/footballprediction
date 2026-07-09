/*
 * api.js
 * Central Axios client for API-Football.
 * Tracks daily budget AND daily live request count.
 */

const axios = require("axios");
const env = require("./env");
const logger = require("../utils/logger");
const { LIVE_POLLING } = require("./constants");

// ───────────────────────────────────────────────
// Daily Request Budget Tracker (from API header)
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
    // Reset live counter too
    liveRequestsToday = 0;
    logger.info(`[API] New day (${today}) — budget + live counter reset`);
  }
}

function getRemainingRequests() {
  resetIfNewDay();
  return remainingRequests;
}

function isBudgetAvailable(required = 1) {
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
// Live Request Counter — hard cap per day
// Independent of API header — this is OUR limit
// so we never accidentally burn budget on live.
// ───────────────────────────────────────────────
let liveRequestsToday = 0;

function getLiveRequestsToday() {
  resetIfNewDay();
  return liveRequestsToday;
}

function isLiveCapAvailable() {
  resetIfNewDay();
  return liveRequestsToday < LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP;
}

function incrementLiveCounter() {
  resetIfNewDay();
  liveRequestsToday++;
  return liveRequestsToday;
}

// ───────────────────────────────────────────────
// Axios Instance
// ───────────────────────────────────────────────
const api = axios.create({
  baseURL: env.API_FOOTBALL_BASE_URL,
  timeout: 15000,
  headers: {
    "x-apisports-key": env.API_FOOTBALL_KEY,
  },
});

// ───────────────────────────────────────────────
// Request Interceptor — Budget Guard + Logger
// ───────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    resetIfNewDay();

    if (remainingRequests !== null && remainingRequests <= 0) {
      const err = new Error(
        `API budget exhausted (0/100). Blocked: ${config.method?.toUpperCase()} ${config.url}`
      );
      err.code = "BUDGET_EXHAUSTED";
      logger.warn(`[API] ⛔ ${err.message}`);
      return Promise.reject(err);
    }

    const params = config.params ? JSON.stringify(config.params) : "";
    const budget = remainingRequests !== null ? `${remainingRequests}/100` : "???/100";

    logger.info(
      `[API] → ${config.method?.toUpperCase()} ${config.url} ${params} [${budget}]`
    );

    return config;
  },
  (error) => Promise.reject(error)
);

// ───────────────────────────────────────────────
// Response Interceptor — Budget Sync + Error Map
// ───────────────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    const headerRemaining =
      response.headers?.["x-ratelimit-requests-remaining"];
    updateFromHeader(headerRemaining);

    logger.info(
      `[API] ← ${response.config.url} [${remainingRequests}/100]`
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
          logger.error("[API] Unauthorized — invalid API key");
          break;
        case 403:
          logger.error(`[API] Forbidden — ${message}`);
          break;
        case 429:
          logger.warn("[API] Rate limit hit — forcing budget to 0");
          remainingRequests = 0;
          break;
        default:
          if (status >= 500) {
            logger.error(`[API] Server error (${status})`);
          } else {
            logger.error(`[API] ${config?.url} (${status}) — ${message}`);
          }
      }
    } else if (error.code === "ECONNABORTED") {
      logger.error("[API] Request timed out");
    } else {
      logger.error(`[API] ${error.message}`);
    }

    return Promise.reject(error);
  }
);

// ───────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────
module.exports = {
  api,
  getRemainingRequests,
  isBudgetAvailable,
  getLiveRequestsToday,
  isLiveCapAvailable,
  incrementLiveCounter,
};