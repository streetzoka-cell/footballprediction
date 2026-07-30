import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { AuthProvider } from "../context/AuthContext";
import { ERROR_TYPES } from '../utils/errorHandler';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes 
      gcTime: 1000 * 60 * 60 * 24, // 24 hours in cache
      retry: (failureCount, error) => {
        if (error?.status === 404 || error?.type === ERROR_TYPES?.OFFLINE) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false, 
      refetchOnReconnect: true, 
      refetchOnMount: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// ★ FIX: Safely initialize persister only in the browser
const localStoragePersister = typeof window !== 'undefined' 
  ? createSyncStoragePersister({ 
      storage: window.localStorage, 
      key: 'zokascore-cache' 
    })
  : undefined;

// Only persist if persister was created
if (localStoragePersister) {
  persistQueryClient({
    queryClient,
    persister: localStoragePersister,
    maxAge: 1000 * 60 * 60 * 24, // Expire cache after 24 hours
  });
}

export default function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}