import React, { useReducer, useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Download, Upload, Camera, Music, User, Volume2, VolumeX,
  Sliders, Move, Palette, Search, Star, LayoutGrid, Layers, Type, Grid3x3, X, Film, Shield, Play, Pause, Loader, Trash2, BadgeCheck, Sparkles, Eraser, Scissors, Cpu, Image as ImageIcon, Crop, Wand2, Images, Gauge, Undo2, Redo2, Zap, Trophy, Flame, ChevronDown, ChevronUp, Maximize2, Minimize2, Cloud, Eye, EyeOff, Smile, Keyboard, Rewind, FastForward, Check, AlertTriangle, Info, ChevronRight, ChevronLeft, ArrowLeftRight, Calendar, TrendingUp, Mic, Video, Target, Award, Bell, Home, Activity, BarChart3, Clock, MessageSquare, Share2, Bookmark, Heart, ThumbsUp, ThumbsDown, MoreVertical, Settings, Edit3, Copy, Link, Globe, Radio, Wifi, Battery, Signal, Smartphone, Monitor, Tv, Cast, Headphones, Radio as RadioIcon
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// MOCK DATA & CONSTANTS
// ═══════════════════════════════════════════════════════════

const MOCK_MATCHES = [
  { id: 'm1', home: 'Man United', away: 'PSG', homeLogo: 'https://via.placeholder.com/50/ff0000/ffffff?text=MUN', awayLogo: 'https://via.placeholder.com/50/0000ff/ffffff?text=PSG', league: 'Champions League', time: '20:00', date: 'Today', stadium: 'Old Trafford', homeScore: 2, awayScore: 1, status: 'FT', minute: 90 },
  { id: 'm2', home: 'Real Madrid', away: 'Barcelona', homeLogo: 'https://via.placeholder.com/50/ffffff/000000?text=RMA', awayLogo: 'https://via.placeholder.com/50/a50044/ffffff?text=BAR', league: 'La Liga', time: '21:00', date: 'Today', stadium: 'Santiago Bernabéu', homeScore: 3, awayScore: 2, status: 'LIVE', minute: 67 },
  { id: 'm3', home: 'Liverpool', away: 'Man City', homeLogo: 'https://via.placeholder.com/50/c8102e/ffffff?text=LIV', awayLogo: 'https://via.placeholder.com/50/6cabdf/ffffff?text=MCI', league: 'Premier League', time: '17:30', date: 'Tomorrow', stadium: 'Anfield', homeScore: 0, awayScore: 0, status: 'UPCOMING', minute: 0 },
  { id: 'm4', home: 'Arsenal', away: 'Chelsea', homeLogo: 'https://via.placeholder.com/50/ef0107/ffffff?text=ARS', awayLogo: 'https://via.placeholder.com/50/034694/ffffff?text=CHE', league: 'Premier League', time: '15:00', date: 'Tomorrow', stadium: 'Emirates Stadium', homeScore: 0, awayScore: 0, status: 'UPCOMING', minute: 0 },
];

const FOOTBALL_PLAYERS = [
  { name: 'Mbappé', team: 'Real Madrid', position: 'Forward', rating: 9.2 },
  { name: 'Fernandes', team: 'Man United', position: 'Midfielder', rating: 8.1 },
  { name: 'Osimhen', team: 'Napoli', position: 'Forward', rating: 8.8 },
  { name: 'Saka', team: 'Arsenal', position: 'Winger', rating: 8.5 },
  { name: 'Rashford', team: 'Man United', position: 'Forward', rating: 7.9 },
  { name: 'Haaland', team: 'Man City', position: 'Forward', rating: 9.0 },
];

const VIRAL_HOOKS = [
  "Nobody saw this coming...",
  "Stop scrolling...",
  "This changes everything...",
  "Here's why...",
  "I completely disagree...",
  "Everyone missed this...",
  "Don't bet yet...",
  "Watch this first...",
  "You won't believe...",
  "This is insane...",
];

const REACTION_BUTTONS = [
  { id: 'cooked', emoji: '🔥', label: 'Cooked', color: '#ef4444' },
  { id: 'finished', emoji: '😂', label: 'Finished', color: '#f59e0b' },
  { id: 'dead', emoji: '💀', label: 'Dead', color: '#6b7280' },
  { id: 'crazy', emoji: '😱', label: 'Crazy', color: '#8b5cf6' },
  { id: 'unreal', emoji: '🤯', label: 'Unreal', color: '#ec4899' },
  { id: 'robbed', emoji: '😤', label: 'Robbed', color: '#dc2626' },
  { id: 'respect', emoji: '👏', label: 'Respect', color: '#10b981' },
  { id: 'breaking', emoji: '🚨', label: 'Breaking', color: '#ef4444' },
  { id: 'fast', emoji: '⚡', label: 'Fast', color: '#f59e0b' },
  { id: 'watch', emoji: '👀', label: 'Watch', color: '#3b82f6' },
  { id: 'fail', emoji: '❌', label: 'Fail', color: '#dc2626' },
  { id: 'correct', emoji: '✔️', label: 'Correct', color: '#10b981' },
];

const FOOTBALL_STICKERS = [
  { id: 'goal', emoji: '⚽', name: 'Goal', category: 'Goals' },
  { id: 'var', emoji: '📺', name: 'VAR', category: 'VAR' },
  { id: 'penalty', emoji: '🥅', name: 'Penalty', category: 'Penalty' },
  { id: 'red', emoji: '🟥', name: 'Red Card', category: 'Cards' },
  { id: 'yellow', emoji: '🟨', name: 'Yellow Card', category: 'Cards' },
  { id: 'corner', emoji: '🚩', name: 'Corner', category: 'Events' },
  { id: 'freekick', emoji: '⚽', name: 'Free Kick', category: 'Events' },
  { id: 'offside', emoji: '🏁', name: 'Offside', category: 'Events' },
  { id: 'sub', emoji: '🔄', name: 'Substitution', category: 'Events' },
  { id: 'extra', emoji: '⏱️', name: 'Extra Time', category: 'Events' },
  { id: 'winner', emoji: '🏆', name: 'Winner', category: 'Champion' },
  { id: 'champion', emoji: '👑', name: 'Champion', category: 'Champion' },
  { id: 'bottled', emoji: '🍾', name: 'Bottled', category: 'Reactions' },
  { id: 'comeback', emoji: '🔙', name: 'Comeback', category: 'Reactions' },
  { id: 'owngoal', emoji: '😱', name: 'Own Goal', category: 'Goals' },
  { id: 'goat', emoji: '🐐', name: 'GOAT', category: 'Players' },
  { id: 'fraud', emoji: '🤡', name: 'Fraud', category: 'Reactions' },
  { id: 'cooked_st', emoji: '🔥', name: 'Cooked', category: 'Reactions' },
  { id: 'clutch', emoji: '🎯', name: 'Clutch', category: 'Reactions' },
  { id: 'lucky', emoji: '🍀', name: 'Lucky', category: 'Reactions' },
];

const MEME_PACK = [
  { id: 'm1', emoji: '😂', label: 'Laughing' },
  { id: 'm2', emoji: '😭', label: 'Crying' },
  { id: 'm3', emoji: '😳', label: 'Shocked' },
  { id: 'm4', emoji: '🤯', label: 'Mind Blown' },
  { id: 'm5', emoji: '🔥', label: 'Fire' },
  { id: 'm6', emoji: '💀', label: 'Dead' },
  { id: 'm7', emoji: '👀', label: 'Watching' },
  { id: 'm8', emoji: '👏', label: 'Clapping' },
  { id: 'm9', emoji: '🤣', label: 'ROFL' },
  { id: 'm10', emoji: '🙌', label: 'Praise' },
  { id: 'm11', emoji: '😤', label: 'Angry' },
  { id: 'm12', emoji: '😡', label: 'Furious' },
];

const SOUND_LIBRARY = [
  { id: 'crowd', name: 'Crowd Roar', icon: '📣', duration: 3 },
  { id: 'goal', name: 'Goal Celebration', icon: '⚽', duration: 2 },
  { id: 'whistle', name: 'Referee Whistle', icon: '🎺', duration: 1 },
  { id: 'drums', name: 'Stadium Drums', icon: '🥁', duration: 4 },
  { id: 'boom', name: 'Boom Effect', icon: '💥', duration: 1 },
  { id: 'suspense', name: 'Suspense', icon: '🎵', duration: 3 },
  { id: 'victory', name: 'Victory Fanfare', icon: '🎺', duration: 4 },
  { id: 'sad', name: 'Sad Trombone', icon: '🎵', duration: 2 },
  { id: 'laugh', name: 'Laugh Track', icon: '😂', duration: 2 },
  { id: 'airhorn', name: 'Air Horn', icon: '📯', duration: 1 },
  { id: 'stadium', name: 'Stadium Atmosphere', icon: '🏟️', duration: 5 },
  { id: 'applause', name: 'Applause', icon: '👏', duration: 3 },
];

const FOOTBALL_ANIMATIONS = [
  { id: 'goal_explosion', name: 'Goal Explosion', icon: '💥' },
  { id: 'ball_spin', name: 'Ball Spin', icon: '⚽' },
  { id: 'fire', name: 'Fire Effect', icon: '🔥' },
  { id: 'electric', name: 'Electric', icon: '⚡' },
  { id: 'smoke', name: 'Smoke', icon: '💨' },
  { id: 'confetti', name: 'Confetti', icon: '🎊' },
  { id: 'laser', name: 'Laser', icon: '✨' },
  { id: 'flash', name: 'Flash', icon: '⚡' },
  { id: 'glitch', name: 'Glitch', icon: '📺' },
  { id: 'score_pop', name: 'Score Pop', icon: '🔢' },
  { id: 'whistle_anim', name: 'Whistle', icon: '🎺' },
  { id: 'explosion', name: 'Explosion', icon: '💥' },
  { id: 'golden_ball', name: 'Golden Ball', icon: '🏆' },
  { id: 'neon', name: 'Neon', icon: '✨' },
  { id: 'transition_3d', name: '3D Transition', icon: '🎬' },
];

const LOWER_THIRDS = [
  { id: 'breaking', name: 'Breaking News', color: '#dc2626', textColor: '#fff' },
  { id: 'prediction', name: 'Prediction', color: '#3b82f6', textColor: '#fff' },
  { id: 'reaction', name: 'Reaction', color: '#10b981', textColor: '#fff' },
  { id: 'live', name: 'LIVE', color: '#ef4444', textColor: '#fff' },
  { id: 'ft', name: 'Full Time', color: '#6b7280', textColor: '#fff' },
  { id: 'ht', name: 'Half Time', color: '#f59e0b', textColor: '#fff' },
  { id: 'opinion', name: 'Opinion', color: '#8b5cf6', textColor: '#fff' },
  { id: 'transfer', name: 'Transfer', color: '#ec4899', textColor: '#fff' },
  { id: 'confirmed', name: 'Confirmed', color: '#10b981', textColor: '#fff' },
  { id: 'rumour', name: 'Rumour', color: '#f59e0b', textColor: '#fff' },
];

const CAMERA_LAYOUTS = [
  { id: 'face', name: 'Face Only', icon: '👤' },
  { id: 'split', name: 'Split Screen', icon: '📐' },
  { id: 'face_bottom', name: 'Face Bottom', icon: '⬇️' },
  { id: 'face_right', name: 'Face Right', icon: '➡️' },
  { id: 'full_face', name: 'Full Face', icon: '🎭' },
  { id: 'pip', name: 'Picture in Picture', icon: '📺' },
  { id: 'greenscreen', name: 'Green Screen', icon: '🟩' },
  { id: 'circular', name: 'Circular Cam', icon: '⭕' },
  { id: 'rectangle', name: 'Rectangle', icon: '▬' },
  { id: 'commentary', name: 'Commentary Style', icon: '🎙️' },
];

const FOOTBALL_TEMPLATES = [
  {
    id: 'instant_reaction',
    title: 'Instant Match Reaction',
    category: 'Football',
    tags: ['reaction', 'match', 'quick'],
    duration: 20,
    structure: ['Intro', 'Result', 'Your Camera', 'Explosion', 'Crowd', 'Goal Animation', 'Club Logos', 'Score', 'Final Thoughts', 'CTA'],
    preview: { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', layout: 'reaction' }
  },
  {
    id: 'prediction_lock',
    title: 'Prediction Lock',
    category: 'Football',
    tags: ['prediction', 'betting', 'analysis'],
    duration: 45,
    structure: ['Hook', 'Your Face', 'Form', 'Head to Head', 'Injuries', 'Prediction', 'Confidence Meter', 'App Screen', 'CTA'],
    preview: { bg: 'linear-gradient(135deg, #3b82f6, #1e40af)', layout: 'prediction' }
  },
  {
    id: 'breaking_news',
    title: 'Breaking News',
    category: 'Football',
    tags: ['news', 'transfer', 'update'],
    duration: 30,
    structure: ['BREAKING', 'Transfer', 'Player', 'Club', 'Details', 'Source', 'Outro'],
    preview: { bg: 'linear-gradient(135deg, #ef4444, #991b1b)', layout: 'news' }
  },
  {
    id: 'hidden_stats',
    title: 'Hidden Stats',
    category: 'Football',
    tags: ['stats', 'analysis', 'deep-dive'],
    duration: 40,
    structure: ['Did You Know?', 'Stat', 'Graph', 'Club Logo', 'Explanation', 'Prediction'],
    preview: { bg: 'linear-gradient(135deg, #10b981, #047857)', layout: 'stats' }
  },
  {
    id: 'correct_score',
    title: 'Correct Score',
    category: 'Football',
    tags: ['prediction', 'betting', 'score'],
    duration: 25,
    structure: ['Big Score', 'Home', 'Away', 'Prediction', 'Reason', 'App'],
    preview: { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', layout: 'score' }
  },
  {
    id: 'match_review',
    title: 'Match Review',
    category: 'Football',
    tags: ['review', 'highlights', 'analysis'],
    duration: 60,
    structure: ['Highlights', 'Stats', 'Your Opinion', 'Player Ratings', 'Result', 'CTA'],
    preview: { bg: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', layout: 'review' }
  },
];

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
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
  { id: 'match_reactor', name: 'Match Reactor', desc: 'Create 3 match reactions', icon: '⚽', xp: 80 },
  { id: 'prediction_guru', name: 'Prediction Guru', desc: 'Create 5 predictions', icon: '🎯', xp: 90 },
  { id: 'live_companion', name: 'Live Companion', desc: 'Use live companion mode', icon: '📺', xp: 70 },
  { id: 'solo_cam', name: 'Solo Cam Star', desc: 'Record 3 solo camera videos', icon: '🎥', xp: 60 },
];

const getGameState = () => {
  try {
    return JSON.parse(localStorage.getItem('reactor-game-state')) || { xp: 0, level: 1, achievements: [], streak: 0, lastActive: null, totalExports: 0, templatesUsed: [], effectsUsed: [], undoCount: 0, matchReactions: 0, predictions: 0, liveCompanionUses: 0, soloCamRecords: 0 };
  } catch { return { xp: 0, level: 1, achievements: [], streak: 0, lastActive: null, totalExports: 0, templatesUsed: [], effectsUsed: [], undoCount: 0, matchReactions: 0, predictions: 0, liveCompanionUses: 0, soloCamRecords: 0 }; }
};
const saveGameState = (state) => localStorage.setItem('reactor-game-state', JSON.stringify(state));
const getLevel = (xp) => Math.floor(xp / 200) + 1;
const getLevelProgress = (xp) => (xp % 200) / 200;

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
];

const VIDEO_EFFECTS = [
  { id: 'none', name: 'None' }, { id: 'zoom_in', name: 'Zoom In' },
  { id: 'shake', name: 'Shake' }, { id: 'pulse', name: 'Pulse' },
  { id: 'ken_burns', name: 'Ken Burns' }, { id: 'glitch', name: 'Glitch' },
  { id: 'rgb_split', name: 'RGB Split' }, { id: 'flash', name: 'Flash' },
  { id: 'vhs', name: 'VHS' }, { id: 'bounce', name: 'Bounce' },
];

const EXPORT_PRESETS = [
  { id: 'tiktok', name: 'TikTok', desc: '1080×1920 • 30fps • H.264', fps: 30, format: 'mp4', bitrate: 10000000 },
  { id: 'reels', name: 'Reels', desc: '1080×1920 • 30fps • High', fps: 30, format: 'mp4', bitrate: 12000000 },
  { id: 'shorts', name: 'YT Shorts', desc: '1080×1920 • 60fps • Max', fps: 60, format: 'mp4', bitrate: 15000000 },
  { id: 'webm_fast', name: 'WebM Fast', desc: '1080×1920 • 30fps • VP9', fps: 30, format: 'webm', bitrate: 8000000 },
  { id: 'quality', name: 'Max Quality', desc: '1080×1920 • 60fps • VP9', fps: 60, format: 'webm', bitrate: 20000000 },
];

// ═══════════════════════════════════════════════════════════
// STATE & REDUCER
// ═══════════════════════════════════════════════════════════
const initialState = {
  view: 'creator_home', // 'creator_home' | 'editor' | 'match_workspace' | 'camera_recorder' | 'live_companion' | 'content_calendar'
  currentMatch: null,
  media: { sourceLoaded: false, brollLoaded: false, cameraOn: false, profileSrc: null, logoSrc: null, audioName: '' },
  editor: {
    templateId: 'instant_reaction', displayName: 'Creator', username: 'football_creator', povCaption: 'Match reaction time! ⚽🔥',
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
    bgColor: null, canvasRatio: '9:16', selectedStickerId: null,
    lowerThird: null, soundEffect: null, footballAnimation: null,
    reactionButtons: [], aiScript: '', autoCaptions: [], cameraLayout: 'pip',
    personalBrand: {
      logo: null, introAnimation: null, outro: null, nameTag: null,
      favoriteLayout: 'pip', cta: 'Follow for more football content!',
      signatureSound: null, watermark: null, preferredFont: 'TikTok'
    }
  },
  slideshow: { images: [], duration: 0 },
  timeline: { clips: [{ id: 'clip1', start: 0, end: 0 }], activeClipId: 'clip1', duration: 0, currentTime: 0, isPlaying: false },
  ui: {
    activePanel: null, showGuides: false, isExporting: false, exportFormat: null, exportFps: null, exportProgress: 0,
    recordedUrl: null, recordedExt: 'webm', isLoadingProject: false,
    favorites: JSON.parse(localStorage.getItem("reactor-favorites")) || [], recents: JSON.parse(localStorage.getItem("reactor-recents")) || [],
    searchQuery: "", activeCategory: "All", layers: { video: true, pip: true, profile: true, caption: true, gradients: true, scorebug: true, stickers: true, lowerThirds: true },
    showShortcuts: false, autoSaveStatus: 'saved', fullscreen: false,
    showMatchData: true, showAIAssistant: true, liveMode: false
  },
  history: { past: [], future: [] },
  recording: { isActive: false, duration: 0, mode: 'solo' },
  aiAssistant: { suggestions: [], lastSuggestion: null, isEnabled: true }
};

function studioReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE': return { ...state, ...action.payload };
    case 'SET_VIEW': return { ...state, view: action.payload };
    case 'SET_CURRENT_MATCH': return { ...state, currentMatch: action.payload };
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
    case 'SET_RECORDING': return { ...state, recording: { ...state.recording, ...action.payload } };
    case 'SET_AI_ASSISTANT': return { ...state, aiAssistant: { ...state.aiAssistant, ...action.payload } };
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
  const addToast = useToast();
  const [state, dispatch] = useReducer(studioReducer, initialState);
  const [gameState, setGameState] = useState(getGameState);
  const [showOnboarding, setShowOnboarding] = useState(!localStorage.getItem('reactor-onboarded'));
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  
  // Refs
  const toolbarRef = useRef(null);
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
  const currentTimeRef = useRef(0);
  const renderOverlayRef = useRef(() => {});
  const mediaRecorderRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const recordingIntervalRef = useRef(null);

  const { view, currentMatch, media, editor, slideshow, timeline, ui, history, recording, aiAssistant } = state;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(console.error);
    else document.exitFullscreen?.().catch(console.error);
  }, []);

  const togglePreview = useCallback(() => {
    if (editor.mode === 'video' && media.sourceLoaded) {
      const vid = sourceVideoRef.current;
      if (!vid) return;
      if (timeline.isPlaying) { vid.pause(); dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: false } }); }
      else { vid.play(); dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: true } }); }
    } else {
      dispatch({ type: 'SET_TIMELINE', payload: { isPlaying: !timeline.isPlaying } });
    }
    haptic('light');
  }, [editor.mode, media.sourceLoaded, timeline.isPlaying, dispatch]);

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
      } else if (type === 'image') {
        await idbSet('profile_image', file);
        const src = URL.createObjectURL(file); profileImgRef.current.src = src;
        dispatch({ type: 'SET_MEDIA', payload: { profileSrc: src } });
        addToast('Avatar updated!', 'success');
      }
    }
    e.target.value = null;
  };

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1080, height: 1920, facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      webcamVideoRef.current.srcObject = stream; webcamVideoRef.current.play();
      dispatch({ type: 'SET_MEDIA', payload: { cameraOn: true } });
      unlockAchievement('pip_pro');
      addToast('Camera activated!', 'success');
    } catch { addToast("Camera access denied.", 'error'); }
  }, [addToast, unlockAchievement, dispatch]);

  const startRecording = useCallback(async (mode = 'solo') => {
    if (!canvasRef.current) return;
    
    const stream = canvasRef.current.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10000000 });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const finalBlob = await fixWebmDuration(blob, recording.duration * 1000);
      dispatch({ type: 'SET_UI', payload: { recordedUrl: URL.createObjectURL(finalBlob), recordedExt: 'webm' } });
      dispatch({ type: 'SET_RECORDING', payload: { isActive: false } });
      clearInterval(recordingIntervalRef.current);
      
      setGameState(prev => {
        const newState = { ...prev, soloCamRecords: prev.soloCamRecords + 1 };
        saveGameState(newState);
        if (newState.soloCamRecords >= 3) unlockAchievement('solo_cam');
        return newState;
      });
      addToast('Recording complete!', 'success');
      haptic('success');
    };
    
    recorder.start(100);
    dispatch({ type: 'SET_RECORDING', payload: { isActive: true, duration: 0, mode } });
    
    recordingIntervalRef.current = setInterval(() => {
      dispatch({ type: 'SET_RECORDING', payload: { duration: recording.duration + 1 } });
    }, 1000);
  }, [recording.duration, unlockAchievement, addToast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  }, []);

  const generateAIScript = useCallback((match) => {
    if (!match) return;
    const script = `
HOOK: "Stop scrolling! You won't believe what just happened in ${match.home} vs ${match.away}..."

BODY:
- ${match.home} took the lead with a stunning goal!
- ${match.away} fought back hard
- The final result was ${match.homeScore}-${match.awayScore}

KEY FACTS:
- This was a crucial ${match.league} match
- Played at ${match.stadium}
- Final score: ${match.homeScore}-${match.awayScore}

PREDICTION:
Based on this performance, ${match.homeScore > match.awayScore ? match.home : match.away} looks strong for the next fixture!

CTA: "Follow for more instant match reactions! Drop your thoughts in the comments below! ⚽🔥"
    `.trim();
    
    dispatch({ type: 'SET_EDITOR', payload: { aiScript: script } });
    addToast('AI script generated!', 'success');
  }, [addToast, dispatch]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const W = 1080, H = 1920;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    const bgColor = editor.bgColor || '#000';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // Draw match score bug
    if (currentMatch && ui.showMatchData && ui.layers.scorebug) {
      const bY = H - 150, bH = 80, bW = 400, bX = (W - bW) / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(bX, bY, bW, bH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${currentMatch.home} ${currentMatch.homeScore} - ${currentMatch.awayScore} ${currentMatch.away}`, W / 2, bY + 50);
    }

    // Draw lower third
    if (editor.lowerThird && ui.layers.lowerThirds) {
      const lt = LOWER_THIRDS.find(l => l.id === editor.lowerThird);
      if (lt) {
        ctx.fillStyle = lt.color;
        ctx.fillRect(0, H - 300, W, 100);
        ctx.fillStyle = lt.textColor;
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lt.name.toUpperCase(), W / 2, H - 230);
      }
    }

    // Draw reaction buttons
    if (editor.reactionButtons && editor.reactionButtons.length > 0) {
      editor.reactionButtons.forEach((btn, idx) => {
        const rb = REACTION_BUTTONS.find(r => r.id === btn);
        if (rb) {
          const x = 100 + (idx * 150), y = H - 400;
          ctx.fillStyle = rb.color;
          ctx.beginPath();
          ctx.arc(x, y, 50, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '60px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rb.emoji, x, y);
        }
      });
    }

    // Draw camera feed if active
    if (media.cameraOn && webcamVideoRef.current) {
      const vw = webcamVideoRef.current.videoWidth;
      const vh = webcamVideoRef.current.videoHeight;
      if (vw && vh) {
        ctx.save();
        if (editor.cameraLayout === 'circular') {
          ctx.beginPath();
          ctx.arc(W / 2, H / 2, 400, 0, Math.PI * 2);
          ctx.clip();
        } else if (editor.cameraLayout === 'face_bottom') {
          ctx.translate(0, H - 800);
        }
        ctx.drawImage(webcamVideoRef.current, 0, 0, W, 800);
        ctx.restore();
      }
    }
  }, [currentMatch, editor, media.cameraOn, ui.showMatchData, ui.layers]);

  useEffect(() => {
    let aF;
    const loop = () => {
      drawFrame();
      aF = requestAnimationFrame(loop);
    };
    aF = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(aF);
  }, [drawFrame]);

  // ═══════════════════════════════════════════════════════════
  // CREATOR HOME VIEW
  // ═══════════════════════════════════════════════════════════
  const renderCreatorHome = () => (
    <div className="rs-creator-home">
      <div className="rs-home-header">
        <div className="rs-home-greeting">
          <h1>Welcome back, Creator! 👋</h1>
          <p>What would you like to create today?</p>
        </div>
        <div className="rs-home-actions">
          <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'content_calendar' })} className="rs-home-action-btn">
            <Calendar size={24} />
            <span>Content Calendar</span>
          </button>
          <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'camera_recorder' })} className="rs-home-action-btn primary">
            <Video size={24} />
            <span>Record Reaction</span>
          </button>
        </div>
      </div>

      <div className="rs-home-section">
        <h2 className="rs-section-title">⚽ Today's Matches</h2>
        <div className="rs-matches-grid">
          {MOCK_MATCHES.map(match => (
            <div key={match.id} className="rs-match-card" onClick={() => {
              dispatch({ type: 'SET_CURRENT_MATCH', payload: match });
              dispatch({ type: 'SET_VIEW', payload: 'match_workspace' });
            }}>
              <div className="rs-match-header">
                <span className="rs-match-league">{match.league}</span>
                <span className={`rs-match-status ${match.status.toLowerCase()}`}>{match.status}</span>
              </div>
              <div className="rs-match-teams">
                <div className="rs-match-team">
                  <img src={match.homeLogo} alt={match.home} className="rs-team-logo" />
                  <span>{match.home}</span>
                </div>
                <div className="rs-match-score">
                  {match.status === 'LIVE' || match.status === 'FT' ? (
                    <span className="rs-score">{match.homeScore} - {match.awayScore}</span>
                  ) : (
                    <span className="rs-vs">VS</span>
                  )}
                </div>
                <div className="rs-match-team">
                  <img src={match.awayLogo} alt={match.away} className="rs-team-logo" />
                  <span>{match.away}</span>
                </div>
              </div>
              <div className="rs-match-footer">
                <span className="rs-match-time">{match.date} • {match.time}</span>
                {match.status === 'LIVE' && <span className="rs-match-minute">{match.minute}'</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rs-home-section">
        <h2 className="rs-section-title">🔥 Trending Templates</h2>
        <div className="rs-templates-grid">
          {FOOTBALL_TEMPLATES.map(template => (
            <div key={template.id} className="rs-template-card" onClick={() => {
              dispatch({ type: 'SET_EDITOR', payload: { templateId: template.id } });
              dispatch({ type: 'SET_VIEW', payload: 'editor' });
            }}>
              <div className="rs-template-preview" style={{ background: template.preview.bg }}>
                <div className="rs-template-overlay">
                  <h3>{template.title}</h3>
                  <p>{template.duration}s</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rs-home-section">
        <h2 className="rs-section-title">⚡ Quick Actions</h2>
        <div className="rs-quick-actions">
          <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'live_companion' })} className="rs-quick-action">
            <Radio size={32} />
            <span>Live Companion</span>
          </button>
          <button onClick={() => {
            dispatch({ type: 'SET_VIEW', payload: 'editor' });
            dispatch({ type: 'SET_EDITOR', payload: { templateId: 'prediction_lock' } });
          }} className="rs-quick-action">
            <Target size={32} />
            <span>Prediction Template</span>
          </button>
          <button onClick={() => {
            dispatch({ type: 'SET_VIEW', payload: 'editor' });
            dispatch({ type: 'SET_EDITOR', payload: { templateId: 'breaking_news' } });
          }} className="rs-quick-action">
            <Bell size={32} />
            <span>News Template</span>
          </button>
          <button onClick={() => {
            dispatch({ type: 'SET_VIEW', payload: 'editor' });
            dispatch({ type: 'SET_EDITOR', payload: { templateId: 'match_review' } });
          }} className="rs-quick-action">
            <BarChart3 size={32} />
            <span>Match Review</span>
          </button>
        </div>
      </div>

      <div className="rs-home-stats">
        <div className="rs-stat-card">
          <div className="rs-stat-icon"><Trophy size={24} /></div>
          <div className="rs-stat-info">
            <span className="rs-stat-value">Level {gameState.level}</span>
            <span className="rs-stat-label">{gameState.xp} XP</span>
          </div>
        </div>
        <div className="rs-stat-card">
          <div className="rs-stat-icon"><Flame size={24} /></div>
          <div className="rs-stat-info">
            <span className="rs-stat-value">{gameState.streak} day streak</span>
            <span className="rs-stat-label">Keep it up!</span>
          </div>
        </div>
        <div className="rs-stat-card">
          <div className="rs-stat-icon"><Download size={24} /></div>
          <div className="rs-stat-info">
            <span className="rs-stat-value">{gameState.totalExports} exports</span>
            <span className="rs-stat-label">Total videos</span>
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // MATCH WORKSPACE VIEW
  // ═══════════════════════════════════════════════════════════
  const renderMatchWorkspace = () => {
    if (!currentMatch) return null;
    
    return (
      <div className="rs-match-workspace">
        <div className="rs-workspace-header">
          <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'creator_home' })} className="rs-back-btn">
            <ArrowLeft size={20} />
            <span>Back to Home</span>
          </button>
          <h1>{currentMatch.home} vs {currentMatch.away}</h1>
          <span className={`rs-match-status-badge ${currentMatch.status.toLowerCase()}`}>{currentMatch.status}</span>
        </div>

        <div className="rs-workspace-grid">
          <div className="rs-workspace-section">
            <h2>Match Info</h2>
            <div className="rs-info-card">
              <div className="rs-info-row">
                <span className="rs-info-label">Competition:</span>
                <span className="rs-info-value">{currentMatch.league}</span>
              </div>
              <div className="rs-info-row">
                <span className="rs-info-label">Stadium:</span>
                <span className="rs-info-value">{currentMatch.stadium}</span>
              </div>
              <div className="rs-info-row">
                <span className="rs-info-label">Kickoff:</span>
                <span className="rs-info-value">{currentMatch.date} at {currentMatch.time}</span>
              </div>
              {currentMatch.status !== 'UPCOMING' && (
                <div className="rs-info-row">
                  <span className="rs-info-label">Current Score:</span>
                  <span className="rs-info-value rs-score-highlight">{currentMatch.homeScore} - {currentMatch.awayScore}</span>
                </div>
              )}
              {currentMatch.status === 'LIVE' && (
                <div className="rs-info-row">
                  <span className="rs-info-label">Minute:</span>
                  <span className="rs-info-value rs-live-minute">{currentMatch.minute}'</span>
                </div>
              )}
            </div>
          </div>

          <div className="rs-workspace-section">
            <h2>Quick Actions</h2>
            <div className="rs-actions-grid">
              <button onClick={() => {
                generateAIScript(currentMatch);
                dispatch({ type: 'SET_VIEW', payload: 'editor' });
              }} className="rs-action-card">
                <Sparkles size={32} />
                <span>Generate AI Script</span>
              </button>
              <button onClick={() => {
                dispatch({ type: 'SET_EDITOR', payload: { 
                  homeLogoUrl: currentMatch.homeLogo,
                  awayLogoUrl: currentMatch.awayLogo,
                  homeScore: currentMatch.homeScore,
                  awayScore: currentMatch.awayScore,
                  templateId: 'instant_reaction'
                }});
                dispatch({ type: 'SET_VIEW', payload: 'editor' });
              }} className="rs-action-card">
                <Zap size={32} />
                <span>Instant Reaction</span>
              </button>
              <button onClick={() => {
                dispatch({ type: 'SET_EDITOR', payload: { 
                  homeLogoUrl: currentMatch.homeLogo,
                  awayLogoUrl: currentMatch.awayLogo,
                  templateId: 'prediction_lock'
                }});
                dispatch({ type: 'SET_VIEW', payload: 'editor' });
              }} className="rs-action-card">
                <Target size={32} />
                <span>Make Prediction</span>
              </button>
              <button onClick={() => {
                dispatch({ type: 'SET_VIEW', payload: 'camera_recorder' });
              }} className="rs-action-card">
                <Camera size={32} />
                <span>Record Reaction</span>
              </button>
            </div>
          </div>

          <div className="rs-workspace-section">
            <h2>Team Data</h2>
            <div className="rs-teams-display">
              <div className="rs-team-card">
                <img src={currentMatch.homeLogo} alt={currentMatch.home} className="rs-team-logo-large" />
                <h3>{currentMatch.home}</h3>
                <div className="rs-team-stats">
                  <div className="rs-team-stat">Form: W-W-D-W-L</div>
                  <div className="rs-team-stat">Position: 3rd</div>
                  <div className="rs-team-stat">Goals: 45</div>
                </div>
              </div>
              <div className="rs-team-card">
                <img src={currentMatch.awayLogo} alt={currentMatch.away} className="rs-team-logo-large" />
                <h3>{currentMatch.away}</h3>
                <div className="rs-team-stats">
                  <div className="rs-team-stat">Form: W-L-W-D-W</div>
                  <div className="rs-team-stat">Position: 5th</div>
                  <div className="rs-team-stat">Goals: 38</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rs-workspace-section">
            <h2>Auto-Generated Content</h2>
            <div className="rs-auto-content">
              <div className="rs-content-card">
                <h3>📊 Head to Head</h3>
                <p>Last 5 meetings: {currentMatch.home} 2 wins, {currentMatch.away} 2 wins, 1 draw</p>
              </div>
              <div className="rs-content-card">
                <h3>🔥 Key Players</h3>
                <p>Watch out for the star players who could make the difference today!</p>
              </div>
              <div className="rs-content-card">
                <h3>📈 Recent Form</h3>
                <p>Both teams coming off strong performances in their last fixtures.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // CAMERA RECORDER VIEW
  // ═══════════════════════════════════════════════════════════
  const renderCameraRecorder = () => (
    <div className="rs-camera-recorder">
      <div className="rs-recorder-header">
        <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'creator_home' })} className="rs-back-btn">
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <h1>Camera Recorder</h1>
        <div className="rs-recorder-indicators">
          {recording.isActive && (
            <div className="rs-recording-indicator">
              <div className="rs-recording-dot"></div>
              <span>REC {Math.floor(recording.duration / 60)}:{(recording.duration % 60).toString().padStart(2, '0')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="rs-recorder-main">
        <div className="rs-camera-preview">
          <canvas ref={canvasRef} className="rs-recorder-canvas" />
          {!media.cameraOn && (
            <div className="rs-camera-placeholder">
              <Camera size={64} />
              <p>Camera not active</p>
            </div>
          )}
        </div>

        <div className="rs-recorder-controls">
          <div className="rs-camera-settings">
            <h3>Camera Layout</h3>
            <div className="rs-layout-grid">
              {CAMERA_LAYOUTS.map(layout => (
                <button
                  key={layout.id}
                  onClick={() => dispatch({ type: 'SET_EDITOR', payload: { cameraLayout: layout.id } })}
                  className={`rs-layout-btn ${editor.cameraLayout === layout.id ? 'active' : ''}`}
                >
                  <span className="rs-layout-icon">{layout.icon}</span>
                  <span className="rs-layout-name">{layout.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rs-camera-features">
            <h3>Recording Features</h3>
            <div className="rs-features-grid">
              <button className="rs-feature-btn">
                <Sparkles size={24} />
                <span>Beauty Mode</span>
              </button>
              <button className="rs-feature-btn">
                <Volume2 size={24} />
                <span>Noise Removal</span>
              </button>
              <button className="rs-feature-btn">
                <Eye size={24} />
                <span>Eye Contact</span>
              </button>
              <button className="rs-feature-btn">
                <Crop size={24} />
                <span>Auto Crop</span>
              </button>
              <button className="rs-feature-btn">
                <Smile size={24} />
                <span>Smile Detection</span>
              </button>
              <button className="rs-feature-btn">
                <Target size={24} />
                <span>Head Tracking</span>
              </button>
            </div>
          </div>

          <div className="rs-recording-actions">
            {!media.cameraOn ? (
              <button onClick={startCamera} className="rs-record-btn start">
                <Camera size={32} />
                <span>Start Camera</span>
              </button>
            ) : !recording.isActive ? (
              <button onClick={() => startRecording('solo')} className="rs-record-btn">
                <div className="rs-record-icon"></div>
                <span>Start Recording</span>
              </button>
            ) : (
              <button onClick={stopRecording} className="rs-stop-btn">
                <X size={32} />
                <span>Stop Recording</span>
              </button>
            )}
          </div>

          {ui.recordedUrl && (
            <div className="rs-preview-section">
              <h3>Preview</h3>
              <video src={ui.recordedUrl} controls className="rs-preview-video" />
              <div className="rs-preview-actions">
                <a href={ui.recordedUrl} download={`reaction_${Date.now()}.webm`} className="rs-btn-primary">
                  <Download size={16} />
                  <span>Download</span>
                </a>
                <button onClick={() => dispatch({ type: 'SET_UI', payload: { recordedUrl: null } })} className="rs-btn-secondary">
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // LIVE COMPANION VIEW
  // ═══════════════════════════════════════════════════════════
  const renderLiveCompanion = () => (
    <div className="rs-live-companion">
      <div className="rs-companion-header">
        <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'creator_home' })} className="rs-back-btn">
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <h1>Live Companion Mode</h1>
        <div className="rs-live-indicator">
          <div className="rs-live-dot"></div>
          <span>LIVE</span>
        </div>
      </div>

      <div className="rs-companion-main">
        <div className="rs-live-match-display">
          {currentMatch ? (
            <div className="rs-live-match-card">
              <div className="rs-live-match-header">
                <span className="rs-live-league">{currentMatch.league}</span>
                <span className="rs-live-minute">{currentMatch.minute}'</span>
              </div>
              <div className="rs-live-teams">
                <div className="rs-live-team">
                  <img src={currentMatch.homeLogo} alt={currentMatch.home} />
                  <span>{currentMatch.home}</span>
                </div>
                <div className="rs-live-score">
                  <span className="rs-score-large">{currentMatch.homeScore} - {currentMatch.awayScore}</span>
                </div>
                <div className="rs-live-team">
                  <img src={currentMatch.awayLogo} alt={currentMatch.away} />
                  <span>{currentMatch.away}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rs-no-match">
              <p>Select a match from Creator Home to use Live Companion</p>
              <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'creator_home' })} className="rs-btn-primary">
                Go to Home
              </button>
            </div>
          )}
        </div>

        <div className="rs-live-actions">
          <h2>Quick Reactions</h2>
          <div className="rs-reaction-buttons">
            {REACTION_BUTTONS.slice(0, 8).map(btn => (
              <button key={btn.id} className="rs-reaction-btn" style={{ background: btn.color }} onClick={() => {
                dispatch({ type: 'SET_EDITOR', payload: { reactionButtons: [...editor.reactionButtons, btn.id] } });
                addToast(`${btn.emoji} ${btn.label} added!`, 'success');
                haptic('medium');
              }}>
                <span className="rs-reaction-emoji">{btn.emoji}</span>
                <span className="rs-reaction-label">{btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rs-live-templates">
          <h2>One-Tap Templates</h2>
          <div className="rs-template-buttons">
            <button onClick={() => {
              dispatch({ type: 'SET_EDITOR', payload: { templateId: 'instant_reaction' } });
              dispatch({ type: 'SET_VIEW', payload: 'editor' });
            }} className="rs-template-btn">
              <Zap size={24} />
              <span>Instant Reaction</span>
            </button>
            <button onClick={() => {
              dispatch({ type: 'SET_EDITOR', payload: { templateId: 'breaking_news' } });
              dispatch({ type: 'SET_VIEW', payload: 'editor' });
            }} className="rs-template-btn">
              <Bell size={24} />
              <span>Breaking News</span>
            </button>
            <button onClick={() => {
              dispatch({ type: 'SET_EDITOR', payload: { templateId: 'match_review' } });
              dispatch({ type: 'SET_VIEW', payload: 'editor' });
            }} className="rs-template-btn">
              <BarChart3 size={24} />
              <span>Match Review</span>
            </button>
          </div>
        </div>

        <div className="rs-live-features">
          <h2>Live Features</h2>
          <div className="rs-features-list">
            <div className="rs-feature-item">
              <Radio size={24} />
              <div>
                <h3>Auto Goal Detection</h3>
                <p>Automatically triggers reaction when a goal is scored</p>
              </div>
            </div>
            <div className="rs-feature-item">
              <MessageSquare size={24} />
              <div>
                <h3>Live Captions</h3>
                <p>Real-time caption suggestions based on match events</p>
              </div>
            </div>
            <div className="rs-feature-item">
              <Activity size={24} />
              <div>
                <h3>Live Stats Overlay</h3>
                <p>Display live match statistics on your stream</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // CONTENT CALENDAR VIEW
  // ═══════════════════════════════════════════════════════════
  const renderContentCalendar = () => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      return date;
    });

    return (
      <div className="rs-content-calendar">
        <div className="rs-calendar-header">
          <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'creator_home' })} className="rs-back-btn">
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
          <h1>Content Calendar</h1>
        </div>

        <div className="rs-calendar-main">
          <div className="rs-calendar-grid">
            {days.map((date, idx) => {
              const isToday = idx === 0;
              const dayMatches = MOCK_MATCHES.filter(m => {
                const matchDate = new Date();
                if (m.date === 'Today') return idx === 0;
                if (m.date === 'Tomorrow') return idx === 1;
                return false;
              });

              return (
                <div key={idx} className={`rs-calendar-day ${isToday ? 'today' : ''}`}>
                  <div className="rs-day-header">
                    <span className="rs-day-name">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="rs-day-number">{date.getDate()}</span>
                    {isToday && <span className="rs-today-badge">Today</span>}
                  </div>
                  <div className="rs-day-content">
                    {dayMatches.length > 0 ? (
                      dayMatches.map(match => (
                        <div key={match.id} className="rs-calendar-match" onClick={() => {
                          dispatch({ type: 'SET_CURRENT_MATCH', payload: match });
                          dispatch({ type: 'SET_VIEW', payload: 'match_workspace' });
                        }}>
                          <div className="rs-calendar-match-teams">
                            <span>{match.home}</span>
                            <span className="rs-calendar-vs">vs</span>
                            <span>{match.away}</span>
                          </div>
                          <div className="rs-calendar-match-time">{match.time}</div>
                          <button className="rs-calendar-record-btn">
                            <Video size={16} />
                            <span>Record</span>
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="rs-no-matches">
                        <p>No matches scheduled</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rs-calendar-ideas">
            <h2>Content Ideas</h2>
            <div className="rs-ideas-list">
              <div className="rs-idea-card">
                <h3>🔥 Trending: Premier League Title Race</h3>
                <p>Create a prediction video about the title race heating up!</p>
                <button className="rs-idea-btn">Create Now</button>
              </div>
              <div className="rs-idea-card">
                <h3>⚽ Top 5 Goals of the Week</h3>
                <p>React to the best goals from this week's matches</p>
                <button className="rs-idea-btn">Create Now</button>
              </div>
              <div className="rs-idea-card">
                <h3>📊 Transfer Window Predictions</h3>
                <p>Predict the biggest transfers coming this window</p>
                <button className="rs-idea-btn">Create Now</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // EDITOR VIEW (Simplified)
  // ═══════════════════════════════════════════════════════════
  const renderEditor = () => (
    <div className="rs-editor">
      <div className="rs-editor-header">
        <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'creator_home' })} className="rs-back-btn">
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <h1>Video Editor</h1>
        <div className="rs-editor-actions">
          <button onClick={() => dispatch({ type: 'UNDO' })} className="rs-top-btn" disabled={history.past.length === 0}>
            <Undo2 size={16} />
          </button>
          <button onClick={() => dispatch({ type: 'REDO' })} className="rs-top-btn" disabled={history.future.length === 0}>
            <Redo2 size={16} />
          </button>
          <button className="rs-export-btn">
            <Download size={16} />
            <span>Export</span>
          </button>
        </div>
      </div>

      <div className="rs-editor-main">
        <div className="rs-canvas-area">
          <canvas ref={canvasRef} className="rs-main-canvas" />
          {ui.recordedUrl && <video src={ui.recordedUrl} controls className="rs-canvas-preview" />}
        </div>

        <div className="rs-editor-sidebar">
          <div className="rs-sidebar-section">
            <h3>AI Script</h3>
            {editor.aiScript ? (
              <div className="rs-script-display">
                <pre>{editor.aiScript}</pre>
                <button onClick={() => dispatch({ type: 'SET_EDITOR', payload: { aiScript: '' } })} className="rs-script-clear">
                  Clear Script
                </button>
              </div>
            ) : (
              <button onClick={() => currentMatch && generateAIScript(currentMatch)} className="rs-generate-script">
                <Sparkles size={20} />
                <span>Generate AI Script</span>
              </button>
            )}
          </div>

          <div className="rs-sidebar-section">
            <h3>Templates</h3>
            <div className="rs-templates-list">
              {FOOTBALL_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => dispatch({ type: 'SET_EDITOR', payload: { templateId: template.id } })}
                  className={`rs-template-item ${editor.templateId === template.id ? 'active' : ''}`}
                >
                  <span>{template.title}</span>
                  <span className="rs-template-duration">{template.duration}s</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rs-sidebar-section">
            <h3>Football Assets</h3>
            <div className="rs-assets-grid">
              <button className="rs-asset-btn" onClick={() => fileInputRefs.current.image?.click()}>
                <User size={20} />
                <span>Avatar</span>
              </button>
              <button className="rs-asset-btn">
                <Shield size={20} />
                <span>Club Logos</span>
              </button>
              <button className="rs-asset-btn">
                <Music size={20} />
                <span>Sounds</span>
              </button>
              <button className="rs-asset-btn">
                <Smile size={20} />
                <span>Stickers</span>
              </button>
            </div>
          </div>

          <div className="rs-sidebar-section">
            <h3>Lower Thirds</h3>
            <div className="rs-lower-thirds-grid">
              {LOWER_THIRDS.map(lt => (
                <button
                  key={lt.id}
                  onClick={() => dispatch({ type: 'SET_EDITOR', payload: { lowerThird: editor.lowerThird === lt.id ? null : lt.id } })}
                  className={`rs-lower-third-btn ${editor.lowerThird === lt.id ? 'active' : ''}`}
                  style={{ background: lt.color, color: lt.textColor }}
                >
                  {lt.name}
                </button>
              ))}
            </div>
          </div>

          <div className="rs-sidebar-section">
            <h3>Reaction Buttons</h3>
            <div className="rs-reactions-grid">
              {REACTION_BUTTONS.map(btn => (
                <button
                  key={btn.id}
                  onClick={() => {
                    const exists = editor.reactionButtons.includes(btn.id);
                    const newButtons = exists 
                      ? editor.reactionButtons.filter(b => b !== btn.id)
                      : [...editor.reactionButtons, btn.id];
                    dispatch({ type: 'SET_EDITOR', payload: { reactionButtons: newButtons } });
                  }}
                  className={`rs-reaction-btn-small ${editor.reactionButtons.includes(btn.id) ? 'active' : ''}`}
                  style={{ background: btn.color }}
                >
                  <span>{btn.emoji}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rs-sidebar-section">
            <h3>Sound Effects</h3>
            <div className="rs-sounds-list">
              {SOUND_LIBRARY.map(sound => (
                <button
                  key={sound.id}
                  onClick={() => dispatch({ type: 'SET_EDITOR', payload: { soundEffect: sound.id } })}
                  className={`rs-sound-btn ${editor.soundEffect === sound.id ? 'active' : ''}`}
                >
                  <span className="rs-sound-icon">{sound.icon}</span>
                  <span className="rs-sound-name">{sound.name}</span>
                  <span className="rs-sound-duration">{sound.duration}s</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rs-sidebar-section">
            <h3>Animations</h3>
            <div className="rs-animations-grid">
              {FOOTBALL_ANIMATIONS.map(anim => (
                <button
                  key={anim.id}
                  onClick={() => dispatch({ type: 'SET_EDITOR', payload: { footballAnimation: anim.id } })}
                  className={`rs-animation-btn ${editor.footballAnimation === anim.id ? 'active' : ''}`}
                >
                  <span className="rs-animation-icon">{anim.icon}</span>
                  <span className="rs-animation-name">{anim.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rs-sidebar-section">
            <h3>Viral Hooks</h3>
            <div className="rs-hooks-list">
              {VIRAL_HOOKS.map((hook, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    dispatch({ type: 'SET_EDITOR', payload: { povCaption: hook } });
                    addToast('Hook added to caption!', 'success');
                  }}
                  className="rs-hook-btn"
                >
                  {hook}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {media.cameraOn && (
        <div className="rs-camera-controls">
          <button onClick={startRecording} className="rs-record-inline">
            <Video size={20} />
            <span>Record Camera</span>
          </button>
        </div>
      )}

      <video ref={sourceVideoRef} className="rs-hidden-video" playsInline preload="auto" />
      <video ref={brollVideoRef} className="rs-hidden-video" playsInline muted preload="auto" />
      <video ref={webcamVideoRef} className="rs-hidden-video" playsInline muted preload="auto" />
      <audio ref={audioRef} style={{ display: 'none' }} />
      
      <input type="file" ref={el => fileInputRefs.current.video = el} onChange={(e) => handleImport(e, 'video')} accept="video/*" style={{ display: 'none' }} />
      <input type="file" ref={el => fileInputRefs.current.image = el} onChange={(e) => handleImport(e, 'image')} accept="image/*" style={{ display: 'none' }} />
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="rs-container">
      {view === 'creator_home' && renderCreatorHome()}
      {view === 'match_workspace' && renderMatchWorkspace()}
      {view === 'camera_recorder' && renderCameraRecorder()}
      {view === 'live_companion' && renderLiveCompanion()}
      {view === 'content_calendar' && renderContentCalendar()}
      {view === 'editor' && renderEditor()}

      {showOnboarding && (
        <div className="rs-modal-overlay">
          <div className="rs-modal rs-onboarding">
            <div className="rs-onboarding-icon">⚽</div>
            <h2>Welcome to Reactor Studio Vision!</h2>
            <p>The ultimate football content creation platform. Create viral reactions, predictions, and match reviews in seconds.</p>
            <div className="rs-onboarding-tips">
              <div className="rs-onboarding-tip"><Radio size={16} /> Live Companion Mode</div>
              <div className="rs-onboarding-tip"><Sparkles size={16} /> AI Script Writer</div>
              <div className="rs-onboarding-tip"><Camera size={16} /> Solo Cam Recording</div>
              <div className="rs-onboarding-tip"><Calendar size={16} /> Content Calendar</div>
            </div>
            <button onClick={() => { setShowOnboarding(false); localStorage.setItem('reactor-onboarded', 'true'); haptic('success'); }} className="rs-btn-sm rs-btn-accent" style={{ width: '100%', padding: '12px', fontSize: '14px', marginTop: '16px' }}>
              Let's Create! 🚀
            </button>
          </div>
        </div>
      )}
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