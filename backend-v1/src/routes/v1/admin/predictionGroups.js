// backend-v1/src/routes/v1/admin/predictionGroups.js
const express = require('express');
const router = express.Router();

const adminAuth = require('../../../middleware/adminAuth');
const svc = require('../../../services/PredictionGroupsService');
const { getDateOffset } = require('../../../config/constants');

router.use(adminAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const resolveDate = (raw) => {
  const date = raw === 'today' ? getDateOffset(0) : raw;
  return DATE_RE.test(date || '') ? date : null;
};

// GET /:date — pipeline groups (studio view, FT-resolved)
router.get('/:date', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    if (!date) return res.status(400).json({ success: false, error: 'Invalid date' });

    const data = req.params.date === 'today'
      ? (await svc.getUnifiedLatest()) || (await svc.getDay(date))
      : await svc.getDay(date);

    const [exclusions, published] = await Promise.all([
      svc.getExclusions(date),
      svc.getCurated(date),
    ]);

    return res.json({
      success: true,
      date: data.date || date,
      source: data.source,
      fallback: !!data.fallback,
      familyOrder: svc.orderFamilies(data.groups),
      groups: data.groups || {},
      results: data.results || null,
      published: !!published,
      publishedFamilies: published ? Object.keys(published.groups || {}) : [],
      exclusions,
    });
  } catch (err) { next(err); }
});

// POST /:date/publish — force publish (all families, incl. risky zone)
router.post('/:date/publish', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    if (!date) return res.status(400).json({ success: false, error: 'Invalid date' });
    const payload = await svc.publishCurated(date, req.body?.families || null);
    if (!payload) return res.status(404).json({ success: false, error: 'No groups available for this date' });
    return res.json({ success: true, date, families: Object.keys(payload.groups) });
  } catch (err) { next(err); }
});

// POST /:date/auto-publish — manual trigger of the automatic path (no risky zone)
router.post('/:date/auto-publish', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    if (!date) return res.status(400).json({ success: false, error: 'Invalid date' });
    const payload = await svc.autoPublish(date);
    if (!payload) return res.status(404).json({ success: false, error: 'Nothing to auto-publish' });
    return res.json({ success: true, date, families: Object.keys(payload.groups) });
  } catch (err) { next(err); }
});

// POST /:date/unpublish — body: { all: true } OR { families: [...] }
router.post('/:date/unpublish', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    if (!date) return res.status(400).json({ success: false, error: 'Invalid date' });
    const result = await svc.unpublish(date, {
      all: !!req.body?.all,
      families: Array.isArray(req.body?.families) ? req.body.families : null,
    });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// POST /:date/republish — reverse a full-day hide
router.post('/:date/republish', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    if (!date) return res.status(400).json({ success: false, error: 'Invalid date' });
    const payload = await svc.republishAfterDayHide(date);
    if (!payload) return res.status(404).json({ success: false, error: 'No groups available' });
    return res.json({ success: true, date, families: Object.keys(payload.groups) });
  } catch (err) { next(err); }
});

// POST /:date/exclude-match — body: { matchId }
router.post('/:date/exclude-match', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    const matchId = String(req.body?.matchId || '').trim();
    if (!date || !matchId) return res.status(400).json({ success: false, error: 'date and matchId required' });
    return res.json({ success: true, ...(await svc.excludeMatch(date, matchId)) });
  } catch (err) { next(err); }
});

// POST /:date/restore-match — body: { matchId }
router.post('/:date/restore-match', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    const matchId = String(req.body?.matchId || '').trim();
    if (!date || !matchId) return res.status(400).json({ success: false, error: 'date and matchId required' });
    return res.json({ success: true, ...(await svc.restoreMatch(date, matchId)) });
  } catch (err) { next(err); }
});

// GET /:date/exclusions
router.get('/:date/exclusions', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    if (!date) return res.status(400).json({ success: false, error: 'Invalid date' });
    return res.json({ success: true, data: await svc.getExclusions(date) });
  } catch (err) { next(err); }
});

module.exports = router;