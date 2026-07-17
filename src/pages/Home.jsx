// ═══════════════════════════════════════════════════════════════════
// FILE: src/pages/Home.jsx
// v23.2 — Reactive Architecture, Smart Live Merging, SEO Internal Links
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Users, Target, Trophy, CalendarDays, Flame,
  ChevronDown, WifiOff, LogIn, Star, CheckCircle, CheckCircle2,
  Clock, Lock, Crown, Activity, Medal, BarChart3, XCircle,
  ArrowUpRight, Sun, Moon, CloudSun, Timer, Gamepad2,
  TrendingUp as TrendIcon, ChevronRight, Newspaper
} from 'lucide-react';

import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { useFootballData } from '../context/FootballDataContext';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { todayStr as getTodayStr, getLocalDateFromUtc, formatTime } from '../utils/dates';
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';
import { db } from '../utils/firebase';
import { collection, query, limit, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
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
  if (h < 5) return { text: 'Burning the midnight oil', icon: <Moon size={16} />, emoji: '🦉' };
  if (h < 12) return { text: 'Good morning', icon: <Sun size={16} />, emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', icon: <CloudSun size={16} />, emoji: '🌤️' };
  if (h < 21) return { text: 'Good evening', icon: <Sunset size={16} />, emoji: '🌅' };
  return { text: 'Good night', icon: <Moon size={16} />, emoji: '🦉' };
};

const slugify = (text) => {
  return String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);
};

// Simplified normalizeMatch because fetchFixtures already transforms the data
function normalizeMatch(raw) {
  if (!raw) return null;
  const id = String(raw.id || raw.matchId);
  const status = raw.status || '';
  
  return {
    id, 
    status,
    isLive: raw.isLive || isLiveStatus(status, SPORT.FOOTBALL),
    isFinished: raw.isFinished || isFinishedStatus(status, SPORT.FOOTBALL),
    homeTeam: { 
      name: raw.homeTeam?.name || 'TBD', 
      shortName: raw.homeTeam?.shortName || raw.homeTeam?.name || 'TBD' 
    },
    awayTeam: { 
      name: raw.awayTeam?.name || 'TBD', 
      shortName: raw.awayTeam?.shortName || raw.awayTeam?.name || 'TBD' 
    },
    homeScore: raw.homeScore ?? null,
    awayScore: raw.awayScore ?? null,
    league: { name: raw.league?.name || raw.competition?.name || 'Other' },
    minute: raw.minute || raw.elapsed || null,
    kickoff: raw.kickoff || 'TBD'
  };
}

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
    return () => { if (raf) cancelAnimationFrame(raf.current); };
  }, [value, duration, delay]);
  return <>{display.toLocaleString()}{suffix}</>;
}

/* ═══════════════════════════════════════
   ACCURACY RING
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
   MINI PODIUM
   ═══════════════════════════════════════ */
