// src/studio/pages/ReactorStudio.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Download, Upload, Camera, Music, User, Volume2, VolumeX, 
  Sliders, Move, Palette, Search, Star, LayoutGrid, Layers, Type, Grid3x3, X, Film, Shield, Play, Pause, Loader, Trash2, BadgeCheck, Sparkles, Eraser, Scissors
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
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};
const idbSet = async (key, blob) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};
const idbGet = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};
const idbClear = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

// --- 1. MASSIVE TEMPLATE ENGINE ---
const TEMPLATES = [
  { id: 'social_pro', title: 'TikTok POV (Exact Match)', category: 'TikTok', tags: ['viral', 'pov', 'exact'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:70,r:35,ring:'accent'}, nameEl: {x:100,y:60,size:30,color:'#fff'}, handleEl: {x:100,y:92,size:24,color:'#aaa'}, caption: {x:50,y:150,size:26,maxW:620,align:'left',color:'#fff'}, topGradient:350, bottomGradient:200, preview: {bg: 'linear-gradient(to bottom, #1e293b, #0f172a)', layout: 'pov'} },
  { id: 'tiktok_frame', title: 'TikTok Framed (Color)', category: 'TikTok', tags: ['viral', 'frame', 'pov'], pip: false, video: {x:40,y:250,w:640,h:900,border:'#000'}, profile: {x:60,y:60,r:30,ring:'#fff'}, nameEl: {x:110,y:50,size:24,color:'#fff'}, handleEl: {x:110,y:80,size:20,color:'#000'}, caption: {x:60,y:150,size:28,color:'#fff',maxW:600,align:'left'}, bg:'accent', preview: {bg: '#f97316', layout: 'pov'} },
  { id: 'custom', title: 'Custom Studio', category: 'Pro', tags: ['drag', 'resize'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:360,y:640,r:50,ring:'accent'}, username: {x:360,y:720,size:32,center:true,badge:true,badgeColor:'accent'}, caption: {x:360,y:400,size:28,maxW:600,center:true}, bg:'#000', isCustom: true, preview: {bg: '#000', layout: 'custom'} },
  { id: 'tiktok_tl', title: 'TikTok Top Left', category: 'TikTok', tags: ['viral', 'duet'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:60,r:35,ring:'accent'}, username: {x:100,y:55,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:120,size:24,maxW:680,align:'left'}, topGradient:350, bottomGradient:200, preview: {bg: '#111', layout: 'tl'} },
  { id: 'tiktok_tr', title: 'TikTok Top Right', category: 'TikTok', tags: ['viral', 'duet'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:670,y:60,r:35,ring:'accent'}, username: {x:620,y:55,size:28,badge:true,badgeColor:'accent',align:'right'}, caption: {x:700,y:120,size:24,maxW:680,align:'right'}, topGradient:350, bottomGradient:200, preview: {bg: '#111', layout: 'tr'} },
  { id: 'tiktok_bl', title: 'TikTok Bottom Left', category: 'TikTok', tags: ['viral', 'duet'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:1180,r:35,ring:'accent'}, username: {x:100,y:1175,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:1080,size:24,maxW:680,align:'left'}, bottomGradient:400, preview: {bg: '#111', layout: 'bl'} },
  { id: 'tiktok_br', title: 'TikTok Bottom Right', category: 'TikTok', tags: ['viral', 'duet'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:670,y:1180,r:35,ring:'accent'}, username: {x:620,y:1175,size:28,badge:true,badgeColor:'accent',align:'right'}, caption: {x:700,y:1080,size:24,maxW:680,align:'right'}, bottomGradient:400, preview: {bg: '#111', layout: 'br'} },
  { id: 'tiktok_face', title: 'TikTok Facecam', category: 'TikTok', tags: ['facecam', 'gaming'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:60,r:35,ring:'accent'}, username: {x:100,y:55,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:120,size:24,maxW:680,align:'left'}, topGradient:350, bottomGradient:200, preview: {bg: '#111', layout: 'tl'} },
  { id: 'insta_tl', title: 'Insta Story Top Left', category: 'Instagram', tags: ['luxury', 'minimal'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:60,r:35,ring:'accent'}, username: {x:100,y:55,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:120,size:24,maxW:680,align:'left'}, topGradient:350, preview: {bg: '#1a1a1a', layout: 'tl'} },
  { id: 'insta_tr', title: 'Insta Story Top Right', category: 'Instagram', tags: ['luxury', 'minimal'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:670,y:60,r:35,ring:'accent'}, username: {x:620,y:55,size:28,badge:true,badgeColor:'accent',align:'right'}, caption: {x:700,y:120,size:24,maxW:680,align:'right'}, topGradient:350, preview: {bg: '#1a1a1a', layout: 'tr'} },
  { id: 'insta_bl', title: 'Insta Story Bottom', category: 'Instagram', tags: ['luxury', 'minimal'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:1180,r:35,ring:'accent'}, username: {x:100,y:1175,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:1080,size:24,maxW:680,align:'left'}, bottomGradient:400, preview: {bg: '#1a1a1a', layout: 'bl'} },
  { id: 'insta_lux', title: 'Insta Luxury Gold', category: 'Instagram', tags: ['luxury', 'gold'], pip: false, video: {x:40,y:80,w:640,h:900,border:'#f59e0b'}, profile: {x:360,y:1100,r:40,ring:'#f59e0b'}, username: {x:360,y:1200,size:36,color:'#fff',center:true,badge:true,badgeColor:'#f59e0b'}, caption: {x:360,y:130,size:28,color:'#fff',maxW:600,center:true}, bg:'#000', preview: {bg: '#000', layout: 'center'} },
  { id: 'yt_shorts', title: 'YT Shorts Standard', category: 'YouTube', tags: ['shorts', 'viral'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:60,r:35,ring:'accent'}, username: {x:100,y:55,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:120,size:24,maxW:680,align:'left'}, topGradient:350, bottomGradient:200, preview: {bg: '#0f0f0f', layout: 'tl'} },
  { id: 'yt_mrbeast', title: 'YT MrBeast Style', category: 'YouTube', tags: ['mrbeast', 'viral'], pip: false, video: {x:0,y:0,w:720,h:1280}, caption: {x:360,y:1100,size:60,maxW:680,center:true,color:'#fff'}, bg:'#000', preview: {bg: '#0f0f0f', layout: 'center'} },
  { id: 'yt_edu', title: 'YT Educational', category: 'YouTube', tags: ['edu', 'tutorial'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:60,r:35,ring:'accent'}, username: {x:100,y:55,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:120,size:24,maxW:680,align:'left'}, topGradient:350, bottomGradient:200, preview: {bg: '#1a1a1a', layout: 'tl'} },
  { id: 'neon_pink', title: 'Neon Pink Glow', category: 'Gaming', tags: ['cyberpunk', 'twitch'], pip: false, video: {x:60,y:100,w:600,h:900,glow:'#ec4899'}, profile: {x:360,y:1150,r:35,ring:'#ec4899'}, username: {x:360,y:1220,size:28,center:true,badge:true,badgeColor:'#ec4899'}, caption: {x:360,y:1050,size:28,maxW:600,center:true}, bg:'#0a0f1a', preview: {bg: '#0a0f1a', layout: 'center'} },
  { id: 'neon_blue', title: 'Neon Blue Glow', category: 'Gaming', tags: ['cyberpunk', 'twitch'], pip: false, video: {x:60,y:100,w:600,h:900,glow:'#3b82f6'}, profile: {x:360,y:1150,r:35,ring:'#3b82f6'}, username: {x:360,y:1220,size:28,center:true,badge:true,badgeColor:'#3b82f6'}, caption: {x:360,y:1050,size:28,maxW:600,center:true}, bg:'#0a0f1a', preview: {bg: '#0a0f1a', layout: 'center'} },
  { id: 'neon_green', title: 'Neon Green Glow', category: 'Gaming', tags: ['cyberpunk', 'twitch'], pip: false, video: {x:60,y:100,w:600,h:900,glow:'#10b981'}, profile: {x:360,y:1150,r:35,ring:'#10b981'}, username: {x:360,y:1220,size:28,center:true,badge:true,badgeColor:'#10b981'}, caption: {x:360,y:1050,size:28,maxW:600,center:true}, bg:'#0a0f1a', preview: {bg: '#0a0f1a', layout: 'center'} },
  { id: 'twitch_face', title: 'Twitch Facecam', category: 'Gaming', tags: ['twitch', 'facecam'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:60,r:35,ring:'#9146ff'}, username: {x:100,y:55,size:28,badge:true,badgeColor:'#9146ff'}, caption: {x:20,y:120,size:24,maxW:680,align:'left'}, topGradient:350, bottomGradient:200, bg:'#0e0e10', preview: {bg: '#0e0e10', layout: 'tl'} },
  { id: 'pod_split', title: 'Podcast Split', category: 'Podcast', tags: ['podcast', 'split'], pip: true, video: {x:0,y:0,w:360,h:1280}, profile: {x:180,y:640,r:50,ring:'accent'}, username: {x:180,y:720,size:32,center:true,badge:true,badgeColor:'accent'}, caption: {x:540,y:640,size:28,maxW:300,center:true}, bg:'#000', preview: {bg: '#111', layout: 'split'} },
  { id: 'pod_wave', title: 'Podcast Minimal', category: 'Podcast', tags: ['podcast', 'minimal'], pip: false, video: {x:60,y:100,w:600,h:900,glow:'#3b82f6'}, profile: {x:360,y:1150,r:35,ring:'#3b82f6'}, username: {x:360,y:1220,size:28,center:true,badge:true,badgeColor:'#3b82f6'}, caption: {x:360,y:1050,size:28,maxW:600,center:true}, bg:'#0a0f1a', preview: {bg: '#0a0f1a', layout: 'center'} },
  { id: 'news_red', title: 'Football Breaking', category: 'Football', tags: ['news', 'match'], pip: true, video: {x:0,y:100,w:720,h:1080}, caption: {x:360,y:60,size:32,color:'#fff',maxW:680,center:true}, header: {h:100,bg:'#dc2626',text:'BREAKING NEWS',y:45,size:36}, ticker: {h:100,bg:'#111827',y:1230,size:28}, bg:'#000', preview: {bg: '#dc2626', layout: 'news'} },
  { id: 'news_blue', title: 'Match Update', category: 'Football', tags: ['news', 'match'], pip: true, video: {x:0,y:100,w:720,h:1080}, caption: {x:360,y:60,size:32,color:'#fff',maxW:680,center:true}, header: {h:100,bg:'#1d9bf0',text:'MATCH UPDATE',y:45,size:36}, ticker: {h:100,bg:'#111827',y:1230,size:28}, bg:'#000', preview: {bg: '#1d9bf0', layout: 'news'} },
  { id: 'news_green', title: 'Transfer News', category: 'Football', tags: ['news', 'transfer'], pip: true, video: {x:0,y:100,w:720,h:1080}, caption: {x:360,y:60,size:32,color:'#fff',maxW:680,center:true}, header: {h:100,bg:'#10b981',text:'TRANSFER NEWS',y:45,size:36}, ticker: {h:100,bg:'#111827',y:1230,size:28}, bg:'#000', preview: {bg: '#10b981', layout: 'news'} },
  { id: 'news_dark', title: 'Broadcast Dark', category: 'Football', tags: ['news', 'minimal'], pip: true, video: {x:0,y:0,w:720,h:1280}, profile: {x:50,y:60,r:35,ring:'accent'}, username: {x:100,y:55,size:28,badge:true,badgeColor:'accent'}, caption: {x:20,y:120,size:24,maxW:680,align:'left'}, topGradient:350, bottomGradient:200, bg:'#000', preview: {bg: '#000', layout: 'tl'} },
  { id: 'polaroid_c', title: 'Polaroid Center', category: 'Minimal', tags: ['white', 'aesthetic'], pip: false, video: {x:40,y:80,w:640,h:900,border:'accent'}, profile: {x:360,y:1100,r:40,ring:'#f1f1f1'}, username: {x:360,y:1200,size:36,color:'#000',center:true,badge:true,badgeColor:'accent'}, caption: {x:360,y:130,size:28,color:'#fff',maxW:600,center:true}, bg:'#fff', preview: {bg: '#fff', layout: 'center'} },
  { id: 'polaroid_t', title: 'Polaroid Video Top', category: 'Minimal', tags: ['white', 'aesthetic'], pip: false, video: {x:40,y:40,w:640,h:800,border:'accent'}, profile: {x:360,y:1000,r:40,ring:'#f1f1f1'}, username: {x:360,y:1100,size:36,color:'#000',center:true,badge:true,badgeColor:'accent'}, caption: {x:360,y:900,size:28,color:'#000',maxW:600,center:true}, bg:'#fff', preview: {bg: '#fff', layout: 'center'} },
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
  { id: 'invert(1)', name: 'Invert' }, { id: 'blur(2px)', name: 'Blur' },
  { id: 'brightness(1.4) saturate(0.8)', name: 'Warm' }, { id: 'brightness(0.8) saturate(1.5) hue-rotate(200deg)', name: 'Cool' },
  { id: 'contrast(1.5) brightness(1.1) sepia(0.3)', name: 'Vintage' }
];

