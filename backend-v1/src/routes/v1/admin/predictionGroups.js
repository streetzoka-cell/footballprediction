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

// GET /api/v1/admin/prediction-groups/:date — pipeline groups (tiers + share_text, FT-resolved)
router.get('/:date', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    if (!date) return res.status(400).json({ success: false, error: 'Invalid date' });

    const data = req.params.date === 'today'
      ? (await svc.getUnifiedLatest()) || (await svc.getDay(date))
      : await svc.getDay(date);

    return res.json({
      success: true,
      date: data.date || date,
      source: data.source,
      fallback: !!data.fallback,
      familyOrder: svc.orderFamilies(data.groups),
      groups: data.groups || {},
      results: data.results || null,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/prediction-groups/:date/publish
// body: { families?: ["TOP10_DAILY", "PURE_1X2"] } — omit to publish all
router.post('/:date/publish', async (req, res, next) => {
  try {
    const date = resolveDate(req.params.date);
    if (!date) return res.status(400).json({ success: false, error: 'Invalid date' });

    const payload = await svc.publishCurated(date, req.body?.families || null);
    if (!payload) return res.status(404).json({ success: false, error: 'No groups available for this date' });

    return res.json({ success: true, date, families: Object.keys(payload.groups) });
  } catch (err) { next(err); }
});

module.exports = router;