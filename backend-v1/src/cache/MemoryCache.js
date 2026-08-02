// backend-v1/src/cache/MemoryCache.js

const { LRUCache } = require('lru-cache');
const logger = require('../utils/logger');

class MemoryCache {
  constructor(maxSize = 500) {
    this.cache = new LRUCache({
      max: maxSize,
      ttl: 1000 * 60 * 60, // Default 1 hour TTL
      updateAgeOnGet: true,
    });

    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0,
    };
  }

  get(key) {
    if (this.cache.has(key)) {
      this.metrics.hits++;
      return this.cache.get(key);
    }

    this.metrics.misses++;
    return undefined;
  }

  set(key, value, ttlMs) {
    this.cache.set(key, value, { ttl: ttlMs || this.cache.ttl });
    this.metrics.sets++;
  }

  async getOrSet(key, fetchFn, ttlMs) {
    const cached = this.get(key);

    if (cached !== undefined) {
      return cached;
    }

    try {
      const fresh = await fetchFn();

      if (fresh !== undefined && fresh !== null) {
        this.set(key, fresh, ttlMs);
      }

      return fresh;
    } catch (err) {
      logger.error(`[MemoryCache] Fetch failed for ${key}: ${err.message}`);
      throw err;
    }
  }

  invalidate(key) {
    const deleted = this.cache.delete(key);
    if (deleted) this.metrics.invalidations++;
    return deleted;
  }

  invalidatePrefix(prefix) {
    let count = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.metrics.invalidations += count;
    return count;
  }

  stats() {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRatio = total > 0 ? Number(((this.metrics.hits / total) * 100).toFixed(2)) : 0;

    return {
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize,
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      sets: this.metrics.sets,
      invalidations: this.metrics.invalidations,
      hitRatio,
    };
  }

  resetStats() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0,
    };
  }
}

module.exports = new MemoryCache();