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
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000); 
        window.addEventListener('online', () => {
          r.update();
        });
      }
    },
  });

  useEffect(() => {
    if (needRefresh) {
      toast.info('New version available! Updating...', {
        icon: <RefreshCw size={18} className="text-amber-400" />,
        duration: 3000
      });
      const timer = setTimeout(() => updateServiceWorker(true), 3000);
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

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      window.deferredPrompt = e; 
      window.dispatchEvent(new Event('pwaInstallable'));
      
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
      }, 10000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [toast]);

  return null;
}