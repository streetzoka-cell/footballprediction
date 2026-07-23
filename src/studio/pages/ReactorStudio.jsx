// ═══════════════════════════════════════════════════════════════
// FILE: src/pages/ReactorStudio.jsx
// REACTOR STUDIO PRO - Mobile First / TikTok Style Layout
// ═══════════════════════════════════════════════════════════════

import React, { useReducer, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, Download, Upload, Camera, Music, User, Volume2, VolumeX, 
  Sliders, Move, Palette, Search, Star, LayoutGrid, Layers, Type, Grid3x3, X, Film, Shield, Play, Pause, Loader, Trash2, BadgeCheck, Sparkles, Eraser, Scissors, Cpu, Image as ImageIcon, Crop, Wand2, ChevronRight
} from 'lucide-react';

// --- HELPER: WebM Duration Metadata Fixer ---
const fixWebmDuration = async (blob, durationMs) => {
  if (blob.type !== 'video/webm') return blob;
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let segInfoOffset = -1;
  for (let i = 0; i < uint8.length - 4; i++) {
    if (view.getUint32(i) === 0x1549A966) { segInfoOffset = i; break; }
  }
  if (segInfoOffset === -1) return blob;
  let timecodeOffset = -1;
  for (let i = segInfoOffset; i < uint8.length - 3; i++) {
    if (view.getUint8(i) === 0x2A && view.getUint8(i+1) === 0xD7 && view.getUint8(i+2) === 0xB1) { timecodeOffset = i; break; }
  }
  if (timecodeOffset === -1) return blob;
  let timecodeScale = 1000000;
  const tsSize = view.getUint8(timecodeOffset + 3);
  if (tsSize === 3) timecodeScale = (view.getUint8(timecodeOffset + 4) << 16) | (view.getUint8(timecodeOffset + 5) << 8) | (view.getUint8(timecodeOffset + 6));
  const durationInMkvUnits = durationMs * (timecodeScale / 1000000);
  const insertAt = timecodeOffset + 7;
  const durationElement = new Uint8Array(2 + 1 + 8);
  const durView = new DataView(durationElement.buffer);
  durView.setUint16(0, 0x4489); durView.setUint8(2, 0x88); durView.setFloat64(3, durationInMkvUnits);
  const segInfoSizeOffset = segInfoOffset + 4;
  const firstByte = view.getUint8(segInfoSizeOffset);
  let sizeBytes = 1, mask = 0x80;
  while (sizeBytes <= 8 && (firstByte & mask) === 0) { mask >>= 1; sizeBytes++; }
  let segInfoSize = (firstByte & (mask - 1));
  for (let i = 1; i < sizeBytes; i++) segInfoSize = (segInfoSize << 8) + view.getUint8(segInfoSizeOffset + i);
  const newSize = segInfoSize + durationElement.length;
  const maxValForWidth = (1 << (7 * sizeBytes - 1)) - 1;
  if (newSize > maxValForWidth) return blob;
  const newUint8 = new Uint8Array(uint8.length + durationElement.length);
  newUint8.set(uint8.subarray(0, insertAt), 0);
  newUint8.set(durationElement, insertAt);
  newUint8.set(uint8.subarray(insertAt), insertAt + durationElement.length);
  const newView = new DataView(newUint8.buffer);
  let patchVal = newSize;
  for (let i = sizeBytes - 1; i >= 1; i--) { newView.setUint8(segInfoSizeOffset + i, patchVal & 0xFF); patchVal >>= 8; }
  newView.setUint8(segInfoSizeOffset, (firstByte & (mask - 1)) | (patchVal & (mask - 1)));
  return new Blob([newUint8], { type: 'video/webm' });
};

