// FILE: src/pages/Home.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Zap, TrendingUp, Users, Target,
  Trophy, CalendarDays, Flame, ChevronRight, ChevronDown,
  WifiOff, LogIn, Star, CheckCircle, Clock,
  Loader, Lock, Play, Radio, Crown, Sparkles,
  Activity, Medal, BarChart3, CircleDot, ArrowUpRight,
  Sun, Moon, CloudSun, UsersRound, Timer, Gauge, Eye,
  Info, Pause, PlayCircle, XCircle, TrendingUp as TrendIcon
} from 'lucide-react';
import {
  fetchFixtures,
  subscribeToLiveFixtures,
  subscribeToTodayFixtures,
} from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import {
  collection, query, where, onSnapshot,
  orderBy, limit, getDocs, doc, getDoc
} from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().split('T')[0];
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return { text: 'Night owl?', icon: <Moon size={15} />, emoji: '🦉' };
  if (h < 12) return { text: 'Good morning', icon: <Sun size={15} />, emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', icon: <CloudSun size={15} />, emoji: '🌤️' };
  if (h < 21) return { text: 'Good evening', icon: <Sunset size={15} />, emoji: '🌅' };
  return { text: 'Night owl?', icon: <Moon size={15} />, emoji: '🦉' };
};

function Sunset(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TIME-BASED STATUS ESTIMATOR
   Used when API stops tracking a match before updating status
   ═══════════════════════════════════════════════════════════════ */
const LIVE_SET = new Set(['1H', '2H', 'ET', 'BT', 'P', '1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'OT']);
const HT_SET = new Set(['HT', 'BT']);
const FINISHED_SET = new Set(['FT', 'AET', 'PEN', 'finished', 'PST']);

function estimateMatchStatus(fix) {
  // Explicit statuses take priority
  if (fix.isLive || LIVE_SET.has(fix.status)) return 'live';
  if (fix.isFinished || FINISHED_SET.has(fix.status)) return 'ft';
  if (HT_SET.has(fix.status)) return 'ht';

  // Time-based estimation: if kickoff was >110 min ago and no live signal, assume FT
  if (fix.kickoff && fix.kickoff !== '--:--' && fix.kickoff !== 'TBD') {
    const parts = fix.kickoff.split(':');
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(m)) {
        const now = new Date();
        const kickoffTime = new Date();
        kickoffTime.setHours(h, m, 0, 0);
        const diffMinutes = (now - kickoffTime) / 60000;
        // If more than 110 minutes past kickoff with no live data → FT
        if (diffMinutes > 110) {
          return 'ft-estimated';
        }
      }
    }
  }

  return 'upcoming';
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATED NUMBER
   ═══════════════════════════════════════════════════════════════ */
function AnimNum({ value, duration = 700, delay = 0 }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const target = value || 0;
    if (target === 0) { setDisplay(0); return; }
    const start = performance.now() + delay;
    const animate = (now) => {
      if (now < start) { raf.current = requestAnimationFrame(animate); return; }
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration, delay]);
  return <>{display.toLocaleString()}</>;
}

/* ═══════════════════════════════════════════════════════════════
   LIVE CLOCK
   ═══════════════════════════════════════════════════════════════ */
function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!time) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 7,
      background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
      fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 700,
      color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums',
      letterSpacing: '.02em', flexShrink: 0
    }}>
      <Timer size={11} style={{ opacity: .5 }} />
      {time}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ZOKA PICK RESULT BADGE
   ═══════════════════════════════════════════════════════════════ */
