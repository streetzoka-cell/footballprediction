import { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";

// ★ FIX: Corrected import paths to point to the 'app' and 'components' folders
import Providers from "./app/providers";
import AppRoutes from "./app/AppRoutes";
import ScrollToTop from "./app/ScrollToTop";
import Breadcrumbs from "./components/Breadcrumbs";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import StatusCenter from "./components/StatusCenter";

import SEO from "./components/SEO";
import { organizationSchema, websiteSchema } from "./utils/schema";
import ErrorBoundary from "./components/ErrorBoundary";

// Core Managers
import { ToastProvider } from "./core/ToastManager";
import ConnectionManager from "./core/ConnectionManager";
import PwaManager from "./core/PwaManager";
import KeyboardManager from "./core/KeyboardManager";

import { initApp } from "./utils/init";
import { initAnalytics } from "./utils/analytics";

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6">
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.3)] animate-bounce">
      <img src="/icons/icon-192.png" width="48" height="48" alt="ZOKASCORE Logo" className="rounded-xl" />
    </div>
    <div className="w-8 h-8 border-4 border-white/10 border-t-emerald-500 rounded-full animate-spin" />
  </div>
);

function AppShell() {
  const location = useLocation();

  useEffect(() => {
    initApp();
    initAnalytics();
  }, []);

  // Remove static loader on mount
  useEffect(() => {
    const staticLoader = document.getElementById('static-loader');
    if (staticLoader) {
      staticLoader.style.transition = 'opacity 0.3s ease';
      staticLoader.style.opacity = '0';
      setTimeout(() => staticLoader.remove(), 300);
    }
  }, []);

  // Dynamic Analytics Tracking
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
      <SEO 
        title="Football Predictions, Live Scores & Fixtures | ZOKASCORE"
        description="Follow football fixtures, live scores, predictions, league tables, match statistics, and football news from competitions around the world on ZOKASCORE."
        keywords="football predictions, live scores, football fixtures, league tables, football statistics, premier league, champions league, la liga, ZOKASCORE"
        path="/"
        robots="index,follow"
        breadcrumbs={[{ name: "Home", path: "/" }]}
        structuredData={[organizationSchema(), websiteSchema()]}
      />
      
      <ScrollToTop />

      {/* Mount Core Managers */}
      <ConnectionManager />
      <PwaManager />
      <KeyboardManager />

      <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#07141f] to-[#06121b] overflow-x-hidden">
        <Navbar />
        <Breadcrumbs />

        <main className="flex-1 relative w-full overflow-x-hidden">
          <Suspense fallback={<PageLoader />}>
            <AppRoutes />
          </Suspense>
        </main>

        <Footer />
      </div>

      {/* Global UI Elements */}
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