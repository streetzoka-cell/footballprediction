import { Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import Providers from "./app/providers";
import AppRoutes from "./app/AppRoutes";

import ScrollToTop from "./app/ScrollToTop";
import Breadcrumbs from "./components/Breadcrumbs";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

import SEO from "./components/SEO";
import { organizationSchema, websiteSchema } from "./utils/schema";

import ErrorBoundary from "./components/ErrorBoundary";

import { initApp } from "./utils/init";
import { initAnalytics } from "./utils/analytics";
import { Download, X, RefreshCw, WifiOff, CheckCircle } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

const PageLoader = () => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", gap: "24px" }}>
    <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(16,185,129,0.3)", animation: "nvLogoFloat 2s ease-in-out infinite" }}>
      {/* 8. Updated alt text for accessibility */}
      <img src="/icons/icon-192.png" width="48" height="48" alt="ZOKASCORE Logo" style={{ borderRadius: 14 }} />
    </div>
    <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#10b981", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
  </div>
);

function AppShell() {
  const location = useLocation();
  const queryClient = useQueryClient();
  
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("PWA Registered");
      if (r) setInterval(() => r.update(), 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error("PWA Registration error", error);
    },
  });

  useEffect(() => {
    initApp();
    initAnalytics();

    // 3. Removed manual GA script injection to prevent double loading if already in index.html
    // Assuming initAnalytics() or index.html handles GA setup.
    
    // 4. Updated Query invalidation to v5 object syntax
    const handleOnline = () => {
      console.log("Connection restored. Refetching live data...");
      queryClient.invalidateQueries({ queryKey: ["liveMatches"] });
      queryClient.invalidateQueries({ queryKey: ["fixtures"] });
      queryClient.invalidateQueries({ queryKey: ["homeMatches"] });
    };

    window.addEventListener("online", handleOnline);

    let visibilityTimeout;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(visibilityTimeout);
        visibilityTimeout = setTimeout(() => {
          initApp();
          window.dispatchEvent(new CustomEvent("app:refocused"));
          queryClient.invalidateQueries({ queryKey: ["liveMatches"] });
        }, 1000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      clearTimeout(visibilityTimeout);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [queryClient]);

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

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const interval = setInterval(() => {
      if (installPromptEvent) {
        setShowInstallBanner(true);
      }
    }, 600000); 

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearInterval(interval);
    };
  }, [installPromptEvent]);

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
    setShowInstallBanner(false); 
  };

  const handleUpdateNow = () => {
    updateServiceWorker(true);
  };

  // 2. Removed automatic notification permission request
  // Notifications should only be requested after explicit user action

  return (
    <>
      {/* 1. Improved Homepage SEO */}
      <SEO 
        title="Football Predictions, Live Scores & Fixtures | ZOKASCORE"
        description="Follow football fixtures, live scores, predictions, league tables, match statistics, and football news from competitions around the world on ZOKASCORE."
        keywords="football predictions, live scores, football fixtures, league tables, football statistics, premier league, champions league, la liga, ZOKASCORE"
        path="/"
        robots="index,follow"
        breadcrumbs={[
          { name: "Home", path: "/" }
        ]}
        structuredData={[organizationSchema(), websiteSchema()]}
      />
      
      <ScrollToTop />

      {/* 6. Updated Install banner copy */}
      {showInstallBanner && (
        <div style={toastStyle}>
          <Download size={20} style={{ color: "#10b981", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: ".8rem", fontWeight: 800, color: "#fff" }}>Install ZOKASCORE</div>
            <div style={{ fontSize: ".68rem", color: "#94a3b8" }}>Install ZOKASCORE for a faster experience and offline access.</div>
          </div>
          <button onClick={handleInstallClick} style={installBtnStyle}>Install</button>
          <button onClick={handleCloseToast} style={closeBtnStyle}><X size={16} /></button>
        </div>
      )}

      {/* 5. Updated toast copy */}
      {needRefresh && (
        <div style={toastStyle}>
          <RefreshCw size={20} style={{ color: "#fbbf24", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: ".8rem", fontWeight: 800, color: "#fff" }}>Update Available</div>
            <div style={{ fontSize: ".68rem", color: "#94a3b8" }}>A new version of ZOKASCORE is available.</div>
          </div>
          <button onClick={handleUpdateNow} style={updateBtnStyle}>Reload</button>
          <button onClick={handleCloseToast} style={closeBtnStyle}><X size={16} /></button>
        </div>
      )}

      {/* 7. Updated Offline toast copy */}
      {offlineReady && (
        <div style={toastStyle}>
          <CheckCircle size={20} style={{ color: "#10b981", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: ".8rem", fontWeight: 800, color: "#fff" }}>Ready for Offline</div>
            <div style={{ fontSize: ".68rem", color: "#94a3b8" }}>ZOKASCORE is ready to work offline.</div>
          </div>
          <button onClick={handleCloseToast} style={closeBtnStyle}><X size={16} /></button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "linear-gradient(180deg,#07141f 0%,#06121b 100%)", overflowX: "hidden" }}>
        <Navbar />
        <Breadcrumbs />

        <main style={{ flex: 1, position: "relative", width: "100%", overflowX: "hidden" }}>
          <Suspense fallback={<PageLoader />}>
            <AppRoutes />
          </Suspense>
        </main>

        <Footer />
      </div>
    </>
  );
}

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