// --- HELPER: IndexedDB ---
const DB_NAME = 'ReactorStudioDB';
const STORE_NAME = 'Assets';
const openDB = () => new Promise((res, rej) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = e => !e.target.result.objectStoreNames.contains(STORE_NAME) && e.target.result.createObjectStore(STORE_NAME);
  req.onsuccess = e => res(e.target.result);
  req.onerror = e => rej(e.target.error);
});
const idbSet = async (k, v) => (await openDB()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(v, k);
const idbGet = async (k) => new Promise(async (res, rej) => { const tx = (await openDB()).transaction(STORE_NAME, 'readonly'); const r = tx.objectStore(STORE_NAME).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbClear = async () => new Promise(async (res, rej) => { const tx = (await openDB()).transaction(STORE_NAME, 'readwrite'); const r = tx.objectStore(STORE_NAME).clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });

// --- HELPER: Draw ZOKA Logo Vector Fallback ---
const drawZokaLogo = (ctx, x, y, size, color = '#10b981') => {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size/2, -size/2); ctx.lineTo(size/2, -size/2); ctx.lineTo(size/2, -size/4);
  ctx.lineTo(-size/4, size/4); ctx.lineTo(size/2, size/4); ctx.lineTo(size/2, size/2);
  ctx.lineTo(-size/2, size/2); ctx.lineTo(-size/2, size/4); ctx.lineTo(size/4, -size/4);
  ctx.lineTo(-size/2, -size/4); ctx.closePath(); ctx.fill();
  ctx.restore();
};

// --- 1. MASSIVE TEMPLATE ENGINE ---
const TEMPLATES = [
  // Pro & Clean
  { id: 'pro_aura', title: 'Pro: Aura Maximus', category: 'Pro', layout: 'single', bg:'#000', preview: {bg: 'linear-gradient(135deg, #000, #333)', layout: 'pro'} },
  { id: 'pro_cinematic', title: 'Pro: Cinematic Wide', category: 'Pro', layout: 'single', bg:'#000', preview: {bg: 'linear-gradient(135deg, #111, #000)', layout: 'pro'} },
  { id: 'min_dark', title: 'Minimal Dark', category: 'Pro', layout: 'single', bg:'#000', preview: {bg: '#000', layout: 'center'} },
  
  // Split Screens (React Videos)
  { id: 'split_lr', title: 'Split Left/Right (50/50)', category: 'Split', layout: 'split_lr', bg:'#000', preview: {bg: '#111', layout: 'split_lr'} },
  { id: 'split_tb', title: 'Split Top/Bottom (50/50)', category: 'Split', layout: 'split_tb', bg:'#000', preview: {bg: '#111', layout: 'split_tb'} },
  { id: 'split_custom', title: 'Split Pro (70/30)', category: 'Split', layout: 'split_custom', bg:'#000', preview: {bg: '#111', layout: 'split_custom'} },
  { id: 'react_tl', title: 'React Top Left (Full)', category: 'Split', layout: 'react_tl', bg:'#000', preview: {bg: '#111', layout: 'react_tl'} },
  { id: 'react_tr', title: 'React Top Right (Full)', category: 'Split', layout: 'react_tr', bg:'#000', preview: {bg: '#111', layout: 'react_tr'} },
  { id: 'react_bl', title: 'React Bottom Left (Full)', category: 'Split', layout: 'react_bl', bg:'#000', preview: {bg: '#111', layout: 'react_bl'} },
  { id: 'react_br', title: 'React Bottom Right (Full)', category: 'Split', layout: 'react_br', bg:'#000', preview: {bg: '#111', layout: 'react_br'} },
  { id: 'react_full_top', title: 'React Band Top (30%)', category: 'Split', layout: 'react_full_top', bg:'#000', preview: {bg: '#111', layout: 'react_full_top'} },
  { id: 'react_full_bottom', title: 'React Band Bottom (30%)', category: 'Split', layout: 'react_full_bottom', bg:'#000', preview: {bg: '#111', layout: 'react_full_bottom'} },
  
  // Grids (Up to 9 Videos)
  { id: 'grid_2x2', title: 'Grid 2x2 (4 Videos)', category: 'Grid', layout: 'grid_2x2', bg:'#000', preview: {bg: '#111', layout: 'grid_2x2'} },
  { id: 'grid_3x3', title: 'Grid 3x3 (9 Videos)', category: 'Grid', layout: 'grid_3x3', bg:'#000', preview: {bg: '#111', layout: 'grid_3x3'} },
  { id: 'grid_4', title: 'Grid 4 Horizontal', category: 'Grid', layout: 'grid_4', bg:'#000', preview: {bg: '#111', layout: 'grid_4'} },
  
  // Social
  { id: 'social_pro', title: 'TikTok POV (Exact Match)', category: 'Social', layout: 'single', profile: {x:50,y:70,r:35,ring:'accent'}, nameEl: {x:100,y:60,size:30,color:'#fff'}, handleEl: {x:100,y:92,size:24,color:'#aaa'}, caption: {x:50,y:150,size:26,maxW:620,align:'left',color:'#fff'}, topGradient:350, bottomGradient:200, preview: {bg: 'linear-gradient(to bottom, #1e293b, #0f172a)', layout: 'pov'} },
  { id: 'insta_lux', title: 'Insta Luxury Gold', category: 'Social', layout: 'single', video: {x:40,y:80,w:640,h:900,border:'#f59e0b'}, profile: {x:360,y:1100,r:40,ring:'#f59e0b'}, username: {x:360,y:1200,size:36,color:'#fff',center:true,badge:true,badgeColor:'#f59e0b'}, caption: {x:360,y:130,size:28,color:'#fff',maxW:600,center:true}, bg:'#000', preview: {bg: '#000', layout: 'center'} },
  
  // Football
  { id: 'news_red', title: 'Football Breaking', category: 'Football', layout: 'single', video: {x:0,y:100,w:720,h:1080}, caption: {x:360,y:60,size:32,color:'#fff',maxW:680,center:true}, header: {h:100,bg:'#dc2626',text:'BREAKING NEWS',y:45,size:36}, ticker: {h:100,bg:'#111827',y:1230,size:28}, bg:'#000', preview: {bg: '#dc2626', layout: 'news'} },
];

const FONT_PACKS = {
  TikTok: { name: 'Arial, sans-serif', weight: 'bold' },
  Modern: { name: 'Inter, sans-serif', weight: '600' },
  Luxury: { name: 'Georgia, serif', weight: 'bold' },
  Gaming: { name: 'Courier New, monospace', weight: 'bold' },
  Elegant: { name: 'Times New Roman, serif', weight: 'italic' },
  Impact: { name: 'Impact, sans-serif', weight: 'bold' }
};

const BRAND_PRESETS = [
  { name: 'ZOKA', color: '#10b981' }, { name: 'Twitter', color: '#1d9bf0' }, 
  { name: 'TikTok', color: '#ec4899' }, { name: 'Twitch', color: '#9146ff' }, 
  { name: 'Gold', color: '#f59e0b' }, { name: 'Orange', color: '#f97316' }
];

const FILTERS = [
  { id: 'none', name: 'Normal' }, { id: 'saturate(2) contrast(1.3)', name: 'Vivid' },
  { id: 'grayscale(1) contrast(1.2)', name: 'B&W' }, { id: 'sepia(0.8) contrast(1.1) brightness(0.9)', name: 'Retro' },
  { id: 'invert(1)', name: 'Invert' }, { id: 'blur(2px)', name: 'Blur' },
  { id: 'brightness(1.4) saturate(0.8)', name: 'Warm' }, { id: 'brightness(0.8) saturate(1.5) hue-rotate(200deg)', name: 'Cool' },
  { id: 'contrast(1.5) brightness(1.1) sepia(0.3)', name: 'Vintage' }
];

const VIDEO_EFFECTS = [
  { id: 'none', name: 'None' }, { id: 'zoom_in', name: 'Zoom In' },
  { id: 'shake', name: 'Shake' }, { id: 'pulse', name: 'Pulse' },
  { id: 'ken_burns', name: 'Ken Burns' }, { id: 'glitch', name: 'Glitch' },
  { id: 'rgb_split', name: 'RGB Split' }, { id: 'flash', name: 'Flash' }
];

const TEXT_ANIMATIONS = [
  { id: 'none', name: 'None' }, { id: 'fade_in', name: 'Fade In' },
  { id: 'slide_up', name: 'Slide Up' }, { id: 'type_writer', name: 'Typewriter' },
  { id: 'bounce', name: 'Bounce' }
];

const INTRO_STYLES = [
  { id: 'glitch_reveal', name: 'Glitch Reveal' },
  { id: 'neon_pulse', name: 'Neon Pulse' },
  { id: 'slide_zoom', name: 'Slide Zoom' }
];

// --- HELPER: Smart Layer Position Calculator ---
const getLayerPos = (template, layer, index, editMode) => {
  const W = 720, H = 1280;
  if (editMode && layer.customPos) return layer.customPos;
  
  const layout = template.layout || 'single';
  
  if (template.video && index === 0) {
    return { x: template.video.x, y: template.video.y, w: template.video.w, h: template.video.h };
  }
  
  if (layout === 'single') {
    if (index === 0) return { x:0, y:0, w:W, h:H };
    return { x: 410, y: 830, w: 280, h: 380 }; 
  }
  if (layout === 'split_lr') {
    if (index === 0) return { x:0, y:0, w:360, h:H };
    if (index === 1) return { x:360, y:0, w:360, h:H };
    return { x: 410, y: 830, w: 280, h: 380 };
  }
  if (layout === 'split_tb') {
    if (index === 0) return { x:0, y:0, w:W, h:640 };
    if (index === 1) return { x:0, y:640, w:W, h:640 };
    return { x: 410, y: 830, w: 280, h: 380 };
  }
  if (layout === 'split_custom') { 
    if (index === 0) return { x:0, y:0, w:504, h:H };
    if (index === 1) return { x:504, y:0, w:216, h:H };
    return { x: 410, y: 830, w: 280, h: 380 };
  }
  if (layout === 'react_tl') return index === 0 ? { x:0, y:0, w:W, h:H } : { x:30, y:50, w:280, h:380};
  if (layout === 'react_tr') return index === 0 ? { x:0, y:0, w:W, h:H } : { x:410, y:50, w:280, h:380};
  if (layout === 'react_bl') return index === 0 ? { x:0, y:0, w:W, h:H } : { x:30, y:830, w:280, h:380};
  if (layout === 'react_br') return index === 0 ? { x:0, y:0, w:W, h:H } : { x:410, y:830, w:280, h:380};
  
  if (layout === 'react_full_top') {
    if (index === 0) return { x:0, y:384, w:W, h:896 }; 
    if (index === 1) return { x:0, y:0, w:W, h:384 }; 
    return { x: 410, y: 830, w: 280, h: 380 };
  }
  if (layout === 'react_full_bottom') {
    if (index === 0) return { x:0, y:0, w:W, h:896 }; 
    if (index === 1) return { x:0, y:896, w:W, h:384 }; 
    return { x: 410, y: 830, w: 280, h: 380 };
  }
  
  if (layout === 'grid_2x2') {
    const pos = [
      { x:0, y:0, w:360, h:640 },
      { x:360, y:0, w:360, h:640 },
      { x:0, y:640, w:360, h:640 },
      { x:360, y:640, w:360, h:640 }
    ];
    return pos[index] || { x: 410, y: 830, w: 280, h: 380 };
  }
  if (layout === 'grid_3x3') {
    const w = W/3, h = H/3;
    const pos = [];
    for(let r=0; r<3; r++) for(let c=0; c<3; c++) pos.push({ x: c*w, y: r*h, w, h });
    return pos[index] || { x: 410, y: 830, w: 280, h: 380 };
  }
  if (layout === 'grid_4') {
    const pos = [
      { x:0, y:0, w:W, h:320 },
      { x:0, y:320, w:W, h:320 },
      { x:0, y:640, w:W, h:320 },
      { x:0, y:960, w:W, h:320 }
    ];
    return pos[index] || { x: 410, y: 830, w: 280, h: 380 };
  }
  
  return { x:0, y:0, w:W, h:H };
};

// --- HELPER: Rounded Rectangle Path ---
const roundRectPath = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

// --- 2. REDUCER STATE MANAGEMENT ---
const initialState = {
  media: { 
    layers: [], 
    sourceLoaded: false, 
    profileSrc: null, 
    logoSrc: null, 
    audioName: '' 
  },
  editor: {
    templateId: 'pro_aura', displayName: 'Manu', username: 'manuel_palmer', povCaption: 'POV: You just witnessed greatness 🔥',
    accentColor: '#10b981', fontPack: 'TikTok', nameColor: '#ffffff', nameSize: null, captionColor: '#ffffff', captionSize: null,
    showVerified: true, editMode: false, videoEffect: 'none', textAnimation: 'none', 
    homeLogoUrl: '', awayLogoUrl: '', homeScore: 0, awayScore: 0,
    isMuted: false, filter: 'none', fadeIn: false, 
    introEnabled: true, introStyle: 'glitch_reveal', introWatermark: true,
    videoZoom: 1, videoPanX: 0, videoPanY: 0,
    activeLayerId: null
  },
  timeline: { clips: [{ id: 'clip1', start: 0, end: 0 }], activeClipId: 'clip1', duration: 0, currentTime: 0, isPlaying: false },
  ui: { 
    activePanel: null, showGuides: false, isExporting: false, exportFormat: null, exportFps: null, recordedUrl: null, recordedExt: 'webm', isLoadingProject: true,
    favorites: JSON.parse(localStorage.getItem("reactor-favorites")) || [], recents: JSON.parse(localStorage.getItem("reactor-recents")) || [],
    searchQuery: "", activeCategory: "All", layers: { video: true, pip: true, profile: true, caption: true, gradients: true, scorebug: true } 
  }
};

function studioReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE': return { ...state, ...action.payload };
    case 'SET_MEDIA': return { ...state, media: { ...state.media, ...action.payload } };
    case 'SET_EDITOR': return { ...state, editor: { ...state.editor, ...action.payload } };
    case 'SET_TIMELINE': return { ...state, timeline: { ...state.timeline, ...action.payload } };
    case 'SET_UI': return { ...state, ui: { ...state.ui, ...action.payload } };
    case 'RESET': return { ...initialState, ui: { ...initialState.ui, isLoadingProject: false } };
    default: return state;
  }
}

