// src/store/useObservabilityStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_LOGS = 100;

export const useObservabilityStore = create(
  persist(
    (set, get) => ({
      apiMetrics: {}, // { 'GET /fixtures': { count, totalLatency, avgLatency, failures } }
      errorLogs: [],  // [{ timestamp, message, type, stack }]
      cacheHits: 0,
      cacheMisses: 0,

      logApiCall: (endpoint, latency, isSuccess) => set((state) => {
        const existing = state.apiMetrics[endpoint] || { count: 0, totalLatency: 0, avgLatency: 0, failures: 0 };
        const newCount = existing.count + 1;
        const newTotal = existing.totalLatency + latency;
        
        return {
          apiMetrics: {
            ...state.apiMetrics,
            [endpoint]: {
              count: newCount,
              totalLatency: newTotal,
              avgLatency: Math.round(newTotal / newCount),
              failures: isSuccess ? existing.failures : existing.failures + 1,
            }
          }
        };
      }),

      logCacheHit: () => set((state) => ({ cacheHits: state.cacheHits + 1 })),
      logCacheMiss: () => set((state) => ({ cacheMisses: state.cacheMisses + 1 })),

      logError: (error) => set((state) => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          message: error.message || 'Unknown error',
          type: error.type || 'unknown',
          stack: error.stack || null,
        };
        return { errorLogs: [logEntry, ...state.errorLogs].slice(0, MAX_LOGS) };
      }),

      clearLogs: () => set({ errorLogs: [], apiMetrics: {}, cacheHits: 0, cacheMisses: 0 }),
    }),
    { name: 'zoka-observability' }
  )
);