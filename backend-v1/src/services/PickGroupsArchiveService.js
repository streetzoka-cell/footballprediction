// backend-v1/src/services/PickGroupsArchiveService.js
'use strict';

const path = require('path');
const logger = require('../utils/logger');
const { readJSONSafe } = require('../utils/atomicWriter');
const { publishJSON } = require('./StaticFilePublisher');
const QueueService = require('./QueueService');

const CURATED_DIR = path.join(process.cwd(), 'public_data', 'prediction_groups');
const ARCHIVE_DIR = path.join(process.cwd(), 'public_data', 'prediction_groups_archive');

/* ── tier shape helpers (defensive, same accessors as the resolver) ── */
const tierPicks = (t) => t?.picks || t?.matches || t?.items || [];
const famTiers = (fam) => (Array.isArray(fam) ? fam : fam?.tiers || (tierPicks(fam).length ? [fam] : []));

/**
 * Roll one day's curated (already FT-resolved) groups into the permanent archive.
 * Idempotent: safe to call every 10 minutes; overwrites with fresher results,
 * flips final:true once nothing is pending. Also queues a Firestore copy so
 * history survives disk loss.
 */
async function archiveDay(date) {
  const curated = await readJSONSafe(path.join(CURATED_DIR, `${date}.json`), null);
  if (!curated?.groups || Object.keys(curated.groups).length === 0) return null;

  const families = {};
  let won = 0, lost = 0, pending = 0;
  let bestDay = null;

  for (const [family, fam] of Object.entries(curated.groups)) {
    let fWon = 0, fLost = 0, fPending = 0, fPicks = 0;

    for (const tier of famTiers(fam)) {
      const res = tier.results || { won: 0, lost: 0, pending: 0 };
      fWon += res.won || 0; fLost += res.lost || 0; fPending += res.pending || 0;
      fPicks += tierPicks(tier).length;

      const settled = (res.won || 0) + (res.lost || 0);
      const acc = settled > 0 ? Math.round(((res.won || 0) / settled) * 100) : null;
      if (!bestDay || (acc != null && (bestDay.accuracy == null || acc > bestDay.accuracy))) {
        bestDay = { family, tier: tier.tier ?? null, title: tier.title || family, won: res.won || 0, lost: res.lost || 0, accuracy: acc, picks: fPicks };
      }
    }

    const settled = fWon + fLost;
    families[family] = {
      picks: fPicks, won: fWon, lost: fLost, pending: fPending, settled,
      accuracy: settled > 0 ? Math.round((fWon / settled) * 100) : null,
    };
    won += fWon; lost += fLost; pending += fPending;
  }

  const settledTotal = won + lost;
  const payload = {
    date,
    archivedAt: new Date().toISOString(),
    final: pending === 0 && settledTotal > 0,
    overall: {
      won, lost, pending,
      settled: settledTotal,
      picks: settledTotal + pending,
      accuracy: settledTotal > 0 ? Math.round((won / settledTotal) * 100) : null,
    },
    families,
    bestDay,
  };

  await publishJSON(`prediction_groups_archive/${date}.json`, payload);
  await QueueService.addToQueue({
    collection: 'pick_groups_archive',
    docId: String(date),
    type: 'set',
    data: payload,
    priority: 'low',
    source: 'pick-groups-archive',
  });

  logger.info(`[PickGroupsArchive] Archived ${date}: ${payload.overall.won}W/${payload.overall.lost}L${payload.final ? ' (FINAL)' : ''}`);
  return payload;
}

async function getDayArchive(date) {
  return readJSONSafe(path.join(ARCHIVE_DIR, `${date}.json`), null);
}

function shiftDate(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split('T')[0];
}

/**
 * Last `days` days (desc) + graph series (asc) + per-family totals + streaks.
 * Missing archive days are skipped (honest gaps), never fabricated.
 */
async function getHistory(days = 10, endDate = null) {
  const today = endDate || new Date().toISOString().split('T')[0];
  const daysArr = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDate(today, -i);
    const a = await getDayArchive(d);
    if (a) daysArr.push(a); // desc order
  }

  // Graph series — ascending
  const series = [...daysArr].reverse().map((a) => ({
    date: a.date,
    accuracy: a.overall?.accuracy ?? null,
    won: a.overall?.won ?? 0,
    lost: a.overall?.lost ?? 0,
    picks: a.overall?.picks ?? 0,
    final: !!a.final,
  }));

  // Per-family totals over the range
  const famTotals = {};
  for (const a of daysArr) {
    for (const [family, f] of Object.entries(a.families || {})) {
      const t = (famTotals[family] ||= { picks: 0, won: 0, lost: 0, pending: 0, days: 0 });
      t.picks += f.picks || 0; t.won += f.won || 0; t.lost += f.lost || 0; t.pending += f.pending || 0;
      if (f.settled > 0) t.days += 1;
    }
  }
  for (const t of Object.values(famTotals)) {
    const settled = t.won + t.lost;
    t.settled = settled;
    t.accuracy = settled > 0 ? Math.round((t.won / settled) * 100) : null;
  }

  // Streaks — hot day = ≥3 settled picks AND ≥50% accuracy
  const isHot = (s) => s != null && (s.won + s.lost) >= 3 && s.accuracy != null && s.accuracy >= 50;
  let best = 0, run = 0;
  for (const a of daysArr) {
    if (isHot(a?.overall)) { run++; best = Math.max(best, run); }
    else run = 0;
    if (a) a.hot = isHot(a?.overall);
  }
  // current streak counts consecutive hot days starting from today (index 0)
  let current = 0;
  for (const a of daysArr) { if (isHot(a?.overall)) current++; else break; }
  series.forEach((s) => {
    const day = daysArr.find((d) => d.date === s.date);
    s.hot = !!day?.hot;
  });

  const settledTotal = daysArr.reduce((s, a) => s + (a.overall?.settled || 0), 0);
  const wonTotal = daysArr.reduce((s, a) => s + (a.overall?.won || 0), 0);

  return {
    days: daysArr,
    series,
    families: famTotals,
    streaks: { current, best },
    totals: {
      days: daysArr.length,
      settled: settledTotal,
      won: wonTotal,
      lost: settledTotal - wonTotal,
      accuracy: settledTotal > 0 ? Math.round((wonTotal / settledTotal) * 100) : null,
    },
  };
}

module.exports = { archiveDay, getDayArchive, getHistory };