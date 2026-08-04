import { useMemo } from 'react';
import { useDailyLeaderboard, useGoatLeaderboard } from './useUserData';
import { todayStr } from '../utils/dates';

export function useGlobalStats() {
  const { data: dailyLB } = useDailyLeaderboard(todayStr());
  const { data: goatLB } = useGoatLeaderboard();

  return useMemo(() => {
    const dailyPlayers = dailyLB?.stats?.players || 0;
    const dailyPredictions = dailyLB?.stats?.preds || 0;
    
    const totalPlayers = goatLB?.stats?.players || 0;
    const totalPredictions = goatLB?.stats?.preds || 0;

    return {
      activePlayersToday: dailyPlayers,
      predictionsToday: dailyPredictions,
      totalPlayers,
      totalPredictions,
      loading: !dailyLB || !goatLB
    };
  }, [dailyLB, goatLB]);
}