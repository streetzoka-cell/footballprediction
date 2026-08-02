// backend-v1/src/services/ContentMigrationService.js

const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const FeaturedStore = require('./FeaturedStore');
const ZokaPicksStore = require('./ZokaPicksStore');

/**
 * On-demand migration from Firestore into backend-owned local stores.
 *
 * This lets the backend "catch up" with data that was previously
 * written directly to Firebase by the frontend.
 *
 * Safe to run multiple times.
 */

async function importFeaturedFromFirebase(date) {
  const db = getDb();

  let matches = [];
  let source = null;

  // 1. Prefer the snapshot document (what the frontend currently reads)
  try {
    const snapDoc = await db
      .collection('prediction_snapshots')
      .doc(String(date))
      .get();

    if (snapDoc.exists && Array.isArray(snapDoc.data().predictions)) {
      matches = snapDoc.data().predictions;
      source = 'prediction_snapshots';
    }
  } catch (err) {
    logger.warn(
      `[Migration] prediction_snapshots read failed for ${date}: ${err.message}`
    );
  }

  // 2. Fallback to the raw collection
  if (!matches.length) {
    try {
      const qs = await db
        .collection('active_predictions')
        .where('matchDate', '==', String(date))
        .get();

      matches = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      source = 'active_predictions';
    } catch (err) {
      logger.warn(
        `[Migration] active_predictions read failed for ${date}: ${err.message}`
      );
    }
  }

  if (!matches.length) {
    return {
      date,
      imported: 0,
      source: null,
    };
  }

  const saved = await FeaturedStore.replace(date, matches, {
    syncFirebase: false, // Do not write back to Firebase what we just read
  });

  logger.info(
    `[Migration] Imported ${saved.length} featured matches for ${date} from ${source}.`
  );

  return {
    date,
    imported: saved.length,
    source,
  };
}

async function importZokaPicksFromFirebase(date) {
  const db = getDb();

  try {
    const snapDoc = await db
      .collection('zoka_picks')
      .doc(String(date))
      .get();

    if (!snapDoc.exists) {
      return {
        date,
        imported: false,
      };
    }

    const data = snapDoc.data() || {};
    const published = data.isDraft === false;

    const result = published
      ? await ZokaPicksStore.publish(date, data)
      : await ZokaPicksStore.saveDraft(date, data);

    logger.info(
      `[Migration] Imported Zoka Picks for ${date} (${published ? 'published' : 'draft'}).`
    );

    return {
      date,
      imported: true,
      published,
      matches: result.matches.length,
    };
  } catch (err) {
    logger.error(`[Migration] Zoka Picks import failed for ${date}: ${err.message}`);
    throw err;
  }
}

async function importDate(date) {
  const featured = await importFeaturedFromFirebase(date);
  const zoka = await importZokaPicksFromFirebase(date);

  return {
    date,
    featured,
    zoka,
  };
}

module.exports = {
  importFeaturedFromFirebase,
  importZokaPicksFromFirebase,
  importDate,
};