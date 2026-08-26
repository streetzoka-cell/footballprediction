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
    <div className="glass-card" style={{padding:24, maxWidth:400}}>
      <div className="zk-page-loader-skeleton">
        <div className="zk-page-loader-skeleton-bar zk-page-loader-skeleton-bar--lg" />
        <div className="zk-page-loader-skeleton-bar zk-page-loader-skeleton-bar--md" />
        <div className="zk-page-loader-skeleton-bar zk-page-loader-skeleton-bar--sm" />
      </div>
    </div>
  </div>
);

function AppShell() {
  const location = useLocation();
  const [isAiOpen, setIsAiOpen] = useState(false);

  // MIDNIGHT MAIN — must run first
  useEffect(() => {
    const saved = localStorage.getItem("zokascore-theme") || "midnight";
    document.documentElement.setAttribute("data-theme", saved);
    localStorage.setItem("zokascore-theme", saved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.content = saved === "light" ? "#f8fafc" : "#05070a";
  }, []);

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
      loader.style.transition = 'opacity 0.38s cubic-bezier(0.22,1,0.36,1)';
      loader.style.backdropFilter = 'blur(16px)';
      setTimeout(() => loader.remove(), 380);
    }
  }, []);
  
  useEffect(() => {
    document.body.classList.remove('breaking');
    document.querySelector('.app-layout')?.classList.remove('breaking');
  }, [location.pathname]);

  useEffect(() => {
    window.gtag?.("event", "page_view", {
      page_path: location.pathname + location.search,
      page_location: window.location.href,
    });
  }, [location.pathname, location.search]);

  // GLASS BREAK INTO NEXT PAGE — pro feel
  useEffect(() => {
    const handler = (e) => {
      const link = e.target.closest('a[href^="/"], .match-row-link, .res-match-card, .mg-match-card, .v21-mc, .news-card, .z-ecard, .zoka-teams, .bb-game-card');
      if(!link) return;
      const href = link.getAttribute('href');
      if(!href || !href.startsWith('/') || e.ctrlKey || e.metaKey || e.button === 1) return;
      const layout = document.querySelector('.app-layout');
      if(layout){
        layout.style.animation = 'z-page-break 0.32s cubic-bezier(0.4,0,0.6,1) forwards';
        // tiny delay lets user feel the press before navigation
        setTimeout(()=>{ layout.style.animation = '' }, 360);
      }
    };
    document.addEventListener('click', handler, {capture:true});
    return () => document.removeEventListener('click', handler, {capture:true});
  }, []);

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