function ZokaResultBadge({ pick }) {
  if (!pick.adminPick || pick.status !== 'finished') return null;
  const h = pick.adminPick.home, a = pick.adminPick.away;
  const ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, fontSize: '.54rem', fontWeight: 800, background: 'rgba(255,255,255,.04)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>PENDING</span>
  );
  if (h === ph && a === pa) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, fontSize: '.54rem', fontWeight: 800, background: 'rgba(0,230,118,.12)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.03em', border: '1px solid rgba(0,230,118,.2)' }}>
        <CheckCircle size={8} /> EXACT
      </span>
    );
  }
  const pR = h > a ? 'H' : h < a ? 'A' : 'D';
  const aR = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  if (pR === aR) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, fontSize: '.54rem', fontWeight: 800, background: 'rgba(245,197,66,.1)', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.03em', border: '1px solid rgba(245,197,66,.18)' }}>
        <TrendIcon size={8} /> RESULT
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, fontSize: '.54rem', fontWeight: 800, background: 'rgba(239,68,68,.08)', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '.03em', border: '1px solid rgba(239,68,68,.12)' }}>
      <XCircle size={8} /> MISS
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('home-v10')) return;

  const s = document.createElement('style');
  s.id = 'home-v10';

  s.textContent = `
    /* ═══ BASE ANIMATIONS ═══ */
    @keyframes zFadeUp {
      from { opacity: 0; transform: translateY(28px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes zScale {
      from { opacity: 0; transform: scale(.93); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes zGlow {
      0%, 100% { box-shadow: 0 0 0 rgba(0,230,118,0); }
      50% { box-shadow: 0 0 28px rgba(0,230,118,.2); }
    }
    @keyframes zFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    @keyframes zPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: .3; transform: scale(1.6); }
    }
    @keyframes zSlide {
      from { opacity: 0; transform: translateX(-16px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes zShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes hCtaPulse {
      0%, 100% { box-shadow: 0 4px 18px rgba(0,230,118,.15); }
      50% { box-shadow: 0 4px 28px rgba(0,230,118,.3); }
    }
    @keyframes crownFloat {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      25% { transform: translateY(-3px) rotate(2deg); }
      75% { transform: translateY(-1px) rotate(-1deg); }
    }
    @keyframes progressGrow {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }
    @keyframes carouselScroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(calc(-50% - var(--carousel-gap, 10px) / 2)); }
    }
    @keyframes carouselCardIn {
      from { opacity: 0; transform: translateY(12px) scale(.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes carouselShine {
      0% { left: -100%; }
      100% { left: 200%; }
    }
    @keyframes carouselDotBounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-4px); }
    }
    @keyframes scoreGlow {
      0%, 100% { text-shadow: 0 0 4px rgba(239,68,68,.15); }
      50% { text-shadow: 0 0 12px rgba(239,68,68,.35); }
    }
    @keyframes zokaRowIn {
      from { opacity: 0; transform: translateX(-10px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes toggleFade {
      from { opacity: 0; max-height: 0; }
      to { opacity: 1; max-height: 600px; }
    }

    /* ═══ ANIMATION UTILITY CLASSES ═══ */
    .z-fade-up { animation: zFadeUp .55s cubic-bezier(.22,1,.36,1) both; }
    .z-scale { animation: zScale .45s cubic-bezier(.22,1,.36,1) both; }
    .z-float { animation: zFloat 3.5s ease-in-out infinite; }
    .z-glow { animation: zGlow 3s ease-in-out infinite; }
    .z-slide { animation: zSlide .5s cubic-bezier(.22,1,.36,1) both; }
    .h-fade { animation: zFadeUp .5s cubic-bezier(.22,1,.36,1) both; }
    .h-pop { animation: zScale .4s cubic-bezier(.22,1,.36,1) both; }
    .h-enter { animation: zFadeUp .5s cubic-bezier(.22,1,.36,1) both; }
    .h-stat { animation: zScale .4s cubic-bezier(.22,1,.36,1) both; }
    .h-shimmer {
      background: linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-card) 50%, var(--bg-surface) 75%);
      background-size: 200% 100%;
      animation: zShimmer 1.4s ease-in-out infinite;
      border-radius: 8px;
    }
    .score-glow { animation: zGlow 2.5s ease-in-out infinite; }
    .crown-float { animation: crownFloat 3s ease-in-out infinite; }

    /* ═══ TICKER BAR ═══ */
    .ticker-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 16px; font-size: .68rem; font-weight: 600;
      color: var(--text-muted); background: rgba(255,255,255,.02);
      border-bottom: 1px solid var(--border);
      overflow-x: auto; white-space: nowrap;
      -webkit-overflow-scrolling: touch;
    }
    .ticker-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: var(--accent); flex-shrink: 0;
    }

    /* ═══ HERO ═══ */
    .hero-bg {
      background: linear-gradient(180deg, rgba(0,230,118,.02) 0%, transparent 100%);
    }

    /* ═══ CENTERING UTILITIES ═══ */
    .home-center {
      display: flex; flex-direction: column; align-items: center;
      text-align: center; width: 100%;
    }
    .home-row-center {
      display: flex; justify-content: center; align-items: center; flex-wrap: wrap;
    }
    .hero-center p { margin-left: auto !important; margin-right: auto !important; }
    .hero-buttons { justify-content: center; }

    /* ═══ STAT GRID ═══ */
    .stat-grid {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 8px; width: 100%; max-width: 640px; justify-items: center;
    }
    .stat-chip {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: 10px;
      width: 100%; transition: all .2s ease;
    }
    .stat-chip:hover { border-color: rgba(255,255,255,.1); transform: translateY(-1px); }
    .stat-chip-label {
      font-size: .6rem; font-weight: 600; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: .04em; line-height: 1; margin-bottom: 2px;
    }
    .stat-chip-val {
      font-size: .95rem; font-weight: 800; font-family: var(--font-display);
      color: var(--text-primary); line-height: 1;
    }

    /* ═══ SECTION HEADERS ═══ */
    .h-section { display: flex; flex-direction: column; width: 100%; }
    .sec-head {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 14px; flex-wrap: wrap;
    }
    .sec-head h2 {
      margin: 0; font-size: .95rem; font-weight: 800;
      color: var(--text-primary); white-space: nowrap;
    }
    .sec-head-line { flex: 1; min-width: 20px; height: 1px; background: var(--border); }

    /* ═══ EXPLORE GRID ═══ */
    .explore-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .explore-card {
      display: flex; align-items: center; gap: 14px;
      padding: 16px; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: 12px;
      text-decoration: none; position: relative; overflow: hidden;
      transition: all .2s cubic-bezier(.22,1,.36,1); width: 100%;
    }
    .explore-card:hover { border-color: rgba(255,255,255,.12); transform: translateX(4px); }

    /* ═══ FEATURED ROW ═══ */
    .feat-row {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: 10px;
      margin-bottom: 6px; transition: all .15s ease;
    }
    .feat-row:hover { border-color: rgba(255,255,255,.08); background: rgba(255,255,255,.02); }

    /* ═══ LIVE STRIP ═══ */
    .live-strip {
      display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px;
      scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
    }
    .live-strip::-webkit-scrollbar { height: 3px; }
    .live-strip::-webkit-scrollbar-track { background: transparent; }
    .live-strip::-webkit-scrollbar-thumb { background: rgba(239,68,68,.2); border-radius: 3px; }
    .live-match-mini {
      min-width: 180px; max-width: 220px; flex-shrink: 0;
      padding: 10px 12px; background: var(--bg-card);
      border: 1px solid rgba(239,68,68,.12); border-radius: 10px;
      scroll-snap-align: start;
    }
    .live-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: #ef4444; display: inline-block; animation: zPulse 1.2s infinite;
    }

    /* ═══ GOLD CARD ═══ */
    .gold-card {
      display: flex; flex-direction: column; padding: 16px 20px;
      background: linear-gradient(135deg, rgba(245,197,66,.04) 0%, rgba(245,197,66,.01) 100%);
      border: 1px solid rgba(245,197,66,.12); border-radius: 14px;
      width: 100%; max-width: 100%;
    }

    /* ═══ PROGRESS BAR ═══ */
    .progress-track {
      height: 3px; border-radius: 2px; background: rgba(255,255,255,.04);
      overflow: hidden; width: 100%;
    }
    .progress-fill {
      height: 100%; border-radius: 2px;
      background: linear-gradient(90deg, var(--accent), #69f0ae);
      transform-origin: left; animation: progressGrow .8s cubic-bezier(.22,1,.36,1) both;
      animation-delay: .3s;
    }

    /* ═══ BUTTONS ═══ */
    .zbtn { transition: all .2s cubic-bezier(.22,1,.36,1); cursor: pointer; outline: none; }
    .zbtn:hover { transform: translateY(-2px); }
    .zbtn:active { transform: translateY(0) scale(.98); }
    .zbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .cta-primary { animation: hCtaPulse 3s ease-in-out infinite; }
    .sh { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.08) transparent; }

    /* ═══ ZOKA PICKS SECTION ═══ */
    .zoka-section {
      background: linear-gradient(135deg, rgba(245,197,66,.03) 0%, transparent 60%);
      border: 1px solid rgba(245,197,66,.1);
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .zoka-header {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 14px;
    }
    .zoka-header-icon {
      width: 34px; height: 34px; border-radius: 9px;
      background: linear-gradient(135deg, rgba(245,197,66,.15), rgba(245,197,66,.05));
      border: 1px solid rgba(245,197,66,.2);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .zoka-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-radius: 10px;
      background: linear-gradient(90deg, rgba(245,197,66,.04) 0%, rgba(245,197,66,.01) 100%);
      border: 1px solid rgba(245,197,66,.1);
      margin-bottom: 6px;
      animation: zokaRowIn .4s cubic-bezier(.22,1,.36,1) both;
      transition: all .15s ease;
    }
    .zoka-row:hover {
      border-color: rgba(245,197,66,.2);
      background: linear-gradient(90deg, rgba(245,197,66,.06) 0%, rgba(245,197,66,.02) 100%);
    }
    .zoka-predicted-score {
      font-size: .82rem; font-weight: 900; font-family: var(--font-display);
      color: var(--gold); background: rgba(245,197,66,.08);
      padding: 3px 10px; border-radius: 6px;
      border: 1px solid rgba(245,197,66,.15);
      font-variant-numeric: tabular-nums; flex-shrink: 0;
      min-width: 50px; text-align: center;
    }
    .zoka-actual-score {
      font-size: .78rem; font-weight: 700; font-family: var(--font-display);
      color: var(--text-primary); font-variant-numeric: tabular-nums;
      flex-shrink: 0; min-width: 44px; text-align: center;
    }
    .zoka-team {
      flex: 1; font-size: .76rem; font-weight: 600;
      color: var(--text-primary); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
      display: flex; align-items: center; gap: 6px; min-width: 0;
    }
    .zoka-team img {
      width: 16px; height: 16px; border-radius: 3px;
      object-fit: contain; flex-shrink: 0;
    }
    .zoka-team.away {
      justify-content: flex-end; text-align: right;
    }
    .zoka-kickoff {
      font-size: .62rem; font-weight: 700; color: var(--text-muted);
      font-family: var(--font-display); flex-shrink: 0;
      width: 38px; text-align: center;
    }
    .zoka-result-col {
      width: 68px; flex-shrink: 0; display: flex;
      justify-content: flex-end;
    }

    /* ═══ TOGGLE BUTTON ═══ */
    .toggle-more-btn {
      display: flex; align-items: center; justify-content: center;
      gap: 6px; width: 100%; padding: 9px 16px; margin-top: 8px;
      border-radius: 9px; font-size: .72rem; font-weight: 700;
      background: rgba(255,255,255,.02); border: 1px dashed var(--border);
      color: var(--text-muted); cursor: pointer;
      transition: all .2s ease;
    }
    .toggle-more-btn:hover {
      background: rgba(255,255,255,.05);
      border-color: rgba(255,255,255,.12);
      color: var(--text-primary);
    }
    .toggle-more-btn:active { transform: scale(.98); }
    .toggle-more-btn svg {
      transition: transform .25s ease;
    }
    .toggle-more-btn.expanded svg {
      transform: rotate(180deg);
    }

    /* ═══ TOGGLE COLLAPSE ANIMATION ═══ */
    .toggle-hidden-items {
      overflow: hidden;
      transition: max-height .35s cubic-bezier(.22,1,.36,1), opacity .25s ease;
    }
    .toggle-hidden-items.collapsed {
      max-height: 0; opacity: 0; pointer-events: none;
    }
    .toggle-hidden-items.expanded {
      max-height: 2000px; opacity: 1;
    }

    /* ═══ FIXTURE CAROUSEL ═══ */
    .carousel-wrapper {
      position: relative; overflow: hidden;
      margin: 0 -16px; padding: 0 16px;
    }
    .carousel-track {
      display: flex; gap: var(--carousel-gap, 10px);
      width: max-content;
      animation: carouselScroll var(--carousel-dur, 40s) linear infinite;
      will-change: transform; padding: 4px 0;
    }
    .carousel-track.paused { animation-play-state: paused; }
    .carousel-fade {
      position: absolute; top: 0; bottom: 0; width: 48px;
      z-index: 3; pointer-events: none;
    }
    .carousel-fade-left { left: 16px; background: linear-gradient(to right, var(--bg-deep) 0%, transparent 100%); }
    .carousel-fade-right { right: 16px; background: linear-gradient(to left, var(--bg-deep) 0%, transparent 100%); }
    .carousel-card {
      flex-shrink: 0; width: var(--carousel-card-w, 185px);
      padding: 14px; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: 12px;
      position: relative; overflow: hidden;
      transition: all .28s cubic-bezier(.22,1,.36,1);
      cursor: pointer;
      animation: carouselCardIn .5s cubic-bezier(.22,1,.36,1) both;
    }
    .carousel-card:hover {
      border-color: rgba(255,255,255,.14);
      transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.25);
    }
    .carousel-card:active { transform: translateY(-1px) scale(.98); }
    .carousel-card::after {
      content: ''; position: absolute; top: 0; left: -100%;
      width: 50%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.03), transparent);
      transition: none; pointer-events: none;
    }
    .carousel-card:hover::after { animation: carouselShine .6s ease-out; }
    .carousel-league {
      display: flex; align-items: center; gap: 5px;
      margin-bottom: 12px; padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,.04);
    }
    .carousel-league img { width: 13px; height: 13px; border-radius: 2px; object-fit: contain; flex-shrink: 0; }
    .carousel-league span {
      font-size: .6rem; font-weight: 700; color: var(--text-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      text-transform: uppercase; letter-spacing: .03em;
    }
    .carousel-team-row {
      display: flex; align-items: center; gap: 7px; padding: 3px 0;
    }
    .carousel-team-row.away { flex-direction: row-reverse; text-align: right; }
    .carousel-team-row img { width: 20px; height: 20px; object-fit: contain; flex-shrink: 0; border-radius: 4px; }
    .carousel-team-row span {
      font-size: .76rem; font-weight: 600; color: var(--text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      flex: 1; line-height: 1.2;
    }
    .carousel-time-divider {
      display: flex; align-items: center; justify-content: center;
      padding: 5px 0; gap: 6px;
    }
    .carousel-time-divider .line { flex: 1; height: 1px; background: rgba(255,255,255,.05); }
    .carousel-time-badge {
      font-size: .64rem; font-weight: 800; font-family: var(--font-display);
      color: var(--accent); background: rgba(0,230,118,.08);
      padding: 2px 8px; border-radius: 5px; letter-spacing: .02em;
      flex-shrink: 0; white-space: nowrap;
    }
    .carousel-pause-indicator {
      position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
      z-index: 5; display: flex; align-items: center; gap: 5px;
      padding: 4px 10px; background: rgba(0,0,0,.6);
      backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.08);
      border-radius: 20px; animation: zFadeUp .25s ease-out both;
      pointer-events: none;
    }
    .carousel-pause-indicator span {
      font-size: .56rem; font-weight: 700; color: rgba(255,255,255,.7);
      text-transform: uppercase; letter-spacing: .06em;
    }
    .carousel-pause-indicator svg { color: rgba(255,255,255,.5); }
    .carousel-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
    }
    .carousel-header-left { display: flex; align-items: center; gap: 8px; }
    .carousel-header-dots { display: flex; gap: 3px; align-items: center; }
    .carousel-header-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }
    .carousel-header-dots span:nth-child(1) { animation: carouselDotBounce 1.2s ease-in-out infinite; }
    .carousel-header-dots span:nth-child(2) { animation: carouselDotBounce 1.2s ease-in-out infinite .15s; }
    .carousel-header-dots span:nth-child(3) { animation: carouselDotBounce 1.2s ease-in-out infinite .3s; }

    /* ═══ CAROUSEL LIVE ═══ */
    .carousel-card.is-live {
      border-color: rgba(239,68,68,.2);
      background: linear-gradient(180deg, rgba(239,68,68,.04) 0%, var(--bg-card) 50%);
    }
    .carousel-card.is-live:hover { border-color: rgba(239,68,68,.35); box-shadow: 0 8px 28px rgba(239,68,68,.12); }
    .carousel-live-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 4px; background: rgba(239,68,68,.1);
      font-size: .56rem; font-weight: 800; color: #ef4444;
      letter-spacing: .03em; text-transform: uppercase;
    }
    .carousel-live-badge .carousel-live-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: #ef4444; animation: zPulse 1.2s ease-in-out infinite;
    }
    .carousel-score-center {
      display: flex; align-items: center; justify-content: center;
      gap: 6px; font-family: var(--font-display); font-variant-numeric: tabular-nums;
    }
    .carousel-score-num {
      font-size: 1.05rem; font-weight: 900; color: #ef4444;
      line-height: 1; min-width: 18px; text-align: center;
      animation: scoreGlow 2s ease-in-out infinite;
    }
    .carousel-score-sep { font-size: .75rem; font-weight: 700; color: rgba(239,68,68,.35); }
    .carousel-team-score {
      font-size: .78rem; font-weight: 900; font-family: var(--font-display);
      color: #ef4444; font-variant-numeric: tabular-nums;
      flex-shrink: 0; margin-left: auto;
    }
    .carousel-team-row.away .carousel-team-score { margin-left: 0; margin-right: auto; }
    .carousel-progress {
      height: 2px; border-radius: 1px; background: rgba(239,68,68,.06);
      overflow: hidden; margin-top: 10px;
    }
    .carousel-progress-fill {
      height: 100%; border-radius: 1px;
      background: linear-gradient(90deg, #ef4444, #f97316);
      transition: width 1s linear;
    }
    .carousel-minute {
      font-size: .56rem; font-weight: 700; color: rgba(239,68,68,.7);
      font-family: var(--font-display)';
    }

    /* ═══ CAROUSEL FT ESTIMATED ═══ */
    .carousel-card.is-ft-est {
      border-color: rgba(0,230,118,.15);
      background: linear-gradient(180deg, rgba(0,230,118,.02) 0%, var(--bg-card) 60%);
    }
    .carousel-ft-est-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 4px; background: rgba(0,230,118,.08);
      font-size: .56rem; font-weight: 800; color: var(--accent);
      letter-spacing: .03em; text-transform: uppercase;
    }
    .carousel-ft-score-num {
      font-size: 1.05rem; font-weight: 900; color: var(--text-primary);
      line-height: 1; min-width: 18px; text-align: center;
      font-family: var(--font-display); font-variant-numeric: tabular-nums;
    }
    .carousel-ft-score-sep { font-size: .75rem; font-weight: 700; color: rgba(255,255,255,.15); }

    .carousel-card.is-ht {
      border-color: rgba(249,115,22,.15);
      background: linear-gradient(180deg, rgba(249,115,22,.03) 0%, var(--bg-card) 50%);
    }
    .carousel-ht-badge {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 8px; border-radius: 4px; background: rgba(249,115,22,.1);
      font-size: .56rem; font-weight: 800; color: #f97316;
      letter-spacing: .03em; text-transform: uppercase;
    }

    /* ═══ RESPONSIVE — MOBILE FIRST ═══ */
    @media (min-width: 480px) {
      .explore-grid { grid-template-columns: repeat(2, 1fr); }
      .carousel-card { --carousel-card-w: 200px; }
    }
    @media (min-width: 640px) {
      .explore-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .live-match-mini { min-width: 200px; }
      .stat-grid { gap: 10px; }
      .sec-head { justify-content: flex-start; }
      .carousel-card { --carousel-card-w: 220px; padding: 16px; }
      .carousel-team-row span { font-size: .82rem; }
    }
    @media (min-width: 768px) {
      .explore-grid { grid-template-columns: repeat(3, 1fr); }
      .hero-buttons { flex-direction: row; }
      .hero-buttons a, .hero-buttons .zbtn-wrap { width: auto; }
      .carousel-card { --carousel-card-w: 230px; }
    }
    @media (max-width: 639px) {
      .hero-buttons { flex-direction: column; width: 100%; max-width: 320px; }
      .hero-buttons a, .hero-buttons .zbtn-wrap { width: 100%; justify-content: center; }
      .stat-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .stat-chip { padding: 8px 10px; gap: 6px; }
      .stat-chip-val { font-size: .85rem; }
      .sec-head { justify-content: center; text-align: center; }
      .sec-head-line { max-width: 60px; }
      .sec-head > div:last-child { width: 100%; justify-content: center; margin-top: 4px; }
      .feat-row { flex-wrap: wrap; gap: 8px; }
      .feat-row > div:last-child { width: 100%; text-align: center; }
      .gold-card { text-align: center; }
      .gold-card > div { flex-wrap: wrap; justify-content: center; text-align: center; }
      .gold-card a { width: 100%; justify-content: center; margin-top: 8px; }
      .ticker-bar { justify-content: center; }
      .carousel-fade { width: 32px; }
      .zoka-row { flex-wrap: wrap; gap: 6px; padding: 10px 12px; }
      .zoka-result-col { width: 100%; justify-content: flex-start; margin-top: 2px; }
    }
    @media (max-width: 380px) {
      .stat-grid { grid-template-columns: repeat(2, 1fr); gap: 6px; }
      .stat-chip { padding: 8px; gap: 5px; }
      .stat-chip-label { font-size: .55rem; }
      .stat-chip-val { font-size: .8rem; }
      .carousel-card { --carousel-card-w: 165px; padding: 12px; }
      .zoka-team { font-size: .7rem; }
      .zoka-predicted-score { font-size: .76rem; padding: 2px 8px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .carousel-track, .carousel-card, .carousel-header-dots span { animation: none !important; }
      .toggle-hidden-items { transition: none !important; }
    }
  `;

  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   SKELETONS
   ═══════════════════════════════════════════════════════════════ */
