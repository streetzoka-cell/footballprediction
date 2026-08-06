import { useQuery } from '@tanstack/react-query';
import { footballApi } from '../services/footballApi';

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
        const data = res?.data || res;

        if (!data || typeof data !== 'object') {
          return DEFAULT_STATS;
        }

        return {
          ...DEFAULT_STATS,
          ...data,
        };
      } catch (err) {
        console.warn('[useGlobalStats] Failed to fetch global stats:', err.message);
        // Return null to trigger placeholderData fallback
        return null;
      }
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24,
    placeholderData: (prev) => prev || DEFAULT_STATS,
    retry: 1,
  });
}