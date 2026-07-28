const { COLLECTIONS } = require('../config/constants');
const { getDb } = require('../config/firebase');

class CacheInfoRepository {
  async update(collection, meta) {
    const db = getDb();
    await db.collection(COLLECTIONS.CACHE_INFO).doc(collection).set({
      collection,
      ...meta,
      lastUpdated: new Date().toISOString(),
    }, { merge: true });
  }

  async get(collection) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.CACHE_INFO).doc(collection).get();
    return snap.exists ? snap.data() : null;
  }

  async getAll() {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.CACHE_INFO).get();
    return snap.docs.map(d => d.data());
  }
}

module.exports = new CacheInfoRepository();