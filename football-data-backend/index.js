const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const logger = require('./utils/logger');
const scheduler = require('./schedulers/scheduler');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', require('./routes/matches'));
app.use('/api/standings', require('./routes/standings'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/competitions', require('./routes/competitions'));

app.get('/api/health', function(req, res) {
  res.json({
    status: 'ok',
    service: 'football-data-backend',
    provider: 'Football-Data.org',
    env: env.nodeEnv,
    competitions: env.competitions,
    schedulerEnabled: env.scheduler.enabled,
    uptime: process.uptime(),
  });
});

app.use(function(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.url}` });
});

app.use(function(err, req, res, next) {
  logger.error(`[SERVER] Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

async function boot() {
  try {
    await scheduler.initialSeed();

    app.listen(env.port, function() {
      logger.info('========================================================');
      logger.info('  football-data-backend');
      logger.info('  Provider:  Football-Data.org');
      logger.info('  Port:      ' + env.port);
      logger.info('  Env:       ' + env.nodeEnv);
      logger.info('  Scheduler: ' + env.scheduler.enabled);
      logger.info('  Leagues:   ' + env.competitions.join(', '));
      logger.info('========================================================');
    });

    scheduler.start();
  } catch (err) {
    logger.error(`[BOOT] Fatal error: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  }
}

boot();
