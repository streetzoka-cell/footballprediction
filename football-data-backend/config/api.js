const axios = require('axios');
const env = require('./env');
const logger = require('../utils/logger');

class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  async acquire() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 200;
      logger.warn(`[RATE-LIMIT] ${this.maxRequests}/${this.windowMs}ms reached - waiting ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      return this.acquire();
    }

    this.timestamps.push(Date.now());
  }
}

const limiter = new RateLimiter(10, 60_000);

const api = axios.create({
  baseURL: env.footballData.baseUrl,
  timeout: 15_000,
  headers: {
    'X-Auth-Token': env.footballData.apiKey,
    'Accept': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  await limiter.acquire();
  logger.debug(`[API] ${config.method ? config.method.toUpperCase() : 'GET'} ${config.url}`);
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response) {
      const { status, data } = err.response;
      const msg = (data && data.message) || (data && data.error) || 'No details';
      logger.error(`[API] ${err.config ? err.config.url : 'unknown'} -> ${status}: ${msg}`);
    } else if (err.code === 'ECONNABORTED') {
      logger.error(`[API] ${err.config ? err.config.url : 'unknown'} -> Timeout`);
    } else {
      logger.error(`[API] ${err.config ? err.config.url : 'unknown'} -> ${err.message}`);
    }
    return Promise.reject(err);
  }
);

module.exports = api;
