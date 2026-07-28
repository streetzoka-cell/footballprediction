/*
 * eventBus.js
 */
const EventEmitter = require('events');
const logger = require('./logger');

class ZokaEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
  }

  emit(event, payload) {
    logger.debug(`[EventBus] Emitting: ${event}`);
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