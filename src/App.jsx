import { Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import Providers from "./app/providers";
import AppRoutes from "./app/AppRoutes";

import ScrollToTop from "./app/ScrollToTop";
import Breadcrumbs from "./components/Breadcrumbs";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

import StructuredData from "./components/StructuredData";
import ErrorBoundary from "./components/ErrorBoundary";

import {
  organizationSchema,
  websiteSchema,
} from "./utils/schema";

import { initApp } from "./utils/init";
import { initAnalytics } from "./utils/analytics";
import { Download, X, RefreshCw, WifiOff, CheckCircle } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

function AppShell() {
  const location = useLocation();
  
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // ★ Phase 10: Enterprise PWA Registration & Update Prompt
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("PWA Registered");
      if (r) setInterval(() => r.update(), 60 * 60 * 1000); // Check for updates every hour
    },
    onRegisterError(error) {
      console.error("PWA Registration error", error);
    },
  });

  useEffect(() => {
    initApp();
    initAnalytics();

    // ★ Add Google Analytics Script dynamically
    const script = document.createElement('script');
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-GZ2JTNKCCN';
    script.async = true;
    document.body.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-GZ2JTNKCCN');
    window.gtag = gtag;
    
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

  // Remove static loader once React mounts
  useEffect(() => {
    const staticLoader = document.getElementById('static-loader');
    if (staticLoader) {
      staticLoader.style.transition = 'opacity 0.3s ease';
      staticLoader.style.opacity = '0';
      setTimeout(() => staticLoader.remove(), 300);
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

  // PWA Install Banner Logic
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
    setShowInstallBanner(false);
  };

  const handleCloseToast = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  const handleUpdateNow = () => {
    updateServiceWorker(true); // true forces reload
  };

  return (
    <>
      <StructuredData data={organizationSchema()} />
      
      <ScrollToTop />

      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div style={toastStyle}>
          <Download size={20} style={{ color: "#10b981", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: ".8rem", fontWeight: 800, color: "#fff" }}>Install ZOKASCORE</div>
            <div style={{ fontSize: ".68rem", color: "#94a3b8" }}>Add to home screen for quick access</div>
          </div>
          <button onClick={handleInstallClick} style={installBtnStyle}>Install</button>
          <button onClick={() => setShowInstallBanner(false)} style={closeBtnStyle}><X size={16} /></button>
        </div>
      )}

      {/* PWA Update Ready Banner */}
      {needRefresh && (
        <div style={toastStyle}>
          <RefreshCw size={20} style={{ color: "#fbbf24", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: ".8rem", fontWeight: 800, color: "#fff" }}>Update Available</div>
            <div style={{ fontSize: ".68rem", color: "#94a3b8" }}>A new version of Zoka is ready.</div>
          </div>
          <button onClick={handleUpdateNow} style={updateBtnStyle}>Reload</button>
          <button onClick={handleCloseToast} style={closeBtnStyle}><X size={16} /></button>
        </div>
      )}

      {/* PWA Offline Ready Banner */}
      {offlineReady && (
        <div style={toastStyle}>
          <CheckCircle size={20} style={{ color: "#10b981", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: ".8rem", fontWeight: 800, color: "#fff" }}>Ready for Offline</div>
            <div style={{ fontSize: ".68rem", color: "#94a3b8" }}>App can be used without internet.</div>
          </div>
          <button onClick={handleCloseToast} style={closeBtnStyle}><X size={16} /></button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "linear-gradient(180deg,#07141f 0%,#06121b 100%)", overflowX: "hidden" }}>
        <Navbar />
        <Breadcrumbs />

        <main style={{ flex: 1, position: "relative", width: "100%", overflowX: "hidden" }}>
          <Suspense fallback={null}>
            <AppRoutes />
          </Suspense>
        </main>

        <Footer />
      </div>
    </>
  );
}

// Toast Styles
const toastStyle = {
  position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
  background: "rgba(10,15,25,0.95)", border: "1.5px solid rgba(16,185,129,.3)",
  borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
  zIndex: 9999, boxShadow: "0 10px 30px rgba(0,0,0,.5)", backdropFilter: "blur(12px)",
  maxWidth: "calc(100% - 40px)", animation: "slideUp .3s ease",
};

const installBtnStyle = {
  background: "#10b981", border: "none", color: "#000", fontWeight: 800,
  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: ".75rem",
};

const updateBtnStyle = {
  background: "#fbbf24", border: "none", color: "#000", fontWeight: 800,
  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: ".75rem",
};

const closeBtnStyle = {
  background: "transparent", border: "none", color: "#64748b", cursor: "pointer", display: "flex", padding: 4,
};

export default function App() {
  return (
    <Providers>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
    </Providers>
  );
}