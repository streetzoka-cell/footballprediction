// footballprediction/backend-v1/src/repositories/VideoRepository.js

const { getDb, clearCollection, batchWrite, withTTL } = require('../config/firebase');
const { COLLECTIONS, TTL } = require('../config/constants');

async function replaceVideos(videos) {
  await clearCollection(COLLECTIONS.VIDEOS);
  if (!videos.length) return;
  const mapped = videos.map(v => ({ ...withTTL(v, TTL.VIDEOS) }));
  await batchWrite(COLLECTIONS.VIDEOS, mapped);
}

async function getVideos() {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.VIDEOS).limit(50).get();
  return snap.docs.map(d => d.data());
}

module.exports = { replaceVideos, getVideos };
