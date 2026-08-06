import React, { useReducer, useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Download, Upload, Camera, Music, User, Volume2, VolumeX,
  Sliders, Move, Palette, Search, Star, LayoutGrid, Layers, Type, Grid3x3, X, Film, Shield, Play, Pause, Loader, Trash2, BadgeCheck, Sparkles, Eraser, Scissors, Cpu, Image as ImageIcon, Crop, Wand2, Images, Gauge, Undo2, Redo2, Zap, Trophy, Flame, ChevronDown, ChevronUp, Maximize2, Minimize2, Cloud, Eye, EyeOff, Smile, Keyboard, Rewind, FastForward, Check, AlertTriangle, Info, ChevronRight, ChevronLeft, ArrowLeftRight
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// HELPER: WebM Duration Metadata Fixer (Crucial for iOS/WhatsApp playback)
// ═══════════════════════════════════════════════════════════
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
    if (view.getUint8(i) === 0x2A && view.getUint8(i + 1) === 0xD7 && view.getUint8(i + 2) === 0xB1) { timecodeOffset = i; break; }
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

// ═══════════════════════════════════════════════════════════
// HELPER: IndexedDB (Offline Storage)
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// HELPER: Canvas & Utilities
// ═══════════════════════════════════════════════════════════
const drawZokaLogo = (ctx, x, y, size, color = '#10b981') => {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size / 2, -size / 2); ctx.lineTo(size / 2, -size / 2); ctx.lineTo(size / 2, -size / 4);
  ctx.lineTo(-size / 4, size / 4); ctx.lineTo(size / 2, size / 4); ctx.lineTo(size / 2, size / 2);
  ctx.lineTo(-size / 2, size / 2); ctx.lineTo(-size / 2, size / 4); ctx.lineTo(size / 4, -size / 4);
  ctx.lineTo(-size / 2, -size / 4); ctx.closePath(); ctx.fill(); ctx.restore();
};

const haptic = (type = 'light') => {
  if (navigator.vibrate) {
    if (type === 'light') navigator.vibrate(10);
    else if (type === 'medium') navigator.vibrate(20);
    else if (type === 'heavy') navigator.vibrate([30, 10, 30]);
    else if (type === 'success') navigator.vibrate([10, 50, 10, 50, 10]);
  }
};

