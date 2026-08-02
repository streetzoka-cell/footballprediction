// footballprediction/backend-v1/src/providers/SportScoreAdapter.js

const BaseProvider = require('./BaseProvider');
const logger = require('../utils/logger');

class SportScoreAdapter extends BaseProvider {
  constructor() {
    super();
    this.providerName = 'sportscore';
    logger.info('[SportScoreAdapter] Initialized (Stub)');
  }

  isBudgetAvailable() { return false; }
  getRemaining() { return 0; }
  
  async getLiveFixtures() { return []; }
  async getFixtures(date) { return []; }
}

module.exports = new SportScoreAdapter();
