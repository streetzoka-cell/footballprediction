class MemoryCache {
  constructor() {
    this.store = new Map();
  }
  get(key, ttlMs) {
    ttlMs = ttlMs || 30000;
    var entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }
  set(key, data) {
    this.store.set(key, { data: data, ts: Date.now() });
  }
  del(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  size() {
    return this.store.size;
  }
}

module.exports = new MemoryCache();
