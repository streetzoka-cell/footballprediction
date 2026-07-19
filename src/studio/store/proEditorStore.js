// src/studio/store/proEditorStore.js
import { create } from 'zustand';

export const useProEditorStore = create((set) => ({
  // Timeline State
  playhead: 0,
  duration: 10,
  isPlaying: false,
  fps: 30,

  // Layer State
  layers: [],
  selectedLayerId: null,

  // History (Undo/Redo)
  history: [],
  historyIndex: -1,

  // Actions
  setPlayhead: (time) => set({ playhead: time }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setDuration: (duration) => set({ duration }),

  addLayer: (layer) => set((state) => {
    const newId = `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newLayer = { 
      id: newId, 
      name: layer.type.toUpperCase() + ' ' + (state.layers.length + 1),
      ...layer,
      keyframes: [] // [{ prop: 'x', time: 0, value: 100 }, { prop: 'x', time: 2, value: 500 }]
    };
    return { layers: [...state.layers, newLayer], selectedLayerId: newId };
  }),

  updateLayer: (id, updates) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, ...updates } : l)
  })),

  removeLayer: (id) => set((state) => ({
    layers: state.layers.filter(l => l.id !== id),
    selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId
  })),

  selectLayer: (id) => set({ selectedLayerId: id }),

  // Keyframe Logic
  addKeyframe: (layerId, prop, time, value) => set((state) => ({
    layers: state.layers.map(l => {
      if (l.id !== layerId) return l;
      const existing = l.keyframes.filter(k => !(k.prop === prop && k.time === time));
      return { ...l, keyframes: [...existing, { prop, time, value }] };
    })
  })),
}));