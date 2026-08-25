import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../context/AuthContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        
      gcTime: 300_000,          
      refetchOnWindowFocus: false,  
      refetchOnReconnect: true, // ★ Automatically refetches when mobile users regain signal
      retry: 2,
      retryDelay: (attempt) => Math.min(attempt * 1500, 5000),
    },
    mutations: {
      retry: 1,
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