const drawAvatarShape = (ctx, x, y, r, shape) => {
  ctx.beginPath();
  if (shape === 'square') {
    ctx.rect(x - r, y - r, r * 2, r * 2);
  } else if (shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const px = x + r * Math.cos(angle);
      const py = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.5;
      const px = x + rad * Math.cos(angle);
      const py = y + rad * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
};

const ToastContext = React.createContext(null);
const useToast = () => React.useContext(ToastContext);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);
  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="rs-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`rs-toast rs-toast-${t.type}`}>
            {t.type === 'success' && <Check size={14} />}
            {t.type === 'error' && <AlertTriangle size={14} />}
            {t.type === 'info' && <Info size={14} />}
            {t.type === 'achievement' && <Trophy size={14} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ACHIEVEMENTS = [
  { id: 'first_export', name: 'First Cut', desc: 'Export your first video', icon: '🎬', xp: 50 },
  { id: 'five_exports', name: 'Serial Creator', desc: 'Export 5 videos', icon: '🔥', xp: 100 },
  { id: 'template_master', name: 'Template Master', desc: 'Use 10 different templates', icon: '🎨', xp: 75 },
  { id: 'speed_demon', name: 'Speed Demon', desc: 'Use 2x playback speed', icon: '⚡', xp: 30 },
  { id: 'effect_artist', name: 'Effect Artist', desc: 'Apply 5 different effects', icon: '✨', xp: 60 },
  { id: 'pip_pro', name: 'PIP Pro', desc: 'Use picture-in-picture', icon: '📹', xp: 40 },
  { id: 'slideshow_king', name: 'Slideshow King', desc: 'Create a slideshow', icon: '🖼️', xp: 35 },
  { id: 'night_owl', name: 'Night Owl', desc: 'Edit after midnight', icon: '🦉', xp: 25 },
  { id: 'perfectionist', name: 'Perfectionist', desc: 'Use undo 10 times', icon: '🎯', xp: 45 },
  { id: 'social_butterfly', name: 'Social Butterfly', desc: 'Add verified badge', icon: '✅', xp: 20 },
];

const getGameState = () => {
  try {
    return JSON.parse(localStorage.getItem('reactor-game-state')) || { xp: 0, level: 1, achievements: [], streak: 0, lastActive: null, totalExports: 0, templatesUsed: [], effectsUsed: [], undoCount: 0 };
  } catch { return { xp: 0, level: 1, achievements: [], streak: 0, lastActive: null, totalExports: 0, templatesUsed: [], effectsUsed: [], undoCount: 0 }; }
};
const saveGameState = (state) => localStorage.setItem('reactor-game-state', JSON.stringify(state));
const getLevel = (xp) => Math.floor(xp / 200) + 1;
const getLevelProgress = (xp) => (xp % 200) / 200;

const STICKERS = [
  { id: 'fire', emoji: '🔥', name: 'Fire' }, { id: 'heart', emoji: '❤️', name: 'Heart' },
  { id: 'star', emoji: '⭐', name: 'Star' }, { id: 'crown', emoji: '👑', name: 'Crown' },
  { id: 'trophy', emoji: '🏆', name: 'Trophy' }, { id: 'lightning', emoji: '⚡', name: 'Bolt' },
  { id: 'skull', emoji: '💀', name: 'Skull' }, { id: 'rocket', emoji: '🚀', name: 'Rocket' },
  { id: 'money', emoji: '💰', name: 'Money' }, { id: 'eyes', emoji: '👀', name: 'Eyes' },
  { id: 'clap', emoji: '👏', name: 'Clap' }, { id: 'goat', emoji: '🐐', name: 'GOAT' },
  { id: 'cold', emoji: '🥶', name: 'Cold' }, { id: 'boom', emoji: '💥', name: 'Boom' },
  { id: 'target', emoji: '🎯', name: 'Target' }, { id: 'muscle', emoji: '💪', name: 'Muscle' },
  { id: '100', emoji: '💯', name: '100' }, { id: 'angry', emoji: '😠', name: 'Angry' },
  { id: 'cry', emoji: '😭', name: 'Cry' }, { id: 'joy', emoji: '😂', name: 'Joy' },
  { id: 'shock', emoji: '😱', name: 'Shock' }, { id: 'cool', emoji: '😎', name: 'Cool' },
  { id: 'think', emoji: '🤔', name: 'Think' }, { id: 'sleep', emoji: '😴', name: 'Sleep' },
  { id: 'vip', emoji: '💎', name: 'VIP' }, { id: 'check', emoji: '✅', name: 'Check' },
  { id: 'cross', emoji: '❌', name: 'Cross' }, { id: 'arrow', emoji: '➡️', name: 'Arrow' },
  { id: 'up', emoji: '⬆️', name: 'Up' }, { id: 'down', emoji: '⬇️', name: 'Down' },
];

const AVATAR_SHAPES = [
  { id: 'circle', name: 'Circle' }, { id: 'square', name: 'Square' },
  { id: 'hexagon', name: 'Hexagon' }, { id: 'star', name: 'Star' }
];

const AVATAR_ANIMS = [
  { id: 'none', name: 'None' }, { id: 'pulse', name: 'Pulse' }, { id: 'rotate', name: 'Rotate' }
];

const TEMPLATES = [
  { id: 'pro_aura', title: 'Pro: Aura Maximus', category: 'Pro', tags: ['viral', 'cinematic', 'intro'], pip: false, video: { x: 0, y: 0, w: 720, h: 1280 }, bg: '#000', preview: { bg: 'linear-gradient(135deg, #000, #333)', layout: 'pro' }, isPro: true },
  { id: 'pro_goal', title: 'Pro: Goal Machine', category: 'Pro', tags: ['viral', 'goal', 'intro'], pip: false, video: { x: 0, y: 0, w: 720, h: 1280 }, bg: '#000', preview: { bg: 'linear-gradient(135deg, #dc2626, #000)', layout: 'pro' }, isPro: true },
  { id: 'pro_chills', title: 'Pro: Chill Vibes', category: 'Pro', tags: ['viral', 'chill', 'intro'], pip: false, video: { x: 0, y: 0, w: 720, h: 1280 }, bg: '#000', preview: { bg: 'linear-gradient(135deg, #4338ca, #312e81)', layout: 'pro' }, isPro: true },
  { id: 'pro_skill', title: 'Pro: Skill Show', category: 'Pro', tags: ['viral', 'skill', 'intro'], pip: false, video: { x: 0, y: 0, w: 720, h: 1280 }, bg: '#000', preview: { bg: 'linear-gradient(135deg, #065f46, #000)', layout: 'pro' }, isPro: true },
  { id: 'pro_news', title: 'Pro: Breaking News', category: 'Pro', tags: ['viral', 'news', 'intro'], pip: false, video: { x: 0, y: 0, w: 720, h: 1280 }, bg: '#000', preview: { bg: 'linear-gradient(135deg, #0c4a6e, #000)', layout: 'pro' }, isPro: true },
  { id: 'pro_hype', title: 'Pro: Hype Beast', category: 'Pro', tags: ['viral', 'hype', 'intro'], pip: false, video: { x: 0, y: 0, w: 720, h: 1280 }, bg: '#000', preview: { bg: 'linear-gradient(135deg, #be185d, #000)', layout: 'pro' }, isPro: true },
  { id: 'pro_cinematic', title: 'Pro: Cinematic Wide', category: 'Pro', tags: ['viral', 'cinematic', 'intro'], pip: false, video: { x: 0, y: 140, w: 720, h: 1000 }, bg: '#000', preview: { bg: 'linear-gradient(135deg, #111, #000)', layout: 'pro' }, isPro: true },
  { id: 'pro_signature', title: 'Pro: ZOKA Signature', category: 'Pro', tags: ['viral', 'zoka', 'intro'], pip: false, video: { x: 0, y: 0, w: 720, h: 1280 }, bg: '#000', preview: { bg: 'linear-gradient(135deg, #047857, #000)', layout: 'pro' }, isPro: true },
  { id: 'social_pro', title: 'TikTok POV (Exact Match)', category: 'TikTok', tags: ['viral', 'pov', 'exact'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 70, r: 35, ring: 'accent' }, nameEl: { x: 100, y: 60, size: 30, color: '#fff' }, handleEl: { x: 100, y: 92, size: 24, color: '#aaa' }, caption: { x: 50, y: 150, size: 26, maxW: 620, align: 'left', color: '#fff' }, topGradient: 350, bottomGradient: 200, preview: { bg: 'linear-gradient(to bottom, #1e293b, #0f172a)', layout: 'pov' } },
  { id: 'tiktok_frame', title: 'TikTok Framed (Color)', category: 'TikTok', tags: ['viral', 'frame', 'pov'], pip: false, video: { x: 40, y: 250, w: 640, h: 900, border: '#000' }, profile: { x: 60, y: 60, r: 30, ring: '#fff' }, nameEl: { x: 110, y: 50, size: 24, color: '#fff' }, handleEl: { x: 110, y: 80, size: 20, color: '#000' }, caption: { x: 60, y: 150, size: 28, color: '#fff', maxW: 600, align: 'left' }, bg: 'accent', preview: { bg: '#f97316', layout: 'pov' } },
  { id: 'custom', title: 'Custom Studio', category: 'Pro', tags: ['drag', 'resize'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 360, y: 640, r: 50, ring: 'accent' }, username: { x: 360, y: 720, size: 32, center: true, badge: true, badgeColor: 'accent' }, caption: { x: 360, y: 400, size: 28, maxW: 600, center: true }, bg: '#000', isCustom: true, preview: { bg: '#000', layout: 'custom' } },
  { id: 'tiktok_tl', title: 'TikTok Top Left', category: 'TikTok', tags: ['viral', 'duet'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 60, r: 35, ring: 'accent' }, username: { x: 100, y: 55, size: 28, badge: true, badgeColor: 'accent' }, caption: { x: 20, y: 120, size: 24, maxW: 680, align: 'left' }, topGradient: 350, bottomGradient: 200, preview: { bg: '#111', layout: 'tl' } },
  { id: 'tiktok_tr', title: 'TikTok Top Right', category: 'TikTok', tags: ['viral', 'duet'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 670, y: 60, r: 35, ring: 'accent' }, username: { x: 620, y: 55, size: 28, badge: true, badgeColor: 'accent', align: 'right' }, caption: { x: 700, y: 120, size: 24, maxW: 680, align: 'right' }, topGradient: 350, bottomGradient: 200, preview: { bg: '#111', layout: 'tr' } },
  { id: 'tiktok_bl', title: 'TikTok Bottom Left', category: 'TikTok', tags: ['viral', 'duet'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 1180, r: 35, ring: 'accent' }, username: { x: 100, y: 1175, size: 28, badge: true, badgeColor: 'accent' }, caption: { x: 20, y: 1080, size: 24, maxW: 680, align: 'left' }, bottomGradient: 400, preview: { bg: '#111', layout: 'bl' } },
  { id: 'tiktok_br', title: 'TikTok Bottom Right', category: 'TikTok', tags: ['viral', 'duet'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 670, y: 1180, r: 35, ring: 'accent' }, username: { x: 620, y: 1175, size: 28, badge: true, badgeColor: 'accent', align: 'right' }, caption: { x: 700, y: 1080, size: 24, maxW: 680, align: 'right' }, bottomGradient: 400, preview: { bg: '#111', layout: 'br' } },
  { id: 'tiktok_face', title: 'TikTok Facecam', category: 'TikTok', tags: ['facecam', 'gaming'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 60, r: 35, ring: 'accent' }, username: { x: 100, y: 55, size: 28, badge: true, badgeColor: 'accent' }, caption: { x: 20, y: 120, size: 24, maxW: 680, align: 'left' }, topGradient: 350, bottomGradient: 200, preview: { bg: '#111', layout: 'tl' } },
  { id: 'insta_tl', title: 'Insta Story Top Left', category: 'Instagram', tags: ['luxury', 'minimal'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 60, r: 35, ring: 'accent' }, username: { x: 100, y: 55, size: 28, badge: true, badgeColor: 'accent' }, caption: { x: 20, y: 120, size: 24, maxW: 680, align: 'left' }, topGradient: 350, preview: { bg: '#1a1a1a', layout: 'tl' } },
  { id: 'insta_tr', title: 'Insta Story Top Right', category: 'Instagram', tags: ['luxury', 'minimal'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 670, y: 60, r: 35, ring: 'accent' }, username: { x: 620, y: 55, size: 28, badge: true, badgeColor: 'accent', align: 'right' }, caption: { x: 700, y: 120, size: 24, maxW: 680, align: 'right' }, topGradient: 350, preview: { bg: '#1a1a1a', layout: 'tr' } },
  { id: 'insta_bl', title: 'Insta Story Bottom', category: 'Instagram', tags: ['luxury', 'minimal'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 1180, r: 35, ring: 'accent' }, username: { x: 100, y: 1175, size: 28, badge: true, badgeColor: 'accent' }, caption: { x: 20, y: 1080, size: 24, maxW: 680, align: 'left' }, bottomGradient: 400, preview: { bg: '#1a1a1a', layout: 'bl' } },
  { id: 'insta_lux', title: 'Insta Luxury Gold', category: 'Instagram', tags: ['luxury', 'gold'], pip: false, video: { x: 40, y: 80, w: 640, h: 900, border: '#f59e0b' }, profile: { x: 360, y: 1100, r: 40, ring: '#f59e0b' }, username: { x: 360, y: 1200, size: 36, color: '#fff', center: true, badge: true, badgeColor: '#f59e0b' }, caption: { x: 360, y: 130, size: 28, color: '#fff', maxW: 600, center: true }, bg: '#000', preview: { bg: '#000', layout: 'center' } },
  { id: 'yt_shorts', title: 'YT Shorts Standard', category: 'YouTube', tags: ['shorts', 'viral'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 60, r: 35, ring: 'accent' }, username: { x: 100, y: 55, size: 28, badge: true, badgeColor: 'accent' }, caption: { x: 20, y: 120, size: 24, maxW: 680, align: 'left' }, topGradient: 350, bottomGradient: 200, preview: { bg: '#0f0f0f', layout: 'tl' } },
  { id: 'yt_mrbeast', title: 'YT MrBeast Style', category: 'YouTube', tags: ['mrbeast', 'viral'], pip: false, video: { x: 0, y: 0, w: 720, h: 1280 }, caption: { x: 360, y: 1100, size: 60, maxW: 680, center: true, color: '#fff' }, bg: '#000', preview: { bg: '#0f0f0f', layout: 'center' } },
  { id: 'yt_edu', title: 'YT Educational', category: 'YouTube', tags: ['edu', 'tutorial'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 60, r: 35, ring: 'accent' }, username: { x: 100, y: 55, size: 28, badge: true, badgeColor: 'accent' }, caption: { x: 20, y: 120, size: 24, maxW: 680, align: 'left' }, topGradient: 350, bottomGradient: 200, preview: { bg: '#1a1a1a', layout: 'tl' } },
  { id: 'neon_pink', title: 'Neon Pink Glow', category: 'Gaming', tags: ['cyberpunk', 'twitch'], pip: false, video: { x: 60, y: 100, w: 600, h: 900, glow: '#ec4899' }, profile: { x: 360, y: 1150, r: 35, ring: '#ec4899' }, username: { x: 360, y: 1220, size: 28, center: true, badge: true, badgeColor: '#ec4899' }, caption: { x: 360, y: 1050, size: 28, maxW: 600, center: true }, bg: '#0a0f1a', preview: { bg: '#0a0f1a', layout: 'center' } },
  { id: 'neon_blue', title: 'Neon Blue Glow', category: 'Gaming', tags: ['cyberpunk', 'twitch'], pip: false, video: { x: 60, y: 100, w: 600, h: 900, glow: '#3b82f6' }, profile: { x: 360, y: 1150, r: 35, ring: '#3b82f6' }, username: { x: 360, y: 1220, size: 28, center: true, badge: true, badgeColor: '#3b82f6' }, caption: { x: 360, y: 1050, size: 28, maxW: 600, center: true }, bg: '#0a0f1a', preview: { bg: '#0a0f1a', layout: 'center' } },
  { id: 'neon_green', title: 'Neon Green Glow', category: 'Gaming', tags: ['cyberpunk', 'twitch'], pip: false, video: { x: 60, y: 100, w: 600, h: 900, glow: '#10b981' }, profile: { x: 360, y: 1150, r: 35, ring: '#10b981' }, username: { x: 360, y: 1220, size: 28, center: true, badge: true, badgeColor: '#10b981' }, caption: { x: 360, y: 1050, size: 28, maxW: 600, center: true }, bg: '#0a0f1a', preview: { bg: '#0a0f1a', layout: 'center' } },
  { id: 'twitch_face', title: 'Twitch Facecam', category: 'Gaming', tags: ['twitch', 'facecam'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 60, r: 35, ring: '#9146ff' }, username: { x: 100, y: 55, size: 28, badge: true, badgeColor: '#9146ff' }, caption: { x: 20, y: 120, size: 24, maxW: 680, align: 'left' }, topGradient: 350, bottomGradient: 200, bg: '#0e0e10', preview: { bg: '#0e0e10', layout: 'tl' } },
  { id: 'pod_split', title: 'Podcast Split', category: 'Podcast', tags: ['podcast', 'split'], pip: true, video: { x: 0, y: 0, w: 360, h: 1280 }, profile: { x: 180, y: 640, r: 50, ring: 'accent' }, username: { x: 180, y: 720, size: 32, center: true, badge: true, badgeColor: 'accent' }, caption: { x: 540, y: 640, size: 28, maxW: 300, center: true }, bg: '#000', preview: { bg: '#111', layout: 'split' } },
  { id: 'pod_wave', title: 'Podcast Minimal', category: 'Podcast', tags: ['podcast', 'minimal'], pip: false, video: { x: 60, y: 100, w: 600, h: 900, glow: '#3b82f6' }, profile: { x: 360, y: 1150, r: 35, ring: '#3b82f6' }, username: { x: 360, y: 1220, size: 28, center: true, badge: true, badgeColor: '#3b82f6' }, caption: { x: 360, y: 1050, size: 28, maxW: 600, center: true }, bg: '#0a0f1a', preview: { bg: '#0a0f1a', layout: 'center' } },
  { id: 'news_red', title: 'Football Breaking', category: 'Football', tags: ['news', 'match'], pip: true, video: { x: 0, y: 100, w: 720, h: 1080 }, caption: { x: 360, y: 60, size: 32, color: '#fff', maxW: 680, center: true }, header: { h: 100, bg: '#dc2626', text: 'BREAKING NEWS', y: 45, size: 36 }, ticker: { h: 100, bg: '#111827', y: 1230, size: 28 }, bg: '#000', preview: { bg: '#dc2626', layout: 'news' } },
  { id: 'news_blue', title: 'Match Update', category: 'Football', tags: ['news', 'match'], pip: true, video: { x: 0, y: 100, w: 720, h: 1080 }, caption: { x: 360, y: 60, size: 32, color: '#fff', maxW: 680, center: true }, header: { h: 100, bg: '#1d9bf0', text: 'MATCH UPDATE', y: 45, size: 36 }, ticker: { h: 100, bg: '#111827', y: 1230, size: 28 }, bg: '#000', preview: { bg: '#1d9bf0', layout: 'news' } },
  { id: 'news_green', title: 'Transfer News', category: 'Football', tags: ['news', 'transfer'], pip: true, video: { x: 0, y: 100, w: 720, h: 1080 }, caption: { x: 360, y: 60, size: 32, color: '#fff', maxW: 680, center: true }, header: { h: 100, bg: '#10b981', text: 'TRANSFER NEWS', y: 45, size: 36 }, ticker: { h: 100, bg: '#111827', y: 1230, size: 28 }, bg: '#000', preview: { bg: '#10b981', layout: 'news' } },
  { id: 'news_dark', title: 'Broadcast Dark', category: 'Football', tags: ['news', 'minimal'], pip: true, video: { x: 0, y: 0, w: 720, h: 1280 }, profile: { x: 50, y: 60, r: 35, ring: 'accent' }, username: { x: 100, y: 55, size: 28, badge: true, badgeColor: 'accent' }, caption: { x: 20, y: 120, size: 24, maxW: 680, align: 'left' }, topGradient: 350, bottomGradient: 200, bg: '#000', preview: { bg: '#000', layout: 'tl' } },
  { id: 'polaroid_c', title: 'Polaroid Center', category: 'Minimal', tags: ['white', 'aesthetic'], pip: false, video: { x: 40, y: 80, w: 640, h: 900, border: 'accent' }, profile: { x: 360, y: 1100, r: 40, ring: '#f1f1f1' }, username: { x: 360, y: 1200, size: 36, color: '#000', center: true, badge: true, badgeColor: 'accent' }, caption: { x: 360, y: 130, size: 28, color: '#fff', maxW: 600, center: true }, bg: '#fff', preview: { bg: '#fff', layout: 'center' } },
  { id: 'polaroid_t', title: 'Polaroid Video Top', category: 'Minimal', tags: ['white', 'aesthetic'], pip: false, video: { x: 40, y: 40, w: 640, h: 800, border: 'accent' }, profile: { x: 360, y: 1000, r: 40, ring: '#f1f1f1' }, username: { x: 360, y: 1100, size: 36, color: '#000', center: true, badge: true, badgeColor: 'accent' }, caption: { x: 360, y: 900, size: 28, color: '#000', maxW: 600, center: true }, bg: '#fff', preview: { bg: '#fff', layout: 'center' } },
  { id: 'min_dark', title: 'Minimal Dark', category: 'Minimal', tags: ['dark', 'clean'], pip: false, video: { x: 0, y: 0, w: 720, h: 1280 }, caption: { x: 360, y: 1200, size: 32, maxW: 680, center: true, color: '#fff' }, bg: '#000', preview: { bg: '#000', layout: 'center' } },
];

const FONT_PACKS = {
  TikTok: { name: 'Arial, sans-serif', weight: 'bold' },
  Modern: { name: 'Inter, sans-serif', weight: '600' },
  Luxury: { name: 'Georgia, serif', weight: 'bold' },
  Gaming: { name: 'Courier New, monospace', weight: 'bold' },
  Impact: { name: 'Impact, sans-serif', weight: 'normal' },
  Rounded: { name: 'Trebuchet MS, sans-serif', weight: 'bold' }
};

const BRAND_PRESETS = [
  { name: 'ZOKA', color: '#10b981' }, { name: 'Twitter', color: '#1d9bf0' },
  { name: 'TikTok', color: '#ec4899' }, { name: 'Twitch', color: '#9146ff' },
  { name: 'Gold', color: '#f59e0b' }, { name: 'Orange', color: '#f97316' },
  { name: 'Emerald', color: '#10b981' }, { name: 'Rose', color: '#f43f5e' }
];

const FILTERS = [
  { id: 'none', name: 'Normal', icon: '○' }, { id: 'saturate(2) contrast(1.3)', name: 'Vivid', icon: '◉' },
  { id: 'grayscale(1) contrast(1.2)', name: 'B&W', icon: '◐' }, { id: 'sepia(0.8) contrast(1.1) brightness(0.9)', name: 'Retro', icon: '◈' },
  { id: 'invert(1)', name: 'Invert', icon: '◍' }, { id: 'blur(2px)', name: 'Blur', icon: '◎' },
  { id: 'brightness(1.4) saturate(0.8)', name: 'Warm', icon: '☀' }, { id: 'brightness(0.8) saturate(1.5) hue-rotate(200deg)', name: 'Cool', icon: '❄' },
  { id: 'contrast(1.5) brightness(1.1) sepia(0.3)', name: 'Vintage', icon: '◬' }, { id: 'saturate(0.5) brightness(1.2) contrast(1.1)', name: 'Matte', icon: '▣' },
  { id: 'hue-rotate(90deg) saturate(1.5)', name: 'Alien', icon: '◈' }, { id: 'contrast(2) brightness(0.7)', name: 'Drama', icon: '◉' },
  { id: 'grayscale(1) contrast(1.8) brightness(1.2)', name: 'Noir', icon: '■' },
  { id: 'sepia(0.5) hue-rotate(300deg) saturate(1.8)', name: 'Dreamy', icon: '☽' },
  { id: 'contrast(0.8) brightness(1.2) saturate(0.8)', name: 'Faded', icon: '□' },
  { id: 'hue-rotate(180deg) invert(0.2) saturate(2)', name: 'Cyber', icon: '⬡' }
];

const VIDEO_EFFECTS = [
  { id: 'none', name: 'None' }, { id: 'zoom_in', name: 'Zoom In' },
  { id: 'shake', name: 'Shake' }, { id: 'pulse', name: 'Pulse' },
  { id: 'ken_burns', name: 'Ken Burns' }, { id: 'glitch', name: 'Glitch' },
  { id: 'rgb_split', name: 'RGB Split' }, { id: 'flash', name: 'Flash' },
  { id: 'vhs', name: 'VHS' }, { id: 'bounce', name: 'Bounce' },
  { id: 'mirror', name: 'Mirror' }, { id: 'wave', name: 'Wave' },
  { id: 'static', name: 'Static' }, { id: 'posterize', name: 'Posterize' }
];

const SLIDESHOW_TRANSITIONS = [
  { id: 'fade', name: 'Fade' }, { id: 'slide_left', name: 'Slide Left' },
  { id: 'zoom_in', name: 'Zoom In' }, { id: 'wipe', name: 'Wipe' },
  { id: 'dissolve', name: 'Dissolve' }
];

const EXPORT_PRESETS = [
  { id: 'tiktok', name: 'TikTok', desc: '1080×1920 • 30fps • H.264', fps: 30, format: 'mp4', bitrate: 10000000 },
  { id: 'reels', name: 'Reels', desc: '1080×1920 • 30fps • High', fps: 30, format: 'mp4', bitrate: 12000000 },
  { id: 'shorts', name: 'YT Shorts', desc: '1080×1920 • 60fps • Max', fps: 60, format: 'mp4', bitrate: 15000000 },
  { id: 'webm_fast', name: 'WebM Fast', desc: '1080×1920 • 30fps • VP9', fps: 30, format: 'webm', bitrate: 8000000 },
  { id: 'quality', name: 'Max Quality', desc: '1080×1920 • 60fps • VP9', fps: 60, format: 'webm', bitrate: 20000000 },
];

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

// ═══════════════════════════════════════════════════════════
// STATE & REDUCER
// ═══════════════════════════════════════════════════════════
const initialState = {
  media: { sourceLoaded: false, brollLoaded: false, cameraOn: false, profileSrc: null, logoSrc: null, audioName: '' },
  editor: {
    templateId: 'pro_aura', displayName: 'Manu', username: 'manuel_palmer', povCaption: 'POV: You just witnessed greatness 🔥',
    accentColor: '#10b981', fontPack: 'TikTok', nameColor: '#ffffff', nameSize: null, captionColor: '#ffffff', captionSize: null,
    showVerified: true, editMode: false, videoEffect: 'none', textAnimation: 'none',
    homeLogoUrl: '', awayLogoUrl: '', homeScore: 0, awayScore: 0,
    isMuted: false, filter: 'none', fadeIn: false,
    pipPos: { x: 410, y: 830, w: 280, h: 380 }, pipScale: 1.0, pipFrameStyle: 'accent', profilePos: { x: 50, y: 70, r: 35 },
    avatarShape: 'circle', avatarAnim: 'none', swapPip: false,
    introEnabled: true, introStyle: 'glitch_reveal', introWatermark: true,
    videoZoom: 1, videoPanX: 0, videoPanY: 0, playbackRate: 1.0,
    mode: 'video', slideshowSpeed: 3, slideshowTransition: 'fade',
    stickers: [], stickerOpacity: 1,
    bgColor: null, canvasRatio: '9:16', selectedStickerId: null
  },
  slideshow: { images: [], duration: 0 },
  timeline: { clips: [{ id: 'clip1', start: 0, end: 0 }], activeClipId: 'clip1', duration: 0, currentTime: 0, isPlaying: false },
  ui: {
    activePanel: null, showGuides: false, isExporting: false, exportFormat: null, exportFps: null, exportProgress: 0,
    recordedUrl: null, recordedExt: 'webm', isLoadingProject: true,
    favorites: JSON.parse(localStorage.getItem("reactor-favorites")) || [], recents: JSON.parse(localStorage.getItem("reactor-recents")) || [],
    searchQuery: "", activeCategory: "All", layers: { video: true, pip: true, profile: true, caption: true, gradients: true, scorebug: true, stickers: true },
    showShortcuts: false, autoSaveStatus: 'saved', fullscreen: false
  },
  history: { past: [], future: [] }
};

function studioReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE': return { ...state, ...action.payload };
    case 'SET_MEDIA': return { ...state, media: { ...state.media, ...action.payload } };
    case 'SET_EDITOR': {
      const newEditor = { ...state.editor, ...action.payload };
      const shouldTrack = action.trackHistory !== false;
      if (shouldTrack && (action.payload.templateId !== undefined || action.payload.videoEffect !== undefined || action.payload.filter !== undefined)) {
        return {
          ...state,
          editor: newEditor,
          history: { past: [...state.history.past.slice(-30), { editor: state.editor }], future: [] }
        };
      }
      return { ...state, editor: newEditor };
    }
    case 'SET_SLIDESHOW': return { ...state, slideshow: { ...state.slideshow, ...action.payload } };
    case 'SET_TIMELINE': return { ...state, timeline: { ...state.timeline, ...action.payload } };
    case 'SET_UI': return { ...state, ui: { ...state.ui, ...action.payload } };
    case 'UNDO': {
      if (state.history.past.length === 0) return state;
      const previous = state.history.past[state.history.past.length - 1];
      return { ...state, editor: previous.editor, history: { past: state.history.past.slice(0, -1), future: [{ editor: state.editor }, ...state.history.future] } };
    }
    case 'REDO': {
      if (state.history.future.length === 0) return state;
      const next = state.history.future[0];
      return { ...state, editor: next.editor, history: { past: [...state.history.past, { editor: state.editor }], future: state.history.future.slice(1) } };
    }
    case 'RESET': return { ...initialState, ui: { ...initialState.ui, isLoadingProject: false } };
    default: return state;
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
function ReactorStudioInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const fixtureData = location.state;
  const addToast = useToast();
  const [state, dispatch] = useReducer(studioReducer, initialState);
  const [gameState, setGameState] = useState(getGameState);
  const [showOnboarding, setShowOnboarding] = useState(!localStorage.getItem('reactor-onboarded'));
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  
  const toolbarRef = useRef(null);
  const [scrollState, setScrollState] = useState({ left: false, right: false, up: false, down: false });

  const sourceVideoRef = useRef(null);
  const brollVideoRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(document.createElement('canvas'));
  const exportCanvasRef = useRef(null);
  const fileInputRefs = useRef({ video: null, broll: null, image: null, audio: null, logo: null, images: null });
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const dragRef = useRef({ target: null, offsetX: 0, offsetY: 0 });
  const profileImgRef = useRef(new Image());
  const logoImgRef = useRef(new Image());
  const homeLogoRef = useRef(new Image());
  const awayLogoRef = useRef(new Image());
  const slideshowImgRefs = useRef([]);
  const currentTimeRef = useRef(0);
  const renderOverlayRef = useRef(() => {});
  const mediaRecorderRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const currentExportClipRef = useRef(0);

  const { media, editor, slideshow, timeline, ui, history } = state;
  const templateMap = useMemo(() => Object.fromEntries(TEMPLATES.map(t => [t.id, t])), []);
  const activeTemplate = templateMap[editor.templateId] || TEMPLATES[0];
  const activeClip = useMemo(() => timeline.clips.find(c => c.id === timeline.activeClipId) || timeline.clips[0], [timeline.clips, timeline.activeClipId]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToolbarScroll = useCallback(() => {
    const el = toolbarRef.current;
    if (!el) return;
    if (isMobile) {
      setScrollState({ left: el.scrollLeft > 10, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 10, up: false, down: false });
    } else {
      setScrollState({ left: false, right: false, up: el.scrollTop > 10, down: el.scrollTop < el.scrollHeight - el.clientHeight - 10 });
    }
  }, [isMobile]);

  useEffect(() => { handleToolbarScroll(); }, [isMobile, state.ui.activePanel, handleToolbarScroll]);

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = !!document.fullscreenElement;
      if (isFs !== ui.fullscreen) dispatch({ type: 'SET_UI', payload: { fullscreen: isFs } });
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [ui.fullscreen]);

  const unlockAchievement = useCallback((id) => {
    setGameState(prev => {
      if (prev.achievements.includes(id)) return prev;
      const ach = ACHIEVEMENTS.find(a => a.id === id);
      if (!ach) return prev;
      const newState = { ...prev, achievements: [...prev.achievements, id], xp: prev.xp + ach.xp, level: getLevel(prev.xp + ach.xp) };
      saveGameState(newState);
      addToast(`${ach.icon} Achievement Unlocked: ${ach.name} (+${ach.xp} XP)`, 'achievement', 4000);
      haptic('success');
      return newState;
    });
  }, [addToast]);

  useEffect(() => {
    const today = new Date().toDateString();
    setGameState(prev => {
      if (prev.lastActive === today) return prev;
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const newStreak = prev.lastActive === yesterday ? prev.streak + 1 : 1;
      const newState = { ...prev, streak: newStreak, lastActive: today };
      saveGameState(newState);
      if (newStreak > 1) addToast(`🔥 ${newStreak} day streak! Keep creating!`, 'info');
      return newState;
    });
  }, [addToast]);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) unlockAchievement('night_owl');
  }, [unlockAchievement]);

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
          templateId: 'pro_aura'
        }
      });
      dispatch({ type: 'SET_UI', payload: { activeCategory: "Pro", activePanel: 'templates' } });
    }
  }, [fixtureData]);

  useEffect(() => {
    const load = async () => {
      const saved = JSON.parse(localStorage.getItem('reactor-project-state') || '{}');
      if (saved.editor) dispatch({ type: 'SET_EDITOR', payload: saved.editor, trackHistory: false });
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
        const sImages = await idbGet('slideshow_images');
        if (sImages && sImages.length > 0) {
          slideshowImgRefs.current = sImages.map(src => { const img = new Image(); img.src = src; return img; });
          const dur = sImages.length * (saved.editor?.slideshowSpeed || 3);
          dispatch({ type: 'SET_SLIDESHOW', payload: { images: sImages, duration: dur } });
          dispatch({ type: 'SET_TIMELINE', payload: { duration: dur, clips: [{ id: 'clip1', start: 0, end: dur }] } });
        }
      } catch (e) { console.error(e); }
      dispatch({ type: 'SET_UI', payload: { isLoadingProject: false } });
    };
    load();
  }, []);

  useEffect(() => {
    if (ui.isLoadingProject) return;
    dispatch({ type: 'SET_UI', payload: { autoSaveStatus: 'saving' } });
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      localStorage.setItem('reactor-project-state', JSON.stringify({ editor, timeline }));
      dispatch({ type: 'SET_UI', payload: { autoSaveStatus: 'saved' } });
    }, 1000);
    return () => clearTimeout(autoSaveTimerRef.current);
  }, [editor, timeline, ui.isLoadingProject]);

  useEffect(() => { if (media.profileSrc) profileImgRef.current.src = media.profileSrc; }, [media.profileSrc]);
  useEffect(() => { if (media.logoSrc) logoImgRef.current.src = media.logoSrc; }, [media.logoSrc]);
  useEffect(() => { if (editor.homeLogoUrl) homeLogoRef.current.src = editor.homeLogoUrl; }, [editor.homeLogoUrl]);
  useEffect(() => { if (editor.awayLogoUrl) awayLogoRef.current.src = editor.awayLogoUrl; }, [editor.awayLogoUrl]);
  useEffect(() => { if (sourceVideoRef.current) sourceVideoRef.current.muted = editor.isMuted; }, [editor.isMuted]);
  useEffect(() => { if (sourceVideoRef.current && editor.mode === 'video') sourceVideoRef.current.playbackRate = editor.playbackRate; }, [editor.playbackRate, editor.mode, media.sourceLoaded]);
  useEffect(() => { if (editor.playbackRate >= 2) unlockAchievement('speed_demon'); }, [editor.playbackRate, unlockAchievement]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(console.error);
    else document.exitFullscreen?.().catch(console.error);
  }, []);

  const togglePreview = useCallback(() => {
    if (editor.mode === 'video' && media.sourceLoaded) {
      const vid = sourceVideoRef.current;
      if (!vid || !activeClip) return;
      if (timeline.isPlaying) { vid.pause(); dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: false } }); }
      else {
        if (vid.currentTime < activeClip.start || vid.currentTime >= activeClip.end - 0.1) vid.currentTime = activeClip.start;
        vid.play(); dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: true } });
      }
    } else {
      dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: !timeline.isPlaying } });
    }
    haptic('light');
  }, [editor.mode, media.sourceLoaded, activeClip, timeline.isPlaying, dispatch]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) dispatch({ type: 'REDO' }); else dispatch({ type: 'UNDO' }); }
      if (e.key === ' ') { e.preventDefault(); togglePreview(); }
      if (e.key === 'm') dispatch({ type: 'SET_EDITOR', payload: { isMuted: !editor.isMuted } });
      if (e.key === 'g') dispatch({ type: 'SET_UI', payload: { showGuides: !ui.showGuides } });
      if (e.key === 'e') dispatch({ type: 'SET_EDITOR', payload: { editMode: !editor.editMode } });
      if (e.key === 'f') toggleFullscreen();
      if (e.key === '?') dispatch({ type: 'SET_UI', payload: { showShortcuts: !ui.showShortcuts } });
      if (e.key === 'Escape') dispatch({ type: 'SET_UI', payload: { activePanel: null, showShortcuts: false } });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor.isMuted, ui.showGuides, editor.editMode, ui.showShortcuts, togglePreview, toggleFullscreen, dispatch]);

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
          dispatch({ type: 'SET_EDITOR', payload: { videoZoom: 1, videoPanX: 0, videoPanY: 0, mode: 'video' } });
          dispatch({ type: 'SET_TIMELINE', payload: { duration: dur, clips: newClips, activeClipId: newClips[0].id, isPlaying: true, currentTime: 0 } });
          dispatch({ type: 'SET_MEDIA', payload: { sourceLoaded: true } });
          sourceVideoRef.current.play();
          addToast('Video imported successfully!', 'success');
          haptic('medium');
        };
      } else if (type === 'broll') {
        await idbSet('broll_video', file);
        brollVideoRef.current.src = url; brollVideoRef.current.loop = true; brollVideoRef.current.muted = true;
        brollVideoRef.current.onloadedmetadata = () => { brollVideoRef.current.play().catch(() => {}); dispatch({ type: 'SET_MEDIA', payload: { brollLoaded: true, cameraOn: false } }); unlockAchievement('pip_pro'); addToast('B-Roll added!', 'success'); };      } else if (type === 'image') {
        await idbSet('profile_image', file);
        const src = URL.createObjectURL(file); profileImgRef.current.src = src;
        dispatch({ type: 'SET_MEDIA', payload: { profileSrc: src } });
        addToast('Avatar updated!', 'success');
      } else if (type === 'logo') {
        await idbSet('logo_image', file);
        const src = URL.createObjectURL(file); logoImgRef.current.src = src;
        dispatch({ type: 'SET_MEDIA', payload: { logoSrc: src } });
        addToast('Logo uploaded!', 'success');
      } else if (type === 'audio') {
        await idbSet('audio_track', file);
        audioRef.current.src = url; audioRef.current.loop = true;
        dispatch({ type: 'SET_MEDIA', payload: { audioName: file.name } });
        addToast(`Audio: ${file.name}`, 'success');
      }
    }
    e.target.value = null;
  };

  const handleImportImages = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const imageUrls = files.map(f => URL.createObjectURL(f));
    await idbSet('slideshow_images', imageUrls);
    slideshowImgRefs.current = imageUrls.map(src => { const img = new Image(); img.src = src; return img; });
    const dur = imageUrls.length * editor.slideshowSpeed;
    dispatch({ type: 'SET_SLIDESHOW', payload: { images: imageUrls, duration: dur } });
    dispatch({ type: 'SET_EDITOR', payload: { mode: 'slideshow' } });
    dispatch({ type: 'SET_TIMELINE', payload: { duration: dur, clips: [{ id: 'clip1', start: 0, end: dur }], currentTime: 0, isPlaying: true } });
    unlockAchievement('slideshow_king');
    addToast(`${files.length} images added to slideshow!`, 'success');
    e.target.value = null;
  };

  const handleClearProject = useCallback(async () => {
    if (!window.confirm("Clear all project data?")) return;
    localStorage.removeItem('reactor-project-state');
    await idbClear();
    window.location.reload();
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 720, height: 1280, facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      webcamVideoRef.current.srcObject = stream; webcamVideoRef.current.play().catch(() => {});      
      // If no main video, switch to Camera Solo Mode
      if (!media.sourceLoaded) {
        dispatch({ type: 'SET_EDITOR', payload: { mode: 'camera' } });
        dispatch({ type: 'SET_TIMELINE', payload: { duration: 30, clips: [{ id: 'clip1', start: 0, end: 30 }] } });
      } else {
        dispatch({ type: 'SET_MEDIA', payload: { cameraOn: true, brollLoaded: false } });
        brollVideoRef.current.removeAttribute('src');
      }
      unlockAchievement('pip_pro');
      addToast('Camera activated!', 'success');
    } catch { addToast("Camera access denied.", 'error'); }
  }, [addToast, unlockAchievement, dispatch, media.sourceLoaded]);

  const drawCover = (ctx, media, dx, dy, dw, dh, crop = { x: 0, y: 0, w: 1, h: 1 }) => {
    const vw = media.videoWidth || media.width, vh = media.videoHeight || media.height;
    if (!vw || !vh) return;
    const srcW = vw * crop.w, srcH = vh * crop.h, srcX = vw * crop.x, srcY = vh * crop.y;
    const vr = srcW / srcH, br = dw / dh;
    let sx, sy, sw, sh;
    if (vr > br) { sh = srcH; sw = srcH * br; sx = srcX + (srcW - sw) / 2; sy = srcY; }
    else { sw = srcW; sh = srcW / br; sx = srcX; sy = srcY + (srcH - sh) / 2; }
    ctx.drawImage(media, sx, sy, sw, sh, dx, dy, dw, dh);
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

  renderOverlayRef.current = () => {
    const oc = overlayCanvasRef.current;
    const ctx = oc.getContext('2d');
    if (!ctx) return;
    const ratios = { '9:16': { w: 720, h: 1280 }, '1:1': { w: 1080, h: 1080 }, '4:5': { w: 864, h: 1080 } };
    const dims = ratios[editor.canvasRatio] || ratios['9:16'];
    const W = dims.w, H = dims.h;
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
      ctx.save();
      let animScale = 1, animRot = 0;
      if (editor.avatarAnim === 'pulse') animScale = 1 + Math.sin(cTime * 4) * 0.05;
      if (editor.avatarAnim === 'rotate') animRot = cTime * 0.5;

      ctx.translate(p.x, p.y);
      ctx.rotate(animRot);
      ctx.scale(animScale, animScale);

      drawAvatarShape(ctx, 0, 0, p.r, editor.avatarShape || 'circle');
      ctx.clip();
      ctx.drawImage(profileImgRef.current, -p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();

      if (p.ring) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(animRot);
        ctx.scale(animScale, animScale);
        ctx.strokeStyle = p.ring === 'accent' ? editor.accentColor : p.ring;
        ctx.lineWidth = 4;
        drawAvatarShape(ctx, 0, 0, p.r + 1, editor.avatarShape || 'circle');
        ctx.stroke();
        ctx.restore();
      }
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
      if (editor.showVerified) { let nW = ctx.measureText(editor.username).width; let bX = (activeTemplate.isCustom || editor.editMode || u.center) ? ux + nW / 2 + 16 : ux + nW + 16; drawVerifiedBadge(ctx, bX, uy - uS / 2 + 2, uS / 2.5); }
    }

    if (ui.layers.stickers && editor.stickers && editor.stickers.length > 0) {
      ctx.globalAlpha = editor.stickerOpacity;
      editor.stickers.forEach(s => {
        ctx.font = `${s.size || 60}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, s.x, s.y);

        if (s.id === editor.selectedStickerId) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(s.x - s.size/2, s.y - s.size/2, s.size, s.size);
          ctx.setLineDash([]);
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(s.x + s.size/2, s.y + s.size/2, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalAlpha = editor.stickerOpacity;
      });
      ctx.globalAlpha = 1;
    }

    if (ui.layers.scorebug && (homeLogoRef.current.src || awayLogoRef.current.src)) {
      const bY = H - 150, bH = 80, bW = 400, bX = (W - bW) / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; roundRectPath(ctx, bX, bY, bW, bH, 12); ctx.fill();
      if (homeLogoRef.current.complete) ctx.drawImage(homeLogoRef.current, bX + 15, bY + 15, 50, 50);
      if (awayLogoRef.current.complete) ctx.drawImage(awayLogoRef.current, bX + bW - 65, bY + 15, 50, 50);
      ctx.fillStyle = '#fff'; ctx.font = `bold 36px ${font.name}`; ctx.textAlign = 'center'; ctx.fillText(`${editor.homeScore} - ${editor.awayScore}`, W / 2, bY + 50);
    }
  };

  const drawFrameRef = useRef(() => {});
  drawFrameRef.current = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const ratios = { '9:16': { w: 720, h: 1280 }, '1:1': { w: 1080, h: 1080 }, '4:5': { w: 864, h: 1080 } };
    const dims = ratios[editor.canvasRatio] || ratios['9:16'];
    const W = dims.w, H = dims.h;
    
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    const bgColor = editor.bgColor || activeTemplate.bg;
    ctx.fillStyle = bgColor === 'accent' ? editor.accentColor : (bgColor || '#000');
    ctx.fillRect(0, 0, W, H);
    const cTime = currentTimeRef.current;

    if (editor.mode === 'slideshow' && slideshow.images.length > 0) {
      if (timeline.isPlaying) {
        currentTimeRef.current += (1 / 30) * editor.playbackRate;
        if (currentTimeRef.current >= slideshow.duration) currentTimeRef.current = 0;
        dispatch({ type: 'SET_TIMELINE', payload: { currentTime: currentTimeRef.current } });
      }
      const imgDur = editor.slideshowSpeed; const totalDur = slideshow.images.length * imgDur; const loopedTime = currentTimeRef.current % totalDur;
      const idx = Math.floor(loopedTime / imgDur); const imgProg = (loopedTime % imgDur) / imgDur;
      const currentImg = slideshowImgRefs.current[idx]; const nextImg = slideshowImgRefs.current[(idx + 1) % slideshow.images.length];
      if (currentImg && currentImg.complete) {
        ctx.save();
        if (editor.slideshowTransition === 'zoom_in') { const scale = 1 + imgProg * 0.3; ctx.translate(W / 2, H / 2); ctx.scale(scale, scale); ctx.translate(-W / 2, -H / 2); }
        drawCover(ctx, currentImg, 0, 0, W, H); ctx.restore();
      }
      if (imgProg > 0.7 && nextImg && nextImg.complete) {
        ctx.globalAlpha = (imgProg - 0.7) / 0.3;
        if (editor.slideshowTransition === 'slide_left') { const offset = (1 - (imgProg - 0.7) / 0.3) * W; drawCover(ctx, nextImg, W - offset, 0, W, H); }
        else if (editor.slideshowTransition === 'wipe') { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * ((imgProg - 0.7) / 0.3), H); ctx.clip(); drawCover(ctx, nextImg, 0, 0, W, H); ctx.restore(); }
        else { drawCover(ctx, nextImg, 0, 0, W, H); }
        ctx.globalAlpha = 1;
      }
    } else if (editor.mode === 'camera' && media.cameraOn) {
      // Camera Solo Mode
      const aPiPVid = webcamVideoRef.current;
      if (aPiPVid && aPiPVid.videoWidth) {
        ctx.save();
        ctx.scale(-1, 1); ctx.translate(-W, 0);
        drawCover(ctx, aPiPVid, 0, 0, W, H);
        ctx.restore();
      }
    } else if (media.sourceLoaded && sourceVideoRef.current) {
      currentTimeRef.current = sourceVideoRef.current.currentTime;
      
      // Multi-clip sequencing logic for export
      if (ui.isExporting && timeline.clips.length > 1) {
        const c = timeline.clips[currentExportClipRef.current];
        if (c && sourceVideoRef.current.currentTime >= c.end - 0.05) {
          currentExportClipRef.current++;
          if (currentExportClipRef.current < timeline.clips.length) {
            sourceVideoRef.current.currentTime = timeline.clips[currentExportClipRef.current].start;
            sourceVideoRef.current.play().catch(() => {});          } else {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
          }
        }
      } else if (activeClip) {
        if (sourceVideoRef.current.currentTime < activeClip.start) sourceVideoRef.current.currentTime = activeClip.start;
        if (timeline.isPlaying && sourceVideoRef.current.currentTime >= activeClip.end - 0.05) { 
          sourceVideoRef.current.pause(); sourceVideoRef.current.currentTime = activeClip.start; sourceVideoRef.current.play(); 
        }
      }

      const showPiP = (media.cameraOn || media.brollLoaded) && ui.layers.pip; 
      const aPiPVid = media.brollLoaded ? brollVideoRef.current : webcamVideoRef.current;
      
      if (ui.layers.video) {
        const v = activeTemplate.video; 
        const aProg = activeClip ? Math.min((cTime - activeClip.start) / (activeClip.end - activeClip.start), 1) : 0;
        
        ctx.save(); 
        if (editor.videoEffect === 'zoom_in') { const s = 1 + aProg * 0.3; ctx.translate(v.x + v.w / 2, v.y + v.h / 2); ctx.scale(s, s); ctx.translate(-(v.x + v.w / 2), -(v.y + v.h / 2)); }
        else if (editor.videoEffect === 'shake') ctx.translate((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
        else if (editor.videoEffect === 'pulse') { const s = 1 + Math.sin(cTime * 8) * 0.04; ctx.translate(v.x + v.w / 2, v.y + v.h / 2); ctx.scale(s, s); ctx.translate(-(v.x + v.w / 2), -(v.y + v.h / 2)); }
        else if (editor.videoEffect === 'ken_burns') { const s = 1 + aProg * 0.15; const tx = aProg * 30; ctx.translate(v.x + v.w / 2 - tx, v.y + v.h / 2); ctx.scale(s, s); ctx.translate(-(v.x + v.w / 2), -(v.y + v.h / 2)); }
        else if (editor.videoEffect === 'bounce') { const bounce = Math.abs(Math.sin(cTime * 4)) * 20; ctx.translate(0, -bounce); }
        else if (editor.videoEffect === 'vhs') { ctx.translate((Math.random() - 0.5) * 4, 0); }
        else if (editor.videoEffect === 'mirror') { ctx.translate(v.x + v.w, 0); ctx.scale(-1, 1); }
        else if (editor.videoEffect === 'wave') { ctx.translate(0, Math.sin(cTime * 10) * 10); }
        
        ctx.filter = editor.filter;
        const zoom = editor.videoZoom || 1; const panX = editor.videoPanX || 0; const panY = editor.videoPanY || 0;
        const cropW = 1 / zoom; const cropH = 1 / zoom; const cropX = (1 - cropW) / 2 + (panX * (1 - cropW) / 2); const cropY = (1 - cropH) / 2 + (panY * (1 - cropH) / 2);
        const mainCrop = { x: cropX, y: cropY, w: cropW, h: cropH };
        
        if (editor.swapPip && aPiPVid && showPiP) {
          // Swap logic: Draw PiP as Main
          ctx.filter = 'none';
          ctx.save();
          if (!media.brollLoaded) { ctx.scale(-1, 1); ctx.translate(-W, 0); }
          drawCover(ctx, aPiPVid, v.x, v.y, v.w, v.h, mainCrop);
          ctx.restore();
        } else {
          if (editor.videoEffect === 'glitch' || editor.videoEffect === 'rgb_split') {
            ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'red'; ctx.globalAlpha = 0.8; drawCover(ctx, sourceVideoRef.current, v.x + (Math.random() * 10), v.y, v.w, v.h, mainCrop);
            ctx.fillStyle = 'cyan'; ctx.globalAlpha = 0.8; drawCover(ctx, sourceVideoRef.current, v.x - (Math.random() * 10), v.y, v.w, v.h, mainCrop); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          } else { drawCover(ctx, sourceVideoRef.current, v.x, v.y, v.w, v.h, mainCrop); }
          if (editor.videoEffect === 'vhs') {
            ctx.fillStyle = `rgba(255,0,0,${Math.random() * 0.03})`; ctx.fillRect(0, Math.random() * H, W, 2);
            ctx.fillStyle = `rgba(0,255,0,${Math.random() * 0.02})`; ctx.fillRect(0, Math.random() * H, W, 1);
          }
        }
        ctx.filter = 'none'; ctx.restore();
        
        if (editor.videoEffect === 'flash' && cTime < (activeClip?.start || 0) + 0.5) { ctx.fillStyle = `rgba(255,255,255,${1 - (cTime - (activeClip?.start || 0)) * 2})`; ctx.fillRect(0, 0, W, H); }
        if (editor.fadeIn && cTime < (activeClip?.start || 0) + 1) { ctx.fillStyle = `rgba(0,0,0,${1 - (cTime - (activeClip?.start || 0))})`; ctx.fillRect(0, 0, W, H); }
      }

      if (aPiPVid && showPiP) {
        const baseP = editor.pipPos; const scale = editor.pipScale || 1.0; const pW = Math.round(baseP.w * scale); const pH = Math.round(baseP.h * scale); const pX = Math.round(baseP.x + (baseP.w - pW) / 2); const pY = Math.round(baseP.y + (baseP.h - pH) / 2);
        const frameStyle = editor.pipFrameStyle || 'accent'; const radius = 16; const vw = aPiPVid.videoWidth, vh = aPiPVid.videoHeight;
        
        if (editor.swapPip) {
          // Draw Main Video as PiP
          const v = activeTemplate.video;
          ctx.save();
          roundRectPath(ctx, pX, pY, pW, pH, radius); ctx.clip();
          drawCover(ctx, sourceVideoRef.current, pX, pY, pW, pH);
          ctx.restore();
        } else {
          // Normal PiP
          ctx.save();
          if (frameStyle === 'accent') { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 4; ctx.fillStyle = editor.accentColor; roundRectPath(ctx, pX - 4, pY - 4, pW + 8, pH + 8, radius + 4); ctx.fill(); }
          else if (frameStyle === 'white') { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 4; ctx.fillStyle = '#fff'; roundRectPath(ctx, pX - 4, pY - 4, pW + 8, pH + 8, radius + 4); ctx.fill(); }
          else if (frameStyle === 'glow') { ctx.shadowColor = editor.accentColor; ctx.shadowBlur = 30; ctx.strokeStyle = editor.accentColor; ctx.lineWidth = 3; roundRectPath(ctx, pX, pY, pW, pH, radius); ctx.stroke(); }
          else if (frameStyle === 'minimal') { ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2; ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRectPath(ctx, pX, pY, pW, pH, radius); ctx.fill(); }
          ctx.restore();
          ctx.save(); roundRectPath(ctx, pX, pY, pW, pH, radius); ctx.clip();
          if (vw && vh) { if (!media.brollLoaded) { ctx.scale(-1, 1); ctx.translate(-W, 0); drawCover(ctx, aPiPVid, W - pX - pW, pY, pW, pH); } else { drawCover(ctx, aPiPVid, pX, pY, pW, pH); } }
          ctx.restore();
        }
      }
    }

    renderOverlayRef.current(); if (overlayCanvasRef.current) ctx.drawImage(overlayCanvasRef.current, 0, 0);

    if (editor.introEnabled && activeClip && editor.mode !== 'camera') {
      const introDur = 3.0; const introP = Math.min((currentTimeRef.current - activeClip.start) / introDur, 1.0);
      if (introP < 1.0) {
        ctx.fillStyle = `rgba(0,0,0,${1 - Math.pow(introP, 3)})`; ctx.fillRect(0, 0, W, H);
        const logo = logoImgRef.current; const hasLogo = logo.src && logo.complete; const lSize = 200; const cx = W / 2; const cy = H / 2; ctx.save();
        if (editor.introStyle === 'glitch_reveal') {
          let jitter = (1 - introP) * 40; ctx.globalAlpha = Math.min(introP * 3, 1);
          if (hasLogo) { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'red'; ctx.globalAlpha = 0.5; ctx.drawImage(logo, cx - lSize / 2 + jitter, cy - lSize / 2, lSize, lSize); ctx.fillStyle = 'cyan'; ctx.globalAlpha = 0.5; ctx.drawImage(logo, cx - lSize / 2 - jitter, cy - lSize / 2, lSize, lSize); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(logo, cx - lSize / 2, cy - lSize / 2, lSize, lSize); }
          else { drawZokaLogo(ctx, cx + jitter, cy, lSize / 2, 'red'); drawZokaLogo(ctx, cx - jitter, cy, lSize / 2, 'cyan'); drawZokaLogo(ctx, cx, cy, lSize / 2, '#fff'); }
        } else if (editor.introStyle === 'neon_pulse') {
          let pulse = Math.sin(introP * Math.PI * 6) * 0.5 + 0.5; ctx.shadowColor = editor.accentColor; ctx.shadowBlur = 40 + (pulse * 30); ctx.globalAlpha = Math.min(introP * 3, 1);
          if (hasLogo) ctx.drawImage(logo, cx - lSize / 2, cy - lSize / 2, lSize, lSize); else drawZokaLogo(ctx, cx, cy, lSize / 2, '#fff'); ctx.shadowBlur = 0;
        } else if (editor.introStyle === 'slide_zoom') {
          let scale = 1 + (1 - introP) * 1.5; let yPos = cy - (1 - introP) * 400; ctx.globalAlpha = Math.min(introP * 3, 1);
          if (hasLogo) ctx.drawImage(logo, cx - (lSize * scale) / 2, yPos - (lSize * scale) / 2, lSize * scale, lSize * scale); else drawZokaLogo(ctx, cx, yPos, (lSize / 2) * scale, '#fff');
        }
        ctx.restore();
      }
    }

    if (ui.showGuides) {
      ctx.strokeStyle = 'rgba(255,0,0,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
      ctx.strokeRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8);
      ctx.beginPath(); ctx.moveTo(W / 3, 0); ctx.lineTo(W / 3, H); ctx.moveTo(W * 2 / 3, 0); ctx.lineTo(W * 2 / 3, H);
      ctx.moveTo(0, H / 3); ctx.lineTo(W, H / 3); ctx.moveTo(0, H * 2 / 3); ctx.lineTo(W, H * 2 / 3); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (ui.isExporting && exportCanvasRef.current) { const eCtx = exportCanvasRef.current.getContext('2d'); if (eCtx) { eCtx.imageSmoothingEnabled = true; eCtx.imageSmoothingQuality = 'high'; eCtx.drawImage(canvas, 0, 0, 1080, 1920); } }
  };

  useEffect(() => { let aF; const l = () => { drawFrameRef.current(); aF = requestAnimationFrame(l); }; aF = requestAnimationFrame(l); return () => cancelAnimationFrame(aF); }, []);

  const getCanvasCoords = (e) => { 
    if (!canvasRef.current) return { x: 0, y: 0 };
    const r = canvasRef.current.getBoundingClientRect(); 
    const sx = canvasRef.current.width / r.width, sy = canvasRef.current.height / r.height; 
    const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY; 
    return { x: (cx - r.left) * sx, y: (cy - r.top) * sy }; 
  };

  const handlePointerDown = (e) => {
    const { x, y } = getCanvasCoords(e);
    const selSticker = editor.stickers?.find(s => s.id === editor.selectedStickerId);
    if (selSticker) {
      const handleX = selSticker.x + selSticker.size/2;
      const handleY = selSticker.y + selSticker.size/2;
      if (Math.hypot(x - handleX, y - handleY) < 30) {
        dragRef.current = { target: 'sticker_resize', id: selSticker.id };
        return;
      }
    }

    const clickedSticker = editor.stickers?.find(s => Math.abs(x - s.x) < s.size/2 && Math.abs(y - s.y) < s.size/2);
    if (clickedSticker) {
      dispatch({ type: 'SET_EDITOR', payload: { selectedStickerId: clickedSticker.id } });
      dragRef.current = { target: 'sticker_move', id: clickedSticker.id, offsetX: x - clickedSticker.x, offsetY: y - clickedSticker.y };
      return;
    }

    if (editor.selectedStickerId) dispatch({ type: 'SET_EDITOR', payload: { selectedStickerId: null } });

    if (!editor.editMode && !activeTemplate.isCustom && !media.brollLoaded && !media.cameraOn) return;
    if ((activeTemplate.isCustom || editor.editMode) && media.profileSrc) { 
      if (Math.hypot(x - editor.profilePos.x, y - editor.profilePos.y) <= editor.profilePos.r) { 
        dragRef.current = { target: 'profile', offsetX: x - editor.profilePos.x, offsetY: y - editor.profilePos.y }; return; 
      } 
    }
    if (media.brollLoaded || media.cameraOn) { 
      const baseP = editor.pipPos; const scale = editor.pipScale || 1.0; 
      const pW = Math.round(baseP.w * scale); const pH = Math.round(baseP.h * scale); 
      const pX = Math.round(baseP.x + (baseP.w - pW) / 2); const pY = Math.round(baseP.y + (baseP.h - pH) / 2); 
      if (x >= pX && x <= pX + pW && y >= pY && y <= pY + pH) { dragRef.current = { target: 'pip', offsetX: x - pX, offsetY: y - pY }; } 
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.target) return; 
    e.preventDefault(); 
    const { x, y } = getCanvasCoords(e);
    
    if (dragRef.current.target === 'sticker_move') {
      const newStickers = editor.stickers.map(s => s.id === dragRef.current.id ? { ...s, x: x - dragRef.current.offsetX, y: y - dragRef.current.offsetY } : s);
      dispatch({ type: 'SET_EDITOR', payload: { stickers: newStickers }, trackHistory: false });
    } else if (dragRef.current.target === 'sticker_resize') {
      const newStickers = editor.stickers.map(s => {
        if (s.id === dragRef.current.id) {
          const newSize = Math.max(30, Math.min(400, Math.hypot(x - s.x, y - s.y) * 1.5));
          return { ...s, size: newSize };
        }
        return s;
      });
      dispatch({ type: 'SET_EDITOR', payload: { stickers: newStickers }, trackHistory: false });
    } else if (dragRef.current.target === 'pip') { 
      const baseP = editor.pipPos; const scale = editor.pipScale || 1.0; const pW = Math.round(baseP.w * scale); const pH = Math.round(baseP.h * scale); 
      let nX = Math.max(0, Math.min(x - dragRef.current.offsetX, canvasRef.current.width - pW)); 
      let nY = Math.max(0, Math.min(y - dragRef.current.offsetY, canvasRef.current.height - pH)); 
      const sx = [0, canvasRef.current.width/2 - pW/2, canvasRef.current.width - pW]; 
      sx.forEach(pt => { if (Math.abs(nX - pt) < 20) nX = pt; }); 
      const newBaseX = nX - (baseP.w - pW) / 2; const newBaseY = nY - (baseP.h - pH) / 2; 
      dispatch({ type: 'SET_EDITOR', payload: { pipPos: { ...baseP, x: newBaseX, y: newBaseY } }, trackHistory: false }); 
    } else if (dragRef.current.target === 'profile') { 
      let nX = Math.max(editor.profilePos.r, Math.min(x - dragRef.current.offsetX, canvasRef.current.width - editor.profilePos.r)); 
      let nY = Math.max(editor.profilePos.r, Math.min(y - dragRef.current.offsetY, canvasRef.current.height - editor.profilePos.r)); 
      dispatch({ type: 'SET_EDITOR', payload: { profilePos: { ...editor.profilePos, x: nX, y: nY } }, trackHistory: false }); 
    }
  };

  const handlePointerUp = () => dragRef.current.target = null;

  const handleExportVideo = async (preset) => {
    const { format, fps, bitrate } = preset;
    const vid = sourceVideoRef.current;
    if (!canvasRef.current || ui.isExporting) return;
    if (editor.mode === 'video' && !media.sourceLoaded) return;
    if (editor.mode === 'slideshow' && slideshow.images.length === 0) return;

    const exportC = document.createElement('canvas');
    exportC.width = 1080; exportC.height = 1920;
    exportCanvasRef.current = exportC;
    dispatch({ type: 'SET_UI', payload: { isExporting: true, exportFormat: format, exportFps: fps, exportProgress: 0 } });
    dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: false } });

    let exportDuration = 0;
    let fileExt = format === 'mp4' ? 'mp4' : 'webm';

    if (editor.mode === 'video' && media.sourceLoaded) {
      exportDuration = timeline.clips.reduce((sum, c) => sum + (c.end - c.start), 0);
      currentExportClipRef.current = 0;
      vid.pause(); 
      vid.currentTime = timeline.clips[0].start;
      await new Promise(r => setTimeout(r, 200));
      vid.muted = false; vid.volume = 0;
    } else if (editor.mode === 'camera' && media.cameraOn) {
      exportDuration = 30; // Limit camera solo export to 30s
    } else {
      exportDuration = slideshow.duration;
      currentTimeRef.current = 0;
      dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: true } });
    }

    await new Promise(r => setTimeout(r, 300));
    const cS = exportC.captureStream(fps);
    let aC;
    try {
      aC = new (window.AudioContext || window.webkitAudioContext)();
      if (aC.state === 'suspended') await aC.resume();
      const aD = aC.createMediaStreamDestination();
      if (streamRef.current && streamRef.current.getAudioTracks().length > 0) { aC.createMediaStreamSource(new MediaStream(streamRef.current.getAudioTracks())).connect(aD); }
      if (vid && vid.captureStream && media.sourceLoaded) { try { const vS = vid.captureStream(); if (vS.getAudioTracks().length > 0) { aC.createMediaStreamSource(vS).connect(aD); } } catch { } }
     if (audioRef.current.src) { try { audioRef.current.play().catch(() => {}); const aS = audioRef.current.captureStream ? audioRef.current.captureStream() : audioRef.current.mozCaptureStream(); if (aS.getAudioTracks().length > 0) { aC.createMediaStreamSource(aS).connect(aD); } } catch { } }
      const o = aC.createOscillator(); const g = aC.createGain(); g.gain.value = 0.0; o.connect(g); g.connect(aD); g.connect(aC.destination); o.start();
      aD.stream.getAudioTracks().forEach(t => cS.addTrack(t));
    } catch (e) { }

    chunksRef.current = [];
    let mT = 'video/webm';
    if (format === 'mp4') {
      const mp4Codecs = ['video/mp4;codecs=avc1.640029,mp4a.40.2', 'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=h264', 'video/mp4'];
      mT = mp4Codecs.find(c => MediaRecorder.isTypeSupported(c));
      if (mT) fileExt = 'mp4';
      else { mT = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8'; fileExt = 'webm'; addToast("Browser limited: Exporting as WebM instead.", 'info'); }
    } else {
      mT = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
      fileExt = 'webm';
    }

    const r = new MediaRecorder(cS, { mimeType: mT, videoBitsPerSecond: bitrate });
    mediaRecorderRef.current = r;
    r.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    r.onstop = async () => {
      let b = new Blob(chunksRef.current, { type: mT });
      if (fileExt === 'webm') b = await fixWebmDuration(b, exportDuration * 1000);
      dispatch({ type: 'SET_UI', payload: { recordedUrl: URL.createObjectURL(b), recordedExt: fileExt, isExporting: false, exportFormat: null, exportFps: null, exportProgress: 100 } });
      if (vid) vid.pause();
      if (audioRef.current) audioRef.current.pause();
      if (vid) { vid.muted = editor.isMuted; vid.volume = 1; }
      cS.getTracks().forEach(t => t.stop());
      if (aC) aC.close();
      exportCanvasRef.current = null;

      setGameState(prev => {
        const newExports = prev.totalExports + 1;
        const newState = { ...prev, totalExports: newExports };
        saveGameState(newState);
        return newState;
      });
      unlockAchievement('first_export');
      if (gameState.totalExports + 1 >= 5) unlockAchievement('five_exports');
      addToast(`Export complete! (${fileExt.toUpperCase()})`, 'success');
      haptic('success');
    };

    const progressInterval = setInterval(() => {
      if (exportDuration > 0) {
        let prog = 0;
        if (editor.mode === 'video' && media.sourceLoaded) {
          let compDur = 0;
          for(let i=0; i<currentExportClipRef.current; i++) compDur += (timeline.clips[i].end - timeline.clips[i].start);
          const c = timeline.clips[currentExportClipRef.current];
          const currProg = c ? Math.max(0, vid.currentTime - c.start) : 0;
          prog = Math.min(((compDur + currProg) / exportDuration) * 100, 99);
        } else {
          prog = Math.min((currentTimeRef.current / exportDuration) * 100, 99);
        }
        dispatch({ type: 'SET_UI', payload: { exportProgress: Math.round(prog) } });
      }
    }, 200);

    r.start(100);
    if (editor.mode === 'video' && media.sourceLoaded) { try { await vid.play().catch(() => {}); } catch { } }
    else if (editor.mode === 'camera') { dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: true } }); }
  };

  const cancelExport = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    if (sourceVideoRef.current) sourceVideoRef.current.pause();
    dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: false } });
    dispatch({ type: 'SET_UI', payload: { isExporting: false, exportFormat: null, exportFps: null, exportProgress: 0 } });
    exportCanvasRef.current = null;
  };

  const applyTemplate = (id) => {
    const t = templateMap[id];
    if (!t) return;
    dispatch({ type: 'SET_EDITOR', payload: { templateId: id, profilePos: t.profile ? { x: t.profile.x, y: t.profile.y, r: t.profile.r } : editor.profilePos, pipPos: getPipPosForTemplate(t), pipScale: 1.0 } });
    dispatch({ type: 'SET_UI', payload: { activePanel: null } });
    const nR = [id, ...ui.recents.filter(r => r !== id)].slice(0, 5);
    localStorage.setItem("reactor-recents", JSON.stringify(nR));
    dispatch({ type: 'SET_UI', payload: { recents: nR } });
    setGameState(prev => {
      const templatesUsed = prev.templatesUsed.includes(id) ? prev.templatesUsed : [...prev.templatesUsed, id];
      const newState = { ...prev, templatesUsed };
      saveGameState(newState);
      if (templatesUsed.length >= 10) unlockAchievement('template_master');
      return newState;
    });
    haptic('medium');
    addToast(`Template: ${t.title}`, 'info');
  };

  const toggleFavorite = (id) => {
    const n = ui.favorites.includes(id) ? ui.favorites.filter(x => x !== id) : [...ui.favorites, id];
    localStorage.setItem("reactor-favorites", JSON.stringify(n));
    dispatch({ type: 'SET_UI', payload: { favorites: n } });
    haptic('light');
  };

  const addSticker = (sticker) => {
    const ratios = { '9:16': { w: 720, h: 1280 }, '1:1': { w: 1080, h: 1080 }, '4:5': { w: 864, h: 1080 } };
    const dims = ratios[editor.canvasRatio] || ratios['9:16'];
    const newSticker = { ...sticker, x: dims.w / 2, y: dims.h / 2, size: 100, id: Date.now() };
    dispatch({ type: 'SET_EDITOR', payload: { stickers: [...(editor.stickers || []), newSticker], selectedStickerId: newSticker.id } });
    haptic('light');
  };

  const filteredTemplates = useMemo(() => {
    let l = TEMPLATES;
    if (ui.activeCategory === "Favorites") l = l.filter(t => ui.favorites.includes(t.id));
    else if (ui.activeCategory !== "All") l = l.filter(t => t.category === ui.activeCategory);
    if (ui.searchQuery) { const q = ui.searchQuery.toLowerCase(); l = l.filter(t => t.title.toLowerCase().includes(q) || t.tags.some(tg => tg.includes(q))); }
    return l;
  }, [ui.activeCategory, ui.searchQuery, ui.favorites]);

  const levelProgress = getLevelProgress(gameState.xp);

  const renderToolButtons = () => {
    const tools = [
      { id: 'upload', icon: editor.mode === 'video' ? <Upload size={20} /> : <Images size={20} />, label: editor.mode === 'video' ? 'Video' : 'Images', onClick: () => editor.mode === 'video' ? fileInputRefs.current.video?.click() : fileInputRefs.current.images?.click() },
      { id: 'templates', icon: <LayoutGrid size={20} />, label: 'Templates', active: ui.activePanel === 'templates', onClick: () => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'templates' ? null : 'templates' } }) },
      { id: 'edit', icon: <Layers size={20} />, label: 'Edit', active: ui.activePanel === 'edit', onClick: () => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'edit' ? null : 'edit' } }) },
      { id: 'text', icon: <Type size={20} />, label: 'Text', active: ui.activePanel === 'text', onClick: () => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'text' ? null : 'text' } }) },
      { id: 'effects', icon: <Wand2 size={20} />, label: 'Effects', active: ui.activePanel === 'effects', onClick: () => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'effects' ? null : 'effects' } }) },
      { id: 'stickers', icon: <Smile size={20} />, label: 'Stickers', active: ui.activePanel === 'stickers', onClick: () => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'stickers' ? null : 'stickers' } }) },
      { id: 'audio', icon: <Music size={20} />, label: 'Audio', active: ui.activePanel === 'audio', onClick: () => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'audio' ? null : 'audio' } }) },
      { id: 'avatar', icon: <User size={20} />, label: 'Avatar', onClick: () => fileInputRefs.current.image?.click() },
      { id: 'logo', icon: <ImageIcon size={20} />, label: 'Logo', active: !!media.logoSrc, onClick: () => fileInputRefs.current.logo?.click() },
    ];
    if (editor.mode === 'video' || editor.mode === 'camera') {
      tools.push(
        { id: 'broll', icon: <Film size={20} />, label: 'B-Roll', active: media.brollLoaded, onClick: () => fileInputRefs.current.broll?.click() },
        { id: 'camera', icon: <Camera size={20} />, label: 'Camera', active: media.cameraOn, onClick: startCamera }
      );
    }
    tools.push({ id: 'fullscreen', icon: ui.fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />, label: ui.fullscreen ? 'Exit' : 'Full-Screen', onClick: toggleFullscreen });
    
    return tools.map(t => (
      <button key={t.id} className={`rs-tool-btn ${t.active ? 'active' : ''}`} onClick={t.onClick}>
        {t.icon}
        <span className="rs-tool-label">{t.label}</span>
      </button>
    ));
  };

  return (
    <div className="rs-container">
      <input type="file" ref={el => fileInputRefs.current.video = el} onChange={(e) => handleImport(e, 'video')} accept="video/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.broll = el} onChange={(e) => handleImport(e, 'broll')} accept="video/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.image = el} onChange={(e) => handleImport(e, 'image')} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.logo = el} onChange={(e) => handleImport(e, 'logo')} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.audio = el} onChange={(e) => handleImport(e, 'audio')} accept="audio/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.images = el} onChange={handleImportImages} accept="image/*" multiple style={{ display: 'none' }} />

      <div className="rs-header">
        <div className="rs-header-left">
          <button onClick={() => navigate('/studio')} className="rs-top-btn"><ArrowLeft size={18} /></button>
          <h1 className="rs-header-title"><Cpu size={18} color="var(--rs-accent)" /> Reactor Pro</h1>
          <div className="rs-autosave-indicator" title={ui.autoSaveStatus === 'saving' ? 'Saving...' : 'Saved'}>
            <Cloud size={12} className={ui.autoSaveStatus === 'saving' ? 'rs-pulse' : ''} />
          </div>
        </div>
        <div className="rs-header-right">
          <div className="rs-level-badge" title={`Level ${gameState.level} • ${gameState.xp} XP`}>
            <Zap size={12} /> <span>Lv.{gameState.level}</span>
            <div className="rs-level-bar"><div className="rs-level-fill" style={{ width: `${levelProgress * 100}%` }} /></div>
          </div>
          {gameState.streak > 1 && <div className="rs-streak-badge"><Flame size={12} /> {gameState.streak}</div>}

          <button onClick={() => dispatch({ type: 'UNDO' })} className="rs-top-btn" disabled={history.past.length === 0} title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
          <button onClick={() => dispatch({ type: 'REDO' })} className="rs-top-btn" disabled={history.future.length === 0} title="Redo (Ctrl+Shift+Z)"><Redo2 size={14} /></button>
          <button onClick={handleClearProject} className="rs-top-btn" title="Clear Project"><Eraser size={14} /></button>

          {ui.isExporting ? (
            <button onClick={cancelExport} className="rs-top-btn rs-btn-red"><X size={14} /> Cancel</button>
          ) : ui.recordedUrl ? (
            <>
              <button onClick={() => dispatch({ type: 'SET_UI', payload: { recordedUrl: null } })} className="rs-top-btn rs-btn-red"><Trash2 size={14} /></button>
              <a href={ui.recordedUrl} download={`zokascore_clip.${ui.recordedExt || 'webm'}`} className="rs-top-btn rs-btn-accent" style={{ textDecoration: 'none' }}><Download size={14} /> Save</a>
            </>
          ) : (
            <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: ui.activePanel === 'export' ? null : 'export' } })} className="rs-top-btn rs-btn-accent" title="Export">
              <Download size={14} /> Export
            </button>
          )}
        </div>
      </div>

      {ui.isExporting && (
        <div className="rs-export-progress-bar">
          <div className="rs-export-progress-fill" style={{ width: `${ui.exportProgress}%` }} />
          <span className="rs-export-progress-text">{ui.exportProgress}%</span>
        </div>
      )}

      <div className="rs-main">
        <div className="rs-canvas-area">
          <div className="rs-canvas-wrap" data-ratio={editor.canvasRatio}
            onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}>
            <canvas ref={canvasRef} className="rs-canvas" />
            {!media.sourceLoaded && editor.mode === 'video' && !ui.recordedUrl && slideshow.images.length === 0 && !media.cameraOn && (
              <div className="rs-canvas-empty" onClick={() => fileInputRefs.current.video?.click()}>
                <Upload size={40} style={{ marginBottom: '12px' }} /><p style={{ fontWeight: 700 }}>Import Main Video</p>
                <button onClick={(e) => { e.stopPropagation(); fileInputRefs.current.images?.click(); }} className="rs-btn-sm rs-btn-blue" style={{ marginTop: '16px' }}>
                  <Images size={14} /> Or Create Image Slideshow
                </button>
              </div>
            )}
            {ui.recordedUrl && <video src={ui.recordedUrl} controls autoPlay loop className="rs-canvas-preview" />}
            {ui.isExporting && <div className="rs-canvas-exporting"><Loader size={12} className="rs-spin" /> EXPORTING {ui.exportProgress}%</div>}
            
            {editor.selectedStickerId && (
              <div className="rs-sticker-actions">
                <button className="rs-btn-sm rs-btn-danger" onClick={() => {
                  const newStickers = editor.stickers.filter(s => s.id !== editor.selectedStickerId);
                  dispatch({ type: 'SET_EDITOR', payload: { stickers: newStickers, selectedStickerId: null } });
                }}>
                  <Trash2 size={14} /> Delete Sticker
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {(media.sourceLoaded || slideshow.images.length > 0 || media.cameraOn) && (
        <div className="rs-bottom-controls">
          <div className="rs-playback-row">
            <button onClick={() => { if (sourceVideoRef.current) sourceVideoRef.current.currentTime = Math.max(0, sourceVideoRef.current.currentTime - 5); }} className="rs-action-btn" title="Back 5s"><Rewind size={16} /></button>
            <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { isMuted: !editor.isMuted } })} className="rs-action-btn" title="Mute (M)">{editor.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <button onClick={togglePreview} disabled={ui.isExporting || ui.recordedUrl} className="rs-play-btn" title="Play/Pause (Space)">
              {timeline.isPlaying ? <Pause size={28} fill="var(--rs-bg-card)" /> : <Play size={28} fill="var(--rs-bg-card)" />}
            </button>
            {editor.mode === 'video' && media.sourceLoaded && (
              <button onClick={() => {
                const vid = sourceVideoRef.current; if (!vid || !activeClip) return;
                const t = vid.currentTime; const idx = timeline.clips.findIndex(c => c.id === timeline.activeClipId); const c = timeline.clips[idx];
                if (t > c.start + 0.5 && t < c.end - 0.5) {
                  const c1 = { ...c, end: t }; const c2 = { id: `clip_${Date.now()}`, start: t, end: c.end };
                  const nClips = [...timeline.clips]; nClips.splice(idx, 1, c1, c2);
                  dispatch({ type: 'SET_TIMELINE', payload: { clips: nClips, activeClipId: c2.id } });
                  addToast('Clip split!', 'info');
                }
              }} className="rs-action-btn" disabled={ui.isExporting || ui.recordedUrl} title="Split"><Scissors size={16} /></button>
            )}
            <button onClick={() => { if (sourceVideoRef.current) sourceVideoRef.current.currentTime = Math.min(timeline.duration, sourceVideoRef.current.currentTime + 5); }} className="rs-action-btn" title="Forward 5s"><FastForward size={16} /></button>
          </div>
          <div className="rs-time-display">
            <span>{timeline.currentTime.toFixed(1)}s</span>
            <span>{timeline.duration.toFixed(1)}s</span>
          </div>
          <div className="rs-timeline-track">
            {timeline.clips.map((c) => {
              const dur = timeline.duration || 1;
              const wPct = ((c.end - c.start) / dur) * 100;
              const lPct = (c.start / dur) * 100;
              const isAct = c.id === timeline.activeClipId;
              return (
                <div key={c.id} onClick={() => { if (editor.mode === 'video') { dispatch({ type: 'SET_TIMELINE', payload: { activeClipId: c.id } }); sourceVideoRef.current.currentTime = c.start; } }}
                  className={`rs-timeline-clip ${isAct ? 'active' : ''}`} style={{ left: `${lPct}%`, width: `${wPct}%` }}>
                  <span className="rs-timeline-clip-label">Clip {timeline.clips.indexOf(c) + 1}</span>
                  {timeline.clips.length > 1 && editor.mode === 'video' && (
                    <button onClick={(e) => { e.stopPropagation(); const nClips = timeline.clips.filter(cl => cl.id !== c.id); dispatch({ type: 'SET_TIMELINE', payload: { clips: nClips, activeClipId: nClips[0].id } }); if (sourceVideoRef.current) sourceVideoRef.current.currentTime = nClips[0].start; }} className="rs-timeline-del"><X size={10} /></button>
                  )}
                </div>
              );
            })}
            <div className="rs-timeline-playhead" style={{ left: `${(timeline.currentTime / (timeline.duration || 1)) * 100}%` }}></div>
          </div>
        </div>
      )}

      {!ui.isExporting && !ui.recordedUrl && (
        <div className="rs-toolbar-wrap">
          {isMobile && scrollState.left && <div className="rs-scroll-arrow rs-arrow-left"><ChevronLeft size={20} /></div>}
          {isMobile && scrollState.right && <div className="rs-scroll-arrow rs-arrow-right"><ChevronRight size={20} /></div>}
          {!isMobile && scrollState.up && <div className="rs-scroll-arrow rs-arrow-up"><ChevronUp size={20} /></div>}
          {!isMobile && scrollState.down && <div className="rs-scroll-arrow rs-arrow-down"><ChevronDown size={20} /></div>}
          
          <div className="rs-toolbar" ref={toolbarRef} onScroll={handleToolbarScroll}>
            {renderToolButtons()}
          </div>
        </div>
      )}

      {ui.activePanel && (
        <div className="rs-controls-panel open">
          <button onClick={() => dispatch({ type: 'SET_UI', payload: { activePanel: null } })} className="rs-panel-close"><X size={18} /></button>

          {ui.activePanel === 'templates' && (
            <div>
              <h3 className="rs-panel-title"><LayoutGrid size={14} color="var(--rs-accent)" /> Templates</h3>
              <div className="rs-search-box">
                <Search size={14} />
                <input type="text" value={ui.searchQuery} onChange={(e) => dispatch({ type: 'SET_UI', payload: { searchQuery: e.target.value } })} placeholder="Search templates..." className="rs-search-input" />
              </div>
              <div className="rs-gallery-cats">
                {["All", "Favorites", "Pro", "TikTok", "Instagram", "YouTube", "Gaming", "Podcast", "Football", "Minimal"].map(cat => <button key={cat} onClick={() => { dispatch({ type: 'SET_UI', payload: { activeCategory: cat } }); haptic('light'); }} className={`rs-gallery-cat ${ui.activeCategory === cat ? 'active' : ''}`}>{cat}</button>)}
              </div>
              <div className="rs-gallery-grid">
                {filteredTemplates.map(t => (
                  <div key={t.id} className={`rs-gallery-card ${editor.templateId === t.id ? 'active' : ''}`} onClick={() => applyTemplate(t.id)}>
                    <div className="rs-gallery-preview" style={{ background: t.preview.bg }}>
                      {t.isPro && <div className="rs-pro-badge"><Zap size={10} /> PRO</div>}
                      {t.category === 'Pro' && (<div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}><div style={{ width: '40px', height: '40px', background: '#fff', marginBottom: '8px', borderRadius: '4px' }}></div><div style={{ width: '80px', height: '8px', background: '#fff', borderRadius: '4px' }}></div></div>)}
                      {t.preview.layout === 'pov' && (<><div style={{ position: 'absolute', top: '15px', left: '15px', width: '24px', height: '24px', background: '#fff', borderRadius: '50%', border: '2px solid #1d9bf0' }}></div><div style={{ position: 'absolute', top: '50px', left: '15px', display: 'flex', flexDirection: 'column', gap: '4px' }}><div style={{ width: '120px', height: '6px', background: '#fff', borderRadius: '4px' }}></div><div style={{ width: '100px', height: '6px', background: '#fff', borderRadius: '4px' }}></div></div></>)}
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
              <h3 className="rs-panel-title"><Layers size={14} color="var(--rs-accent)" /> Edit & Layers</h3>
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Crop size={12} /> Aspect Ratio</h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[{ id: '9:16', name: 'TikTok' }, { id: '1:1', name: 'Square' }, { id: '4:5', name: 'Insta' }].map(r => (
                    <button key={r.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { canvasRatio: r.id } })} 
                      className={`rs-btn-sm ${editor.canvasRatio === r.id ? 'active' : ''}`} style={{ flex: 1 }}>
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Palette size={12} /> Background Color</h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="color" value={editor.bgColor || '#000000'} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { bgColor: e.target.value } })} className="rs-input-color" />
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { bgColor: null } })} className="rs-btn-sm">Reset to Default</button>
                </div>
              </div>
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Gauge size={12} /> Playback Speed</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[0.25, 0.5, 1.0, 1.5, 2.0, 3.0].map(s => <button key={s} onClick={() => { dispatch({ type: 'SET_EDITOR', payload: { playbackRate: s } }); haptic('light'); }} className={`rs-btn-sm ${editor.playbackRate === s ? 'active' : ''}`}>{s}x</button>)}
                </div>
              </div>
              {editor.mode === 'slideshow' && (
                <div className="rs-panel-box">
                  <h4 className="rs-box-title"><Images size={12} /> Slideshow Settings</h4>
                  <label className="rs-label">Image Duration: {editor.slideshowSpeed}s</label>
                  <input type="range" min="1" max="10" step="1" value={editor.slideshowSpeed} onChange={(e) => { const newSpeed = parseInt(e.target.value); const newDur = slideshow.images.length * newSpeed; dispatch({ type: 'SET_EDITOR', payload: { slideshowSpeed: newSpeed } }); dispatch({ type: 'SET_SLIDESHOW', payload: { duration: newDur } }); dispatch({ type: 'SET_TIMELINE', payload: { duration: newDur, clips: [{ id: 'clip1', start: 0, end: newDur }] } }); }} className="rs-range" />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {SLIDESHOW_TRANSITIONS.map(t => <button key={t.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { slideshowTransition: t.id } })} className={`rs-btn-sm ${editor.slideshowTransition === t.id ? 'active' : ''}`}>{t.name}</button>)}
                  </div>
                </div>
              )}
              {media.sourceLoaded && editor.mode === 'video' && (
                <div className="rs-panel-box">
                  <h4 className="rs-box-title"><Crop size={12} /> Crop & Zoom</h4>
                  <label className="rs-label">Zoom: {editor.videoZoom.toFixed(1)}x</label>
                  <input type="range" min="1" max="4" step="0.1" value={editor.videoZoom} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoZoom: parseFloat(e.target.value) }, trackHistory: false })} className="rs-range" />
                  <label className="rs-label">Pan X: {editor.videoPanX.toFixed(1)}</label>
                  <input type="range" min="-1" max="1" step="0.1" value={editor.videoPanX} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoPanX: parseFloat(e.target.value) }, trackHistory: false })} className="rs-range" />
                  <label className="rs-label">Pan Y: {editor.videoPanY.toFixed(1)}</label>
                  <input type="range" min="-1" max="1" step="0.1" value={editor.videoPanY} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { videoPanY: parseFloat(e.target.value) }, trackHistory: false })} className="rs-range" />
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { videoZoom: 1, videoPanX: 0, videoPanY: 0 } })} className="rs-btn-sm">Reset Crop</button>
                </div>
              )}
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Move size={12} /> Grid Edit Mode</h4>
                <button onClick={() => { dispatch({ type: 'SET_EDITOR', payload: { editMode: !editor.editMode } }); haptic('medium'); }} className={`rs-btn-sm ${editor.editMode ? 'active' : ''}`} style={{ width: '100%' }}>
                  {editor.editMode ? '🎯 DRAGGING ENABLED' : 'ENABLE FREE DRAG'}
                </button>
                <button onClick={() => dispatch({ type: 'SET_UI', payload: { showGuides: !ui.showGuides } })} className={`rs-btn-sm ${ui.showGuides ? 'active' : ''}`} style={{ width: '100%', marginTop: '6px' }}>
                  <Grid3x3 size={12} /> Guides: {ui.showGuides ? 'On' : 'Off'}
                </button>
              </div>
              {(media.brollLoaded || media.cameraOn) && (editor.mode === 'video' || editor.mode === 'camera') && (
                <div className="rs-panel-box">
                  <h4 className="rs-box-title"><Film size={12} /> PIP Controls</h4>
                  <label className="rs-label">PIP Size: {Math.round((editor.pipScale || 1) * 100)}%</label>
                  <input type="range" min="0.5" max="2" step="0.05" value={editor.pipScale || 1} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { pipScale: parseFloat(e.target.value) }, trackHistory: false })} className="rs-range" />
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
                    {[{ id: 'accent', name: 'Accent' }, { id: 'white', name: 'White' }, { id: 'glow', name: 'Glow' }, { id: 'minimal', name: 'Minimal' }].map(s => <button key={s.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { pipFrameStyle: s.id } })} className={`rs-btn-sm ${(editor.pipFrameStyle || 'accent') === s.id ? 'active' : ''}`}>{s.name}</button>)}
                  </div>
                  {media.sourceLoaded && (
                    <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { swapPip: !editor.swapPip } })} className={`rs-btn-sm ${editor.swapPip ? 'active' : ''}`} style={{ width: '100%', marginTop: '8px' }}>
                      <ArrowLeftRight size={12} /> {editor.swapPip ? 'Main Screen Active' : 'Swap to Main Screen'}
                    </button>
                  )}
                </div>
              )}
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Layers size={12} /> Layers Visibility</h4>
                {Object.keys(ui.layers).map(key => (
                  <label key={key} className="rs-checkbox-label">
                    <input type="checkbox" checked={ui.layers[key]} onChange={() => dispatch({ type: 'SET_UI', payload: { layers: { ...ui.layers, [key]: !ui.layers[key] } } })} className="rs-checkbox" />
                    {ui.layers[key] ? <Eye size={12} /> : <EyeOff size={12} />} {key}
                  </label>
                ))}
              </div>
            </div>
          )}

          {ui.activePanel === 'text' && (
            <div>
              <h3 className="rs-panel-title"><Type size={14} color="var(--rs-accent)" /> Text & Social</h3>
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><User size={12} /> Social Details</h4>
                <input type="text" value={editor.displayName} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { displayName: e.target.value }, trackHistory: false })} placeholder="Display Name" className="rs-input" />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <input type="color" value={editor.nameColor} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { nameColor: e.target.value } })} className="rs-input" style={{ width: '40px', padding: '2px', height: '36px' }} />
                  <input type="number" value={editor.nameSize || ''} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { nameSize: e.target.value ? parseInt(e.target.value) : null } })} placeholder="Size" className="rs-input" style={{ width: '80px' }} />
                  <button onClick={() => { dispatch({ type: 'SET_EDITOR', payload: { showVerified: !editor.showVerified } }); if (!editor.showVerified) unlockAchievement('social_butterfly'); }} className={`rs-btn-sm ${editor.showVerified ? 'active' : ''}`} style={{ background: editor.showVerified ? '#1d9bf0' : undefined, borderColor: editor.showVerified ? '#1d9bf0' : undefined }}><BadgeCheck size={16} /></button>
                </div>
                <input type="text" value={editor.username} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { username: e.target.value }, trackHistory: false })} placeholder="@username" className="rs-input" />
                <textarea value={editor.povCaption} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { povCaption: e.target.value }, trackHistory: false })} placeholder="Caption" className="rs-input" style={{ height: '60px', resize: 'none', marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="color" value={editor.captionColor} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { captionColor: e.target.value } })} className="rs-input" style={{ width: '40px', padding: '2px', height: '36px' }} />
                  <input type="number" value={editor.captionSize || ''} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { captionSize: e.target.value ? parseInt(e.target.value) : null } })} placeholder="Size" className="rs-input" style={{ width: '80px' }} />
                </div>
              </div>
              
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><User size={12} /> Avatar Style</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {AVATAR_SHAPES.map(s => <button key={s.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { avatarShape: s.id } })} className={`rs-btn-sm ${editor.avatarShape === s.id ? 'active' : ''}`}>{s.name}</button>)}
                </div>
                <h4 className="rs-box-title"><Sparkles size={12} /> Avatar Animation</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {AVATAR_ANIMS.map(a => <button key={a.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { avatarAnim: a.id } })} className={`rs-btn-sm ${editor.avatarAnim === a.id ? 'active' : ''}`}>{a.name}</button>)}
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
                  {[{ id: 'none', name: 'None' }, { id: 'fade_in', name: 'Fade In' }, { id: 'slide_up', name: 'Slide Up' }, { id: 'type_writer', name: 'Typewriter' }].map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { textAnimation: f.id } })} className={`rs-btn-sm ${editor.textAnimation === f.id ? 'active' : ''}`}>{f.name}</button>)}
                </div>
              </div>
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Shield size={12} /> Football Assets</h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input type="text" value={editor.homeLogoUrl} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { homeLogoUrl: e.target.value } })} placeholder="Home Logo URL" className="rs-input" />
                  <input type="number" value={editor.homeScore} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { homeScore: e.target.value } })} className="rs-input" style={{ width: '50px', flex: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" value={editor.awayLogoUrl} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { awayLogoUrl: e.target.value } })} placeholder="Away Logo URL" className="rs-input" />
                  <input type="number" value={editor.awayScore} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { awayScore: e.target.value } })} className="rs-input" style={{ width: '50px', flex: 'none' }} />
                </div>
              </div>
            </div>
          )}

          {ui.activePanel === 'effects' && (
            <div>
              <h3 className="rs-panel-title"><Wand2 size={14} color="var(--rs-accent)" /> Effects & Filters</h3>
              {editor.mode === 'video' && (
                <div className="rs-panel-box">
                  <h4 className="rs-box-title"><Wand2 size={12} /> Video Effects</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {VIDEO_EFFECTS.map(f => <button key={f.id} onClick={() => { dispatch({ type: 'SET_EDITOR', payload: { videoEffect: f.id } }); if (f.id !== 'none') { setGameState(prev => { const effectsUsed = prev.effectsUsed.includes(f.id) ? prev.effectsUsed : [...prev.effectsUsed, f.id]; const newState = { ...prev, effectsUsed }; saveGameState(newState); if (effectsUsed.length >= 5) unlockAchievement('effect_artist'); return newState; }); } }} className={`rs-btn-sm ${editor.videoEffect === f.id ? 'active' : ''}`}>{f.name}</button>)}
                  </div>
                </div>
              )}
              <div className="rs-panel-box">
                <h4 className="rs-box-title"><Sliders size={12} /> Filters</h4>
                <div className="rs-filters-scroll">
                  {FILTERS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { filter: f.id } })} className={`rs-filter-btn ${editor.filter === f.id ? 'active' : ''}`}><span className="rs-filter-icon">{f.icon}</span>{f.name}</button>)}
                </div>
              </div>
              {editor.mode === 'video' && (
                <div className="rs-panel-box">
                  <h4 className="rs-box-title"><Sparkles size={12} /> Cinematic Intro</h4>
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introEnabled: !editor.introEnabled } })} className={`rs-btn-sm ${editor.introEnabled ? 'active' : ''}`} style={{ width: '100%', marginBottom: '8px' }}>
                    {editor.introEnabled ? '✨ INTRO ENABLED' : 'ENABLE INTRO'}
                  </button>
                  {editor.introEnabled && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[{ id: 'glitch_reveal', name: 'Glitch' }, { id: 'neon_pulse', name: 'Neon' }, { id: 'slide_zoom', name: 'Slide' }].map(s => <button key={s.id} onClick={() => dispatch({ type: 'SET_EDITOR', payload: { introStyle: s.id } })} className={`rs-btn-sm ${editor.introStyle === s.id ? 'active' : ''}`}>{s.name}</button>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {ui.activePanel === 'stickers' && (
            <div>
              <h3 className="rs-panel-title"><Smile size={14} color="var(--rs-accent)" /> Stickers</h3>
              <div className="rs-panel-box">
                <div className="rs-stickers-grid">
                  {STICKERS.map(s => (
                    <button key={s.id} onClick={() => addSticker(s)} className="rs-sticker-btn" title={s.name}>{s.emoji}</button>
                  ))}
                </div>
              </div>
              {editor.stickers && editor.stickers.length > 0 && (
                <div className="rs-panel-box">
                  <h4 className="rs-box-title">Active Stickers ({editor.stickers.length})</h4>
                  <label className="rs-label">Opacity: {Math.round(editor.stickerOpacity * 100)}%</label>
                  <input type="range" min="0.1" max="1" step="0.1" value={editor.stickerOpacity} onChange={(e) => dispatch({ type: 'SET_EDITOR', payload: { stickerOpacity: parseFloat(e.target.value) } })} className="rs-range" />
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { stickers: [] } })} className="rs-btn-sm rs-btn-red" style={{ width: '100%', marginTop: '8px' }}><Trash2 size={12} /> Clear All</button>
                </div>
              )}
            </div>
          )}

          {ui.activePanel === 'audio' && (
            <div>
              <h3 className="rs-panel-title"><Music size={14} color="var(--rs-accent)" /> Audio Controls</h3>
              <div className="rs-panel-box">
                <button onClick={() => fileInputRefs.current.audio?.click()} className="rs-btn-sm" style={{ width: '100%', marginBottom: '8px' }}>
                  <Music size={12} /> {media.audioName ? `♫ ${media.audioName}` : 'Import Audio Track'}
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { isMuted: !editor.isMuted } })} className="rs-btn-sm" style={{ flex: 1 }}>
                    {editor.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />} {editor.isMuted ? 'Muted' : 'On'}
                  </button>
                  <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { fadeIn: !editor.fadeIn } })} className={`rs-btn-sm ${editor.fadeIn ? 'active' : ''}`} style={{ flex: 1 }}>Fade: {editor.fadeIn ? 'On' : 'Off'}</button>
                </div>
              </div>
            </div>
          )}

          {ui.activePanel === 'export' && (
            <div>
              <h3 className="rs-panel-title"><Download size={14} color="var(--rs-accent)" /> Export Presets</h3>
              <div className="rs-export-presets">
                {EXPORT_PRESETS.map(p => (
                  <button key={p.id} onClick={() => { handleExportVideo(p); dispatch({ type: 'SET_UI', payload: { activePanel: null } }); }} className="rs-export-preset-btn"
                    disabled={(editor.mode === 'video' && !media.sourceLoaded) || (editor.mode === 'slideshow' && slideshow.images.length === 0)}>
                    <div className="rs-export-preset-name">{p.name}</div>
                    <div className="rs-export-preset-desc">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {ui.showShortcuts && (
        <div className="rs-modal-overlay" onClick={() => dispatch({ type: 'SET_UI', payload: { showShortcuts: false } })}>
          <div className="rs-modal" onClick={e => e.stopPropagation()}>
            <h3 className="rs-panel-title"><Keyboard size={14} color="var(--rs-accent)" /> Shortcuts</h3>
            <div className="rs-shortcuts-list">
              {[['Space', 'Play / Pause'], ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z', 'Redo'], ['M', 'Mute'], ['G', 'Toggle Guides'], ['E', 'Edit Mode'], ['F', 'Fullscreen'], ['?', 'This Panel'], ['Esc', 'Close Panel']].map(([key, desc]) => (
                <div key={key} className="rs-shortcut-row"><kbd>{key}</kbd><span>{desc}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div className="rs-modal-overlay">
          <div className="rs-modal rs-onboarding">
            <div className="rs-onboarding-icon">🎬</div>
            <h2>Welcome to Reactor Pro!</h2>
            <p>Create viral short-form content in seconds. Import a video, pick a template, add effects, and export in 1080p.</p>
            <div className="rs-onboarding-tips">
              <div className="rs-onboarding-tip"><LayoutGrid size={16} /> 30+ pro templates</div>
              <div className="rs-onboarding-tip"><Wand2 size={16} /> Cinematic effects</div>
              <div className="rs-onboarding-tip"><Download size={16} /> 1080p export</div>
              <div className="rs-onboarding-tip"><Trophy size={16} /> Earn XP & achievements</div>
            </div>
            <button onClick={() => { setShowOnboarding(false); localStorage.setItem('reactor-onboarded', 'true'); haptic('success'); }} className="rs-btn-sm rs-btn-accent" style={{ width: '100%', padding: '12px', fontSize: '14px', marginTop: '16px' }}>
              Let's Create! 🚀
            </button>
          </div>
        </div>
      )}

      <video ref={sourceVideoRef} className="rs-hidden-video" playsInline preload="auto" />
      <video ref={brollVideoRef} className="rs-hidden-video" playsInline muted preload="auto" />
      <video ref={webcamVideoRef} className="rs-hidden-video" playsInline muted preload="auto" />
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}

export default function ReactorStudio() {
  return (
    <ToastProvider>
      <ReactorStudioInner />
    </ToastProvider>
  );
}