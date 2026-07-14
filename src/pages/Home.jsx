// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Home.jsx
// v21.0 — Aligned with Core Architecture
// ═════════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Zap, Users, Target, Trophy, CalendarDays, Flame,
  ChevronDown, WifiOff, LogIn, Star, CheckCircle, CheckCircle2,
  Clock, Loader, Lock, Crown, Sparkles, Activity, Medal,
  BarChart3, CircleDot, ArrowUpRight, Sun, Moon, CloudSun,
  Timer, Eye, XCircle, TrendingUp as TrendIcon, ChevronRight,
  Shield, Percent, Gamepad2
} from 'lucide-react';

import { fetchFixtures, subscribeToTodayFixtures } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { dataLayer } from '../utils/dataLayer';
import { todayStr, getLocalDateStr } from '../utils/dates'; // ★ Single source for dates
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants'; // ★ Single source for statuses
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

const dateLabel = (d) => {
  const t = todayStr(), tm = getLocalDateStr(1), ys = getLocalDateStr(-1);
  if (d === t) return 'Today'; if (d === tm) return 'Tomorrow'; if (d === ys) return 'Yesterday';
  const dt = new Date(d + 'T12:00:00');
  return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()]} ${d.slice(5)}`;
};

function estimateMatchStatus(fix) {
  const sport = fix.sport || SPORT.FOOTBALL;
  if (fix.isLive || isLiveStatus(fix.status, sport)) return 'live';
  if (fix.isFinished || isFinishedStatus(fix.status, sport)) return 'ft';
  if (fix.status === 'HT' || fix.status === 'BT') return 'ht';
  return 'upcoming';
}

const FUTURE_DAYS = 3;
const FETCH_DATES = Array.from({ length: FUTURE_DAYS + 1 }, (_, i) => getLocalDateStr(i));

/* ═══════════════════════════════════════
   ANIMATED NUMBER
   ═══════════════════════════════════════ */
function AnimNum({ value, duration = 600, delay = 0, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const target = value || 0;
    if (target === 0) { setDisplay(0); return; }
    const start = performance.now() + delay;
    const run = (now) => {
      if (now < start) { raf.current = requestAnimationFrame(run); return; }
      const p = Math.min((now - start) / duration, 1);
      setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration, delay]);
  return <>{display.toLocaleString()}{suffix}</>;
}

/* ═══════════════════════════════════════
   ACCURACY RING (SVG donut)
   ═══════════════════════════════════════ */
function AccuracyRing({ value, size = 44, stroke = 4, color = 'var(--accent)' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value)) / 100;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity=".3" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }} />
    </svg>
  );
}

/* ═══════════════════════════════════════
   LIVE CLOCK
   ═══════════════════════════════════════ */
function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);
  if (!time) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', fontFamily: 'var(--font-display,monospace)', fontSize: '.82rem', fontWeight: 800, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em', flexShrink: 0 }}>
      <Timer size={12} style={{ opacity: .5 }} />{time}
    </span>
  );
}

/* ═══════════════════════════════════════
   ZOKA RESULT BADGE
   ═══════════════════════════════════════ */
function ZokaBadge({ pick }) {
  if (!pick?.adminPick || pick.status !== 'finished') return null;
  const { home: h, away: a } = pick.adminPick;
  const ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="bdg pn">PENDING</span>;
  if (h === ph && a === pa) return <span className="bdg ex"><CheckCircle2 size={8} /> EXACT</span>;
  if ((h > a ? 'H' : h < a ? 'A' : 'D') === (ph > pa ? 'H' : ph < pa ? 'A' : 'D')) return <span className="bdg rs"><TrendIcon size={8} /> RESULT</span>;
  return <span className="bdg ms"><XCircle size={8} /> MISS</span>;
}

/* ═══════════════════════════════════════
   MINI PODIUM (top 3 leaderboard)
   ═══════════════════════════════════════ */
function MiniPodium({ entries }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;
  const order = [1, 0, 2]; // silver, gold, bronze display order
  const cfg = [
    { h: 80, border: 'var(--gold)', bg: 'rgba(245,197,66,.06)', color: 'var(--gold)', sz: 48, fs: '.85rem' },
    { h: 56, border: '#94a3b8', bg: 'rgba(148,163,184,.04)', color: '#94a3b8', sz: 38, fs: '.72rem' },
    { h: 44, border: '#b45309', bg: 'rgba(180,83,9,.04)', color: '#d97706', sz: 32, fs: '.65rem' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, padding: '8px 0 0' }}>
      {order.map(pos => {
        const u = top3[pos];
        if (!u) return <div key={pos} style={{ flex: 1, maxWidth: 120 }} />;
        const c = cfg[pos];
        return (
          <div key={u.uid} style={{ flex: 1, maxWidth: 120, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6 }}>
              {pos === 0 && <Crown size={14} style={{ color: 'var(--gold)', marginBottom: -2, animation: 'v21-crown 3s ease-in-out infinite' }} />}
              <div style={{ width: c.sz, height: c.sz, borderRadius: '50%', background: `${c.border}15`, border: `2px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: c.fs, fontWeight: 900, color: c.color, fontFamily: 'var(--font-display)' }}>
                {(u.displayName || '??').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{u.displayName}</div>
              <div style={{ fontSize: '.62rem', fontWeight: 800, color: c.color, fontFamily: 'var(--font-display)' }}>{u.points} pts</div>
            </div>
            <div style={{ width: '100%', height: c.h, borderRadius: '10px 10px 0 0', background: c.bg, border: `1px solid ${c.border}22`, borderBottom: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 900, color: c.color, fontFamily: 'var(--font-display)' }}>#{pos + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   DATE DIVIDER
   ═══════════════════════════════════════ */
function DateDivider({ date, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px', fontSize: '.7rem', fontWeight: 800, color: accent || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
      <CalendarDays size={11} style={{ opacity: .6 }} /><span>{dateLabel(date)}</span>
      <span style={{ opacity: .35, fontWeight: 600, fontSize: '.6rem' }}>{date}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)', borderRadius: 1 }} />
    </div>
  );
}

