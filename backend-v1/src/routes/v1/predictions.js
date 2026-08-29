'use strict';

const express = require('express');
const router = express.Router();

const logger = require('../../utils/logger');
const predictionStore = require('../../services/PredictionStore');
const UserPredictionStore = require('../../services/UserPredictionStore');
const MLPredictionEngine = require('../../services/MLPredictionEngine');
const predictionGroupsService = require('../../services/PredictionGroupsService');
const pickGroupsArchive = require('../../services/PickGroupsArchiveService');
const { getDb } = require('../../config/firebase');

const { authenticateFirebaseUser } = require('../../middleware/firebaseAuth');
const createRateLimit = require('../../middleware/simpleRateLimit');
const { getDateOffset } = require('../../config/constants');

// ============================================================
// CONFIGURATION
// ============================================================

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

const commentLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'group-comment',
  message: 'Too many comments. Please slow down.',
});

// ============================================================
// HELPERS
// ============================================================

function resolveDate(value) {
  const date = String(value || getDateOffset(0)).trim();
  if (!DATE_REGEX.test(date)) return null;
  return date;
}

// ============================================================
// ML PREDICTION ENDPOINTS
// ============================================================

/**
 * GET /api/v1/predictions?date=YYYY-MM-DD
 * Returns pre-computed Pipeline 50 ML predictions.
 * Node does NOT perform ML inference — reads static JSON from Python.
 */
