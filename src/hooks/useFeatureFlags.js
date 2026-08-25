import { useQuery } from '@tanstack/react-query';
import { remoteConfig } from '../utils/firebase';
import { fetchAndActivate, getValue } from 'firebase/remote-config';

const FALLBACK = { show_new_predictions_ui: false, enable_ads: false };

export function useFeatureFlags() {
  const { data = FALLBACK } = useQuery({
    queryKey: ['featureFlags'],
    queryFn: async () => {
      if (!remoteConfig) return FALLBACK;
      try {
        await fetchAndActivate(remoteConfig);
        return {
          show_new_predictions_ui: getValue(remoteConfig, 'show_new_predictions_ui').asBoolean(),
          enable_ads: getValue(remoteConfig, 'enable_ads').asBoolean(),
        };
      } catch {
        return FALLBACK;
      }
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    placeholderData: FALLBACK,
  });
  return data;
}
