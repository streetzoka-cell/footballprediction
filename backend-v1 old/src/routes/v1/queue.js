// footballprediction/backend-v1/src/routes/v1/queue.js

const express = require('express');
const router = express.Router();
const { addToQueue } = require('../../services/QueueService');

// POST /api/v1/queue/add
router.post('/add', async (req, res) => {
  try {
    const { collection, docId, data, options } = req.body;
    if (!collection || !docId || !data) return res.status(400).json({ error: 'Missing fields' });
    
    await addToQueue({ collection, docId, data, options });
    res.status(202).json({ success: true, message: 'Queued for sync' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
