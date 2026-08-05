// backend-v1/src/routes/v1/predictions.js

const express = require('express');
const router = express.Router();

const logger = require('../../utils/logger');
const predictionStore = require('../../services/PredictionStore');
const UserPredictionStore = require('../../services/UserPredictionStore');
const { authenticateFirebaseUser } = require('../../middleware/firebaseAuth');
const createRateLimit = require('../../middleware/simpleRateLimit');
const { getDateOffset } = require('../../config/constants');

// 4. Endpoint-specific rate limits
const voteLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 votes per minute
  keyPrefix: 'prediction-vote',
  message: 'Too many prediction votes. Please slow down.',
});

const userPredictionLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 predictions per minute
  keyPrefix: 'user-prediction',
  message: 'Too many prediction attempts. Please slow down.',
});

/**
 * POST /api/v1/predictions/vote
 */
router.post('/vote', voteLimiter, async (req, res, next) => {
  try {
    const { matchId, choice, voterId } = req.body || {};
    const headerVoterId = req.headers['x-voter-id'];

    const result = predictionStore.vote({
      matchId,
      choice,
      voterId: voterId || headerVoterId || null,
    });

    logger.info(
      `[Prediction Vote] match=${result.matchId} choice=${result.choice} status=${result.status} total=${result.aggregate.totalVotes}`
    );

    return res.status(200).json({
      success: true,
      message:
        result.status === 'duplicate'
          ? 'Vote already recorded'
          : 'Vote recorded successfully',
      matchId: result.matchId,
      choice: result.choice,
      status: result.status,
      totalVotes: result.aggregate.totalVotes,
      votes: result.aggregate.votes,
      percentages: result.aggregate.percentages,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: {
          code: err.code || 'BAD_REQUEST',
          message: err.message,
          details: err.details || [],
        },
        meta: {
          requestId: res.locals?.requestId || null,
          timestamp: new Date().toISOString(),
        },
        error: err.message,
      });
    }
    next(err);
  }
});

/**
 * GET /api/v1/predictions/user?date=YYYY-MM-DD
 */
router.get('/user', authenticateFirebaseUser, async (req, res, next) => {
  try {
    // 11. IDOR Prevention: Always use req.user.uid from token, never req.query.uid
    const date = String(req.query.date || getDateOffset(0)).trim();

    const data = await UserPredictionStore.getUserPredictionsMap(
      req.user.uid,
      date
    );

    return res.json({
      success: true,
      data,
      count: Object.keys(data).length,
      date,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/predictions/user
 */
router.post(
  '/user',
  authenticateFirebaseUser,
  userPredictionLimiter,
  async (req, res, next) => {
    try {
      // 10. Business Logic Validation: Early check before hitting services
      const { matchId, homeScore, awayScore } = req.body || {};
      if (!matchId || !matchId.trim()) {
        return res.status(400).json({ success: false, error: 'matchId is required' });
      }
      if (typeof homeScore !== 'number' || typeof awayScore !== 'number' || 
          homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
        return res.status(400).json({ success: false, error: 'Invalid score format' });
      }

      // Pass the secure req.user object. UserPredictionStore will ignore any UID in req.body.
      const result = await UserPredictionStore.savePrediction(
        req.user,
        req.body || {}
      );

      const httpStatus =
        result.status === 'recorded' || result.status === 'changed'
          ? 201
          : 200;

      return res.status(httpStatus).json({
        success: true,
        status: result.status,
        message:
          result.status === 'duplicate'
            ? 'Prediction already recorded'
            : 'Prediction saved successfully',
        data: result.prediction,
        prediction: result.prediction,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/predictions/:matchId
 */
router.get('/:matchId', (req, res, next) => {
  try {
    const data = predictionStore.get(req.params.matchId);

    return res.json({
      success: true,
      matchId: data.matchId,
      totalVotes: data.totalVotes,
      votes: data.votes,
      percentages: data.percentages,
      updatedAt: data.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/predictions
 */
router.get('/', (req, res, next) => {
  try {
    res.json({
      success: true,
      data: predictionStore.getAll(),
      stats: predictionStore.stats(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;