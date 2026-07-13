// ═══════════════════════════════════════════════════════════════
// FILE: src/pages/Home.jsx
// v20.0 — COMPLETE — Multi-date featured/zoka + Admin-aligned cards
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Zap, Users, Target,
  Trophy, CalendarDays, Flame, ChevronRight, ChevronDown,
  WifiOff, LogIn, Star, CheckCircle, CheckCircle2, Clock,
  Loader, Lock, Play, Radio, Crown, Sparkles,
  Activity, Medal, BarChart3, CircleDot, ArrowUpRight,
  Sun, Moon, CloudSun, Timer, Gauge, Eye, ChevronUp,
  Info, Pause, PlayCircle, XCircle, TrendingUp as TrendIcon
} from 'lucide-react';
import { fetchFixtures, subscribeToTodayFixtures } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { dataLayer, todayStr } from '../utils/dataLayer';
import { eventBus, EVENT } from '../utils/eventBus';
import { db } from '../utils/firebase';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════ */
const Sunset = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 10V2" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" />
    <path d="m16 6-4 4-4-4" /><path d="M16 18a4 4 0 0 0-8 0" />
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

const dateOffset = (o = 0) => {
  const d = new Date(); d.setDate(d.getDate() + o);
  return d.toISOString().split('T')[0];
};
const dateLabel = (d) => {
  const t = todayStr(), tm = dateOffset(1), ys = dateOffset(-1);
  if (d === t) return 'Today';
  if (d === tm) return 'Tomorrow';
  if (d === ys) return 'Yesterday';
  const dt = new Date(d + 'T12:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[dt.getDay()]} ${d.slice(5)}`;
};

const LIVE_SET = new Set(['1H', '2H', 'ET', 'BT', 'P', 'IN_PLAY']);
const HT_SET = new Set(['HT', 'BT']);
const FINISHED_SET = new Set(['FT', 'AET', 'PEN', 'FINISHED', 'PST']);

function estimateMatchStatus(fix) {
  if (fix.isLive || LIVE_SET.has(fix.status)) return 'live';
  if (fix.isFinished || FINISHED_SET.has(fix.status)) return 'ft';
  if (HT_SET.has(fix.status)) return 'ht';
  if (fix.kickoff && fix.kickoff !== '--:--' && fix.kickoff !== 'TBD') {
    const parts = fix.kickoff.split(':');
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(m)) {
        const now = new Date(), kt = new Date();
        kt.setHours(h, m, 0, 0);
        if ((now - kt) / 60000 > 110) return 'ft-estimated';
      }
    }
  }
  return 'upcoming';
}

const FUTURE_DAYS = 3;
const FETCH_DATES = Array.from({ length: FUTURE_DAYS + 1 }, (_, i) => dateOffset(i));

/* ═══════════════════════════════════════
   ANIMATED NUMBER
   ═══════════════════════════════════════ */
function AnimNum({ value, duration = 700, delay = 0, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const target = value || 0;
    if (target === 0) { setDisplay(0); return; }
    const start = performance.now() + delay;
    const animate = (now) => {
      if (now < start) { raf.current = requestAnimationFrame(animate); return; }
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(Math.round((1 - Math.pow(1 - progress, 3)) * target));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration, delay]);
  return <>{display.toLocaleString()}{suffix}</>;
}

/* ═══════════════════════════════════════
   LIVE CLOCK
   ═══════════════════════════════════════ */
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1.5px solid var(--border)', fontFamily: 'var(--font-display,monospace)', fontSize: '.88rem', fontWeight: 800, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', letterSpacing: '.03em', flexShrink: 0 }}>
      <Timer size={13} style={{ opacity: .6 }} />{time}
    </span>
  );
}

/* ═══════════════════════════════════════
   ZOKA RESULT BADGE
   ═══════════════════════════════════════ */
function ZokaResultBadge({ pick }) {
  if (!pick?.adminPick || pick.status !== 'finished') return null;
  const h = pick.adminPick.home, a = pick.adminPick.away;
  const ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="abdg pn">PENDING</span>;
  if (h === ph && a === pa) return <span className="abdg ex"><CheckCircle2 size={9} /> EXACT +10</span>;
  if ((h > a ? 'H' : h < a ? 'A' : 'D') === (ph > pa ? 'H' : ph < pa ? 'A' : 'D')) return <span className="abdg rs"><TrendIcon size={9} /> RESULT +3</span>;
  return <span className="abdg ms"><XCircle size={9} /> MISS</span>;
}

/* ═══════════════════════════════════════
   DATE DIVIDER
   ═══════════════════════════════════════ */
function DateDivider({ date, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px', fontSize: '.72rem', fontWeight: 800, color: accent || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
      <CalendarDays size={12} style={{ opacity: .7 }} />
      <span>{dateLabel(date)}</span>
      <span style={{ opacity: .4, fontWeight: 600, fontSize: '.65rem' }}>{date}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)', borderRadius: 1 }} />
    </div>
  );
}