export default function ReactorStudio() {
  const navigate = useNavigate();
  const location = useLocation(); 
  const fixtureData = location.state; 
  
  const [state, dispatch] = useReducer(studioReducer, initialState);
  
  const videoRefs = useRef({}); 
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(document.createElement('canvas')); 
  const exportCanvasRef = useRef(null);
  const fileInputRefs = useRef({ video: null, image: null, logo: null, audio: null });
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const dragRef = useRef({ target: null, offsetX: 0, offsetY: 0 });
  const timelineDragRef = useRef(null);
  const profileImgRef = useRef(new Image());
  const logoImgRef = useRef(new Image());
  const homeLogoRef = useRef(new Image());
  const awayLogoRef = useRef(new Image());

  const currentTimeRef = useRef(0);
  const renderOverlayRef = useRef(() => {});

  const { media, editor, timeline, ui } = state;
  const templateMap = useMemo(() => Object.fromEntries(TEMPLATES.map(t => [t.id, t])), []);
  const activeTemplate = templateMap[editor.templateId] || TEMPLATES[0];
  const activeClip = useMemo(() => timeline.clips.find(c => c.id === timeline.activeClipId) || timeline.clips[0], [timeline.clips, timeline.activeClipId]);

  useEffect(() => {
    if (fixtureData) {
      dispatch({
        type: 'SET_EDITOR', 
        payload: {
          homeLogoUrl: fixtureData.homeLogo || '',
          awayLogoUrl: fixtureData.awayLogo || '',
          homeScore: fixtureData.score?.home ?? 0,
          awayScore: fixtureData.score?.away ?? 0,
          povCaption: `${fixtureData.minute || ''} GOAL! ${fixtureData.scorer || ''} scores! 🔥`,
          templateId: 'news_red' 
        }
      });
      dispatch({ type: 'SET_UI', payload: { activeCategory: "Football", activePanel: 'templates' } });
    }
  }, [fixtureData]);

  useEffect(() => {
    const load = async () => {
      const saved = JSON.parse(localStorage.getItem('reactor-project-state') || '{}');
      if (saved.editor) dispatch({ type: 'SET_EDITOR', payload: saved.editor });
      if (saved.timeline) dispatch({ type: 'SET_TIMELINE', payload: saved.timeline });
      
      try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const allKeys = await new Promise(res => {
          const req = store.getAllKeys();
          req.onsuccess = () => res(req.result);
          req.onerror = () => res([]);
        });
        
        const loadedLayers = [];
        for (const key of allKeys) {
          if (String(key).startsWith('media_layer_')) {
            const blob = await idbGet(key);
            if (blob) {
              loadedLayers.push({ id: String(key).replace('media_', ''), src: URL.createObjectURL(blob), name: 'Restored', type: 'video', customPos: null, muted: true });
            }
          }
        }
        
        if (loadedLayers.length > 0) {
          loadedLayers[0].muted = false;
          dispatch({ type: 'SET_MEDIA', payload: { layers: loadedLayers, sourceLoaded: true } });
          
          const mainVid = loadedLayers[0];
          setTimeout(() => {
            const vid = videoRefs.current[mainVid.id];
            if (vid) {
              vid.onloadedmetadata = () => {
                const dur = vid.duration;
                dispatch({ type: 'SET_TIMELINE', payload: { duration: dur, clips: saved.timeline?.clips?.length ? saved.timeline.clips : [{ id: 'clip1', start: 0, end: dur }] } });
              };
            }
          }, 200);
        }
        
        const pBlob = await idbGet('profile_image');
        if (pBlob) { const src = URL.createObjectURL(pBlob); profileImgRef.current.src = src; dispatch({ type: 'SET_MEDIA', payload: { profileSrc: src } }); }
        const lBlob = await idbGet('logo_image');
        if (lBlob) { const src = URL.createObjectURL(lBlob); logoImgRef.current.src = src; dispatch({ type: 'SET_MEDIA', payload: { logoSrc: src } }); }
        const aBlob = await idbGet('audio_track');
        if (aBlob) { audioRef.current.src = URL.createObjectURL(aBlob); audioRef.current.loop = true; dispatch({ type: 'SET_MEDIA', payload: { audioName: 'Restored Audio' } }); }
        
      } catch (e) { console.error(e); }
      dispatch({ type: 'SET_UI', payload: { isLoadingProject: false } });
    };
    load();
  }, []);

  useEffect(() => {
    if (ui.isLoadingProject) return;
    localStorage.setItem('reactor-project-state', JSON.stringify({ editor, timeline }));
  }, [editor, timeline, ui.isLoadingProject]);

  useEffect(() => { if (media.profileSrc) profileImgRef.current.src = media.profileSrc; }, [media.profileSrc]);
  useEffect(() => { if (media.logoSrc) logoImgRef.current.src = media.logoSrc; }, [media.logoSrc]);
  useEffect(() => { if (editor.homeLogoUrl) homeLogoRef.current.src = editor.homeLogoUrl; }, [editor.homeLogoUrl]);
  useEffect(() => { if (editor.awayLogoUrl) awayLogoRef.current.src = editor.awayLogoUrl; }, [editor.awayLogoUrl]);

  // Sync secondary videos play/pause
  useEffect(() => {
    Object.values(media.layers).forEach((layer, idx) => {
      const vid = videoRefs.current[layer.id];
      if (!vid) return;
      if (idx === 0) return; 
      
      if (timeline.isPlaying) {
        if (vid.paused) vid.play().catch(() => {});
      } else {
        if (!vid.paused) vid.pause();
      }
    });
  }, [timeline.isPlaying, media.layers]);

  const handleImport = async (e) => {
    const files = Array.from(e.target.files);
    let currentLayers = [...media.layers];
    let firstVideoAdded = currentLayers.length === 0;

    for (const file of files) {
      if (currentLayers.length >= 10) {
        alert("Maximum of 10 video layers reached.");
        break;
      }
      const url = URL.createObjectURL(file);
      const newLayer = { id: `layer_${Date.now()}_${Math.random()}`, src: url, name: file.name, type: 'video', customPos: null, muted: currentLayers.length > 0 };
      currentLayers.push(newLayer);
      await idbSet(`media_${newLayer.id}`, file);
    }
    
    if (currentLayers.length > media.layers.length) {
      dispatch({ type: 'SET_MEDIA', payload: { layers: currentLayers } });
      
      if (firstVideoAdded) {
        setTimeout(() => {
          const mainLayer = currentLayers[0];
          const vid = videoRefs.current[mainLayer.id];
          if (vid) {
            vid.onloadedmetadata = () => {
              const dur = vid.duration;
              dispatch({ type: 'SET_EDITOR', payload: { activeLayerId: mainLayer.id } });
              dispatch({ type: 'SET_TIMELINE', payload: { duration: dur, clips: [{ id: 'clip1', start: 0, end: dur }], activeClipId: 'clip1', isPlaying: true, currentTime: 0 } });
              dispatch({ type: 'SET_MEDIA', payload: { sourceLoaded: true } });
              vid.play();
            };
          }
        }, 200);
      }
      
      setTimeout(() => {
        currentLayers.forEach((layer, idx) => {
          if (idx > 0 || !firstVideoAdded) {
            const vid = videoRefs.current[layer.id];
            if (vid) {
              vid.muted = true;
              vid.loop = true;
              vid.onloadedmetadata = () => { vid.play(); };
            }
          }
        });
      }, 200);
    }
    e.target.value = null;
  };

  const handleImportAsset = async (e, type) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      if (type === 'image') {
        await idbSet('profile_image', file);
        profileImgRef.current.src = url;
        dispatch({ type: 'SET_MEDIA', payload: { profileSrc: url } });
      } else if (type === 'logo') {
        await idbSet('logo_image', file);
        logoImgRef.current.src = url;
        dispatch({ type: 'SET_MEDIA', payload: { logoSrc: url } });
      } else if (type === 'audio') {
        await idbSet('audio_track', file);
        audioRef.current.src = url; audioRef.current.loop = true;
        dispatch({ type: 'SET_MEDIA', payload: { audioName: file.name } });
      }
    }
    e.target.value = null;
  };

  const handleClearProject = async () => {
    if (!window.confirm("Clear all project data?")) return;
    localStorage.removeItem('reactor-project-state');
    await idbClear();
    window.location.reload();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 720, height: 1280, facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      const newLayer = { id: `webcam_${Date.now()}`, src: null, name: 'Webcam', type: 'webcam', customPos: null, muted: false };
      const newLayers = [...media.layers, newLayer];
      dispatch({ type: 'SET_MEDIA', payload: { layers: newLayers } });
      
      setTimeout(() => {
        const vid = videoRefs.current[newLayer.id];
        if (vid) {
          vid.srcObject = stream;
          vid.muted = true; 
          vid.play();
        }
      }, 100);
    } catch { alert("Camera access denied."); }
  };

  const togglePreview = () => {
    const mainVid = videoRefs.current[media.layers[0]?.id];
    if (!mainVid || !activeClip) return;
    if (timeline.isPlaying) { 
      mainVid.pause(); 
      dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: false } }); 
    } else {
      if (mainVid.currentTime < activeClip.start || mainVid.currentTime >= activeClip.end - 0.1) mainVid.currentTime = activeClip.start;
      mainVid.play(); 
      dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: true } });
    }
  };

  const handleSplit = () => {
    const mainVid = videoRefs.current[media.layers[0]?.id]; 
    if (!mainVid || !activeClip) return;
    const t = mainVid.currentTime;
    const idx = timeline.clips.findIndex(c => c.id === timeline.activeClipId);
    const c = timeline.clips[idx];
    if (t > c.start + 0.5 && t < c.end - 0.5) {
      const c1 = { ...c, end: t }; const c2 = { id: `clip_${Date.now()}`, start: t, end: c.end };
      const nClips = [...timeline.clips]; nClips.splice(idx, 1, c1, c2);
      dispatch({ type: 'SET_TIMELINE', payload: { clips: nClips, activeClipId: c2.id } });
    }
  };

  const handleDeleteClip = (id) => {
    if (timeline.clips.length <= 1) return;
    const nClips = timeline.clips.filter(c => c.id !== id);
    dispatch({ type: 'SET_TIMELINE', payload: { clips: nClips, activeClipId: nClips[0].id } });
    if (videoRefs.current[media.layers[0]?.id]) videoRefs.current[media.layers[0].id].currentTime = nClips[0].start;
  };

  const handleTimelineDrag = (e, clipId, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const trackEl = e.currentTarget.parentElement;
    const rect = trackEl.getBoundingClientRect();
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    const clip = timeline.clips.find(c => c.id === clipId);
    const pxToSec = timeline.duration / rect.width;
    
    timelineDragRef.current = { clipId, mode, startX, origStart: clip.start, origEnd: clip.end, pxToSec };

    const onMove = (ev) => {
      if (!timelineDragRef.current) return;
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const deltaSec = (x - timelineDragRef.current.startX) * timelineDragRef.current.pxToSec;
      
      let { clipId, mode, origStart, origEnd } = timelineDragRef.current;
      let newStart = origStart, newEnd = origEnd;
      
      if (mode === 'move') { 
        newStart = Math.max(0, Math.min(origStart + deltaSec, timeline.duration - (origEnd - origStart))); 
        newEnd = newStart + (origEnd - origStart); 
      } else if (mode === 'resize-l') { 
        newStart = Math.max(0, Math.min(origStart + deltaSec, origEnd - 0.5)); 
      } else if (mode === 'resize-r') { 
        newEnd = Math.max(origStart + 0.5, Math.min(origEnd + deltaSec, timeline.duration)); 
      }
      
      dispatch({ type: 'SET_TIMELINE', payload: { clips: timeline.clips.map(c => c.id === clipId ? { ...c, start: newStart, end: newEnd } : c) } });
    };

    const onUp = () => {
      timelineDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
  };

  // --- DRAWING HELPERS ---
  const drawCover = (ctx, video, dx, dy, dw, dh, crop = { x: 0, y: 0, w: 1, h: 1 }) => {
    const vw = video.videoWidth, vh = video.videoHeight; 
    if (!vw || !vh) return;
    
    const srcW = vw * crop.w;
    const srcH = vh * crop.h;
    const srcX = vw * crop.x;
    const srcY = vh * crop.y;
    
    const vr = srcW / srcH, br = dw / dh; 
    let sx, sy, sw, sh;
    if (vr > br) { sh = srcH; sw = srcH * br; sx = srcX + (srcW - sw) / 2; sy = srcY; } 
    else { sw = srcW; sh = srcW / br; sx = srcX; sy = srcY + (srcH - sh) / 2; }
    ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
  };

  const wrapText = (ctx, text, mw, ml) => {
    const w = text.split(' '); let l = [], c = w[0] || '';
    for (let i = 1; i < w.length; i++) { if (ctx.measureText(c + ' ' + w[i]).width < mw) c += ' ' + w[i]; else { l.push(c); c = w[i]; } }
    l.push(c); return l.slice(0, ml);
  };

  const drawVerifiedBadge = (ctx, x, y, s) => {
    ctx.save(); ctx.fillStyle = '#1d9bf0'; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.35; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * 0.4, y); ctx.lineTo(x - s * 0.1, y + s * 0.35); ctx.lineTo(x + s * 0.45, y - s * 0.35); ctx.stroke(); ctx.restore();
  };

  // --- 3. OVERLAY CACHING ---
  renderOverlayRef.current = () => {
    const oc = overlayCanvasRef.current;
    const ctx = oc.getContext('2d');
    const W = 720, H = 1280;
    oc.width = W; oc.height = H;
    ctx.clearRect(0, 0, W, H);
    const font = FONT_PACKS[editor.fontPack];
    const cTime = currentTimeRef.current; 
    const aProg = activeClip ? Math.min((cTime - activeClip.start) / 2, 1) : 0;

    if (ui.layers.gradients) {
      if (activeTemplate.topGradient) { const g = ctx.createLinearGradient(0, 0, 0, activeTemplate.topGradient); g.addColorStop(0, 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, activeTemplate.topGradient); }
      if (activeTemplate.bottomGradient) { const g = ctx.createLinearGradient(0, H - activeTemplate.bottomGradient, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.9)'); ctx.fillStyle = g; ctx.fillRect(0, H - activeTemplate.bottomGradient, W, activeTemplate.bottomGradient); }
    }

    if (activeTemplate.header) { const h = activeTemplate.header; ctx.fillStyle = h.bg; ctx.fillRect(0, 0, W, h.h); ctx.fillStyle = '#fff'; ctx.font = `bold ${h.size}px ${font.name}`; ctx.textAlign = 'center'; ctx.fillText(h.text, W / 2, h.y); }
    if (activeTemplate.ticker) { const t = activeTemplate.ticker; ctx.fillStyle = t.bg; ctx.fillRect(0, t.y, W, t.h); ctx.fillStyle = '#fff'; ctx.font = `bold ${t.size}px ${font.name}`; ctx.textAlign = 'left'; wrapText(ctx, editor.povCaption, W - 40, 2).forEach((l, i) => ctx.fillText(l, 20, t.y + 40 + (i * 36))); }

    if (ui.layers.caption && activeTemplate.caption && !activeTemplate.ticker) {
      const c = activeTemplate.caption; ctx.fillStyle = editor.captionColor || c.color || '#fff';
      const cS = editor.captionSize ? parseInt(editor.captionSize) : c.size;
      ctx.font = `${font.weight} ${cS}px ${font.name}`; ctx.textAlign = c.center ? 'center' : (c.align || 'left');
      let dC = editor.povCaption, yO = 0;
      if (editor.textAnimation === 'type_writer') dC = editor.povCaption.substring(0, Math.floor(editor.povCaption.length * aProg));
      else if (editor.textAnimation === 'fade_in') ctx.globalAlpha = aProg;
      else if (editor.textAnimation === 'slide_up') yO = (1 - aProg) * 50;
      let yP = c.y + yO; wrapText(ctx, dC, c.maxW, 3).forEach(l => { ctx.fillText(l, c.x, yP); yP += cS + 8; });
      ctx.globalAlpha = 1;
    }

    const p = (activeTemplate.isCustom || editor.editMode) ? { x: 50, y: 70, r: 35 } : activeTemplate.profile;
    if (profileImgRef.current.src && p && ui.layers.profile) {
      ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      ctx.drawImage(profileImgRef.current, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); ctx.restore();
      if (p.ring) { ctx.strokeStyle = p.ring === 'accent' ? editor.accentColor : p.ring; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 1, 0, Math.PI * 2); ctx.stroke(); }
    }

    if (activeTemplate.nameEl && activeTemplate.handleEl) {
      const n = activeTemplate.nameEl, hd = activeTemplate.handleEl;
      ctx.textAlign = n.align || 'left'; ctx.fillStyle = editor.nameColor || n.color || '#fff';
      const nS = editor.nameSize ? parseInt(editor.nameSize) : n.size; ctx.font = `${font.weight} ${nS}px ${font.name}`;
      const nx = n.x, ny = n.y;
      ctx.fillText(editor.displayName, nx, ny);
      let nW = ctx.measureText(editor.displayName).width; let cX = nx + nW + 12;
      if (editor.showVerified) { drawVerifiedBadge(ctx, cX, ny - nS / 2 + 2, nS / 2.5); cX += (nS / 2.5) * 2 + 12; }
      ctx.fillStyle = hd.color || '#aaa'; ctx.font = `${hd.size}px ${font.name}`; ctx.fillText(`@${editor.username}`, cX, ny);
    }

    if (ui.layers.scorebug && (homeLogoRef.current.src || awayLogoRef.current.src)) {
      const bY = H - 150, bH = 80, bW = 400, bX = (W - bW) / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillRect(bX, bY, bW, bH);
      if (homeLogoRef.current.complete) ctx.drawImage(homeLogoRef.current, bX + 15, bY + 15, 50, 50);
      if (awayLogoRef.current.complete) ctx.drawImage(awayLogoRef.current, bX + bW - 65, bY + 15, 50, 50);
      ctx.fillStyle = '#fff'; ctx.font = `bold 36px ${font.name}`; ctx.textAlign = 'center'; ctx.fillText(`${editor.homeScore} - ${editor.awayScore}`, W / 2, bY + 50);
    }

    if (editor.introEnabled && editor.introWatermark && activeClip) {
      const introEnd = activeClip.start + 3.0;
      if (cTime >= introEnd) {
        const lSize = 60, pad = 30;
        const lX = W - pad - lSize/2;
        const lY = pad + lSize/2;
        ctx.globalAlpha = 0.8;
        if (logoImgRef.current.src && logoImgRef.current.complete) {
          ctx.drawImage(logoImgRef.current, lX - lSize/2, lY - lSize/2, lSize, lSize);
        } else {
          drawZokaLogo(ctx, lX, lY, lSize/2, '#fff');
        }
        ctx.globalAlpha = 1;
      }
    }
  };

  // --- 4. MAIN RENDER LOOP ---
  const drawFrameRef = useRef(() => {});
  drawFrameRef.current = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 720, H = 1280;
    ctx.fillStyle = activeTemplate.bg === 'accent' ? editor.accentColor : (activeTemplate.bg || '#000');
    ctx.fillRect(0, 0, W, H);

    const cTime = currentTimeRef.current;

    media.layers.forEach((layer, index) => {
      const vid = videoRefs.current[layer.id];
      if (!vid || !vid.videoWidth) return;

      if (index === 0 && !media.sourceLoaded) return;

      let pos = getLayerPos(activeTemplate, layer, index, editor.editMode);
      if (!pos) return;

      ctx.save();
      
      if (index === 0) {
        if (Math.abs(vid.currentTime - timeline.currentTime) > 0.3) {
          dispatch({ type: 'SET_TIMELINE', payload: { currentTime: vid.currentTime } });
        }
        if (activeClip) {
          if (vid.currentTime < activeClip.start) vid.currentTime = activeClip.start;
          if (timeline.isPlaying && vid.currentTime >= activeClip.end - 0.05) { vid.pause(); vid.currentTime = activeClip.start; vid.play(); }
        }
        
        const aProg = activeClip ? Math.min((cTime - activeClip.start) / (activeClip.end - activeClip.start), 1) : 0;
        if (editor.videoEffect === 'zoom_in') { const s = 1 + aProg * 0.3; ctx.translate(pos.x + pos.w/2, pos.y + pos.h/2); ctx.scale(s, s); ctx.translate(-(pos.x + pos.w/2), -(pos.y + pos.h/2)); }
        else if (editor.videoEffect === 'shake') ctx.translate((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
        else if (editor.videoEffect === 'pulse') { const s = 1 + Math.sin(cTime * 8) * 0.04; ctx.translate(pos.x + pos.w/2, pos.y + pos.h/2); ctx.scale(s, s); ctx.translate(-(pos.x + pos.w/2), -(pos.y + pos.h/2)); }
        else if (editor.videoEffect === 'ken_burns') { const s = 1 + aProg * 0.15; const tx = aProg * 30; ctx.translate(pos.x + pos.w/2 - tx, pos.y + pos.h/2); ctx.scale(s, s); ctx.translate(-(pos.x + pos.w/2), -(pos.y + pos.h/2)); }
        ctx.filter = editor.filter;
      }

      const zoom = index === 0 ? (editor.videoZoom || 1) : 1;
      const panX = index === 0 ? (editor.videoPanX || 0) : 0;
      const panY = index === 0 ? (editor.videoPanY || 0) : 0;
      const cropW = 1 / zoom;
      const cropH = 1 / zoom;
      const cropX = (1 - cropW) / 2 + (panX * (1 - cropW) / 2);
      const cropY = (1 - cropH) / 2 + (panY * (1 - cropH) / 2);
      const mainCrop = { x: cropX, y: cropY, w: cropW, h: cropH };

      if (editor.videoEffect === 'glitch' || editor.videoEffect === 'rgb_split') {
        if (index === 0) {
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = 'red'; ctx.globalAlpha = 0.8; drawCover(ctx, vid, pos.x + (Math.random()*10), pos.y, pos.w, pos.h, mainCrop);
          ctx.fillStyle = 'cyan'; ctx.globalAlpha = 0.8; drawCover(ctx, vid, pos.x - (Math.random()*10), pos.y, pos.w, pos.h, mainCrop);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        } else {
          drawCover(ctx, vid, pos.x, pos.y, pos.w, pos.h, mainCrop);
        }
      } else {
        if (layer.type === 'webcam') {
          ctx.scale(-1, 1); ctx.translate(-W, 0);
          drawCover(ctx, vid, W - pos.x - pos.w, pos.y, pos.w, pos.h, mainCrop);
        } else {
          drawCover(ctx, vid, pos.x, pos.y, pos.w, pos.h, mainCrop);
        }
      }
      ctx.filter = 'none'; ctx.restore();

      if (index === 0 && editor.videoEffect === 'flash' && cTime < (activeClip?.start || 0) + 0.5) { ctx.fillStyle = `rgba(255,255,255,${1 - (cTime - (activeClip?.start || 0)) * 2})`; ctx.fillRect(0, 0, W, H); }
      if (index === 0 && editor.fadeIn && cTime < (activeClip?.start || 0) + 1) { ctx.fillStyle = `rgba(0,0,0,${1 - (cTime - (activeClip?.start || 0))})`; ctx.fillRect(0, 0, W, H); }
      
      if (editor.editMode && editor.activeLayerId === layer.id) {
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 4; ctx.strokeRect(pos.x, pos.y, pos.w, pos.h);
      }
    });

    renderOverlayRef.current();
    if (overlayCanvasRef.current) ctx.drawImage(overlayCanvasRef.current, 0, 0);

    if (editor.introEnabled && activeClip) {
      const introDur = 3.0;
      const introP = Math.min((currentTimeRef.current - activeClip.start) / introDur, 1.0);
      
      if (introP < 1.0) {
        ctx.fillStyle = `rgba(0,0,0,${1 - Math.pow(introP, 3)})`;
        ctx.fillRect(0, 0, W, H);
        
        const logo = logoImgRef.current;
        const hasLogo = logo.src && logo.complete;
        const lSize = 200;
        const cx = W / 2;
        const cy = H / 2;
        
        ctx.save();
        if (editor.introStyle === 'glitch_reveal') {
          let jitter = (1 - introP) * 40;
          ctx.globalAlpha = Math.min(introP * 3, 1);
          if (hasLogo) {
            ctx.globalCompositeOperation = 'screen';
            ctx.drawImage(logo, cx - lSize/2 + jitter, cy - lSize/2, lSize, lSize);
            ctx.drawImage(logo, cx - lSize/2 - jitter, cy - lSize/2, lSize, lSize);
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; 
            ctx.drawImage(logo, cx - lSize/2, cy - lSize/2, lSize, lSize);
          } else {
            drawZokaLogo(ctx, cx + jitter, cy, lSize/2, 'red');
            drawZokaLogo(ctx, cx - jitter, cy, lSize/2, 'cyan');
            drawZokaLogo(ctx, cx, cy, lSize/2, '#fff');
          }
        } else if (editor.introStyle === 'neon_pulse') {
          let pulse = Math.sin(introP * Math.PI * 6) * 0.5 + 0.5;
          ctx.shadowColor = editor.accentColor;
          ctx.shadowBlur = 40 + (pulse * 30);
          ctx.globalAlpha = Math.min(introP * 3, 1);
          if (hasLogo) ctx.drawImage(logo, cx - lSize/2, cy - lSize/2, lSize, lSize);
          else drawZokaLogo(ctx, cx, cy, lSize/2, '#fff');
          ctx.shadowBlur = 0;
        } else if (editor.introStyle === 'slide_zoom') {
          let scale = 1 + (1 - introP) * 1.5;
          let yPos = cy - (1 - introP) * 400;
          ctx.globalAlpha = Math.min(introP * 3, 1);
          if (hasLogo) ctx.drawImage(logo, cx - (lSize*scale)/2, yPos - (lSize*scale)/2, lSize*scale, lSize*scale);
          else drawZokaLogo(ctx, cx, yPos, (lSize/2)*scale, '#fff');
        }
        ctx.restore();
      }
    }

    if (ui.isExporting && exportCanvasRef.current) {
      const eCtx = exportCanvasRef.current.getContext('2d');
      eCtx.imageSmoothingEnabled = true;
      eCtx.imageSmoothingQuality = 'high';
      eCtx.drawImage(canvas, 0, 0, 1080, 1920);
    }
  };

  useEffect(() => {
    let aF; const l = () => { drawFrameRef.current(); aF = requestAnimationFrame(l); };
    aF = requestAnimationFrame(l); return () => cancelAnimationFrame(aF);
  }, []);

  const getCanvasCoords = (e) => {
    const r = canvasRef.current.getBoundingClientRect(); 
    const sx = 720 / r.width, sy = 1280 / r.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
  };

  const handlePointerDown = (e) => {
    if (!editor.editMode) return;
    const { x, y } = getCanvasCoords(e);
    
    for (let i = media.layers.length - 1; i >= 0; i--) {
      const layer = media.layers[i];
      const pos = getLayerPos(activeTemplate, layer, i, editor.editMode);
      if (x >= pos.x && x <= pos.x + pos.w && y >= pos.y && y <= pos.y + pos.h) {
        dragRef.current = { target: 'layer', layerId: layer.id, offsetX: x - pos.x, offsetY: y - pos.y };
        dispatch({ type: 'SET_EDITOR', payload: { activeLayerId: layer.id } });
        return;
      }
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.target) return; 
    e.preventDefault(); 
    const { x, y } = getCanvasCoords(e); 
    
    if (dragRef.current.target === 'layer') { 
      const { layerId, offsetX, offsetY } = dragRef.current;
      const layer = media.layers.find(l => l.id === layerId);
      if (!layer) return;
      
      const currentPos = getLayerPos(activeTemplate, layer, media.layers.indexOf(layer), editor.editMode);
      let nX = Math.max(0, Math.min(x - offsetX, 720 - currentPos.w));
      let nY = Math.max(0, Math.min(y - offsetY, 1280 - currentPos.h));
      
      const newLayers = media.layers.map(l => l.id === layerId ? { ...l, customPos: { ...currentPos, x: nX, y: nY } } : l);
      dispatch({ type: 'SET_MEDIA', payload: { layers: newLayers } }); 
    }
  };

  const handlePointerUp = () => dragRef.current.target = null;

  const handleExportVideo = async (format = 'mp4', fps = 30) => {
    const mainVid = videoRefs.current[media.layers[0]?.id];
    if (!canvasRef.current || ui.isExporting || !mainVid || !activeClip) return;
    
    const exportC = document.createElement('canvas');
    exportC.width = 1080;
    exportC.height = 1920;
    exportCanvasRef.current = exportC;
    
    dispatch({ type: 'SET_UI', payload: { isExporting: true, exportFormat: format, exportFps: fps } });
    dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: false } });
    mainVid.pause(); mainVid.currentTime = activeClip.start;
    await new Promise(r => setTimeout(r, 200));
    
    let trueDur = mainVid.duration; 
    if (!isFinite(trueDur)) { mainVid.currentTime = 1e101; await new Promise(r => setTimeout(r, 200)); trueDur = mainVid.duration; mainVid.currentTime = activeClip.start; await new Promise(r => setTimeout(r, 200)); }
    let end = activeClip.end && isFinite(activeClip.end) ? activeClip.end : trueDur; 
    if (end > trueDur) end = trueDur;
    if (activeClip.start >= end - 0.1) { 
      alert("Invalid clip duration."); 
      dispatch({ type: 'SET_UI', payload: { isExporting: false, exportFormat: null, exportFps: null } }); 
      exportCanvasRef.current = null;
      return; 
    }
    
    await new Promise(r => setTimeout(r, 300));
    const wM = mainVid.muted, wV = mainVid.volume; mainVid.muted = false; mainVid.volume = 0;
    
    const cS = exportC.captureStream(fps); 
    let aC;
    try {
      aC = new (window.AudioContext || window.webkitAudioContext)(); 
      if (aC.state === 'suspended') await aC.resume();
      const aD = aC.createMediaStreamDestination(); 
      let hA = false;
      
      if (streamRef.current && streamRef.current.getAudioTracks().length > 0) { 
        aC.createMediaStreamSource(new MediaStream(streamRef.current.getAudioTracks())).connect(aD); hA = true; 
      }
      if (mainVid.captureStream) { 
        try { const vS = mainVid.captureStream(); if (vS.getAudioTracks().length > 0) { aC.createMediaStreamSource(vS).connect(aD); hA = true; } } catch {} 
      }
      if (audioRef.current.src) { 
        try { 
          audioRef.current.play(); 
          const aS = audioRef.current.captureStream ? audioRef.current.captureStream() : audioRef.current.mozCaptureStream(); 
          if (aS.getAudioTracks().length > 0) { aC.createMediaStreamSource(aS).connect(aD); hA = true; } 
        } catch {} 
      }
      const o = aC.createOscillator(); const g = aC.createGain(); g.gain.value = 0.0; o.connect(g); g.connect(aD); g.connect(aC.destination); o.start();
      aD.stream.getAudioTracks().forEach(t => cS.addTrack(t));
    } catch(e) {}

    chunksRef.current = [];
    let mT = 'video/webm';
    let fileExt = 'webm';

    if (format === 'mp4') {
      const mp4Codecs = ['video/mp4;codecs=avc1.640029,mp4a.40.2', 'video/mp4;codecs=h264', 'video/mp4'];
      mT = mp4Codecs.find(c => MediaRecorder.isTypeSupported(c));
      if (mT) { fileExt = 'mp4'; } 
      else {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) { mT = 'video/webm;codecs=h264'; fileExt = 'webm'; alert("⚠️ Browser restricts .mp4. Exporting as H.264 .webm."); } 
        else { mT = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8'; fileExt = 'webm'; alert("⚠️ Browser restricts .mp4. Exporting as .webm."); }
      }
    } else {
      mT = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
      fileExt = 'webm';
    }

    const bitrate = fps === 60 ? 15000000 : 10000000;
    const r = new MediaRecorder(cS, { mimeType: mT, videoBitsPerSecond: bitrate });
    
    r.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    r.onstop = async () => { 
      let b = new Blob(chunksRef.current, { type: mT }); 
      if (fileExt === 'webm') { b = await fixWebmDuration(b, (end - activeClip.start) * 1000); }
      dispatch({ type: 'SET_UI', payload: { recordedUrl: URL.createObjectURL(b), recordedExt: fileExt, isExporting: false, exportFormat: null, exportFps: null } }); 
      mainVid.pause(); 
      if (audioRef.current) audioRef.current.pause(); 
      mainVid.muted = wM; mainVid.volume = wV; 
      cS.getTracks().forEach(t => t.stop()); 
      if (aC) aC.close(); 
      exportCanvasRef.current = null; 
    };
    
    const cI = setInterval(() => { 
      if (mainVid.currentTime >= end - 0.05 || mainVid.ended) { 
        clearInterval(cI); 
        if (r.state !== 'inactive') r.stop(); 
      } 
    }, 50);
    
    r.start(100); 
    try { 
      mainVid.play(); 
      media.layers.forEach((layer, idx) => {
        if (idx > 0) {
          const vid = videoRefs.current[layer.id];
          if (vid) vid.play();
        }
      });
    } catch {}
  };

  const applyTemplate = (id) => {
    const t = templateMap[id];
    if (!t) return; 
    dispatch({ type: 'SET_EDITOR', payload: { templateId: id, editMode: false } });
    dispatch({ type: 'SET_UI', payload: { activePanel: null } });
    const nR = [id, ...ui.recents.filter(r => r !== id)].slice(0, 5);
    localStorage.setItem("reactor-recents", JSON.stringify(nR));
    dispatch({ type: 'SET_UI', payload: { recents: nR } });
  };

  const toggleFavorite = (id) => {
    const n = ui.favorites.includes(id) ? ui.favorites.filter(x => x !== id) : [...ui.favorites, id];
    localStorage.setItem("reactor-favorites", JSON.stringify(n));
    dispatch({ type: 'SET_UI', payload: { favorites: n } });
  };

  const filteredTemplates = useMemo(() => {
    let l = TEMPLATES;
    if (ui.activeCategory === "Favorites") l = l.filter(t => ui.favorites.includes(t.id));
    else if (ui.activeCategory !== "All") l = l.filter(t => t.category === ui.activeCategory);
    if (ui.searchQuery) { const q = ui.searchQuery.toLowerCase(); l = l.filter(t => t.title.toLowerCase().includes(q) || (t.tags && t.tags.some(tg => tg.includes(q)))); }
    return l;
  }, [ui.activeCategory, ui.searchQuery, ui.favorites]);

  return (
    <div className="rs-container" style={{ position: 'fixed', inset: 0, background: '#0a0d14', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <input type="file" ref={el => fileInputRefs.current.video = el} onChange={handleImport} accept="video/*" multiple style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.image = el} onChange={(e) => handleImportAsset(e, 'image')} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.logo = el} onChange={(e) => handleImportAsset(e, 'logo')} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.audio = el} onChange={(e) => handleImportAsset(e, 'audio')} accept="audio/*" style={{ display: 'none' }} />

      {/* Hidden Dynamic Video Elements */}
      {media.layers.map((layer, idx) => (
        <video 
          key={layer.id} 
          ref={el => { if (el) videoRefs.current[layer.id] = el; }}
          src={layer.src || undefined}
          style={{ position: 'fixed', bottom: '2px', right: '2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} 
          playsInline 
          muted={idx !== 0 || editor.isMuted} 
          loop={idx !== 0}
          preload="auto" 
        />
      ))}
      <audio ref={audioRef} style={{ display: 'none' }} />

      {/* Top Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 20, background: 'linear-gradient(to bottom, rgba(10,13,20,0.9), transparent)' }}>
        <button onClick={() => navigate('/studio')} style={{ background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '8px', padding: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}><ArrowLeft size={16} /> Exit</button>
        <h1 style={{ fontSize: '14px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}><Cpu size={16} color="#10b981" /> Reactor Pro</h1>
        {ui.recordedUrl ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => dispatch({ type: 'SET_UI', payload: { recordedUrl: null } })} style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><Trash2 size={14} /> Discard</button>
            <a href={ui.recordedUrl} download={`zokascore_clip.${ui.recordedExt || 'webm'}`} style={{ background: '#10b981', border: 'none', color: '#0a0d14', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}><Download size={14} /> Save</a>
          </div>
        ) : (
          <button onClick={() => handleExportVideo('mp4', 30)} disabled={!media.sourceLoaded || ui.isExporting} style={{ background: media.sourceLoaded ? '#10b981' : '#151b26', border: 'none', color: media.sourceLoaded ? '#0a0d14' : '#64748b', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
            {ui.isExporting ? <Loader size={14} className="animate-spin" /> : <Download size={14} />} Export
          </button>
        )}
      </div>

      {/* Main Canvas Area - Never compressed */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <div 
          style={{ position: 'relative', height: '100%', aspectRatio: '9/16', maxWidth: '100%', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}
          onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
        >
          <canvas ref={canvasRef} width={720} height={1280} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {!media.sourceLoaded && !ui.recordedUrl && (
            <div onClick={() => fileInputRefs.current.video?.click()} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0d14', cursor: 'pointer' }}>
              <Upload size={40} style={{ marginBottom: '12px', color: '#10b981' }} /><p style={{ fontWeight: 700, color: '#fff' }}>Import Main Video</p>
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Add up to 10 layers</p>
            </div>
          )}
          {ui.recordedUrl && <video src={ui.recordedUrl} controls autoPlay loop style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />}
          {ui.isExporting && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' }}><Loader size={24} className="animate-spin" color="#10b981" /><span style={{ color: '#10b981', marginLeft: '8px', fontWeight: 700 }}>EXPORTING...</span></div>}
        </div>
      </div>

      {/* Right Side Toolbar (TikTok Style) */}
      {!ui.isExporting && !ui.recordedUrl && (
        <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 15 }}>
          <button onClick={() => fileInputRefs.current.video?.click()} title="Add Video" style={{ background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Upload size={18} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'templates' ? null : 'templates' } })} title="Templates" style={{ background: ui.activePanel === 'templates' ? '#10b981' : '#151b26', border: '1px solid #1e293b', color: ui.activePanel === 'templates' ? '#0a0d14' : '#fff', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LayoutGrid size={18} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'layers' ? null : 'layers' } })} title="Layers & Edit" style={{ background: ui.activePanel === 'layers' ? '#10b981' : '#151b26', border: '1px solid #1e293b', color: ui.activePanel === 'layers' ? '#0a0d14' : '#fff', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Layers size={18} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'text' ? null : 'text' } })} title="Text & Fonts" style={{ background: ui.activePanel === 'text' ? '#10b981' : '#151b26', border: '1px solid #1e293b', color: ui.activePanel === 'text' ? '#0a0d14' : '#fff', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Type size={18} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'effects' ? null : 'effects' } })} title="Effects" style={{ background: ui.activePanel === 'effects' ? '#10b981' : '#151b26', border: '1px solid #1e293b', color: ui.activePanel === 'effects' ? '#0a0d14' : '#fff', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Wand2 size={18} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'audio' ? null : 'audio' } })} title="Audio" style={{ background: ui.activePanel === 'audio' ? '#10b981' : '#151b26', border: '1px solid #1e293b', color: ui.activePanel === 'audio' ? '#0a0d14' : '#fff', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={18} /></button>
          <button onClick={() => fileInputRefs.current.image?.click()} title="Avatar" style={{ background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={18} /></button>
          <button onClick={startCamera} title="Webcam" style={{ background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Camera size={18} /></button>
        </div>
      )}

      {/* Bottom Timeline & Controls */}
      {media.sourceLoaded && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px', background: 'linear-gradient(to top, rgba(10,13,20,0.95), transparent)', zIndex: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '12px' }}>
            <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { isMuted: !editor.isMuted } })} style={{ background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Volume2 size={18} /></button>
            <button onClick={togglePreview} style={{ background: '#10b981', border: 'none', color: '#0a0d14', borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {timeline.isPlaying ? <Pause size={28} fill="#0a0d14" /> : <Play size={28} fill="#0a0d14" />}
            </button>
            <button onClick={handleSplit} style={{ background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Scissors size={16} /></button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
            <span>0s</span>
            <span>{timeline.currentTime.toFixed(1)}s / {timeline.duration.toFixed(1)}s</span>
          </div>
          <div style={{ position: 'relative', height: '32px', background: '#151b26', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
            {timeline.clips.map((c, idx) => {
              const dur = timeline.duration || 1;
              const wPct = ((c.end - c.start) / dur) * 100;
              const lPct = (c.start / dur) * 100;
              const isAct = c.id === timeline.activeClipId;
              return (
                <div key={c.id} onClick={() => { dispatch({ type: 'SET_TIMELINE', payload: { activeClipId: c.id } }); if (videoRefs.current[media.layers[0]?.id]) videoRefs.current[media.layers[0].id].currentTime = c.start; }}
                  style={{ position: 'absolute', left: `${lPct}%`, width: `${wPct}%`, height: '100%', background: isAct ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)', borderLeft: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#fff' }}>{idx+1}</span>
                </div>
              );
            })}
            <div style={{ position: 'absolute', left: `${(timeline.currentTime / (timeline.duration || 1)) * 100}%`, top: 0, bottom: 0, width: '2px', background: '#fff', pointerEvents: 'none' }}></div>
          </div>
        </div>
      )}

      {/* Sliding Control Panel */}
      {ui.activePanel && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '300px', maxWidth: '85vw', background: '#0a0d14', borderLeft: '1px solid #1e293b', zIndex: 30, padding: '60px 16px 16px', overflowY: 'auto', animation: 'slideInRight 0.2s ease-out' }}>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: null } })} style={{ position: 'absolute', top: '12px', right: '12px', background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '8px', padding: '6px' }}><X size={16} /></button>
          
          {ui.activePanel === 'templates' && (
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><LayoutGrid size={14} color="#10b981" /> Templates</h3>
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '12px', paddingBottom: '4px' }}>
                {["All", "Favorites", "Pro", "Split", "Grid", "Social", "Football"].map(cat => <button key={cat} onClick={() => dispatch({ type: 'SET_UI', payload: { activeCategory: cat } })} style={{ whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: ui.activeCategory === cat ? '#10b981' : '#151b26', color: ui.activeCategory === cat ? '#0a0d14' : '#fff', border: '1px solid #1e293b' }}>{cat}</button>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {filteredTemplates.map(t => (
                  <div key={t.id} onClick={() => applyTemplate(t.id)} style={{ cursor: 'pointer', border: editor.templateId === t.id ? '2px solid #10b981' : '1px solid #151b26', borderRadius: '8px', overflow: 'hidden', background: '#151b26' }}>
                    <div style={{ height: '100px', background: t.preview.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {t.layout === 'single' && <div style={{ width: '30px', height: '30px', background: '#fff', borderRadius: '4px' }}></div>}
                      {t.layout === 'split_lr' && <div style={{ display: 'flex', width: '100%', height: '100%' }}><div style={{ flex: 1, background: '#fff' }}></div><div style={{ flex: 1, background: '#aaa' }}></div></div>}
                      {t.layout === 'split_tb' && <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}><div style={{ flex: 1, background: '#fff' }}></div><div style={{ flex: 1, background: '#aaa' }}></div></div>}
                      {t.layout && t.layout.startsWith('react_') && <div style={{ position: 'relative', width: '100%', height: '100%' }}><div style={{ position: 'absolute', inset: 0, background: '#fff' }}></div><div style={{ position: 'absolute', top: t.layout.includes('t') ? '5px' : 'auto', bottom: t.layout.includes('b') ? '5px' : 'auto', left: t.layout.includes('l') ? '5px' : 'auto', right: t.layout.includes('r') ? '5px' : 'auto', width: '20px', height: '20px', background: '#10b981', borderRadius: '4px' }}></div></div>}
                      {t.layout === 'grid_2x2' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', height: '100%' }}><div style={{ background: '#fff' }}></div><div style={{ background: '#aaa' }}></div><div style={{ background: '#aaa' }}></div><div style={{ background: '#fff' }}></div></div>}
                    </div>
                    <div style={{ padding: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: '#fff', fontWeight: 600 }}>{t.title}</span>
                      <button onClick={(e) => { e.stopPropagation(); toggleFavorite(t.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Star size={12} color={ui.favorites.includes(t.id) ? '#f59e0b' : '#64748b'} fill={ui.favorites.includes(t.id) ? '#f59e0b' : 'none'} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ui.activePanel === 'layers' && (
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={14} color="#10b981" /> Layers ({media.layers.length}/10)</h3>
              {media.layers.map((l, i) => (
                <div key={l.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { activeLayerId: l.id } })} style={{ padding: '8px', borderRadius: '6px', background: editor.activeLayerId === l.id ? '#151b26' : '#0a0d14', border: editor.activeLayerId === l.id ? '1px solid #10b981' : '1px solid #151b26', marginBottom: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>Layer {i+1}: {l.name}</span>
                  {i > 0 && <button onClick={(e) => { e.stopPropagation(); const nL = media.layers.filter(x => x.id !== l.id); dispatch({ type: 'SET_MEDIA', payload: { layers: nL } }); }} style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: '4px', padding: '2px 4px' }}><X size={10} /></button>}
                </div>
              ))}
              
              <div style={{ marginTop: '20px', padding: '12px', background: '#151b26', borderRadius: '8px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Free Edit Mode</h4>
                <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { editMode: !editor.editMode } })} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: editor.editMode ? '#10b981' : '#0a0d14', color: editor.editMode ? '#0a0d14' : '#fff', border: '1px solid #1e293b', fontWeight: 700, fontSize: '12px' }}>
                  {editor.editMode ? 'DRAGGING ENABLED' : 'ENABLE FREE DRAG'}
                </button>
              </div>

              {media.sourceLoaded && (
                <div style={{ marginTop: '20px', padding: '12px', background: '#151b26', borderRadius: '8px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Main Video Zoom</h4>
                  <label style={{ fontSize: '10px', color: '#94a3b8' }}>Zoom: {editor.videoZoom.toFixed(1)}x</label>
                  <input type="range" min="1" max="4" step="0.1" value={editor.videoZoom} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoZoom: parseFloat(e.target.value) } })} style={{ width: '100%', accentColor: '#10b981' }} />
                  <label style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px', display: 'block' }}>Pan X: {editor.videoPanX.toFixed(1)}</label>
                  <input type="range" min="-1" max="1" step="0.1" value={editor.videoPanX} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoPanX: parseFloat(e.target.value) } })} style={{ width: '100%', accentColor: '#10b981' }} />
                  <label style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px', display: 'block' }}>Pan Y: {editor.videoPanY.toFixed(1)}</label>
                  <input type="range" min="-1" max="1" step="0.1" value={editor.videoPanY} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoPanY: parseFloat(e.target.value) } })} style={{ width: '100%', accentColor: '#10b981' }} />
                </div>
              )}
            </div>
          )}

          {ui.activePanel === 'text' && (
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Type size={14} color="#10b981" /> Text & Fonts</h3>
              <input type="text" value={editor.displayName} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { displayName: e.target.value } })} placeholder="Display Name" style={{ width: '100%', background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '6px', padding: '8px', marginBottom: '8px', fontSize: '12px' }} />
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <input type="color" value={editor.nameColor} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { nameColor: e.target.value } })} style={{ width: '40px', height: '36px', background: '#151b26', border: '1px solid #1e293b', borderRadius: '6px', padding: '2px' }} />
                <input type="number" value={editor.nameSize || ''} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { nameSize: e.target.value ? parseInt(e.target.value) : null } })} placeholder="Size" style={{ flex: 1, background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '6px', padding: '8px', fontSize: '12px' }} />
                <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { showVerified: !editor.showVerified } })} style={{ background: editor.showVerified ? '#1d9bf0' : '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '6px', width: '36px' }}><BadgeCheck size={16} /></button>
              </div>
              <input type="text" value={editor.username} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { username: e.target.value } })} placeholder="@username" style={{ width: '100%', background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '6px', padding: '8px', marginBottom: '8px', fontSize: '12px' }} />
              <textarea value={editor.povCaption} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { povCaption: e.target.value } })} placeholder="Caption" style={{ width: '100%', background: '#151b26', border: '1px solid #1e293b', color: '#fff', borderRadius: '6px', padding: '8px', marginBottom: '8px', fontSize: '12px', minHeight: '60px', resize: 'none' }} />
              
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Brand Colors</h4>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {BRAND_PRESETS.map(p => <button key={p.name} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { accentColor: p.color } })} style={{ width: '28px', height: '28px', borderRadius: '50%', background: p.color, border: editor.accentColor === p.color ? '2px solid #fff' : '2px solid #151b26', cursor: 'pointer' }}></button>)}
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Fonts</h4>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {Object.keys(FONT_PACKS).map(f => <button key={f} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { fontPack: f } })} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: editor.fontPack === f ? '#10b981' : '#151b26', color: editor.fontPack === f ? '#0a0d14' : '#fff', border: '1px solid #1e293b' }}>{f}</button>)}
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Caption Animation</h4>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {TEXT_ANIMATIONS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { textAnimation: f.id } })} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: editor.textAnimation === f.id ? '#10b981' : '#151b26', color: editor.textAnimation === f.id ? '#0a0d14' : '#fff', border: '1px solid #1e293b' }}>{f.name}</button>)}
                </div>
              </div>
            </div>
          )}

          {ui.activePanel === 'effects' && (
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Wand2 size={14} color="#10b981" /> Effects</h3>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {VIDEO_EFFECTS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { videoEffect: f.id } })} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: editor.videoEffect === f.id ? '#10b981' : '#151b26', color: editor.videoEffect === f.id ? '#0a0d14' : '#fff', border: '1px solid #1e293b' }}>{f.name}</button>)}
              </div>
              
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Filters</h4>
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '16px' }}>
                {FILTERS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { filter: f.id } })} style={{ whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: editor.filter === f.id ? '#10b981' : '#151b26', color: editor.filter === f.id ? '#0a0d14' : '#fff', border: '1px solid #1e293b' }}>{f.name}</button>)}
              </div>

              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Cinematic Intro</h4>
              <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introEnabled: !editor.introEnabled } })} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: editor.introEnabled ? '#10b981' : '#151b26', color: editor.introEnabled ? '#0a0d14' : '#fff', border: '1px solid #1e293b', fontWeight: 700, fontSize: '12px', marginBottom: '8px' }}>
                {editor.introEnabled ? 'INTRO ENABLED' : 'ENABLE INTRO'}
              </button>
              {editor.introEnabled && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {INTRO_STYLES.map(s => <button key={s.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introStyle: s.id } })} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: editor.introStyle === s.id ? '#10b981' : '#151b26', color: editor.introStyle === s.id ? '#0a0d14' : '#fff', border: '1px solid #1e293b' }}>{s.name}</button>)}
                </div>
              )}
            </div>
          )}

          {ui.activePanel === 'audio' && (
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Music size={14} color="#10b981" /> Audio Controls</h3>
              <button onClick={() => fileInputRefs.current.audio?.click()} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#151b26', color: '#fff', border: '1px solid #1e293b', fontWeight: 700, fontSize: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Music size={14} /> {media.audioName ? 'Change Audio' : 'Import Audio Track'}
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { isMuted: !editor.isMuted } })} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: '#151b26', color: '#fff', border: '1px solid #1e293b', fontWeight: 700, fontSize: '12px' }}>
                  {editor.isMuted ? 'Muted' : 'Audio On'}
                </button>
                <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { fadeIn: !editor.fadeIn } })} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: editor.fadeIn ? '#10b981' : '#151b26', color: editor.fadeIn ? '#0a0d14' : '#fff', border: '1px solid #1e293b', fontWeight: 700, fontSize: '12px' }}>
                  Fade In: {editor.fadeIn ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}