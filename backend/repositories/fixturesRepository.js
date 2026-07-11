const { COLLECTIONS } = require("../config/constants");
const {
  batchWrite,
  deleteByIds,
  clearCollection,
  replaceCollection,
  getDb,
} = require("../config/firebase");

class FixturesRepository {

  async diffWrite(collectionPath, docs, previousIds) {
    const newIdSet = new Set(docs.map((d) => String(d.id)));
    const toDelete = previousIds
      ? [...previousIds].filter((id) => !newIdSet.has(id))
      : [];
    let deleted = 0;
    if (toDelete.length > 0) {
      deleted = await deleteByIds(collectionPath, toDelete);
    }
    let written = 0;
    if (docs.length > 0) {
      written = await batchWrite(collectionPath, docs);
    }
    return { deleted, written, newIds: newIdSet };
  }

  async removeByIds(collectionPath, ids) {
    return deleteByIds(collectionPath, ids);
  }

  // ★ THIS IS THE FIX — was missing before
  async batchWrite(collectionPath, docs) {
    return batchWrite(collectionPath, docs);
  }

  async replaceYesterday(docs) {
    return replaceCollection(COLLECTIONS.YESTERDAY_FIXTURES, docs);
  }

  async replaceToday(docs) {
    return replaceCollection(COLLECTIONS.TODAY_FIXTURES, docs);
  }

  async replaceTomorrow(docs) {
    return replaceCollection(COLLECTIONS.TOMORROW_FIXTURES, docs);
  }

  async getAllTomorrow() {
    const database = getDb();
    const snapshot = await database
      .collection(COLLECTIONS.TOMORROW_FIXTURES)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  async getAllToday() {
    const database = getDb();
    const snapshot = await database
      .collection(COLLECTIONS.TODAY_FIXTURES)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  async replaceLive(docs) {
    return replaceCollection(COLLECTIONS.LIVE_FIXTURES, docs);
  }

  async clearLive() {
    return clearCollection(COLLECTIONS.LIVE_FIXTURES);
  }

  async batchUpsertFinished(docs) {
    return batchWrite(COLLECTIONS.FINISHED_FIXTURES, docs);
  }
}

module.exports = FixturesRepository;