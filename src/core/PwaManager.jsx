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
      if (r) setInterval(() => r.update(), 60 * 60 * 1000); // Hourly check
    },
  });

  useEffect(() => {
    if (needRefresh) {
      toast.info('New version available!', {
        action: { label: 'Reload', onClick: () => updateServiceWorker(true) },
        icon: <RefreshCw size={18} className="text-amber-400" />,
        duration: 10000
      });
      setNeedRefresh(false);
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
    let deferredPrompt;
    const handler = (e) => {
      e.preventDefault();
      deferredPrompt = e;
      
      // Show install banner after 60 seconds if not installed
      setTimeout(() => {
        if (!window.matchMedia('(display-mode: standalone)').matches) {
          toast.info('Install ZOKASCORE for offline access!', {
            action: { label: 'Install', onClick: () => {
              deferredPrompt.prompt();
              deferredPrompt.userChoice.then(() => deferredPrompt = null);
            }},
            icon: <Download size={18} className="text-blue-400" />,
            duration: 10000
          });
        }
      }, 60000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [toast]);

  return null;
}