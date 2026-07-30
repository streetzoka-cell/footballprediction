// src/core/ConnectionManager.jsx
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastManager';

export default function ConnectionManager() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    const handleOnline = () => {
      if (wasOffline.current) {
        toast.success('Connection restored. Syncing data...');
        queryClient.invalidateQueries({ queryKey: ['liveMatches'] });
        queryClient.invalidateQueries({ queryKey: ['fixtures'] });
      }
      wasOffline.current = false;
    };

    const handleOffline = () => {
      wasOffline.current = true;
      toast.warning('You are offline. Showing cached data.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Network-aware polling (Conceptual: adjust React Query refetchInterval based on navigator.connection)
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      const updatePolling = () => {
        const slow = conn.effectiveType.includes('2g') || conn.saveData;
        document.dispatchEvent(new CustomEvent('app:network-change', { detail: { slow }}));
      };
      conn.addEventListener('change', updatePolling);
      return () => conn.removeEventListener('change', updatePolling);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient, toast]);

  return null;
}