// src/app/providers.jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from "../context/AuthContext";
import { ERROR_TYPES } from '../utils/errorHandler';

// Create a client with enterprise-grade defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute - data is considered fresh
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - cache is kept in memory for offline resilience
      retry: (failureCount, error) => {
        // Do not retry on 404 Not Found or Offline errors
        if (error?.status === 404 || error?.type === ERROR_TYPES.OFFLINE) return false;
        // Retry up to 2 times for server errors and timeouts
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
      refetchOnWindowFocus: true, 
      refetchOnReconnect: true, 
    },
    mutations: {
      retry: false, // Do not retry mutations automatically (prevent duplicate writes)
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