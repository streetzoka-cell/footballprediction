import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

function sendMetric({ name, delta, value, id }) {
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
    onLCP(sendMetric);
    onINP(sendMetric);
    onCLS(sendMetric);
    onFCP(sendMetric);
    onTTFB(sendMetric);
    window.addEventListener('error', (e) => {
      window.gtag?.('event', 'exception', { description: e.message, fatal: true });
    });
    window.addEventListener('unhandledrejection', (e) => {
      window.gtag?.('event', 'exception', { description: `Rejection: ${e.reason?.message || e.reason}`, fatal: false });
    });
  } catch (err) {
    if (import.meta.env?.DEV) console.error('[Analytics] init failed', err);
  }
}
