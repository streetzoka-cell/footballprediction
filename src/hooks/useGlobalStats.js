import { useQuery } from '@tanstack/react-query';
import { footballApi } from '../services/footballApi';

// Fallback default if backend is completely offline and no cache exists
const DEFAULT_STATS = {
  totalUsers: 0,
  totalPlayers: 0,
  predictionsToday: 0,
  activePlayersToday: 0,
  totalPredictions: 0,
};

export function useGlobalStats() {
  return useQuery({
    queryKey: ['globalStats'],
    queryFn: async () => {
      try {
        const res = await footballApi.getGlobalStats();
        return res?.data || res || DEFAULT_STATS;
      } catch (err) {
        console.warn('[useGlobalStats] Failed to fetch global stats:', err.message);
        // Returning null tells React Query to use the cached data if available
        return null; 
      }
    },
    staleTime: 2 * 60 * 1000, // Refresh every 2 minutes
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours for offline access
    placeholderData: (prev) => prev || DEFAULT_STATS, // ★ Keep showing old data while fetching new!
  });
}