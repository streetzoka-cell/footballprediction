// footballprediction/src/store/usePreferencesStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const usePreferencesStore = create(
  persist(
    (set, get) => ({
      soundEnabled: true,
      favorites: [],
      pinnedLeagues: [],
      pinnedMatches: [],
      
      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
      
      toggleFavorite: (id) => set((state) => {
        const idStr = String(id);
        const favorites = state.favorites.includes(idStr) 
          ? state.favorites.filter(f => f !== idStr) 
          : [...state.favorites, idStr];
        return { favorites };
      }),

      togglePinnedLeague: (leagueName) => set((state) => {
        const pinnedLeagues = state.pinnedLeagues.includes(leagueName) 
          ? state.pinnedLeagues.filter(l => l !== leagueName) 
          : [...state.pinnedLeagues, leagueName];
        return { pinnedLeagues };
      }),

      togglePinMatch: (id) => set((state) => {
        const idStr = String(id);
        const pinnedMatches = state.pinnedMatches.includes(idStr) 
          ? state.pinnedMatches.filter(m => m !== idStr) 
          : [...state.pinnedMatches, idStr];
        return { pinnedMatches };
      }),
    }),
    { name: 'zoka-preferences' }
  )
);
