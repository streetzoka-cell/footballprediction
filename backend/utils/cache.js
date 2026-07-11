/*
 * cache.js
 * Simple in-memory cache with TTL and invalidation.
 * Used by API endpoints so 1,000+ clients don't
 * burn 50K Firestore reads/day.
 *
 * With cache: 1,000 users = ~6 Firestore reads/day
 * Without:   1,000 users = ~200,000 Firestore reads/day
 */

class DataCache {
  constructor() {
    this._store = new Map();
    this._defaultTTL = 30000; // 30 seconds
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
  }

  stats() {
    return {
      keys: this._store.size,
      defaultTTL: this._defaultTTL,
    };
  }
}

module.exports = new DataCache();