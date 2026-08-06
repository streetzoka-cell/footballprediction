const express = require('express');
const router = express.Router();

const logger = require('../../utils/logger');
const predictionStore = require('../../services/PredictionStore');
const UserPredictionStore = require('../../services/UserPredictionStore');
const { authenticateFirebaseUser } = require('../../middleware/firebaseAuth');
const createRateLimit = require('../../middleware/simpleRateLimit');
const { getDateOffset } = require('../../config/constants');

const voteLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: 'prediction-vote',
  message: 'Too many prediction votes. Please slow down.',
});

const userPredictionLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'user-prediction',
  message: 'Too many prediction attempts. Please slow down.',
});

router.post('/vote', voteLimiter, async (req, res, next) => {
  try {
    const { matchId, choice, voterId } = req.body || {};
    const headerVoterId = req.headers['x-voter-id'];

    const result = predictionStore.vote({
      matchId,
      choice,
      voterId: voterId || headerVoterId || null,
    });

    return res.status(200).json({
      success: true,
      message: result.status === 'duplicate' ? 'Vote already recorded' : 'Vote recorded successfully',
      matchId: result.matchId,
      choice: result.choice,
      status: result.status,
      totalVotes: result.aggregate.totalVotes,
      votes: result.aggregate.votes,
      percentages: result.aggregate.percentages,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/user', authenticateFirebaseUser, async (req, res, next) => {
  try {
    const date = String(req.query.date || getDateOffset(0)).trim();
    const data = await UserPredictionStore.getUserPredictionsMap(req.user.uid, date);
    return res.json({ success: true, data, count: Object.keys(data).length, date });
  } catch (err) {
    next(err);
  }
});

router.post('/user', authenticateFirebaseUser, userPredictionLimiter, async (req, res, next) => {
  try {
    const { matchId, homeScore, awayScore, matchDate } = req.body || {};

    // Validate matchId
    if (!matchId || !String(matchId).trim()) {
      return res.status(400).json({ success: false, error: 'matchId is required' });
    }

    // Validate matchDate (CRITICAL - was missing)
    const dateStr = String(matchDate || '').trim();
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ success: false, error: 'matchDate is required in YYYY-MM-DD format' });
    }

    // Validate scores
    if (typeof homeScore !== 'number' || typeof awayScore !== 'number' ||
        homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
      return res.status(400).json({ success: false, error: 'Invalid score format. Scores must be integers 0-99.' });
    }

    const result = await UserPredictionStore.savePrediction(req.user, req.body || {});

    const httpStatus = result.status === 'recorded' || result.status === 'changed' ? 201 : 200;

    return res.status(httpStatus).json({
      success: true,
      status: result.status,
      message: result.status === 'duplicate' ? 'Prediction already recorded' : 'Prediction saved successfully',
      data: result.prediction,
      prediction: result.prediction,
    });
  } catch (err) {
    logger.error(`[Predictions Route] Save failed: ${err.message}`);

    // Return proper error codes
    if (err.statusCode === 409) {
      return res.status(409).json({ success: false, error: err.message });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
});

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