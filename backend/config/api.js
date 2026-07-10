/*
 * api.js
 * Central Axios client for API-Football.
 * Tracks daily budget AND daily live request count.
 *
 * FIX: Response interceptor now checks for body-level
 * errors (rate limit message in 200 response) and
 * forces budget to 0 when detected.
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
// Live Request Counter
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
// Request Interceptor
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
// Response Interceptor
// FIX: Check body-level errors too (API returns
// 200 with { errors: { requests: "..." } } when
// daily limit is hit on some endpoints)
// ───────────────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    const headerRemaining =
      response.headers?.["x-ratelimit-requests-remaining"];
    updateFromHeader(headerRemaining);

    // FIX: Check body-level errors — API sometimes returns 200
    // with an errors object when rate limited
    const data = response.data;
    if (data?.errors && typeof data.errors === "object") {
      const errorKeys = Object.keys(data.errors);
      if (errorKeys.length > 0) {
        const errorMsg = Object.values(data.errors).join(", ");
        // Check if it's a rate limit message
        if (errorMsg.toLowerCase().includes("request limit") ||
            errorMsg.toLowerCase().includes("rate limit")) {
          logger.warn(`[API] Body-level rate limit detected — forcing budget to 0`);
          remainingRequests = 0;
        }
      }
    }

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