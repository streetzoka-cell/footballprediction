const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // Increase limit for schedulers/routes
  }
}

const eventBus = new EventBus();

const EVENT = {
  LIVE_FIXTURES_UPDATED: 'live:fixtures:updated',
  DAILY_FIXTURES_UPDATED: 'daily:fixtures:updated',
  STANDINGS_UPDATED: 'standings:updated',
  CACHE_INVALIDATED: 'cache:invalidated',
};

module.exports = { eventBus, EVENT };