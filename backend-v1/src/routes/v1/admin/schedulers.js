const express = require('express');
const router = express.Router();
const adminAuth = require('../../../middleware/adminAuth');
const schedulerEngine = require('../../../scheduler/SchedulerEngine');
const todayFixturesJob = require('../../../scheduler/jobs/todayFixturesJob');
const liveJob = require('../../../scheduler/jobs/liveJob');
const standingsJob = require('../../../scheduler/jobs/standingsJob');

// Protect all admin routes
router.use(adminAuth);

// GET /api/v1/admin/schedulers/metrics
router.get('/metrics', (req, res) => {
  res.json(schedulerEngine.getMetrics());
});

// POST /api/v1/admin/schedulers/trigger/:jobName
router.post('/trigger/:jobName', async (req, res, next) => {
  try {
    const { jobName } = req.params;
    let result;
    
    switch (jobName) {
      case 'today': result = await todayFixturesJob.execute(); break;
      case 'live': result = await liveJob.execute(); break;
      case 'standings': result = await standingsJob.execute(); break;
      default: return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ success: true, result });
  } catch (err) { next(err); }
});

module.exports = router;