// backend-v1/src/services/PredictionGroupsService.js
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const logger = require('../utils/logger');
const { readJSONSafe } = require('../utils/atomicWriter');
const { publishJSON } = require('./StaticFilePublisher');
const QueueService = require('./QueueService');
const resolver = require('./PickGroupResolver');
const localSnapshotRepo = require('../repositories/LocalSnapshotRepository');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data');
const GROUPS_DIR = path.join(PUBLIC_DIR, 'pick_groups');
const UNIFIED_FILE = path.join(PUBLIC_DIR, 'pick_groups.json');
const CURATED_DIR = path.join(PUBLIC_DIR, 'prediction_groups');
const EXCL_DIR = path.join(PUBLIC_DIR, 'prediction_groups_exclusions');

const FAMILY_ORDER = ['TOP10_DAILY', 'PURE_1X2', 'GG_BTTS', 'OVER_UNDER', 'SCORE', 'LOW_CONFIDENCE'];
/* ★ Never auto-published to the app; admin can still force-include via Publish */
const AUTO_HIDE = ['LOW_CONFIDENCE'];

const tierPicks = (t) => t?.picks || t?.matches || t?.items || [];

/* ── pipeline readers (source of truth) ── */

async function readUnified() {
  const data = await readJSONSafe(UNIFIED_FILE, null);
  return data && typeof data === 'object' ? data : null;
}

async function readPipelineDay(date) {
  const dayFile = await readJSONSafe(path.join(GROUPS_DIR, `${date}.json`), null);
  if (dayFile?.groups) return dayFile;

  const unified = await readUnified();
  const fromUnified = unified?.days?.[date] || (unified?.latest?.date === date ? unified.latest : null);
  if (fromUnified?.groups) return fromUnified;

  return null;
}

async function fallbackBuild(date) {
  try {
    const legacy = require('./PredictionGroupsFallbackBuilder');
    const built = await legacy.buildGroups(date);
    logger.warn(`[PickGroups] Pipeline file missing for ${date} — fallback rebuild (${built.count} groups).`);
    return { ...built, fallback: true };
  } catch (err) {
    logger.error(`[PickGroups] Fallback rebuild failed for ${date}: ${err.message}`);
    return null;
  }
}

/* ── FT resolution (read-time) with provider-namespace bridge ── */

async function resolveForDate(base, date) {
  if (!base?.groups || Object.keys(base.groups).length === 0) return base;
  try {
    const resultMap = await resolver.loadResults(date);

    let lookupMap = resultMap;
    try {
      const snap = await localSnapshotRepo.getFixtureSnapshot(date);
      const aliasToCanonical = new Map();
      (snap.all || []).forEach((fx) => {
        const canon = String(fx.id);
        Object.values(fx.ids || {}).forEach((v) => {
          if (v != null) aliasToCanonical.set(String(v), canon);
        });
      });
      if (aliasToCanonical.size > 0) {
        lookupMap = new Map(resultMap);
        aliasToCanonical.forEach((canon, alias) => {
          if (lookupMap.has(canon) && !lookupMap.has(alias)) {
            lookupMap.set(alias, lookupMap.get(canon));
          }
        });
        logger.info(`[PickGroups] Namespace bridge: ${aliasToCanonical.size} aliases for ${date}`);
      }
    } catch { /* snapshot unavailable — direct-id resolution only */ }

    base.groups = resolver.resolveGroups(base.groups, lookupMap);
    base.results = resolver.overallSummary(base.groups);
  } catch (err) {
    logger.warn(`[PickGroups] Resolution failed for ${date}: ${err.message}`);
  }
  return base;
}

async function getDay(date) {
  const pipeline = await readPipelineDay(date);
  const base = pipeline ? { ...pipeline, source: 'pipeline' } : (await fallbackBuild(date));
  if (!base) return { date, groups: {}, count: 0, source: 'none' };
  return resolveForDate({ ...base, source: base.source || (base.fallback ? 'fallback' : 'pipeline') }, date);
}

async function getUnifiedLatest() {
  const unified = await readUnified();
  if (unified?.latest?.groups) {
    const base = { ...unified.latest, source: 'pipeline' };
    return resolveForDate(base, base.date);
  }
  return null;
}

function orderFamilies(groupsObj) {
  const keys = Object.keys(groupsObj || {});
  const known = FAMILY_ORDER.filter((k) => keys.includes(k));
  const extra = keys.filter((k) => !FAMILY_ORDER.includes(k)).sort();
  return [...known, ...extra];
}

/* ── ADMIN EXCLUSIONS (auto-publish respects these forever) ── */

const exclPath = (date) => path.join(EXCL_DIR, `${date}.json`);

async function loadExclusions(date) {
  const raw = await readJSONSafe(exclPath(date), null);
  return {
    dayUnpublished: !!raw?.dayUnpublished,
    familyExclusions: Array.isArray(raw?.familyExclusions) ? raw.familyExclusions : [],
    matchExclusions: Array.isArray(raw?.matchExclusions) ? raw.matchExclusions : [],
  };
}

async function saveExclusions(date, excl) {
  await publishJSON(`prediction_groups_exclusions/${date}.json`, excl);
}

async function deletePublicFile(rel) {
  await fsp.unlink(path.join(PUBLIC_DIR, rel)).catch(() => {});
}

function filterPicks(picks, excl) {
  return (picks || []).filter((p) => !excl.matchExclusions.includes(String(p.matchId)));
}

