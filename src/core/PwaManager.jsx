// src/core/PwaManager.jsx
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, CheckCircle } from 'lucide-react';
import { useToast } from './ToastManager';

export default function PwaManager() {
  const toast = useToast();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('PWA Registered');
      if (r) {
        // Check for updates every hour
        setInterval(() => r.update(), 60 * 60 * 1000); 
        
        // ★ NEW: Check for updates immediately when internet reconnects
        window.addEventListener('online', () => {
          r.update();
        });
      }
    },
  });

  // ★ NEW: Automatically reload the app when a new version is detected
  useEffect(() => {
    if (needRefresh) {
      toast.info('New version available! Updating...', {
        action: { label: 'Reload', onClick: () => updateServiceWorker(true) },
        icon: <RefreshCw size={18} className="text-amber-400" />,
        duration: 4000
      });
      // Force update after 4 seconds automatically
      const timer = setTimeout(() => updateServiceWorker(true), 4000);
      setNeedRefresh(false);
      return () => clearTimeout(timer);
    }
  }, [needRefresh, toast, updateServiceWorker, setNeedRefresh]);

  useEffect(() => {
    if (offlineReady) {
      toast.success('App ready for offline use!', {
        icon: <CheckCircle size={18} className="text-emerald-400" />,
      });
      setOfflineReady(false);
    }
  }, [offlineReady, toast, setOfflineReady]);

  // ★ NEW: Centralized Install Prompt Logic
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      window.deferredPrompt = e; // Store globally for Footer to use
      
      // Dispatch event so Footer button enables itself
      window.dispatchEvent(new Event('pwaInstallable'));
      
      // Show install popup after 5 seconds if not installed
      setTimeout(() => {
        if (!window.matchMedia('(display-mode: standalone)').matches && window.deferredPrompt) {
          toast.info('Install ZOKASCORE for offline access!', {
            action: { 
              label: 'Install', 
              onClick: () => {
                window.deferredPrompt.prompt();
                window.deferredPrompt.userChoice.then(() => {
                  window.deferredPrompt = null;
                });
              }
            },
            icon: <Download size={18} className="text-blue-400" />,
            duration: 10000
          });
        }
      }, 5000); // 5 seconds
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [toast]);

  return null;
}