// src/components/AnalyticsTracker.jsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    // Check if gtag is loaded
    if (typeof window.gtag === 'function') {
      // Send pageview to Google Analytics
      window.gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
      });
    }
  }, [location.pathname, location.search]);

  return null; // This component renders nothing
}