router.get('/', (req, res, next) => {
  try {
    const date = resolveDate(req.query.date);
    if (!date) {
      return res.status(400).json({ success: false, error: 'Invalid date. Expected YYYY-MM-DD format.' });
    }

    const predictions = MLPredictionEngine.getPredictionsForDate(date);
    if (predictions === null) {
      return res.status(404).json({ success: false, error: 'Predictions not generated for this date.', date });
    }

    return res.status(200).json({ success: true, date, count: predictions.length, data: predictions });
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/predictions/match/:matchId?date=YYYY-MM-DD
 */
router.get('/match/:matchId', (req, res, next) => {
  try {
    const matchId = String(req.params.matchId || '').trim();
    if (!matchId) {
      return res.status(400).json({ success: false, error: 'matchId is required.' });
    }

    const date = resolveDate(req.query.date);
    if (!date) {
      return res.status(400).json({ success: false, error: 'Invalid date. Expected YYYY-MM-DD format.' });
    }

    const prediction = MLPredictionEngine.getMatchPrediction(matchId, date);
    if (!prediction) {
      return res.status(404).json({ success: false, error: 'Prediction not found for this match.', matchId, date });
    }

    return res.status(200).json({ success: true, date, data: prediction });
  } catch (err) { next(err); }
});

// ============================================================
// PICK GROUPS — ★ history MUST be registered BEFORE /groups/:date
// (otherwise Express matches date="history" and 400s forever)
// ============================================================

/**
 * GET /api/v1/predictions/groups/history?days=10
 * Last N archived days + graph series + per-family totals + streaks.
 */
let historyCache = { key: '', at: 0, data: null };
router.get('/groups/history', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || '10', 10) || 10, 1), 60);
    const cacheKey = String(days);
    if (historyCache.key === cacheKey && Date.now() - historyCache.at < 60 * 1000) {
      return res.json({ success: true, data: historyCache.data });
    }
    const data = await pickGroupsArchive.getHistory(days);
    historyCache = { key: cacheKey, at: Date.now(), data };
    return res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/predictions/groups/:date
 * PUBLISHED (curated) groups, FT-resolved.
 */
router.get('/groups/:date', async (req, res, next) => {
  try {
    const date = String(req.params.date || '');
    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ success: false, error: 'Invalid date' });
    }
    const data = await predictionGroupsService.getCurated(date);
    if (!data) return res.status(404).json({ success: false, error: 'No published groups for this date' });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/predictions/groups/:date/feedback — public
 * Comments (latest 50) + ratings aggregated per family.
 */
router.get('/groups/:date/feedback', async (req, res, next) => {
  try {
    const date = String(req.params.date || '');
    if (!DATE_REGEX.test(date)) return res.status(400).json({ success: false, error: 'Invalid date' });

    const db = getDb();
    const [commentsSnap, ratingsSnap] = await Promise.all([
      db.collection('group_comments').where('date', '==', date).limit(200).get(),
      db.collection('group_ratings').where('date', '==', date).limit(500).get(),
    ]);

    const comments = commentsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 50);

    const famAgg = {};
    let sum = 0, count = 0;
    ratingsSnap.forEach((d) => {
      const r = d.data() || {};
      const fam = String(r.family || 'DAY');
      const stars = Number(r.stars);
      if (!Number.isFinite(stars) || stars < 1 || stars > 5) return;
      const a = (famAgg[fam] ||= { sum: 0, count: 0 });
      a.sum += stars; a.count += 1; sum += stars; count += 1;
    });
    const ratings = {};
    for (const [fam, a] of Object.entries(famAgg)) {
      ratings[fam] = { avg: Math.round((a.sum / a.count) * 10) / 10, count: a.count };
    }

    return res.json({
      success: true,
      data: { comments, ratings, overall: count > 0 ? { avg: Math.round((sum / count) * 10) / 10, count } : null },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/predictions/groups/:date/comments — auth
 * body: { text (2–400 chars), family?, displayName? }
 */
router.post('/groups/:date/comments', authenticateFirebaseUser, commentLimiter, async (req, res, next) => {
  try {
    const date = String(req.params.date || '');
    if (!DATE_REGEX.test(date)) return res.status(400).json({ success: false, error: 'Invalid date' });

    const text = String(req.body?.text || '').trim();
    const family = String(req.body?.family || 'DAY').slice(0, 40);
    if (text.length < 2 || text.length > 400) {
      return res.status(400).json({ success: false, error: 'Comment must be 2–400 characters.' });
    }

    const db = getDb();
    const ref = await db.collection('group_comments').add({
      date,
      family,
      uid: req.user.uid,
      displayName: String(req.body?.displayName || req.user.displayName || req.user.email?.split('@')[0] || 'Player').slice(0, 40),
      text,
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      data: { id: ref.id, date, family, text, displayName: req.body?.displayName || 'Player' },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/predictions/groups/:date/rate — auth, 1 rating per user per family (updatable)
 * body: { family?, stars (1–5) }
 */
router.post('/groups/:date/rate', authenticateFirebaseUser, async (req, res, next) => {
  try {
    const date = String(req.params.date || '');
    if (!DATE_REGEX.test(date)) return res.status(400).json({ success: false, error: 'Invalid date' });

    const family = String(req.body?.family || 'DAY').slice(0, 40);
    const stars = Number(req.body?.stars);
    if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ success: false, error: 'stars must be 1–5' });
    }

    const db = getDb();
    const docId = `${date}_${family}_${req.user.uid}`;
    await db.collection('group_ratings').doc(docId).set(
      { date, family, stars, uid: req.user.uid, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return res.json({ success: true, data: { family, stars } });
  } catch (err) { next(err); }
});

// ============================================================
// COMMUNITY VOTE SYSTEM
// ============================================================

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
  } catch (err) { next(err); }
});

// ============================================================
// AUTHENTICATED USER PREDICTIONS
// ============================================================

/**
 * GET /api/v1/predictions/user?date=YYYY-MM-DD
 */
router.get('/user', authenticateFirebaseUser, async (req, res, next) => {
  try {
    const date = resolveDate(req.query.date);
    if (!date) {
      return res.status(400).json({ success: false, error: 'Invalid date. Expected YYYY-MM-DD format.' });
    }

    const data = await UserPredictionStore.getUserPredictionsMap(req.user.uid, date);

    return res.status(200).json({ success: true, data, count: Object.keys(data).length, date });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/predictions/user
 */
router.post('/user', authenticateFirebaseUser, userPredictionLimiter, async (req, res, next) => {
  try {
    const { matchId, homeScore, awayScore, matchDate } = req.body || {};

    if (!matchId || !String(matchId).trim()) {
      return res.status(400).json({ success: false, error: 'matchId is required' });
    }

    const dateStr = String(matchDate || '').trim();
    if (!DATE_REGEX.test(dateStr)) {
      return res.status(400).json({ success: false, error: 'matchDate is required in YYYY-MM-DD format' });
    }

    const validHomeScore = Number.isInteger(homeScore) && homeScore >= 0 && homeScore <= 99;
    const validAwayScore = Number.isInteger(awayScore) && awayScore >= 0 && awayScore <= 99;
    if (!validHomeScore || !validAwayScore) {
      return res.status(400).json({ success: false, error: 'Invalid score format. Scores must be integers 0-99.' });
    }

    const result = await UserPredictionStore.savePrediction(req.user, req.body);

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

    if (err.statusCode === 409) {
      return res.status(409).json({ success: false, error: err.message });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ success: false, error: err.message });
    }

    next(err);
  }
});

// ============================================================
// LEGACY / AGGREGATE ENDPOINT
// ============================================================

/**
 * GET /api/v1/predictions/all
 * Backward-compatible community prediction endpoint (NOT the ML store).
 */
router.get('/all', (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: predictionStore.getAll(),
      stats: predictionStore.stats(),
    });
  } catch (err) { next(err); }
});

module.exports = router;