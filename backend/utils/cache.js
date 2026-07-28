const logger = require('./logger');

class Cache {
  constructor() {
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
    
    // Clean expired keys every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  _getKey(key) {
    return String(key);
  }

  get(key) {
    const k = this._getKey(key);
    const item = this.store.get(k);

    if (!item) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.store.delete(k);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.value;
  }

  set(key, value, ttlMs) {
    const k = this._getKey(key);
    this.store.set(k, {
      value,
      expiresAt: Date.now() + (ttlMs || 60000)
    });
    this.stats.sets++;
  }

  async getOrSet(key, fetchFn, ttlMs) {
    const cached = this.get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    try {
      const freshData = await fetchFn();
      if (freshData !== null && freshData !== undefined) {
        this.set(key, freshData, ttlMs);
      }
      return freshData;
    } catch (err) {
      logger.error(`[Cache] Error fetching data for key ${key}: ${err.message}`);
      throw err;
    }
  }

  invalidate(key) {
    const k = this._getKey(key);
    this.store.delete(k);
  }

  invalidatePrefix(prefix) {
    const p = String(prefix);
    let count = 0;
    
    for (const key of this.store.keys()) {
      if (key.startsWith(p)) {
        this.store.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.info(`[Cache] Invalidated ${count} keys with prefix: ${p}`);
    }
  }

  cleanup() {
    const now = Date.now();
    let expired = 0;
    
    for (const [key, item] of this.store.entries()) {
      if (now > item.expiresAt) {
        this.store.delete(key);
        expired++;
      }
    }
    
    if (expired > 0) {
      logger.info(`[Cache] Cleaned up ${expired} expired keys`);
    }
  }

  clear() {
    this.store.clear();
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }

  stats() {
    return {
      ...this.stats,
      size: this.store.size
    };
  }
}

module.exports = new Cache();