const { COLLECTIONS, TTL } = require('../config/constants');
const { smartBatchWrite, clearCollection, getDb } = require('../config/firebase');

class VideosRepository {
  async replaceVideos(videos) {
    await clearCollection(COLLECTIONS.VIDEOS);
    if (!videos.length) return { written: 0 };
    return smartBatchWrite(COLLECTIONS.VIDEOS, videos, TTL.VIDEOS);
  }

  async getVideos() {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.VIDEOS).get();
    return snap.docs.map(d => d.data());
  }
}

module.exports = new VideosRepository();