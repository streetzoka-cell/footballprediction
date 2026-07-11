// FILE: src/pages/Home.jsx — v2 polished (cleaned for useMatchData v2)
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Zap, Users, Target,
  Trophy, CalendarDays, Flame, ChevronRight, ChevronDown,
  WifiOff, LogIn, Star, CheckCircle, Clock,
  Loader, Lock, Play, Radio, Crown, Sparkles,
  Activity, Medal, BarChart3, CircleDot, ArrowUpRight,
  Sun, Moon, CloudSun, UsersRound, Timer, Gauge, Eye,
  Info, Pause, PlayCircle, XCircle, TrendingUp as TrendIcon
} from 'lucide-react';

import {
  fetchFixtures,
  subscribeToTodayFixtures,
} from '../utils/api';
import { useAuth } from '../context/AuthContext';
import {
  useActivePredictions,
  useAllUserPredictions,
  useMyPredictions,
  usePredictionResults,
  useZokaPicks,
  todayStr,
} from '../hooks/useMatchData';
import { db } from '../utils/firebase';
import { collection, query, limit, getDocs } from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
const Sunset = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>
  </svg>
);

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return { text: 'Night owl?', icon: <Moon size={18} />, emoji: '🦉' };
  if (h < 12) return { text: 'Good morning', icon: <Sun size={18} />, emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', icon: <CloudSun size={18} />, emoji: '🌤️' };
  if (h < 21) return { text: 'Good evening', icon: <Sunset size={18} />, emoji: '🌅' };
  return { text: 'Night owl?', icon: <Moon size={18} />, emoji: '🦉' };
};

/* ═══════════════════════════════════════════════════════════════
   STATUS ESTIMATOR
   ═══════════════════════════════════════════════════════════════ */