/* ═══════════════════════════════════════
   STYLES
   ═══════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('home-v21-css')) return;
  const s = document.createElement('style');
  s.id = 'home-v21-css';
  s.textContent = `
@keyframes v21-fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes v21-scale{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@keyframes v21-slide{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
@keyframes v21-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.5)}}
@keyframes v21-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes v21-cta{0%,100%{box-shadow:0 4px 20px rgba(0,230,118,.15)}50%{box-shadow:0 4px 32px rgba(0,230,118,.3)}}
@keyframes v21-crown{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-3px) rotate(3deg)}}
@keyframes v21-live-glow{0%,100%{border-color:rgba(239,68,68,.12)}50%{border-color:rgba(239,68,68,.3)}}
@keyframes v21-zoka-glow{0%,100%{border-color:rgba(245,197,66,.15)}50%{border-color:rgba(245,197,66,.3)}}
@keyframes v21-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes v21-strip{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes v21-card{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes v21-hero-line{from{transform:scaleX(0)}to{transform:scaleX(1)}}

.v21{min-height:100vh;background:var(--bg-primary,#0a0a0b);overflow-x:hidden}
.v21-wrap{max-width:680px;margin:0 auto;padding:0 16px;position:relative}

/* Hero */
.v21-hero{padding:24px 0 0;position:relative}
.v21-hero::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--border),transparent)}
.v21-hero-line{height:2px;border-radius:1px;background:linear-gradient(90deg,var(--accent),var(--gold),var(--accent));animation:v21-hero-line .8s cubic-bezier(.22,1,.36,1) both;margin:16px 0 0}

/* Stat strip */
.v21-statstrip{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:20px 0 24px}
.v21-schip{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 10px;text-align:center;transition:all .2s;position:relative;overflow:hidden}
.v21-schip:hover{border-color:rgba(255,255,255,.1);transform:translateY(-1px)}
.v21-schip .val{font-size:1.15rem;font-weight:900;font-family:var(--font-display);color:var(--text-primary);line-height:1}
.v21-schip .lbl{font-size:.58rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-top:3px}
.v21-schip .bar{height:3px;border-radius:2px;background:rgba(255,255,255,.04);margin-top:6px;overflow:hidden}
.v21-schip .bar-fill{height:100%;border-radius:2px;transform-origin:left;animation:v21-bar .6s cubic-bezier(.22,1,.36,1) both}

