// src/studio/store/editorStore.js
import { create } from 'zustand';

export const useEditorStore = create((set) => ({
  project: null,
  selectedLayerId: null,
  isPlaying: false,
  
  setProject: (project) => set({ project, selectedLayerId: null, isPlaying: false }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  
  addLayer: (layer) => {
    const newId = `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return set((state) => ({
      project: {
        ...state.project,
        layers: [...state.project.layers, { ...layer, id: newId, animation: 'none' }]
      },
      selectedLayerId: newId
    }));
  },

  updateLayer: (id, updates) => set((state) => ({
    project: {
      ...state.project,
      layers: state.project.layers.map(l => l.id === id ? { ...l, ...updates } : l)
    }
  })),

  removeLayer: (id) => set((state) => ({
    project: {
      ...state.project,
      layers: state.project.layers.filter(l => l.id !== id)
    },
    selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId
  })),

  selectLayer: (id) => set({ selectedLayerId: id }),
}));