const LIVE_SET = new Set(['1H', '2H', 'ET', 'BT', 'P', '1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'OT']);
const HT_SET = new Set(['HT', 'BT']);
const FINISHED_SET = new Set(['FT', 'AET', 'PEN', 'finished', 'PST']);

function estimateMatchStatus(fix) {
  if (fix.isLive || LIVE_SET.has(fix.status)) return 'live';
  if (fix.isFinished || FINISHED_SET.has(fix.status)) return 'ft';
  if (HT_SET.has(fix.status)) return 'ht';
  if (fix.kickoff && fix.kickoff !== '--:--' && fix.kickoff !== 'TBD') {
    const parts = fix.kickoff.split(':');
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(m)) {
        const now = new Date();
        const kickoffTime = new Date();
        kickoffTime.setHours(h, m, 0, 0);
        if ((now - kickoffTime) / 60000 > 110) return 'ft-estimated';
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
      setDisplay(Math.round((1 - Math.pow(1 - progress, 3)) * target));
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
    const tick = () => setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!time) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1.5px solid var(--border)', fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 800, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', letterSpacing: '.03em', flexShrink: 0 }}>
      <Timer size={13} style={{ opacity: .6 }} />{time}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ZOKA RESULT BADGE
   ═══════════════════════════════════════════════════════════════ */
function ZokaResultBadge({ pick }) {
  if (!pick.adminPick || pick.status !== 'finished') return null;
  const h = pick.adminPick.home, a = pick.adminPick.away;
  const ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return (
    <span className="zoka-badge-pending">PENDING</span>
  );
  if (h === ph && a === pa) return (
    <span className="zoka-badge-exact"><CheckCircle size={12} /> EXACT</span>
  );
  const pR = h > a ? 'H' : h < a ? 'A' : 'D';
  const aR = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  if (pR === aR) return (
    <span className="zoka-badge-result"><TrendIcon size={12} /> RESULT</span>
  );
  return (
    <span className="zoka-badge-miss"><XCircle size={12} /> MISS</span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('home-v2')) return;
  const s = document.createElement('style');
  s.id = 'home-v2';
  s.textContent = `
:root{--bg-deep:#0a0a0b;--bg-surface:#0f0f11;--bg-card:#141418;--border:rgba(255,255,255,.07);--text-primary:#f0f0f0;--text-muted:#888;--accent:#00e676;--gold:#f5c542;--font-display:'Inter','SF Pro Display',system-ui,sans-serif}

@keyframes zFadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
@keyframes zFadeIn{from{opacity:0}to{opacity:1}}
@keyframes zScale{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}
@keyframes zGlow{0%,100%{box-shadow:0 0 0 rgba(0,230,118,0)}50%{box-shadow:0 0 28px rgba(0,230,118,.2)}}
@keyframes zFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes zPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.6)}}
@keyframes zSlide{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
@keyframes zShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes hCtaPulse{0%,100%{box-shadow:0 6px 24px rgba(0,230,118,.18)}50%{box-shadow:0 6px 36px rgba(0,230,118,.35)}}
@keyframes crownFloat{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-3px) rotate(2deg)}75%{transform:translateY(-1px) rotate(-1deg)}}
@keyframes progressGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes carouselScroll{0%{transform:translateX(0)}100%{transform:translateX(calc(-50% - var(--cg,10px)/2))}}
@keyframes carouselCardIn{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes carouselShine{0%{left:-100%}100%{left:200%}}
@keyframes carouselDotBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}
@keyframes scoreGlow{0%,100%{text-shadow:0 0 4px rgba(239,68,68,.15)}50%{text-shadow:0 0 14px rgba(239,68,68,.4)}}
@keyframes zokaRowIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}

.z-fade-up{animation:zFadeUp .55s cubic-bezier(.22,1,.36,1) both;will-change:transform,opacity}
.z-fade-in{animation:zFadeIn .4s ease-out both}
.z-scale{animation:zScale .45s cubic-bezier(.22,1,.36,1) both;will-change:transform,opacity}
.z-float{animation:zFloat 3.5s ease-in-out infinite}
.z-glow{animation:zGlow 3s ease-in-out infinite}
.z-slide{animation:zSlide .5s cubic-bezier(.22,1,.36,1) both}
.h-fade{animation:zFadeUp .5s cubic-bezier(.22,1,.36,1) both}
.h-pop{animation:zScale .4s cubic-bezier(.22,1,.36,1) both}
.h-enter{animation:zFadeUp .5s cubic-bezier(.22,1,.36,1) both}
.h-stat{animation:zScale .4s cubic-bezier(.22,1,.36,1) both}
.h-shimmer{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:zShimmer 1.4s ease-in-out infinite;border-radius:10px}
.score-glow{animation:zGlow 2.5s ease-in-out infinite}
.crown-float{animation:crownFloat 3s ease-in-out infinite}

.ripple-effect{position:relative;overflow:hidden}
.ripple-effect::after{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,.12) 0%,transparent 70%);opacity:0;transition:opacity .3s}
.ripple-effect:active::after{opacity:1}

.ticker-bar{display:flex;align-items:center;gap:10px;padding:10px 16px;font-size:.85rem;font-weight:700;color:var(--text-muted);background:rgba(255,255,255,.02);border-bottom:1.5px solid var(--border);overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.ticker-bar::-webkit-scrollbar{display:none}
.ticker-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0;box-shadow:0 0 6px rgba(0,230,118,.4)}

.hero-bg{background:linear-gradient(180deg,rgba(0,230,118,.03) 0%,transparent 100%);overflow:hidden}
.hero-center{display:flex;flex-direction:column;align-items:center;text-align:center;width:100%;max-width:100%;overflow:hidden}

.stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;width:100%;max-width:680px;margin:0 auto}
.stat-chip{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:14px;width:100%;min-width:0;transition:all .25s cubic-bezier(.22,1,.36,1);overflow:hidden}
.stat-chip:hover{border-color:rgba(255,255,255,.12);transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.08)}
.stat-chip-label{font-size:.7rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;line-height:1;margin-bottom:2px}
.stat-chip-val{font-size:1.1rem;font-weight:900;font-family:var(--font-display);color:var(--text-primary);line-height:1}

.h-section{display:flex;flex-direction:column;width:100%;overflow:hidden}
.sec-head{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;overflow:hidden}
.sec-head h2{margin:0;font-size:1.1rem;font-weight:900;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec-head-line{flex:1;min-width:20px;height:1.5px;background:var(--border);border-radius:1px}

.explore-grid{display:grid;grid-template-columns:1fr;gap:10px}
.explore-card{display:flex;align-items:center;gap:16px;padding:18px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:16px;text-decoration:none;position:relative;overflow:hidden;transition:all .25s cubic-bezier(.22,1,.36,1);width:100%;min-height:68px;min-width:0;-webkit-tap-highlight-color:transparent;outline:none}
.explore-card:hover{border-color:rgba(255,255,255,.14);transform:translateX(4px);box-shadow:0 4px 20px rgba(0,0,0,.1)}
.explore-card:active{transform:scale(.98)}
.explore-card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

.feat-row{display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:14px;margin-bottom:8px;transition:all .2s cubic-bezier(.22,1,.36,1);overflow:hidden;min-width:0}
.feat-row:hover{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.02);transform:translateX(2px)}

.live-strip{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:rgba(239,68,68,.25) transparent}
.live-strip::-webkit-scrollbar{height:4px}
.live-strip::-webkit-scrollbar-track{background:transparent}
.live-strip::-webkit-scrollbar-thumb{background:rgba(239,68,68,.25);border-radius:4px}
.live-match-mini{min-width:200px;max-width:260px;flex-shrink:0;padding:14px;background:var(--bg-card);border:1.5px solid rgba(239,68,68,.15);border-radius:14px;scroll-snap-align:start;transition:border-color .2s,transform .2s;overflow:hidden}
.live-match-mini:hover{border-color:rgba(239,68,68,.3);transform:translateY(-1px)}
.live-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block;animation:zPulse 1.2s infinite;box-shadow:0 0 6px rgba(239,68,68,.5)}

.gold-card{display:flex;flex-direction:column;padding:20px;background:linear-gradient(135deg,rgba(245,197,66,.04) 0%,rgba(245,197,66,.01) 100%);border:1.5px solid rgba(245,197,66,.15);border-radius:16px;width:100%;overflow:hidden}

.progress-track{height:5px;border-radius:3px;background:rgba(255,255,255,.04);overflow:hidden;width:100%}
.progress-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--accent),#69f0ae);transform-origin:left;animation:progressGrow .8s cubic-bezier(.22,1,.36,1) both;animation-delay:.3s}

.zbtn{transition:all .25s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;position:relative;overflow:hidden}
.zbtn:hover{transform:translateY(-2px)}
.zbtn:active{transform:translateY(0) scale(.97)}
.zbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cta-primary{animation:hCtaPulse 3s ease-in-out infinite}

.zoka-section{background:linear-gradient(135deg,rgba(245,197,66,.04) 0%,transparent 60%);border:1.5px solid rgba(245,197,66,.12);border-radius:16px;padding:18px;margin-bottom:18px;overflow:hidden}
.zoka-header{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;overflow:hidden}
.zoka-header-icon{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,rgba(245,197,66,.15),rgba(245,197,66,.05));border:1.5px solid rgba(245,197,66,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.zoka-row{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;background:linear-gradient(90deg,rgba(245,197,66,.04) 0%,rgba(245,197,66,.01) 100%);border:1px solid rgba(245,197,66,.12);margin-bottom:8px;animation:zokaRowIn .4s cubic-bezier(.22,1,.36,1) both;transition:all .2s cubic-bezier(.22,1,.36,1);overflow:hidden;min-width:0}
.zoka-row:hover{border-color:rgba(245,197,66,.22);background:linear-gradient(90deg,rgba(245,197,66,.06) 0%,rgba(245,197,66,.02) 100%);transform:translateX(2px)}
.zoka-predicted-score{font-size:.95rem;font-weight:900;font-family:var(--font-display);color:var(--gold);background:rgba(245,197,66,.08);padding:5px 14px;border-radius:10px;border:1.5px solid rgba(245,197,66,.2);font-variant-numeric:tabular-nums;flex-shrink:0;min-width:56px;text-align:center}
.zoka-actual-score{font-size:.85rem;font-weight:800;font-family:var(--font-display);color:var(--text-primary);font-variant-numeric:tabular-nums;flex-shrink:0;min-width:44px;text-align:center}
.zoka-team{flex:1;font-size:.85rem;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:8px;min-width:0}
.zoka-team img{width:20px;height:20px;border-radius:5px;object-fit:contain;flex-shrink:0}
.zoka-team.away{justify-content:flex-end;text-align:right}
.zoka-kickoff{font-size:.73rem;font-weight:800;color:var(--text-muted);font-family:var(--font-display);flex-shrink:0;width:40px;text-align:center}
.zoka-result-col{width:100%;flex-shrink:0;display:flex;justify-content:flex-start;margin-top:4px}
.zoka-badge-pending{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;font-size:.78rem;font-weight:900;background:rgba(255,255,255,.04);color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em}
.zoka-badge-exact{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;font-size:.78rem;font-weight:900;background:rgba(0,230,118,.12);color:var(--accent);text-transform:uppercase;letter-spacing:.04em;border:1.5px solid rgba(0,230,118,.25)}
.zoka-badge-result{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;font-size:.78rem;font-weight:900;background:rgba(245,197,66,.1);color:var(--gold);text-transform:uppercase;letter-spacing:.04em;border:1.5px solid rgba(245,197,66,.2)}
.zoka-badge-miss{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;font-size:.78rem;font-weight:900;background:rgba(239,68,68,.08);color:#ef4444;text-transform:uppercase;letter-spacing:.04em;border:1.5px solid rgba(239,68,68,.15)}

.toggle-more-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 18px;margin-top:10px;border-radius:12px;font-size:.85rem;font-weight:800;background:rgba(255,255,255,.02);border:1.5px dashed var(--border);color:var(--text-muted);cursor:pointer;transition:all .25s cubic-bezier(.22,1,.36,1);min-height:48px;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.toggle-more-btn:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:var(--text-primary)}
.toggle-more-btn:active{transform:scale(.98)}
.toggle-more-btn svg{transition:transform .3s cubic-bezier(.22,1,.36,1)}
.toggle-more-btn.expanded svg{transform:rotate(180deg)}
.toggle-hidden-items{overflow:hidden;transition:max-height .4s cubic-bezier(.22,1,.36,1),opacity .3s ease}
.toggle-hidden-items.collapsed{max-height:0;opacity:0;pointer-events:none}
.toggle-hidden-items.expanded{max-height:3000px;opacity:1}

.carousel-wrapper{position:relative;overflow:hidden;margin:0 -16px;padding:0 16px}
.carousel-track{display:flex;gap:var(--cg,12px);width:max-content;animation:carouselScroll var(--cd,40s) linear infinite;will-change:transform;padding:6px 0}
.carousel-track.paused{animation-play-state:paused}
.carousel-fade{position:absolute;top:0;bottom:0;width:48px;z-index:3;pointer-events:none}
.carousel-fade-left{left:16px;background:linear-gradient(to right,var(--bg-deep) 0%,transparent 100%)}
.carousel-fade-right{right:16px;background:linear-gradient(to left,var(--bg-deep) 0%,transparent 100%)}
.carousel-card{flex-shrink:0;width:190px;padding:16px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:14px;position:relative;overflow:hidden;transition:all .28s cubic-bezier(.22,1,.36,1);cursor:pointer;animation:carouselCardIn .5s cubic-bezier(.22,1,.36,1) both;-webkit-tap-highlight-color:transparent;text-decoration:none;display:block}
.carousel-card:hover{border-color:rgba(255,255,255,.16);transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.25)}
.carousel-card:active{transform:translateY(-1px) scale(.98)}
.carousel-card::after{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.03),transparent);pointer-events:none}
.carousel-card:hover::after{animation:carouselShine .6s ease-out}
.carousel-league{display:flex;align-items:center;gap:6px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.04);overflow:hidden}
.carousel-league img{width:15px;height:15px;border-radius:3px;object-fit:contain;flex-shrink:0}
.carousel-league span{font-size:.7rem;font-weight:800;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase;letter-spacing:.04em}
.carousel-team-row{display:flex;align-items:center;gap:8px;padding:4px 0;overflow:hidden}
.carousel-team-row.away{flex-direction:row-reverse;text-align:right}
.carousel-team-row img{width:24px;height:24px;object-fit:contain;flex-shrink:0;border-radius:5px}
.carousel-team-row span{font-size:.85rem;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;line-height:1.2}
.carousel-time-divider{display:flex;align-items:center;justify-content:center;padding:6px 0;gap:8px}
.carousel-time-divider .line{flex:1;height:1px;background:rgba(255,255,255,.06)}
.carousel-time-badge{font-size:.76rem;font-weight:900;font-family:var(--font-display);color:var(--accent);background:rgba(0,230,118,.08);padding:4px 12px;border-radius:8px;letter-spacing:.03em;flex-shrink:0;white-space:nowrap}
.carousel-pause-indicator{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:6px;padding:6px 14px;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);border-radius:20px;animation:zFadeIn .25s ease-out both;pointer-events:none}
.carousel-pause-indicator span{font-size:.68rem;font-weight:800;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.06em}
.carousel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;overflow:hidden}
.carousel-header-left{display:flex;align-items:center;gap:10px;overflow:hidden}
.carousel-header-dots{display:flex;gap:4px;align-items:center;flex-shrink:0}
.carousel-header-dots span{width:5px;height:5px;border-radius:50%;background:var(--accent)}
.carousel-header-dots span:nth-child(1){animation:carouselDotBounce 1.2s ease-in-out infinite}
.carousel-header-dots span:nth-child(2){animation:carouselDotBounce 1.2s ease-in-out infinite .15s}
.carousel-header-dots span:nth-child(3){animation:carouselDotBounce 1.2s ease-in-out infinite .3s}

.carousel-card.is-live{border-color:rgba(239,68,68,.22);background:linear-gradient(180deg,rgba(239,68,68,.04) 0%,var(--bg-card) 50%)}
.carousel-card.is-live:hover{border-color:rgba(239,68,68,.35);box-shadow:0 8px 28px rgba(239,68,68,.12)}
.carousel-live-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:6px;background:rgba(239,68,68,.1);font-size:.7rem;font-weight:900;color:#ef4444;letter-spacing:.04em;text-transform:uppercase}
.carousel-live-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:zPulse 1.2s ease-in-out infinite}
.carousel-score-center{display:flex;align-items:center;justify-content:center;gap:8px;font-family:var(--font-display)}
.carousel-score-num{font-size:1.15rem;font-weight:900;color:#ef4444;line-height:1;min-width:20px;text-align:center;animation:scoreGlow 2s ease-in-out infinite}
.carousel-score-sep{font-size:.85rem;font-weight:700;color:rgba(239,68,68,.35)}
.carousel-team-score{font-size:.88rem;font-weight:900;font-family:var(--font-display);color:#ef4444;flex-shrink:0;margin-left:auto}
.carousel-team-row.away .carousel-team-score{margin-left:0;margin-right:auto}
.carousel-progress{height:3px;border-radius:2px;background:rgba(239,68,68,.06);overflow:hidden;margin-top:12px}
.carousel-progress-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,#ef4444,#f97316);transition:width 1s linear}
.carousel-minute{font-size:.68rem;font-weight:800;color:rgba(239,68,68,.7);font-family:var(--font-display)}

.carousel-card.is-ft-est{border-color:rgba(0,230,118,.18);background:linear-gradient(180deg,rgba(0,230,118,.03) 0%,var(--bg-card) 60%)}
.carousel-ft-est-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:6px;background:rgba(0,230,118,.08);font-size:.7rem;font-weight:900;color:var(--accent);letter-spacing:.04em;text-transform:uppercase}
.carousel-ft-score-num{font-size:1.15rem;font-weight:900;color:var(--text-primary);line-height:1;min-width:20px;text-align:center;font-family:var(--font-display);font-variant-numeric:tabular-nums}
.carousel-ft-score-sep{font-size:.85rem;font-weight:700;color:rgba(255,255,255,.18)}

.carousel-card.is-ht{border-color:rgba(249,115,22,.18);background:linear-gradient(180deg,rgba(249,115,22,.04) 0%,var(--bg-card) 50%)}
.carousel-ht-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:6px;background:rgba(249,115,22,.1);font-size:.7rem;font-weight:900;color:#f97316;letter-spacing:.04em;text-transform:uppercase}

@media(min-width:480px){
  .explore-grid{grid-template-columns:repeat(2,1fr)}
  .carousel-card{width:210px}
}
@media(min-width:640px){
  .explore-grid{grid-template-columns:repeat(2,1fr);gap:12px}
  .stat-grid{grid-template-columns:repeat(4,1fr);gap:12px}
  .live-match-mini{min-width:220px}
  .carousel-card{width:230px;padding:18px}
  .carousel-team-row span{font-size:.92rem}
}
@media(min-width:768px){
  .explore-grid{grid-template-columns:repeat(3,1fr)}
  .carousel-card{width:240px}
}
@media(max-width:639px){
  .hero-buttons{flex-direction:column;width:100%;max-width:340px}
  .hero-buttons a,.hero-buttons .zbtn-wrap{width:100%;justify-content:center;min-height:52px}
  .stat-grid{grid-template-columns:repeat(2,1fr);gap:10px}
  .stat-chip{padding:14px 12px;gap:8px}
  .sec-head-line{max-width:60px}
  .carousel-fade{width:36px}
  .zoka-row{flex-wrap:wrap;gap:8px;padding:12px}
  .zoka-result-col{width:100%;justify-content:flex-start;margin-top:4px}
  .feat-row{flex-wrap:wrap;gap:10px;padding:12px 14px}
}
@media(max-width:380px){
  .stat-grid{gap:8px}
  .stat-chip{padding:12px 10px;gap:6px}
  .stat-chip-label{font-size:.68rem}
  .stat-chip-val{font-size:.95rem}
  .carousel-card{width:175px;padding:14px}
  .zoka-team{font-size:.8rem}
  .zoka-predicted-score{font-size:.85rem;padding:4px 10px}
}
@media(prefers-reduced-motion:reduce){
  .carousel-track,.carousel-card,.carousel-header-dots span{animation:none!important}
  .toggle-hidden-items{transition:none!important}
  *{animation-duration:.01ms!important}
}
`;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   SKELETONS
   ═══════════════════════════════════════════════════════════════ */
const SkelFeatured = () => <div className="h-shimmer" style={{ height: 72, borderRadius: 14, marginBottom: 8 }} />;
const SkelLive = () => <div className="h-shimmer" style={{ minWidth: 190, height: 90, borderRadius: 14, flexShrink: 0 }} />;
const SkelCarousel = () => <div className="h-shimmer" style={{ width: 195, height: 150, borderRadius: 14, flexShrink: 0 }} />;
const SkelZoka = () => <div className="h-shimmer" style={{ height: 62, borderRadius: 12, marginBottom: 8 }} />;

/* ═══════════════════════════════════════════════════════════════
   LIVE MINI CARD
   ═══════════════════════════════════════════════════════════════ */
const LiveMini = ({ match, index }) => {
  const minute = match.elapsed || match.minute || '';
  const minuteStr = minute ? `${minute}'` : '';
  return (
    <div className="live-match-mini h-pop" style={{ animationDelay: `${index * 80}ms` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingLeft: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, overflow: 'hidden' }}>
          {match.league?.logo && <img src={match.league.logo} alt="" style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'contain', flexShrink: 0 }} />}
          <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.league?.name}</span>
        </div>
        {minuteStr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(239,68,68,.1)', padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
            <span className="live-dot" style={{ width: 5, height: 5 }} />
            <span style={{ fontSize: '.7rem', fontWeight: 900, color: '#ef4444', fontFamily: 'var(--font-display)' }}>{minuteStr}</span>
          </div>
        )}
      </div>
      <div style={{ paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {match.homeTeam?.logo && <img src={match.homeTeam.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0, borderRadius: 4 }} />}
          <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.homeTeam?.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', flexShrink: 0 }}>
          <span style={{ fontSize: '.9rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{match.homeScore ?? '-'}</span>
        </div>
      </div>
      <div style={{ paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 0, marginTop: 2, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {match.awayTeam?.logo && <img src={match.awayTeam.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0, borderRadius: 4 }} />}
          <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.awayTeam?.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', flexShrink: 0 }}>
          <span style={{ fontSize: '.9rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{match.awayScore ?? '-'}</span>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   FIXTURE CAROUSEL
   ═══════════════════════════════════════════════════════════════ */
function FixtureCarousel({ fixtures, loading }) {
  const trackRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const resumeTimer = useRef(null);
  const duration = useMemo(() => Math.max(20, fixtures.length * 4.2), [fixtures.length]);
  const items = useMemo(() => fixtures.length === 0 ? [] : [...fixtures, ...fixtures], [fixtures]);
  const liveCount = useMemo(() => fixtures.filter(m => { const s = estimateMatchStatus(m); return s === 'live' || s === 'ht'; }).length, [fixtures]);

  const handleMouseEnter = useCallback(() => { if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; } setIsPaused(true); }, []);
  const handleMouseLeave = useCallback(() => { setIsPaused(false); }, []);
  const handleTouchStart = useCallback(() => { if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; } setIsPaused(true); }, []);
  const handleTouchEnd = useCallback(() => { resumeTimer.current = setTimeout(() => { setIsPaused(false); resumeTimer.current = null; }, 3000); }, []);
  useEffect(() => { return () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }; }, []);

  if (loading) {
    return (
      <div style={{ background: 'linear-gradient(180deg,rgba(0,230,118,.03) 0%,transparent 100%)', borderBottom: '1.5px solid var(--border)', padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div className="h-shimmer" style={{ width: 110, height: 16, borderRadius: 5 }} />
          <div className="h-shimmer" style={{ width: 70, height: 16, borderRadius: 5 }} />
        </div>
        <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>{Array.from({ length: 5 }).map((_, i) => <SkelCarousel key={i} />)}</div>
      </div>
    );
  }
  if (fixtures.length < 2) return null;

  return (
    <div className="z-fade-up" style={{ background: 'linear-gradient(180deg,rgba(0,230,118,.03) 0%,transparent 100%)', borderBottom: '1.5px solid var(--border)', padding: '12px 0 16px', overflow: 'hidden' }}>
      <div className="carousel-header" style={{ padding: '0 16px' }}>
        <div className="carousel-header-left">
          <div className="carousel-header-dots"><span /><span /><span /></div>
          <span style={{ fontSize: '.9rem', fontWeight: 900, color: 'var(--accent)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {fixtures.length} Matches{liveCount > 0 && <span style={{ color: '#ef4444', marginLeft: 8 }}>{liveCount} LIVE</span>}
          </span>
        </div>
        <Link to="/fixtures" className="zbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, background: 'rgba(0,230,118,.06)', border: '1.5px solid rgba(0,230,118,.18)', color: 'var(--accent)', fontWeight: 700, fontSize: '.8rem', textDecoration: 'none', flexShrink: 0 }}>
          All <ChevronRight size={12} />
        </Link>
      </div>
      <div className="carousel-wrapper">
        <div className="carousel-fade carousel-fade-left" />
        <div className="carousel-fade carousel-fade-right" />
        <div ref={trackRef} className={`carousel-track ${isPaused ? 'paused' : ''}`} style={{ '--cd': `${duration}s`, '--cg': '12px' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {items.map((fix, i) => {
            const homeLogo = fix.homeLogo || fix.homeTeam?.logo;
            const awayLogo = fix.awayLogo || fix.awayTeam?.logo;
            const leagueLogo = fix.league?.logo || fix.league?.emblem;
            const realIndex = i % fixtures.length;
            const status = estimateMatchStatus(fix);
            const isLive = status === 'live';
            const isHT = status === 'ht';
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
                {isLive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span className="carousel-live-badge"><span className="carousel-live-dot" /> LIVE</span>
                    {minute > 0 && <span className="carousel-minute">{minute}&apos;</span>}
                  </div>
                )}
                {isHT && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><span className="carousel-ht-badge"><Pause size={9} /> HT</span></div>}
                {isFtEstimated && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><span className="carousel-ft-est-badge"><CheckCircle size={9} /> FT</span></div>}
                <div className="carousel-team-row">
                  {homeLogo && <img src={homeLogo} alt="" loading="lazy" />}
                  <span>{fix.homeTeam?.shortName || fix.homeTeam?.name || 'TBD'}</span>
                  {isLive && <span className="carousel-team-score">{fix.homeScore ?? 0}</span>}
                </div>
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
                      <Clock size={10} style={{ marginRight: 4, verticalAlign: 'middle', opacity: .7 }} />
                      {fix.kickoff || '--:--'}
                    </span>
                  )}
                  <div className="line" />
                </div>
                <div className="carousel-team-row away">
                  {awayLogo && <img src={awayLogo} alt="" loading="lazy" />}
                  <span>{fix.awayTeam?.shortName || fix.awayTeam?.name || 'TBD'}</span>
                  {isLive && <span className="carousel-team-score">{fix.awayScore ?? 0}</span>}
                </div>
                {isLive && minute > 0 && (
                  <div className="carousel-progress">
                    <div className="carousel-progress-fill" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg,${progressColor},${progressColor}88)` }} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
        {isPaused && (
          <div className="carousel-pause-indicator">
            <PlayCircle size={12} /><span>Auto-scroll paused</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FEATURED ROW
   ═══════════════════════════════════════════════════════════════ */
const FeaturedRow = ({ pred, userPred, userResult, index, isLoggedIn }) => {
  const isFinished = pred.status === 'finished';
  const isPredicted = !!userPred;
  const isResolved = !!userResult && userResult.resultType && userResult.resultType !== 'pending';
  const isExact = isResolved && userResult.resultType === 'exact';
  const isHit = isResolved && userResult.resultType === 'result';

  let leftBorder = 'var(--border)';
  if (isExact) leftBorder = 'var(--accent)';
  else if (isHit) leftBorder = 'var(--gold)';
  else if (isResolved && !isExact && !isHit) leftBorder = '#ef4444';
  else if (isFinished) leftBorder = 'rgba(0,230,118,.3)';
  else if (isPredicted) leftBorder = '#60a5fa';

  return (
    <div className="feat-row h-enter" style={{ borderLeft: `4px solid ${leftBorder}`, animationDelay: `${index * 35}ms`, opacity: isFinished && !isResolved ? .5 : 1 }}>
      <div style={{ width: 44, textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{pred.kickoff || 'TBD'}</div>
      </div>
      <div style={{ width: '1.5px', height: 28, background: 'var(--border)', borderRadius: 1, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          {pred.homeTeam?.logo && <img src={pred.homeTeam.logo} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />}
          <span style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{pred.homeTeam?.name || 'Home'}</span>
          {isFinished && <span style={{ fontSize: '.92rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', flexShrink: 0 }}>{pred.homeScore}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          {pred.awayTeam?.logo && <img src={pred.awayTeam.logo} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />}
          <span style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{pred.awayTeam?.name || 'Away'}</span>
          {isFinished && <span style={{ fontSize: '.92rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', flexShrink: 0 }}>{pred.awayScore}</span>}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        {isResolved ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ padding: '5px 12px', borderRadius: 8, fontSize: '.76rem', fontWeight: 900, background: isExact ? 'rgba(0,230,118,.12)' : isHit ? 'rgba(245,197,66,.1)' : 'rgba(239,68,68,.08)', color: isExact ? 'var(--accent)' : isHit ? 'var(--gold)' : '#ef4444', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {isExact ? '+10' : isHit ? '+3' : 'Miss'}
            </span>
            {isPredicted && <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>You: {userPred.homeScore}–{userPred.awayScore}</span>}
          </div>
        ) : isFinished ? (
          <span style={{ padding: '5px 12px', borderRadius: 8, fontSize: '.76rem', fontWeight: 800, background: 'rgba(255,255,255,.04)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>FT</span>
        ) : isPredicted ? (
          <Link to="/predictions" className="zbtn" style={{ padding: '8px 14px', borderRadius: 10, fontSize: '.8rem', fontWeight: 800, textDecoration: 'none', background: 'rgba(59,130,246,.08)', border: '1.5px solid rgba(59,130,246,.18)', color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 38, whiteSpace: 'nowrap' }}>
            <CheckCircle size={12} /> Locked
          </Link>
        ) : isLoggedIn ? (
          <Link to="/predictions" className="zbtn" style={{ padding: '8px 14px', borderRadius: 10, fontSize: '.8rem', fontWeight: 800, textDecoration: 'none', background: 'rgba(0,230,118,.08)', border: '1.5px solid rgba(0,230,118,.15)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 38, whiteSpace: 'nowrap' }}>
            <Target size={12} /> Predict
          </Link>
        ) : (
          <Link to="/login" className="zbtn" style={{ padding: '8px 14px', borderRadius: 10, fontSize: '.8rem', fontWeight: 800, textDecoration: 'none', background: 'rgba(255,255,255,.03)', border: '1.5px solid var(--border)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 38, whiteSpace: 'nowrap' }}>
            <Lock size={12} /> Login
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
  <Link to={to} className={`explore-card h-pop ripple-effect ${glow ? 'score-glow' : ''}`} style={{ animationDelay: `${delay || 0}ms` }}>
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: color, borderRadius: '0 3px 3px 0' }} />
    <div style={{ width: 48, height: 48, borderRadius: 14, background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0, fontSize: '1.3rem' }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
      <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {badge && <span style={{ fontSize: '.65rem', fontWeight: 900, color, background: `${color}18`, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>{badge}</span>}
      </div>
      <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
    </div>
    <ArrowRight size={18} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: .5 }} />
  </Link>
);

/* ═══════════════════════════════════════════════════════════════
   MAIN HOME COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Home() {
  injectStyles();

  const { currentUser, userProfile } = useAuth();
  const isLoggedIn = !!currentUser;
  const uid = currentUser?.uid;

  /* ═══════════════════════════════════════════════════════════
     DATA — External API (unchanged)
     ═══════════════════════════════════════════════════════════ */
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [totalUsers, setTotalUsers] = useState(null);

  /* ═══════════════════════════════════════════════════════════
     DATA — From useMatchData.js (single source of truth)
     ═══════════════════════════════════════════════════════════ */
  const { preds: featured, loading: featuredLoading } = useActivePredictions();
  const { playerCount } = useAllUserPredictions();
  const userPredMap = useMyPredictions(uid);
  const { resultMap } = usePredictionResults(uid);
  const zokaPicks = useZokaPicks();

  /* ── Local UI state ── */
  const [showMoreFeatured, setShowMoreFeatured] = useState(false);
  const [showMoreZoka, setShowMoreZoka] = useState(false);

  /* ── 1. Initial fixture fetch (external API) ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchFixtures(todayStr());
        if (!cancelled && res?.matches?.length > 0) setFixtures(res.matches);
      } catch { if (!cancelled) setError(true); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── 2. Real-time fixture subscription (external API) ── */
  useEffect(() => {
    const unsub = subscribeToTodayFixtures(({ matches }) => {
      if (matches.length > 0) {
        setFixtures(prev =>
          prev.length === 0
            ? matches
            : prev.map(f => {
                const live = matches.find(m => String(m.id) === String(f.id));
                return live
                  ? { ...f, homeScore: live.homeScore ?? f.homeScore, awayScore: live.awayScore ?? f.awayScore, isLive: true, isFinished: false, minute: live.minute ?? f.minute, status: live.status || f.status }
                  : f;
              })
        );
      }
      setLoading(false);
      setError(false);
    });
    return () => unsub();
  }, []);

  /* ── 3. Total user count (not in useMatchData — keep local) ── */
  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), limit(1))).then(snap => {
      if (!snap.empty) { const d = snap.docs[0].data(); setTotalUsers(d.totalUsers || snap.size); }
    }).catch(() => {});
  }, []);

  /* ── Derived state ── */
  const greeting = useMemo(() => getGreeting(), []);
  const liveMatches = useMemo(() => fixtures.filter(f => { const s = estimateMatchStatus(f); return s === 'live' || s === 'ht'; }), [fixtures]);
  const liveCount = liveMatches.length;
  const finishedFeatured = useMemo(() => featured.filter(p => p.status === 'finished'), [featured]);

  const todayPredictions = playerCount;
  const userScored = useMemo(() => featured.filter(p => userPredMap[p.id]).length, [featured, userPredMap]);
  const userExact = useMemo(() => finishedFeatured.filter(p => {
    const r = resultMap[String(p.matchId)];
    return r && r.resultType === 'exact';
  }).length, [finishedFeatured, resultMap]);
  const userHit = useMemo(() => finishedFeatured.filter(p => {
    const r = resultMap[String(p.matchId)];
    return r && r.resultType === 'result';
  }).length, [finishedFeatured, resultMap]);

  const featuredVisible = showMoreFeatured ? featured : featured.slice(0, 4);
  const zokaMatches = zokaPicks?.matches || [];
  const zokaVisible = showMoreZoka ? zokaMatches : zokaMatches.slice(0, 3);

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <WifiOff size={40} style={{ color: '#ef4444', marginBottom: 16 }} />
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Connection lost</div>
          <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>Could not load matches. Check your internet.</div>
          <button onClick={() => window.location.reload()} className="zbtn" style={{ padding: '12px 28px', borderRadius: 12, background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 800, fontSize: '.9rem', border: 'none' }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontFamily: 'var(--font-display)', WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Ticker Bar ── */}
      <div className="ticker-bar z-fade-in">
        <span className="ticker-dot" />
        {liveCount > 0 && (
          <span style={{ color: '#ef4444', fontWeight: 900 }}>
            <span className="live-dot" style={{ width: 5, height: 5, marginRight: 4, verticalAlign: 'middle' }} />
            {liveCount} LIVE
          </span>
        )}
        <span style={{ opacity: .5 }}>·</span>
        <span>{todayPredictions} predictions today</span>
        {totalUsers != null && (
          <>
            <span style={{ opacity: .5 }}>·</span>
            <span>{totalUsers.toLocaleString()} players</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <LiveClock />
      </div>

      {/* ── Fixture Carousel ── */}
      <FixtureCarousel fixtures={fixtures} loading={loading} />

      {/* ── Hero Section ── */}
      <div className="hero-bg" style={{ padding: '32px 16px 28px' }}>
        <div className="hero-center">

          {/* Greeting */}
          <div className="z-fade-up" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            {greeting.icon}
            <span style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              {greeting.text}{userProfile?.displayName ? `, ${userProfile.displayName}` : ''}
            </span>
          </div>

          {/* Heading */}
          <h1 className="z-fade-up" style={{ margin: '0 0 4px', fontSize: 'clamp(1.6rem, 5vw, 2.2rem)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-.02em', animationDelay: '60ms' }}>
            Predict. Compete.{' '}
            <span style={{ background: 'linear-gradient(135deg, var(--accent), #69f0ae)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Win.
            </span>
          </h1>
          <p className="z-fade-up" style={{ margin: '0 0 24px', fontSize: '.92rem', fontWeight: 600, color: 'var(--text-muted)', maxWidth: 420, animationDelay: '120ms' }}>
            Score exact results to climb the daily leaderboard
          </p>

          {/* CTA Buttons */}
          {isLoggedIn ? (
            <div className="hero-buttons z-fade-up" style={{ display: 'flex', gap: 10, marginBottom: 28, animationDelay: '180ms' }}>
              <Link to="/predictions" className="zbtn cta-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 14, background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '.95rem', textDecoration: 'none' }}>
                <Target size={18} /> Predict Now
              </Link>
              <Link to="/leaderboard" className="zbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 24px', borderRadius: 14, background: 'var(--bg-card)', border: '1.5px solid var(--border)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '.95rem', textDecoration: 'none' }}>
                <Trophy size={18} /> Leaderboard
              </Link>
            </div>
          ) : (
            <div className="hero-buttons z-fade-up" style={{ display: 'flex', gap: 10, marginBottom: 28, animationDelay: '180ms' }}>
              <Link to="/login" className="zbtn cta-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 14, background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '.95rem', textDecoration: 'none' }}>
                <LogIn size={18} /> Sign In
              </Link>
              <Link to="/leaderboard" className="zbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 24px', borderRadius: 14, background: 'var(--bg-card)', border: '1.5px solid var(--border)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '.95rem', textDecoration: 'none' }}>
                <Eye size={18} /> View Board
              </Link>
            </div>
          )}

          {/* Live Matches Strip */}
          {liveMatches.length > 0 && (
            <div className="z-fade-up" style={{ width: '100%', maxWidth: 680, marginBottom: 24, animationDelay: '240ms' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Radio size={14} style={{ color: '#ef4444' }} />
                <span style={{ fontSize: '.82rem', fontWeight: 800, color: '#ef4444' }}>LIVE NOW</span>
              </div>
              <div className="live-strip">
                {liveMatches.slice(0, 8).map((m, i) => <LiveMini key={m.id} match={m} index={i} />)}
              </div>
            </div>
          )}

          {/* Stat Grid */}
          <div className="stat-grid z-fade-up" style={{ animationDelay: '300ms' }}>
            <div className="stat-chip h-stat" style={{ animationDelay: '320ms' }}>
              <div>
                <div className="stat-chip-label">Matches</div>
                <div className="stat-chip-val"><AnimNum value={featured.length} /></div>
              </div>
              <CalendarDays size={20} style={{ color: 'var(--text-muted)', opacity: .4 }} />
            </div>
            <div className="stat-chip h-stat" style={{ animationDelay: '360ms' }}>
              <div>
                <div className="stat-chip-label">Predictions</div>
                <div className="stat-chip-val"><AnimNum value={todayPredictions} /></div>
              </div>
              <Users size={20} style={{ color: 'var(--text-muted)', opacity: .4 }} />
            </div>
            {isLoggedIn && (
              <div className="stat-chip h-stat" style={{ animationDelay: '400ms' }}>
                <div>
                  <div className="stat-chip-label">Your Score</div>
                  <div className="stat-chip-val"><AnimNum value={userScored} />/{featured.length}</div>
                </div>
                <Target size={20} style={{ color: '#60a5fa', opacity: .5 }} />
              </div>
            )}
            {isLoggedIn && (
              <div className="stat-chip h-stat" style={{ animationDelay: '440ms' }}>
                <div>
                  <div className="stat-chip-label">Exact</div>
                  <div className="stat-chip-val" style={{ color: userExact > 0 ? 'var(--accent)' : 'var(--text-primary)' }}><AnimNum value={userExact} /></div>
                </div>
                <Sparkles size={20} style={{ color: 'var(--accent)', opacity: userExact > 0 ? .7 : .3 }} />
              </div>
            )}
          </div>

          {/* Progress bar */}
          {isLoggedIn && featured.length > 0 && (
            <div style={{ width: '100%', maxWidth: 680, marginTop: 14 }}>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${(userScored / featured.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Featured Predictions ── */}
      {featured.length > 0 && (
        <div className="h-section" style={{ padding: '24px 16px' }}>
          <div className="sec-head h-fade" style={{ animationDelay: '100ms' }}>
            <Flame size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <h2>Today&apos;s Matches</h2>
            <div className="sec-head-line" />
            <span style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }}>
              {finishedFeatured.length}/{featured.length} done
            </span>
          </div>

          {featuredLoading ? (
            <>
              <SkelFeatured />
              <SkelFeatured />
              <SkelFeatured />
            </>
          ) : (
            <>
              {featuredVisible.map((pred, i) => (
                <FeaturedRow
                  key={pred.id || pred.matchId}
                  pred={pred}
                  userPred={userPredMap[pred.id]}
                  userResult={resultMap[String(pred.matchId)]}
                  index={i}
                  isLoggedIn={isLoggedIn}
                />
              ))}
              {featured.length > 4 && (
                <button
                  className={`toggle-more-btn ${showMoreFeatured ? 'expanded' : ''}`}
                  onClick={() => setShowMoreFeatured(v => !v)}
                >
                  {showMoreFeatured ? 'Show Less' : `Show ${featured.length - 4} More`}
                  <ChevronDown size={16} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Zoka Picks ── */}
      {zokaMatches.length > 0 && (
        <div style={{ padding: '0 16px 24px' }}>
          <div className="zoka-section z-fade-up">
            <div className="zoka-header">
              <div className="zoka-header-icon">
                <Crown size={20} style={{ color: 'var(--gold)' }} className="crown-float" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--gold)', marginBottom: 2 }}>Zoka&apos;s Picks</div>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Expert predictions for today</div>
              </div>
            </div>

            {zokaVisible.map((pick, i) => (
              <div key={pick.matchId || i} className="zoka-row" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="zoka-team">
                  {pick.homeLogo && <img src={pick.homeLogo} alt="" loading="lazy" />}
                  <span>{pick.homeTeam?.name || pick.homeTeam || 'Home'}</span>
                </div>
                <div className="zoka-predicted-score">
                  {pick.adminPick ? `${pick.adminPick.home}-${pick.adminPick.away}` : '--'}
                </div>
                <div className="zoka-team away">
                  {pick.awayLogo && <img src={pick.awayLogo} alt="" loading="lazy" />}
                  <span>{pick.awayTeam?.name || pick.awayTeam || 'Away'}</span>
                </div>
                <div className="zoka-kickoff">{pick.kickoff || '--:--'}</div>
                {pick.status === 'finished' && (
                  <div className="zoka-actual-score">
                    {pick.homeScore ?? '?'}-{pick.awayScore ?? '?'}
                  </div>
                )}
                <div className="zoka-result-col">
                  <ZokaResultBadge pick={pick} />
                </div>
              </div>
            ))}

            {zokaMatches.length > 3 && (
              <button
                className={`toggle-more-btn ${showMoreZoka ? 'expanded' : ''}`}
                onClick={() => setShowMoreZoka(v => !v)}
                style={{ borderColor: 'rgba(245,197,66,.15)' }}
              >
                {showMoreZoka ? 'Show Less' : `Show ${zokaMatches.length - 3} More`}
                <ChevronDown size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Explore Grid ── */}
      <div className="h-section" style={{ padding: '0 16px 32px' }}>
        <div className="sec-head h-fade">
          <Zap size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <h2>Explore</h2>
          <div className="sec-head-line" />
        </div>
        <div className="explore-grid">
          <ExploreCard
            to="/predictions"
            icon={<Target size={22} />}
            title="Predictions"
            desc="Make your picks for today"
            color="#00e676"
            delay={0}
            badge={featured.length > 0 ? `${featured.length} matches` : null}
          />
          <ExploreCard
            to="/leaderboard"
            icon={<Trophy size={22} />}
            title="Leaderboard"
            desc="Daily, weekly & all-time"
            color="#f5c542"
            delay={60}
            glow={liveCount > 0}
            badge={liveCount > 0 ? 'LIVE' : null}
          />
          <ExploreCard
            to="/profile"
            icon={<BarChart3 size={22} />}
            title="My Stats"
            desc="Track your performance"
            color="#60a5fa"
            delay={120}
          />
          {isLoggedIn && (
            <ExploreCard
              to="/profile"
              icon={<Medal size={22} />}
              title="Achievements"
              desc="Badges & milestones"
              color="#a78bfa"
              delay={180}
            />
          )}
        </div>
      </div>

      {/* ── Bottom spacer ── */}
      <div style={{ height: 80 }} />
    </div>
  );
}