// footballprediction/src/utils/analytics.js
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

function sendToGoogleAnalytics({ name, delta, value, id }) {
  if (typeof window.gtag !== 'function') return;
  
  window.gtag('event', name, {
    event_category: 'Web Vitals',
    event_label: id,
    value: Math.round(name === 'CLS' ? delta * 1000 : delta),
    non_interaction: true,
  });
}

export function initAnalytics() {
  try {
    // Initialize Web Vitals tracking
    onLCP(sendToGoogleAnalytics);
    onINP(sendToGoogleAnalytics);
    onCLS(sendToGoogleAnalytics);
    onFCP(sendToGoogleAnalytics);
    onTTFB(sendToGoogleAnalytics);

    // Global Error Catcher for synchronous errors
    window.addEventListener('error', (event) => {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'exception', {
          description: event.message,
          fatal: true,
        });
      }
    });

    // Global Error Catcher for unhandled Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'exception', {
          description: `Unhandled Rejection: ${event.reason?.message || event.reason}`,
          fatal: false,
        });
      }
    });
  } catch (err) {
    // Only log initialization errors in development mode
    if (import.meta.env.DEV) {
      console.error('[Analytics] Initialization failed:', err);
    }
  }
}
