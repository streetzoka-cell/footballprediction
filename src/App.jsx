import { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";

import Providers from "./app/providers";
import AppRoutes from "./app/AppRoutes";
import ScrollToTop from "./app/ScrollToTop";
import Breadcrumbs from "./components/Breadcrumbs";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import StatusCenter from "./components/StatusCenter";

import ErrorBoundary from "./components/ErrorBoundary";

import { ToastProvider } from "./core/ToastManager";
import ConnectionManager from "./core/ConnectionManager";
import PwaManager from "./core/PwaManager";
import KeyboardManager from "./core/KeyboardManager";

import { initApp } from "./utils/init";
import { initAnalytics } from "./utils/analytics";

const PageLoader = () => (
  <div className="flex-center" style={{ minHeight: "70vh", gap: "var(--sp-16)" }}>
    <div className="skeleton-card" style={{ width: 200, height: 20 }} />
    <div className="skeleton-card" style={{ width: 280, height: 16 }} />
    <div className="skeleton-card" style={{ width: 160, height: 16 }} />
  </div>
);

function AppShell() {
  const location = useLocation();

  useEffect(() => { initApp(); initAnalytics(); }, []);

  useEffect(() => {
    const loader = document.getElementById("static-loader");
    if (loader) {
      loader.style.transition = 'opacity 0.3s ease';
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 300);
    }
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
      {/* ★ REMOVED: Global Helmet schemas and theme-color. 
          They are now statically hardcoded in index.html to prevent duplicates. */}

      <ScrollToTop />
      <ConnectionManager />
      <PwaManager />
      <KeyboardManager />

      <div className="app-layout flex-col min-h-screen">
        <Navbar />
        <div className="main-content flex-1 w-full overflow-x-hidden pb-64 md:pb-0">
          {/* Visual Breadcrumbs component (not JSON-LD) */}
          <Breadcrumbs />
          <main>
            <Suspense fallback={<PageLoader />}>
              <AppRoutes />
            </Suspense>
          </main>
          <Footer />
        </div>
      </div>

      <StatusCenter />
    </>
  );
}

export default function App() {
  return (
    <Providers>
      <ErrorBoundary>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </ErrorBoundary>
    </Providers>
  );
}