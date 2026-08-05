import { create } from 'zustand';

export const useEditorStore = create((set, get) => ({
  project: null,
  selectedLayerId: null,
  isPlaying: false,
  isOffline: typeof window !== 'undefined' ? !window.navigator.onLine : false,
  currentTime: 0,
  duration: 10, 

  setProject: (project) => {
    const videoLayer = project?.layers?.find(l => l.type === 'video');
    const dur = videoLayer ? (videoLayer.duration || 10) : 10;
    set({ project, selectedLayerId: null, isPlaying: false, currentTime: 0, duration: dur });
  },
  
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setOffline: (isOffline) => set({ isOffline }),
  
  addLayer: (layer) => {
    const newId = `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return set((state) => {
      const newLayers = [...(state.project?.layers || []), { ...layer, id: newId }];
      const newProject = { ...state.project, layers: newLayers };
      
      if (layer.type === 'video' && layer.duration) {
        return { project: newProject, selectedLayerId: newId, duration: Math.max(state.duration, layer.duration) };
      }
      return { project: newProject, selectedLayerId: newId };
    });
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