const VIDEO_EFFECTS = [
  { id: 'none', name: 'None' }, { id: 'zoom_in', name: 'Zoom In' },
  { id: 'shake', name: 'Shake' }, { id: 'pulse', name: 'Pulse' }
];

const TEXT_ANIMATIONS = [
  { id: 'none', name: 'None' }, { id: 'fade_in', name: 'Fade In' },
  { id: 'slide_up', name: 'Slide Up' }, { id: 'type_writer', name: 'Typewriter' }
];

export default function ReactorStudio() {
  const navigate = useNavigate();
  
  const sourceVideoRef = useRef(null);
  const brollVideoRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRefs = useRef({ video: null, broll: null, image: null, audio: null });
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const dragRef = useRef({ target: null, offsetX: 0, offsetY: 0 });
  const profileImgRef = useRef(new Image());
  const homeLogoRef = useRef(new Image());
  const awayLogoRef = useRef(new Image());

  // State
  const [sourceLoaded, setSourceLoaded] = useState(false);
  const [brollLoaded, setBrollLoaded] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); 
  const [isExporting, setIsExporting] = useState(false); 
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  
  const [templateId, setTemplateId] = useState('social_pro');
  const [displayName, setDisplayName] = useState('Manu');
  const [username, setUsername] = useState('manuel_palmer');
  const [povCaption, setPovCaption] = useState('POV: You just witnessed greatness 🔥');
  const [profileSrc, setProfileSrc] = useState(null);
  const [audioName, setAudioName] = useState('');
  const [accentColor, setAccentColor] = useState('#f97316');
  const [fontPack, setFontPack] = useState('TikTok');
  
  const [nameColor, setNameColor] = useState('#ffffff');
  const [nameSize, setNameSize] = useState(null); 
  const [captionColor, setCaptionColor] = useState('#ffffff');
  const [captionSize, setCaptionSize] = useState(null); 
  const [showVerified, setShowVerified] = useState(true);

  const [editMode, setEditMode] = useState(false);

  const [videoEffect, setVideoEffect] = useState('none');
  const [textAnimation, setTextAnimation] = useState('none');

  const [homeLogoUrl, setHomeLogoUrl] = useState('');
  const [awayLogoUrl, setAwayLogoUrl] = useState('');
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);

  const [pipPos, setPipPos] = useState({ x: 450, y: 800, w: 280, h: 380 });
  const [profilePos, setProfilePos] = useState({ x: 50, y: 70, r: 35 });

  const [isMuted, setIsMuted] = useState(false);
  const [filter, setFilter] = useState('none');
  const [duration, setDuration] = useState(0);
  const [fadeIn, setFadeIn] = useState(false);

  // Multi-Clip CapCut Style State
  const [clips, setClips] = useState([{ id: 'clip1', start: 0, end: 0 }]);
  const [activeClipId, setActiveClipId] = useState('clip1');

  const activeClip = useMemo(() => clips.find(c => c.id === activeClipId) || clips[0], [clips, activeClipId]);

  const [showGallery, setShowGallery] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [layers, setLayers] = useState({ video: true, pip: true, profile: true, caption: true, gradients: true, scorebug: true });
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem("reactor-favorites")) || []);
  const [recents, setRecents] = useState(() => JSON.parse(localStorage.getItem("reactor-recents")) || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const templateMap = useMemo(() => Object.fromEntries(TEMPLATES.map(t => [t.id, t])), []);
  const activeTemplate = templateMap[templateId];

  useEffect(() => {
    const loadProject = async () => {
      const savedState = JSON.parse(localStorage.getItem('reactor-project-state') || '{}');
      if (savedState.templateId) setTemplateId(savedState.templateId);
      if (savedState.displayName) setDisplayName(savedState.displayName);
      if (savedState.username) setUsername(savedState.username);
      if (savedState.povCaption) setPovCaption(savedState.povCaption);
      if (savedState.accentColor) setAccentColor(savedState.accentColor);
      if (savedState.fontPack) setFontPack(savedState.fontPack);
      if (savedState.nameColor) setNameColor(savedState.nameColor);
      if (savedState.nameSize) setNameSize(savedState.nameSize);
      if (savedState.captionColor) setCaptionColor(savedState.captionColor);
      if (savedState.captionSize) setCaptionSize(savedState.captionSize);
      if (savedState.showVerified !== undefined) setShowVerified(savedState.showVerified);
      if (savedState.videoEffect) setVideoEffect(savedState.videoEffect);
      if (savedState.textAnimation) setTextAnimation(savedState.textAnimation);
      if (savedState.homeLogoUrl) setHomeLogoUrl(savedState.homeLogoUrl);
      if (savedState.awayLogoUrl) setAwayLogoUrl(savedState.awayLogoUrl);
      if (savedState.homeScore) setHomeScore(savedState.homeScore);
      if (savedState.awayScore) setAwayScore(savedState.awayScore);
      if (savedState.filter) setFilter(savedState.filter);
      if (savedState.fadeIn) setFadeIn(savedState.fadeIn);

      try {
        const videoBlob = await idbGet('main_video');
        if (videoBlob && sourceVideoRef.current) {
          const url = URL.createObjectURL(videoBlob);
          sourceVideoRef.current.src = url;
          sourceVideoRef.current.loop = false; 
          sourceVideoRef.current.muted = true;
          sourceVideoRef.current.onloadedmetadata = () => {
            const dur = sourceVideoRef.current.duration;
            setDuration(dur);
            const restoredClips = savedState.clips && savedState.clips.length > 0 
              ? savedState.clips 
              : [{ id: 'clip1', start: 0, end: dur }];
            setClips(restoredClips);
            setActiveClipId(savedState.activeClipId || restoredClips[0].id);
            sourceVideoRef.current.currentTime = restoredClips[0].start;
            setSourceLoaded(true);
          };
        }

        const brollBlob = await idbGet('broll_video');
        if (brollBlob && brollVideoRef.current) {
          const url = URL.createObjectURL(brollBlob);
          brollVideoRef.current.src = url;
          brollVideoRef.current.loop = true;
          brollVideoRef.current.muted = true;
          brollVideoRef.current.onloadedmetadata = () => { brollVideoRef.current.play(); setBrollLoaded(true); };
        }

        const imageBlob = await idbGet('profile_image');
        if (imageBlob) setProfileSrc(URL.createObjectURL(imageBlob));

        const audioBlob = await idbGet('audio_track');
        if (audioBlob && audioRef.current) {
          audioRef.current.src = URL.createObjectURL(audioBlob);
          audioRef.current.loop = true;
          setAudioName('Restored Audio');
        }
      } catch (e) { console.error("Failed to load media", e); }
      
      setIsLoadingProject(false);
    };
    loadProject();
  }, []);

  useEffect(() => {
    if (isLoadingProject) return;
    const saveState = {
      templateId, displayName, username, povCaption, accentColor, fontPack,
      nameColor, nameSize, captionColor, captionSize, showVerified, videoEffect, textAnimation,
      homeLogoUrl, awayLogoUrl, homeScore, awayScore, clips, activeClipId, filter, fadeIn
    };
    localStorage.setItem('reactor-project-state', JSON.stringify(saveState));
  }, [templateId, displayName, username, povCaption, accentColor, fontPack, nameColor, nameSize, captionColor, captionSize, showVerified, videoEffect, textAnimation, homeLogoUrl, awayLogoUrl, homeScore, awayScore, clips, activeClipId, filter, fadeIn, isLoadingProject]);

  useEffect(() => { if (profileSrc) profileImgRef.current.src = profileSrc; else profileImgRef.current = new Image(); }, [profileSrc]);
  useEffect(() => { if (homeLogoUrl) homeLogoRef.current.src = homeLogoUrl; else homeLogoRef.current = new Image(); }, [homeLogoUrl]);
  useEffect(() => { if (awayLogoUrl) awayLogoRef.current.src = awayLogoUrl; else awayLogoRef.current = new Image(); }, [awayLogoUrl]);

  const handleImport = async (e, type) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      if (type === 'video') {
        await idbSet('main_video', file); 
        if (sourceVideoRef.current) {
          sourceVideoRef.current.src = url;
          sourceVideoRef.current.muted = isMuted;
          sourceVideoRef.current.onloadedmetadata = () => {
            const dur = sourceVideoRef.current.duration;
            setDuration(dur);
            const newClips = [{ id: `clip_${Date.now()}`, start: 0, end: dur }];
            setClips(newClips);
            setActiveClipId(newClips[0].id);
            sourceVideoRef.current.play();
            setIsPlaying(true);
            setSourceLoaded(true);
          };
        }
      } else if (type === 'broll') {
        await idbSet('broll_video', file); 
        if (brollVideoRef.current) {
          brollVideoRef.current.src = url;
          brollVideoRef.current.loop = true;
          brollVideoRef.current.muted = true;
          brollVideoRef.current.onloadedmetadata = () => { brollVideoRef.current.play(); setBrollLoaded(true); };
        }
      } else if (type === 'image') {
        await idbSet('profile_image', file); 
        setProfileSrc(url);
      } else if (type === 'audio') {
        await idbSet('audio_track', file); 
        if (audioRef.current) { audioRef.current.src = url; audioRef.current.loop = true; setAudioName(file.name); }
      }
    }
    e.target.value = null; 
  };

  const handleClearProject = async () => {
    if (!window.confirm("Clear all project data? This will remove the current video and settings.")) return;
    localStorage.removeItem('reactor-project-state');
    await idbClear();
    window.location.reload();
  };

  useEffect(() => { if (sourceVideoRef.current) sourceVideoRef.current.muted = isMuted; }, [isMuted]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 720, height: 1280, facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      if (webcamVideoRef.current) { webcamVideoRef.current.srcObject = stream; webcamVideoRef.current.play(); }
      setCameraOn(true);
      setBrollLoaded(false); 
      if (brollVideoRef.current) brollVideoRef.current.removeAttribute('src');
    } catch (err) { alert("Camera access denied."); }
  };

  const togglePreview = () => {
    const vid = sourceVideoRef.current;
    if (!vid || !activeClip) return;
    if (isPlaying) {
      vid.pause();
      setIsPlaying(false);
    } else {
      if (vid.currentTime < activeClip.start || vid.currentTime >= activeClip.end - 0.1) {
        vid.currentTime = activeClip.start;
      }
      vid.play();
      setIsPlaying(true);
    }
  };

  const handleSplit = () => {
    const vid = sourceVideoRef.current;
    if (!vid || !activeClip) return;
    const splitTime = vid.currentTime;
    
    const currentClipIndex = clips.findIndex(c => c.id === activeClipId);
    const currentClip = clips[currentClipIndex];
    
    if (splitTime > currentClip.start + 0.5 && splitTime < currentClip.end - 0.5) {
      const newClip1 = { ...currentClip, end: splitTime };
      const newClip2 = { id: `clip_${Date.now()}`, start: splitTime, end: currentClip.end };
      
      const newClips = [...clips];
      newClips.splice(currentClipIndex, 1, newClip1, newClip2);
      setClips(newClips);
      setActiveClipId(newClip2.id);
    } else {
      alert("Move playhead to middle of clip to split.");
    }
  };

  const handleDeleteClip = (clipId) => {
    if (clips.length <= 1) return;
    const newClips = clips.filter(c => c.id !== clipId);
    setClips(newClips);
    if (activeClipId === clipId) {
      setActiveClipId(newClips[0].id);
      if (sourceVideoRef.current) sourceVideoRef.current.currentTime = newClips[0].start;
    }
  };

  const drawCover = (ctx, video, x, y, w, h) => {
    const vidW = video.videoWidth, vidH = video.videoHeight;
    if (!vidW || !vidH) return;
    const vidRatio = vidW / vidH, boxRatio = w / h;
    let sx, sy, sw, sh;
    if (vidRatio > boxRatio) { sh = vidH; sw = vidH * boxRatio; sx = (vidW - sw) / 2; sy = 0; } 
    else { sw = vidW; sh = vidW / boxRatio; sx = 0; sy = (vidH - sh) / 2; }
    ctx.drawImage(video, sx, sy, sw, sh, x, y, w, h);
  };

  const drawRounded = (ctx, video, x, y, w, h, r) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.clip();
    drawCover(ctx, video, x, y, w, h);
    ctx.restore();
  };

  const wrapText = (ctx, text, maxWidth, maxLines) => {
    const words = text.split(' ');
    let lines = [], currentLine = words[0] || '';
    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      if (ctx.measureText(testLine).width < maxWidth) currentLine = testLine;
      else { lines.push(currentLine); currentLine = words[i]; }
    }
    lines.push(currentLine);
    return lines.slice(0, maxLines);
  };

  const drawVerifiedBadge = (ctx, x, y, size) => {
    ctx.save();
    ctx.fillStyle = '#1d9bf0';
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; 
    ctx.lineWidth = size * 0.35;
    ctx.lineCap = 'round'; 
    ctx.lineJoin = 'round';
    ctx.beginPath(); 
    ctx.moveTo(x - size * 0.4, y); 
    ctx.lineTo(x - size * 0.1, y + size * 0.35); 
    ctx.lineTo(x + size * 0.45, y - size * 0.35); 
    ctx.stroke();
    ctx.restore();
  };

  const drawFrameRef = useRef(() => {});
  
  drawFrameRef.current = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = activeTemplate.bg === 'accent' ? accentColor : (activeTemplate.bg || '#000');
    ctx.fillRect(0, 0, W, H);

    const sourceVid = sourceVideoRef.current;
    const webcamVid = webcamVideoRef.current;
    const brollVid = brollVideoRef.current;

    if (!sourceLoaded || !sourceVid) return;
    
    if (Math.abs(sourceVid.currentTime - currentTime) > 0.1) {
      setCurrentTime(sourceVid.currentTime);
    }

    if (activeClip) {
      if (sourceVid.currentTime < activeClip.start) {
        sourceVid.currentTime = activeClip.start;
      }
      if (isPlaying && sourceVid.currentTime >= activeClip.end - 0.05) {
        sourceVid.pause();
        sourceVid.currentTime = activeClip.start;
        sourceVid.play();
      }
    }

    const font = FONT_PACKS[fontPack];
    const cTime = sourceVid.currentTime;
    const animProgress = activeClip ? Math.min((cTime - activeClip.start) / 2, 1) : 0;

    if (layers.video) {
      ctx.save();
      const v = activeTemplate.video;
      
      if (videoEffect === 'zoom_in') {
        const scale = 1 + Math.min((cTime - activeClip.start) / (activeClip.end - activeClip.start), 1) * 0.3;
        ctx.translate(v.x + v.w/2, v.y + v.h/2);
        ctx.scale(scale, scale);
        ctx.translate(-(v.x + v.w/2), -(v.y + v.h/2));
      } else if (videoEffect === 'shake') {
        ctx.translate((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
      } else if (videoEffect === 'pulse') {
        const scale = 1 + Math.sin(cTime * 8) * 0.04;
        ctx.translate(v.x + v.w/2, v.y + v.h/2);
        ctx.scale(scale, scale);
        ctx.translate(-(v.x + v.w/2), -(v.y + v.h/2));
      }

      ctx.filter = filter;
      if (v.glow) {
        ctx.shadowColor = v.glow; ctx.shadowBlur = 30; ctx.strokeStyle = v.glow; ctx.lineWidth = 8;
        drawRounded(ctx, sourceVid, v.x, v.y, v.w, v.h, 20);
        ctx.strokeRect(v.x, v.y, v.w, v.h);
        ctx.shadowBlur = 0;
      } else if (v.border) {
        drawCover(ctx, sourceVid, v.x, v.y, v.w, v.h);
        ctx.strokeStyle = v.border === 'accent' ? accentColor : v.border; ctx.lineWidth = 4;
        ctx.strokeRect(v.x, v.y, v.w, v.h);
      } else {
        drawCover(ctx, sourceVid, v.x, v.y, v.w, v.h);
      }
      ctx.filter = 'none';
      ctx.restore();

      if (fadeIn && cTime < activeClip.start + 1) {
        ctx.fillStyle = `rgba(0,0,0,${1 - (cTime - activeClip.start)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    const showPiP = (cameraOn || brollLoaded) && layers.pip;
    const activePiPVid = brollLoaded ? brollVid : webcamVid;
    if (activePiPVid && showPiP) {
      const pip = pipPos; 
      ctx.fillStyle = '#fff';
      ctx.fillRect(pip.x - 4, pip.y - 4, pip.w + 8, pip.h + 8);
      ctx.save();
      if (!brollLoaded) { 
        ctx.scale(-1, 1);
        ctx.translate(-W, 0);
        drawRounded(ctx, activePiPVid, W - pip.x - pip.w, pip.y, pip.w, pip.h, 12);
      } else {
        drawRounded(ctx, activePiPVid, pip.x, pip.y, pip.w, pip.h, 12);
      }
      ctx.restore();
    }

    if (layers.gradients) {
      if (activeTemplate.topGradient) {
        const grd = ctx.createLinearGradient(0, 0, 0, activeTemplate.topGradient);
        grd.addColorStop(0, 'rgba(0,0,0,0.8)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd; ctx.fillRect(0, 0, W, activeTemplate.topGradient);
      }
      if (activeTemplate.bottomGradient) {
        const grd = ctx.createLinearGradient(0, H - activeTemplate.bottomGradient, 0, H);
        grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = grd; ctx.fillRect(0, H - activeTemplate.bottomGradient, W, activeTemplate.bottomGradient);
      }
    }

    if (activeTemplate.header) {
      const h = activeTemplate.header;
      ctx.fillStyle = h.bg; ctx.fillRect(0, 0, W, h.h);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${h.size}px ${font.name}`; ctx.textAlign = 'center';
      ctx.fillText(h.text, W / 2, h.y);
    }
    if (activeTemplate.ticker) {
      const t = activeTemplate.ticker;
      ctx.fillStyle = t.bg; ctx.fillRect(0, t.y, W, t.h);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${t.size}px ${font.name}`; ctx.textAlign = 'left';
      const lines = wrapText(ctx, povCaption, W - 40, 2);
      let yPos = t.y + 40;
      lines.forEach(line => { ctx.fillText(line, 20, yPos); yPos += 36; });
    }

    if (layers.caption && activeTemplate.caption && !activeTemplate.ticker) {
      const c = activeTemplate.caption;
      ctx.fillStyle = captionColor || c.color || '#fff';
      const cSize = captionSize ? parseInt(captionSize) : c.size;
      ctx.font = `${font.weight} ${cSize}px ${font.name}`;
      ctx.textAlign = c.center ? 'center' : (c.align || 'left');
      
      let displayCaption = povCaption;
      let yOffset = 0;
      
      if (textAnimation === 'type_writer') {
        const len = Math.floor((povCaption.length) * animProgress);
        displayCaption = povCaption.substring(0, len);
      } else if (textAnimation === 'fade_in') {
        ctx.globalAlpha = animProgress;
      } else if (textAnimation === 'slide_up') {
        yOffset = (1 - animProgress) * 50;
      }

      const lines = wrapText(ctx, displayCaption, c.maxW, 3);
      let yPos = c.y + yOffset;
      lines.forEach(line => { ctx.fillText(line, c.x, yPos); yPos += cSize + 8; });
      ctx.globalAlpha = 1;
    }

    const p = (activeTemplate.isCustom || editMode) ? profilePos : activeTemplate.profile;
    if (profileImgRef.current.src && p && layers.profile) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(profileImgRef.current, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      ctx.restore();
      if (p.ring) {
        ctx.strokeStyle = p.ring === 'accent' ? accentColor : p.ring; ctx.lineWidth = 4; 
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 1, 0, Math.PI * 2); ctx.stroke();
      }
    }

    if (activeTemplate.nameEl && activeTemplate.handleEl) {
      const n = activeTemplate.nameEl, hd = activeTemplate.handleEl;
      ctx.textAlign = n.align || 'left';
      ctx.fillStyle = nameColor || n.color || '#fff';
      const nSize = nameSize ? parseInt(nameSize) : n.size;
      ctx.font = `${font.weight} ${nSize}px ${font.name}`;
      
      const nx = (activeTemplate.isCustom || editMode) ? p.x + p.r + 12 : n.x;
      const ny = (activeTemplate.isCustom || editMode) ? p.y + 10 : n.y;
      ctx.fillText(displayName, nx, ny);
      
      let nameWidth = ctx.measureText(displayName).width;
      let currentX = nx + nameWidth + 12;

      if (showVerified) {
        drawVerifiedBadge(ctx, currentX, ny - nSize / 2 + 2, nSize / 2.5);
        currentX += (nSize / 2.5) * 2 + 12;
      }

      ctx.fillStyle = hd.color || '#aaa';
      ctx.font = `${hd.size}px ${font.name}`;
      ctx.fillText(`@${username}`, currentX, ny);
    } else if (activeTemplate.username || editMode) {
      const u = activeTemplate.username || { size: 28, center: true };
      const ux = (activeTemplate.isCustom || editMode) ? p.x : u.x;
      const uy = (activeTemplate.isCustom || editMode) ? p.y + p.r + 30 : u.y;
      ctx.textAlign = (activeTemplate.isCustom || editMode) ? 'center' : (u.center ? 'center' : (u.align || 'left'));
      ctx.fillStyle = nameColor || u.color || '#fff';
      const uSize = nameSize ? parseInt(nameSize) : u.size;
      ctx.font = `${font.weight} ${uSize}px ${font.name}`;
      ctx.fillText(`@${username}`, ux, uy);

      if (showVerified) {
        let nameWidth = ctx.measureText(username).width;
        let badgeX = (activeTemplate.isCustom || editMode || u.center) ? ux + nameWidth/2 + 16 : ux + nameWidth + 16;
        let badgeY = uy - uSize / 2 + 2;
        drawVerifiedBadge(ctx, badgeX, badgeY, uSize / 2.5);
      }
    }

    if (layers.scorebug && (homeLogoRef.current.src || awayLogoRef.current.src)) {
      const bugY = H - 150; const bugH = 80; const bugW = 400; const bugX = (W - bugW) / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(bugX, bugY, bugW, bugH);
      
      if (homeLogoRef.current.complete) ctx.drawImage(homeLogoRef.current, bugX + 15, bugY + 15, 50, 50);
      if (awayLogoRef.current.complete) ctx.drawImage(awayLogoRef.current, bugX + bugW - 65, bugY + 15, 50, 50);
      
      ctx.fillStyle = '#fff'; ctx.font = `bold 36px ${font.name}`; ctx.textAlign = 'center';
      ctx.fillText(`${homeScore} - ${awayScore}`, W / 2, bugY + 50);
    }

    ctx.textAlign = 'left';
  };

  useEffect(() => {
    let animFrame;
    const loop = () => { drawFrameRef.current(); animFrame = requestAnimationFrame(loop); };
    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const handlePointerDown = (e) => {
    if (!editMode && !activeTemplate.isCustom && !brollLoaded && !cameraOn) return;
    const { x, y } = getCanvasCoords(e);
    
    if ((activeTemplate.isCustom || editMode) && profileSrc) {
      const distToProfile = Math.hypot(x - profilePos.x, y - profilePos.y);
      if (distToProfile <= profilePos.r) {
        dragRef.current = { target: 'profile', offsetX: x - profilePos.x, offsetY: y - profilePos.y };
        return;
      }
    }
    if (brollLoaded || cameraOn) {
      if (x >= pipPos.x && x <= pipPos.x + pipPos.w && y >= pipPos.y && y <= pipPos.y + pipPos.h) {
        dragRef.current = { target: 'pip', offsetX: x - pipPos.x, offsetY: y - pipPos.y };
      }
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.target) return;
    e.preventDefault(); 
    const { x, y } = getCanvasCoords(e);
    const snapPointsX = [0, 360, 720];
    
    if (dragRef.current.target === 'pip') {
      const pipW = pipPos.w;
      const pipH = pipPos.h;
      let newX = Math.max(0, Math.min(x - dragRef.current.offsetX, 720 - pipW));
      let newY = Math.max(0, Math.min(y - dragRef.current.offsetY, 1280 - pipH));
      snapPointsX.forEach(pt => { if (Math.abs(newX - pt) < 20) newX = pt; });
      setPipPos(prev => ({ ...prev, x: newX, y: newY }));
    } else if (dragRef.current.target === 'profile') {
      let newX = Math.max(profilePos.r, Math.min(x - dragRef.current.offsetX, 720 - profilePos.r));
      let newY = Math.max(profilePos.r, Math.min(y - dragRef.current.offsetY, 1280 - profilePos.r));
      setProfilePos(prev => ({ ...prev, x: newX, y: newY }));
    }
  };

  const handlePointerUp = () => { dragRef.current.target = null; };

  // --- Bulletproof Audio export using Web Audio API ---
  const handleExportVideo = async () => {
    const vid = sourceVideoRef.current;
    if (!canvasRef.current || isExporting || !vid || !activeClip) return;

    setIsExporting(true);
    setIsPlaying(false);
    
    vid.pause();
    vid.currentTime = activeClip.start;
    
    // Wait for video to be fully loaded and buffered
    if (vid.readyState < 4) {
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (vid.readyState >= 4) { clearInterval(check); resolve(); }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 3000); // fallback
      });
    }
    
    // Fix Infinity duration if it happened
    let trueDuration = vid.duration;
    if (!isFinite(trueDuration)) {
      vid.currentTime = 1e101;
      await new Promise(r => setTimeout(r, 200));
      trueDuration = vid.duration;
      vid.currentTime = activeClip.start;
      await new Promise(r => setTimeout(r, 200));
    }

    let end = activeClip.end && isFinite(activeClip.end) ? activeClip.end : trueDuration;
    if (end > trueDuration) end = trueDuration;
    
    if (activeClip.start >= end - 0.1) {
      alert("Invalid clip duration.");
      setIsExporting(false);
      return;
    }

    await new Promise(r => setTimeout(r, 300)); // Extra buffer for seek to settle

    const wasMuted = vid.muted;
    const wasVolume = vid.volume;
    vid.muted = false; 
    vid.volume = 0; 

    const fps = 30;
    const canvasStream = canvasRef.current.captureStream(fps);
    
    let audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      
      const audioDest = audioCtx.createMediaStreamDestination();
      let hasAudio = false;

      if (streamRef.current && streamRef.current.getAudioTracks().length > 0) {
        const src = audioCtx.createMediaStreamSource(new MediaStream(streamRef.current.getAudioTracks()));
        src.connect(audioDest);
        hasAudio = true;
      }

      if (vid.captureStream) {
        try { 
          const vStream = vid.captureStream();
          if (vStream.getAudioTracks().length > 0) {
            const src = audioCtx.createMediaStreamSource(vStream);
            src.connect(audioDest);
            hasAudio = true;
          }
        } catch(e) {}
      }

      if (audioRef.current.src) {
        try { 
          audioRef.current.play();
          const aStream = audioRef.current.captureStream ? audioRef.current.captureStream() : audioRef.current.mozCaptureStream(); 
          if (aStream.getAudioTracks().length > 0) {
            const src = audioCtx.createMediaStreamSource(aStream);
            src.connect(audioDest);
            hasAudio = true;
          }
        } catch(e) {}
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0;
      osc.connect(gain);
      gain.connect(audioDest); // For recording
      
      // Connect to destination as well to prevent background tab throttling!
      gain.connect(audioCtx.destination); 
      
      osc.start();
      audioDest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
    } catch(e) { console.warn("Audio mix failed", e); }

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
      ? 'video/webm;codecs=vp9' 
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

    const recorder = new MediaRecorder(canvasStream, { 
      mimeType,
      videoBitsPerSecond: 8000000 
    });
    
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      let rawBlob = new Blob(chunksRef.current, { type: 'video/webm' });
      const exportDurationMs = (end - activeClip.start) * 1000;
      const fixedBlob = await fixWebmDuration(rawBlob, exportDurationMs);
      
      const url = URL.createObjectURL(fixedBlob);
      setRecordedUrl(url);
      setIsExporting(false);
      vid.pause();
      if (audioRef.current) audioRef.current.pause();
      vid.muted = wasMuted; 
      vid.volume = wasVolume;
      canvasStream.getTracks().forEach(track => track.stop());
      if (audioCtx) audioCtx.close();
    };

    const checkInterval = setInterval(() => {
      if (vid.currentTime >= end - 0.05 || vid.ended) {
        clearInterval(checkInterval);
        if (recorder.state !== 'inactive') recorder.stop();
      }
    }, 50);

    recorder.start(100); 
    
    try {
      await vid.play();
    } catch(e) {
      console.error("Play failed during export", e);
      clearInterval(checkInterval);
      if (recorder.state !== 'inactive') recorder.stop();
    }
  };

  const handleDiscardRecording = () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl); 
      setRecordedUrl(null);
    }
    const vid = sourceVideoRef.current;
    if (vid && activeClip) {
      vid.currentTime = activeClip.start;
      vid.pause();
    }
    setIsPlaying(false);
  };

  useEffect(() => { return () => { if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop()); }; }, []);

  const applyTemplate = (id) => {
    setTemplateId(id); 
    setShowGallery(false);
    
    const t = templateMap[id];
    if (t.profile) setProfilePos({ x: t.profile.x, y: t.profile.y, r: t.profile.r });
    setPipPos({ x: 450, y: 800, w: 280, h: 380 });
    
    let newRecents = [id, ...recents.filter(r => r !== id)].slice(0, 5);
    setRecents(newRecents);
    localStorage.setItem("reactor-recents", JSON.stringify(newRecents));
  };

  const toggleFavorite = (id) => {
    const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem("reactor-favorites", JSON.stringify(next));
  };

  const filteredTemplates = useMemo(() => {
    let list = TEMPLATES;
    if (activeCategory === "Favorites") list = list.filter(t => favorites.includes(t.id));
    else if (activeCategory !== "All") list = list.filter(t => t.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q)) || t.category.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, searchQuery, favorites]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0a0f1a', color: '#fff', overflow: 'hidden' }}>
      <input type="file" ref={el => fileInputRefs.current.video = el} onChange={(e) => handleImport(e, 'video')} accept="video/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.broll = el} onChange={(e) => handleImport(e, 'broll')} accept="video/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.image = el} onChange={(e) => handleImport(e, 'image')} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.audio = el} onChange={(e) => handleImport(e, 'audio')} accept="audio/*" style={{ display: 'none' }} />

      <div style={{ padding: '12px 16px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate('/studio')} style={topBtnStyle}><ArrowLeft size={18} /></button>
          <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Reactor Studio</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={handleClearProject} style={topBtnStyle} title="Clear Project & Start Over"><Eraser size={16} /> Clear</button>
          <button onClick={() => setShowGallery(true)} style={topBtnStyle} disabled={isExporting || recordedUrl}><LayoutGrid size={16} /> Templates</button>
          
          {recordedUrl ? (
            <>
              <button onClick={handleDiscardRecording} style={{ ...topBtnStyle, background: '#ef4444', borderColor: '#ef4444' }}>
                <Trash2 size={16} /> Discard
              </button>
              <a href={recordedUrl} download={`zokascore_clip_${activeClipId}.webm`} style={{ ...topBtnStyle, background: '#10b981', borderColor: '#10b981', textDecoration: 'none' }}>
                <Download size={16} /> Download Clip
              </a>
            </>
          ) : (
            <button onClick={handleExportVideo} disabled={!sourceLoaded || isExporting} style={{ ...topBtnStyle, background: '#10b981', borderColor: '#10b981', opacity: !sourceLoaded || isExporting ? 0.5 : 1 }}>
              {isExporting ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} Export Clip
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        
        <div style={{ width: '60px', background: '#111827', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: '16px' }}>
          <button onClick={() => fileInputRefs.current.video?.click()} style={sideBtnStyle} title="Replace Main Video" disabled={isExporting || recordedUrl}><Upload size={20} /></button>
          <button onClick={() => fileInputRefs.current.broll?.click()} style={{...sideBtnStyle, color: brollLoaded ? '#10b981' : '#64748b'}} title="Add 2nd Video (B-Roll)" disabled={isExporting || recordedUrl}><Film size={20} /></button>
          <button onClick={() => fileInputRefs.current.image?.click()} style={sideBtnStyle} title="Avatar" disabled={isExporting || recordedUrl}><User size={20} /></button>
          <button onClick={() => fileInputRefs.current.audio?.click()} style={sideBtnStyle} title="Audio" disabled={isExporting || recordedUrl}><Music size={20} /></button>
          <button onClick={startCamera} style={{...sideBtnStyle, color: cameraOn ? '#10b981' : '#64748b'}} title="Camera" disabled={isExporting || recordedUrl}><Camera size={20} /></button>
          <button onClick={() => setShowGuides(!showGuides)} style={{...sideBtnStyle, color: showGuides ? '#10b981' : '#64748b'}} title="Guides"><Grid3x3 size={20} /></button>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', background: '#000', minHeight: 0 }}>
          <div 
            style={{ position: 'relative', height: '100%', aspectRatio: '9/16', borderRadius: '12px', overflow: 'hidden', border: '2px solid #1f2937', touchAction: 'none', boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}
            onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
          >
            <canvas ref={canvasRef} width={720} height={1280} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {!sourceLoaded && !recordedUrl && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#64748b', cursor: 'pointer' }} onClick={() => fileInputRefs.current.video?.click()}>
                <Upload size={40} style={{ marginBottom: '12px' }} />
                <p style={{ fontWeight: 700 }}>Import Main Video</p>
              </div>
            )}
            {recordedUrl && <video src={recordedUrl} controls autoPlay loop style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />}
            {isExporting && (
              <div style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(239,68,68,0.9)', padding: '4px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, pointerEvents: 'none' }}>
                <Loader size={12} className="animate-spin" /> EXPORTING
              </div>
            )}
          </div>
        </div>

        <div style={{ width: '300px', background: '#111827', borderLeft: '1px solid #1f2937', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={panelStyle}>
            <div style={panelTitleStyle}><Move size={14} /> Grid Edit Mode</div>
            <button onClick={() => setEditMode(!editMode)} style={{ ...inputStyle, background: editMode ? '#10b981' : '#1f2937', color: editMode ? '#fff' : '#94a3b8', textAlign: 'center', cursor: 'pointer', fontWeight: 700 }}>
              {editMode ? 'DRAGGING ENABLED' : 'ENABLE FREE DRAG'}
            </button>
            <span style={{ fontSize: '10px', color: '#64748b' }}>Move Profile & Second Video anywhere on any template.</span>
          </div>

          {sourceLoaded && (
            <div style={panelStyle}>
              <div style={panelTitleStyle}><Scissors size={14} /> Trim & Clips</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', flex: 1 }}>Playhead: {currentTime.toFixed(1)}s / {duration.toFixed(1)}s</span>
                <button onClick={handleSplit} style={{ background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} disabled={isExporting || recordedUrl}>
                  <Scissors size={12} /> Split
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                {clips.map((c, i) => (
                  <div key={c.id} onClick={() => { setActiveClipId(c.id); if (sourceVideoRef.current) sourceVideoRef.current.currentTime = c.start; }} 
                       style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: activeClipId === c.id ? '#10b981' : '#1f2937', color: activeClipId === c.id ? '#fff' : '#94a3b8', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                    <span>Clip {i + 1}</span>
                    <span style={{ fontSize: '10px', opacity: 0.9 }}>{c.start.toFixed(1)}s - {c.end.toFixed(1)}s</span>
                    {clips.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteClip(c.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, display: 'flex' }}><Trash2 size={12} /></button>
                    )}
                  </div>
                ))}
              </div>
              <span style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Select a clip to preview & export it individually.</span>
            </div>
          )}

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Sparkles size={14} /> Effects & Animations</div>
            <label style={{ fontSize: '11px', color: '#94a3b8' }}>Video Effect</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {VIDEO_EFFECTS.map(f => (
                <button key={f.id} onClick={() => setVideoEffect(f.id)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: videoEffect === f.id ? '#10b981' : '#1f2937', color: videoEffect === f.id ? '#fff' : '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>{f.name}</button>
              ))}
            </div>
            <label style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Caption Animation</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {TEXT_ANIMATIONS.map(f => (
                <button key={f.id} onClick={() => setTextAnimation(f.id)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: textAnimation === f.id ? '#10b981' : '#1f2937', color: textAnimation === f.id ? '#fff' : '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>{f.name}</button>
              ))}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Palette size={14} /> Brand Kit</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {BRAND_PRESETS.map(p => (
                <button key={p.name} onClick={() => setAccentColor(p.color)} style={{ width: '30px', height: '30px', borderRadius: '50%', background: p.color, border: accentColor === p.color ? '2px solid #fff' : '2px solid #334155', cursor: 'pointer' }} title={p.name}></button>
              ))}
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'none', border: '2px solid #334155', cursor: 'pointer', padding: 0 }} />
            </div>
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Type size={14} /> Font Pack</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.keys(FONT_PACKS).map(f => (
                <button key={f} onClick={() => setFontPack(f)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155', background: fontPack === f ? '#10b981' : '#1f2937', color: fontPack === f ? '#fff' : '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>{f}</button>
              ))}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Shield size={14} /> Football Assets</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={homeLogoUrl} onChange={(e) => setHomeLogoUrl(e.target.value)} placeholder="Home Logo URL" style={inputStyle} disabled={isExporting || recordedUrl} />
              <input type="number" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} style={{...inputStyle, width: '50px', flex: 'none'}} disabled={isExporting || recordedUrl} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={awayLogoUrl} onChange={(e) => setAwayLogoUrl(e.target.value)} placeholder="Away Logo URL" style={inputStyle} disabled={isExporting || recordedUrl} />
              <input type="number" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} style={{...inputStyle, width: '50px', flex: 'none'}} disabled={isExporting || recordedUrl} />
            </div>
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><User size={14} /> Social Details & Fonts</div>
            
            <label style={{ fontSize: '11px', color: '#94a3b8' }}>Display Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display Name" style={inputStyle} disabled={isExporting || recordedUrl} />
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="color" value={nameColor} onChange={(e) => setNameColor(e.target.value)} style={{...inputStyle, width: '40px', padding: '2px', height: '38px'}} title="Name Color" />
              <input type="number" value={nameSize || ''} onChange={(e) => setNameSize(e.target.value ? parseInt(e.target.value) : null)} placeholder="Name Size (px)" style={{...inputStyle, width: '100px'}} title="Name Size" />
              <button onClick={() => setShowVerified(!showVerified)} style={{ ...inputStyle, background: showVerified ? '#1d9bf0' : '#1f2937', color: showVerified ? '#fff' : '#94a3b8', textAlign: 'center', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <BadgeCheck size={16} /> Tick
              </button>
            </div>

            <label style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Username / Handle</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" style={inputStyle} disabled={isExporting || recordedUrl} />
            
            <label style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Caption</label>
            <textarea value={povCaption} onChange={(e) => setPovCaption(e.target.value)} placeholder="Caption" style={{...inputStyle, height: '60px', resize: 'none'}} disabled={isExporting || recordedUrl} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="color" value={captionColor} onChange={(e) => setCaptionColor(e.target.value)} style={{...inputStyle, width: '40px', padding: '2px', height: '38px'}} title="Caption Color" />
              <input type="number" value={captionSize || ''} onChange={(e) => setCaptionSize(e.target.value ? parseInt(e.target.value) : null)} placeholder="Caption Size (px)" style={{...inputStyle, width: '100px'}} title="Caption Size" />
            </div>
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Layers size={14} /> Layers</div>
            {Object.keys(layers).map(key => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1', textTransform: 'capitalize', cursor: 'pointer', marginBottom: '6px' }}>
                <input type="checkbox" checked={layers[key]} onChange={() => setLayers(l => ({...l, [key]: !l[key]}))} style={{ accentColor: '#10b981' }} disabled={isExporting || recordedUrl} /> {key}
              </label>
            ))}
          </div>

          <div style={panelStyle}>
            <div style={panelTitleStyle}><Sliders size={14} /> Filters</div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '4px 10px', borderRadius: '20px', border: '1px solid #334155', background: filter === f.id ? '#10b981' : '#1f2937', color: filter === f.id ? '#fff' : '#94a3b8', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }} disabled={isExporting || recordedUrl}>{f.name}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => setIsMuted(!isMuted)} style={{ flex: 1, background: '#1f2937', border: '1px solid #334155', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer', fontSize: '12px' }} disabled={isExporting || recordedUrl}>
                {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />} {isMuted ? 'Muted' : 'Audio On'}
              </button>
              <button onClick={() => setFadeIn(!fadeIn)} style={{ flex: 1, background: fadeIn ? '#10b981' : '#1f2937', border: '1px solid #334155', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer', fontSize: '12px' }} disabled={isExporting || recordedUrl}>
                Fade In: {fadeIn ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: '80px', background: '#111827', borderTop: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '0 24px' }}>
        <button onClick={() => setIsMuted(!isMuted)} style={bottomBtnStyle} title="Mute" disabled={isExporting || recordedUrl}><Volume2 size={20} /></button>
        <button onClick={togglePreview} disabled={!sourceLoaded || isExporting || recordedUrl} style={{ ...bottomBtnStyle, background: '#3b82f6', color: '#fff', width: '64px', height: '64px', opacity: !sourceLoaded || isExporting || recordedUrl ? 0.5 : 1 }} title="Preview Active Clip">
          {isPlaying ? <Pause size={28} fill="#fff" /> : <Play size={28} fill="#fff" />}
        </button>
        <button onClick={() => fileInputRefs.current.audio?.click()} style={bottomBtnStyle} title="Add Sound" disabled={isExporting || recordedUrl}><Music size={20} /></button>
      </div>

      {showGallery && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setShowGallery(false)}>
          <div style={{ width: '90%', maxWidth: '800px', height: '80vh', background: '#111827', borderRadius: '16px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Search size={20} color="#64748b" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search templates..." style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: '16px', outline: 'none' }} />
              <button onClick={() => setShowGallery(false)} style={topBtnStyle}><X size={18} /></button>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2937', display: 'flex', gap: '8px', overflowX: 'auto' }}>
              {["All", "Favorites", "Pro", "TikTok", "Instagram", "YouTube", "Gaming", "Podcast", "Football", "Minimal"].map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: '6px 16px', borderRadius: '20px', border: '1px solid #334155', background: activeCategory === cat ? '#10b981' : '#1f2937', color: activeCategory === cat ? '#fff' : '#94a3b8', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>{cat}</button>
              ))}
            </div>
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
              {filteredTemplates.map(t => (
                <div key={t.id} style={{ background: '#1f2937', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', border: templateId === t.id ? '2px solid #10b981' : '2px solid #334155', position: 'relative' }} onClick={() => applyTemplate(t.id)}>
                  <div style={{ height: '200px', background: t.preview.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px', position: 'relative' }}>
                    {t.preview.layout === 'pov' && (
                      <>
                        <div style={{ position: 'absolute', top: '15px', left: '15px', width: '24px', height: '24px', background: '#fff', borderRadius: '50%', border: '2px solid #1d9bf0' }}></div>
                        <div style={{ position: 'absolute', top: '14px', left: '48px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <div style={{ width: '40px', height: '8px', background: '#fff', borderRadius: '4px' }}></div>
                          <div style={{ width: '60px', height: '6px', background: '#aaa', borderRadius: '4px' }}></div>
                        </div>
                        <div style={{ position: 'absolute', top: '50px', left: '15px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ width: '120px', height: '6px', background: '#fff', borderRadius: '4px' }}></div>
                          <div style={{ width: '100px', height: '6px', background: '#fff', borderRadius: '4px' }}></div>
                        </div>
                      </>
                    )}
                    {t.preview.layout === 'tl' && <div style={{ width: '30px', height: '30px', background: '#fff', borderRadius: '50%', alignSelf: 'flex-start', marginLeft: '10px', marginTop: '10px' }}></div>}
                    {t.preview.layout === 'tr' && <div style={{ width: '30px', height: '30px', background: '#fff', borderRadius: '50%', alignSelf: 'flex-end', marginRight: '10px', marginTop: '10px' }}></div>}
                    {t.preview.layout === 'bl' && <div style={{ width: '30px', height: '30px', background: '#fff', borderRadius: '50%', alignSelf: 'flex-start', marginLeft: '10px', marginBottom: '10px' }}></div>}
                    {t.preview.layout === 'br' && <div style={{ width: '30px', height: '30px', background: '#fff', borderRadius: '50%', alignSelf: 'flex-end', marginRight: '10px', marginBottom: '10px' }}></div>}
                    {(t.preview.layout === 'center' || t.preview.layout === 'split' || t.preview.layout === 'news' || t.preview.layout === 'custom') && (
                      <div style={{ width: '60%', height: '10px', background: '#fff', borderRadius: '4px' }}></div>
                    )}
                  </div>
                  <div style={{ padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{t.title}</span>
                    <button onClick={(e) => { e.stopPropagation(); toggleFavorite(t.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: favorites.includes(t.id) ? '#f59e0b' : '#64748b' }}>
                      <Star size={14} fill={favorites.includes(t.id) ? '#f59e0b' : 'none'} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <video ref={sourceVideoRef} style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '720px', height: '1280px', opacity: 0, pointerEvents: 'none' }} playsInline preload="auto" />
      <video ref={brollVideoRef} style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '320px', height: '434px', opacity: 0, pointerEvents: 'none' }} playsInline muted preload="auto" />
      <video ref={webcamVideoRef} style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '320px', height: '434px', opacity: 0, pointerEvents: 'none' }} playsInline muted preload="auto" />
      <audio ref={audioRef} style={{ display: 'none' }} />

      <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}</style>
    </div>
  );
}

const topBtnStyle = { display: 'flex', alignItems: 'center', gap: '6px', background: '#1f2937', border: '1px solid #334155', color: '#fff', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' };
const sideBtnStyle = { width: '40px', height: '40px', borderRadius: '8px', background: '#1f2937', border: '1px solid #334155', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' };
const bottomBtnStyle = { width: '48px', height: '48px', borderRadius: '50%', background: '#1f2937', border: '1px solid #334155', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const panelStyle = { background: '#0f172a', border: '1px solid #1f2937', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' };
const panelTitleStyle = { display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' };
const inputStyle = { background: '#1f2937', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', color: '#fff', outline: 'none', width: '100%', fontSize: '13px' };