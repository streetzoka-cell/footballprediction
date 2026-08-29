// backend-v1/src/routes/v1/matches.js
'use strict';

const express = require('express');
const router = express.Router();

const snapshotService = require('../../services/SnapshotService');
const { getDateOffset } = require('../../config/constants');
const { isMustHaveLeague } = require('../../config/leagues');
const { rankAndTagMatches } = require('../../services/MatchRankingService');
const liveSync = require('../../services/livePredictionSync');

const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
const SCHEDULED_STATUSES = ['NS', 'TBD', 'SCHEDULED', 'TIMED'];
const NON_PLAYABLE = ['PST', 'CANC', 'ABD', 'SUSP', 'INT', 'CANCELLED', 'POSTPONED', 'AWD', 'WO'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'FINISHED'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ── time helpers: timestamp(s) and ISO kickoff mixed → normalize to ms ── */
function toMs(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function kickoffMs(m) {
  if (m.timestamp) return toMs(m.timestamp);
  return toMs(m.utcDate || m.date || m.kickoff);
}

function sortMatchesByTime(a, b) {
  return kickoffMs(a) - kickoffMs(b);
}

/* ★ Top 12 first, then chronological — the "not hidden" ordering */
function sortMustHaveFirst(a, b) {
  const mh = (b.mustHave ? 1 : 0) - (a.mustHave ? 1 : 0);
  return mh !== 0 ? mh : kickoffMs(a) - kickoffMs(b);
}

function sortFeatured(a, b) {
  const mh = (b.mustHave ? 1 : 0) - (a.mustHave ? 1 : 0);
  if (mh !== 0) return mh;
  return (b.matchScore || 0) - (a.matchScore || 0);
}

function dedupMatches(matches) {
  return Array.from(new Map(matches.map((m) => [String(m.id), m])).values());
}

/*
 * ★ BUG FIX — cache contamination.
 * LocalSnapshotRepository returns the SAME parsed object references on
 * mtime-cache hits. Mutating them here (mustHave, reconcilePrediction's
 * delete/set of preds) leaked across requests: stripped preds stayed
 * stripped, live-synced state persisted stale. This now returns a shallow
 * copy — every downstream mutation hits the copy, the cached snapshot
 * object stays pristine. Shallow is sufficient: reconcile only touches
 * top-level keys.
 */
function withFlags(m) {
  const copy = { ...m };
  if (copy.mustHave !== true && copy.mustHave !== false) {
    copy.mustHave = isMustHaveLeague(copy.leagueId);
  }
  return copy;
}

function stripPreds(m) {
  delete m.mlPredictions;
  delete m.prediction;
  delete m.mlPrediction;
}

/**
 * Serve-time prediction reconciliation (invariant: prediction.live_state ==
 * current fixture state). liveSync decides: fresh markets, recomputed markets,
 * or null (finished/postponed/canceled → never serve predictions).
 */
function reconcilePrediction(m) {
  if (!m.mlPredictions && !m.prediction && !m.mlPrediction) return;
  const source = m.mlPredictions || m.prediction || m.mlPrediction;
  const synced = liveSync.sync({ markets: source }, m);
  if (!synced || !synced.markets) {
    stripPreds(m);
    return;
  }
  m.mlPredictions = synced.markets;
  m.prediction = synced.markets;
  m.mlPrediction = synced.markets;
}

/**
 * GET /api/v1/matches/top?date=YYYY-MM-DD&days=3
 * ★ ONLY top-12 league fixtures — the homepage surface that must never be empty.
 *   days=1..7 → date + following days merged.
 */
router.get('/top', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || '1', 10) || 1, 1), 7);
    const center = req.query.date || getDateOffset(0);

    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(`${center}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const snaps = await Promise.all(dates.map((d) => snapshotService.getSnapshotData(d)));
    const collected = snaps.flatMap((s) => s.all || []);

    const top = dedupMatches(collected)
      .map(withFlags)                                   // ★ copy — safe to mutate below
      .filter((m) => m.mustHave)
      .map((m) => { reconcilePrediction(m); return m; }); // inlined (was hoisted fn decl)

    top.sort(sortMustHaveFirst);

    if (top.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No top-league fixtures published for this window',
        dates,
        hint: 'Snapshot job has not run for these dates yet',
      });
    }

    return res.json({ success: true, dates, data: top, count: top.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/matches?date=YYYY-MM-DD&status=live|finished&view=home
router.get('/', async (req, res, next) => {
  try {
    const { status, date, view } = req.query;
    const today = getDateOffset(0);
    const yesterday = getDateOffset(-1);
    const tomorrow = getDateOffset(1);

    if (view === 'home') {
      const snap = await snapshotService.getSnapshotData(today);
      let allMatches = dedupMatches([
        ...(snap.matches || []),
        ...(snap.live || []),
        ...(snap.finished || []),
      ]).map(withFlags);                                // ★ copies

      // Preserve predictions through ranking
      const predsMap = new Map();
      allMatches.forEach((m) => {
        const p = m.mlPredictions || m.prediction || m.mlPrediction;
        if (p) predsMap.set(String(m.id), p);
      });

      allMatches = rankAndTagMatches(allMatches).map(withFlags);

      // Re-attach preds after ranking (in case ranking strips)
      allMatches.forEach((m) => {
        const p = predsMap.get(String(m.id));
        if (p && !m.mlPredictions) {
          m.mlPredictions = p;
          m.prediction = p;
          m.mlPrediction = p;
        }
      });

      // Serve-time reconciliation: live preds follow score/minute; finished lose preds
      allMatches.forEach(reconcilePrediction);

      const live = allMatches
        .filter((m) => LIVE_STATUSES.includes(m.status))
        .sort(sortMustHaveFirst);

      const upcoming = allMatches
        .filter((m) =>
          !NON_PLAYABLE.includes(m.status) &&
          (SCHEDULED_STATUSES.includes(m.status) || kickoffMs(m) > Date.now())
        )
        .sort(sortMustHaveFirst);

      // ★ Featured pool: FEATURED category ∪ all top-12 — never empty when top leagues play
      const featured = allMatches
        .filter((m) => m.category === 'FEATURED' || m.mustHave)
        .sort(sortFeatured)
        .slice(0, 3);

      // ★ Direct top-12 surface for the homepage section
      const top = allMatches.filter((m) => m.mustHave).sort(sortMatchesByTime);

      return res.json({ success: true, live, featured, upcoming, top });
    }

    if (status === 'live') {
      const snaps = await Promise.all([
        snapshotService.getSnapshotData(today),
        snapshotService.getSnapshotData(yesterday),
        snapshotService.getSnapshotData(tomorrow),
      ]);
      let allMatches = [];
      snaps.forEach((s) => { allMatches = allMatches.concat(s.matches || [], s.live || []); });

      const uniqueLive = dedupMatches(allMatches)
        .map(withFlags)                               // ★ copies
        .filter((m) => LIVE_STATUSES.includes(m.status));

      // Live endpoint is the freshest surface — reconcile every match here
      uniqueLive.forEach(reconcilePrediction);

      return res.json({ success: true, data: uniqueLive.sort(sortMustHaveFirst) });
    }

    if (status === 'finished') {
      // ★ CONTRACT FIX: honor ?date= (was hardcoded to today)
      const targetDate = DATE_RE.test(date || '') ? date : today;
      const snap = await snapshotService.getSnapshotData(targetDate);
      const finished = (snap.finished || []).map(withFlags).sort(sortMatchesByTime);
      // No predictions on finished matches — enforce at serve time
      finished.forEach(stripPreds);
      return res.json({ success: true, date: targetDate, data: finished });
    }

    if (date) {
      const snap = await snapshotService.getSnapshotData(date);
      const unique = dedupMatches([
        ...(snap.matches || []),
        ...(snap.live || []),
        ...(snap.finished || []),
      ]).map(withFlags);                              // ★ copies

      unique.forEach(reconcilePrediction);
      // Belt & braces: finished matches never carry predictions, whatever liveSync did
      unique.forEach((m) => {
        if (FINISHED_STATUSES.includes(m.status)) stripPreds(m);
      });

      return res.json({ success: true, data: unique.sort(sortMatchesByTime) });
    }

    res.status(400).json({ success: false, error: 'Missing date, status, or view parameter' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;