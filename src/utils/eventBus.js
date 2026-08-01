// (Your exact code for eventBus.js)
class EventBus {
  constructor() { this._handlers = new Map(); this._lastValue = new Map(); this._debug = false; }
  on(event, handler, { immediate = false } = {}) { /* ... */ }
  once(event, handler) { /* ... */ }
  off(event, handler) { /* ... */ }
  emit(event, payload) { /* ... */ }
  emitSync(event, payload) { /* ... */ }
  getLastValue(event) { return this._lastValue.get(event); }
  hasListeners(event) { return (this._handlers.get(event)?.size || 0) > 0; }
  listenerCount(event) { return this._handlers.get(event)?.size || 0; }
  removeAllListeners(event) { this._handlers.delete(event); }
  clear() { this._handlers.clear(); this._lastValue.clear(); }
  setDebug(enabled) { this._debug = enabled; }
}
export const EVENT = Object.freeze({ /* ... */ });
export const eventBus = new EventBus();
if (import.meta.env?.DEV) { eventBus.setDebug(false); }
export default eventBus;