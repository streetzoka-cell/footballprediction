// src/utils/eventBus.js — Clean minimal mitt, same API as before
// If you use eventBus somewhere, this works. If not used, tree-shaken away.

class EventBus {
  constructor() {
    this._handlers = new Map();
    this._lastValue = new Map();
    this._debug = false;
  }
  on(event, handler, { immediate = false } = {}) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(handler);
    if (immediate && this._lastValue.has(event)) {
      try { handler(this._lastValue.get(event)); } catch {}
    }
    return () => this.off(event, handler);
  }
  once(event, handler) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }
  off(event, handler) {
    this._handlers.get(event)?.delete(handler);
  }
  emit(event, payload) {
    this._lastValue.set(event, payload);
    const handlers = this._handlers.get(event);
    if (!handlers) return;
    for (const h of [...handlers]) {
      try { h(payload); } catch (e) { if (this._debug) console.error(e); }
    }
  }
  emitSync(event, payload) {
    this.emit(event, payload);
  }
  getLastValue(event) { return this._lastValue.get(event); }
  hasListeners(event) { return (this._handlers.get(event)?.size || 0) > 0; }
  listenerCount(event) { return this._handlers.get(event)?.size || 0; }
  removeAllListeners(event) {
    if (event) this._handlers.delete(event);
    else this._handlers.clear();
  }
  clear() { this._handlers.clear(); this._lastValue.clear(); }
  setDebug(enabled) { this._debug = enabled; }
}

export const EVENT = Object.freeze({
  MATCH_UPDATE: 'match:update',
  GOAL: 'match:goal',
  NAVIGATE: 'app:navigate',
  THEME_CHANGE: 'app:theme',
  AUTH_CHANGE: 'auth:change',
});

export const eventBus = new EventBus();
if (import.meta.env?.DEV) { eventBus.setDebug(false); }
export default eventBus;
