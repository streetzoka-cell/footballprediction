const express = require('express');
const router = express.Router();
const matchDetailsService = require('../../services/MatchDetailsService');

router.get('/:id/lineups', async (req, res, next) => {
  try { res.json({ data: await matchDetailsService.getLineups(req.params.id) }); } 
  catch (err) { next(err); }
});

router.get('/:id/statistics', async (req, res, next) => {
  try { res.json({ data: await matchDetailsService.getStatistics(req.params.id) }); } 
  catch (err) { next(err); }
});

router.get('/:id/predictions', async (req, res, next) => {
  try { res.json({ data: await matchDetailsService.getPredictions(req.params.id) }); } 
  catch (err) { next(err); }
});

router.get('/:id/odds', async (req, res, next) => {
  try { res.json({ data: await matchDetailsService.getOdds(req.params.id) }); } 
  catch (err) { next(err); }
});

router.get('/h2h', async (req, res, next) => {
  try {
    const { team1, team2 } = req.query;
    if (!team1 || !team2) return res.status(400).json({ error: 'Missing team1 or team2' });
    res.json({ data: await matchDetailsService.getH2H(team1, team2) });
  } catch (err) { next(err); }
});

module.exports = router;