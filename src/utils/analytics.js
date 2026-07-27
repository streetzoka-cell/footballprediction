// src/utils/analytics.js
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
    onLCP(sendToGoogleAnalytics);
    onINP(sendToGoogleAnalytics);
    onCLS(sendToGoogleAnalytics);
    onFCP(sendToGoogleAnalytics);
    onTTFB(sendToGoogleAnalytics);

    // Global Error Catcher
    window.addEventListener('error', (event) => {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'exception', {
          description: event.message,
          fatal: true,
        });
      }
    });

    console.log('[Analytics] Web Vitals and Error tracking initialized.');
  } catch (err) {
    console.error('[Analytics] Initialization failed:', err);
  }
}