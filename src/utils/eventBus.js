// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/eventBus.js
// CROSS-MODULE EVENT SYSTEM
//
// Provides reactive communication between dataLayer, api, hooks,
// and UI components without tight coupling.
//
// Events:
//   data:updated      - Any data layer update
//   fixtures:updated  - Fixture data changed
//   predictions:updated - Prediction data changed
//   leaderboard:updated - Leaderboard data changed
//   user:signin        - User signed in
//   user:signout       - User signed out
//   cache:invalidated  - Cache was invalidated
//   match:resolved     - A match was resolved (admin)
// ═══════════════════════════════════════════════════════════════

/**
 * Lightweight typed event emitter.
 * Zero dependencies, ~100 lines.
 */
class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
    
    /** @type {Map<string, *>} Last emitted value per event (for late subscribers) */
    this._lastValue = new Map();
    
    /** Debug mode */
    this._debug = false;
  }

  /**
   * Subscribe to an event.
   * @param {string} event - Event name
   * @param {Function} handler - Callback (receives payload)
   * @param {Object} options
   * @param {boolean} options.immediate - If true, call handler immediately with last value
   * @returns {Function} Unsubscribe function
   */
  on(event, handler, { immediate = false } = {}) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);

    if (this._debug) {
      console.log(`[EventBus] +${event} (total: ${this._handlers.get(event).size})`);
    }

    // Immediately call with last value if available
    if (immediate && this._lastValue.has(event)) {
      try {
        handler(this._lastValue.get(event));
      } catch (err) {
        console.error(`[EventBus] Immediate handler error for ${event}:`, err);
      }
    }

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Subscribe to an event, auto-unsubscribe after first call.
   * @param {string} event - Event name
   * @param {Function} handler - Callback (receives payload)
   * @returns {Function} Unsubscribe function (no-op after first call)
   */
  once(event, handler) {
    const unsub = this.on(event, (payload) => {
      unsub();
      handler(payload);
    });
    return unsub;
  }

  /**
   * Unsubscribe from an event.
   */
  off(event, handler) {
    const handlers = this._handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._handlers.delete(event);
      }
    }
    if (this._debug) {
      console.log(`[EventBus] -${event} (remaining: ${handlers?.size || 0})`);
    }
  }

  /**
   * Emit an event with a payload.
   * @param {string} event - Event name
   * @param {*} payload - Data to pass to handlers
   */
  emit(event, payload) {
    // Store last value for late subscribers
    this._lastValue.set(event, payload);

    const handlers = this._handlers.get(event);
    if (!handlers || handlers.size === 0) return;

    if (this._debug) {
      console.log(`[EventBus] →${event}`, payload);
    }

    // Use microtask to avoid synchronous cascading
    queueMicrotask(() => {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[EventBus] Handler error for ${event}:`, err);
        }
      });
    });
  }

  /**
   * Emit an event synchronously (for critical paths).
   * Use sparingly — prefer emit() for most cases.
   */
  emitSync(event, payload) {
    this._lastValue.set(event, payload);

    const handlers = this._handlers.get(event);
    if (!handlers || handlers.size === 0) return;

    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Handler error for ${event}:`, err);
      }
    });
  }

  /**
   * Get the last emitted value for an event (without subscribing).
   */
  getLastValue(event) {
    return this._lastValue.get(event);
  }

  /**
   * Check if any handlers are registered for an event.
   */
  hasListeners(event) {
    return (this._handlers.get(event)?.size || 0) > 0;
  }

  /**
   * Get count of handlers for an event.
   */
  listenerCount(event) {
    return this._handlers.get(event)?.size || 0;
  }

  /**
   * Remove all handlers for a specific event.
   */
  removeAllListeners(event) {
    this._handlers.delete(event);
  }

  /**
   * Remove all handlers for all events.
   */
  clear() {
    this._handlers.clear();
    this._lastValue.clear();
  }

  /**
   * Enable/disable debug logging.
   */
  setDebug(enabled) {
    this._debug = enabled;
  }
}

// ═══════════════════════════════════════════════════
// PREDEFINED EVENT NAMES
// ═══════════════════════════════════════════════════
export const EVENT = Object.freeze({
  // Data layer events
  DATA_UPDATED: 'data:updated',
  
  // Sport-specific fixture events
  FOOTBALL_UPDATED: 'football:updated',
  BASKETBALL_UPDATED: 'basketball:updated',
  FIXTURES_UPDATED: 'fixtures:updated',     // { sport, dateStr, snapshot }
  
  // Prediction events
  PREDICTIONS_UPDATED: 'predictions:updated', // { dateStr, matchId? }
  USER_PREDICTION_SAVED: 'user:prediction:saved', // { uid, matchId, dateStr }
  
  // Leaderboard events
  LEADERBOARD_UPDATED: 'leaderboard:updated', // { period, dateStr? }
  DAILY_LEADERBOARD_UPDATED: 'leaderboard:daily:updated',
  GOAT_LEADERBOARD_UPDATED: 'leaderboard:goat:updated',
  
  // User events
  USER_SIGNIN: 'user:signin',     // { uid }
  USER_SIGNOUT: 'user:signout',
  USER_DATA_LOADED: 'user:data:loaded', // { uid }
  
  // Cache events
  CACHE_INVALIDATED: 'cache:invalidated', // { key, prefix? }
  
  // Match resolution events
  MATCH_RESOLVED: 'match:resolved', // { matchId, dateStr, results }
  
  // Zoka events
  ZOKA_PICKS_UPDATED: 'zoka:picks:updated',
  ZOKA_VOTE_CAST: 'zoka:vote:cast', // { matchId, vote }
});

// ═══════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════
export const eventBus = new EventBus();

// Enable debug in development
if (import.meta.env?.DEV) {
  eventBus.setDebug(false); // Set to true for verbose logging
}

export default eventBus;