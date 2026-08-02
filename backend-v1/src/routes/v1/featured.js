// backend-v1/src/routes/v1/featured.js

const express = require('express');
const router = express.Router();

const FeaturedStore = require('../../services/FeaturedStore');
const ContentMigrationService = require('../../services/ContentMigrationService');
const adminAuth = require('../../middleware/adminAuth');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

/**
 * GET /api/v1/featured?date=YYYY-MM-DD
 */
router.get('/', async (req, res, next) => {
  try {
    const date = String(req.query.date || '').trim();

    if (!date) {
      throw ApiError.badRequest('date query parameter is required');
    }

    const matches = await FeaturedStore.list(date);

    return res.json({
      data: matches,
      matches,
      count: matches.length,
      date,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/featured/admin/add
 */
router.post('/admin/add', adminAuth, async (req, res, next) => {
  try {
    const { date, match } = req.body || {};

    if (!date) {
      throw ApiError.badRequest('date is required');
    }

    if (!match) {
      throw ApiError.badRequest('match is required');
    }

    const added = await FeaturedStore.add(date, match);

    ApiResponse.success(res, added, { status: 201 });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/featured/admin/remove
 */
router.post('/admin/remove', adminAuth, async (req, res, next) => {
  try {
    const { date, matchId } = req.body || {};

    if (!date) {
      throw ApiError.badRequest('date is required');
    }

    if (!matchId) {
      throw ApiError.badRequest('matchId is required');
    }

    const removed = await FeaturedStore.remove(date, matchId);

    ApiResponse.success(res, {
      removed: Boolean(removed),
      match: removed,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/featured/admin/replace
 */
router.post('/admin/replace', adminAuth, async (req, res, next) => {
  try {
    const { date, matches } = req.body || {};

    if (!date) {
      throw ApiError.badRequest('date is required');
    }

    if (!Array.isArray(matches)) {
      throw ApiError.badRequest('matches must be an array');
    }

    const saved = await FeaturedStore.replace(date, matches);

    ApiResponse.success(res, saved);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/featured/admin/import
 *
 * Copies existing Firebase featured matches into the backend store.
 * Safe to run multiple times.
 *
 * Body:
 * {
 *   "date": "2026-08-02"
 * }
 */
router.post('/admin/import', adminAuth, async (req, res, next) => {
  try {
    const date = String(req.body?.date || req.query.date || '').trim();

    if (!date) {
      throw ApiError.badRequest('date is required');
    }

    const result = await ContentMigrationService.importFeaturedFromFirebase(date);

    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;