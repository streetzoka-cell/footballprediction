// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/eventBus.js
// CROSS-MODULE EVENT SYSTEM
//
// Reactive communication between dataLayer, api, hooks, and UI
// without tight coupling. All events are asynchronous (queueMicrotask).
// ═══════════════════════════════════════════════════════════════

class EventBus {
  constructor() {
    this._handlers = new Map();
    this._lastValue = new Map();
    this._debug = false;
  }

  /** Subscribe to an event. Returns unsubscribe function. */
  on(event, handler, { immediate = false } = {}) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);

    if (immediate && this._lastValue.has(event)) {
      try { handler(this._lastValue.get(event)); } catch (err) {
        console.error(`[EventBus] Immediate handler error for ${event}:`, err);
      }
    }

    return () => this.off(event, handler);
  }

  /** Subscribe once, auto-unsubscribe after first emission. */
  once(event, handler) {
    const unsub = this.on(event, (payload) => {
      unsub();
      handler(payload);
    });
    return unsub;
  }

  /** Unsubscribe a specific handler from an event. */
  off(event, handler) {
    const handlers = this._handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) this._handlers.delete(event);
    }
  }

  /** Emit an event asynchronously. */
  emit(event, payload) {
    this._lastValue.set(event, payload);
    const handlers = this._handlers.get(event);
    if (!handlers?.size) return;

    queueMicrotask(() => {
      handlers.forEach((handler) => {
        try { handler(payload); } catch (err) {
          console.error(`[EventBus] Handler error for ${event}:`, err);
        }
      });
    });
  }

  /** Emit synchronously — use sparingly for critical paths only. */
  emitSync(event, payload) {
    this._lastValue.set(event, payload);
    const handlers = this._handlers.get(event);
    if (!handlers?.size) return;

    handlers.forEach((handler) => {
      try { handler(payload); } catch (err) {
        console.error(`[EventBus] Handler error for ${event}:`, err);
      }
    });
  }

  /** Get last emitted value without subscribing. */
  getLastValue(event) { return this._lastValue.get(event); }
  
  /** Check if event has listeners. */
  hasListeners(event) { return (this._handlers.get(event)?.size || 0) > 0; }
  
  /** Get listener count. */
  listenerCount(event) { return this._handlers.get(event)?.size || 0; }

  /** Remove all listeners for one event. */
  removeAllListeners(event) { this._handlers.delete(event); }

  /** Remove all listeners and stored values. */
  clear() { this._handlers.clear(); this._lastValue.clear(); }

  /** Toggle debug logging. */
  setDebug(enabled) { this._debug = enabled; }
}

// ═══════════════════════════════════════════════════
// PREDEFINED EVENT NAMES
// ═══════════════════════════════════════════════════
export const EVENT = Object.freeze({
  // Fixture data updates
  FOOTBALL_UPDATED: 'football:updated',
  BASKETBALL_UPDATED: 'basketball:updated',
  FIXTURES_UPDATED: 'fixtures:updated',

  // ★ Zoka Picks updates (for guests)
  ZOKA_PICKS_UPDATED: 'zoka:picks:updated',
  ZOKA_VOTE_CAST: 'zoka:vote:cast',

  // ★ Featured match predictions (for logged-in users)
  PREDICTIONS_UPDATED: 'predictions:updated',
  USER_PREDICTION_SAVED: 'user:prediction:saved',

  // Leaderboard updates
  LEADERBOARD_UPDATED: 'leaderboard:updated',
  DAILY_LEADERBOARD_UPDATED: 'leaderboard:daily:updated',
  GOAT_LEADERBOARD_UPDATED: 'leaderboard:goat:updated',

  // User auth
  USER_SIGNIN: 'user:signin',
  USER_SIGNOUT: 'user:signout',
  USER_DATA_LOADED: 'user:data:loaded',

  // Cache
  CACHE_INVALIDATED: 'cache:invalidated',

  // Match resolution (admin)
  MATCH_RESOLVED: 'match:resolved',
});

// ═══════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════
export const eventBus = new EventBus();

if (import.meta.env?.DEV) {
  eventBus.setDebug(false);
}

export default eventBus;