// src/App.jsx

import { Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import Providers from "./app/providers";
import AppRoutes from "./app/AppRoutes";

import ScrollToTop from "./app/ScrollToTop";
import Breadcrumbs from "./components/Breadcrumbs";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

import SEO from "./components/SEO";
import StructuredData from "./components/StructuredData";
import ErrorBoundary from "./components/ErrorBoundary";

import {
  organizationSchema,
  websiteSchema,
} from "./utils/schema";

import { initApp } from "./utils/api";
import { Download, X } from "lucide-react";

function AppShell() {
  const location = useLocation();
  
  // ★ PWA Install Prompt State
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    initApp();
    
    let visibilityTimeout;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
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

  // ★ Remove static loader once React mounts
  useEffect(() => {
    const staticLoader = document.getElementById('static-loader');
    if (staticLoader) {
      staticLoader.style.transition = 'opacity 0.3s ease';
      staticLoader.style.opacity = '0';
      setTimeout(() => staticLoader.remove(), 300);
    }
  }, []);

  // ★ Google Analytics
  useEffect(() => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
      });
    }
  }, [location.pathname, location.search]);

  // ★ PWA Install Prompt Listener
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ★ Service Worker Update Listener (Auto-Refresh on new update)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted install');
    } else {
      console.log('User dismissed install');
    }
    setInstallPrompt(null);
    setShowInstallBanner(false);
  };

  return (
    <>
      <SEO />
      <StructuredData data={organizationSchema()} />
      <StructuredData data={websiteSchema()} />

      <ScrollToTop />

      {/* ★ PWA Install Banner */}
      {showInstallBanner && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(10,15,25,0.95)', border: '1.5px solid rgba(16,185,129,.3)',
          borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
          zIndex: 9999, boxShadow: '0 10px 30px rgba(0,0,0,.5)', backdropFilter: 'blur(12px)',
          maxWidth: 'calc(100% - 40px)', animation: 'slideUp .3s ease'
        }}>
          <Download size={20} style={{ color: '#10b981' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#fff' }}>Install ZokaScore</div>
            <div style={{ fontSize: '.68rem', color: '#94a3b8' }}>Add to home screen for quick access</div>
          </div>
          <button onClick={handleInstallClick} style={{
            background: '#10b981', border: 'none', color: '#000', fontWeight: 800,
            padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '.75rem'
          }}>Install</button>
          <button onClick={() => setShowInstallBanner(false)} style={{
            background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer'
          }}><X size={16} /></button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          background: "linear-gradient(180deg,#07141f 0%,#06121b 100%)",
          overflowX: "hidden",
        }}
      >
        <Navbar />
        <Breadcrumbs />

        <main
          style={{
            flex: 1,
            position: "relative",
            width: "100%",
            overflowX: "hidden",
          }}
        >
          <Suspense fallback={null}>
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