/* Section */
.v21-sec{margin-bottom:28px}
.v21-sech{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.v21-sech h2{margin:0;font-size:.95rem;font-weight:900;color:var(--text-primary);white-space:nowrap}
.v21-sech-line{flex:1;height:1px;background:var(--border);border-radius:1px}
.v21-sech-badge{font-size:.6rem;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}

/* Live strip */
.v21-livestrip{display:flex;gap:10px;overflow-x:auto;padding:0 0 6px;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.v21-livestrip::-webkit-scrollbar{display:none}
.v21-livemini{min-width:180px;max-width:220px;flex-shrink:0;padding:10px 12px;background:var(--bg-card);border:1.5px solid rgba(239,68,68,.15);border-radius:12px;scroll-snap-align:start;animation:v21-live-glow 2s ease-in-out infinite,v21-strip .35s cubic-bezier(.22,1,.36,1) both;transition:transform .15s}
.v21-livemini:hover{transform:translateY(-1px)}
.v21-ldot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:v21-pulse 1.2s infinite;box-shadow:0 0 6px rgba(239,68,68,.5);flex-shrink:0}

/* Match card */
.v21-mc{display:flex;flex-direction:column;gap:7px;padding:12px 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:6px;transition:all .15s;animation:v21-card .3s cubic-bezier(.22,1,.36,1) both}
.v21-mc:hover{background:rgba(255,255,255,.012)}
.v21-mc.live{animation:v21-live-glow 2s ease-in-out infinite,v21-card .3s cubic-bezier(.22,1,.36,1) both}
.v21-mc.ft{border-color:rgba(0,230,118,.15)}
.v21-mc.zoka{background:linear-gradient(135deg,rgba(245,197,66,.04),rgba(245,197,66,.01));border-color:rgba(245,197,66,.15);animation:v21-zoka-glow 2.5s ease-in-out infinite,v21-card .3s cubic-bezier(.22,1,.36,1) both}
.v21-mc.dim{opacity:.45}

.v21-mh{display:flex;align-items:center;justify-content:space-between;gap:6px}
.v21-ml{display:flex;align-items:center;gap:5px;min-width:0;flex:1}
.v21-ml img{width:14px;height:14px;border-radius:3px;object-fit:contain;flex-shrink:0}
.v21-ml span{font-size:.66rem;font-weight:700;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v21-st{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:5px;font-size:.58rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;flex-shrink:0}

.v21-tm{display:flex;align-items:center;gap:6px}
.v21-te{flex:1;display:flex;align-items:center;gap:6px;min-width:0}
.v21-te.aw{flex-direction:row-reverse;text-align:right}
.v21-te img{width:22px;height:22px;border-radius:5px;object-fit:contain;flex-shrink:0}
.v21-te span{font-size:.8rem;font-weight:800;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.v21-sb{display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;min-width:72px;justify-content:center;background:rgba(255,255,255,.02);border:1px solid var(--border)}
.v21-sb.lv{background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.15)}
.v21-sb.ft{background:rgba(0,230,118,.04);border-color:rgba(0,230,118,.1)}
.v21-sb.zk{background:rgba(245,197,66,.06);border-color:rgba(245,197,66,.2)}
.v21-sn{font-size:.95rem;font-weight:900;font-family:var(--font-display,monospace);font-variant-numeric:tabular-nums;color:var(--text-primary)}
.v21-sn.r{color:#ef4444}.v21-sn.g{color:var(--accent)}.v21-sn.gd{color:var(--gold,#f5c542)}
.v21-sep{color:var(--text-muted);font-size:.7rem;font-weight:700;opacity:.25}
.v21-vs{font-size:.6rem;font-weight:800;color:var(--text-muted);opacity:.15;letter-spacing:.08em}

.v21-ma{display:flex;align-items:center;gap:5px;justify-content:flex-end;flex-wrap:wrap}

/* Buttons */
.v21-btn{padding:7px 12px;border-radius:8px;font-size:.72rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:all .15s;min-height:34px;font-family:inherit;-webkit-tap-highlight-color:transparent;text-decoration:none;color:inherit}
.v21-btn:active{transform:scale(.97)}
.v21-btn-p{background:var(--accent,#10b981);color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.15)}
.v21-btn-p:hover{filter:brightness(1.08);transform:translateY(-1px)}
.v21-btn-gh{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-muted)}
.v21-btn-gh:hover{border-color:var(--border-hover);color:var(--text-primary)}
.v21-btn-ol{background:transparent;border:1px solid var(--border);color:var(--text-muted)}
.v21-btn-ol:hover{border-color:var(--gold);color:var(--gold)}
.v21-btn-ol.on{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.05)}

/* Badges */
.bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:5px;font-size:.62rem;font-weight:800;white-space:nowrap}
.bdg.ex{background:rgba(0,230,118,.08);color:var(--accent);border:1px solid rgba(0,230,118,.18)}
.bdg.rs{background:rgba(245,197,66,.06);color:var(--gold,#f5c542);border:1px solid rgba(245,197,66,.15)}
.bdg.ms{background:rgba(239,68,68,.06);color:#ef4444;border:1px solid rgba(239,68,68,.12)}
.bdg.pn{background:rgba(255,255,255,.03);color:var(--text-muted);border:1px solid var(--border)}
.bdg.gd{background:rgba(245,197,66,.06);color:var(--gold);border:1px solid rgba(245,197,66,.15)}

/* Explore grid */
.v21-explore{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.v21-ecard{display:flex;flex-direction:column;gap:10px;padding:16px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:14px;text-decoration:none;color:inherit;position:relative;overflow:hidden;transition:all .2s;-webkit-tap-highlight-color:transparent;outline:none}
.v21-ecard:hover{border-color:rgba(255,255,255,.12);transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.1)}
.v21-ecard:active{transform:scale(.98)}
.v21-ecard:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.v21-ecard-accent{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0}

/* Leaderboard row */
.v21-lbrow{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:5px;animation:v21-slide .3s cubic-bezier(.22,1,.36,1) both;transition:background .15s}
.v21-lbrow:hover{background:rgba(255,255,255,.015)}
.v21-lbrow.me{background:rgba(0,230,118,.04);border-color:rgba(0,230,118,.15)}

/* Toast */
.v21-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none;animation:v21-slide .3s cubic-bezier(.22,1,.36,1) both}

/* Toggle */
.v21-toggle{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;margin-top:8px;border-radius:10px;font-size:.8rem;font-weight:700;background:rgba(255,255,255,.02);border:1.5px dashed var(--border);color:var(--text-muted);cursor:pointer;transition:all .2s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.v21-toggle:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);color:var(--text-primary)}
.v21-toggle:active{transform:scale(.98)}
.v21-toggle svg{transition:transform .25s}
.v21-toggle.open svg{transform:rotate(180deg)}

/* Skeleton */
.v21-skel{background:linear-gradient(90deg,var(--bg-surface) 25%,rgba(255,255,255,.03) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:v21-shimmer 1.2s ease-in-out infinite;border-radius:10px}

/* Offline */
.v21-offline{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 16px;background:rgba(239,68,68,.06);border-bottom:1px solid rgba(239,68,68,.15);font-size:.78rem;font-weight:700;color:#ef4444}

/* CTA */
.v21-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px 24px;border-radius:14px;background:var(--accent,#10b981);color:#fff;font-weight:900;font-size:.9rem;border:none;box-shadow:0 4px 20px rgba(0,230,118,.18);cursor:pointer;transition:all .2s;font-family:inherit;animation:v21-cta 3s ease-in-out infinite;-webkit-tap-highlight-color:transparent;text-decoration:none;color:#fff}
.v21-cta:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,230,118,.25)}
.v21-cta:active{transform:scale(.98)}

/* Zoka section wrapper */
.v21-zoka-wrap{background:linear-gradient(135deg,rgba(245,197,66,.03) 0%,transparent 50%);border:1.5px solid rgba(245,197,66,.1);border-radius:14px;padding:14px;margin-bottom:6px}

@media(max-width:640px){
  .v21-statstrip{grid-template-columns:repeat(2,1fr);gap:8px}
  .v21-explore{grid-template-columns:1fr 1fr;gap:8px}
  .v21-schip .val{font-size:1rem}
  .v21-te span{font-size:.74rem}.v21-sn{font-size:.85rem}
  .v21-sb{min-width:62px;padding:4px 8px}
}
@media(max-width:380px){
  .v21-statstrip{gap:6px}
  .v21-schip{padding:10px 8px}
  .v21-schip .val{font-size:.9rem}
  .v21-explore{gap:6px}
  .v21-ecard{padding:12px}
}
@media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════
   LIVE MINI CARD
   ═══════════════════════════════════════ */
const LiveMini = ({ match, index }) => {
  const min = match.elapsed || match.minute;
  return (
    <div className="v21-livemini" style={{ animationDelay: `${index * 60}ms` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{match.league?.name}</span>
        {min ? <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(239,68,68,.1)', padding: '2px 6px', borderRadius: 4 }}><span className="v21-ldot" style={{ width: 4, height: 4 }} /><span style={{ fontSize: '.62rem', fontWeight: 900, color: '#ef4444', fontFamily: 'var(--font-display)' }}>{min}'</span></div> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ flex: 1, fontSize: '.72rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.homeTeam?.shortName || match.homeTeam?.name}</span>
        <span style={{ fontSize: '.85rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{match.homeScore ?? '-'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
        <span style={{ flex: 1, fontSize: '.72rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.awayTeam?.shortName || match.awayTeam?.name}</span>
        <span style={{ fontSize: '.85rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{match.awayScore ?? '-'}</span>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   FEATURED ROW
   ═══════════════════════════════════════ */
const FeaturedRow = ({ pred, userPred, userResult, index, isLoggedIn }) => {
  const isFin = isFinishedStatus(pred.status, SPORT.FOOTBALL) || !!pred.isFinished;
  const isLive = isLiveStatus(pred.status, SPORT.FOOTBALL) || !!pred.isLive;
  const isHT = pred.status === 'ht' || pred.status === 'HT';
  const hasScore = pred.homeScore != null && pred.awayScore != null;
  const isPredicted = !!userPred;
  const isResolved = !!userResult?.resultType && userResult.resultType !== 'pending';
  const isExact = isResolved && userResult.resultType === 'exact';
  const isHit = isResolved && userResult.resultType === 'result';

  let border = 'var(--border)';
  if (isExact) border = 'var(--accent)';
  else if (isHit) border = 'var(--gold)';
  else if (isResolved && !isExact && !isHit) border = '#ef4444';
  else if (isLive || isHT) border = '#ef4444';
  else if (isFin) border = 'rgba(0,230,118,.25)';
  else if (isPredicted) border = '#60a5fa';

  let sLabel = pred.kickoff || 'VS', sColor = 'var(--text-muted)', sBg = 'rgba(255,255,255,.04)';
  if (isLive) { sLabel = pred.minute != null ? `${pred.minute}'` : 'LIVE'; sColor = '#ef4444'; sBg = 'rgba(239,68,68,.1)'; }
  else if (isHT) { sLabel = 'HT'; sColor = '#f97316'; sBg = 'rgba(249,115,22,.1)'; }
  else if (isFin) { sLabel = 'FT'; sColor = 'var(--accent)'; sBg = 'rgba(0,230,118,.08)'; }

  const cls = `v21-mc${isLive ? ' live' : ''}${isFin ? ' ft' : ''}${isFin && !isResolved && !isPredicted ? ' dim' : ''}`;
  const mid = pred.id || pred.matchId;

  return (
    <div className={cls} style={{ borderLeft: `3px solid ${border}`, animationDelay: `${index * 18}ms` }}>
      <div className="v21-mh">
        <div className="v21-ml">
          {pred.league?.emblem && <img src={pred.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.league?.name || 'Featured'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isLive && <span className="v21-ldot" />}
          <span className="v21-st" style={{ color: sColor, background: sBg }}>{sLabel}</span>
        </div>
      </div>
      <div className="v21-tm">
        <div className="v21-te">
          {pred.homeLogo && <img src={pred.homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home'}</span>
        </div>
        <div className={`v21-sb${isLive ? ' lv' : ''}${isFin ? ' ft' : ''}`}>
          {hasScore ? (<><span className={`v21-sn${isLive ? ' r' : ' g'}`}>{pred.homeScore}</span><span className="v21-sep">–</span><span className={`v21-sn${isLive ? ' r' : ' g'}`}>{pred.awayScore}</span></>)
          : <span className="v21-vs">VS</span>}
        </div>
        <div className="v21-te aw">
          {pred.awayLogo && <img src={pred.awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away'}</span>
        </div>
      </div>
      <div className="v21-ma">
        {isResolved ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span className={`bdg ${isExact ? 'ex' : isHit ? 'rs' : 'ms'}`}>
              {isExact ? <><CheckCircle2 size={8} /> EXACT +10</> : isHit ? <><TrendIcon size={8} /> RESULT +3</> : <><XCircle size={8} /> MISS</>}
            </span>
            {isPredicted && <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--text-muted)' }}>You: {userPred.homeScore}–{userPred.awayScore}</span>}
          </div>
        ) : isPredicted ? (
          <Link to="/predictions" className="v21-btn v21-btn-ol on" style={{ minHeight: 32, fontSize: '.66rem', padding: '5px 10px' }}><CheckCircle size={10} /> Locked</Link>
        ) : isLoggedIn ? (
          <Link to={`/predictions?match=${mid}`} className="v21-btn v21-btn-p" style={{ minHeight: 32, fontSize: '.66rem', padding: '5px 10px' }}><Target size={10} /> Predict</Link>
        ) : (
          <Link to="/login" className="v21-btn v21-btn-gh" style={{ minHeight: 32, fontSize: '.66rem', padding: '5px 10px' }}><Lock size={10} /> Login</Link>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   ZOKA ROW
   ═══════════════════════════════════════ */
const ZokaRow = ({ pick, index }) => {
  const isFin = isFinishedStatus(pick.status, SPORT.FOOTBALL);
  const koRaw = pick.kickoff || '';
  const ko = koRaw 
    ? new Date(koRaw.includes('T') ? koRaw : `${pick.matchDate || todayStr()}T${koRaw}:00`).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : 'TBD';
  const predH = pick.adminPick?.home, predA = pick.adminPick?.away;

  return (
    <div className="v21-mc zoka" style={{ animationDelay: `${index * 25}ms` }}>
      <div className="v21-mh">
        <div className="v21-ml">
          {pick.league?.emblem && <img src={pick.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.league?.name || 'Zoka'}</span>
        </div>
        <span className="v21-st" style={{ color: isFin ? 'var(--accent)' : 'var(--text-muted)', background: isFin ? 'rgba(0,230,118,.08)' : 'rgba(255,255,255,.04)' }}>{isFin ? 'FT' : ko || 'TBD'}</span>
      </div>
      <div className="v21-tm">
        <div className="v21-te">
          {pick.homeLogo && <img src={pick.homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.homeTeam?.shortName || pick.homeTeam?.name || '?'}</span>
        </div>
        <div className={`v21-sb${isFin ? ' ft' : ' zk'}`}>
          {isFin && pick.homeScore != null
            ? <><span className="v21-sn g">{pick.homeScore}</span><span className="v21-sep">–</span><span className="v21-sn g">{pick.awayScore}</span></>
            : <span className="v21-sn gd">{predH ?? '?'}–{predA ?? '?'}</span>}
        </div>
        <div className="v21-te aw">
          {pick.awayLogo && <img src={pick.awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.awayTeam?.shortName || pick.awayTeam?.name || '?'}</span>
        </div>
      </div>
      <div className="v21-ma">
        {isFin ? <ZokaBadge pick={pick} />
          : <span className="bdg gd"><Star size={8} fill="currentColor" /> Prediction</span>}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function Home() {
  injectStyles();
  const { currentUser, userProfile } = useAuth();
  const isLoggedIn = !!currentUser;
  const uid = currentUser?.uid;
  const mounted = useRef(true);
  const greeting = useMemo(() => getGreeting(), []);

  const [fixtures, setFixtures] = useState([]);
  const [fxLoading, setFxLoading] = useState(true);
  const [allFeatured, setAllFeatured] = useState([]);
  const [allZoka, setAllZoka] = useState([]);
  const [featLoading, setFeatLoading] = useState(true);
  const [zokaLoading, setZokaLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [userPreds, setUserPreds] = useState({});
  const [userResults, setUserResults] = useState({});
  const [offline, setOffline] = useState(!navigator.onLine);
  const [toast, setToast] = useState(null);
  const [showMoreFeat, setShowMoreFeat] = useState(false);
  const [showMoreZoka, setShowMoreZoka] = useState(false);
  const [showMoreLB, setShowMoreLB] = useState(false);

  /* ★ Aligned: Accurately use backend-provided stats from daily leaderboard */
  const [stats, setStats] = useState({ users: 0, predictions: 0, accuracy: 0, totalPoints: 0, totalPossible: 0 });
  const [totalUsers, setTotalUsers] = useState(null);

  useEffect(() => {
    const on = () => setOffline(false); const off = () => setOffline(true);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* 1. Fixtures */
  useEffect(() => {
    let mnt = true;
    (async () => {
      try {
        const data = await fetchFixtures(todayStr());
        if (mnt && data) { const l = Array.isArray(data) ? data : data?.matches || []; setFixtures(l); }
      } catch {} finally { if (mnt) setFxLoading(false); }
    })();
    const unsub = subscribeToTodayFixtures((u) => {
      if (!mnt) return;
      const l = u?.matches || u || [];
      setFixtures(prev => prev.length === 0 ? l : prev.map(f => {
        const live = l.find(m => String(m.id) === String(f.id));
        return live ? { ...f, homeScore: live.homeScore ?? f.homeScore, awayScore: live.awayScore ?? f.awayScore, isLive: true, isFinished: false, minute: live.minute ?? f.minute, status: live.status || f.status } : f;
      }));
      setFxLoading(false);
    });
    return () => { mnt = false; if (unsub) unsub(); };
  }, []);

  /* 2. Featured + Zoka + Leaderboard */
  useEffect(() => {
    let mnt = true;
    (async () => {
      try {
        const [pr, zk, lb] = await Promise.allSettled([
          Promise.all(FETCH_DATES.map(d => dataLayer.fetchActivePredictions(d).catch(() => null))),
          Promise.all(FETCH_DATES.map(d => dataLayer.fetchZokaPicks(d).catch(() => null))),
          dataLayer.fetchDailyLeaderboard(todayStr()),
        ]);
        if (!mnt) return;

        if (pr.status === 'fulfilled') {
          const g = []; pr.value.forEach((d, i) => { if (d) { const l = Array.isArray(d) ? d : []; if (l.length) g.push({ date: FETCH_DATES[i], matches: l.slice(0, 12) }); } });
          g.sort((a, b) => a.date.localeCompare(b.date)); setAllFeatured(g);
        }
        if (zk.status === 'fulfilled') {
          const g = []; zk.value.forEach((d, i) => { if (d) { const m = d?.matches || (Array.isArray(d) ? d : []); if (m.length) g.push({ date: FETCH_DATES[i], matches: m }); } });
          g.sort((a, b) => a.date.localeCompare(b.date)); setAllZoka(g);
        }
        if (lb.status === 'fulfilled' && lb.value?.entries) {
          const entries = lb.value.entries;
          setLeaderboard(entries.slice(0, 15));
          
          // ★ Use backend pre-calculated stats directly for perfect accuracy
          const lbStats = lb.value.stats || {};
          setStats({
            users: entries.length,
            predictions: lbStats.preds || 0,
            accuracy: Math.round(parseFloat(lbStats.avg || '0')) || 0,
            totalPoints: entries.reduce((s, e) => s + (e.points || 0), 0),
            totalPossible: (lbStats.preds || 0) * 10
          });
        }
      } catch {} finally { if (mnt) { setFeatLoading(false); setZokaLoading(false); setLbLoading(false); } }
    })();
    return () => { mnt = false; };
  }, []);

  /* 3. User predictions & results */
  useEffect(() => {
    if (!isLoggedIn || !uid) return;
    let mnt = true;
    (async () => {
      try {
        const [pd, rd] = await Promise.all([
          dataLayer.fetchUserPredictions(uid, todayStr()).catch(() => ({})),
          dataLayer.fetchPredictionResults(uid, todayStr()).catch(() => ({ results: [], resultMap: {} })),
        ]);
        if (!mnt) return;
        if (pd) { const m = {}; Object.values(pd).forEach(p => { m[p.predId || p.matchId] = p; }); setUserPreds(m); }
        if (rd?.resultMap) setUserResults(rd.resultMap);
      } catch {}
    })();
    return () => { mnt = false; };
  }, [isLoggedIn, uid]);

  /* 4. Total users */
  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), limit(1))).then(s => {
      if (!s.empty && mounted.current) setTotalUsers(s.docs[0].data().totalUsers || null);
    }).catch(() => {});
  }, []);

  /* 5. Event bus */
  useEffect(() => {
    const u1 = eventBus.on(EVENT.ZOKA_PICKS_UPDATED, (p) => {
      if (!FETCH_DATES.includes(p.dateStr) || !p.picks?.matches) return;
      setAllZoka(prev => { const u = [...prev]; const i = u.findIndex(g => g.date === p.dateStr); const m = p.picks.matches;
        if (i >= 0) u[i] = { ...u[i], matches: m }; else if (m.length) { u.push({ date: p.dateStr, matches: m }); u.sort((a, b) => a.date.localeCompare(b.date)); } return u; });
    });
    const u2 = eventBus.on(EVENT.PREDICTIONS_UPDATED, (p) => {
      if (!FETCH_DATES.includes(p.dateStr) || !p.predictions) return;
      const l = Array.isArray(p.predictions) ? p.predictions : [];
      setAllFeatured(prev => { const u = [...prev]; const i = u.findIndex(g => g.date === p.dateStr);
        if (i >= 0) u[i] = { ...u[i], matches: l.slice(0, 12) }; else if (l.length) { u.push({ date: p.dateStr, matches: l.slice(0, 12) }); u.sort((a, b) => a.date.localeCompare(b.date)); } return u; });
    });
    const u3 = eventBus.on(EVENT.DAILY_LEADERBOARD_UPDATED, (p) => {
      if (p.dateStr === todayStr() && p.leaderboard?.entries) {
        const entries = p.leaderboard.entries; setLeaderboard(entries.slice(0, 15));
        const lbStats = p.leaderboard.stats || {};
        setStats(prev => ({ 
          ...prev, 
          users: entries.length, 
          predictions: lbStats.preds || 0, 
          accuracy: Math.round(parseFloat(lbStats.avg || '0')) || 0,
          totalPoints: entries.reduce((s, e) => s + (e.points || 0), 0),
          totalPossible: (lbStats.preds || 0) * 10
        }));
      }
    });
    const u4 = eventBus.on(EVENT.MATCH_RESOLVED, (p) => {
      if (isLoggedIn && uid && p.affectedUsers?.includes(uid)) {
        Promise.all([dataLayer.fetchPredictionResults(uid, todayStr()), dataLayer.fetchDailyLeaderboard(todayStr())]).then(([r, lb]) => {
          if (!mounted.current) return;
          if (r?.resultMap) setUserResults(prev => ({ ...prev, ...r.resultMap }));
          if (lb?.entries) setLeaderboard(lb.entries.slice(0, 15));
        });
      }
    });
    return () => { u1(); u2(); u3(); u4(); };
  }, [isLoggedIn, uid]);

  /* ═══ DERIVED ═══ */
  const liveMatches = useMemo(() => fixtures.filter(f => { const s = estimateMatchStatus(f); return s === 'live' || s === 'ht'; }), [fixtures]);
  const liveCount = liveMatches.length;

  const featFlat = useMemo(() => allFeatured.flatMap(g => g.matches.map(m => ({ ...m, _d: g.date }))), [allFeatured]);
  const featVis = showMoreFeat ? featFlat : featFlat.slice(0, 5);
  const featHidden = Math.max(0, featFlat.length - 5);

  const zokaFlat = useMemo(() => allZoka.flatMap(g => g.matches.map(m => ({ ...m, _d: g.date }))), [allZoka]);
  const zokaVis = showMoreZoka ? zokaFlat : zokaFlat.slice(0, 4);
  const zokaHidden = Math.max(0, zokaFlat.length - 4);

  const lbVis = showMoreLB ? leaderboard : leaderboard.slice(0, 5);
  const lbHidden = Math.max(0, leaderboard.length - 5);

  const todayFeat = useMemo(() => allFeatured.find(g => g.date === todayStr())?.matches || [], [allFeatured]);
  const myExact = useMemo(() => todayFeat.filter(p => { const r = userResults[String(p.matchId || p.id)]; return r?.resultType === 'exact'; }).length, [todayFeat, userResults]);
  const myResult = useMemo(() => todayFeat.filter(p => { const r = userResults[String(p.matchId || p.id)]; return r?.resultType === 'result'; }).length, [todayFeat, userResults]);
  const myPredicted = useMemo(() => todayFeat.filter(p => userPreds[p.id || p.matchId]).length, [todayFeat, userPreds]);

  useEffect(() => { return () => { mounted.current = false; }; }, []);

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => { if (mounted.current) setToast(null); }, 2800); }, []);

  const AVATAR_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];

  return (
    <div className="v21">
      <SEO title="Football Predictions, Fixtures & Live Scores — ZOKASCORE" description="Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world." keywords="football predictions, live scores, fixtures, ZOKASCORE" path="/" />

      {offline && <div className="v21-offline"><WifiOff size={14} /> You're offline — showing cached data</div>}

      <div className="v21-wrap">
        {/* ═══ HERO ═══ */}
        <section className="v21-hero">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, animation: 'v21-fade-up .5s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.3rem' }}>{greeting.emoji}</span>
              <div>
                <h1 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                  {greeting.text}{userProfile?.displayName ? `, ${userProfile.displayName.split(' ')[0]}` : ''} {greeting.icon}
                </h1>
                <p style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--text-muted)', margin: '2px 0 0' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>
            <LiveClock />
          </div>
          <div className="v21-hero-line" />
        </section>

        {/* ═══ LIVE STRIP ═══ */}
        {liveCount > 0 && (
          <div style={{ margin: '18px 0 0', animation: 'v21-fade-up .4s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="v21-ldot" /><span style={{ fontSize: '.76rem', fontWeight: 900, color: '#ef4444' }}>{liveCount} LIVE</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(239,68,68,.12)', borderRadius: 1 }} />
              <Link to="/predictions" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>View all <ChevronRight size={11} /></Link>
            </div>
            <div className="v21-livestrip">{liveMatches.map((m, i) => <LiveMini key={m.id || i} match={m} index={i} />)}</div>
          </div>
        )}

        {/* ═══ STATS STRIP ═══ */}
        <div className="v21-statstrip" style={{ animation: 'v21-fade-up .5s cubic-bezier(.22,1,.36,1) 100ms both' }}>
          <div className="v21-schip">
            <div className="val"><AnimNum value={totalUsers || stats.users} delay={200} /></div>
            <div className="lbl">Users</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, (stats.users || 0) / 5)}%`, background: '#60a5fa', animationDelay: '400ms' }} /></div>
          </div>
          <div className="v21-schip">
            <div className="val"><AnimNum value={stats.predictions} delay={280} /></div>
            <div className="lbl">Predictions</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, stats.predictions / 10)}%`, background: 'var(--gold)', animationDelay: '500ms' }} /></div>
          </div>
          <div className="v21-schip" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', right: 8, top: 8 }}><AccuracyRing value={stats.accuracy} size={36} stroke={3} color={stats.accuracy >= 50 ? 'var(--accent)' : stats.accuracy >= 25 ? 'var(--gold)' : '#ef4444'} /></div>
            <div className="val" style={{ fontSize: '.95rem' }}><AnimNum value={stats.accuracy} delay={360} suffix="%" /></div>
            <div className="lbl">Accuracy</div>
          </div>
          <div className="v21-schip">
            <div className="val" style={{ color: isLoggedIn ? 'var(--accent)' : 'var(--text-primary)' }}>
              {isLoggedIn ? <><AnimNum value={myExact * 10 + myResult * 3} delay={440} /></> : '—'}
            </div>
            <div className="lbl">{isLoggedIn ? 'My Points' : 'My Points'}</div>
            {isLoggedIn && <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, (myExact * 10 + myResult * 3) / 5)}%`, background: 'var(--accent)', animationDelay: '600ms' }} /></div>}
          </div>
        </div>

        {/* ═══ ZOKA PICKS ═══ */}
        {!zokaLoading && zokaFlat.length > 0 && (
          <div className="v21-sec" style={{ animation: 'v21-fade-up .5s cubic-bezier(.22,1,.36,1) 150ms both' }}>
            <div className="v21-sech">
              <Star size={14} style={{ color: 'var(--gold)' }} />
              <h2>Zoka Picks</h2>
              <span className="v21-sech-badge" style={{ background: 'rgba(245,197,66,.08)', color: 'var(--gold)', border: '1px solid rgba(245,197,66,.15)' }}>{zokaFlat.length}</span>
              <div className="v21-sech-line" />
            </div>
            <div className="v21-zoka-wrap">
              {zokaVis.map((p, i) => {
                const showDate = i === 0 || p._d !== zokaVis[i - 1]?._d;
                return (
                  <Fragment key={p.matchId || i}>
                    {showDate && allZoka.length > 1 && <DateDivider date={p._d} accent="var(--gold)" />}
                    <ZokaRow pick={p} index={i} />
                  </Fragment>
                );
              })}
            </div>
            {zokaHidden > 0 && (
              <button className="v21-toggle" onClick={() => setShowMoreZoka(p => !p)}>
                {showMoreZoka ? 'Show less' : `Show ${zokaHidden} more`} <ChevronDown size={13} />
              </button>
            )}
          </div>
        )}

        {/* ═══ FEATURED MATCHES ═══ */}
        <div className="v21-sec" style={{ animation: 'v21-fade-up .5s cubic-bezier(.22,1,.36,1) 200ms both' }}>
          <div className="v21-sech">
            <Target size={14} style={{ color: 'var(--accent)' }} />
            <h2>Featured — Compete</h2>
            <span className="v21-sech-badge" style={{ background: 'rgba(0,230,118,.08)', color: 'var(--accent)', border: '1px solid rgba(0,230,118,.15)' }}>{featFlat.length}</span>
            {isLoggedIn && <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--text-muted)' }}>{myPredicted}/{todayFeat.length} predicted</span>}
            <div className="v21-sech-line" />
          </div>
          {featLoading ? (
            <div>{Array.from({ length: 4 }).map((_, i) => <div key={i} className="v21-skel" style={{ height: 90, marginBottom: 6, animationDelay: `${i * 60}ms` }} />)}</div>
          ) : featVis.length > 0 ? (
            <>
              {featVis.map((p, i) => {
                const showDate = i === 0 || p._d !== featVis[i - 1]?._d;
                return (
                  <Fragment key={p.id || String(p.matchId) || i}>
                    {showDate && allFeatured.length > 1 && <DateDivider date={p._d} accent="var(--accent)" />}
                    <FeaturedRow pred={p} userPred={userPreds[p.id || p.matchId]} userResult={userResults[String(p.matchId || p.id)]} index={i} isLoggedIn={isLoggedIn} />
                  </Fragment>
                );
              })}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: '.82rem', fontWeight: 600 }}>
              No featured matches right now
              <div style={{ fontSize: '.7rem', opacity: .5, marginTop: 4 }}>Check back later or go to Predictions</div>
            </div>
          )}
          {featHidden > 0 && (
            <button className="v21-toggle" onClick={() => setShowMoreFeat(p => !p)}>
              {showMoreFeat ? 'Show less' : `Show ${featHidden} more`} <ChevronDown size={13} />
            </button>
          )}
        </div>

        {/* ═══ LEADERBOARD ═══ */}
        <div className="v21-sec" style={{ animation: 'v21-fade-up .5s cubic-bezier(.22,1,.36,1) 250ms both' }}>
          <div className="v21-sech">
            <Trophy size={14} style={{ color: 'var(--gold)' }} />
            <h2>Daily Leaderboard</h2>
            <div className="v21-sech-line" />
            <Link to="/leaderboard" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>Full <ArrowUpRight size={11} /></Link>
          </div>
          {lbLoading ? (
            <div>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="v21-skel" style={{ height: 48, marginBottom: 5, animationDelay: `${i * 50}ms` }} />)}</div>
          ) : leaderboard.length > 0 ? (
            <>
              <MiniPodium entries={leaderboard} />
              <div style={{ marginTop: 10 }}>
                {lbVis.slice(3).map((u, i) => {
                  const isMe = isLoggedIn && u.uid === uid;
                  const rank = u.rank || (i + 4);
                  const color = AVATAR_COLORS[(rank - 1) % AVATAR_COLORS.length];
                  return (
                    <div key={u.uid} className={`v21-lbrow${isMe ? ' me' : ''}`} style={{ animationDelay: `${(i + 3) * 25}ms` }}>
                      <span style={{ width: 28, textAlign: 'center', fontWeight: 900, color: rank <= 10 ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>#{rank}</span>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.66rem', fontWeight: 800, color: '#fff' }}>{(u.displayName || '??').slice(0, 2).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName}{isMe && <span style={{ marginLeft: 5, fontSize: '.56rem', color: 'var(--accent)' }}>(YOU)</span>}</div>
                        <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.predictions || 0} preds · {u.accuracy || 0}%</div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: '#a855f7', fontSize: '.85rem' }}>{u.points || 0}</span>
                    </div>
                  );
                })}
              </div>
              {lbHidden > 0 && (
                <button className="v21-toggle" onClick={() => setShowMoreLB(p => !p)}>
                  {showMoreLB ? 'Show less' : `Show ${lbHidden} more`} <ChevronDown size={13} />
                </button>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '.82rem', fontWeight: 600, border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--bg-surface)' }}>
              No leaderboard entries yet
            </div>
          )}
        </div>

        {/* ═══ EXPLORE ═══ */}
        <div className="v21-sec" style={{ animation: 'v21-fade-up .5s cubic-bezier(.22,1,.36,1) 300ms both' }}>
          <div className="v21-sech">
            <Sparkles size={14} style={{ color: 'var(--text-muted)' }} />
            <h2>Explore</h2>
            <div className="v21-sech-line" />
          </div>
          <div className="v21-explore">
            <Link to="/predictions" className="v21-ecard" style={{ borderColor: 'rgba(0,230,118,.12)' }}>
              <div className="v21-ecard-accent" style={{ background: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>Predict Matches</span>
                  <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>Win points & climb ranks</span>
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,230,118,.06)', border: '1px solid rgba(0,230,118,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                  <Target size={15} />
                </div>
              </div>
            </Link>
            <Link to="/leaderboard" className="v21-ecard" style={{ borderColor: 'rgba(245,197,66,.12)' }}>
              <div className="v21-ecard-accent" style={{ background: 'var(--gold)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>Leaderboards</span>
                  <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>Top predictors today</span>
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(245,197,66,.06)', border: '1px solid rgba(245,197,66,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)' }}>
                  <Trophy size={15} />
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* ═══ CTA ═══ */}
        {!isLoggedIn && (
          <div style={{ marginTop: 8, animation: 'v21-fade-up .5s cubic-bezier(.22,1,.36,1) 350ms both' }}>
            <Link to="/login" className="v21-cta">
              <LogIn size={16} /> Login to Compete
            </Link>
          </div>
        )}
        {isLoggedIn && (
          <div style={{ marginTop: 8, animation: 'v21-fade-up .5s cubic-bezier(.22,1,.36,1) 350ms both' }}>
            <Link to="/predictions" className="v21-cta">
              <Zap size={16} /> Make Your Predictions
            </Link>
          </div>
        )}

      </div>

      {toast && (
        <div className="v21-toast">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 13, background: 'rgba(0,230,118,.1)', border: '1.5px solid rgba(0,230,118,.25)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--accent)' }}>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}