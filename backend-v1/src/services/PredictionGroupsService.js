// backend-v1/src/services/PredictionGroupsService.js
'use strict';

const path = require('path');
const logger = require('../utils/logger');
const { publishJSON } = require('./StaticFilePublisher');
const QueueService = require('./QueueService');
const { readJSONSafe } = require('../utils/atomicWriter');
const resolver = require('./PickGroupResolver');

const GROUPS_DIR = path.join(process.cwd(), 'public_data', 'pick_groups');
const UNIFIED_FILE = path.join(process.cwd(), 'public_data', 'pick_groups.json');
const CURATED_DIR = path.join(process.cwd(), 'public_data', 'prediction_groups');

const FAMILY_ORDER = ['TOP10_DAILY', 'PURE_1X2', 'GG_BTTS', 'OVER_UNDER', 'SCORE', 'LOW_CONFIDENCE'];

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

/* ── ★ READ-TIME RESOLUTION: every returned group is auto-marked
      against results/<date>.json — W/L/P + final scores + resolved
      share text. Original share_text is preserved untouched. ── */
async function resolveForDate(base, date) {
  if (!base?.groups || Object.keys(base.groups).length === 0) return base;
  try {
    const resultMap = await resolver.loadResults(date);
    base.groups = resolver.resolveGroups(base.groups, resultMap);
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

/* ── publish = curation gate for the app surface.
      Published payload carries BOTH share_text (original) and
      share_text_resolved, plus per-pick result stamps. ── */
async function publishCurated(date, selectedFamilies = null) {
  const day = await getDay(date); // already resolved
  if (!day?.groups || Object.keys(day.groups).length === 0) return null;

  let groups = day.groups;
  if (Array.isArray(selectedFamilies) && selectedFamilies.length > 0) {
    groups = Object.fromEntries(Object.entries(groups).filter(([k]) => selectedFamilies.includes(k)));
  }

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

  logger.info(`[PickGroups] Published curated groups for ${date}: ${Object.keys(groups).join(', ')}`);
  return payload;
}

async function getCurated(date) {
  return readJSONSafe(path.join(CURATED_DIR, `${date}.json`), null);
}

/*
 * ★ AUTO-MARK AFTER FT for the public surface:
 * if the admin already curated today, re-publish with fresh results.
 * Called by the 10-min background task — the static app file updates
 * itself as FTs land, with zero manual action.
 */
async function republishCurated(date) {
  const existing = await getCurated(date);
  if (!existing) return null; // never auto-create the public surface
  return publishCurated(date, Object.keys(existing.groups || {}));
}

module.exports = { getDay, getUnifiedLatest, publishCurated, getCurated, republishCurated, orderFamilies };