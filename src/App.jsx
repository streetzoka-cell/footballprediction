// src/App.jsx

import { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";

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

const cleanupStaleJunk = () => {
  try {
    sessionStorage.clear();
    const keysToKeep = ['firebase:authUser', 'nv-admin-remembered', 'theme'];
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
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

    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          if (cacheName.startsWith('old-') || cacheName.startsWith('temp-')) {
            caches.delete(cacheName);
          }
        });
      });
    }
  } catch (e) {
    console.error("Cleanup failed:", e);
  }
};

function AppShell() {
  const location = useLocation();

  useEffect(() => {
    cleanupStaleJunk();
    initApp();

    let visibilityTimeout;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // ★ Debounce refocus to prevent spamming backend on rapid tab switches
        clearTimeout(visibilityTimeout);
        visibilityTimeout = setTimeout(() => {
          initApp();
          window.dispatchEvent(new CustomEvent("app:refocused"));
        }, 1000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      clearTimeout(visibilityTimeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, []);

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
      <SEO />
      <StructuredData data={organizationSchema()} />
      <StructuredData data={websiteSchema()} />

      <ScrollToTop />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          background: "linear-gradient(180deg,#07141f 0%,#06121b 100%)",
          overflowX: "hidden", // ★ GLOBAL MOBILE FIX: Prevents any horizontal stretching
        }}
      >
        <Navbar />
        <Breadcrumbs />

        <main
          style={{
            flex: 1,
            position: "relative",
            width: "100%",
            overflowX: "hidden", // ★ Ensures content never breaks layout
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