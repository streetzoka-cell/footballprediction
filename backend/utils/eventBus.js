const EventEmitter = require('events');
const logger = require('./logger');

class ZokaEventBus extends EventEmitter {
  constructor() {
    super();
    // Prevent memory leak warnings as we attach more workers/listeners
    this.setMaxListeners(20);
  }

  emit(event, payload) {
    // Use debug to prevent log spam during frequent events (e.g. cache invalidation)
    logger.debug(`[EventBus] Emitting: ${event}`);
    
    // Defensive boundary: prevent a single failing listener from crashing the process
    try {
      super.emit(event, payload);
    } catch (err) {
      logger.error(`[EventBus] Listener error for event "${event}": ${err.message}`);
    }
  }
}

const eventBus = new ZokaEventBus();

const EVENT = Object.freeze({
  LIVE_FIXTURES_UPDATED: 'live:fixtures:updated',
  DAILY_FIXTURES_UPDATED: 'daily:fixtures:updated',
  STANDINGS_UPDATED: 'standings:updated',
  CACHE_INVALIDATED: 'cache:invalidated',
});

module.exports = { eventBus, EVENT };