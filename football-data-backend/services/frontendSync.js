// backend/services/frontendSync.js
const { db, FieldValue } = require('../config/firebase');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Optimized collection names (fd_ = frontend data)
const COL = {
  FIXTURES: 'fd_fixtures',       // doc per date → fd_fixtures/2025-07-15
  LIVE: 'fd_live',               // single doc → fd_live/current
  COMPETITIONS: 'fd_competitions', // single doc → fd_competitions/all
  STANDINGS: 'fd_standings',     // doc per code → fd_standings/PL
  TEAMS: 'fd_teams',             // doc per code → fd_teams/PL
};

function hashData(data) {
  try {
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  } catch { return String(Date.now()); }
}

/**
 * Write fixtures grouped by date.
 * Each date = ONE document: fd_fixtures/{YYYY-MM-DD} = { matches: [...], updatedAt, _hash }
 */
async function syncFixturesByDate(matches) {
  if (!db || !Array.isArray(matches)) return;
  if (!matches.length) return;

  const byDate = {};
  for (const m of matches) {
    if (!m.utcDate) continue;
    const dateStr = m.utcDate.split('T')[0]; // "2025-07-15"
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr].push(m);
  }

  const promises = [];
  for (const [dateStr, dateMatches] of Object.entries(byDate)) {
    const h = hashData(dateMatches);
    promises.push(
      db.collection(COL.FIXTURES).doc(dateStr).set({
        matches: dateMatches,
        _hash: h,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    );
  }

  await Promise.all(promises);
  logger.info('[FrontendSync] Fixtures: ' + Object.keys(byDate).length + ' dates, ' + matches.length + ' matches');
}

/**
 * Write live matches as ONE document: fd_live/current
 * CRITICAL: Only writes if data actually changed — saves Firestore writes
 */
async function syncLive(matches) {
  if (!db) return;

  const newHash = hashData(matches || []);

  try {
    const current = await db.collection(COL.LIVE).doc('current').get();
    if (current.exists && current.data()._hash === newHash) {
      // No change — skip write. This is the #1 quota saver.
      return;
    }
  } catch { /* proceed with write */ }

  await db.collection(COL.LIVE).doc('current').set({
    matches: matches || [],
    _hash: newHash,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Write all competitions as ONE document: fd_competitions/all
 */
async function syncCompetitions(competitions) {
  if (!db) return;

  const newHash = hashData(competitions || []);
  try {
    const current = await db.collection(COL.COMPETITIONS).doc('all').get();
    if (current.exists && current.data()._hash === newHash) return;
  } catch {}

  await db.collection(COL.COMPETITIONS).doc('all').set({
    competitions: competitions || [],
    _hash: newHash,
    updatedAt: FieldValue.serverTimestamp(),
  });
  logger.info('[FrontendSync] Competitions: ' + (competitions?.length || 0));
}

/**
 * Write standings for a competition: fd_standings/{code}
 */
async function syncStandings(code, standings) {
  if (!db) return;

  const newHash = hashData(standings);
  try {
    const current = await db.collection(COL.STANDINGS).doc(code).get();
    if (current.exists && current.data()._hash === newHash) return;
  } catch {}

  await db.collection(COL.STANDINGS).doc(code).set({
    standings,
    code,
    _hash: newHash,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Write teams for a competition: fd_teams/{code}
 */
async function syncTeams(code, teams) {
  if (!db) return;

  const newHash = hashData(teams);
  try {
    const current = await db.collection(COL.TEAMS).doc(code).get();
    if (current.exists && current.data()._hash === newHash) return;
  } catch {}

  await db.collection(COL.TEAMS).doc(code).set({
    teams,
    code,
    _hash: newHash,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Clean up old fixture date documents (keep last N days)
 */
async function cleanupOldFixtures(keepDays) {
  keepDays = keepDays || 3;
  if (!db) return;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const snap = await db.collection(COL.FIXTURES).get();
    let deleted = 0;
    for (const d of snap.docs) {
      if (d.id < cutoffStr) {
        await d.ref.delete();
        deleted++;
      }
    }
    if (deleted > 0) logger.info('[FrontendSync] Cleaned ' + deleted + ' old fixture docs');
  } catch (e) {
    logger.error('[FrontendSync] Cleanup error: ' + e.message);
  }
}

module.exports = {
  syncFixturesByDate,
  syncLive,
  syncCompetitions,
  syncStandings,
  syncTeams,
  cleanupOldFixtures,
  COL,
};