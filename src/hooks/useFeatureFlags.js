import { useState, useEffect } from 'react';
import { remoteConfig } from '../utils/firebase';
import { fetchAndActivate, getValue } from 'firebase/remote-config';

export function useFeatureFlags() {
  const [flags, setFlags] = useState({
    show_new_predictions_ui: false,
    enable_ads: false,
  });

  useEffect(() => {
    if (!remoteConfig) return; // Guard against null if Firebase failed to init

    const init = async () => {
      try {
        await fetchAndActivate(remoteConfig);
        setFlags({
          show_new_predictions_ui: getValue(remoteConfig, 'show_new_predictions_ui').asBoolean(),
          enable_ads: getValue(remoteConfig, 'enable_ads').asBoolean(),
        });
      } catch (err) {
        console.error("Remote Config fetch failed", err);
      }
    };
    init();
  }, []);

  return flags;
}