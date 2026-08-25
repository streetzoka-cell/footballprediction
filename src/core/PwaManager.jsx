/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ZOKASCORE — PWA Manager (Cleaned)
   Tailwind utility classes → CSS vars for theme consistency
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import { useEffect, useState } from "react";

export default function PwaManager() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => setShowBanner(false);

  if (isInstalled || !showBanner) return null;

  return (
    <div className="zk-pwa-banner" role="banner">
      <div className="zk-pwa-banner-content">
        <span className="zk-pwa-banner-icon text-success">📱</span>
        <div className="zk-pwa-banner-text">
          <strong>Install ZOKASCORE</strong>
          <span>Add to home screen for faster access</span>
        </div>
      </div>
      <div className="zk-pwa-banner-actions">
        <button className="zk-pwa-banner-install" onClick={handleInstall}>Install</button>
        <button className="zk-pwa-banner-dismiss" onClick={handleDismiss}>Later</button>
      </div>
    </div>
  );
}