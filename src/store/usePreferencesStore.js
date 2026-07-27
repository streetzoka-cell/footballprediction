import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const usePreferencesStore = create(
  persist(
    (set, get) => ({
      // Phase 8: User Experience Preferences
      theme: 'dark', // 'dark' | 'light'
      soundEnabled: true,
      lowDataMode: false,
      favorites: [], // array of match IDs
      pinnedLeagues: [], // array of league names

      // Actions
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
      toggleLowData: () => set((state) => ({ lowDataMode: !state.lowDataMode })),
      
      toggleFavorite: (id) => set((state) => {
        const idStr = String(id);
        const favorites = state.favorites.includes(idStr)
          ? state.favorites.filter(f => f !== idStr)
          : [...state.favorites, idStr];
        return { favorites };
      }),
      
      togglePinnedLeague: (name) => set((state) => {
        const pinnedLeagues = state.pinnedLeagues.includes(name)
          ? state.pinnedLeagues.filter(l => l !== name)
          : [...state.pinnedLeagues, name];
        return { pinnedLeagues };
      }),

      // Getters
      isFavorite: (id) => get().favorites.includes(String(id)),
      isPinned: (name) => get().pinnedLeagues.includes(name),
    }),
    { name: 'zoka-preferences' }
  )
);