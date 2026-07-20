// src/studio/pages/ReactorStudio.jsx
import React, { useReducer, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Download, Upload, Camera, Music, User, Volume2, VolumeX, 
  Sliders, Move, Palette, Search, Star, LayoutGrid, Layers, Type, Grid3x3, X, Film, Shield, Play, Pause, Loader, Trash2, BadgeCheck, Sparkles, Eraser, Scissors, Cpu, Image as ImageIcon, Crop
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
  if (tsSize === 3) timecodeScale = (view.getUint8(timecodeOffset + 4) << 16) | (view.getUint8(timecodeOffset + 5) << 8) | view.getUint8(timecodeOffset + 6);
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
  // === PRO CINEMATIC PRESETS ===
  { id: 'pro_aura', title: 'Pro: Aura Maximus', category: 'Pro', tags: ['viral', 'cinematic', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #000, #333)', layout: 'pro'} },
  { id: 'pro_goal', title: 'Pro: Goal Machine', category: 'Pro', tags: ['viral', 'goal', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #dc2626, #000)', layout: 'pro'} },
  { id: 'pro_chills', title: 'Pro: Chill Vibes', category: 'Pro', tags: ['viral', 'chill', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #4338ca, #312e81)', layout: 'pro'} },
  { id: 'pro_skill', title: 'Pro: Skill Show', category: 'Pro', tags: ['viral', 'skill', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #065f46, #000)', layout: 'pro'} },
  { id: 'pro_news', title: 'Pro: Breaking News', category: 'Pro', tags: ['viral', 'news', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #0c4a6e, #000)', layout: 'pro'} },
  { id: 'pro_hype', title: 'Pro: Hype Beast', category: 'Pro', tags: ['viral', 'hype', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #be185d, #000)', layout: 'pro'} },
  { id: 'pro_cinematic', title: 'Pro: Cinematic Wide', category: 'Pro', tags: ['viral', 'cinematic', 'intro'], pip: false, video: {x:0,y:140,w:720,h:1000}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #111, #000)', layout: 'pro'} },
  { id: 'pro_signature', title: 'Pro: ZOKA Signature', category: 'Pro', tags: ['viral', 'zoka', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #047857, #000)', layout: 'pro'} },

  // === STANDARD TEMPLATES ===
  { id: 'social_pro', title: 'TikTok POV (Exact Match)', category: 'TikTok', tags: ['viral', 'pov', 'exact'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:70,r:35,ring:'accent'}, nameEl: {x:100,y:60,size:30,color:'#fff'}, handleEl: {x:100,y:92,size:24,color:'#aaa'}, caption: {x:50,y:150,size:26,maxW:620,align:'left',color:'#fff'}, topGradient:350, bottomGradient:200, preview: {bg: 'linear-gradient(to bottom, #1e293b, #0f172a)', layout: 'pov'} },
  { id: 'tiktok_frame', title: 'TikTok Framed (Color)', category: 'TikTok', tags: ['viral', 'frame', 'pov'], pip: false, video: {x:40,y:250,w:640,h:900,border:'#000'}, profile: {x:60,y:60,r:30,ring:'#fff'}, nameEl: {x:110,y:50,size:24,color:'#fff'}, handleEl: {x:110,y:80,size:20,color:'#000'}, caption: {x:60,y:150,size:28,color:'#fff',maxW:600,align:'left'}, bg:'accent', preview: {bg: '#f97316', layout: 'pov'} },
  { id: 'custom', title: 'Custom Studio', category: 'Pro', tags: ['drag', 'resize'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:360,y:640,r:50,ring:'accent'}, username: {x:360,y:720,size:32,center:true,badge:true,badgeColor:'accent'}, caption: {x:360,y:400,size:28,maxW:600,center:true}, bg:'#000', isCustom: true, preview: {bg: '#000', layout: 'custom'} },
  { id: 'tiktok_tl', title: 'TikTok Top Left', category: 'TikTok', tags: ['viral', 'duet'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:60,r:35,ring:'accent'}, username: {x:100,y:55,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:120,size:24,maxW:680,align:'left'}, topGradient:350, bottomGradient:200, preview: {bg: '#111', layout: 'tl'} },
  { id: 'yt_shorts', title: 'YT Shorts Standard', category: 'YouTube', tags: ['shorts', 'viral'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:60,r:35,ring:'accent'}, username: {x:100,y:55,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:120,size:24,maxW:680,align:'left'}, topGradient:350, bottomGradient:200, preview: {bg: '#0f0f0f', layout: 'tl'} },
  { id: 'yt_mrbeast', title: 'YT MrBeast Style', category: 'YouTube', tags: ['mrbeast', 'viral'], pip: false, video: {x:0,y:0,w:720,h:1280}, caption: {x:360,y:1100,size:60,maxW:680,center:true,color:'#fff'}, bg:'#000', preview: {bg: '#0f0f0f', layout: 'center'} },
  { id: 'neon_pink', title: 'Neon Pink Glow', category: 'Gaming', tags: ['cyberpunk', 'twitch'], pip: false, video: {x:60,y:100,w:600,h:900,glow:'#ec4899'}, profile: {x:360,y:1150,r:35,ring:'#ec4899'}, username: {x:360,y:1220,size:28,center:true,badge:true,badgeColor:'#ec4899'}, caption: {x:360,y:1050,size:28,maxW:600,center:true}, bg:'#0a0f1a', preview: {bg: '#0a0f1a', layout: 'center'} },
  { id: 'news_red', title: 'Football Breaking', category: 'Football', tags: ['news', 'match'], pip: true, video: {x:0,y:100,w:720,h:1080}, caption: {x:360,y:60,size:32,color:'#fff',maxW:680,center:true}, header: {h:100,bg:'#dc2626',text:'BREAKING NEWS',y:45,size:36}, ticker: {h:100,bg:'#111827',y:1230,size:28}, bg:'#000', preview: {bg: '#dc2626', layout: 'news'} },
  { id: 'min_dark', title: 'Minimal Dark', category: 'Minimal', tags: ['dark', 'clean'], pip: false, video: {x:0,y:0,w:720,h:1280}, caption: {x:360,y:1200,size:32,maxW:680,center:true,color:'#fff'}, bg:'#000', preview: {bg: '#000', layout: 'center'} },
];

const FONT_PACKS = {
  TikTok: { name: 'Arial, sans-serif', weight: 'bold' },
  Modern: { name: 'Inter, sans-serif', weight: '600' },
  Luxury: { name: 'Georgia, serif', weight: 'bold' },
  Gaming: { name: 'Courier New, monospace', weight: 'bold' }
};

const BRAND_PRESETS = [
  { name: 'ZOKA', color: '#10b981' }, { name: 'Twitter', color: '#1d9bf0' }, 
  { name: 'TikTok', color: '#ec4899' }, { name: 'Twitch', color: '#9146ff' }, 
  { name: 'Gold', color: '#f59e0b' }, { name: 'Orange', color: '#f97316' }
];

const FILTERS = [
  { id: 'none', name: 'Normal' }, { id: 'saturate(2) contrast(1.3)', name: 'Vivid' },
  { id: 'grayscale(1) contrast(1.2)', name: 'B&W' }, { id: 'sepia(0.8) contrast(1.1) brightness(0.9)', name: 'Retro' },
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
  { id: 'slide_up', name: 'Slide Up' }, { id: 'type_writer', name: 'Typewriter' }
];

const INTRO_STYLES = [
  { id: 'glitch_reveal', name: 'Glitch Reveal' },
  { id: 'neon_pulse', name: 'Neon Pulse' },
  { id: 'slide_zoom', name: 'Slide Zoom' }
];

// --- 2. REDUCER STATE MANAGEMENT ---
const initialState = {
  media: { sourceLoaded: false, brollLoaded: false, cameraOn: false, profileSrc: null, logoSrc: null, audioName: '' },
  editor: {
    templateId: 'pro_aura', displayName: 'Manu', username: 'manuel_palmer', povCaption: 'POV: You just witnessed greatness 🔥',
    accentColor: '#10b981', fontPack: 'TikTok', nameColor: '#ffffff', nameSize: null, captionColor: '#ffffff', captionSize: null,
    showVerified: true, editMode: false, videoEffect: 'none', textAnimation: 'none', homeLogoUrl: '', awayLogoUrl: '', homeScore: 0, awayScore: 0,
    isMuted: false, filter: 'none', fadeIn: false, pipPos: { x: 450, y: 800, w: 280, h: 380 }, profilePos: { x: 50, y: 70, r: 35 },
    introEnabled: true, introStyle: 'glitch_reveal', introWatermark: true,
    videoZoom: 1, videoPanX: 0, videoPanY: 0 // NEW: Crop & Zoom State
  },
  timeline: { clips: [{ id: 'clip1', start: 0, end: 0 }], activeClipId: 'clip1', duration: 0, currentTime: 0, isPlaying: false },
  ui: { showGallery: false, showGuides: false, isExporting: false, recordedUrl: null, isLoadingProject: true,
        favorites: JSON.parse(localStorage.getItem("reactor-favorites")) || [], recents: JSON.parse(localStorage.getItem("reactor-recents")) || [],
        searchQuery: "", activeCategory: "All", layers: { video: true, pip: true, profile: true, caption: true, gradients: true, scorebug: true } }
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
  const [state, dispatch] = useReducer(studioReducer, initialState);
  
  const sourceVideoRef = useRef(null);
  const brollVideoRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(document.createElement('canvas')); // Off-screen cache
  const fileInputRefs = useRef({ video: null, broll: null, image: null, audio: null, logo: null });
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const dragRef = useRef({ target: null, offsetX: 0, offsetY: 0 });
  const timelineDragRef = useRef(null);
  const profileImgRef = useRef(new Image());
  const logoImgRef = useRef(new Image());
  const homeLogoRef = useRef(new Image());
  const awayLogoRef = useRef(new Image());

  const { media, editor, timeline, ui } = state;
  const templateMap = useMemo(() => Object.fromEntries(TEMPLATES.map(t => [t.id, t])), []);
  const activeTemplate = templateMap[editor.templateId];
  const activeClip = useMemo(() => timeline.clips.find(c => c.id === timeline.activeClipId) || timeline.clips[0], [timeline.clips, timeline.activeClipId]);

  useEffect(() => {
    const load = async () => {
      const saved = JSON.parse(localStorage.getItem('reactor-project-state') || '{}');
      if (saved.editor) dispatch({ type: 'SET_EDITOR', payload: saved.editor });
      if (saved.timeline) dispatch({ type: 'SET_TIMELINE', payload: saved.timeline });
      
      try {
        const vBlob = await idbGet('main_video');
        if (vBlob && sourceVideoRef.current) {
          sourceVideoRef.current.src = URL.createObjectURL(vBlob);
          sourceVideoRef.current.muted = true;
          sourceVideoRef.current.onloadedmetadata = () => {
            const dur = sourceVideoRef.current.duration;
            dispatch({ type: 'SET_MEDIA', payload: { sourceLoaded: true } });
            dispatch({ type: 'SET_TIMELINE', payload: { duration: dur, clips: saved.timeline?.clips?.length ? saved.timeline.clips : [{ id: 'clip1', start: 0, end: dur }] } });
          };
        }
        const bBlob = await idbGet('broll_video');
        if (bBlob) { brollVideoRef.current.src = URL.createObjectURL(bBlob); brollVideoRef.current.loop = true; brollVideoRef.current.muted = true; brollVideoRef.current.onloadedmetadata = () => { brollVideoRef.current.play(); dispatch({ type: 'SET_MEDIA', payload: { brollLoaded: true } }); }; }
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

  const handleImport = async (e, type) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      if (type === 'video') {
        await idbSet('main_video', file);
        sourceVideoRef.current.src = url;
        sourceVideoRef.current.muted = editor.isMuted;
        sourceVideoRef.current.onloadedmetadata = () => {
          const dur = sourceVideoRef.current.duration;
          const newClips = [{ id: `clip_${Date.now()}`, start: 0, end: dur }];
          // Reset Crop on new video
          dispatch({ type: 'SET_EDITOR', payload: { videoZoom: 1, videoPanX: 0, videoPanY: 0 } });
          dispatch({ type: 'SET_TIMELINE', payload: { duration: dur, clips: newClips, activeClipId: newClips[0].id, isPlaying: true, currentTime: 0 } });
          dispatch({ type: 'SET_MEDIA', payload: { sourceLoaded: true } });
          sourceVideoRef.current.play();
        };
      } else if (type === 'broll') {
        await idbSet('broll_video', file);
        brollVideoRef.current.src = url; brollVideoRef.current.loop = true; brollVideoRef.current.muted = true;
        brollVideoRef.current.onloadedmetadata = () => { brollVideoRef.current.play(); dispatch({ type: 'SET_MEDIA', payload: { brollLoaded: true } }); };
      } else if (type === 'image') {
        await idbSet('profile_image', file);
        const src = URL.createObjectURL(file); profileImgRef.current.src = src;
        dispatch({ type: 'SET_MEDIA', payload: { profileSrc: src } });
      } else if (type === 'logo') {
        await idbSet('logo_image', file);
        const src = URL.createObjectURL(file); logoImgRef.current.src = src;
        dispatch({ type: 'SET_MEDIA', payload: { logoSrc: src } });
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

  useEffect(() => { if (sourceVideoRef.current) sourceVideoRef.current.muted = editor.isMuted; }, [editor.isMuted]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 720, height: 1280, facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      webcamVideoRef.current.srcObject = stream; webcamVideoRef.current.play();
      dispatch({ type: 'SET_MEDIA', payload: { cameraOn: true, brollLoaded: false } });
      brollVideoRef.current.removeAttribute('src');
    } catch { alert("Camera access denied."); }
  };

  const togglePreview = () => {
    const vid = sourceVideoRef.current;
    if (!vid || !activeClip) return;
    if (timeline.isPlaying) { vid.pause(); dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: false } }); }
    else {
      if (vid.currentTime < activeClip.start || vid.currentTime >= activeClip.end - 0.1) vid.currentTime = activeClip.start;
      vid.play(); dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: true } });
    }
  };

  const handleSplit = () => {
    const vid = sourceVideoRef.current; if (!vid || !activeClip) return;
    const t = vid.currentTime;
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
    if (sourceVideoRef.current) sourceVideoRef.current.currentTime = nClips[0].start;
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

  // --- UPDATED DRAW COVER WITH CROP SUPPORT ---
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

  const drawRounded = (ctx, video, x, y, w, h, r) => {
    ctx.save(); ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.clip();
    drawCover(ctx, video, x, y, w, h); ctx.restore();
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
  const renderOverlay = useCallback(() => {
    const oc = overlayCanvasRef.current;
    const ctx = oc.getContext('2d');
    const W = 720, H = 1280;
    oc.width = W; oc.height = H;
    ctx.clearRect(0, 0, W, H);
    const font = FONT_PACKS[editor.fontPack];
    const cTime = timeline.currentTime;
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

    const p = (activeTemplate.isCustom || editor.editMode) ? editor.profilePos : activeTemplate.profile;
    if (profileImgRef.current.src && p && ui.layers.profile) {
      ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      ctx.drawImage(profileImgRef.current, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); ctx.restore();
      if (p.ring) { ctx.strokeStyle = p.ring === 'accent' ? editor.accentColor : p.ring; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 1, 0, Math.PI * 2); ctx.stroke(); }
    }

    if (activeTemplate.nameEl && activeTemplate.handleEl) {
      const n = activeTemplate.nameEl, hd = activeTemplate.handleEl;
      ctx.textAlign = n.align || 'left'; ctx.fillStyle = editor.nameColor || n.color || '#fff';
      const nS = editor.nameSize ? parseInt(editor.nameSize) : n.size; ctx.font = `${font.weight} ${nS}px ${font.name}`;
      const nx = (activeTemplate.isCustom || editor.editMode) ? p.x + p.r + 12 : n.x;
      const ny = (activeTemplate.isCustom || editor.editMode) ? p.y + 10 : n.y;
      ctx.fillText(editor.displayName, nx, ny);
      let nW = ctx.measureText(editor.displayName).width; let cX = nx + nW + 12;
      if (editor.showVerified) { drawVerifiedBadge(ctx, cX, ny - nS / 2 + 2, nS / 2.5); cX += (nS / 2.5) * 2 + 12; }
      ctx.fillStyle = hd.color || '#aaa'; ctx.font = `${hd.size}px ${font.name}`; ctx.fillText(`@${editor.username}`, cX, ny);
    } else if (activeTemplate.username || editor.editMode) {
      const u = activeTemplate.username || { size: 28, center: true };
      const ux = (activeTemplate.isCustom || editor.editMode) ? p.x : u.x;
      const uy = (activeTemplate.isCustom || editor.editMode) ? p.y + p.r + 30 : u.y;
      ctx.textAlign = (activeTemplate.isCustom || editor.editMode) ? 'center' : (u.center ? 'center' : (u.align || 'left'));
      ctx.fillStyle = editor.nameColor || u.color || '#fff';
      const uS = editor.nameSize ? parseInt(editor.nameSize) : u.size; ctx.font = `${font.weight} ${uS}px ${font.name}`;
      ctx.fillText(`@${editor.username}`, ux, uy);
      if (editor.showVerified) { let nW = ctx.measureText(editor.username).width; let bX = (activeTemplate.isCustom || editor.editMode || u.center) ? ux + nW/2 + 16 : ux + nW + 16; drawVerifiedBadge(ctx, bX, uy - uS / 2 + 2, uS / 2.5); }
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
  }, [activeTemplate, editor, ui.layers, timeline.currentTime, activeClip]);

  useEffect(() => { renderOverlay(); }, [renderOverlay]);

  // --- 4. MAIN RENDER LOOP ---
  const drawFrameRef = useRef(() => {});
  drawFrameRef.current = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 720, H = 1280;
    ctx.fillStyle = activeTemplate.bg === 'accent' ? editor.accentColor : (activeTemplate.bg || '#000');
    ctx.fillRect(0, 0, W, H);

    const sVid = sourceVideoRef.current;
    if (media.sourceLoaded && sVid) {
      if (Math.abs(sVid.currentTime - timeline.currentTime) > 0.1) dispatch({ type: 'SET_TIMELINE', payload: { currentTime: sVid.currentTime } });
      if (activeClip) {
        if (sVid.currentTime < activeClip.start) sVid.currentTime = activeClip.start;
        if (timeline.isPlaying && sVid.currentTime >= activeClip.end - 0.05) { sVid.pause(); sVid.currentTime = activeClip.start; sVid.play(); }
      }
      
      if (ui.layers.video) {
        ctx.save(); const v = activeTemplate.video;
        const cTime = sVid.currentTime;
        const aProg = activeClip ? Math.min((cTime - activeClip.start) / (activeClip.end - activeClip.start), 1) : 0;

        if (editor.videoEffect === 'zoom_in') { const s = 1 + aProg * 0.3; ctx.translate(v.x + v.w/2, v.y + v.h/2); ctx.scale(s, s); ctx.translate(-(v.x + v.w/2), -(v.y + v.h/2)); }
        else if (editor.videoEffect === 'shake') ctx.translate((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
        else if (editor.videoEffect === 'pulse') { const s = 1 + Math.sin(cTime * 8) * 0.04; ctx.translate(v.x + v.w/2, v.y + v.h/2); ctx.scale(s, s); ctx.translate(-(v.x + v.w/2), -(v.y + v.h/2)); }
        else if (editor.videoEffect === 'ken_burns') { const s = 1 + aProg * 0.15; const tx = aProg * 30; ctx.translate(v.x + v.w/2 - tx, v.y + v.h/2); ctx.scale(s, s); ctx.translate(-(v.x + v.w/2), -(v.y + v.h/2)); }

        ctx.filter = editor.filter;
        
        // Calculate Crop
        const zoom = editor.videoZoom || 1;
        const panX = editor.videoPanX || 0;
        const panY = editor.videoPanY || 0;
        const cropW = 1 / zoom;
        const cropH = 1 / zoom;
        const cropX = (1 - cropW) / 2 + (panX * (1 - cropW) / 2);
        const cropY = (1 - cropH) / 2 + (panY * (1 - cropH) / 2);
        const mainCrop = { x: cropX, y: cropY, w: cropW, h: cropH };

        if (editor.videoEffect === 'glitch' || editor.videoEffect === 'rgb_split') {
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = 'red'; ctx.globalAlpha = 0.8; drawCover(ctx, sVid, v.x + (Math.random()*10), v.y, v.w, v.h, mainCrop);
          ctx.fillStyle = 'cyan'; ctx.globalAlpha = 0.8; drawCover(ctx, sVid, v.x - (Math.random()*10), v.y, v.w, v.h, mainCrop);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        } else {
          drawCover(ctx, sVid, v.x, v.y, v.w, v.h, mainCrop);
        }
        ctx.filter = 'none'; ctx.restore();

        if (editor.videoEffect === 'flash' && cTime < (activeClip?.start || 0) + 0.5) { ctx.fillStyle = `rgba(255,255,255,${1 - (cTime - (activeClip?.start || 0)) * 2})`; ctx.fillRect(0, 0, W, H); }
        if (editor.fadeIn && cTime < (activeClip?.start || 0) + 1) { ctx.fillStyle = `rgba(0,0,0,${1 - (cTime - (activeClip?.start || 0))})`; ctx.fillRect(0, 0, W, H); }
      }
      
      const showPiP = (media.cameraOn || media.brollLoaded) && ui.layers.pip;
      const aPiPVid = media.brollLoaded ? brollVideoRef.current : webcamVideoRef.current;
      if (aPiPVid && showPiP) {
        const p = editor.pipPos; ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8);
        ctx.save(); if (!media.brollLoaded) { ctx.scale(-1, 1); ctx.translate(-W, 0); drawRounded(ctx, aPiPVid, W - p.x - p.w, p.y, p.w, p.h, 12); } else { drawRounded(ctx, aPiPVid, p.x, p.y, p.w, p.h, 12); } ctx.restore();
      }
    }
    
    if (overlayCanvasRef.current) ctx.drawImage(overlayCanvasRef.current, 0, 0);

    if (editor.introEnabled && activeClip) {
      const introDur = 3.0;
      const introP = Math.min((timeline.currentTime - activeClip.start) / introDur, 1.0);
      
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
            ctx.fillStyle = 'red'; ctx.globalAlpha = 0.5; ctx.drawImage(logo, cx - lSize/2 + jitter, cy - lSize/2, lSize, lSize);
            ctx.fillStyle = 'cyan'; ctx.globalAlpha = 0.5; ctx.drawImage(logo, cx - lSize/2 - jitter, cy - lSize/2, lSize, lSize);
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
  };

  useEffect(() => {
    let aF; const l = () => { drawFrameRef.current(); aF = requestAnimationFrame(l); };
    aF = requestAnimationFrame(l); return () => cancelAnimationFrame(aF);
  }, []);

  const getCanvasCoords = (e) => {
    const r = canvasRef.current.getBoundingClientRect(); const sx = 720 / r.width, sy = 1280 / r.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
  };

  const handlePointerDown = (e) => {
    if (!editor.editMode && !activeTemplate.isCustom && !media.brollLoaded && !media.cameraOn) return;
    const { x, y } = getCanvasCoords(e);
    if ((activeTemplate.isCustom || editor.editMode) && media.profileSrc) { if (Math.hypot(x - editor.profilePos.x, y - editor.profilePos.y) <= editor.profilePos.r) { dragRef.current = { target: 'profile', offsetX: x - editor.profilePos.x, offsetY: y - editor.profilePos.y }; return; } }
    if (media.brollLoaded || media.cameraOn) { const p = editor.pipPos; if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) dragRef.current = { target: 'pip', offsetX: x - p.x, offsetY: y - p.y }; }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.target) return; e.preventDefault(); const { x, y } = getCanvasCoords(e); const sx = [0, 360, 720];
    if (dragRef.current.target === 'pip') { let nX = Math.max(0, Math.min(x - dragRef.current.offsetX, 720 - editor.pipPos.w)); let nY = Math.max(0, Math.min(y - dragRef.current.offsetY, 1280 - editor.pipPos.h)); sx.forEach(pt => { if (Math.abs(nX - pt) < 20) nX = pt; }); dispatch({ type: 'SET_EDITOR', payload: { pipPos: { ...editor.pipPos, x: nX, y: nY } } }); }
    else if (dragRef.current.target === 'profile') { let nX = Math.max(editor.profilePos.r, Math.min(x - dragRef.current.offsetX, 720 - editor.profilePos.r)); let nY = Math.max(editor.profilePos.r, Math.min(y - dragRef.current.offsetY, 1280 - editor.profilePos.r)); dispatch({ type: 'SET_EDITOR', payload: { profilePos: { ...editor.profilePos, x: nX, y: nY } } }); }
  };

  const handlePointerUp = () => dragRef.current.target = null;

  const handleExportVideo = async () => {
    const vid = sourceVideoRef.current; if (!canvasRef.current || ui.isExporting || !vid || !activeClip) return;
    dispatch({ type: 'SET_UI', payload: { isExporting: true } });
    dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: false } });
    vid.pause(); vid.currentTime = activeClip.start;
    await new Promise(r => setTimeout(r, 200));
    let trueDur = vid.duration; if (!isFinite(trueDur)) { vid.currentTime = 1e101; await new Promise(r => setTimeout(r, 200)); trueDur = vid.duration; vid.currentTime = activeClip.start; await new Promise(r => setTimeout(r, 200)); }
    let end = activeClip.end && isFinite(activeClip.end) ? activeClip.end : trueDur; if (end > trueDur) end = trueDur;
    if (activeClip.start >= end - 0.1) { alert("Invalid clip duration."); dispatch({ type: 'SET_UI', payload: { isExporting: false } }); return; }
    await new Promise(r => setTimeout(r, 300));
    const wM = vid.muted, wV = vid.volume; vid.muted = false; vid.volume = 0;
    const fps = 30; const cS = canvasRef.current.captureStream(fps); let aC;
    try {
      aC = new (window.AudioContext || window.webkitAudioContext)(); if (aC.state === 'suspended') await aC.resume();
      const aD = aC.createMediaStreamDestination(); let hA = false;
      if (streamRef.current && streamRef.current.getAudioTracks().length > 0) { aC.createMediaStreamSource(new MediaStream(streamRef.current.getAudioTracks())).connect(aD); hA = true; }
      if (vid.captureStream) { try { const vS = vid.captureStream(); if (vS.getAudioTracks().length > 0) { aC.createMediaStreamSource(vS).connect(aD); hA = true; } } catch {} }
      if (audioRef.current.src) { try { audioRef.current.play(); const aS = audioRef.current.captureStream ? audioRef.current.captureStream() : audioRef.current.mozCaptureStream(); if (aS.getAudioTracks().length > 0) { aC.createMediaStreamSource(aS).connect(aD); hA = true; } } catch {} }
      const o = aC.createOscillator(); const g = aC.createGain(); g.gain.value = 0.0; o.connect(g); g.connect(aD); g.connect(aC.destination); o.start();
      aD.stream.getAudioTracks().forEach(t => cS.addTrack(t));
    } catch(e) {}
    chunksRef.current = [];
    const mT = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    const r = new MediaRecorder(cS, { mimeType: mT, videoBitsPerSecond: 8000000 });
    r.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    r.onstop = async () => { let b = new Blob(chunksRef.current, { type: 'video/webm' }); const f = await fixWebmDuration(b, (end - activeClip.start) * 1000); dispatch({ type: 'SET_UI', payload: { recordedUrl: URL.createObjectURL(f), isExporting: false } }); vid.pause(); if (audioRef.current) audioRef.current.pause(); vid.muted = wM; vid.volume = wV; cS.getTracks().forEach(t => t.stop()); if (aC) aC.close(); };
    const cI = setInterval(() => { if (vid.currentTime >= end - 0.05 || vid.ended) { clearInterval(cI); if (r.state !== 'inactive') r.stop(); } }, 50);
    r.start(100); try { await vid.play(); } catch {}
  };

  const applyTemplate = (id) => {
    const t = templateMap[id];
    dispatch({ type: 'SET_EDITOR', payload: { templateId: id, profilePos: t.profile ? { x: t.profile.x, y: t.profile.y, r: t.profile.r } : editor.profilePos, pipPos: { x: 450, y: 800, w: 280, h: 380 } } });
    dispatch({ type: 'SET_UI', payload: { showGallery: false } });
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
    if (ui.searchQuery) { const q = ui.searchQuery.toLowerCase(); l = l.filter(t => t.title.toLowerCase().includes(q) || t.tags.some(tg => tg.includes(q))); }
    return l;
  }, [ui.activeCategory, ui.searchQuery, ui.favorites]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0a0f1a', color: '#fff', overflow: 'hidden' }}>
      <input type="file" ref={el => fileInputRefs.current.video = el} onChange={(e) => handleImport(e, 'video')} accept="video/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.broll = el} onChange={(e) => handleImport(e, 'broll')} accept="video/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.image = el} onChange={(e) => handleImport(e, 'image')} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.logo = el} onChange={(e) => handleImport(e, 'logo')} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.audio = el} onChange={(e) => handleImport(e, 'audio')} accept="audio/*" style={{ display: 'none' }} />

      <div style={{ padding: '12px 16px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate('/studio')} style={topBtnStyle}><ArrowLeft size={18} /></button>
          <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Cpu size={18} color="#10b981" /> Reactor Studio Pro</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={handleClearProject} style={topBtnStyle} title="Clear Project"><Eraser size={16} /> Clear</button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { showGallery: true } })} style={topBtnStyle} disabled={ui.isExporting || ui.recordedUrl}><LayoutGrid size={16} /> Templates</button>
          {ui.recordedUrl ? (
            <>
              <button onClick={() => dispatch({ type: 'SET_UI', payload: { recordedUrl: null } })} style={{ ...topBtnStyle, background: '#ef4444', borderColor: '#ef4444' }}><Trash2 size={16} /> Discard</button>
              <a href={ui.recordedUrl} download={`zokascore_clip.webm`} style={{ ...topBtnStyle, background: '#10b981', borderColor: '#10b981', textDecoration: 'none' }}><Download size={16} /> Download</a>
            </>
          ) : (
            <button onClick={handleExportVideo} disabled={!media.sourceLoaded || ui.isExporting} style={{ ...topBtnStyle, background: '#10b981', borderColor: '#10b981', opacity: !media.sourceLoaded || ui.isExporting ? 0.5 : 1 }}>
              {ui.isExporting ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} Export Clip
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: '60px', background: '#111827', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: '16px' }}>
          <button onClick={() => fileInputRefs.current.video?.click()} style={sideBtnStyle} title="Replace Main Video" disabled={ui.isExporting || ui.recordedUrl}><Upload size={20} /></button>
          <button onClick={() => fileInputRefs.current.broll?.click()} style={{...sideBtnStyle, color: media.brollLoaded ? '#10b981' : '#64748b'}} title="Add 2nd Video (B-Roll)" disabled={ui.isExporting || ui.recordedUrl}><Film size={20} /></button>
          <button onClick={() => fileInputRefs.current.image?.click()} style={sideBtnStyle} title="Avatar" disabled={ui.isExporting || ui.recordedUrl}><User size={20} /></button>
          <button onClick={() => fileInputRefs.current.logo?.click()} style={{...sideBtnStyle, color: media.logoSrc ? '#10b981' : '#64748b'}} title="Upload Brand Logo" disabled={ui.isExporting || ui.recordedUrl}><ImageIcon size={20} /></button>
          <button onClick={() => fileInputRefs.current.audio?.click()} style={sideBtnStyle} title="Audio" disabled={ui.isExporting || ui.recordedUrl}><Music size={20} /></button>
          <button onClick={startCamera} style={{...sideBtnStyle, color: media.cameraOn ? '#10b981' : '#64748b'}} title="Camera" disabled={ui.isExporting || ui.recordedUrl}><Camera size={20} /></button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', minHeight: 0 }}>
            <div style={{ position: 'relative', height: '100%', aspectRatio: '9/16', borderRadius: '12px', overflow: 'hidden', border: '2px solid #1f2937', touchAction: 'none', boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}
              onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}>
              <canvas ref={canvasRef} width={720} height={1280} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {!media.sourceLoaded && !ui.recordedUrl && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#64748b', cursor: 'pointer' }} onClick={() => fileInputRefs.current.video?.click()}>
                  <Upload size={40} style={{ marginBottom: '12px' }} /><p style={{ fontWeight: 700 }}>Import Main Video</p>
                </div>
              )}
              {ui.recordedUrl && <video src={ui.recordedUrl} controls autoPlay loop style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />}
              {ui.isExporting && <div style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(239,68,68,0.9)', padding: '4px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800 }}><Loader size={12} className="animate-spin" /> EXPORTING</div>}
            </div>
          </div>

          {media.sourceLoaded && (
            <div style={{ height: '120px', background: '#111827', borderTop: '1px solid #1f2937', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Playhead: {timeline.currentTime.toFixed(1)}s / {timeline.duration.toFixed(1)}s</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleSplit} style={{ background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} disabled={ui.isExporting || ui.recordedUrl}><Scissors size={12} /> Split</button>
                </div>
              </div>
              <div style={{ position: 'relative', height: '60px', background: '#0f172a', borderRadius: '8px', overflow: 'hidden', display: 'flex' }}>
                {timeline.clips.map((c) => {
                  const dur = timeline.duration || 1;
                  const wPct = ((c.end - c.start) / dur) * 100;
                  const lPct = (c.start / dur) * 100;
                  const isAct = c.id === timeline.activeClipId;
                  return (
                    <div key={c.id} onClick={() => { dispatch({ type: 'SET_TIMELINE', payload: { activeClipId: c.id } }); sourceVideoRef.current.currentTime = c.start; }}
                      style={{ position: 'absolute', left: `${lPct}%`, width: `${wPct}%`, height: '100%', background: isAct ? '#10b981' : '#334155', border: '1px solid #1f2937', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', cursor: 'grab', boxSizing: 'border-box' }}>
                      
                      <div onMouseDown={(e) => handleTimelineDrag(e, c.id, 'resize-l')} onTouchStart={(e) => handleTimelineDrag(e, c.id, 'resize-l')} style={{ width: '8px', height: '100%', background: '#1f2937', cursor: 'ew-resize', flexShrink: 0 }}></div>
                      
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff', flex: 1, textAlign: 'center', pointerEvents: 'none' }}>Clip {timeline.clips.indexOf(c) + 1}</span>
                      
                      <div onMouseDown={(e) => handleTimelineDrag(e, c.id, 'resize-r')} onTouchStart={(e) => handleTimelineDrag(e, c.id, 'resize-r')} style={{ width: '8px', height: '100%', background: '#1f2937', cursor: 'ew-resize', flexShrink: 0 }}></div>
                      
                      {timeline.clips.length > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClip(c.id); }} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px', borderRadius: '2px' }}><X size={10} /></button>
                      )}
                    </div>
                  );
                })}
                <div style={{ position: 'absolute', left: `${(timeline.currentTime / (timeline.duration || 1)) * 100}%`, top: 0, bottom: 0, width: '2px', background: '#ef4444', pointerEvents: 'none' }}></div>
              </div>
            </div>
          )}
        </div>

        <div style={{ width: '300px', background: '#111827', borderLeft: '1px solid #1f2937', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', flexShrink: 0 }}>
          
          {/* NEW: CROP & ZOOM PANEL */}
          {media.sourceLoaded && (
            <div style={panelStyle}>
              <div style={panelTitleStyle}><Crop size={14} /> Crop & Zoom</div>
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>Zoom: {editor.videoZoom.toFixed(1)}x</label>
              <input type="range" min="1" max="4" step="0.1" value={editor.videoZoom} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoZoom: parseFloat(e.target.value) } })} style={{ width: '100%', accentColor: '#10b981' }} disabled={ui.isExporting || ui.recordedUrl} />
              
              <label style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Pan X: {editor.videoPanX.toFixed(1)}</label>
              <input type="range" min="-1" max="1" step="0.1" value={editor.videoPanX} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoPanX: parseFloat(e.target.value) } })} style={{ width: '100%', accentColor: '#10b981' }} disabled={ui.isExporting || ui.recordedUrl} />
              
              <label style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Pan Y: {editor.videoPanY.toFixed(1)}</label>
              <input type="range" min="-1" max="1" step="0.1" value={editor.videoPanY} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoPanY: parseFloat(e.target.value) } })} style={{ width: '100%', accentColor: '#10b981' }} disabled={ui.isExporting || ui.recordedUrl} />
              
              <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { videoZoom: 1, videoPanX: 0, videoPanY: 0 } })} style={{ marginTop: '8px', background: '#1f2937', border: '1px solid #334155', borderRadius: '6px', padding: '6px', color: '#94a3b8', cursor: 'pointer', fontSize: '11px' }}>Reset Crop</button>
            </div>
          )}

          {/* CINEMATIC INTRO PANEL */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}><Sparkles size={14} /> Cinematic Intro</div>
            <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introEnabled: !editor.introEnabled } })} style={{ ...inputStyle, background: editor.introEnabled ? '#10b981' : '#1f2937', color: editor.introEnabled ? '#fff' : '#94a3b8', textAlign: 'center', cursor: 'pointer', fontWeight: 700 }}>
              {editor.introEnabled ? 'INTRO ENABLED' : 'ENABLE INTRO'}
            </button>
            {editor.introEnabled && (
              <>
                <label style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Animation Style</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {INTRO_STYLES.map(s => <button key={s.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introStyle: s.id } })} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: editor.introStyle === s.id ? '#10b981' : '#1f2937', color: editor.introStyle === s.id ? '#fff' : '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>{s.name}</button>)}
                </div>
                <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introWatermark: !editor.introWatermark } })} style={{ marginTop: '8px', background: '#1f2937', border: '1px solid #334155', borderRadius: '6px', padding: '8px', color: editor.introWatermark ? '#10b981' : '#94a3b8', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <ImageIcon size={12} /> Watermark After Intro: {editor.introWatermark ? 'On' : 'Off'}
                </button>
              </>
            )}
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Move size={14} /> Grid Edit Mode</div>
            <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { editMode: !editor.editMode } })} style={{ ...inputStyle, background: editor.editMode ? '#10b981' : '#1f2937', color: editor.editMode ? '#fff' : '#94a3b8', textAlign: 'center', cursor: 'pointer', fontWeight: 700 }}>
              {editor.editMode ? 'DRAGGING ENABLED' : 'ENABLE FREE DRAG'}
            </button>
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Sparkles size={14} /> Effects & Animations</div>
            <label style={{ fontSize: '11px', color: '#94a3b8' }}>Video Effect (Ken Burns, Glitch...)</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {VIDEO_EFFECTS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { videoEffect: f.id } })} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: editor.videoEffect === f.id ? '#10b981' : '#1f2937', color: editor.videoEffect === f.id ? '#fff' : '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>{f.name}</button>)}
            </div>
            <label style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Caption Animation</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {TEXT_ANIMATIONS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { textAnimation: f.id } })} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: editor.textAnimation === f.id ? '#10b981' : '#1f2937', color: editor.textAnimation === f.id ? '#fff' : '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>{f.name}</button>)}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Palette size={14} /> Brand Kit & Fonts</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {BRAND_PRESETS.map(p => <button key={p.name} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { accentColor: p.color } })} style={{ width: '30px', height: '30px', borderRadius: '50%', background: p.color, border: editor.accentColor === p.color ? '2px solid #fff' : '2px solid #334155', cursor: 'pointer' }} title={p.name}></button>)}
              <input type="color" value={editor.accentColor} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { accentColor: e.target.value } })} style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'none', border: '2px solid #334155', cursor: 'pointer', padding: 0 }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {Object.keys(FONT_PACKS).map(f => <button key={f} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { fontPack: f } })} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155', background: editor.fontPack === f ? '#10b981' : '#1f2937', color: editor.fontPack === f ? '#fff' : '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>{f}</button>)}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><User size={14} /> Social Details & Fonts</div>
            <input type="text" value={editor.displayName} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { displayName: e.target.value } })} placeholder="Display Name" style={inputStyle} disabled={ui.isExporting || ui.recordedUrl} />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="color" value={editor.nameColor} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { nameColor: e.target.value } })} style={{...inputStyle, width: '40px', padding: '2px', height: '38px'}} title="Name Color" />
              <input type="number" value={editor.nameSize || ''} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { nameSize: e.target.value ? parseInt(e.target.value) : null } })} placeholder="Name Size (px)" style={{...inputStyle, width: '100px'}} title="Name Size" />
              <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { showVerified: !editor.showVerified } })} style={{ ...inputStyle, background: editor.showVerified ? '#1d9bf0' : '#1f2937', color: editor.showVerified ? '#fff' : '#94a3b8', textAlign: 'center', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><BadgeCheck size={16} /> Tick</button>
            </div>
            <input type="text" value={editor.username} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { username: e.target.value } })} placeholder="@username" style={inputStyle} disabled={ui.isExporting || ui.recordedUrl} />
            <textarea value={editor.povCaption} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { povCaption: e.target.value } })} placeholder="Caption" style={{...inputStyle, height: '60px', resize: 'none'}} disabled={ui.isExporting || ui.recordedUrl} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="color" value={editor.captionColor} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { captionColor: e.target.value } })} style={{...inputStyle, width: '40px', padding: '2px', height: '38px'}} title="Caption Color" />
              <input type="number" value={editor.captionSize || ''} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { captionSize: e.target.value ? parseInt(e.target.value) : null } })} placeholder="Caption Size (px)" style={{...inputStyle, width: '100px'}} title="Caption Size" />
            </div>
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Sliders size={14} /> Filters & Audio</div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
              {FILTERS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { filter: f.id } })} style={{ padding: '4px 10px', borderRadius: '20px', border: '1px solid #334155', background: editor.filter === f.id ? '#10b981' : '#1f2937', color: editor.filter === f.id ? '#fff' : '#94a3b8', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }} disabled={ui.isExporting || ui.recordedUrl}>{f.name}</button>)}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { isMuted: !editor.isMuted } })} style={{ flex: 1, background: '#1f2937', border: '1px solid #334155', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} disabled={ui.isExporting || ui.recordedUrl}>
                {editor.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />} {editor.isMuted ? 'Muted' : 'Audio On'}
              </button>
              <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { fadeIn: !editor.fadeIn } })} style={{ flex: 1, background: editor.fadeIn ? '#10b981' : '#1f2937', border: '1px solid #334155', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer', fontSize: '12px' }} disabled={ui.isExporting || ui.recordedUrl}>Fade In: {editor.fadeIn ? 'On' : 'Off'}</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: '80px', background: '#111827', borderTop: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '0 24px', flexShrink: 0 }}>
        <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { isMuted: !editor.isMuted } })} style={bottomBtnStyle} title="Mute" disabled={ui.isExporting || ui.recordedUrl}><Volume2 size={20} /></button>
        <button onClick={togglePreview} disabled={!media.sourceLoaded || ui.isExporting || ui.recordedUrl} style={{ ...bottomBtnStyle, background: '#3b82f6', color: '#fff', width: '64px', height: '64px', opacity: !media.sourceLoaded || ui.isExporting || ui.recordedUrl ? 0.5 : 1 }} title="Preview Active Clip">
          {timeline.isPlaying ? <Pause size={28} fill="#fff" /> : <Play size={28} fill="#fff" />}
        </button>
        <button onClick={() => fileInputRefs.current.audio?.click()} style={bottomBtnStyle} title="Add Sound" disabled={ui.isExporting || ui.recordedUrl}><Music size={20} /></button>
      </div>

      {ui.showGallery && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => dispatch({ type: 'SET_UI', payload: { showGallery: false } })}>
          <div style={{ width: '90%', maxWidth: '900px', height: '85vh', background: '#111827', borderRadius: '16px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Search size={20} color="#64748b" />
              <input type="text" value={ui.searchQuery} onChange={(e) => dispatch({ type: 'SET_UI', payload: { searchQuery: e.target.value } })} placeholder="Search templates..." style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: '16px', outline: 'none' }} />
              <button onClick={() => dispatch({ type: 'SET_UI', payload: { showGallery: false } })} style={topBtnStyle}><X size={18} /></button>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2937', display: 'flex', gap: '8px', overflowX: 'auto' }}>
              {["All", "Favorites", "Pro", "TikTok", "YouTube", "Gaming", "Football", "Minimal"].map(cat => <button key={cat} onClick={() => dispatch({ type: 'SET_UI', payload: { activeCategory: cat } })} style={{ padding: '6px 16px', borderRadius: '20px', border: '1px solid #334155', background: ui.activeCategory === cat ? '#10b981' : '#1f2937', color: ui.activeCategory === cat ? '#fff' : '#94a3b8', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>{cat}</button>)}
            </div>
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {filteredTemplates.map(t => (
                <div key={t.id} style={{ background: '#1f2937', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', border: editor.templateId === t.id ? '2px solid #10b981' : '2px solid #334155', position: 'relative' }} onClick={() => applyTemplate(t.id)}>
                  <div style={{ height: '250px', background: t.preview.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px', position: 'relative' }}>
                    {t.category === 'Pro' && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
                        <div style={{ width: '40px', height: '40px', background: '#fff', marginBottom: '8px', borderRadius: '4px' }}></div>
                        <div style={{ width: '80px', height: '8px', background: '#fff', borderRadius: '4px' }}></div>
                      </div>
                    )}
                    {t.preview.layout === 'pov' && (<><div style={{ position: 'absolute', top: '15px', left: '15px', width: '24px', height: '24px', background: '#fff', borderRadius: '50%', border: '2px solid #1d9bf0' }}></div><div style={{ position: 'absolute', top: '14px', left: '48px', display: 'flex', gap: '6px', alignItems: 'center' }}><div style={{ width: '40px', height: '8px', background: '#fff', borderRadius: '4px' }}></div><div style={{ width: '60px', height: '6px', background: '#aaa', borderRadius: '4px' }}></div></div><div style={{ position: 'absolute', top: '50px', left: '15px', display: 'flex', flexDirection: 'column', gap: '4px' }}><div style={{ width: '120px', height: '6px', background: '#fff', borderRadius: '4px' }}></div><div style={{ width: '100px', height: '6px', background: '#fff', borderRadius: '4px' }}></div></div></>)}
                    {t.preview.layout === 'tl' && <div style={{ width: '30px', height: '30px', background: '#fff', borderRadius: '50%', alignSelf: 'flex-start', marginLeft: '10px', marginTop: '10px' }}></div>}
                    {t.preview.layout === 'tr' && <div style={{ width: '30px', height: '30px', background: '#fff', borderRadius: '50%', alignSelf: 'flex-end', marginRight: '10px', marginTop: '10px' }}></div>}
                    {t.preview.layout === 'bl' && <div style={{ width: '30px', height: '30px', background: '#fff', borderRadius: '50%', alignSelf: 'flex-start', marginLeft: '10px', marginBottom: '10px' }}></div>}
                    {t.preview.layout === 'br' && <div style={{ width: '30px', height: '30px', background: '#fff', borderRadius: '50%', alignSelf: 'flex-end', marginRight: '10px', marginBottom: '10px' }}></div>}
                    {(t.preview.layout === 'center' || t.preview.layout === 'news' || t.preview.layout === 'custom') && <div style={{ width: '60%', height: '10px', background: '#fff', borderRadius: '4px' }}></div>}
                  </div>
                  <div style={{ padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{t.title}</span>
                    <button onClick={(e) => { e.stopPropagation(); toggleFavorite(t.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ui.favorites.includes(t.id) ? '#f59e0b' : '#64748b' }}><Star size={14} fill={ui.favorites.includes(t.id) ? '#f59e0b' : 'none'} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <video ref={sourceVideoRef} style={{ position: 'fixed', bottom: '2px', right: '2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} playsInline preload="auto" />
      <video ref={brollVideoRef} style={{ position: 'fixed', bottom: '2px', right: '2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} playsInline muted preload="auto" />
      <video ref={webcamVideoRef} style={{ position: 'fixed', bottom: '2px', right: '2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} playsInline muted preload="auto" />
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}

const topBtnStyle = { display: 'flex', alignItems: 'center', gap: '6px', background: '#1f2937', border: '1px solid #334155', color: '#fff', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' };
const sideBtnStyle = { width: '40px', height: '40px', borderRadius: '8px', background: '#1f2937', border: '1px solid #334155', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' };
const bottomBtnStyle = { width: '48px', height: '48px', borderRadius: '50%', background: '#1f2937', border: '1px solid #334155', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const panelStyle = { background: '#0f172a', border: '1px solid #1f2937', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' };
const panelTitleStyle = { display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' };
const inputStyle = { background: '#1f2937', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', color: '#fff', outline: 'none', width: '100%', fontSize: '13px' };