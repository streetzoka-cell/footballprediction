import React, { useReducer, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, Download, Upload, Camera, Music, User, Volume2, VolumeX, 
  Sliders, Move, Palette, Search, Star, LayoutGrid, Layers, Type, Grid3x3, X, Film, Shield, Play, Pause, Loader, Trash2, BadgeCheck, Sparkles, Eraser, Scissors, Cpu, Image as ImageIcon, Crop, Wand2
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
  { id: 'pro_aura', title: 'Pro: Aura Maximus', category: 'Pro', tags: ['viral', 'cinematic', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #000, #333)', layout: 'pro'} },
  { id: 'pro_goal', title: 'Pro: Goal Machine', category: 'Pro', tags: ['viral', 'goal', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #dc2626, #000)', layout: 'pro'} },
  { id: 'pro_chills', title: 'Pro: Chill Vibes', category: 'Pro', tags: ['viral', 'chill', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #4338ca, #312e81)', layout: 'pro'} },
  { id: 'pro_skill', title: 'Pro: Skill Show', category: 'Pro', tags: ['viral', 'skill', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #065f46, #000)', layout: 'pro'} },
  { id: 'pro_news', title: 'Pro: Breaking News', category: 'Pro', tags: ['viral', 'news', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #0c4a6e, #000)', layout: 'pro'} },
  { id: 'pro_hype', title: 'Pro: Hype Beast', category: 'Pro', tags: ['viral', 'hype', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #be185d, #000)', layout: 'pro'} },
  { id: 'pro_cinematic', title: 'Pro: Cinematic Wide', category: 'Pro', tags: ['viral', 'cinematic', 'intro'], pip: false, video: {x:0,y:140,w:720,h:1000}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #111, #000)', layout: 'pro'} },
  { id: 'pro_signature', title: 'Pro: ZOKA Signature', category: 'Pro', tags: ['viral', 'zoka', 'intro'], pip: false, video: {x:0,y:0,w:720,h:1280}, bg:'#000', preview: {bg: 'linear-gradient(135deg, #047857, #000)', layout: 'pro'} },
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

// --- HELPER: Smart PIP Position Calculator ---
const getPipPosForTemplate = (template) => {
  if (template.pipPos) return template.pipPos;
  const w = 280, h = 380;
  const p = template.profile;
  const cap = template.caption;
  const hasHeader = !!template.header;
  const hasTicker = !!template.ticker;
  const hasSplit = template.video && template.video.w < 500; 

  if (hasSplit) return { x: 380, y: 100, w: 320, h: 450 };

  if (p) {
    if (p.y < 200 && p.x < 360) return { x: 410, y: 830, w, h };        
    if (p.y < 200 && p.x > 360) return { x: 30, y: 830, w, h };         
    if (p.y > 1000 && p.x < 360) return { x: 410, y: 50, w, h };        
    if (p.y > 1000 && p.x > 360) return { x: 30, y: 50, w, h };         
  }

  if (cap && cap.y > 900 && cap.center) return { x: 410, y: 50, w, h };  
  if (cap && cap.y < 200) return { x: 410, y: 830, w, h };               

  if (hasHeader && hasTicker) return { x: 420, y: 730, w: 270, h: 350 };

  if (template.video && (template.video.x > 0 || template.video.y > 0)) {
    const v = template.video;
    if (v.y > 100) return { x: 430, y: 20, w: 260, h: 80 };             
    return { x: 430, y: v.y + v.h + 20, w: 260, h: 200 };               
  }

  return { x: 410, y: 830, w, h };
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
  media: { sourceLoaded: false, brollLoaded: false, cameraOn: false, profileSrc: null, logoSrc: null, audioName: '' },
  editor: {
    templateId: 'pro_aura', displayName: 'Manu', username: 'manuel_palmer', povCaption: 'POV: You just witnessed greatness 🔥',
    accentColor: '#10b981', fontPack: 'TikTok', nameColor: '#ffffff', nameSize: null, captionColor: '#ffffff', captionSize: null,
    showVerified: true, editMode: false, videoEffect: 'none', textAnimation: 'none', 
    homeLogoUrl: '', awayLogoUrl: '', homeScore: 0, awayScore: 0,
    isMuted: false, filter: 'none', fadeIn: false, 
    pipPos: { x: 410, y: 830, w: 280, h: 380 }, pipScale: 1.0, pipFrameStyle: 'accent', profilePos: { x: 50, y: 70, r: 35 },
    introEnabled: true, introStyle: 'glitch_reveal', introWatermark: true,
    videoZoom: 1, videoPanX: 0, videoPanY: 0
  },
  timeline: { clips: [{ id: 'clip1', start: 0, end: 0 }], activeClipId: 'clip1', duration: 0, currentTime: 0, isPlaying: false },
  ui: { activePanel: null, showGuides: false, isExporting: false, exportFormat: null, exportFps: null, recordedUrl: null, recordedExt: 'webm', isLoadingProject: true,
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
  const location = useLocation(); 
  const fixtureData = location.state; 
  
  const [state, dispatch] = useReducer(studioReducer, initialState);
  
  const sourceVideoRef = useRef(null);
  const brollVideoRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(document.createElement('canvas')); 
  const exportCanvasRef = useRef(null); // 1080x1920 export canvas
  const fileInputRefs = useRef({ video: null, broll: null, image: null, audio: null, logo: null });
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
          templateId: 'news_blue' 
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

  // --- 3. OVERLAY CACHING (REF-BASED FOR SMOOTHNESS) ---
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
  };

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
      currentTimeRef.current = sVid.currentTime;
      if (Math.abs(sVid.currentTime - timeline.currentTime) > 0.3) {
        dispatch({ type: 'SET_TIMELINE', payload: { currentTime: sVid.currentTime } });
      }
      if (activeClip) {
        if (sVid.currentTime < activeClip.start) sVid.currentTime = activeClip.start;
        if (timeline.isPlaying && sVid.currentTime >= activeClip.end - 0.05) { sVid.pause(); sVid.currentTime = activeClip.start; sVid.play(); }
      }
      
      if (ui.layers.video) {
        ctx.save(); const v = activeTemplate.video;
        const cTime = currentTimeRef.current;
        const aProg = activeClip ? Math.min((cTime - activeClip.start) / (activeClip.end - activeClip.start), 1) : 0;

        if (editor.videoEffect === 'zoom_in') { const s = 1 + aProg * 0.3; ctx.translate(v.x + v.w/2, v.y + v.h/2); ctx.scale(s, s); ctx.translate(-(v.x + v.w/2), -(v.y + v.h/2)); }
        else if (editor.videoEffect === 'shake') ctx.translate((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
        else if (editor.videoEffect === 'pulse') { const s = 1 + Math.sin(cTime * 8) * 0.04; ctx.translate(v.x + v.w/2, v.y + v.h/2); ctx.scale(s, s); ctx.translate(-(v.x + v.w/2), -(v.y + v.h/2)); }
        else if (editor.videoEffect === 'ken_burns') { const s = 1 + aProg * 0.15; const tx = aProg * 30; ctx.translate(v.x + v.w/2 - tx, v.y + v.h/2); ctx.scale(s, s); ctx.translate(-(v.x + v.w/2), -(v.y + v.h/2)); }

        ctx.filter = editor.filter;
        
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
      
      // --- FRAMED & SCALED PIP RENDERING ---
      const showPiP = (media.cameraOn || media.brollLoaded) && ui.layers.pip;
      const aPiPVid = media.brollLoaded ? brollVideoRef.current : webcamVideoRef.current;
      if (aPiPVid && showPiP) {
        const baseP = editor.pipPos;
        const scale = editor.pipScale || 1.0;
        const pW = Math.round(baseP.w * scale);
        const pH = Math.round(baseP.h * scale);
        const pX = Math.round(baseP.x + (baseP.w - pW) / 2);
        const pY = Math.round(baseP.y + (baseP.h - pH) / 2);
        const frameStyle = editor.pipFrameStyle || 'accent';
        const radius = 16;
        const vw = aPiPVid.videoWidth, vh = aPiPVid.videoHeight;

        ctx.save();
        if (frameStyle === 'accent') {
          ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 4;
          ctx.fillStyle = editor.accentColor;
          roundRectPath(ctx, pX - 4, pY - 4, pW + 8, pH + 8, radius + 4);
          ctx.fill();
        } else if (frameStyle === 'white') {
          ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 4;
          ctx.fillStyle = '#fff';
          roundRectPath(ctx, pX - 4, pY - 4, pW + 8, pH + 8, radius + 4);
          ctx.fill();
        } else if (frameStyle === 'glow') {
          ctx.shadowColor = editor.accentColor; ctx.shadowBlur = 30;
          ctx.strokeStyle = editor.accentColor; ctx.lineWidth = 3;
          roundRectPath(ctx, pX, pY, pW, pH, radius);
          ctx.stroke();
        } else if (frameStyle === 'minimal') {
          ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          roundRectPath(ctx, pX, pY, pW, pH, radius);
          ctx.fill();
        }
        ctx.restore();

        ctx.save();
        roundRectPath(ctx, pX, pY, pW, pH, radius);
        ctx.clip();
        if (vw && vh) {
          if (!media.brollLoaded) {
            ctx.scale(-1, 1); ctx.translate(-W, 0);
            drawCover(ctx, aPiPVid, W - pX - pW, pY, pW, pH);
          } else {
            drawCover(ctx, aPiPVid, pX, pY, pW, pH);
          }
        }
        ctx.restore();

        if (frameStyle !== 'minimal' && frameStyle !== 'glow') {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1;
          roundRectPath(ctx, pX, pY, pW, pH, radius);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    
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
    const r = canvasRef.current.getBoundingClientRect(); const sx = 720 / r.width, sy = 1280 / r.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
  };

  const handlePointerDown = (e) => {
    if (!editor.editMode && !activeTemplate.isCustom && !media.brollLoaded && !media.cameraOn) return;
    const { x, y } = getCanvasCoords(e);
    
    if ((activeTemplate.isCustom || editor.editMode) && media.profileSrc) { 
      if (Math.hypot(x - editor.profilePos.x, y - editor.profilePos.y) <= editor.profilePos.r) { 
        dragRef.current = { target: 'profile', offsetX: x - editor.profilePos.x, offsetY: y - editor.profilePos.y }; return; 
      } 
    }
    
    if (media.brollLoaded || media.cameraOn) { 
      const baseP = editor.pipPos;
      const scale = editor.pipScale || 1.0;
      const pW = Math.round(baseP.w * scale);
      const pH = Math.round(baseP.h * scale);
      const pX = Math.round(baseP.x + (baseP.w - pW) / 2);
      const pY = Math.round(baseP.y + (baseP.h - pH) / 2);
      
      if (x >= pX && x <= pX + pW && y >= pY && y <= pY + pH) {
        dragRef.current = { target: 'pip', offsetX: x - pX, offsetY: y - pY };
      }
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.target) return; 
    e.preventDefault(); 
    const { x, y } = getCanvasCoords(e); 
    
    if (dragRef.current.target === 'pip') { 
      const baseP = editor.pipPos;
      const scale = editor.pipScale || 1.0;
      const pW = Math.round(baseP.w * scale);
      const pH = Math.round(baseP.h * scale);
      
      let nX = Math.max(0, Math.min(x - dragRef.current.offsetX, 720 - pW));
      let nY = Math.max(0, Math.min(y - dragRef.current.offsetY, 1280 - pH));
      
      const sx = [0, 360 - pW/2, 720 - pW];
      sx.forEach(pt => { if (Math.abs(nX - pt) < 20) nX = pt; });
      
      const newBaseX = nX - (baseP.w - pW) / 2;
      const newBaseY = nY - (baseP.h - pH) / 2;
      
      dispatch({ type: 'SET_EDITOR', payload: { pipPos: { ...baseP, x: newBaseX, y: newBaseY } } }); 
    } 
    else if (dragRef.current.target === 'profile') { 
      let nX = Math.max(editor.profilePos.r, Math.min(x - dragRef.current.offsetX, 720 - editor.profilePos.r)); 
      let nY = Math.max(editor.profilePos.r, Math.min(y - dragRef.current.offsetY, 1280 - editor.profilePos.r)); 
      dispatch({ type: 'SET_EDITOR', payload: { profilePos: { ...editor.profilePos, x: nX, y: nY } } }); 
    }
  };

  const handlePointerUp = () => dragRef.current.target = null;

  const handleExportVideo = async (format = 'mp4', fps = 30) => {
    const vid = sourceVideoRef.current; if (!canvasRef.current || ui.isExporting || !vid || !activeClip) return;
    
    const exportC = document.createElement('canvas');
    exportC.width = 1080;
    exportC.height = 1920;
    exportCanvasRef.current = exportC;
    
    dispatch({ type: 'SET_UI', payload: { isExporting: true, exportFormat: format, exportFps: fps } });
    dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: false } });
    vid.pause(); vid.currentTime = activeClip.start;
    await new Promise(r => setTimeout(r, 200));
    
    let trueDur = vid.duration; 
    if (!isFinite(trueDur)) { vid.currentTime = 1e101; await new Promise(r => setTimeout(r, 200)); trueDur = vid.duration; vid.currentTime = activeClip.start; await new Promise(r => setTimeout(r, 200)); }
    let end = activeClip.end && isFinite(activeClip.end) ? activeClip.end : trueDur; 
    if (end > trueDur) end = trueDur;
    if (activeClip.start >= end - 0.1) { 
      alert("Invalid clip duration."); 
      dispatch({ type: 'SET_UI', payload: { isExporting: false, exportFormat: null, exportFps: null } }); 
      exportCanvasRef.current = null;
      return; 
    }
    
    await new Promise(r => setTimeout(r, 300));
    const wM = vid.muted, wV = vid.volume; vid.muted = false; vid.volume = 0;
    
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
      if (vid.captureStream) { 
        try { const vS = vid.captureStream(); if (vS.getAudioTracks().length > 0) { aC.createMediaStreamSource(vS).connect(aD); hA = true; } } catch {} 
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
      const mp4Codecs = [
        'video/mp4;codecs=avc1.640029,mp4a.40.2', 
        'video/mp4;codecs=avc1.640028,mp4a.40.2', 
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 
        'video/mp4;codecs=h264',
        'video/mp4'
      ];
      mT = mp4Codecs.find(c => MediaRecorder.isTypeSupported(c));
      
      if (mT) {
        fileExt = 'mp4';
      } else {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
          mT = 'video/webm;codecs=h264';
          fileExt = 'webm';
          alert("⚠️ Your browser restricts direct .mp4 recording. Exporting as H.264 .webm instead (still 1080p 60fps/30fps). For native .mp4, use Safari.");
        } else {
          mT = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8';
          fileExt = 'webm';
          alert("⚠️ Your browser restricts direct .mp4 recording. Exporting as standard .webm. For native .mp4, use Safari.");
        }
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
      if (fileExt === 'webm') {
        b = await fixWebmDuration(b, (end - activeClip.start) * 1000);
      }
      dispatch({ type: 'SET_UI', payload: { recordedUrl: URL.createObjectURL(b), recordedExt: fileExt, isExporting: false, exportFormat: null, exportFps: null } }); 
      vid.pause(); 
      if (audioRef.current) audioRef.current.pause(); 
      vid.muted = wM; vid.volume = wV; 
      cS.getTracks().forEach(t => t.stop()); 
      if (aC) aC.close(); 
      exportCanvasRef.current = null; 
    };
    
    const cI = setInterval(() => { 
      if (vid.currentTime >= end - 0.05 || vid.ended) { 
        clearInterval(cI); 
        if (r.state !== 'inactive') r.stop(); 
      } 
    }, 50);
    
    r.start(100); 
    try { await vid.play(); } catch {}
  };

  const applyTemplate = (id) => {
    const t = templateMap[id];
    if (!t) return; 
    dispatch({ 
      type: 'SET_EDITOR', 
      payload: { 
        templateId: id, 
        profilePos: t.profile ? { x: t.profile.x, y: t.profile.y, r: t.profile.r } : editor.profilePos, 
        pipPos: getPipPosForTemplate(t),
        pipScale: 1.0 
      } 
    });
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
    if (ui.searchQuery) { const q = ui.searchQuery.toLowerCase(); l = l.filter(t => t.title.toLowerCase().includes(q) || t.tags.some(tg => tg.includes(q))); }
    return l;
  }, [ui.activeCategory, ui.searchQuery, ui.favorites]);

  return (
    <div className="rs-container">
      <input type="file" ref={el => fileInputRefs.current.video = el} onChange={(e) => handleImport(e, 'video')} accept="video/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.broll = el} onChange={(e) => handleImport(e, 'broll')} accept="video/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.image = el} onChange={(e) => handleImport(e, 'image')} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.logo = el} onChange={(e) => handleImport(e, 'logo')} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.audio = el} onChange={(e) => handleImport(e, 'audio')} accept="audio/*" style={{ display: 'none' }} />

      {/* Top Header */}
      <div className="rs-header">
        <div className="rs-header-left">
          <button onClick={() => navigate('/studio')} className="rs-top-btn"><ArrowLeft size={18} /></button>
          <h1 className="rs-header-title"><Cpu size={18} color="#10b981" /> Reactor Pro</h1>
        </div>
        <div className="rs-header-right">
          <button onClick={handleClearProject} className="rs-top-btn" title="Clear Project"><Eraser size={16} /> Clear</button>
          {ui.recordedUrl ? (
            <>
              <button onClick={() => dispatch({ type: 'SET_UI', payload: { recordedUrl: null } })} className="rs-top-btn rs-btn-red"><Trash2 size={16} /> Discard</button>
              <a href={ui.recordedUrl} download={`zokascore_clip.${ui.recordedExt || 'webm'}`} className="rs-top-btn rs-btn-accent"><Download size={16} /> Save</a>
            </>
          ) : (
            <>
              <button onClick={() => handleExportVideo('mp4', 30)} disabled={!media.sourceLoaded || ui.isExporting} className="rs-top-btn rs-btn-accent" title="Export 1080p MP4 at 30 FPS (~10 Mbps)">
                {ui.isExporting && ui.exportFormat === 'mp4' && ui.exportFps === 30 ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} MP4 30
              </button>
              <button onClick={() => handleExportVideo('mp4', 60)} disabled={!media.sourceLoaded || ui.isExporting} className="rs-top-btn rs-btn-accent" title="Export 1080p MP4 at 60 FPS (~15 Mbps)">
                {ui.isExporting && ui.exportFormat === 'mp4' && ui.exportFps === 60 ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} MP4 60
              </button>
              <button onClick={() => handleExportVideo('webm', 30)} disabled={!media.sourceLoaded || ui.isExporting} className="rs-top-btn rs-btn-blue" title="Export 1080p WebM (Fast)">
                {ui.isExporting && ui.exportFormat === 'webm' ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} WebM
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="rs-canvas-area">
        <div className="rs-canvas-wrap"
          onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}>
          <canvas ref={canvasRef} width={720} height={1280} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {!media.sourceLoaded && !ui.recordedUrl && (
            <div className="rs-canvas-empty" onClick={() => fileInputRefs.current.video?.click()}>
              <Upload size={40} style={{ marginBottom: '12px' }} /><p style={{ fontWeight: 700 }}>Import Main Video</p>
            </div>
          )}
          {ui.recordedUrl && <video src={ui.recordedUrl} controls autoPlay loop style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />}
          {ui.isExporting && <div className="rs-canvas-exporting"><Loader size={12} className="animate-spin" /> EXPORTING</div>}
        </div>
      </div>

      {/* Right Side Toolbar (TikTok Style) */}
      {!ui.isExporting && !ui.recordedUrl && (
        <div className="rs-toolbar-right">
          <button onClick={() => fileInputRefs.current.video?.click()} className="rs-side-btn" title="Replace Main Video"><Upload size={20} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'templates' ? null : 'templates' } })} className={`rs-side-btn ${ui.activePanel === 'templates' ? 'active' : ''}`} title="Templates"><LayoutGrid size={20} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'edit' ? null : 'edit' } })} className={`rs-side-btn ${ui.activePanel === 'edit' ? 'active' : ''}`} title="Edit & Layers"><Layers size={20} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'text' ? null : 'text' } })} className={`rs-side-btn ${ui.activePanel === 'text' ? 'active' : ''}`} title="Text & Fonts"><Type size={20} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'effects' ? null : 'effects' } })} className={`rs-side-btn ${ui.activePanel === 'effects' ? 'active' : ''}`} title="Effects"><Wand2 size={20} /></button>
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'audio' ? null : 'audio' } })} className={`rs-side-btn ${ui.activePanel === 'audio' ? 'active' : ''}`} title="Audio"><Music size={20} /></button>
          <button onClick={() => fileInputRefs.current.image?.click()} className="rs-side-btn" title="Avatar"><User size={20} /></button>
          <button onClick={() => fileInputRefs.current.logo?.click()} className={`rs-side-btn ${media.logoSrc ? 'active' : ''}`} title="Logo"><ImageIcon size={20} /></button>
          <button onClick={() => fileInputRefs.current.broll?.click()} className={`rs-side-btn ${media.brollLoaded ? 'active' : ''}`} title="Add 2nd Video (B-Roll)"><Film size={20} /></button>
          <button onClick={startCamera} className={`rs-side-btn ${media.cameraOn ? 'active' : ''}`} title="Camera"><Camera size={20} /></button>
        </div>
      )}

      {/* Bottom Controls & Timeline */}
      {media.sourceLoaded && (
        <div className="rs-bottom-controls">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '12px' }}>
            <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { isMuted: !editor.isMuted } })} className="rs-action-btn" title="Mute"><Volume2 size={18} /></button>
            <button onClick={togglePreview} disabled={ui.isExporting || ui.recordedUrl} className="rs-play-btn" title="Preview Active Clip">
              {timeline.isPlaying ? <Pause size={28} fill="#0a0d14" /> : <Play size={28} fill="#0a0d14" />}
            </button>
            <button onClick={handleSplit} className="rs-action-btn" disabled={ui.isExporting || ui.recordedUrl} title="Split"><Scissors size={16} /></button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
            <span>0s</span>
            <span>{timeline.currentTime.toFixed(1)}s / {timeline.duration.toFixed(1)}s</span>
          </div>
          <div className="rs-timeline-track">
            {timeline.clips.map((c) => {
              const dur = timeline.duration || 1;
              const wPct = ((c.end - c.start) / dur) * 100;
              const lPct = (c.start / dur) * 100;
              const isAct = c.id === timeline.activeClipId;
              return (
                <div key={c.id} onClick={() => { dispatch({ type: 'SET_TIMELINE', payload: { activeClipId: c.id } }); sourceVideoRef.current.currentTime = c.start; }}
                  className={`rs-timeline-clip ${isAct ? 'active' : ''}`} style={{ left: `${lPct}%`, width: `${wPct}%` }}>
                  <div onMouseDown={(e) => handleTimelineDrag(e, c.id, 'resize-l')} onTouchStart={(e) => handleTimelineDrag(e, c.id, 'resize-l')} className="rs-timeline-handle"></div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff', flex: 1, textAlign: 'center', pointerEvents: 'none' }}>Clip {timeline.clips.indexOf(c) + 1}</span>
                  <div onMouseDown={(e) => handleTimelineDrag(e, c.id, 'resize-r')} onTouchStart={(e) => handleTimelineDrag(e, c.id, 'resize-r')} className="rs-timeline-handle"></div>
                  {timeline.clips.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClip(c.id); }} className="rs-timeline-del"><X size={10} /></button>
                  )}
                </div>
              );
            })}
            <div className="rs-timeline-playhead" style={{ left: `${(timeline.currentTime / (timeline.duration || 1)) * 100}%` }}></div>
          </div>
        </div>
      )}

      {/* Sliding Control Panel */}
      {ui.activePanel && (
        <div className="rs-controls-panel">
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: null } })} className="rs-panel-close"><X size={18} /></button>
          
          {ui.activePanel === 'templates' && (
            <div>
              <h3 className="rs-panel-title"><LayoutGrid size={14} color="#10b981" /> Templates</h3>
              <div className="rs-gallery-cats" style={{ marginBottom: '12px' }}>
                {["All", "Favorites", "Pro", "TikTok", "Instagram", "YouTube", "Gaming", "Podcast", "Football", "Minimal"].map(cat => <button key={cat} onClick={() => dispatch({ type: 'SET_UI', payload: { activeCategory: cat } })} className={`rs-gallery-cat ${ui.activeCategory === cat ? 'active' : ''}`}>{cat}</button>)}
              </div>
              <div className="rs-gallery-grid">
                {filteredTemplates.map(t => (
                  <div key={t.id} className={`rs-gallery-card ${editor.templateId === t.id ? 'active' : ''}`} onClick={() => applyTemplate(t.id)}>
                    <div className="rs-gallery-preview" style={{ background: t.preview.bg }}>
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
                    <div className="rs-gallery-info">
                      <span className="rs-gallery-title">{t.title}</span>
                      <button onClick={(e) => { e.stopPropagation(); toggleFavorite(t.id); }} className={`rs-gallery-fav ${ui.favorites.includes(t.id) ? 'active' : ''}`}><Star size={14} fill={ui.favorites.includes(t.id) ? '#f59e0b' : 'none'} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ui.activePanel === 'edit' && (
            <div>
              <h3 className="rs-panel-title"><Layers size={14} color="#10b981" /> Edit & Layers</h3>
              
              {media.sourceLoaded && (
                <div className="rs-panel-box">
                  <h4 className="rs-box-title"><Crop size={12} /> Crop & Zoom</h4>
                  <label className="rs-label">Zoom: {editor.videoZoom.toFixed(1)}x</label>
                  <input type="range" min="1" max="4" step="0.1" value={editor.videoZoom} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoZoom: parseFloat(e.target.value) } })} className="rs-range" disabled={ui.isExporting || ui.recordedUrl} />
                  <label className="rs-label">Pan X: {editor.videoPanX.toFixed(1)}</label>
                  <input type="range" min="-1" max="1" step="0.1" value={editor.videoPanX} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoPanX: parseFloat(e.target.value) } })} className="rs-range" disabled={ui.isExporting || ui.recordedUrl} />
                  <label className="rs-label">Pan Y: {editor.videoPanY.toFixed(1)}</label>
                  <input type="range" min="-1" max="1" step="0.1" value={editor.videoPanY} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoPanY: parseFloat(e.target.value) } })} className="rs-range" disabled={ui.isExporting || ui.recordedUrl} />
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { videoZoom: 1, videoPanX: 0, videoPanY: 0 } })} className="rs-btn-sm">Reset Crop</button>
                </div>
              )}

              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Move size={12} /> Grid Edit Mode</h4>
                <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { editMode: !editor.editMode } })} className={`rs-btn-sm ${editor.editMode ? 'active' : ''}`} style={{ width: '100%' }}>
                  {editor.editMode ? 'DRAGGING ENABLED' : 'ENABLE FREE DRAG'}
                </button>
              </div>

              {(media.brollLoaded || media.cameraOn) && (
                <div className="rs-panel-box">
                  <h4 className="rs-box-title"><Film size={12} /> PIP / Reaction Controls</h4>
                  <label className="rs-label">PIP Size: {Math.round((editor.pipScale || 1) * 100)}%</label>
                  <input type="range" min="0.5" max="2" step="0.05" value={editor.pipScale || 1} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { pipScale: parseFloat(e.target.value) } })} className="rs-range" disabled={ui.isExporting || ui.recordedUrl} />
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipScale: 0.75 } })} className="rs-btn-sm">S</button>
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipScale: 1.0 } })} className="rs-btn-sm">M</button>
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipScale: 1.5 } })} className="rs-btn-sm">L</button>
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipScale: 2.0 } })} className="rs-btn-sm">XL</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipPos: { x: 30, y: 50, w: 280, h: 380 } } })} className="rs-btn-sm">↖ Top Left</button>
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipPos: { x: 410, y: 50, w: 280, h: 380 } } })} className="rs-btn-sm">↗ Top Right</button>
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipPos: { x: 30, y: 830, w: 280, h: 380 } } })} className="rs-btn-sm">↙ Bot Left</button>
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipPos: { x: 410, y: 830, w: 280, h: 380 } } })} className="rs-btn-sm">↘ Bot Right</button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {[{id:'accent',name:'Accent'},{id:'white',name:'White'},{id:'glow',name:'Glow'},{id:'minimal',name:'Minimal'}].map(s => <button key={s.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipFrameStyle: s.id } })} className={`rs-btn-sm ${(editor.pipFrameStyle || 'accent') === s.id ? 'active' : ''}`}>{s.name}</button>)}
                  </div>
                </div>
              )}

              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Layers size={12} /> Layers Visibility</h4>
                {Object.keys(ui.layers).map(key => (
                  <label key={key} className="rs-checkbox-label">
                    <input type="checkbox" checked={ui.layers[key]} onChange={() => dispatch({ type: 'SET_UI', payload: { layers: { ...ui.layers, [key]: !ui.layers[key] } } })} className="rs-checkbox" disabled={ui.isExporting || ui.recordedUrl} /> {key}
                  </label>
                ))}
              </div>
            </div>
          )}

          {ui.activePanel === 'text' && (
            <div>
              <h3 className="rs-panel-title"><Type size={14} color="#10b981" /> Text & Social</h3>
              
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><User size={12} /> Social Details</h4>
                <input type="text" value={editor.displayName} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { displayName: e.target.value } })} placeholder="Display Name" className="rs-input" disabled={ui.isExporting || ui.recordedUrl} />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <input type="color" value={editor.nameColor} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { nameColor: e.target.value } })} className="rs-input" style={{ width: '40px', padding: '2px', height: '36px' }} title="Name Color" />
                  <input type="number" value={editor.nameSize || ''} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { nameSize: e.target.value ? parseInt(e.target.value) : null } })} placeholder="Name Size" className="rs-input" style={{ width: '100px' }} title="Name Size" />
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { showVerified: !editor.showVerified } })} className={`rs-btn-sm ${editor.showVerified ? 'active' : ''}`} style={{ background: editor.showVerified ? '#1d9bf0' : '#151b26', borderColor: editor.showVerified ? '#1d9bf0' : '#151b26' }}><BadgeCheck size={16} /> Tick</button>
                </div>
                <input type="text" value={editor.username} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { username: e.target.value } })} placeholder="@username" className="rs-input" disabled={ui.isExporting || ui.recordedUrl} />
                <textarea value={editor.povCaption} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { povCaption: e.target.value } })} placeholder="Caption" className="rs-input" style={{ height: '60px', resize: 'none', marginBottom: '8px' }} disabled={ui.isExporting || ui.recordedUrl} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="color" value={editor.captionColor} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { captionColor: e.target.value } })} className="rs-input" style={{ width: '40px', padding: '2px', height: '36px' }} title="Caption Color" />
                  <input type="number" value={editor.captionSize || ''} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { captionSize: e.target.value ? parseInt(e.target.value) : null } })} placeholder="Caption Size" className="rs-input" style={{ width: '100px' }} title="Caption Size" />
                </div>
              </div>

              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Palette size={12} /> Brand Kit & Fonts</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {BRAND_PRESETS.map(p => <button key={p.name} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { accentColor: p.color } })} style={{ width: '30px', height: '30px', borderRadius: '50%', background: p.color, border: editor.accentColor === p.color ? '2px solid #fff' : '2px solid #151b26', cursor: 'pointer' }} title={p.name}></button>)}
                  <input type="color" value={editor.accentColor} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { accentColor: e.target.value } })} style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'none', border: '2px solid #151b26', cursor: 'pointer', padding: 0 }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.keys(FONT_PACKS).map(f => <button key={f} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { fontPack: f } })} className={`rs-btn-sm ${editor.fontPack === f ? 'active' : ''}`}>{f}</button>)}
                </div>
              </div>

              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Sparkles size={12} /> Caption Animation</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {TEXT_ANIMATIONS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { textAnimation: f.id } })} className={`rs-btn-sm ${editor.textAnimation === f.id ? 'active' : ''}`}>{f.name}</button>)}
                </div>
              </div>

              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Shield size={12} /> Football Assets</h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input type="text" value={editor.homeLogoUrl} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { homeLogoUrl: e.target.value } })} placeholder="Home Logo URL" className="rs-input" disabled={ui.isExporting || ui.recordedUrl} />
                  <input type="number" value={editor.homeScore} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { homeScore: e.target.value } })} className="rs-input" style={{ width: '50px', flex: 'none' }} disabled={ui.isExporting || ui.recordedUrl} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" value={editor.awayLogoUrl} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { awayLogoUrl: e.target.value } })} placeholder="Away Logo URL" className="rs-input" disabled={ui.isExporting || ui.recordedUrl} />
                  <input type="number" value={editor.awayScore} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { awayScore: e.target.value } })} className="rs-input" style={{ width: '50px', flex: 'none' }} disabled={ui.isExporting || ui.recordedUrl} />
                </div>
              </div>
            </div>
          )}

          {ui.activePanel === 'effects' && (
            <div>
              <h3 className="rs-panel-title"><Wand2 size={14} color="#10b981" /> Effects & Filters</h3>
              
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Wand2 size={12} /> Video Effects</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {VIDEO_EFFECTS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { videoEffect: f.id } })} className={`rs-btn-sm ${editor.videoEffect === f.id ? 'active' : ''}`}>{f.name}</button>)}
                </div>
              </div>

              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Sliders size={12} /> Filters</h4>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                  {FILTERS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { filter: f.id } })} className={`rs-btn-sm ${editor.filter === f.id ? 'active' : ''}`} style={{ borderRadius: '20px', whiteSpace: 'nowrap' }} disabled={ui.isExporting || ui.recordedUrl}>{f.name}</button>)}
                </div>
              </div>

              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Sparkles size={12} /> Cinematic Intro</h4>
                <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introEnabled: !editor.introEnabled } })} className={`rs-btn-sm ${editor.introEnabled ? 'active' : ''}`} style={{ width: '100%', marginBottom: '8px' }}>
                  {editor.introEnabled ? 'INTRO ENABLED' : 'ENABLE INTRO'}
                </button>
                {editor.introEnabled && (
                  <>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {INTRO_STYLES.map(s => <button key={s.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introStyle: s.id } })} className={`rs-btn-sm ${editor.introStyle === s.id ? 'active' : ''}`}>{s.name}</button>)}
                    </div>
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introWatermark: !editor.introWatermark } })} className="rs-btn-sm" style={{ width: '100%', color: editor.introWatermark ? '#10b981' : '#94a3b8' }}>
                      <ImageIcon size={12} /> Watermark After Intro: {editor.introWatermark ? 'On' : 'Off'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {ui.activePanel === 'audio' && (
            <div>
              <h3 className="rs-panel-title"><Music size={14} color="#10b981" /> Audio Controls</h3>
              <div className="rs-panel-box">
                <button onClick={() => fileInputRefs.current.audio?.click()} className="rs-btn-sm" style={{ width: '100%', marginBottom: '8px' }} disabled={ui.isExporting || ui.recordedUrl}>
                  <Music size={12} /> {media.audioName ? 'Change Audio' : 'Import Audio Track'}
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { isMuted: !editor.isMuted } })} className="rs-btn-sm" style={{ flex: 1 }} disabled={ui.isExporting || ui.recordedUrl}>
                    {editor.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />} {editor.isMuted ? 'Muted' : 'Audio On'}
                  </button>
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { fadeIn: !editor.fadeIn } })} className={`rs-btn-sm ${editor.fadeIn ? 'active' : ''}`} style={{ flex: 1 }} disabled={ui.isExporting || ui.recordedUrl}>Fade In: {editor.fadeIn ? 'On' : 'Off'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <video ref={sourceVideoRef} style={{ position: 'fixed', bottom: '2px', right: '2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} playsInline preload="auto" />
      <video ref={brollVideoRef} style={{ position: 'fixed', bottom: '2px', right: '2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} playsInline muted preload="auto" />
      <video ref={webcamVideoRef} style={{ position: 'fixed', bottom: '2px', right: '2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} playsInline muted preload="auto" />
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}