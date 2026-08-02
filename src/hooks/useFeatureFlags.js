// footballprediction/src/hooks/useFeatureFlags.js
import { useQuery } from '@tanstack/react-query';
import { remoteConfig } from '../utils/firebase';
import { fetchAndActivate, getValue } from 'firebase/remote-config';

export function useFeatureFlags() {
  const { data } = useQuery({
    queryKey: ['featureFlags'],
    queryFn: async () => {
      if (!remoteConfig) {
        return {
          show_new_predictions_ui: false,
          enable_ads: false,
        };
      }
      try {
        await fetchAndActivate(remoteConfig);
        return {
          show_new_predictions_ui: getValue(remoteConfig, 'show_new_predictions_ui').asBoolean(),
          enable_ads: getValue(remoteConfig, 'enable_ads').asBoolean(),
        };
      } catch (err) {
        console.error("Remote Config fetch failed", err);
        throw err;
      }
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 1,
    // Fallback to false if remote config fails
    placeholderData: {
      show_new_predictions_ui: false,
      enable_ads: false,
    },
  });

  return data;
}
