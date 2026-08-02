// footballprediction/backend-v1/src/cache/MemoryCache.js

const { LRUCache } = require('lru-cache');
const logger = require('../utils/logger');

class MemoryCache {
  constructor(maxSize = 500) {
    this.cache = new LRUCache({
      max: maxSize,
      ttl: 1000 * 60 * 60, // Default 1 hour TTL
      updateAgeOnGet: true,
    });
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value, ttlMs) {
    this.cache.set(key, value, { ttl: ttlMs || this.cache.ttl });
  }

  async getOrSet(key, fetchFn, ttlMs) {
    const cached = this.get(key);
    if (cached) return cached;

    try {
      const fresh = await fetchFn();
      if (fresh) this.set(key, fresh, ttlMs);
      return fresh;
    } catch (err) {
      logger.error(`[MemoryCache] Fetch failed for ${key}: ${err.message}`);
      throw err;
    }
  }

  invalidate(key) {
    this.cache.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  stats() {
    return {
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize,
    };
  }
}

module.exports = new MemoryCache();
