/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ZOKASCORE — Performance Monitor (Cleaned)
   Wraps API calls with timing & optional reporting
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const THRESHOLD_MS = 3000;
const SAMPLE_RATE = 0.05; // log only 5% of fast calls to avoid noise

/**
 * Wraps an async function (typically an API call) with performance tracking.
 * Slow calls (>3s) are always logged; fast calls are sampled.
 */
export function monitorApiCall(label, fn, { threshold = THRESHOLD_MS } = {}) {
  const start = performance.now();
  return fn()
    .then((result) => {
      const elapsed = performance.now() - start;
      const isSlow = elapsed > threshold;

      if (isSlow || Math.random() < SAMPLE_RATE) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          const tag = isSlow ? "🐌 SLOW" : "✓";
          console.log(`[perf] ${tag} ${label}: ${elapsed.toFixed(0)}ms`);
        }

        // Report to analytics in production (replace with your analytics SDK)
        if (!isSlow && typeof window !== "undefined" && window.navigator?.sendBeacon) {
          // Future: send slow-call metrics via sendBeacon to /api/metrics
        }
      }
      return result;
    })
    .catch((err) => {
      const elapsed = performance.now() - start;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.error(`[perf] ✗ ${label}: ${elapsed.toFixed(0)}ms — ${err.message}`);
      }
      throw err;
    });
}