function applyExclusions(groups, excl) {
  const out = {};
  for (const [fam, f] of Object.entries(groups || {})) {
    if (excl.familyExclusions.includes(fam)) continue;

    if (Array.isArray(f)) {
      const arr = f
        .map((t) => ({ ...t, picks: filterPicks(tierPicks(t), excl) }))
        .filter((t) => tierPicks(t).length > 0);
      if (arr.length) out[fam] = arr;
      continue;
    }
    if (Array.isArray(f?.tiers)) {
      const tiers = f.tiers
        .map((t) => ({ ...t, picks: filterPicks(tierPicks(t), excl) }))
        .filter((t) => tierPicks(t).length > 0);
      if (tiers.length) out[fam] = { ...f, tiers };
      continue;
    }
    const picks = filterPicks(tierPicks(f), excl);
    if (picks.length) out[fam] = { ...f, picks };
  }
  return out;
}

/* ── PUBLISH ── */

async function publishCurated(date, selectedFamilies = null) {
  const excl = await loadExclusions(date);
  if (excl.dayUnpublished) return null; // admin hid the day — stays hidden

  const day = await getDay(date); // FT-resolved
  if (!day?.groups || Object.keys(day.groups).length === 0) return null;

  let groups = day.groups;
  if (Array.isArray(selectedFamilies) && selectedFamilies.length > 0) {
    groups = Object.fromEntries(Object.entries(groups).filter(([k]) => selectedFamilies.includes(k)));
  }
  groups = applyExclusions(groups, excl);
  if (Object.keys(groups).length === 0) return null;

  const payload = {
    date,
    source: day.source,
    familyOrder: orderFamilies(groups),
    groups,
    results: day.results || null,
    publishedAt: new Date().toISOString(),
  };

  await publishJSON(`prediction_groups/${date}.json`, payload);
  await QueueService.addToQueue({
    collection: 'prediction_groups',
    docId: String(date),
    type: 'set',
    data: { date, families: Object.keys(groups), results: payload.results, updatedAt: payload.publishedAt },
    priority: 'normal',
    source: 'prediction-groups',
  });

  logger.info(`[PickGroups] Published ${date}: ${Object.keys(groups).join(', ')}`);
  return payload;
}

/* ── ★ AUTO-PUBLISH: called by scheduler after Step 50 / on refresh ── */
async function autoPublish(date) {
  const excl = await loadExclusions(date);
  if (excl.dayUnpublished) return null;

  const day = await getDay(date);
  const fams = orderFamilies(day?.groups).filter((f) => !AUTO_HIDE.includes(f));
  if (fams.length === 0) return null;
  return publishCurated(date, fams);
}

/* Refresh existing published file (keeps admin exclusions, drops nothing new) */
async function republishCurated(date) {
  const excl = await loadExclusions(date);
  if (excl.dayUnpublished) return null;
  const existing = await getCurated(date);
  if (!existing) return null;
  return publishCurated(date, Object.keys(existing.groups || {}));
}

async function getCurated(date) {
  return readJSONSafe(path.join(CURATED_DIR, `${date}.json`), null);
}

/* ── ADMIN OVERRIDE OPERATIONS ── */

async function unpublish(date, { all = false, families = null } = {}) {
  const excl = await loadExclusions(date);

  if (all) {
    excl.dayUnpublished = true;
    await saveExclusions(date, excl);
    await deletePublicFile(`prediction_groups/${date}.json`);
    logger.info(`[PickGroups] Day unpublished by admin: ${date}`);
    return { unpublished: 'all', date };
  }

  const existing = await getCurated(date);
  const fams = Array.isArray(families) && families.length > 0
    ? families
    : Object.keys(existing?.groups || {});

  excl.familyExclusions = Array.from(new Set([...excl.familyExclusions, ...fams]));
  await saveExclusions(date, excl);

  if (existing) {
    const remaining = Object.fromEntries(
      Object.entries(existing.groups || {}).filter(([k]) => !excl.familyExclusions.includes(k))
    );
    if (Object.keys(remaining).length === 0) {
      await deletePublicFile(`prediction_groups/${date}.json`);
    } else {
      await publishJSON(`prediction_groups/${date}.json`, {
        ...existing,
        groups: remaining,
        familyOrder: orderFamilies(remaining),
        updatedAt: new Date().toISOString(),
      });
    }
  }
  logger.info(`[PickGroups] Families unpublished by admin for ${date}: ${fams.join(', ')}`);
  return { unpublished: fams, date };
}

async function excludeMatch(date, matchId) {
  const excl = await loadExclusions(date);
  const id = String(matchId);
  if (!excl.matchExclusions.includes(id)) excl.matchExclusions.push(id);
  await saveExclusions(date, excl);
  await republishCurated(date); // rewrite published file without this pick
  logger.info(`[PickGroups] Match excluded for ${date}: ${id}`);
  return { excluded: id, date };
}

async function restoreMatch(date, matchId) {
  const excl = await loadExclusions(date);
  excl.matchExclusions = excl.matchExclusions.filter((m) => m !== String(matchId));
  await saveExclusions(date, excl);
  await republishCurated(date);
  logger.info(`[PickGroups] Match restored for ${date}: ${matchId}`);
  return { restored: String(matchId), date };
}

async function getExclusions(date) {
  return loadExclusions(date);
}

/* Republish a day the admin fully hid (explicit reversal) */
async function republishAfterDayHide(date) {
  const excl = await loadExclusions(date);
  excl.dayUnpublished = false;
  await saveExclusions(date, excl);
  return autoPublish(date);
}

module.exports = {
  getDay, getUnifiedLatest, orderFamilies,
  publishCurated, getCurated, republishCurated,
  autoPublish, unpublish, excludeMatch, restoreMatch, getExclusions, republishAfterDayHide,
};