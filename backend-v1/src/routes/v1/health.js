// backend-v1/src/routes/v1/health.js
const express = require('express');
const router = express.Router();
const ProviderFactory = require('../../providers/ProviderFactory');
const env = require('../../config/env');

router.get('/', async (req, res) => {
  try {
    const provider = ProviderFactory.getProvider();
    const providerHealth = await provider.health();
    
    res.json({
      status: 'healthy',
      provider: providerHealth.provider,
      budgetRemaining: providerHealth.budgetRemaining,
      budgetDaily: providerHealth.budgetDaily,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

module.exports = router;