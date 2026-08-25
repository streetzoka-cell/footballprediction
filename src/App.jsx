import { Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Providers from "./app/providers";
import AppRoutes from "./app/AppRoutes";
import ScrollToTop from "./app/ScrollToTop";
import Breadcrumbs from "./components/Breadcrumbs";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./core/ToastManager";
import ConnectionManager from "./core/ConnectionManager";
import PwaManager from "./core/PwaManager";
import KeyboardManager from "./core/KeyboardManager";
import ZokaAI from "./components/ZokaAI";
import { Brain } from "lucide-react";
import { initApp } from "./utils/init";
import { initAnalytics } from "./utils/analytics";

const PageLoader = () => (
  <div className="zk-page-loader">
    <div className="zk-page-loader-skeleton">
      <div className="zk-page-loader-skeleton-bar zk-page-loader-skeleton-bar--lg" />
      <div className="zk-page-loader-skeleton-bar zk-page-loader-skeleton-bar--md" />
      <div className="zk-page-loader-skeleton-bar zk-page-loader-skeleton-bar--sm" />
    </div>
  </div>
);

function AppShell() {
  const location = useLocation();
  const [isAiOpen, setIsAiOpen] = useState(false);

  useEffect(() => { initApp(); initAnalytics(); }, []);
  
  useEffect(() => {
    const openHandler = () => setIsAiOpen(true);
    window.addEventListener('openZokaAI', openHandler);
    return () => window.removeEventListener('openZokaAI', openHandler);
  }, []);
  
  useEffect(() => {
    const loader = document.getElementById("static-loader");
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 300);
    }
  }, []);
  
  useEffect(() => {
    window.gtag?.("event", "page_view", {
      page_path: location.pathname + location.search,
      page_location: window.location.href,
    });
  }, [location.pathname, location.search]);

  return (
    <>
      <ScrollToTop />
      <ConnectionManager />
      <PwaManager />
      <KeyboardManager />
      <div className="app-layout">
        <Navbar />
        <div className="main-content">
          <Breadcrumbs />
          <main id="main-content" tabIndex={-1}>
            <Suspense fallback={<PageLoader />}>
              <AppRoutes />
            </Suspense>
          </main>
          <Footer />
        </div>
      </div>
      <button onClick={() => setIsAiOpen(true)} className="zoka-ai-fab" aria-label="Open Zoka AI">
        <Brain size={22} />
      </button>
      <ZokaAI isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />
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