// src/utils/performanceMonitor.js
import { useObservabilityStore } from '../store/useObservabilityStore';

/**
 * Wraps an async API call to measure its execution time and log the result.
 * @param {string} endpoint - The API endpoint or query name (e.g., 'GET /fixtures').
 * @param {Function} fetchFn - The async function to execute.
 * @returns {Promise<any>} - The result of the fetchFn.
 */
export async function monitorApiCall(endpoint, fetchFn) {
  const startTime = performance.now();
  try {
    const result = await fetchFn();
    const latency = performance.now() - startTime;
    
    // Log success latency
    useObservabilityStore.getState().logApiCall(endpoint, latency, true);
    return result;
  } catch (error) {
    const latency = performance.now() - startTime;
    
    // Log failure latency and error
    useObservabilityStore.getState().logApiCall(endpoint, latency, false);
    useObservabilityStore.getState().logError({ ...error, endpoint });
    throw error;
  }
}

/**
 * Tracks React Query cache hits and misses for observability.
 * @param {object} query - The React Query query object.
 */
export function trackCacheHit(query) {
  const obs = useObservabilityStore.getState();
  const isStale = query.state.dataUpdatedAt === 0 || query.state.isInvalidated;
  
  if (isStale || query.state.status === 'pending') {
    obs.logCacheMiss();
  } else {
    obs.logCacheHit();
  }
}