function MiniPodium({ entries }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;
  const order = [1, 0, 2];
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
              {pos === 0 && <Crown size={14} style={{ color: 'var(--gold)', marginBottom: -2, animation: 'v23-crown 3s ease-in-out infinite' }} />}
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
   STYLES
   ═══════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('home-v23-css')) return;
  const s = document.createElement('style');
  s.id = 'home-v23-css';
  s.textContent = `
@keyframes v23-fade-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes v23-slide{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
@keyframes v23-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.5)}}
@keyframes v23-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes v23-cta{0%,100%{box-shadow:0 4px 20px rgba(0,230,118,.15)}50%{box-shadow:0 4px 32px rgba(0,230,118,.3)}}
@keyframes v23-crown{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-3px) rotate(3deg)}}
@keyframes v23-live-glow{0%,100%{border-color:rgba(239,68,68,.12)}50%{border-color:rgba(239,68,68,.3)}}
@keyframes v23-zoka-glow{0%,100%{border-color:rgba(245,197,66,.15)}50%{border-color:rgba(245,197,66,.3)}}
@keyframes v23-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes v23-strip{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes v23-card{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes v23-title-line{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
@keyframes v23-news-marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }

.v23{min-height:100vh;background:var(--bg-primary,#0a0a0b);overflow-x:hidden}
.v23-wrap{max-width:660px;margin:0 auto;padding:0 16px;position:relative}

.v23-hero{padding:32px 0 20px;position:relative;text-align:center}
.v23-title{font-size:2.4rem;font-weight:900;letter-spacing:-.03em;margin:0;line-height:1;background:linear-gradient(135deg,var(--text-primary),var(--text-muted));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.v23-title span{color:var(--accent);-webkit-text-fill-color:var(--accent)}
.v23-sub{font-size:.8rem;font-weight:600;color:var(--text-muted);margin:6px 0 0;display:flex;align-items:center;justify-content:center;gap:6px}
.v23-title-line{height:3px;width:80px;margin:14px auto 0;background:linear-gradient(90deg,var(--accent),var(--gold));border-radius:2px;transform-origin:center;animation:v23-title-line .8s cubic-bezier(.22,1,.36,1) both}

.v23-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0 22px}
.v23-chip{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 8px;text-align:center;transition:all .2s;position:relative;overflow:hidden}
.v23-chip:hover{border-color:rgba(255,255,255,.1);transform:translateY(-1px)}
.v23-chip .val{font-size:1.1rem;font-weight:900;font-family:var(--font-display);color:var(--text-primary);line-height:1}
.v23-chip .lbl{font-size:.56rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:3px}
.v23-chip .bar{height:3px;border-radius:2px;background:rgba(255,255,255,.04);margin-top:5px;overflow:hidden}
.v23-chip .bar-fill{height:100%;border-radius:2px;transform-origin:left;animation:v23-bar .6s cubic-bezier(.22,1,.36,1) both}

.v23-sec{margin-bottom:26px}
.v23-sech{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.v23-sech h2{margin:0;font-size:.92rem;font-weight:900;color:var(--text-primary);white-space:nowrap}
.v23-sech-line{flex:1;height:1px;background:var(--border);border-radius:1px}
.v23-sech-badge{font-size:.58rem;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.03em;flex-shrink:0}

.v23-livestrip{display:flex;gap:10px;overflow-x:auto;padding:0 0 6px;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.v23-livestrip::-webkit-scrollbar{display:none}
.v23-livemini{min-width:175px;max-width:210px;flex-shrink:0;padding:10px 12px;background:var(--bg-card);border:1.5px solid rgba(239,68,68,.15);border-radius:12px;scroll-snap-align:start;animation:v23-live-glow 2s ease-in-out infinite,v23-strip .35s cubic-bezier(.22,1,.36,1) both;transition:transform .15s}
.v23-livemini:hover{transform:translateY(-1px)}
.v23-ldot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:v23-pulse 1.2s infinite;box-shadow:0 0 6px rgba(239,68,68,.5);flex-shrink:0}

.v23-mc{display:flex;flex-direction:column;gap:7px;padding:12px 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:6px;transition:all .15s;animation:v23-card .3s cubic-bezier(.22,1,.36,1) both}
.v23-mc:hover{background:rgba(255,255,255,.012)}
.v23-mc.live{animation:v23-live-glow 2s ease-in-out infinite,v23-card .3s cubic-bezier(.22,1,.36,1) both}
.v23-mc.ft{border-color:rgba(0,230,118,.15)}
.v23-mc.zoka{background:linear-gradient(135deg,rgba(245,197,66,.04),rgba(245,197,66,.01));border-color:rgba(245,197,66,.15);animation:v23-zoka-glow 2.5s ease-in-out infinite,v23-card .3s cubic-bezier(.22,1,.36,1) both}
.v23-mc.dim{opacity:.45}

.v23-mh{display:flex;align-items:center;justify-content:space-between;gap:6px}
.v23-ml{display:flex;align-items:center;gap:5px;min-width:0;flex:1}
.v23-ml img{width:14px;height:14px;border-radius:3px;object-fit:contain;flex-shrink:0}
.v23-ml span{font-size:.64rem;font-weight:700;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v23-st{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:5px;font-size:.56rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;flex-shrink:0}

.v23-tm{display:flex;align-items:center;gap:6px}
.v23-te{flex:1;display:flex;align-items:center;gap:6px;min-width:0}
.v23-te.aw{flex-direction:row-reverse;text-align:right}
.v23-te img{width:22px;height:22px;border-radius:5px;object-fit:contain;flex-shrink:0}
.v23-te span{font-size:.78rem;font-weight:800;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.v23-sb{display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;min-width:68px;justify-content:center;background:rgba(255,255,255,.02);border:1px solid var(--border)}
.v23-sb.lv{background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.15)}
.v23-sb.ft{background:rgba(0,230,118,.04);border-color:rgba(0,230,118,.1)}
.v23-sb.zk{background:rgba(245,197,66,.06);border-color:rgba(245,197,66,.2)}
.v23-sn{font-size:.92rem;font-weight:900;font-family:var(--font-display,monospace);font-variant-numeric:tabular-nums;color:var(--text-primary)}
.v23-sn.r{color:#ef4444}.v23-sn.g{color:var(--accent)}.v23-sn.gd{color:var(--gold,#f5c542)}
.v23-sep{color:var(--text-muted);font-size:.7rem;font-weight:700;opacity:.25}
.v23-vs{font-size:.58rem;font-weight:800;color:var(--text-muted);opacity:.15;letter-spacing:.08em}

.v23-ma{display:flex;align-items:center;gap:5px;justify-content:flex-end;flex-wrap:wrap}

.v23-btn{padding:6px 11px;border-radius:8px;font-size:.7rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:all .15s;min-height:32px;font-family:inherit;-webkit-tap-highlight-color:transparent;text-decoration:none;color:inherit}
.v23-btn:active{transform:scale(.97)}
.v23-btn-p{background:var(--accent,#10b981);color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.15)}
.v23-btn-p:hover{filter:brightness(1.08);transform:translateY(-1px)}
.v23-btn-gh{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-muted)}
.v23-btn-gh:hover{border-color:var(--border-hover);color:var(--text-primary)}
.v23-btn-ol{background:transparent;border:1px solid var(--border);color:var(--text-muted)}
.v23-btn-ol:hover{border-color:var(--gold);color:var(--gold)}
.v23-btn-ol.on{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.05)}

.bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:5px;font-size:.6rem;font-weight:800;white-space:nowrap}
.bdg.ex{background:rgba(0,230,118,.08);color:var(--accent);border:1px solid rgba(0,230,118,.18)}
.bdg.rs{background:rgba(245,197,66,.06);color:var(--gold,#f5c542);border:1px solid rgba(245,197,66,.15)}
.bdg.ms{background:rgba(239,68,68,.06);color:#ef4444;border:1px solid rgba(239,68,68,.12)}
.bdg.pn{background:rgba(255,255,255,.03);color:var(--text-muted);border:1px solid var(--border)}
.bdg.gd{background:rgba(245,197,66,.06);color:var(--gold);border:1px solid rgba(245,197,66,.15)}

.v23-explore{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.v23-ecard{display:flex;flex-direction:column;gap:10px;padding:14px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:14px;text-decoration:none;color:inherit;position:relative;overflow:hidden;transition:all .2s;-webkit-tap-highlight-color:transparent;outline:none}
.v23-ecard:hover{border-color:rgba(255,255,255,.12);transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.1)}
.v23-ecard:active{transform:scale(.98)}
.v23-ecard-accent{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0}

.v23-lbrow{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:5px;animation:v23-slide .3s cubic-bezier(.22,1,.36,1) both;transition:background .15s}
.v23-lbrow:hover{background:rgba(255,255,255,.015)}
.v23-lbrow.me{background:rgba(0,230,118,.04);border-color:rgba(0,230,118,.15)}

.v23-toggle{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;margin-top:8px;border-radius:10px;font-size:.78rem;font-weight:700;background:rgba(255,255,255,.02);border:1.5px dashed var(--border);color:var(--text-muted);cursor:pointer;transition:all .2s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.v23-toggle:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);color:var(--text-primary)}
.v23-toggle:active{transform:scale(.98)}
.v23-toggle svg{transition:transform .25s}
.v23-toggle.open svg{transform:rotate(180deg)}

.v23-skel{background:linear-gradient(90deg,var(--bg-surface) 25%,rgba(255,255,255,.03) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:v23-shimmer 1.2s ease-in-out infinite;border-radius:10px}

.v23-offline{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 16px;background:rgba(239,68,68,.06);border-bottom:1px solid rgba(239,68,68,.15);font-size:.76rem;font-weight:700;color:#ef4444}

.v23-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px 24px;border-radius:14px;background:var(--accent,#10b981);color:#fff;font-weight:900;font-size:.88rem;border:none;box-shadow:0 4px 20px rgba(0,230,118,.18);cursor:pointer;transition:all .2s;font-family:inherit;animation:v23-cta 3s ease-in-out infinite;-webkit-tap-highlight-color:transparent;text-decoration:none}
.v23-cta:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,230,118,.25)}
.v23-cta:active{transform:scale(.98)}

.v23-zoka-wrap{background:linear-gradient(135deg,rgba(245,197,66,.03) 0%,transparent 50%);border:1.5px solid rgba(245,197,66,.1);border-radius:14px;padding:14px;margin-bottom:6px}

.v23-news-marquee { display: flex; gap: 14px; animation: v23-news-marquee 40s linear infinite; width: max-content; padding: 4px 0; }
.v23-news-marquee:hover { animation-play-state: paused; }
.v23-newsmini { display: flex; flex-direction: column; min-width: 200px; max-width: 220px; height: 150px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; transition: transform .2s, border-color .2s; position: relative; }
.v23-newsmini:hover { transform: translateY(-2px); border-color: rgba(59,130,246,0.4); box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
.v23-news-img { width: 100%; height: 80px; object-fit: cover; background: var(--bg-surface); }
.v23-news-img-ph { width: 100%; height: 80px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(59,130,246,0.1), rgba(59,130,246,0.02)); color: var(--accent); }
.v23-news-body { padding: 8px 10px; flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
.v23-news-cat { font-size: 0.55rem; font-weight: 800; text-transform: uppercase; color: var(--accent); letter-spacing: 0.05em; }
.v23-news-title { margin: 0; font-size: 0.68rem; font-weight: 700; color: var(--text-primary); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; }

@media(max-width:640px){
  .v23-stats{grid-template-columns:repeat(2,1fr);gap:8px}
  .v23-chip .val{font-size:.95rem}
  .v23-te span{font-size:.72rem}.v23-sn{font-size:.82rem}
  .v23-sb{min-width:60px;padding:4px 8px}
  .v23-title{font-size:2rem}
}
@media(max-width:380px){
  .v23-stats{gap:6px}.v23-chip{padding:10px 6px}.v23-chip .val{font-size:.85rem}
  .v23-ecard{padding:12px}
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
  const isLive = match.isLive || isLiveStatus(match.status, SPORT.FOOTBALL);
  const hasScore = match.homeScore != null && match.awayScore != null;
  
  return (
    <div className="v23-livemini" style={{ animationDelay: `${index * 60}ms`, borderColor: isLive ? 'rgba(239,68,68,.15)' : 'var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{match.league?.name}</span>
        {isLive && min ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(239,68,68,.1)', padding: '2px 6px', borderRadius: 4 }}>
            <span className="v23-ldot" style={{ width: 4, height: 4 }} />
            <span style={{ fontSize: '.6rem', fontWeight: 900, color: '#ef4444', fontFamily: 'var(--font-display)' }}>{min}'</span>
          </div>
        ) : (
          <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>{match.kickoff || 'VS'}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ flex: 1, fontSize: '.7rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.homeTeam?.shortName || match.homeTeam?.name}</span>
        <span style={{ fontSize: '.82rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: isLive ? '#ef4444' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{hasScore ? match.homeScore : '-'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
        <span style={{ flex: 1, fontSize: '.7rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.awayTeam?.shortName || match.awayTeam?.name}</span>
        <span style={{ fontSize: '.82rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: isLive ? '#ef4444' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{hasScore ? match.awayScore : '-'}</span>
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

  const cls = `v23-mc${isLive ? ' live' : ''}${isFin ? ' ft' : ''}${isFin && !isResolved && !isPredicted ? ' dim' : ''}`;
  const mid = pred.id || pred.matchId;

  return (
    <div className={cls} style={{ borderLeft: `3px solid ${border}`, animationDelay: `${index * 18}ms` }}>
      <div className="v23-mh">
        <div className="v23-ml">
          {pred.league?.emblem && <img src={pred.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.league?.name || 'Featured'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isLive && <span className="v23-ldot" />}
          <span className="v23-st" style={{ color: sColor, background: sBg }}>{sLabel}</span>
        </div>
      </div>
      <div className="v23-tm">
        <div className="v23-te">
          {pred.homeLogo && <img src={pred.homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home'}</span>
        </div>
        <div className={`v23-sb${isLive ? ' lv' : ''}${isFin ? ' ft' : ''}`}>
          {hasScore ? (
            <>
              <span className={`v23-sn${isLive ? ' r' : ' g'}`}>{pred.homeScore}</span>
              <span className="v23-sep">–</span>
              <span className={`v23-sn${isLive ? ' r' : ' g'}`}>{pred.awayScore}</span>
            </>
          ) : (
            <span className="v23-vs">VS</span>
          )}
        </div>
        <div className="v23-te aw">
          {pred.awayLogo && <img src={pred.awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away'}</span>
        </div>
      </div>
      <div className="v23-ma">
        {isResolved ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span className={`bdg ${isExact ? 'ex' : isHit ? 'rs' : 'ms'}`}>
              {isExact ? <><CheckCircle2 size={8} /> EXACT +10</> : isHit ? <><TrendIcon size={8} /> RESULT +3</> : <><XCircle size={8} /> MISS</>}
            </span>
            {isPredicted && <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>You: {userPred.homeScore}–{userPred.awayScore}</span>}
          </div>
        ) : isPredicted ? (
          <Link to="/predictions" className="v23-btn v23-btn-ol on" style={{ minHeight: 30, fontSize: '.64rem', padding: '4px 9px' }}><CheckCircle size={9} /> Locked</Link>
        ) : isLoggedIn ? (
          <Link to={`/predictions?match=${mid}`} className="v23-btn v23-btn-p" style={{ minHeight: 30, fontSize: '.64rem', padding: '4px 9px' }}><Target size={9} /> Predict</Link>
        ) : (
          <Link to="/login" className="v23-btn v23-btn-gh" style={{ minHeight: 30, fontSize: '.64rem', padding: '4px 9px' }}><Lock size={9} /> Login</Link>
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
    ? new Date(koRaw.includes('T') ? koRaw : `${pick.matchDate || getTodayStr()}T${koRaw}:00`).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : 'TBD';
  const predH = pick.adminPick?.home, predA = pick.adminPick?.away;

  return (
    <div className="v23-mc zoka" style={{ animationDelay: `${index * 25}ms` }}>
      <div className="v23-mh">
        <div className="v23-ml">
          {pick.league?.emblem && <img src={pick.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.league?.name || 'Zoka'}</span>
        </div>
        <span className="v23-st" style={{ color: isFin ? 'var(--accent)' : 'var(--text-muted)', background: isFin ? 'rgba(0,230,118,.08)' : 'rgba(255,255,255,.04)' }}>{isFin ? 'FT' : ko || 'TBD'}</span>
      </div>
      <div className="v23-tm">
        <div className="v23-te">
          {pick.homeLogo && <img src={pick.homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.homeTeam?.shortName || pick.homeTeam?.name || '?'}</span>
        </div>
        <div className={`v23-sb${isFin ? ' ft' : ' zk'}`}>
          {isFin && pick.homeScore != null
            ? <><span className="v23-sn g">{pick.homeScore}</span><span className="v23-sep">–</span><span className="v23-sn g">{pick.awayScore}</span></>
            : <span className="v23-sn gd">{predH ?? '?'}–{predA ?? '?'}</span>}
        </div>
        <div className="v23-te aw">
          {pick.awayLogo && <img src={pick.awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.awayTeam?.shortName || pick.awayTeam?.name || '?'}</span>
        </div>
      </div>
      <div className="v23-ma">
        {isFin ? <ZokaBadge pick={pick} /> : <span className="bdg gd"><Star size={8} fill="currentColor" /> Prediction</span>}
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

  const appData = useAppData();
  const {
    activePredictions,
    zokaPicks,
    dailyEntries,
    dailyStats,
    userPredictions,
    predictionResults,
    userStats,
    loading: ctxLoading,
    ensureUserData,
  } = appData;

  const [primaryFixtures, setPrimaryFixtures] = useState([]);
  const [fxLoading, setFxLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [showMoreFeat, setShowMoreFeat] = useState(false);
  const [showMoreZoka, setShowMoreZoka] = useState(false);
  const [showMoreLB, setShowMoreLB] = useState(false);
  const [totalUsers, setTotalUsers] = useState(null);
  
  const [newsPosts, setNewsPosts] = useState([]);

  const { fixtures: backupRaw } = useFootballData();

  useEffect(() => {
    if (uid) ensureUserData(uid);
  }, [uid, ensureUserData]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), limit(1))).then(s => {
      if (!s.empty && mounted.current) setTotalUsers(s.docs[0].data().totalUsers || null);
    }).catch(() => {});
  }, [db]);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'news_posts'), orderBy('createdAt', 'desc'), limit(8));
    const unsub = onSnapshot(q, (snap) => {
      if (mounted.current) setNewsPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("News fetch error:", err));
    return () => unsub();
  }, [db]);

  // ★ ROBUST FIXTURE FETCHING & LIVE MERGING
  useEffect(() => {
    let mnt = true;
    (async () => {
      try {
        const data = await fetchFixtures(getTodayStr());
        if (mnt && data) {
          const l = data?.matches || [];
          setPrimaryFixtures(l.map(m => normalizeMatch(m)).filter(Boolean));
        }
      } catch {} finally { if (mnt) setFxLoading(false); }
    })();
    
    const unsub = subscribeToLiveFixtures(({ matches: lm }) => {
      if (!mnt || !lm) return;
      setPrimaryFixtures(prev => {
        const liveMap = new Map(lm.map(m => [String(m.id), m]));
        return prev.map(f => {
          const liveMatch = liveMap.get(String(f.id));
          if (liveMatch) {
            return normalizeMatch({ ...f, ...liveMatch });
          }
          return f;
        });
      });
    });
    
    return () => { mnt = false; if (unsub) unsub(); };
  }, []);

  const allFixtures = useMemo(() => {
    let list = primaryFixtures.length > 0 ? primaryFixtures : (backupRaw || []).map(m => normalizeMatch(m)).filter(Boolean);
    const uniqueIds = new Set();
    return list.filter(m => { const idStr = String(m.id); if (uniqueIds.has(idStr)) return false; uniqueIds.add(idStr); return true; });
  }, [primaryFixtures, backupRaw]);

  const liveMatches = useMemo(() => allFixtures.filter(f => f.isLive || isLiveStatus(f.status, SPORT.FOOTBALL)), [allFixtures]);
  
  // Fallback to all fixtures if no live matches
  const stripMatches = liveMatches.length > 0 ? liveMatches : allFixtures.slice(0, 10);

  const zokaFlat = useMemo(() => {
    const matches = zokaPicks?.matches || [];
    return matches.map(m => ({ ...m, _d: getTodayStr() }));
  }, [zokaPicks]);
  const zokaVis = showMoreZoka ? zokaFlat : zokaFlat.slice(0, 4);
  const zokaHidden = Math.max(0, zokaFlat.length - 4);

  const featFlat = useMemo(() => (activePredictions || []).map(m => ({ ...m, _d: getTodayStr() })), [activePredictions]);
  const featVis = showMoreFeat ? featFlat : featFlat.slice(0, 5);
  const featHidden = Math.max(0, featFlat.length - 5);

  const lbVis = showMoreLB ? (dailyEntries || []) : (dailyEntries || []).slice(0, 5);
  const lbHidden = Math.max(0, (dailyEntries || []).length - 5);

  const userPredMap = useMemo(() => {
    const m = {};
    Object.values(userPredictions || {}).forEach(p => { m[p.predId || p.matchId] = p; });
    return m;
  }, [userPredictions]);

  const resultMap = useMemo(() => {
    const m = {};
    (predictionResults?.results || []).forEach(r => { m[String(r.matchId)] = r; });
    return m;
  }, [predictionResults]);

  const myPredicted = useMemo(() => {
    return (activePredictions || []).filter(p => userPredMap[p.id || p.matchId]).length;
  }, [activePredictions, userPredMap]);

  useEffect(() => { return () => { mounted.current = false; }; }, []);

  return (
    <div className="v23">
      <SEO title="Football Predictions, Fixtures & Live Scores — ZOKASCORE" description="Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world." keywords="football predictions, live scores, fixtures, ZOKASCORE" path="/" />

      {offline && <div className="v23-offline"><WifiOff size={14} /> You're offline — showing cached data</div>}

      <div className="v23-wrap">
        {/* ANIMATED TITLE */}
        <section className="v23-hero">
          <div style={{ animation: 'v23-fade-up .5s cubic-bezier(.22,1,.36,1) both' }}>
            <h1 className="v23-title">ZOKA<span>SCORE</span></h1>
            <p className="v23-sub">
              {greeting.emoji} {greeting.text}{userProfile?.displayName ? `, ${userProfile.displayName.split(' ')[0]}` : ''}! {greeting.icon}
            </p>
          </div>
          <div className="v23-title-line" />
        </section>

        {/* MATCH STRIP (Live or Upcoming) */}
        {fxLoading ? (
          <div className="v23-livestrip">
            {[1, 2, 3, 4].map(i => <div key={i} className="v23-skel" style={{ minWidth: 175, height: 80, borderRadius: 12, marginRight: 10 }} />)}
          </div>
        ) : stripMatches.length > 0 && (
          <div style={{ margin: '16px 0 0', animation: 'v23-fade-up .4s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {liveMatches.length > 0 ? (
                <>
                  <span className="v23-ldot" />
                  <span style={{ fontSize: '.74rem', fontWeight: 900, color: '#ef4444' }}>{liveMatches.length} LIVE</span>
                </>
              ) : (
                <span style={{ fontSize: '.74rem', fontWeight: 900, color: 'var(--text-muted)' }}>TODAY'S MATCHES</span>
              )}
              <div style={{ flex: 1, height: 1, background: 'var(--border)', borderRadius: 1 }} />
              <Link to="/fixtures" style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>View all <ChevronRight size={11} /></Link>
            </div>
            <div className="v23-livestrip">{stripMatches.map((m, i) => <LiveMini key={m.id || i} match={m} index={i} />)}</div>
          </div>
        )}

        {/* LATEST NEWS MARQUEE */}
        {newsPosts.length > 0 && (
          <div style={{ margin: '18px 0 22px', animation: 'v23-fade-up .5s cubic-bezier(.22,1,.36,1) 120ms both', overflow: 'hidden', position: 'relative', maskImage: 'linear-gradient(90deg, transparent, black 5%, black 95%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 5%, black 95%, transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Newspaper size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '.74rem', fontWeight: 900, color: 'var(--text-primary)' }}>LATEST NEWS</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)', borderRadius: 1 }} />
              <Link to="/highlights" style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>Hub <ChevronRight size={11} /></Link>
            </div>
            <div className="v23-news-marquee">
              {[...newsPosts, ...newsPosts].map((post, i) => (
                <Link to={`/highlights/${slugify(post.title)}-${post.id}`} key={`${post.id}-${i}`} className="v23-newsmini">
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt={post.title} className="v23-news-img" />
                  ) : (
                    <div className="v23-news-img-ph"><Newspaper size={18} /></div>
                  )}
                  <div className="v23-news-body">
                    <span className="v23-news-cat">{post.category}</span>
                    <h4 className="v23-news-title">{post.title}</h4>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* STATS STRIP */}
        <div className="v23-stats" style={{ animation: 'v23-fade-up .5s cubic-bezier(.22,1,.36,1) 150ms both' }}>
          <div className="v23-chip">
            <div className="val"><AnimNum value={totalUsers || dailyStats?.players || 0} delay={200} /></div>
            <div className="lbl">Users</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, ((dailyStats?.players || 0) || (totalUsers || 0)) / 5)}%`, background: '#60a5fa', animationDelay: '400ms' }} /></div>
          </div>
          <div className="v23-chip">
            <div className="val"><AnimNum value={dailyStats?.preds || 0} delay={280} /></div>
            <div className="lbl">Predictions</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, (dailyStats?.preds || 0) / 10)}%`, background: 'var(--gold)', animationDelay: '500ms' }} /></div>
          </div>
          <div className="v23-chip" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', right: 8, top: 8 }}><AccuracyRing value={dailyStats?.avg ? parseFloat(dailyStats.avg) : 0} size={36} stroke={3} color={(dailyStats?.avg ? parseFloat(dailyStats.avg) : 0) >= 50 ? 'var(--accent)' : (dailyStats?.avg ? parseFloat(dailyStats.avg) : 0) >= 25 ? 'var(--gold)' : '#ef4444'} /></div>
            <div className="val" style={{ fontSize: '.92rem' }}><AnimNum value={dailyStats?.avg ? Math.round(parseFloat(dailyStats.avg)) : 0} delay={360} suffix="%" /></div>
            <div className="lbl">Accuracy</div>
          </div>
          <div className="v23-chip">
            <div className="val" style={{ color: isLoggedIn ? 'var(--accent)' : 'var(--text-muted)' }}>
              {isLoggedIn ? <AnimNum value={userStats?.todayPoints || 0} delay={440} /> : '—'}
            </div>
            <div className="lbl">My Points</div>
            {isLoggedIn && <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, (userStats?.todayPoints || 0) / 5)}%`, background: 'var(--accent)', animationDelay: '600ms' }} /></div>}
          </div>
        </div>

        {/* ZOKA PICKS */}
        {!ctxLoading && zokaFlat.length > 0 && (
          <div className="v23-sec" style={{ animation: 'v23-fade-up .5s cubic-bezier(.22,1,.36,1) 200ms both' }}>
            <div className="v23-sech">
              <Star size={14} style={{ color: 'var(--gold)' }} />
              <h2>Zoka Picks</h2>
              <span className="v23-sech-badge" style={{ background: 'rgba(245,197,66,.08)', color: 'var(--gold)', border: '1px solid rgba(245,197,66,.15)' }}>{zokaFlat.length}</span>
              <div className="v23-sech-line" />
            </div>
            <div className="v23-zoka-wrap">
              {zokaVis.map((p, i) => <ZokaRow key={p.matchId || i} pick={p} index={i} />)}
            </div>
            {zokaHidden > 0 && (
              <button className={`v23-toggle${showMoreZoka ? ' open' : ''}`} onClick={() => setShowMoreZoka(p => !p)}>
                {showMoreZoka ? 'Show less' : `Show ${zokaHidden} more`} <ChevronDown size={13} />
              </button>
            )}
          </div>
        )}

        {/* FEATURED MATCHES */}
        <div className="v23-sec" style={{ animation: 'v23-fade-up .5s cubic-bezier(.22,1,.36,1) 250ms both' }}>
          <div className="v23-sech">
            <Target size={14} style={{ color: 'var(--accent)' }} />
            <h2>Featured — Compete</h2>
            <span className="v23-sech-badge" style={{ background: 'rgba(0,230,118,.08)', color: 'var(--accent)', border: '1px solid rgba(0,230,118,.15)' }}>{featFlat.length}</span>
            {isLoggedIn && <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>{myPredicted}/{featFlat.length} predicted</span>}
            <div className="v23-sech-line" />
          </div>
          {ctxLoading ? (
            <div>{Array.from({ length: 4 }).map((_, i) => <div key={i} className="v23-skel" style={{ height: 90, marginBottom: 6, animationDelay: `${i * 60}ms` }} />)}</div>
          ) : featVis.length > 0 ? (
            featVis.map((p, i) => <FeaturedRow key={p.id || String(p.matchId) || i} pred={p} userPred={userPredMap[p.id || p.matchId]} userResult={resultMap[String(p.matchId || p.id)]} index={i} isLoggedIn={isLoggedIn} />)
          ) : (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: '.8rem', fontWeight: 600 }}>
              No featured matches right now
              <div style={{ fontSize: '.68rem', opacity: .5, marginTop: 4 }}>Check back later or go to Predictions</div>
            </div>
          )}
          {featHidden > 0 && (
            <button className={`v23-toggle${showMoreFeat ? ' open' : ''}`} onClick={() => setShowMoreFeat(p => !p)}>
              {showMoreFeat ? 'Show less' : `Show ${featHidden} more`} <ChevronDown size={13} />
            </button>
          )}
        </div>

        {/* LEADERBOARD */}
        <div className="v23-sec" style={{ animation: 'v23-fade-up .5s cubic-bezier(.22,1,.36,1) 300ms both' }}>
          <div className="v23-sech">
            <Trophy size={14} style={{ color: 'var(--gold)' }} />
            <h2>Daily Leaderboard</h2>
            <div className="v23-sech-line" />
            <Link to="/leaderboard" style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>Full <ArrowUpRight size={11} /></Link>
          </div>
          {ctxLoading ? (
            <div>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="v23-skel" style={{ height: 48, marginBottom: 5, animationDelay: `${i * 50}ms` }} />)}</div>
          ) : (dailyEntries || []).length > 0 ? (
            <>
              <MiniPodium entries={dailyEntries || []} />
              <div style={{ marginTop: 10 }}>
                {lbVis.slice(3).map((u, i) => {
                  const isMe = isLoggedIn && u.uid === uid;
                  const rank = u.rank || (i + 4);
                  const color = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'][(rank - 1) % 8];
                  return (
                    <div key={u.uid} className={`v23-lbrow${isMe ? ' me' : ''}`} style={{ animationDelay: `${(i + 3) * 25}ms` }}>
                      <span style={{ width: 28, textAlign: 'center', fontWeight: 900, color: rank <= 10 ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>#{rank}</span>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.64rem', fontWeight: 800, color: '#fff' }}>{(u.displayName || '??').slice(0, 2).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName}</div>
                        <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.exact || 0} exact · {u.result || 0} results</div>
                      </div>
                      <span style={{ fontSize: '.8rem', fontWeight: 900, color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>{u.points || 0}</span>
                    </div>
                  );
                })}
              </div>
              {lbHidden > 0 && (
                <button className={`v23-toggle${showMoreLB ? ' open' : ''}`} onClick={() => setShowMoreLB(p => !p)}>
                  {showMoreLB ? 'Show less' : `Show ${lbHidden} more`} <ChevronDown size={13} />
                </button>
              )}
            </>
          ) : (
            <div className="v23-skel" style={{ height: 150, borderRadius: 12 }} />
          )}
        </div>

        {/* EXPLORE GRID & LEAGUE TABLES (SEO LINKS) */}
        <div className="v23-sec" style={{ animation: 'v23-fade-up .5s cubic-bezier(.22,1,.36,1) 350ms both' }}>
          <div className="v23-sech">
            <Trophy size={14} style={{ color: 'var(--gold)' }} />
            <h2>League Tables</h2>
            <div className="v23-sech-line" />
          </div>
          <div className="v23-explore">
            <Link to="/mastergames?tab=standings&comp=PL" className="v23-ecard">
              <div className="v23-ecard-accent" style={{ background: '#3b82f6' }} />
              <Trophy size={20} style={{ color: '#3b82f6' }} />
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Premier League</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames?tab=standings&comp=PD" className="v23-ecard">
              <div className="v23-ecard-accent" style={{ background: '#f97316' }} />
              <Trophy size={20} style={{ color: '#f97316' }} />
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>La Liga</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames?tab=standings&comp=SA" className="v23-ecard">
              <div className="v23-ecard-accent" style={{ background: '#22c55e' }} />
              <Trophy size={20} style={{ color: '#22c55e' }} />
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Serie A</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames?tab=standings&comp=BL1" className="v23-ecard">
              <div className="v23-ecard-accent" style={{ background: '#ef4444' }} />
              <Trophy size={20} style={{ color: '#ef4444' }} />
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Bundesliga</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames?tab=standings&comp=FL1" className="v23-ecard">
              <div className="v23-ecard-accent" style={{ background: '#8b5cf6' }} />
              <Trophy size={20} style={{ color: '#8b5cf6' }} />
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Ligue 1</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames" className="v23-ecard">
              <div className="v23-ecard-accent" style={{ background: 'var(--accent)' }} />
              <Activity size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>All Leagues</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>Fixtures & Live Scores</div>
              </div>
            </Link>
          </div>
        </div>

        {/* EXPLORE GRID */}
        <div className="v23-sec" style={{ animation: 'v23-fade-up .5s cubic-bezier(.22,1,.36,1) 400ms both' }}>
          <div className="v23-sech">
            <Gamepad2 size={14} style={{ color: 'var(--accent)' }} />
            <h2>Explore</h2>
            <div className="v23-sech-line" />
          </div>
          <div className="v23-explore">
            <Link to="/highlights" className="v23-ecard">
              <div className="v23-ecard-accent" style={{ background: '#f59e0b' }} />
              <Newspaper size={20} style={{ color: '#f59e0b' }} />
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>News Hub</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>Official updates & articles</div>
              </div>
            </Link>
            <Link to="/livestream" className="v23-ecard">
              <div className="v23-ecard-accent" style={{ background: '#06b6d4' }} />
              <Zap size={20} style={{ color: '#06b6d4' }} />
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Live Stream</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>Watch matches live</div>
              </div>
            </Link>
            <Link to="/basketball" className="v23-ecard">
              <div className="v23-ecard-accent" style={{ background: '#3b82f6' }} />
              <BarChart3 size={20} style={{ color: '#3b82f6' }} />
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Basketball</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>Hoops action & scores</div>
              </div>
            </Link>
          </div>
        </div>

        {/* CTA */}
        {!isLoggedIn && (
          <div className="v23-sec" style={{ animation: 'v23-fade-up .5s cubic-bezier(.22,1,.36,1) 450ms both' }}>
            <Link to="/login" className="v23-cta"><LogIn size={16} /> Sign In to Predict & Win</Link>
          </div>
        )}
      </div>
    </div>
  );
}