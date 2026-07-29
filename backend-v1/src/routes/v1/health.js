const express = require('express');
const router = express.Router();

router.get('/simple', (req, res) => res.send('OK'));
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;