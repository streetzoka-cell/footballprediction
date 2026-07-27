// src/app/providers.jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from "../context/AuthContext";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute - data is considered fresh
      cacheTime: 5 * 60 * 1000, // 5 minutes - cache is kept in memory
      retry: 2, // Retry failed requests twice
      refetchOnWindowFocus: true, // Refresh when user tabs back in
      refetchOnReconnect: true, // Refresh when internet comes back
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