const SkelFeatured = () => (
  <div className="h-shimmer" style={{ height: 62, borderRadius: 10, marginBottom: 6 }} />
);
const SkelLive = () => (
  <div className="h-shimmer" style={{ minWidth: 170, height: 78, borderRadius: 10, flexShrink: 0 }} />
);
const SkelCarousel = () => (
  <div className="h-shimmer" style={{ width: 185, height: 140, borderRadius: 12, flexShrink: 0 }} />
);
const SkelZoka = () => (
  <div className="h-shimmer" style={{ height: 54, borderRadius: 10, marginBottom: 6 }} />
);

/* ═══════════════════════════════════════════════════════════════
   COMPACT LIVE MATCH MINI-CARD
   ═══════════════════════════════════════════════════════════════ */
const LiveMini = ({ match, index }) => {
  const minute = match.elapsed || match.minute || '';
  const minuteStr = minute ? `${minute}'` : '';
  return (
    <div className="live-match-mini h-pop" style={{ animationDelay: `${index * 80}ms` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingLeft: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
          {match.league?.logo && <img src={match.league.logo} alt="" style={{ width: 11, height: 11, borderRadius: 2, objectFit: 'contain', flexShrink: 0 }} />}
          <span style={{ fontSize: '.58rem', fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.league?.name}</span>
        </div>
        {minuteStr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(239,68,68,.1)', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>
            <span className="live-dot" style={{ width: 4, height: 4 }} />
            <span style={{ fontSize: '.58rem', fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-display)' }}>{minuteStr}&apos;</span>
          </div>
        )}
      </div>
      <div style={{ paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          {match.homeTeam?.logo && <img src={match.homeTeam.logo} alt="" style={{ width: 15, height: 15, objectFit: 'contain', flexShrink: 0 }} />}
          <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.homeTeam?.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', flexShrink: 0 }}>
          <span style={{ fontSize: '.82rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{match.homeScore ?? '-'}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', minWidth: 0 }}>
          <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{match.awayTeam?.name}</span>
          {match.awayTeam?.logo && <img src={match.awayTeam.logo} alt="" style={{ width: 15, height: 15, objectFit: 'contain', flexShrink: 0 }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', flexShrink: 0 }}>
          <span style={{ fontSize: '.82rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{match.awayScore ?? '-'}</span>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   FIXTURE CAROUSEL — With time-based FT estimation
   ═══════════════════════════════════════════════════════════════ */
function FixtureCarousel({ fixtures, loading }) {
  const trackRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const resumeTimer = useRef(null);

  const duration = useMemo(() => Math.max(20, fixtures.length * 4.2), [fixtures.length]);

  const items = useMemo(() => {
    if (fixtures.length === 0) return [];
    return [...fixtures, ...fixtures];
  }, [fixtures]);

  const liveCount = useMemo(() => fixtures.filter(m => {
    const s = estimateMatchStatus(m);
    return s === 'live' || s === 'ht';
  }).length, [fixtures]);

  const handleMouseEnter = useCallback(() => {
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
    setIsPaused(true);
  }, []);
  const handleMouseLeave = useCallback(() => { setIsPaused(false); }, []);
  const handleTouchStart = useCallback(() => {
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
    setIsPaused(true);
  }, []);
  const handleTouchEnd = useCallback(() => {
    resumeTimer.current = setTimeout(() => { setIsPaused(false); resumeTimer.current = null; }, 3000);
  }, []);

  useEffect(() => { return () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }; }, []);

  if (loading) {
    return (
      <div style={{ background: 'linear-gradient(180deg, rgba(0,230,118,.03) 0%, transparent 100%)', borderBottom: '1px solid var(--border)', padding: '10px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div className="h-shimmer" style={{ width: 100, height: 14, borderRadius: 4 }} />
          <div className="h-shimmer" style={{ width: 60, height: 14, borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, overflow: 'hidden' }}>
          {Array.from({ length: 5 }).map((_, i) => <SkelCarousel key={i} />)}
        </div>
      </div>
    );
  }

  if (fixtures.length < 2) return null;

  return (
    <div className="z-fade-up" style={{ background: 'linear-gradient(180deg, rgba(0,230,118,.03) 0%, transparent 100%)', borderBottom: '1px solid var(--border)', padding: '10px 0 14px' }}>
      <div className="carousel-header" style={{ padding: '0 16px' }}>
        <div className="carousel-header-left">
          <div className="carousel-header-dots"><span /><span /><span /></div>
          <span style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--accent)' }}>
            {fixtures.length} Matches{liveCount > 0 && <span style={{ color: '#ef4444', marginLeft: 6 }}>· {liveCount} LIVE</span>}
          </span>
        </div>
        <Link to="/fixtures" className="zbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(0,230,118,.06)', border: '1px solid rgba(0,230,118,.15)', color: 'var(--accent)', fontWeight: 600, fontSize: '.68rem', textDecoration: 'none' }}>
          All <ChevronRight size={10} />
        </Link>
      </div>

      <div className="carousel-wrapper">
        <div className="carousel-fade carousel-fade-left" />
        <div className="carousel-fade carousel-fade-right" />
        <div
          ref={trackRef}
          className={`carousel-track ${isPaused ? 'paused' : ''}`}
          style={{ '--carousel-dur': `${duration}s`, '--carousel-gap': '10px' }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {items.map((fix, i) => {
            const homeLogo = fix.homeLogo || fix.homeTeam?.logo;
            const awayLogo = fix.awayLogo || fix.awayTeam?.logo;
            const leagueLogo = fix.league?.logo || fix.league?.emblem;
            const realIndex = i % fixtures.length;

            // ★ KEY CHANGE: Use time-based estimation
            const status = estimateMatchStatus(fix);
            const isLive = status === 'live';
            const isHT = status === 'ht';
            const isFt = status === 'ft' || status === 'ft-estimated';
            const isFtEstimated = status === 'ft-estimated';

            const minute = fix.minute || fix.elapsed || 0;
            const progress = isLive ? Math.min(minute / 90, 1) : 0;
            const progressColor = minute <= 45 ? '#ef4444' : '#f97316';

            let cardClass = 'carousel-card';
            if (isLive) cardClass = 'carousel-card is-live';
            else if (isHT) cardClass = 'carousel-card is-ht';
            else if (isFtEstimated) cardClass = 'carousel-card is-ft-est';

            return (
              <Link to={`/fixtures?match=${fix.id}`} key={`${fix.id || fix.matchId}-dup${i}`} className={cardClass} style={{ animationDelay: `${realIndex * 60}ms` }}>
                <div className="carousel-league">
                  {leagueLogo && <img src={leagueLogo} alt="" loading="lazy" />}
                  <span>{fix.league?.name || 'League'}</span>
                </div>

                {/* Status badges */}
                {isLive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span className="carousel-live-badge"><span className="carousel-live-dot" /> LIVE</span>
                    {minute > 0 && <span className="carousel-minute">{minute}&apos;</span>}
                  </div>
                )}
                {isHT && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span className="carousel-ht-badge"><Pause size={7} style={{ opacity: .7 }} /> HT</span>
                  </div>
                )}
                {isFtEstimated && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span className="carousel-ft-est-badge"><CheckCircle size={7} style={{ opacity: .7 }} /> FT</span>
                  </div>
                )}

                {/* Home team */}
                <div className="carousel-team-row">
                  {homeLogo && <img src={homeLogo} alt="" loading="lazy" />}
                  <span>{fix.homeTeam?.shortName || fix.homeTeam?.name || 'TBD'}</span>
                  {isLive && <span className="carousel-team-score">{fix.homeScore ?? 0}</span>}
                </div>

                {/* Divider */}
                <div className="carousel-time-divider">
                  <div className="line" />
                  {isLive ? (
                    <span className="carousel-score-center">
                      <span className="carousel-score-num">{fix.homeScore ?? 0}</span>
                      <span className="carousel-score-sep">-</span>
                      <span className="carousel-score-num">{fix.awayScore ?? 0}</span>
                    </span>
                  ) : isFtEstimated ? (
                    <span className="carousel-score-center">
                      <span className="carousel-ft-score-num">{fix.homeScore ?? 0}</span>
                      <span className="carousel-ft-score-sep">-</span>
                      <span className="carousel-ft-score-num">{fix.awayScore ?? 0}</span>
                    </span>
                  ) : (
                    <span className="carousel-time-badge">
                      <Clock size={8} style={{ marginRight: 3, verticalAlign: 'middle', opacity: .7 }} />
                      {fix.kickoff || '--:--'}
                    </span>
                  )}
                  <div className="line" />
                </div>

                {/* Away team */}
                <div className="carousel-team-row away">
                  {awayLogo && <img src={awayLogo} alt="" loading="lazy" />}
                  <span>{fix.awayTeam?.shortName || fix.awayTeam?.name || 'TBD'}</span>
                  {isLive && <span className="carousel-team-score">{fix.awayScore ?? 0}</span>}
                </div>

                {/* Progress bar for live */}
                {isLive && minute > 0 && (
                  <div className="carousel-progress">
                    <div className="carousel-progress-fill" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${progressColor}, ${progressColor}88)` }} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
        {isPaused && (
          <div className="carousel-pause-indicator">
            <PlayCircle size={10} /><span>Auto-scroll paused</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FEATURED MATCH ROW
   ═══════════════════════════════════════════════════════════════ */
const FeaturedRow = ({ pred, userPred, index, isLoggedIn }) => {
  const isFinished = pred.status === 'finished';
  const isPredicted = !!userPred;
  const isResolved = isPredicted && userPred.actualHome != null && userPred.actualHome !== undefined;
  const isExact = isResolved && userPred.isCorrectScore;
  const isHit = isResolved && !userPred.isCorrectScore && userPred.isCorrectResult;

  let leftBorder = 'var(--border)';
  if (isExact) leftBorder = 'var(--accent)';
  else if (isHit) leftBorder = 'var(--gold)';
  else if (isResolved && !isExact && !isHit) leftBorder = '#ef4444';
  else if (isFinished) leftBorder = 'rgba(0,230,118,.3)';
  else if (isPredicted) leftBorder = '#60a5fa';

  return (
    <div className="feat-row h-enter" style={{ borderLeft: `3px solid ${leftBorder}`, animationDelay: `${index * 35}ms`, opacity: isFinished && !isResolved ? 0.5 : 1 }}>
      <div style={{ width: 42, textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{pred.kickoff || 'TBD'}</div>
      </div>
      <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {pred.homeTeam?.logo && <img src={pred.homeTeam.logo} alt="" style={{ width: 15, height: 15, borderRadius: 3, objectFit: 'contain' }} />}
          <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{pred.homeTeam?.name || 'Home'}</span>
          {isFinished && <span style={{ fontSize: '.84rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', flexShrink: 0 }}>{pred.homeScore}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {pred.awayTeam?.logo && <img src={pred.awayTeam.logo} alt="" style={{ width: 15, height: 15, borderRadius: 3, objectFit: 'contain' }} />}
          <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'right' }}>{pred.awayTeam?.name || 'Away'}</span>
          {isFinished && <span style={{ fontSize: '.84rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', flexShrink: 0, textAlign: 'right' }}>{pred.awayScore}</span>}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        {isResolved ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: '.58rem', fontWeight: 700, background: isExact ? 'rgba(0,230,118,.12)' : isHit ? 'rgba(245,197,66,.1)' : 'rgba(239,68,68,.08)', color: isExact ? 'var(--accent)' : isHit ? 'var(--gold)' : '#ef4444', textTransform: 'uppercase' }}>
              {isExact ? '+10' : isHit ? '+3' : 'Miss'}
            </span>
            {isPredicted && <span style={{ fontSize: '.52rem', color: 'var(--text-muted)' }}>You: {userPred.homeScore}–{userPred.awayScore}</span>}
          </div>
        ) : isFinished ? (
          <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: '.58rem', fontWeight: 700, background: 'rgba(255,255,255,.04)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>FT</span>
        ) : isPredicted ? (
          <Link to="/predictions" className="zbtn" style={{ padding: '5px 10px', borderRadius: 6, fontSize: '.6rem', fontWeight: 700, textDecoration: 'none', background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.15)', color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <CheckCircle size={9} /> Locked
          </Link>
        ) : isLoggedIn ? (
          <Link to="/predictions" className="zbtn" style={{ padding: '5px 10px', borderRadius: 6, fontSize: '.6rem', fontWeight: 700, textDecoration: 'none', background: 'rgba(0,230,118,.08)', border: '1px solid rgba(0,230,118,.12)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Target size={9} /> Predict
          </Link>
        ) : (
          <Link to="/login" className="zbtn" style={{ padding: '5px 10px', borderRadius: 6, fontSize: '.6rem', fontWeight: 700, textDecoration: 'none', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Lock size={9} /> Login
          </Link>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   EXPLORE CARD
   ═══════════════════════════════════════════════════════════════ */
const ExploreCard = ({ to, icon, title, desc, color, delay, glow, badge }) => (
  <Link to={to} className={`explore-card h-pop ${glow ? 'score-glow' : ''}`} style={{ animationDelay: `${delay || 0}ms` }}>
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color, borderRadius: '0 2px 2px 0' }} />
    <div style={{ width: 42, height: 42, borderRadius: 11, background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0, fontSize: '1.15rem' }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: '.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h4>
        {badge && <span style={{ fontSize: '.52rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${color}15`, color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{badge}</span>}
      </div>
      <p style={{ margin: 0, fontSize: '.68rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{desc}</p>
    </div>
    <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: .35 }} />
  </Link>
);

/* ═══════════════════════════════════════════════════════════════
   TOP RANKED USER CARD
   ═══════════════════════════════════════════════════════════════ */
const TopUserCard = ({ user, loading }) => {
  if (loading) return <div className="h-shimmer" style={{ height: 80, borderRadius: 14, marginBottom: 20 }} />;
  if (!user) return null;
  const pts = user.points || 0;
  const exact = user.correctScore || 0;
  const total = user.predictions || 0;
  const accuracy = total > 0 ? Math.round((exact / total) * 100) : 0;

  return (
    <div className="gold-card h-enter" style={{ marginBottom: 20, animationDelay: '100ms' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        <div className="crown-float" style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,197,66,.1)', border: '1.5px solid rgba(245,197,66,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Crown size={22} style={{ color: '#fbbf24' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.54rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.06em' }}>All-Time #1</span>
            <Flame size={10} style={{ color: '#f97316' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.displayName || 'Anonymous'}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.78rem', fontWeight: 900, color: 'var(--gold)', fontFamily: 'var(--font-display)' }}><AnimNum value={pts} delay={200} /> pts</span>
            <span style={{ fontSize: '.64rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Target size={9} style={{ color: 'var(--accent)' }} /> <AnimNum value={exact} delay={300} /> exact</span>
            <span style={{ fontSize: '.64rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Gauge size={9} style={{ color: '#60a5fa' }} /> <AnimNum value={accuracy} delay={400} />%</span>
          </div>
        </div>
        <Link to="/leaderboard" className="zbtn" style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 9, background: 'rgba(245,197,66,.08)', border: '1px solid rgba(245,197,66,.18)', color: 'var(--gold)', fontWeight: 700, fontSize: '.68rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          View All <ArrowRight size={10} />
        </Link>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   ZOKA PICKS SECTION — Show 4, toggle for more
   ═══════════════════════════════════════════════════════════════ */
const ZokaPicksSection = ({ picks, loading }) => {
  const INITIAL_COUNT = 4;
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="zoka-section h-fade" style={{ animationDelay: '80ms' }}>
        <div className="zoka-header">
          <div className="zoka-header-icon"><Star size={16} style={{ color: 'var(--gold)' }} /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: '.88rem', fontWeight: 800, color: 'var(--gold)' }}>Zoka Picks</h2>
            <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>Loading expert selections...</span>
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => <SkelZoka key={i} />)}
      </div>
    );
  }

  if (!picks || picks.length === 0) return null;

  const visiblePicks = expanded ? picks : picks.slice(0, INITIAL_COUNT);
  const hiddenCount = picks.length - INITIAL_COUNT;

  // Compute summary stats
  let exactCount = 0, resultCount = 0, missCount = 0, pendingCount = 0;
  picks.forEach(p => {
    if (!p.adminPick || p.status !== 'finished' || p.homeScore == null) { pendingCount++; return; }
    const h = p.adminPick.home, a = p.adminPick.away;
    const ph = p.homeScore, pa = p.awayScore;
    if (h === ph && a === pa) { exactCount++; return; }
    const pR = h > a ? 'H' : h < a ? 'A' : 'D';
    const aR = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
    if (pR === aR) { resultCount++; return; }
    missCount++;
  });

  return (
    <div className="zoka-section z-fade-up" style={{ animationDelay: '80ms' }}>
      {/* Header */}
      <div className="zoka-header">
        <div className="zoka-header-icon">
          <Star size={16} style={{ color: 'var(--gold)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
           <h2
  style={{
    margin: 0,
    fontSize: '.88rem',
    fontWeight: 800,
    color: 'var(--gold)',
  }}
>
  Zoka Picks
</h2>
            <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)', background: 'rgba(245,197,66,.08)', padding: '2px 8px', borderRadius: 4 }}>
              {picks.length} picks
            </span>
          </div>
          {/* Mini stats */}
          <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
            {exactCount > 0 && <span style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--accent)' }}>{exactCount} exact</span>}
            {resultCount > 0 && <span style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--gold)' }}>{resultCount} result</span>}
            {missCount > 0 && <span style={{ fontSize: '.58rem', fontWeight: 700, color: '#ef4444' }}>{missCount} miss</span>}
            {pendingCount > 0 && <span style={{ fontSize: '.58rem', fontWeight: 600, color: 'var(--text-muted)' }}>{pendingCount} pending</span>}
          </div>
        </div>
        <Sparkles size={16} style={{ color: 'rgba(245,197,66,.4)', flexShrink: 0 }} />
      </div>

      {/* Picks */}
      {visiblePicks.map((pick, i) => {
        const isFinished = pick.status === 'finished';
        const hasScore = pick.homeScore != null && pick.awayScore != null;

        return (
          <div key={pick.matchId || i} className="zoka-row" style={{ animationDelay: `${i * 50}ms` }}>
            <span className="zoka-kickoff">{pick.kickoff || 'TBD'}</span>

            {/* Home team */}
            <div className="zoka-team">
              {pick.homeLogo && <img src={pick.homeLogo} alt="" loading="lazy" />}
              <span>{pick.homeTeam?.shortName || pick.homeTeam?.name || 'TBD'}</span>
            </div>

            {/* Predicted score */}
            <span className="zoka-predicted-score">
              {pick.adminPick ? `${pick.adminPick.home} - ${pick.adminPick.away}` : '? - ?'}
            </span>

            {/* Actual score */}
            <span className="zoka-actual-score" style={{ color: hasScore ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {hasScore ? `${pick.homeScore} - ${pick.awayScore}` : '– –'}
            </span>

            {/* Away team */}
            <div className="zoka-team away">
              <span>{pick.awayTeam?.shortName || pick.awayTeam?.name || 'TBD'}</span>
              {pick.awayLogo && <img src={pick.awayLogo} alt="" loading="lazy" />}
            </div>

            {/* Result badge */}
            <div className="zoka-result-col">
              <ZokaResultBadge pick={pick} />
            </div>
          </div>
        );
      })}

      {/* Toggle button */}
      {hiddenCount > 0 && (
        <button
          className={`toggle-more-btn ${expanded ? 'expanded' : ''}`}
          onClick={() => setExpanded(prev => !prev)}
        >
          {expanded ? (
            <>Show less <ChevronDown size={13} /></>
          ) : (
            <>Show {hiddenCount} more <ChevronDown size={13} /></>
          )}
        </button>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   MAIN HOME COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Home() {
  injectStyles();
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid;
  const isLoggedIn = !!uid;
  const _today = useMemo(() => todayStr(), []);
  const greeting = useMemo(() => getGreeting(), []);

  const [featuredPreds, setFeaturedPreds] = useState([]);
  const [userPredsMap, setUserPredsMap] = useState({});
  const [liveMatches, setLiveMatches] = useState([]);
  const [allTodayFixtures, setAllTodayFixtures] = useState([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [loadingLive, setLoadingLive] = useState(true);
  const [offline, setOffline] = useState(false);
  const [totalPredictorsToday, setTotalPredictorsToday] = useState(0);

  const [topUser, setTopUser] = useState(null);
  const [topUserLoading, setTopUserLoading] = useState(true);

  // ★ NEW: Zoka Picks state
  const [zokaPicks, setZokaPicks] = useState([]);
  const [zokaPicksLoading, setZokaPicksLoading] = useState(true);

  // ★ NEW: Toggle state for featured predictions
  const [featExpanded, setFeatExpanded] = useState(false);
  const FEAT_INITIAL = 4;

  /* ── Top ranked user ── */
  useEffect(() => {
    if (!db) { setTopUserLoading(false); return; }
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('points', 'desc'), limit(1)));
        if (!snap.empty) setTopUser({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch (e) { console.warn('[Home] Top user error:', e); }
      setTopUserLoading(false);
    })();
  }, []);

  /* ── Featured predictions (active_predictions) ── */
  useEffect(() => {
    if (!db) { setLoadingFeatured(false); return; }
    const q = query(collection(db, 'active_predictions'), where('matchDate', '==', _today), orderBy('priority', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFeaturedPreds(list);
      setLoadingFeatured(false);
    }, (err) => { console.warn('[Home] Featured preds error:', err); setLoadingFeatured(false); });
    return () => unsub();
  }, [_today, db]);

  /* ── User predictions map ── */
  useEffect(() => {
    if (!uid || !db) { setUserPredsMap({}); return; }
    const q = query(collection(db, 'user_predictions'), where('userId', '==', uid), where('matchDate', '==', _today));
    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach(d => { const data = d.data(); map[String(data.matchId)] = data; });
      setUserPredsMap(map);
    }, (err) => console.warn('[Home] User preds error:', err));
    return () => unsub();
  }, [uid, _today, db]);

  /* ── Live matches ── */
  useEffect(() => {
    const unsub = subscribeToLiveFixtures(({ matches, error }) => {
      if (error) { console.warn('[Home] Live error:', error); setLiveMatches([]); setLoadingLive(false); return; }
      setLiveMatches(matches || []);
      setLoadingLive(false);
    });
    return () => unsub();
  }, []);

  /* ── All today fixtures for carousel ── */
  useEffect(() => {
    const unsub = subscribeToTodayFixtures(({ matches, error }) => {
      if (error) { console.warn('[Home] Today fx error:', error); setAllTodayFixtures([]); return; }
      setAllTodayFixtures(matches || []);
    });
    return () => unsub();
  }, []);

  /* ── Total predictors count ── */
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'user_predictions'), where('matchDate', '==', _today));
    const unsub = onSnapshot(q, (snap) => {
      const uids = new Set();
      snap.docs.forEach(d => { const data = d.data(); if (data.userId) uids.add(data.userId); });
      setTotalPredictorsToday(uids.size);
    }, () => {});
    return () => unsub();
  }, [_today, db]);

  /* ★ NEW ── Zoka Picks from Firestore ── */
  useEffect(() => {
    if (!db) { setZokaPicksLoading(false); return; }
    // Listen to today's zoka picks
    const unsubToday = onSnapshot(doc(db, 'zoka_picks', _today), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (!data.isDraft && data.matches && data.matches.length > 0) {
          setZokaPicks(data.matches);
          setZokaPicksLoading(false);
          return;
        }
      }
      // Fallback: check tomorrow if today has nothing (late night scenario)
      const unsubTomorrow = onSnapshot(doc(db, 'zoka_picks', tomorrowStr()), (snap2) => {
        if (snap2.exists()) {
          const data2 = snap2.data();
          if (!data2.isDraft && data2.matches && data2.matches.length > 0) {
            setZokaPicks(data2.matches);
            setZokaPicksLoading(false);
            return;
          }
        }
        setZokaPicks([]);
        setZokaPicksLoading(false);
      }, () => { setZokaPicks([]); setZokaPicksLoading(false); });
      // Clean up tomorrow listener when today loads
      return () => unsubTomorrow();
    }, () => { setZokaPicks([]); setZokaPicksLoading(false); });

    return () => unsubToday();
  }, [_today, db]);

  /* ── Offline detection ── */
  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  /* ── Computed ── */
  const featVisible = featExpanded ? featuredPreds : featuredPreds.slice(0, FEAT_INITIAL);
  const featHiddenCount = featuredPreds.length - FEAT_INITIAL;

  const livePredCount = featuredPreds.filter(p => p.status !== 'finished').length;
  const resolvedCount = featuredPreds.filter(p => p.status === 'finished').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      {/* ═══ TICKER BAR ═══ */}
      <div className="ticker-bar sh">
        <span className="ticker-dot" />
        <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>ZOKA</span>
        <span style={{ opacity: .4 }}>|</span>
        <span>{liveMatches.length > 0 ? `${liveMatches.length} live now` : 'No live matches'}</span>
        <span style={{ opacity: .4 }}>|</span>
        <span>{featuredPreds.length} featured</span>
        <span style={{ opacity: .4 }}>|</span>
        <span>{totalPredictorsToday} predictors</span>
        <div style={{ flex: 1 }} />
        <LiveClock />
      </div>

      {/* ═══ OFFLINE BANNER ═══ */}
      {offline && (
        <div style={{ padding: '8px 16px', background: 'rgba(239,68,68,.08)', borderBottom: '1px solid rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <WifiOff size={13} style={{ color: '#ef4444' }} />
          <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#ef4444' }}>You&apos;re offline — data may be stale</span>
        </div>
      )}

      {/* ═══ CAROUSEL ═══ */}
      <FixtureCarousel fixtures={allTodayFixtures} loading={allTodayFixtures.length === 0 && !offline} />

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* ── HERO ── */}
        <div className="home-center hero-bg" style={{ paddingTop: 10, paddingBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {greeting.icon}
            <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>{greeting.text}</span>
            <span style={{ fontSize: '.78rem' }}>{greeting.emoji}</span>
          </div>
          <h1 className="hero-center" style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.15, letterSpacing: '-.02em' }}>
            Predict. Compete. <span style={{ color: 'var(--accent)' }}>Win.</span>
          </h1>
          <p className="hero-center" style={{ margin: '0 0 20px', fontSize: '.84rem', color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.5 }}>
            Score exact predictions to climb the leaderboard. Today&apos;s matches are live.
          </p>
          <div className="hero-buttons home-row-center" style={{ gap: 10, display: 'flex' }}>
            {isLoggedIn ? (
              <Link to="/predictions" className="zbtn cta-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 24px', borderRadius: 11, background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: '.88rem', textDecoration: 'none', boxShadow: '0 4px 20px rgba(0,230,118,.2)' }}>
                <Target size={17} /> Predict Now
              </Link>
            ) : (
              <Link to="/login" className="zbtn cta-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 24px', borderRadius: 11, background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: '.88rem', textDecoration: 'none', boxShadow: '0 4px 20px rgba(0,230,118,.2)' }}>
                <LogIn size={17} /> Get Started
              </Link>
            )}
            <Link to="/leaderboard" className="zbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 11, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '.84rem', textDecoration: 'none' }}>
              <Trophy size={16} /> Leaderboard
            </Link>
          </div>
        </div>

        {/* ── STATS GRID ── */}
        <div className="stat-grid h-fade" style={{ marginBottom: 24, animationDelay: '120ms' }}>
          <div className="stat-chip h-stat" style={{ animationDelay: '140ms' }}>
            <div>
              <div className="stat-chip-label">Live</div>
              <div className="stat-chip-val" style={{ color: '#ef4444' }}><AnimNum value={liveMatches.length} delay={200} /></div>
            </div>
            <Radio size={18} style={{ color: 'rgba(239,68,68,.4)' }} />
          </div>
          <div className="stat-chip h-stat" style={{ animationDelay: '200ms' }}>
            <div>
              <div className="stat-chip-label">Open</div>
              <div className="stat-chip-val" style={{ color: 'var(--accent)' }}><AnimNum value={livePredCount} delay={280} /></div>
            </div>
            <Target size={18} style={{ color: 'rgba(0,230,118,.4)' }} />
          </div>
          <div className="stat-chip h-stat" style={{ animationDelay: '260ms' }}>
            <div>
              <div className="stat-chip-label">Results</div>
              <div className="stat-chip-val"><AnimNum value={resolvedCount} delay={360} /></div>
            </div>
            <CheckCircle size={18} style={{ color: 'rgba(255,255,255,.2)' }} />
          </div>
          <div className="stat-chip h-stat" style={{ animationDelay: '320ms' }}>
            <div>
              <div className="stat-chip-label">Predictors</div>
              <div className="stat-chip-val" style={{ color: '#60a5fa' }}><AnimNum value={totalPredictorsToday} delay={440} /></div>
            </div>
            <Users size={18} style={{ color: 'rgba(96,165,250,.4)' }} />
          </div>
        </div>

        {/* ═══★★★ ZOKA PICKS SECTION ═══★★★ */}
        <ZokaPicksSection picks={zokaPicks} loading={zokaPicksLoading} />

        {/* ═══★★★ FEATURED PREDICTIONS ═══★★★ */}
        <div className="h-section h-fade" style={{ marginBottom: 24, animationDelay: '180ms' }}>
          <div className="sec-head">
            <Zap size={16} style={{ color: 'var(--accent)' }} />
            <h2>Featured Predictions</h2>
            <span className="sec-head-line" />
            <span
  style={{
    fontSize: '.64rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    background: 'rgba(255,255,255,.03)',
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
  }}
>
  {featuredPreds.length}
            </span>
          </div>

          {loadingFeatured ? (
            <div>
              {Array.from({ length: 4 }).map((_, i) => <SkelFeatured key={i} />)}
            </div>
          ) : featuredPreds.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--bg-surface)' }}>
              <CalendarDays size={28} style={{ color: 'var(--text-muted)', marginBottom: 8, opacity: .5 }} />
              <p style={{ margin: 0, fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>No featured predictions yet</p>
              <p style={{ margin: '4px 0 0', fontSize: '.7rem', color: 'var(--text-muted)', opacity: .6 }}>Check back soon</p>
            </div>
          ) : (
            <>
              {featVisible.map((pred, i) => (
                <FeaturedRow
                  key={pred.id}
                  pred={pred}
                  userPred={userPredsMap[String(pred.matchId)]}
                  index={i}
                  isLoggedIn={isLoggedIn}
                />
              ))}

              {/* ★ Toggle button for featured predictions */}
              {featHiddenCount > 0 && (
                <button
                  className={`toggle-more-btn ${featExpanded ? 'expanded' : ''}`}
                  onClick={() => setFeatExpanded(prev => !prev)}
                >
                  {featExpanded ? (
                    <>Show less <ChevronDown size={13} /></>
                  ) : (
                    <>Show {featHiddenCount} more <ChevronDown size={13} /></>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── LIVE MATCHES STRIP ── */}
        {liveMatches.length > 0 && (
          <div className="h-section h-fade" style={{ marginBottom: 24, animationDelay: '220ms' }}>
            <div className="sec-head">
              <span className="live-dot" style={{ width: 7, height: 7 }} />
              <h2 style={{ color: '#ef4444' }}>Live Now</h2>
              <span className="sec-head-line" />
              <span style={{ fontSize: '.64rem', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,.08)', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,.15)' }}>
                {liveMatches.length}
              </span>
            </div>
            <div className="live-strip sh">
              {liveMatches.map((m, i) => <LiveMini key={m.id || i} match={m} index={i} />)}
            </div>
          </div>
        )}

        {/* ── TOP USER ── */}
        <TopUserCard user={topUser} loading={topUserLoading} />

        {/* ── EXPLORE ── */}
        <div className="h-section h-fade" style={{ marginBottom: 24, animationDelay: '260ms' }}>
          <div className="sec-head">
            <Compass size={16} style={{ color: 'var(--text-muted)' }} />
            <h2>Explore</h2>
            <span className="sec-head-line" />
          </div>
          <div className="explore-grid">
            <ExploreCard to="/fixtures" icon={<Radio size={20} />} title="All Fixtures" desc="Browse today's full schedule" color="#60a5fa" delay={300} badge={allTodayFixtures.length > 0 ? `${allTodayFixtures.length}` : null} />
            <ExploreCard to="/predictions" icon={<Target size={20} />} title="My Predictions" desc="View & manage your picks" color="var(--accent)" delay={360} />
            <ExploreCard to="/leaderboard" icon={<Trophy size={20} />} title="Leaderboard" desc="See who's topping the charts" color="var(--gold)" delay={420} glow />
            <ExploreCard to="/profile" icon={<Users size={20} />} title="Profile" desc="Your stats & history" color="#a78bfa" delay={480} />
            <ExploreCard to="/how-to-play" icon={<Info size={20} />} title="How to Play" desc="Scoring rules & tips" color="#f97316" delay={540} />
            <ExploreCard to="/about" icon={<Star size={20} />} title="About Zoka" desc="Our mission & team" color="#ec4899" delay={600} />
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ textAlign: 'center', paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
            <Zap size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '.04em' }}>ZOKA</span>
          </div>
          <p style={{ margin: 0, fontSize: '.6rem', color: 'var(--text-muted)', opacity: .5 }}>Predict smarter. Win bigger.</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMPASS ICON (inline SVG since not in lucide)
   ═══════════════════════════════════════════════════════════════ */
function Compass(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" opacity=".15"/>
    </svg>
  );
}