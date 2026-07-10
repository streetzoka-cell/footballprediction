/*
 * basketballApi.js
 * Central Axios client for API-Basketball.
 *
 * FIX: Response interceptor now detects body-level
 * rate limit errors (200 status with errors object)
 * and forces budget to 0 — prevents infinite retries
 * when API returns "request limit reached" in body.
 */

const axios = require("axios");
const env = require("./env");
const logger = require("../utils/logger");
const { LIVE_POLLING } = require("./constants");

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
// Axios Instance
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

      // FIX: Check body-level errors — API-Basketball returns 200
      // with { errors: { requests: "You have reached..." } }
      // when daily limit is hit. Without this, budget stays at 99
      // and the service retries every 10min forever.
      const data = response.data;
      if (data?.errors && typeof data.errors === "object") {
        const errorKeys = Object.keys(data.errors);
        if (errorKeys.length > 0) {
          const errorMsg = Object.values(data.errors).join(", ");
          if (errorMsg.toLowerCase().includes("request limit") ||
              errorMsg.toLowerCase().includes("rate limit")) {
            logger.warn(`[BasketballAPI] Body-level rate limit — forcing budget to 0`);
            remainingRequests = 0;
          }
        }
      }

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