/* ═══════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('home-v20-css')) return;
  const s = document.createElement('style');
  s.id = 'home-v20-css';
  s.textContent = `
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
@keyframes liveStripIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes live-glow{0%,100%{border-color:rgba(239,68,68,.12);box-shadow:0 0 3px rgba(239,68,68,.01)}50%{border-color:rgba(239,68,68,.35);box-shadow:0 0 14px rgba(239,68,68,.06)}}
@keyframes card-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes zoka-glow{0%,100%{border-color:rgba(245,197,66,.18);box-shadow:0 0 3px rgba(245,197,66,.01)}50%{border-color:rgba(245,197,66,.35);box-shadow:0 0 12px rgba(245,197,66,.06)}}

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
.h-shimmer{background:linear-gradient(90deg,var(--bg-surface,#0f0f11) 25%,var(--bg-card) 50%,var(--bg-surface,#0f0f11) 75%);background-size:200% 100%;animation:zShimmer 1.4s ease-in-out infinite;border-radius:10px}
.crown-float{animation:crownFloat 3s ease-in-out infinite}

.ripple-effect{position:relative;overflow:hidden}
.ripple-effect::after{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,.12) 0%,transparent 70%);opacity:0;transition:opacity .3s}
.ripple-effect:active::after{opacity:1}

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
.explore-card{display:flex;align-items:center;gap:16px;padding:18px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:16px;text-decoration:none;position:relative;overflow:hidden;transition:all .25s cubic-bezier(.22,1,.36,1);width:100%;min-height:68px;min-width:0;-webkit-tap-highlight-color:transparent;outline:none;color:inherit}
.explore-card:hover{border-color:rgba(255,255,255,.14);transform:translateX(4px);box-shadow:0 4px 20px rgba(0,0,0,.1)}
.explore-card:active{transform:scale(.98)}
.explore-card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

.live-strip{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:rgba(239,68,68,.25) transparent}
.live-strip::-webkit-scrollbar{height:4px}
.live-strip::-webkit-scrollbar-track{background:transparent}
.live-strip::-webkit-scrollbar-thumb{background:rgba(239,68,68,.25);border-radius:4px}
.live-match-mini{min-width:200px;max-width:260px;flex-shrink:0;padding:14px;background:var(--bg-card);border:1.5px solid rgba(239,68,68,.15);border-radius:14px;scroll-snap-align:start;transition:border-color .2s,transform .2s;overflow:hidden;animation:liveStripIn .4s cubic-bezier(.22,1,.36,1) both}
.live-match-mini:hover{border-color:rgba(239,68,68,.3);transform:translateY(-1px)}
.live-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block;animation:zPulse 1.2s infinite;box-shadow:0 0 6px rgba(239,68,68,.5)}
.ld{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:zPulse 1.2s ease-in-out infinite;box-shadow:0 0 6px rgba(239,68,68,.5);flex-shrink:0}

.zbtn{transition:all .25s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;position:relative;overflow:hidden}
.zbtn:hover{transform:translateY(-2px)}
.zbtn:active{transform:translateY(0) scale(.97)}
.zbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cta-primary{animation:hCtaPulse 3s ease-in-out infinite}

.toggle-more-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 18px;margin-top:10px;border-radius:12px;font-size:.85rem;font-weight:800;background:rgba(255,255,255,.02);border:1.5px dashed var(--border);color:var(--text-muted);cursor:pointer;transition:all .25s cubic-bezier(.22,1,.36,1);min-height:48px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;font-family:inherit}
.toggle-more-btn:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:var(--text-primary)}
.toggle-more-btn:active{transform:scale(.98)}
.toggle-more-btn svg{transition:transform .3s cubic-bezier(.22,1,.36,1)}
.toggle-more-btn.expanded svg{transform:rotate(180deg)}

.am{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:8px;transition:all .15s;animation:card-in .3s cubic-bezier(.22,1,.36,1) both}
.am:hover{background:rgba(255,255,255,.015)}
.am.zs{background:linear-gradient(135deg,rgba(245,197,66,.05),rgba(245,197,66,.012));border-color:rgba(245,197,66,.22)}
.am.zs:hover{background:linear-gradient(135deg,rgba(245,197,66,.07),rgba(245,197,66,.02));border-color:rgba(245,197,66,.32)}
.am.lg{animation:live-glow 2s ease-in-out infinite}
.am.ok{border-color:rgba(0,230,118,.22)}
.am.zglow{animation:zoka-glow 2.5s ease-in-out infinite}
.am.card-in{animation:card-in .3s cubic-bezier(.22,1,.36,1) both}

.amh{display:flex;align-items:center;justify-content:space-between;gap:8px}
.aml{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.aml img{width:18px;height:18px;border-radius:4px;object-fit:contain;flex-shrink:0}
.aml span{font-size:.72rem;font-weight:700;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.as{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:.63rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;flex-shrink:0}

.atm{display:flex;align-items:center;gap:8px}
.ate{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
.ate.aw{flex-direction:row-reverse;text-align:right}
.ate img{width:26px;height:26px;border-radius:6px;object-fit:contain;flex-shrink:0}
.ate span{font-size:.86rem;font-weight:800;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.asb{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;min-width:80px;justify-content:center;background:rgba(255,255,255,.03);border:1px solid var(--border)}
.asb.lv{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.18)}
.asb.ft{background:rgba(0,230,118,.05);border-color:rgba(0,230,118,.12)}
.asn{font-size:1.1rem;font-weight:900;font-family:var(--font-display,monospace);font-variant-numeric:tabular-nums;color:var(--text-primary)}
.asn.r{color:#ef4444}.asn.g{color:var(--accent)}.asn.gd{color:var(--gold,#f5c542)}
.asep{color:var(--text-muted);font-size:.8rem;font-weight:700;opacity:.3}
.avs{font-size:.68rem;font-weight:800;color:var(--text-muted);opacity:.2;letter-spacing:.08em}

.aa{display:flex;align-items:center;gap:6px;justify-content:flex-end;flex-wrap:wrap}

.ab{padding:9px 14px;border-radius:9px;font-size:.78rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;min-height:40px;font-family:inherit;-webkit-tap-highlight-color:transparent}
.ab:active{transform:scale(.97)}.ab:disabled{opacity:.28;pointer-events:none;transform:none}
.ab-p{background:var(--accent,#10b981);color:#fff;box-shadow:0 2px 10px rgba(16,185,129,.18)}
.ab-p:hover{filter:brightness(1.08);transform:translateY(-1px)}
.ab-gh{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-primary)}
.ab-gh:hover{background:rgba(255,255,255,.05);border-color:var(--border-hover)}
.ab-sm{padding:7px 11px;font-size:.7rem;min-height:34px;border-radius:8px}
.ab-ol{background:transparent;border:1px solid var(--border);color:var(--text-muted)}
.ab-ol:hover{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.03)}
.ab-ol.on{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.06)}

.abdg{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:6px;font-size:.68rem;font-weight:800;white-space:nowrap}
.abdg.ex{background:rgba(0,230,118,.1);color:var(--accent);border:1px solid rgba(0,230,118,.22)}
.abdg.rs{background:rgba(245,197,66,.08);color:var(--gold,#f5c542);border:1px solid rgba(245,197,66,.18)}
.abdg.ms{background:rgba(239,68,68,.07);color:#ef4444;border:1px solid rgba(239,68,68,.15)}
.abdg.pn{background:rgba(255,255,255,.03);color:var(--text-muted);border:1px solid var(--border)}
.abdg.gd{background:rgba(245,197,66,.08);color:var(--gold);border:1px solid rgba(245,197,66,.2)}

.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9999;animation:zSlide .3s cubic-bezier(.22,1,.36,1) both;pointer-events:none}
.toast-inner{display:flex;align-items:center;gap:10px;padding:14px 24px;border-radius:14px;background:rgba(0,230,118,.12);border:1.5px solid rgba(0,230,118,.3);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 6px 24px rgba(0,0,0,.5)}
.toast-inner span{font-size:.92rem;font-weight:800;color:var(--accent)}

.zoka-section{background:linear-gradient(135deg,rgba(245,197,66,.04) 0%,transparent 60%);border:1.5px solid rgba(245,197,66,.12);border-radius:16px;padding:18px;margin-bottom:18px;overflow:hidden}
.zoka-header{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;overflow:hidden}
.zoka-header-icon{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,rgba(245,197,66,.15),rgba(245,197,66,.05));border:1.5px solid rgba(245,197,66,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0}

@media(min-width:480px){.explore-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:640px){
  .explore-grid{grid-template-columns:repeat(2,1fr);gap:12px}
  .stat-grid{grid-template-columns:repeat(4,1fr);gap:12px}
  .live-match-mini{min-width:220px}
}
@media(min-width:768px){.explore-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:639px){
  .stat-grid{grid-template-columns:repeat(2,1fr);gap:10px}
  .stat-chip{padding:14px 12px;gap:8px}
  .sec-head-line{max-width:60px}
  .am{padding:12px 14px}
  .ate span{font-size:.78rem}.asn{font-size:.95rem}
  .asb{min-width:68px;padding:6px 10px}
  .aa{flex-wrap:wrap}
}
@media(max-width:380px){
  .stat-grid{gap:8px}
  .stat-chip{padding:12px 10px;gap:6px}
  .stat-chip-label{font-size:.68rem}
  .stat-chip-val{font-size:.95rem}
  .ate img{width:22px;height:22px}
}
@media(prefers-reduced-motion:reduce){
  *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════
   SKELETONS
   ═══════════════════════════════════════ */
