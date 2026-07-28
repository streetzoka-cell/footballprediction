/*
 * cache.js
 * In-memory cache with TTL, invalidation, and thundering herd protection.
 */
class DataCache {
  constructor() {
    this._store = new Map();
    this._locks = new Map();
    this._defaultTTL = 86400000; // 24 hours
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttl) {
      this._store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data, ttl) {
    this._store.set(key, {
      data,
      ts: Date.now(),
      ttl: ttl ?? this._defaultTTL,
    });
  }

  async getOrSet(key, fetchFn, ttl) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const existingLock = this._locks.get(key);
    if (existingLock) {
      await existingLock;
      const warmed = this.get(key);
      if (warmed !== null) {
        return warmed;
      }
    }

    let resolveLock;
    const lock = new Promise((resolve) => {
      resolveLock = resolve;
    });
    this._locks.set(key, lock);

    try {
      const data = await fetchFn();
      this.set(key, data, ttl);
      return data;
    } finally {
      this._locks.delete(key);
      resolveLock();
    }
  }

  invalidate(key) {
    this._store.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  clear() {
    this._store.clear();
    this._locks.clear();
  }

  stats() {
    return {
      keys: this._store.size,
      defaultTTL: this._defaultTTL,
      pendingLocks: this._locks.size,
    };
  }
}

module.exports = new DataCache();