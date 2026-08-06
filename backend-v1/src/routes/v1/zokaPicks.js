const express = require('express');
const router = express.Router();

const ZokaPicksStore = require('../../services/ZokaPicksStore');
const ContentMigrationService = require('../../services/ContentMigrationService');
const adminAuth = require('../../middleware/adminAuth');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

/**
 * GET /api/v1/zoka-picks?date=YYYY-MM-DD
 * Public endpoint - returns only published picks
 */
router.get('/', async (req, res, next) => {
  try {
    const date = String(req.query.date || '').trim();

    if (!date) {
      throw ApiError.badRequest('date query parameter is required');
    }

    const published = await ZokaPicksStore.getPublished(date);

    if (!published) {
      return res.json({
        data: null,
        matches: [],
        published: false,
        date,
      });
    }

    return res.json({
      data: published.matches || [],
      matches: published.matches || [],
      picks: published,
      published: true,
      date,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/zoka-picks/draft?date=YYYY-MM-DD
 * Admin only
 */
router.get('/draft', adminAuth, async (req, res, next) => {
  try {
    const date = String(req.query.date || '').trim();

    if (!date) {
      throw ApiError.badRequest('date query parameter is required');
    }

    const draft = await ZokaPicksStore.getDraft(date);
    ApiResponse.success(res, draft);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/zoka-picks/history?days=7
 * Admin only - reads from local JSON files (no Firestore reads)
 */
router.get('/history', adminAuth, async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
    const history = await ZokaPicksStore.getHistory(days);
    ApiResponse.success(res, history);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/zoka-picks/admin/save-draft
 */
router.post('/admin/save-draft', adminAuth, async (req, res, next) => {
  try {
    const payload = req.body?.payload || req.body || {};
    const date = String(req.body?.date || payload.date || '').trim();

    if (!date) {
      throw ApiError.badRequest('date is required');
    }

    const saved = await ZokaPicksStore.saveDraft(date, payload);
    ApiResponse.success(res, saved);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/zoka-picks/admin/publish
 */
router.post('/admin/publish', adminAuth, async (req, res, next) => {
  try {
    const payload = req.body?.payload || req.body || {};
    const date = String(req.body?.date || payload.date || '').trim();

    if (!date) {
      throw ApiError.badRequest('date is required');
    }

    const published = await ZokaPicksStore.publish(date, payload);
    ApiResponse.success(res, published);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/zoka-picks/admin/unpublish
 */
router.post('/admin/unpublish', adminAuth, async (req, res, next) => {
  try {
    const date = String(req.body?.date || '').trim();

    if (!date) {
      throw ApiError.badRequest('date is required');
    }

    const result = await ZokaPicksStore.unpublish(date);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/zoka-picks/admin/import
 */
router.post('/admin/import', adminAuth, async (req, res, next) => {
  try {
    const date = String(req.body?.date || req.query.date || '').trim();

    if (!date) {
      throw ApiError.badRequest('date is required');
    }

    const result = await ContentMigrationService.importZokaPicksFromFirebase(date);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;