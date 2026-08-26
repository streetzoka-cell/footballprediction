
import { create } from 'zustand';

export const useEditorStore = create((set, get) => ({
  project: null,
  selectedLayerId: null,
  isPlaying: false,
  currentTime: 0,
  exportState: { status: 'idle', progress: 0, url: null },
  history: { past: [], future: [] },
  offline: !navigator.onLine,

  setProject: (project) => set((state) => ({
    project,
    history: { past: [...state.history.past, state.project].filter(Boolean).slice(-30), future: [] }
  })),

  updateProject: (updater) => set((state) => {
    if (!state.project) return state;
    const newProject = typeof updater === 'function' ? updater(state.project) : { ...state.project, ...updater };
    return { project: { ...newProject, updatedAt: Date.now() } };
  }),

  setSelectedLayer: (id) => set({ selectedLayerId: id }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setExportState: (exportState) => set((state) => ({ exportState: { ...state.exportState, ...exportState } })),

  applyLayout: (layoutId) => {
    const { project } = get();
    if (!project) return;
    const W = project.canvasSize?.width || 1080;
    const H = project.canvasSize?.height || 1920;
    const videoLayers = project.layers.filter(l => l.type === 'video');
    let newLayers = [...project.layers];
    
    if (layoutId === 'grid4') {
      videoLayers.forEach((layer, i) => {
        const idx = newLayers.findIndex(l => l.id === layer.id);
        newLayers[idx] = { ...layer, x: (i % 2) * (W/2), y: Math.floor(i/2) * (H/2), width: W/2, height: H/2 };
      });
    } else if (layoutId === 'split2_vert') {
      videoLayers.slice(0,2).forEach((layer, i) => {
        const idx = newLayers.findIndex(l => l.id === layer.id);
        newLayers[idx] = { ...layer, x: 0, y: i * (H/2), width: W, height: H/2 };
      });
    } else if (layoutId === 'split2_horiz') {
      videoLayers.slice(0,2).forEach((layer, i) => {
        const idx = newLayers.findIndex(l => l.id === layer.id);
        newLayers[idx] = { ...layer, x: i * (W/2), y: 0, width: W/2, height: H };
      });
    } else if (layoutId === 'pip') {
      if (videoLayers[0]) {
        const idx = newLayers.findIndex(l => l.id === videoLayers[0].id);
        newLayers[idx] = { ...videoLayers[0], x: 0, y: 0, width: W, height: H };
      }
      if (videoLayers[1]) {
        const idx = newLayers.findIndex(l => l.id === videoLayers[1].id);
        newLayers[idx] = { ...videoLayers[1], x: W - 320, y: H - 500, width: 280, height: 400 };
      }
    }
    
    get().updateProject({ layers: newLayers });
  },

  undo: () => set((state) => {
    if (state.history.past.length === 0) return state;
    const prev = state.history.past[state.history.past.length - 1];
    return { project: prev, history: { past: state.history.past.slice(0, -1), future: [state.project, ...state.history.future] } };
  }),

  redo: () => set((state) => {
    if (state.history.future.length === 0) return state;
    const next = state.history.future[0];
    return { project: next, history: { past: [...state.history.past, state.project], future: state.history.future.slice(1) } };
  }),

  setOffline: (offline) => set({ offline }),
}));

// Also default export for compatibility
export default useEditorStore;
