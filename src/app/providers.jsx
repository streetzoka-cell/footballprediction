import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from "../context/AuthContext";
import { ERROR_TYPES } from '../utils/errorHandler';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, 
      gcTime: 1000 * 60 * 60 * 24, 
      retry: (failureCount, error) => {
        if (error?.status === 404 || error?.type === ERROR_TYPES.OFFLINE) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // ★ FIX: Force refetch on window focus and reconnect
      refetchOnWindowFocus: true, 
      refetchOnReconnect: true, 
      refetchOnMount: true,
    },
    mutations: {
      retry: false,
    },
  },
});

export default function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}