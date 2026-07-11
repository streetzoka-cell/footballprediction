/*
 * cache.js
 * In-memory cache with TTL, invalidation, and thundering herd protection.
 *
 * ★ KEY CHANGE: Added getOrSet() — ensures that when a cache entry
 * expires, only ONE request reads from Firestore. All concurrent
 * requests wait for that one read and share the result.
 *
 * Without this: 100 concurrent requests after invalidation = 100 Firestore reads
 * With this:    100 concurrent requests after invalidation = 1 Firestore read
 *
 * Cache TTLs are now set to 24 HOURS in index.js. The cache is only
 * cleared when the scheduler explicitly invalidates it after writing
 * new data. This means client requests almost never read from Firestore.
 */

class DataCache {
  constructor() {
    this._store = new Map();
    this._locks = new Map();
    this._defaultTTL = 86400000; // 24 hours — effectively permanent until invalidated
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

  /**
   * Get or set with thundering herd protection.
   *
   * If cache is fresh: return immediately (0 reads).
   * If cache is stale/missing AND no lock: acquire lock, call fetchFn, cache result, release lock.
   * If cache is stale/missing AND lock exists: wait for lock, return cached result.
   *
   * This guarantees exactly 1 Firestore read per cache invalidation,
   * regardless of how many concurrent requests arrive.
   *
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Async function that reads from Firestore
   * @param {number} ttl - Cache TTL in ms
   * @returns {Promise<*>} Cached or freshly fetched data
   */
  async getOrSet(key, fetchFn, ttl) {
    // 1. Check fresh cache
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // 2. Check if another request is already fetching
    const existingLock = this._locks.get(key);
    if (existingLock) {
      // Wait for the other request to finish, then try cache again
      await existingLock;
      // After waiting, cache should be populated
      const warmed = this.get(key);
      if (warmed !== null) {
        return warmed;
      }
      // If still null (fetch failed), fall through to try ourselves
    }

    // 3. Acquire lock and fetch
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