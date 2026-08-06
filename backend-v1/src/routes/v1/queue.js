// backend-v1/src/routes/v1/queue.js

const express = require('express');
const router = express.Router();

const QueueService = require('../../services/QueueService');
const adminAuth = require('../../middleware/adminAuth');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { optionalFirebaseUser } = require('../../middleware/firebaseAuth');
const createRateLimit = require('../../middleware/simpleRateLimit');

const publicQueueEnabled = process.env.ENABLE_PUBLIC_QUEUE === 'true';

const publicQueueLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: 'queue-public',
  message: 'Too many queue requests.',
});

const ADMIN_COLLECTIONS = new Set([
  'active_predictions',
  'prediction_snapshots',
  'zoka_picks',
  'zoka_vote_stats',
  'match_resolution_status',
  'daily_leaderboard',
  'leaderboard_summaries',
]);

const USER_ALLOWED_COLLECTIONS = new Set([
  'user_predictions',
  'zoka_vote_stats',
]);

const PUBLIC_ALLOWED_COLLECTIONS = new Set([
  'zoka_vote_stats',
]);

function validateUserOwnership(req, collection, docId, data) {
  if (!req.user || !req.user.uid) {
    throw ApiError.unauthorized('Authentication required');
  }

  const uid = req.user.uid;

  if (collection === 'user_predictions') {
    if (!String(docId).startsWith(`${uid}_`)) {
      throw ApiError.forbidden('You can only write your own prediction documents');
    }

    if (data && data.userId && data.userId !== uid) {
      throw ApiError.forbidden('userId does not match authenticated user');
    }

    return;
  }

  if (collection === 'zoka_vote_stats') {
    // Date-based stats document.
    // Increment-only validation should be added later.
    return;
  }

  throw ApiError.forbidden(`Collection not allowed for user queue: ${collection}`);
}

/**
 * POST /api/v1/queue/add
 */
router.post('/add', publicQueueLimiter, optionalFirebaseUser, async (req, res, next) => {
  try {
    const {
      collection,
      docId,
      data,
      options,
      priority,
      type,
    } = req.body || {};

    const normalizedCollection = String(collection || '').trim();

    if (!normalizedCollection) {
      throw ApiError.badRequest('Collection is required');
    }

    // 1. Check if it's an Admin Collection
    if (ADMIN_COLLECTIONS.has(normalizedCollection)) {
      const isAdmin = await adminAuth.verifyAdminRequest(req);
      
      if (!isAdmin) {
        throw ApiError.forbidden('Admin access required for this collection');
      }

      await QueueService.addToQueue({
        collection,
        docId,
        data,
        options,
        priority,
        type,
        source: 'admin-frontend',
      });

      return ApiResponse.accepted(res, {
        queued: true,
        actor: 'admin',
      });
    }

    // 2. Check if it's a User Collection
    if (req.user) {
      if (!USER_ALLOWED_COLLECTIONS.has(normalizedCollection)) {
        throw ApiError.forbidden('Collection not allowed for user queue');
      }

      validateUserOwnership(req, normalizedCollection, docId, data);

      await QueueService.addToQueue({
        collection,
        docId,
        data,
        options,
        priority,
        type,
        source: 'user-frontend',
      });

      return ApiResponse.accepted(res, {
        queued: true,
        actor: 'user',
      });
    }

    // 3. Check if Public Queue is enabled
    if (publicQueueEnabled) {
      if (!PUBLIC_ALLOWED_COLLECTIONS.has(normalizedCollection)) {
        throw ApiError.forbidden('Public queue collection not allowed');
      }

      await QueueService.addToQueue({
        collection,
        docId,
        data,
        options,
        priority,
        type,
        source: 'public-legacy',
      });

      return ApiResponse.accepted(res, {
        queued: true,
        actor: 'public',
      });
    }

    throw new ApiError(
      503,
      'QUEUE_DISABLED',
      'Backend queue endpoint is disabled',
      [
        'Send a valid Firebase ID token as Authorization: Bearer <token>',
        'or use a valid admin API key.',
      ]
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/queue/stats
 */
router.get('/stats', adminAuth, (req, res) => {
  ApiResponse.success(res, QueueService.getStats());
});

/**
 * GET /api/v1/queue/pending
 */
router.get('/pending', adminAuth, (req, res) => {
  ApiResponse.success(res, QueueService.getPending());
});

/**
 * GET /api/v1/queue/dead-letter
 */
router.get('/dead-letter', adminAuth, (req, res) => {
  ApiResponse.success(res, QueueService.getDeadLetter());
});

/**
 * POST /api/v1/queue/process
 */
router.post('/process', adminAuth, async (req, res, next) => {
  try {
    const result = await QueueService.processQueue();
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;