// src/App.jsx

import { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom"; // ★ FIX: Import useLocation for tracking

import Providers from "./app/providers";
import AppRoutes from "./app/AppRoutes";

import ScrollToTop from "./app/ScrollToTop";
import Breadcrumbs from "./components/Breadcrumbs";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

import SEO from "./components/SEO";
import StructuredData from "./components/StructuredData";
import AppLoader from "./components/AppLoader";
import ErrorBoundary from "./components/ErrorBoundary";

import {
  organizationSchema,
  websiteSchema,
} from "./utils/schema";

import { initApp } from "./utils/api";

/**
 * Cleans up unnecessary local storage, session storage, and old caches 
 * to ensure the app loads fast without carrying junk from previous sessions.
 */
const cleanupStaleJunk = () => {
  try {
    // 1. Clear Session Storage (safe to clear on every fresh load)
    sessionStorage.clear();

    // 2. Clean up specific LocalStorage keys (Keep auth & user prefs)
    const keysToKeep = ['firebase:authUser', 'nv-admin-remembered', 'theme'];
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Add patterns of junk data here (e.g., old caches, temp drafts)
      if (
        key && 
        (key.startsWith('temp-') || key.startsWith('old-cache-') || key.startsWith('draft-'))
      ) {
        if (!keysToKeep.some(keepKey => key.includes(keepKey))) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 3. Clean up old Cache API (if you use PWA/Service Workers)
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          // Delete caches that start with 'old-' or are temporary
          if (cacheName.startsWith('old-') || cacheName.startsWith('temp-')) {
            caches.delete(cacheName);
          }
        });
      });
    }

    // 4. Unregister old Service Workers (Optional: if you have legacy SWs causing issues)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => {
          // If you have specific old SWs to remove, do it here. 
          // Example: if (reg.scope.includes('old-v1')) reg.unregister();
        });
      });
    }
  } catch (e) {
    console.error("Cleanup failed:", e);
  }
};

function AppShell() {
  const location = useLocation(); // ★ FIX: Get current route

  useEffect(() => {
    // 1. Clean up unnecessary junk on initial app load
    cleanupStaleJunk();

    // 2. Initialize app (fetch initial data, configs, etc.)
    initApp();

    // 3. Handle user returning to the app (tab visibility change)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // User came back to the tab! Re-initialize app to get recent updates.
        initApp();
        
        // Dispatch a global event so components (like Navbar) can refetch their specific data
        window.dispatchEvent(new CustomEvent("app:refocused"));
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange); // Also trigger on window focus

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, []);

  // ★ FIX: Google Analytics Page View Tracking
  useEffect(() => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
      });
    }
  }, [location.pathname, location.search]);

  return (
    <>
      {/* Global SEO */}
      <SEO />

      {/* Global Structured Data */}
      <StructuredData data={organizationSchema()} />
      <StructuredData data={websiteSchema()} />

      <ScrollToTop />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          background:
            "linear-gradient(180deg,#07141f 0%,#06121b 100%)",
        }}
      >
        <Navbar />

        <Breadcrumbs />

        <main
          style={{
            flex: 1,
            position: "relative",
          }}
        >
          <Suspense fallback={<AppLoader />}>
            <AppRoutes />
          </Suspense>
        </main>

        <Footer />
      </div>
    </>
  );
}

export default function App() {
  return (
    <Providers>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
    </Providers>
  );
}