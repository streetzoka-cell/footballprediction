import { useQuery } from '@tanstack/react-query';
import { footballApi } from '../services/footballApi';

const DEFAULT = { totalUsers: 0, totalPlayers: 0, predictionsToday: 0, activePlayersToday: 0, totalPredictions: 0 };

export function useGlobalStats() {
  return useQuery({
    queryKey: ['globalStats'],
    queryFn: async () => {
      try {
        const res = await footballApi.getGlobalStats();
        const data = res?.data || res;
        if (!data || typeof data !== 'object') return DEFAULT;
        return { ...DEFAULT, ...data };
      } catch {
        return null; // triggers placeholderData
      }
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: (prev) => prev || DEFAULT,
    retry: 1,
  });
}
