const LeaderboardEngine = require('../../services/LeaderboardEngine');
const logger = require('../../utils/logger');

function getDateOffset(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split('T')[0];
}

async function execute() {
  try {
    logger.info('[Cron] Starting automatic leaderboard rebuild...');
    
    const today = getDateOffset(0);
    const yesterday = getDateOffset(-1);
    
    // Rebuild daily leaderboards to process any recently finished matches
    await LeaderboardEngine.rebuildDailyLeaderboard(today);
    await LeaderboardEngine.rebuildDailyLeaderboard(yesterday);
    
    // Rebuild period summaries
    await LeaderboardEngine.rebuildPeriod('weekly');
    await LeaderboardEngine.rebuildPeriod('monthly');
    
    logger.info('[Cron] Automatic leaderboard rebuild complete.');
  } catch (err) {
    logger.error(`[Cron] Leaderboard rebuild failed: ${err.message}`);
  }
}

module.exports = {
  execute,
  // Run every 15 minutes
  schedule: '*/15 * * * *'
};