const SkelCard = () => <div className="h-shimmer" style={{ height: 80, borderRadius: 14, marginBottom: 8 }} />;

/* ═══════════════════════════════════════
   LIVE MINI CARD
   ═══════════════════════════════════════ */
const LiveMini = ({ match, index }) => {
  const minute = match.elapsed || match.minute || '';
  const minuteStr = minute ? `${minute}'` : '';
  return (
    <div className="live-match-mini" style={{ animationDelay: `${index * 80}ms` }}>
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

/* ═══════════════════════════════════════
   FEATURED ROW
   ═══════════════════════════════════════ */
const FeaturedRow = ({ pred, userPred, userResult, index, isLoggedIn }) => {
  const isFinished = pred.status === 'finished' || !!pred.isFinished;
  const isLive = pred.status === 'live' || !!pred.isLive;
  const isHT = pred.status === 'ht' || pred.status === 'HT';
  const hasScore = pred.homeScore != null && pred.awayScore != null;

  const isPredicted = !!userPred;
  const isResolved = !!userResult?.resultType && userResult.resultType !== 'pending';
  const isExact = isResolved && userResult.resultType === 'exact';
  const isHit = isResolved && userResult.resultType === 'result';

  let leftBorder = 'var(--border)';
  if (isExact) leftBorder = 'var(--accent)';
  else if (isHit) leftBorder = 'var(--gold)';
  else if (isResolved && !isExact && !isHit) leftBorder = '#ef4444';
  else if (isLive || isHT) leftBorder = '#ef4444';
  else if (isFinished) leftBorder = 'rgba(0,230,118,.3)';
  else if (isPredicted) leftBorder = '#60a5fa';

  const matchId = pred.id || pred.matchId;
  const homeLogo = pred.homeLogo || pred.homeTeam?.logo || pred.homeTeam?.crest;
  const awayLogo = pred.awayLogo || pred.awayTeam?.logo || pred.awayTeam?.crest;
  const league = pred.league;
  const kickoff = pred.kickoff || 'TBD';
  const homeName = pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home';
  const awayName = pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away';
  const homeScore = pred.homeScore;
  const awayScore = pred.awayScore;

  let statusLabel = kickoff;
  let statusColor = 'var(--text-muted)';
  let statusBg = 'rgba(255,255,255,.04)';
  if (isLive) { statusLabel = pred.minute != null ? `${pred.minute}'` : 'LIVE'; statusColor = '#ef4444'; statusBg = 'rgba(239,68,68,.1)'; }
  else if (isHT) { statusLabel = 'HT'; statusColor = '#f97316'; statusBg = 'rgba(249,115,22,.1)'; }
  else if (isFinished) { statusLabel = 'FT'; statusColor = 'var(--accent)'; statusBg = 'rgba(0,230,118,.08)'; }

  const cardCls = `am card-in${isLive ? ' lg' : ''}${isFinished ? ' ok' : ''}`;

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftBorder}`, animationDelay: `${index * 20}ms`, opacity: isFinished && !isResolved ? .5 : 1 }}>
      <div className="amh">
        <div className="aml">
          {league?.emblem && <img src={league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{league?.name || 'Featured'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isLive && <span className="ld" />}
          <span className="as" style={{ color: statusColor, background: statusBg }}>{statusLabel}</span>
        </div>
      </div>
      <div className="atm">
        <div className="ate">
          {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{homeName}</span>
        </div>
        <div className={`asb${isLive ? ' lv' : ''}${isFinished ? ' ft' : ''}`}>
          {hasScore ? (
            <><span className={`asn${isLive ? ' r' : ' g'}`}>{homeScore}</span><span className="asep">–</span><span className={`asn${isLive ? ' r' : ' g'}`}>{awayScore}</span></>
          ) : <span className="avs">VS</span>}
        </div>
        <div className="ate aw">
          {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{awayName}</span>
        </div>
      </div>
      <div className="aa">
        {isResolved ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span className={`abdg ${isExact ? 'ex' : isHit ? 'rs' : 'ms'}`}>
              {isExact ? <CheckCircle2 size={9} /> : isHit ? <TrendIcon size={9} /> : <XCircle size={9} />}
              {isExact ? ' EXACT +10' : isHit ? ' RESULT +3' : ' MISS'}
            </span>
            {isPredicted && <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>You: {userPred.homeScore}–{userPred.awayScore}</span>}
          </div>
        ) : isLive || isHT ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPredicted ? (
              <Link to="/predictions" className="ab ab-sm ab-ol on" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 38, whiteSpace: 'nowrap' }}><CheckCircle size={12} /> Locked</Link>
            ) : (
              <span className="as" style={{ color: isLive ? '#ef4444' : '#f97316', background: isLive ? 'rgba(239,68,68,.1)' : 'rgba(249,115,22,.1)' }}>{isLive ? '● LIVE' : '⏸ HT'}</span>
            )}
          </div>
        ) : isFinished ? (
          <span className="as" style={{ background: 'rgba(255,255,255,.04)', color: 'var(--text-muted)' }}>FT</span>
        ) : isPredicted ? (
          <Link to="/predictions" className="ab ab-sm ab-ol on" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 38, whiteSpace: 'nowrap' }}><CheckCircle size={12} /> Locked</Link>
        ) : isLoggedIn ? (
          <Link to={`/predictions?match=${matchId}`} className="ab ab-sm ab-p" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 38, whiteSpace: 'nowrap' }}><Target size={12} /> Predict</Link>
        ) : (
          <Link to="/login" className="ab ab-sm ab-gh" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 38, whiteSpace: 'nowrap' }}><Lock size={12} /> Login</Link>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   ZOKA ROW
   ═══════════════════════════════════════ */
const ZokaRow = ({ pick, index }) => {
  const isFin = pick.status === 'finished';
  const homeLogo = pick.homeLogo || pick.homeTeam?.logo || pick.homeTeam?.crest;
  const awayLogo = pick.awayLogo || pick.awayTeam?.logo || pick.awayTeam?.crest;
  const league = pick.league;
  const kickoffRaw = pick.kickoff || '';
  const kickoff = kickoffRaw.includes('T')
    ? kickoffRaw.split('T')[1]?.split(':').slice(0, 2).join(':') || '--:--'
    : kickoffRaw.split(':').slice(0, 2).join(':') || '--:--';
  const homeName = pick.homeTeam?.shortName || pick.homeTeam?.name || '?';
  const awayName = pick.awayTeam?.shortName || pick.awayTeam?.name || '?';
  const predH = pick.adminPick?.home;
  const predA = pick.adminPick?.away;

  const cardCls = `am zs card-in${!isFin ? ' zglow' : ''}`;

  return (
    <div className={cardCls} style={{ animationDelay: `${index * 30}ms` }}>
      <div className="amh">
        <div className="aml">
          {league?.emblem && <img src={league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{league?.name || 'Zoka Pick'}</span>
        </div>
        <span className="as" style={{
          color: isFin ? 'var(--accent)' : 'var(--text-muted)',
          background: isFin ? 'rgba(0,230,118,.08)' : 'rgba(255,255,255,.04)',
        }}>
          {isFin ? 'FT' : kickoff}
        </span>
      </div>
      <div className="atm">
        <div className="ate">
          {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{homeName}</span>
        </div>
        <div className={`asb${isFin ? ' ft' : ''}`} style={!isFin ? {
          borderColor: 'rgba(245,197,66,.28)',
          background: 'rgba(245,197,66,.08)',
        } : {}}>
          {isFin && pick.homeScore != null ? (
            <><span className="asn g">{pick.homeScore}</span><span className="asep">–</span><span className="asn g">{pick.awayScore}</span></>
          ) : (
            <span className="asn gd">{predH ?? '?'}–{predA ?? '?'}</span>
          )}
        </div>
        <div className="ate aw">
          {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{awayName}</span>
        </div>
      </div>
      <div className="aa">
        {isFin ? (
          <>
            <ZokaResultBadge pick={pick} />
            {(predH != null || predA != null) && (
              <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Pred: {predH ?? '?'}–{predA ?? '?'}
              </span>
            )}
          </>
        ) : (
          <span className="abdg gd">
            <Star size={9} fill="currentColor" /> Prediction
          </span>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   EXPLORE CARD
   ═══════════════════════════════════════ */
const ExploreCard = ({ to, icon, title, desc, color, delay, glow, badge }) => (
  <Link to={to} className={`explore-card h-pop ripple-effect ${glow ? ' score-glow' : ''}`} style={{ animationDelay: `${delay || 0}ms` }}>
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: color, borderRadius: '0 3px 3px 0' }} />
    <div style={{ width: 48, height: 48, borderRadius: 14, background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.3rem' }}>{icon}</div>
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

/* ═══════════════════════════════════════
   MAIN HOME COMPONENT
   ═══════════════════════════════════════ */
export default function Home() {
  injectStyles();
  const { currentUser, userProfile } = useAuth();
  const isLoggedIn = !!currentUser;
  const uid = currentUser?.uid;
  const mounted = useRef(true);

  const greeting = useMemo(() => getGreeting(), []);

  /* ── State ── */
  const [fixtures, setFixtures] = useState([]);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [allFeatured, setAllFeatured] = useState([]);
  const [allZoka, setAllZoka] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [zokaLoading, setZokaLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [userPredictions, setUserPredictions] = useState({});
  const [userResults, setUserResults] = useState({});
  const [stats, setStats] = useState({ users: 0, predictions: 0, accuracy: 0 });
  const [totalUsers, setTotalUsers] = useState(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [toast, setToast] = useState(null);
  const [showMoreFeatured, setShowMoreFeatured] = useState(false);
  const [showMoreZoka, setShowMoreZoka] = useState(false);

  /* ── Offline detection ── */
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* ── Toast ── */
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => { if (mounted.current) setToast(null); }, 3000);
  }, []);

  /* ── 1. Fixtures (today only, for live data) ── */
  useEffect(() => {
    let mnt = true;
    const load = async () => {
      try {
        const data = await fetchFixtures(todayStr());
        if (mnt && data) {
          const list = Array.isArray(data) ? data : Array.isArray(data?.matches) ? data.matches : [];
          setFixtures(list);
        }
      } catch (e) {
        console.warn('[Home] Fixture fetch error:', e);
      } finally {
        if (mnt) setFixturesLoading(false);
      }
    };
    load();

    const unsub = subscribeToTodayFixtures((updated) => {
      if (!mnt) return;
      const list = Array.isArray(updated?.matches) ? updated.matches : (Array.isArray(updated) ? updated : []);
      setFixtures(prev => prev.length === 0 ? list : prev.map(f => {
        const live = list.find(m => String(m.id) === String(f.id));
        return live
          ? { ...f, homeScore: live.homeScore ?? f.homeScore, awayScore: live.awayScore ?? f.awayScore, isLive: true, isFinished: false, minute: live.minute ?? f.minute, status: live.status || f.status }
          : f;
      }));
      setFixturesLoading(false);
    });

    return () => { mnt = false; if (unsub) unsub(); };
  }, []);

  /* ── 2. Featured + Zoka + Leaderboard (MULTI-DATE) ── */
  useEffect(() => {
    let mnt = true;
    (async () => {
      try {
        const [predsResults, zokaResults, lbData] = await Promise.allSettled([
          Promise.all(FETCH_DATES.map(d => dataLayer.fetchActivePredictions(d).catch(() => null))),
          Promise.all(FETCH_DATES.map(d => dataLayer.fetchZokaPicks(d).catch(() => null))),
          dataLayer.fetchDailyLeaderboard(todayStr()),
        ]);
        if (!mnt) return;

        if (predsResults.status === 'fulfilled') {
          const groups = [];
          predsResults.value.forEach((data, i) => {
            if (!data) return;
            const list = Array.isArray(data) ? data : [];
            if (list.length > 0) groups.push({ date: FETCH_DATES[i], matches: list.slice(0, 12) });
          });
          groups.sort((a, b) => a.date.localeCompare(b.date));
          setAllFeatured(groups);
        }

        if (zokaResults.status === 'fulfilled') {
          const groups = [];
          zokaResults.value.forEach((data, i) => {
            if (!data) return;
            const matches = Array.isArray(data?.matches) ? data.matches : (Array.isArray(data) ? data : []);
            if (matches.length > 0) groups.push({ date: FETCH_DATES[i], matches });
          });
          groups.sort((a, b) => a.date.localeCompare(b.date));
          setAllZoka(groups);
        }

        if (lbData.status === 'fulfilled' && lbData.value?.entries) {
          setLeaderboard(lbData.value.entries.slice(0, 10));
          const entries = lbData.value.entries;
          if (entries.length > 0) {
            setStats({
              users: entries.length,
              predictions: entries.reduce((s, e) => s + (e.predictions || 0), 0),
              accuracy: entries.reduce((s, e) => s + (e.accuracy || 0), 0) / entries.length,
            });
          }
        }
      } catch (e) {
        console.warn('[Home] dataLayer error:', e);
      } finally {
        if (mnt) {
          setFeaturedLoading(false);
          setZokaLoading(false);
          setLbLoading(false);
        }
      }
    })();
    return () => { mnt = false; };
  }, []);

  /* ── 3. User predictions & results (today only) ── */
  useEffect(() => {
    if (!isLoggedIn || !uid) return;
    let mnt = true;
    (async () => {
      try {
        const [predsData, resultsData] = await Promise.all([
          dataLayer.fetchUserPredictions(uid, todayStr()).catch(() => ({})),
          dataLayer.fetchPredictionResults(uid, todayStr()).catch(() => ({ results: [], resultMap: {} })),
        ]);
        if (!mnt) return;
        if (predsData) {
          const map = {};
          Object.values(predsData).forEach(p => { map[p.predId || p.matchId] = p; });
          setUserPredictions(map);
        }
        if (resultsData?.resultMap) setUserResults(resultsData.resultMap);
      } catch (e) {
        console.warn('[Home] User data error:', e);
      }
    })();
    return () => { mnt = false; };
  }, [isLoggedIn, uid]);

  /* ── 4. Total users (Firestore) ── */
  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), limit(1))).then(snap => {
      if (!snap.empty && mounted.current) {
        const d = snap.docs[0].data();
        setTotalUsers(d.totalUsers || null);
      }
    }).catch(() => {});
  }, []);

  /* ── 5. Event bus subscriptions ── */
  useEffect(() => {
    const unsubZoka = eventBus.on(EVENT.ZOKA_PICKS_UPDATED, (payload) => {
      const d = payload.dateStr;
      if (!FETCH_DATES.includes(d) || !payload.picks?.matches) return;
      setAllZoka(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(g => g.date === d);
        const matches = payload.picks.matches;
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], matches };
        } else if (matches.length > 0) {
          updated.push({ date: d, matches });
          updated.sort((a, b) => a.date.localeCompare(b.date));
        }
        return updated;
      });
    });

    const unsubPreds = eventBus.on(EVENT.PREDICTIONS_UPDATED, (payload) => {
      const d = payload.dateStr;
      if (!FETCH_DATES.includes(d) || !payload.predictions) return;
      const list = Array.isArray(payload.predictions) ? payload.predictions : [];
      setAllFeatured(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(g => g.date === d);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], matches: list.slice(0, 12) };
        } else if (list.length > 0) {
          updated.push({ date: d, matches: list.slice(0, 12) });
          updated.sort((a, b) => a.date.localeCompare(b.date));
        }
        return updated;
      });
    });

    const unsubLB = eventBus.on(EVENT.DAILY_LEADERBOARD_UPDATED, (payload) => {
      if (payload.dateStr === todayStr() && payload.leaderboard?.entries) {
        setLeaderboard(payload.leaderboard.entries.slice(0, 10));
        const entries = payload.leaderboard.entries;
        if (entries.length > 0) {
          setStats(prev => ({
            users: entries.length,
            predictions: entries.reduce((s, e) => s + (e.predictions || 0), 0),
            accuracy: entries.reduce((s, e) => s + (e.accuracy || 0), 0) / entries.length,
          }));
        }
      }
    });

    const unsubResolved = eventBus.on(EVENT.MATCH_RESOLVED, (payload) => {
      if (isLoggedIn && uid && payload.affectedUsers?.includes(uid)) {
        Promise.all([
          dataLayer.fetchPredictionResults(uid, todayStr()),
          dataLayer.fetchDailyLeaderboard(todayStr()),
        ]).then(([results, lb]) => {
          if (!mounted.current) return;
          if (results?.resultMap) setUserResults(prev => ({ ...prev, ...results.resultMap }));
          if (lb?.entries) {
            setLeaderboard(lb.entries.slice(0, 10));
            const entries = lb.entries;
            if (entries.length > 0) {
              setStats(prev => ({
                users: entries.length,
                predictions: entries.reduce((s, e) => s + (e.predictions || 0), 0),
                accuracy: entries.reduce((s, e) => s + (e.accuracy || 0), 0) / entries.length,
              }));
            }
          }
        });
      }
    });

    return () => { unsubZoka(); unsubPreds(); unsubLB(); unsubResolved(); };
  }, [isLoggedIn, uid]);

  /* ═══════════════════════════════════════
     DERIVED STATE
     ═══════════════════════════════════════ */

  const liveMatches = useMemo(() => fixtures.filter(f => { const s = estimateMatchStatus(f); return s === 'live' || s === 'ht'; }), [fixtures]);
  const liveCount = liveMatches.length;

  const allFeaturedFlat = useMemo(() => allFeatured.flatMap(g => g.matches.map(m => ({ ...m, _dateStr: g.date }))), [allFeatured]);
  const featuredVisible = showMoreFeatured ? allFeaturedFlat : allFeaturedFlat.slice(0, 6);
  const featuredHiddenCount = Math.max(0, allFeaturedFlat.length - 6);

  const allZokaFlat = useMemo(() => allZoka.flatMap(g => g.matches.map(m => ({ ...m, _dateStr: g.date }))), [allZoka]);
  const zokaVisible = showMoreZoka ? allZokaFlat : allZokaFlat.slice(0, 6);
  const zokaHiddenCount = Math.max(0, allZokaFlat.length - 6);

  const todayFeatured = useMemo(() => allFeatured.find(g => g.date === todayStr())?.matches || [], [allFeatured]);
  const userScored = useMemo(() => todayFeatured.filter(p => userPredictions[p.id || p.matchId]).length, [todayFeatured, userPredictions]);
  const finishedToday = useMemo(() => todayFeatured.filter(p => p.status === 'finished'), [todayFeatured]);
  const userExact = useMemo(() => finishedToday.filter(p => { const r = userResults[String(p.matchId || p.id)]; return r && r.resultType === 'exact'; }).length, [finishedToday, userResults]);
  const userHit = useMemo(() => finishedToday.filter(p => { const r = userResults[String(p.matchId || p.id)]; return r && r.resultType === 'result'; }).length, [finishedToday, userResults]);

  useEffect(() => { return () => { mounted.current = false; }; }, []);

  /* ═════════════════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0a0a0b)' }}>
      <SEO
  title="Football Predictions, Fixtures & Live Scores"
  description="Get football predictions, match analysis, fixtures, live scores, team form insights and football statistics from leagues around the world with ZOKASCORE."
  keywords="football predictions, football fixtures, live football scores, soccer predictions, match analysis, football statistics, football tips, ZOKASCORE"
  path="/"
/>

      {offline && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', background: 'rgba(239,68,68,.08)', borderBottom: '1.5px solid rgba(239,68,68,.2)', fontSize: '.82rem', fontWeight: 700, color: '#ef4444' }}>
          <WifiOff size={14} /> You're offline — showing cached data
        </div>
      )}

      {/* ── HERO ── */}
      <section className="hero-bg" style={{ padding: '28px 16px 24px', maxWidth: 680, margin: '0 auto' }}>
        <div className="hero-center z-fade-up" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.4rem' }}>{greeting.emoji}</span>
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                  {greeting.text}{userProfile?.displayName ? `, ${userProfile.displayName.split(' ')[0]}` : ''} {greeting.icon}
                </h1>
                <p style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)', margin: '2px 0 0' }}>{todayStr()}</p>
              </div>
            </div>
            <LiveClock />
          </div>
        </div>

        {liveCount > 0 && (
          <div className="z-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="ld" />
              <span style={{ fontSize: '.82rem', fontWeight: 900, color: '#ef4444' }}>{liveCount} LIVE</span>
              <div style={{ flex: 1, height: 1.5, background: 'rgba(239,68,68,.15)', borderRadius: 1 }} />
            </div>
            <div className="live-strip">
              {liveMatches.map((m, i) => <LiveMini key={m.id || i} match={m} index={i} />)}
            </div>
          </div>
        )}

        {/* ── STATS ── */}
        <div className="stat-grid z-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="stat-chip">
            <div>
              <div className="stat-chip-label">Users</div>
              <div className="stat-chip-val"><AnimNum value={totalUsers || stats.users} delay={200} /></div>
            </div>
            <Users size={20} style={{ color: 'var(--text-muted)', opacity: .4 }} />
          </div>
          <div className="stat-chip">
            <div>
              <div className="stat-chip-label">Predictions</div>
              <div className="stat-chip-val"><AnimNum value={stats.predictions} delay={300} /></div>
            </div>
            <Target size={20} style={{ color: 'var(--text-muted)', opacity: .4 }} />
          </div>
          <div className="stat-chip">
            <div>
              <div className="stat-chip-label">Accuracy</div>
              <div className="stat-chip-val"><AnimNum value={stats.accuracy} delay={400} suffix="%" /></div>
            </div>
            <BarChart3 size={20} style={{ color: 'var(--text-muted)', opacity: .4 }} />
          </div>
          <div className="stat-chip">
            <div>
              <div className="stat-chip-label">My Score</div>
              <div className="stat-chip-val" style={{ color: isLoggedIn ? 'var(--accent)' : 'var(--text-muted)' }}>
                {isLoggedIn ? <><AnimNum value={(userExact * 10) + (userHit * 3)} delay={500} />pts</> : '—'}
              </div>
            </div>
            <Trophy size={20} style={{ color: isLoggedIn ? 'var(--accent)' : 'var(--text-muted)', opacity: isLoggedIn ? .7 : .3 }} />
          </div>
        </div>

        {/* ── CTA BUTTON ── */}
        <div className="z-fade-up" style={{ animationDelay: '200ms', marginTop: 24, width: '100%' }}>
          <Link
            to={isLoggedIn ? '/predictions' : '/login'}
            className="zbtn cta-primary"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%', maxWidth: 400, margin: '0 auto', padding: '16px 28px',
              borderRadius: 14, fontSize: '1rem', fontWeight: 900,
              background: 'var(--accent)', color: '#fff', textDecoration: 'none',
              border: 'none', fontFamily: 'inherit',
            }}
          >
            {isLoggedIn ? (
              userScored > 0
                ? <><CheckCircle size={18} /> View My Predictions</>
                : <><Target size={18} /> Start Predicting</>
            ) : (
              <><LogIn size={18} /> Sign In to Predict</>
            )}
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── ZOKA PICKS ── */}
      {zokaLoading ? (
        <section style={{ padding: '0 16px', maxWidth: 680, margin: '0 auto' }}>
          <div className="sec-head"><h2>⭐ Zoka Picks</h2><div className="sec-head-line" /></div>
          {Array.from({ length: 2 }).map((_, i) => <SkelCard key={i} />)}
        </section>
      ) : allZokaFlat.length > 0 ? (
        <section className="h-section" style={{ padding: '0 16px', maxWidth: 680, margin: '0 auto' }}>
          <div className="sec-head h-enter" style={{ animationDelay: '250ms' }}>
            <h2>⭐ Zoka Picks</h2>
            <span style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--gold)', background: 'rgba(245,197,66,.08)', padding: '3px 10px', borderRadius: 6 }}>{allZokaFlat.length}</span>
            <div className="sec-head-line" />
          </div>
          <div className="zoka-section">
            <div className="zoka-header">
              <div className="zoka-header-icon"><Crown size={18} style={{ color: 'var(--gold)' }} /></div>
              <div>
                <div style={{ fontSize: '.88rem', fontWeight: 900, color: 'var(--gold)' }}>Expert Predictions</div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Curated by Zoka</div>
              </div>
            </div>
            {allZoka.map((group) => (
              <Fragment key={group.date}>
                {allZoka.length > 1 && <DateDivider date={group.date} accent="var(--gold)" />}
                {zokaVisible
                  .filter(m => m._dateStr === group.date)
                  .map((pick, pi) => <ZokaRow key={pick.matchId || pi} pick={pick} index={pi} />)}
              </Fragment>
            ))}
            {zokaHiddenCount > 0 && (
              <button className={`toggle-more-btn${showMoreZoka ? ' expanded' : ''}`} onClick={() => setShowMoreZoka(v => !v)}>
                {showMoreZoka ? 'Show less' : `Show ${zokaHiddenCount} more`}
                <ChevronDown size={16} />
              </button>
            )}
          </div>
        </section>
      ) : null}

      {/* ── FEATURED MATCHES ── */}
      {featuredLoading ? (
        <section style={{ padding: '0 16px', maxWidth: 680, margin: '0 auto' }}>
          <div className="sec-head"><h2>🔥 Featured Matches</h2><div className="sec-head-line" /></div>
          {Array.from({ length: 3 }).map((_, i) => <SkelCard key={i} />)}
        </section>
      ) : allFeaturedFlat.length > 0 ? (
        <section className="h-section" style={{ padding: '0 16px', maxWidth: 680, margin: '0 auto' }}>
          <div className="sec-head h-enter" style={{ animationDelay: '300ms' }}>
            <h2>🔥 Featured Matches</h2>
            <span style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(0,230,118,.08)', padding: '3px 10px', borderRadius: 6 }}>{allFeaturedFlat.length}</span>
            <div className="sec-head-line" />
          </div>
          {allFeatured.map((group) => (
            <Fragment key={group.date}>
              {allFeatured.length > 1 && <DateDivider date={group.date} />}
              {featuredVisible
                .filter(m => m._dateStr === group.date)
                .map((pred, pi) => (
                  <FeaturedRow
                    key={pred.id || pred.matchId || pi}
                    pred={pred}
                    userPred={userPredictions[pred.id || pred.matchId]}
                    userResult={userResults[String(pred.matchId || pred.id)]}
                    index={pi}
                    isLoggedIn={isLoggedIn}
                  />
                ))}
            </Fragment>
          ))}
          {featuredHiddenCount > 0 && (
            <button className={`toggle-more-btn${showMoreFeatured ? ' expanded' : ''}`} onClick={() => setShowMoreFeatured(v => !v)}>
              {showMoreFeatured ? 'Show less' : `Show ${featuredHiddenCount} more`}
              <ChevronDown size={16} />
            </button>
          )}
        </section>
      ) : null}

      {/* ── EXPLORE ── */}
      <section className="h-section" style={{ padding: '0 16px', maxWidth: 680, margin: '24px auto 0' }}>
        <div className="sec-head h-enter" style={{ animationDelay: '350ms' }}>
          <h2>🧭 Explore</h2>
          <div className="sec-head-line" />
        </div>
        <div className="explore-grid">
          <ExploreCard to="/predictions" icon="⚽" title="All Predictions" desc="Predict scores for today's matches" color="#10b981" delay={360} badge={allFeaturedFlat.length > 0 ? `${allFeaturedFlat.length} matches` : null} />
          <ExploreCard to="/leaderboard" icon="🏆" title="Leaderboard" desc="See who's topping the charts" color="#f5c542" delay={380} badge={liveCount > 0 ? `${liveCount} live` : null} glow={liveCount > 0} />
          <ExploreCard to="/profile" icon="👤" title="My Profile" desc="Track your prediction stats" color="#60a5fa" delay={400} />
          <ExploreCard to="/competitions" icon="🏟️" title="Competitions" desc="Browse leagues & cups" color="#a855f7" delay={420} />
          <ExploreCard to="/results" icon="📊" title="Results" desc="Check past match results" color="#f97316" delay={440} />
          <ExploreCard to="/how-it-works" icon="📖" title="How It Works" desc="Learn the scoring system" color="#06b6d4" delay={460} />
        </div>
      </section>

      {/* ── BOTTOM SPACER ── */}
      <div style={{ height: 100 }} />

      {/* ── TOAST ── */}
      {toast && (
        <div className="toast">
          <div className="toast-inner"><Zap size={16} /><span>{toast}</span></div>
        </div>
      )}
    </div>
  );
}