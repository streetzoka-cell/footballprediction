const express = require('express');
const router = express.Router();
const teamRepo = require('../../repositories/TeamRepository');
const ProviderManager = require('../../providers/ProviderManager');
const { isExpired } = require('../../config/firebase');

router.get('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    let team = await teamRepo.get(id);
    
    if (team && !isExpired(team)) return res.json({ data: team });
    
    // Lazy load from Provider if expired or missing
    const { data: fresh } = await ProviderManager.getTeam(id);
    await teamRepo.upsert(fresh);
    res.json({ data: fresh });
  } catch (err) { next(err); }
});

module.exports = router;