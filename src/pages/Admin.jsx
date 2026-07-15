// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Admin.jsx
// v15.2 Pro UI — Auto-Failover, User Broadcast, Bulletproof User Loading
// ═════════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Trash2, CheckCircle2, XCircle, Zap, Trophy,
  CalendarDays, BarChart3, Crown, Pencil, Check, Radio,
  AlertTriangle, Loader2, Plus, ChevronDown, Send,
  Clock, TrendingUp, Star, Sparkles, X,
  Save, Timer, Users, UserCog, Search,
  LayoutDashboard, Copy, History,
  ChevronUp, RotateCcw, Activity, Megaphone,
  Eye, ChevronRight, Ban, ArrowLeft
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useFootballData } from '../context/FootballDataContext'; // ★ FIX: Import backup context
import { db } from '../utils/firebase';
import { dataLayer } from '../utils/dataLayer';
import { todayStr, getLocalDateStr, getLocalDateFromUtc, formatTime, formatDateShort } from '../utils/dates';
import { eventBus, EVENT } from '../utils/eventBus';
import { isLiveStatus, isFinishedStatus, PATHS, CACHE_KEY, SPORT } from '../utils/constants';
import { fetchFixtures } from '../utils/api';
import {
  resolveMatchForAllUsers, rebuildDailySummary, rebuildGoatLeaderboard,
  rebuildPeriodLeaderboard, rebuildAllLeaderboards
} from '../hooks/useMatchData';

import {
  collection, query, where, onSnapshot, doc, setDoc, deleteDoc,
  serverTimestamp, getDoc, getDocs, limit as limitQ, startAfter, addDoc
} from 'firebase/firestore';

import SEO from '../components/SEO';

/* ═════════════════════════════════════════════════════════════════════════════════
   MEMORY LAYER
   ═════════════════════════════════════════════════════════════════════════════════ */
const _mem = {};
const mem = {
  get(k, d) { return k in _mem ? _mem[k] : (typeof d === 'function' ? d() : d); },
  set(k, v) { _mem[k] = v; },
};
const memUpdate = (key, v) => {
  mem.set(key, typeof v === 'function' ? v(mem.get(key)) : v);
};

/* ═════════════════════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ═════════════════════════════════════════════════════════════════════════════════ */
const MAX_FEATURED = 10;
const MAX_ZOKA = 10;
const SHOW_INIT = 8;

const dateOffset = (o = 0) => getLocalDateStr(o); 
const dateLabel = (d) => {
  const t = todayStr(), tm = getLocalDateStr(1), ys = getLocalDateStr(-1);
  if (d === t) return 'Today'; if (d === tm) return 'Tomorrow'; if (d === ys) return 'Yesterday';
  const dt = new Date(d + 'T12:00:00'), days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${days[dt.getDay()]} ${d.slice(5)}`;
};

function extractMatchDate(m) {
  if (!m) return '';
  if (m.utcDate) return getLocalDateFromUtc(m.utcDate);
  if (m.date && m.date.includes('T')) return m.date.split('T')[0];
  if (m.date) return m.date;
  return '';
}
const extractDate = m => extractMatchDate(m);

function normalizeMatch(raw, isPrimary = true) {
  if (!raw) return null;
  const id = String(raw.id || raw.matchId);
  const status = raw.status || '';
  const live = isPrimary 
    ? (raw.isLive || isLiveStatus(status, 'football')) 
    : (status === 'IN_PLAY' || status === 'PAUSED' || status === '1H' || status === '2H' || isLiveStatus(status, 'football'));
  const finished = isPrimary 
    ? (raw.isFinished || isFinishedStatus(status, 'football')) 
    : (status === 'FINISHED' || status === 'FT' || status === 'AET' || isFinishedStatus(status, 'football'));

  return {
    id, status, isLive: live, isFinished: finished,
    homeTeam: { 
      name: raw.homeTeam?.name || 'TBD', 
      shortName: raw.homeTeam?.shortName || raw.homeTeam?.name || 'TBD', 
      crest: raw.homeTeam?.crest || raw.homeLogo 
    },
    awayTeam: { 
      name: raw.awayTeam?.name || 'TBD', 
      shortName: raw.awayTeam?.shortName || raw.awayTeam?.name || 'TBD', 
      crest: raw.awayTeam?.crest || raw.awayLogo 
    },
    homeScore: isPrimary ? raw.homeScore : (raw.score?.fullTime?.home ?? raw.homeScore ?? null),
    awayScore: isPrimary ? raw.awayScore : (raw.score?.fullTime?.away ?? raw.awayScore ?? null),
    league: { name: raw.league?.name || raw.competition?.name || 'Other', emblem: raw.league?.emblem || raw.competition?.emblem },
    competition: raw.competition || raw.league,
    utcDate: raw.utcDate || raw.date || raw.kickoff,
    minute: raw.minute || raw.elapsed || null
  };
}

const ST_MAP = {
  SCHEDULED:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'Upcoming'},
  TIMED:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'Upcoming'},
  NS:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'Upcoming'},
  TBD:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'TBD'},
  IN_PLAY:{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Live'},
  PAUSED:{c:'#f97316',b:'rgba(249,115,22,.1)',l:'HT'},
  '1H':{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Live'},
  '2H':{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Live'},
  HT:{c:'#f97316',b:'rgba(249,115,22,.1)',l:'HT'},
  BT:{c:'#f97316',b:'rgba(249,115,22,.1)',l:'BT'},
  ET:{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'ET'},
  P:{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Pens'},
  FT:{c:'var(--accent)',b:'rgba(0,230,118,.08)',l:'FT'},
  FINISHED:{c:'var(--accent)',b:'rgba(0,230,118,.08)',l:'FT'},
  AET:{c:'var(--accent)',b:'rgba(0,230,118,.08)',l:'FT'},
  PEN:{c:'var(--accent)',b:'rgba(0,230,118,.08)',l:'FT'},
  PST:{c:'#f59e0b',b:'rgba(245,158,11,.1)',l:'PST'},
};
const gst = s => ST_MAP[s] || ST_MAP.SCHEDULED;

const isLive = m => isLiveStatus(m?.status, m?.sport || 'football') || m?.isLive;
const isFin = m => isFinishedStatus(m?.status, m?.sport || 'football') || m?.isFinished;
const getScore = m => m?.score?.fullTime ? {h:m.score.fullTime.home,a:m.score.fullTime.away} : m?.homeScore!=null ? {h:m.homeScore,a:m.awayScore} : {h:null,a:null};

const fmtTimeAgo = dt => {
  if (!dt) return 'Never';
  let ts;
  if (typeof dt==='number') ts = dt<1e12?dt*1000:dt;
  else if (typeof dt==='string') { ts=Date.parse(dt); if(isNaN(ts)) return 'Unknown'; }
  else if (dt.seconds!=null) ts=dt.seconds*1000;
  else if (dt?.getTime) ts=dt.getTime();
  else return 'Unknown';
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<10) return 'Just now'; if(s<60) return `${s}s ago`;
  const m=Math.floor(s/60); if(m<60) return `${m}m ago`;
  const h=Math.floor(m/60); if(h<24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
};

const TABS = [
  {key:'dashboard',label:'Dashboard',icon:LayoutDashboard},
  {key:'zoka',label:'Zoka Picks',icon:Star},
  {key:'featured',label:'Featured',icon:Radio},
  {key:'results',label:'Results',icon:Trophy},
  {key:'broadcast',label:'Broadcast',icon:Megaphone},
  {key:'staff',label:'Staff',icon:UserCog},
  {key:'users',label:'Users',icon:Users},
];

/* ═════════════════════════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═════════════════════════════════════════════════════════════════════════════════ */
const injectCSS = () => {
  if (document.getElementById('adm-v15-css')) return;
  const s = document.createElement('style');
  s.id = 'adm-v15-css';
  s.textContent = `
@keyframes afu{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes asp{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes afl{0%{background:rgba(0,230,118,.16)}100%{background:transparent}}
@keyframes pulse-live{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.7)}}
@keyframes slide-in{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:translateX(0)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes live-glow{0%,100%{border-color:rgba(239,68,68,.12);box-shadow:0 0 3px rgba(239,68,68,.01)}50%{border-color:rgba(239,68,68,.35);box-shadow:0 0 14px rgba(239,68,68,.06)}}
@keyframes save-flash{0%{background:linear-gradient(135deg,rgba(0,230,118,.18),rgba(0,230,118,.04))}100%{background:var(--bg-card)}}
@keyframes tab-ind{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes card-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes pop{0%{transform:scale(.92);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes edit-pulse{0%,100%{border-color:rgba(0,230,118,.25)}50%{border-color:rgba(0,230,118,.5)}}

.ae{animation:afu .4s cubic-bezier(.22,1,.36,1) both}
.fl{animation:afl 2s ease-out}
.card-in{animation:card-in .3s cubic-bezier(.22,1,.36,1) both}
.save-flash{animation:save-flash 1.2s ease-out}
.pop{animation:pop .25s cubic-bezier(.22,1,.36,1) both}

.ap{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:80px}
.aw{max-width:860px;margin:0 auto;padding:0 16px}
.ah{text-align:center;padding:20px 0 0}
.ah h1{margin:0 0 2px;font-size:1.15rem;font-weight:900;color:var(--text-primary);letter-spacing:-.01em}
.ah .sub{font-size:.62rem;color:var(--text-muted);font-weight:600}

.at{display:flex;gap:2px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:3px;margin:14px 0;overflow-x:auto;scrollbar-width:none}
.at::-webkit-scrollbar{display:none}
.atb{flex:1;position:relative;display:flex;align-items:center;justify-content:center;gap:5px;padding:11px 6px;border:none;border-radius:11px;background:transparent;color:var(--text-muted);font-size:.72rem;font-weight:700;cursor:pointer;transition:all .2s;white-space:nowrap;font-family:inherit;-webkit-tap-highlight-color:transparent}
.atb:hover{color:var(--text-primary);background:rgba(255,255,255,.02)}
.atb.on{color:var(--gold,#f5c542);background:rgba(245,197,66,.06)}
.atb.on::after{content:'';position:absolute;bottom:1px;left:18%;right:18%;height:2.5px;background:var(--gold,#f5c542);border-radius:2px;animation:tab-ind .2s ease-out;box-shadow:0 0 8px rgba(245,197,66,.35)}

.ask{position:sticky;top:0;z-index:50;background:var(--bg-deep);padding:12px 0 14px;border-bottom:1px solid var(--border);margin:0 -16px;padding-left:16px;padding-right:16px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}

.adb{display:flex;gap:4px;overflow-x:auto;padding:0 0 10px;scrollbar-width:none;flex-wrap:wrap}
.adb::-webkit-scrollbar{display:none}
.adp{flex-shrink:0;display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.7rem;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit}
.adp:hover{color:var(--text-primary);border-color:var(--border-hover)}
.adp.on{background:rgba(0,230,118,.07);color:var(--accent);border-color:rgba(0,230,118,.22)}
.adp.past{opacity:.6}
.more-dates-btn{flex-shrink:0;padding:7px 12px;border-radius:8px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:.68rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap}
.more-dates-btn:hover{border-color:var(--accent);color:var(--accent)}

.alb{display:flex;gap:4px;overflow-x:auto;padding:0 0 10px;scrollbar-width:none}
.alb::-webkit-scrollbar{display:none}
.alp{flex-shrink:0;display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.68rem;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit}
.alp:hover{color:var(--text-primary);border-color:var(--border-hover)}
.alp.on{background:rgba(16,185,129,.07);color:var(--accent);border-color:rgba(16,185,129,.22)}
.alp img{width:13px;height:13px;object-fit:contain;border-radius:2px}

.am{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:8px;transition:all .15s}
.am:hover{background:rgba(255,255,255,.015)}
.am.zs{background:linear-gradient(135deg,rgba(245,197,66,.05),rgba(245,197,66,.015));border-color:rgba(245,197,66,.28)}
.am.lg{animation:live-glow 2s ease-in-out infinite}
.am.ok{border-color:rgba(0,230,118,.22)}
.am.editing{border-color:rgba(0,230,118,.35);animation:edit-pulse 2s ease-in-out infinite}
.am.resolved{opacity:.55}

.amh{display:flex;align-items:center;justify-content:space-between;gap:8px}
.aml{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.aml img{width:18px;height:18px;border-radius:4px;object-fit:contain;flex-shrink:0}
.aml span{font-size:.72rem;font-weight:700;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.as{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:.63rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;flex-shrink:0}
.ld{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:pulse-live 1.2s ease-in-out infinite;box-shadow:0 0 6px rgba(239,68,68,.5);flex-shrink:0}

.atm{display:flex;align-items:center;gap:8px}
.ate{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
.ate.aw{flex-direction:row-reverse;text-align:right}
.ate img{width:26px;height:26px;border-radius:6px;object-fit:contain;flex-shrink:0}
.ate span{font-size:.86rem;font-weight:800;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.asb{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;min-width:80px;justify-content:center;background:rgba(255,255,255,.03);border:1px solid var(--border)}
.asb.lv{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.18)}
.asb.ft{background:rgba(0,230,118,.05);border-color:rgba(0,230,118,.12)}
.asn{font-size:1.1rem;font-weight:900;font-family:var(--font-display,monospace);font-variant-numeric:tabular-nums;color:var(--text-primary)}
.asn.r{color:#ef4444}.asn.g{color:var(--accent)}
.asep{color:var(--text-muted);font-size:.8rem;font-weight:700;opacity:.3}
.avs{font-size:.68rem;font-weight:800;color:var(--text-muted);opacity:.2;letter-spacing:.08em}

.aa{display:flex;align-items:center;gap:6px;justify-content:flex-end;flex-wrap:wrap}

.ab{padding:9px 14px;border-radius:9px;font-size:.78rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;min-height:40px;font-family:inherit;-webkit-tap-highlight-color:transparent}
.ab:active{transform:scale(.97)}.ab:disabled{opacity:.28;pointer-events:none;transform:none}
.ab-p{background:var(--accent,#10b981);color:#fff;box-shadow:0 2px 10px rgba(16,185,129,.18)}
.ab-p:hover{filter:brightness(1.08);transform:translateY(-1px)}
.ab-gd{background:linear-gradient(135deg,rgba(245,197,66,.92),rgba(245,197,66,.78));color:#000;box-shadow:0 2px 12px rgba(245,197,66,.22)}
.ab-gd:hover{filter:brightness(1.04);transform:translateY(-1px)}
.ab-gh{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-primary)}
.ab-gh:hover{background:rgba(255,255,255,.05);border-color:var(--border-hover)}
.ab-dg{background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.16);color:#ef4444}
.ab-dg:hover{background:rgba(239,68,68,.1)}
.ab-sm{padding:7px 11px;font-size:.7rem;min-height:34px;border-radius:8px}
.ab-ol{background:transparent;border:1px solid var(--border);color:var(--text-muted)}
.ab-ol:hover{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.03)}
.ab-ol.on{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.06)}
.ab-sc{background:rgba(0,230,118,.08);border:1px solid rgba(0,230,118,.2);color:var(--accent)}
.ab-er{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444}
.ab-bl{background:rgba(96,165,250,.06);border:1px solid rgba(96,165,250,.2);color:#60a5fa}
.ab-bl:hover{background:rgba(96,165,250,.1)}
.ab-olive{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);color:#f59e0b}

.api{width:48px;height:42px;padding:0;border-radius:8px;background:var(--bg-surface);border:2px solid rgba(245,197,66,.18);color:var(--gold,#f5c542);text-align:center;font-weight:900;font-size:1rem;outline:none;font-variant-numeric:tabular-nums;transition:all .2s;-webkit-appearance:none;appearance:none;font-family:var(--font-display,monospace)}
.api:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(245,197,66,.12)}
.api::placeholder{color:var(--text-muted);opacity:.28;font-weight:700}
.api.hv{border-color:var(--gold);background:rgba(245,197,66,.04)}

.ari{width:42px;height:36px;padding:0;border-radius:7px;background:var(--bg-surface);border:2px solid var(--border);color:var(--text-primary);text-align:center;font-weight:900;font-size:.95rem;outline:none;font-variant-numeric:tabular-nums;font-family:var(--font-display,monospace);-webkit-appearance:none;appearance:none;transition:border-color .2s}
.ari:focus{border-color:var(--accent);box-shadow:0 0 0 2px rgba(16,185,129,.12)}
.ari.hv{border-color:var(--accent);background:rgba(0,230,118,.04)}

.asec{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:12px}
.ast{font-size:.92rem;font-weight:900;color:var(--text-primary);margin:0 0 12px;display:flex;align-items:center;gap:8px}

.asg{display:grid;grid-template-columns:repeat(auto-fit,minmax(95px,1fr));gap:8px;margin-bottom:12px}
.astat{display:flex;flex-direction:column;align-items:center;padding:12px 6px;background:var(--bg-surface);border:1px solid var(--border);border-radius:11px}
.astat .n{font-size:1.3rem;font-weight:900;font-family:var(--font-display);line-height:1}
.astat .n.gd{color:var(--gold,#f5c542)}.astat .n.gn{color:var(--accent)}.astat .n.rd{color:#ef4444}.astat .n.bl{color:#3b82f6}
.astat .l{font-size:.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-top:4px}

.abdg{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:6px;font-size:.68rem;font-weight:800;white-space:nowrap}
.abdg.ex{background:rgba(0,230,118,.1);color:var(--accent);border:1px solid rgba(0,230,118,.22)}
.abdg.rs{background:rgba(245,197,66,.08);color:var(--gold,#f5c542);border:1px solid rgba(245,197,66,.18)}
.abdg.ms{background:rgba(239,68,68,.07);color:#ef4444;border:1px solid rgba(239,68,68,.15)}
.abdg.pn{background:rgba(255,255,255,.03);color:var(--text-muted);border:1px solid var(--border)}
.abdg.gd{background:rgba(245,197,66,.1);color:var(--gold,#f5c542);border:1px solid rgba(245,197,66,.22)}
.abdg.gn{background:rgba(0,230,118,.1);color:var(--accent);border:1px solid rgba(0,230,118,.22)}

.aem{padding:36px 20px;text-align:center;border:2px dashed var(--border);border-radius:14px;background:var(--bg-surface)}
.aem p{color:var(--text-muted);font-size:.82rem;margin:0;font-weight:600}
.aem .h{font-size:.7rem;color:var(--text-muted);opacity:.45;margin-top:3px}

.askel{height:48px;border-radius:10px;background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;margin-bottom:8px}

.azs{display:flex;gap:5px;flex-wrap:wrap;padding:8px 12px;background:rgba(245,197,66,.03);border:1px solid rgba(245,197,66,.1);border-radius:9px;margin-bottom:10px}

.arg{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.arb{padding:9px 12px;border-radius:9px;font-size:.75rem;font-weight:800;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;font-family:inherit;min-height:40px}
.arb:hover{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.03)}
.arb:active{transform:scale(.97)}
.arb:disabled{opacity:.28;pointer-events:none}

.asm{width:100%;padding:11px;border-radius:11px;background:var(--bg-card);border:2px dashed var(--border);color:var(--text-muted);font-size:.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:all .15s;font-family:inherit}
.asm:hover{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.03)}
.asm:active{transform:scale(.98)}

.ahc{background:var(--bg-surface);border:1px solid var(--border);border-radius:11px;padding:13px;margin-bottom:7px;cursor:pointer;transition:all .15s}
.ahc:hover{border-color:var(--border-hover);background:rgba(255,255,255,.015)}
.ahc.op{border-color:rgba(245,197,66,.25);background:rgba(245,197,66,.02)}

.aip{padding:9px 14px;border-radius:9px;background:var(--bg-surface);border:2px solid var(--border);color:var(--text-primary);font-size:.85rem;font-weight:600;outline:none;transition:border-color .2s;width:100%;font-family:inherit;-webkit-appearance:none;appearance:none;box-sizing:border-box}
.aip:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(245,197,66,.08)}
.aip::placeholder{color:var(--text-muted);opacity:.35}

.atst{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:11px 20px;border-radius:13px;font-size:.82rem;font-weight:700;z-index:9999;animation:slide-in .3s ease-out;box-shadow:0 6px 22px rgba(0,0,0,.5);display:flex;align-items:center;gap:8px;max-width:90vw;white-space:nowrap}
.atst.ok{background:rgba(0,230,118,.14);border:1px solid rgba(0,230,118,.28);color:var(--accent)}
.atst.er{background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.28);color:#ef4444}
.atst.in{background:rgba(245,197,66,.14);border:1px solid rgba(245,197,66,.28);color:var(--gold,#f5c542)}

.aov{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;animation:afu .2s ease}
.abox{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:22px;max-width:380px;width:100%;text-align:center}
.abox h3{font-size:.95rem;font-weight:900;color:var(--text-primary);margin:0 0 8px}
.abox p{font-size:.82rem;color:var(--text-muted);margin:0 0 18px;font-weight:600;line-height:1.4}
.abbtns{display:flex;gap:8px;justify-content:center}

.aur{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:12px;border:1px solid var(--border);background:var(--bg-surface);margin-bottom:7px;transition:background .15s}
.aur:hover{background:rgba(255,255,255,.015)}
.aur.me{border-color:rgba(0,230,118,.2);background:rgba(0,230,118,.03)}

.ausr-input{display:flex;gap:8px;margin-bottom:14px}
.ausr-input .aip{flex:1}

.abatch-bar{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg-surface);border:1px solid var(--border);border-radius:11px;margin-bottom:12px;font-size:.78rem;color:var(--text-muted);font-weight:700}
.abatch-bar .ab{margin-left:auto}

.aedit-hint{font-size:.65rem;color:var(--gold,#f5c542);font-weight:700;opacity:.7;margin-top:2px;display:flex;align-items:center;gap:3px}

@media(max-width:640px){
  .atb{padding:10px 5px;font-size:.68rem;gap:4px}
  .atb span.lb{display:none}
  .asg{grid-template-columns:repeat(3,1fr)}
  .astat .n{font-size:1.15rem}.astat .l{font-size:.55rem}
  .arg{grid-template-columns:1fr 1fr}
  .ate span{font-size:.78rem}.asn{font-size:.95rem}
  .asb{min-width:68px;padding:6px 10px}
  .api{width:42px;height:38px;font-size:.9rem}
  .alp{padding:5px 9px;font-size:.64rem}
  .ausr-input{flex-direction:column}.ausr-input .ab{width:100%}
}
@media(max-width:380px){
  .asg{grid-template-columns:repeat(2,1fr)}
  .arg{grid-template-columns:1fr}
  .am{padding:11px 12px}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═════════════════════════════════════════════════════════════════════════════════
   HOOKS & SMALL COMPONENTS
   ═════════════════════════════════════════════════════════════════════════════════ */
function useMounted() { const r = useRef(true); useEffect(() => () => { r.current = false; }, []); return r; }

function Toast({ message, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const Ic = type === 'ok' ? CheckCircle2 : type === 'er' ? XCircle : AlertTriangle;
  return <div className={`atst ${type}`}><Ic size={15} /> {message}</div>;
}

function Confirm({ title, msg, onYes, onNo, yesText = 'Confirm', danger = false }) {
  return (
    <div className="aov" onClick={onNo}>
      <div className="abox" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3><p>{msg}</p>
        <div className="abbtns">
          <button className="ab ab-gh" onClick={onNo}>Cancel</button>
          <button className={`ab ${danger ? 'ab-dg' : 'ab-p'}`} onClick={onYes}>{yesText}</button>
        </div>
      </div>
    </div>
  );
}

function Skel({ n = 3 }) {
  return <div>{Array.from({ length: n }).map((_, i) => <div key={i} className="askel" style={{ animationDelay: `${i * 80}ms` }} />)}</div>;
}

function Empty({ icon: Ic, title, hint }) {
  return (
    <div className="aem">
      {Ic && <Ic size={26} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 6px' }} />}
      <p>{title}</p>{hint && <p className="h">{hint}</p>}
    </div>
  );
}

function ShowMore({ count, show, onToggle }) {
  if (count <= 0) return null;
  return (
    <button className="asm" onClick={onToggle} style={{ marginTop: 8 }}>
      {show ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      {show ? 'Show less' : `Show ${count} more`}
    </button>
  );
}

function RBadge({ pick }) {
  if (!pick?.adminPick || pick.status !== 'finished') return null;
  const h = pick.adminPick.home, a = pick.adminPick.away, ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="abdg pn">PENDING</span>;
  if (h === ph && a === pa) return <span className="abdg ex"><CheckCircle2 size={9} /> EXACT +10</span>;
  if ((h > a ? 'H' : h < a ? 'A' : 'D') === (ph > pa ? 'H' : ph < pa ? 'A' : 'D')) return <span className="abdg rs"><TrendingUp size={9} /> RESULT +3</span>;
  return <span className="abdg ms"><XCircle size={9} /> MISS</span>;
}

function MatchRow({ m, idx, mode, sel, onToggleSel, scoreInput, onScoreInput, onAction, pubPick, extraBadge }) {
  const mid = String(m.id);
  const live = isLive(m), fin = isFin(m), sc = getScore(m), st = gst(m.status);
  const comp = m.competition || m.league;
  const cls = `am card-in${sel ? ' zs' : ''}${live ? ' lg' : ''}`;
  return (
    <div className={cls} style={{ animationDelay: `${idx * 20}ms` }}>
      <div className="amh">
        <div className="aml">
          {comp?.emblem && <img src={comp.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{comp?.name || 'Unknown'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {live && <span className="ld" />}
          <span className="as" style={{ color: st.c, background: st.b }}>
            {live && m.minute != null ? `${m.minute}'` : st.l}
          </span>
        </div>
      </div>
      <div className="atm">
        <div className="ate">
          {m.homeTeam?.crest && <img src={m.homeTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
        </div>
        <div className={`asb${live ? ' lv' : ''}${fin ? ' ft' : ''}`}>
          {(live || fin) ? (
            <><span className={`asn${live ? ' r' : ' g'}`}>{sc.h ?? 0}</span><span className="asep">–</span><span className={`asn${live ? ' r' : ' g'}`}>{sc.a ?? 0}</span></>
          ) : <span className="avs">VS</span>}
        </div>
        <div className="ate aw">
          {m.awayTeam?.crest && <img src={m.awayTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
        </div>
      </div>
      <div className="aa">
        {mode === 'zoka' && onToggleSel && (
          <button className={`ab ab-sm ${sel ? 'ab-gd' : 'ab-ol'}`} onClick={() => onToggleSel(m)}>
            <Star size={11} fill={sel ? 'currentColor' : 'none'} />{sel ? 'Selected' : 'Zoka Pick'}
          </button>
        )}
        {mode === 'zoka' && sel && scoreInput && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input className={`api${scoreInput.h ? ' hv' : ''}`} value={scoreInput.h} onChange={e => onScoreInput(mid, 'h', e.target.value)} placeholder="H" maxLength={2} />
            <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>–</span>
            <input className={`api${scoreInput.a ? ' hv' : ''}`} value={scoreInput.a} onChange={e => onScoreInput(mid, 'a', e.target.value)} placeholder="A" maxLength={2} />
          </div>
        )}
        {mode === 'featured' && typeof onAction === 'function' && onAction(m, idx)}
        {pubPick && <RBadge pick={pubPick} />}
        {extraBadge}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════
   MAIN ADMIN COMPONENT
   ═════════════════════════════════════════════════════════════════════════════════ */
export default function Admin() {
  injectCSS();
  const nav = useNavigate();
  const { userProfile } = useAuth();
  const mounted = useMounted();

  const [tab, setTab] = useState('dashboard');
  const [date, setDate] = useState(todayStr());
  const [showMoreDates, setShowMoreDates] = useState(false);

  const [preds, setPreds] = useState([]);
  const [pubPicks, setPubPicks] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [rebuilding, setRebuilding] = useState(null);

  const [primaryFixtures, setPrimaryFixtures] = useState([]);
  const [primaryLoading, setPrimaryLoading] = useState(true);

  // ★ FIX: Import backup context so Admin doesn't lose matches if API fails
  const { fixtures: backupRaw } = useFootballData();

  const defaultDates = useMemo(() => [getLocalDateStr(-1), todayStr(), getLocalDateStr(1)], []);
  const extraDates = useMemo(() => {
    const dates = [];
    for (let i = -14; i <= 14; i++) {
      const d = getLocalDateStr(i);
      if (!defaultDates.includes(d)) dates.push(d);
    }
    return dates.sort();
  }, []);

  useEffect(() => {
    let mnt = true;
    setPrimaryLoading(true);
    (async () => {
      try {
        const res = await fetchFixtures(date);
        if (mnt) {
          const l = Array.isArray(res) ? res : res?.matches || [];
          setPrimaryFixtures(l.map(m => normalizeMatch(m, true)));
        }
      } catch (e) {
        if (mnt) setPrimaryFixtures([]);
      } finally {
        if (mnt) setPrimaryLoading(false);
      }
    })();
    return () => { mnt = false; };
  }, [date]);

  // ★ FIX: Fallback to backup matches if primary is empty
  const allFixtures = useMemo(() => {
    if (primaryFixtures.length > 0) return primaryFixtures;
    return (backupRaw || []).filter(m => extractDate(m) === date).map(m => normalizeMatch(m, false));
  }, [primaryFixtures, backupRaw, date]);

  const dayFixtures = useMemo(() => allFixtures?.filter(m => extractDate(m) === date) || [], [allFixtures, date]);
  const liveCount = useMemo(() => dayFixtures.filter(isLive).length, [dayFixtures]);
  const finCount = useMemo(() => dayFixtures.filter(isFin).length, [dayFixtures]);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, PATHS.PREDICTION_SNAPSHOTS, date),
      (snap) => {
        if (!mounted.current) return;
        if (snap.exists()) {
          const data = snap.data();
          setPreds(Array.isArray(data.predictions) ? data.predictions : []);
        } else {
          getDocs(query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', date)))
            .then(qs => {
              if (mounted.current) setPreds(qs.docs.map(d => d.data()).sort((a, b) => (b.priority || 0) - (a.priority || 0)));
            })
            .catch(() => {});
        }
      },
      () => {}
    );
    return unsub;
  }, [date]);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, PATHS.ZOKA_PICKS, date),
      (snap) => {
        if (!mounted.current) return;
        setPubPicks(snap.exists() ? snap.data() : null);
      },
      () => {}
    );
    return unsub;
  }, [date]);

  // ★ AUTO-RESOLVE LOGIC
  useEffect(() => {
    if (!preds.length || !dayFixtures.length) return;
    preds.forEach(p => {
      if (p.status === 'finished' || p.isFinished) return;
      const fx = dayFixtures.find(f => String(f.id) === String(p.matchId));
      if (fx && fx.isFinished && fx.homeScore != null && fx.awayScore != null) {
        handleResolve(p, fx.homeScore, fx.awayScore, true);
      }
    });
  }, [dayFixtures, preds]);

  const handleZokaSaveDraft = async (data) => {
    if (!db) return;
    await setDoc(doc(db, PATHS.ZOKA_PICKS, date), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    dataLayer.invalidate(CACHE_KEY.zokaPicks(date));
    eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: data });
  };

  const handleZokaPublish = async (data) => {
    if (!db) return;
    await setDoc(doc(db, PATHS.ZOKA_PICKS, date), { ...data, isDraft: false, publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    dataLayer.invalidate(CACHE_KEY.zokaPicks(date));
    eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: data });
  };

  const handleZokaUnpublish = async () => {
    if (!db || !pubPicks) return;
    setConfirm({
      title: 'Unpublish All Zoka Picks?',
      msg: `This will remove ${pubPicks.matches?.length || 0} published pick(s) for ${dateLabel(date)}. Users won't see them anymore.`,
      onYes: async () => {
        await deleteDoc(doc(db, PATHS.ZOKA_PICKS, date));
        setPubPicks(null);
        dataLayer.invalidate(CACHE_KEY.zokaPicks(date));
        eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: null });
        setConfirm(null);
      },
    });
  };

  const handleFeaturedAdd = async (m) => {
    if (!db) return;
    if (isLive(m) || isFin(m)) { setToast('Cannot add live or finished matches', 'er'); return; }
    const matchDate = date;
    const predId = `feat_${date}_${m.id}`;
    const pred = {
      id: predId, matchId: String(m.id), matchDate,
      homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      homeLogo: m.homeTeam?.crest || null, awayLogo: m.awayTeam?.crest || null,
      league: m.competition || m.league, kickoff: m.utcDate || m.kickoff,
      status: m.status || 'NS', homeScore: null, awayScore: null, priority: preds.length + 1,
    };

    const updatedPreds = [...preds, pred];
    setPreds(updatedPreds);

    await setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { ...pred, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: updatedPreds, updatedAt: serverTimestamp() }, { merge: true });

    dataLayer.invalidate(CACHE_KEY.activePredictions(date));
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updatedPreds });
  };

  const handleFeaturedRemove = async (p) => {
    if (!db) return;
    const predId = p.id || `feat_${date}_${p.matchId}`;
    const updatedPreds = preds.filter(pr => String(pr.matchId) !== String(p.matchId));
    setPreds(updatedPreds);

    await deleteDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId));
    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: updatedPreds, updatedAt: serverTimestamp() }, { merge: true });

    dataLayer.invalidate(CACHE_KEY.activePredictions(date));
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updatedPreds });
  };

  const handleResolve = async (pred, h, a, isAuto = false) => {
    const matchId = String(pred.matchId || pred.id);
    const predId = pred.id || `feat_${date}_${matchId}`;

    await setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { homeScore: h, awayScore: a, status: 'finished', updatedAt: serverTimestamp() }, { merge: true });

    const updated = preds.map(p => String(p.matchId) === matchId ? { ...p, homeScore: h, awayScore: a, status: 'finished', isFinished: true } : p);
    setPreds(updated);

    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: updated, updatedAt: serverTimestamp() }, { merge: true });

    await resolveMatchForAllUsers(matchId, h, a, date);

    dataLayer.invalidate(CACHE_KEY.activePredictions(date));
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updated });
    eventBus.emit(EVENT.MATCH_RESOLVED, { matchId, dateStr: date, actualH: h, actualA: a });

    if (!isAuto) setToast(`Resolved: ${pred.homeTeam?.shortName} ${h}-${a} ${pred.awayTeam?.shortName}`, 'ok');
  };

  const handleOverride = async (pred, h, a) => {
    const matchId = String(pred.matchId || pred.id);
    const predId = pred.id || `feat_${date}_${matchId}`;

    await setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { homeScore: h, awayScore: a, updatedAt: serverTimestamp() }, { merge: true });

    const updated = preds.map(p => String(p.matchId) === matchId ? { ...p, homeScore: h, awayScore: a } : p);
    setPreds(updated);

    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: updated, updatedAt: serverTimestamp() }, { merge: true });

    await resolveMatchForAllUsers(matchId, h, a, date);

    dataLayer.invalidate(CACHE_KEY.activePredictions(date));
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updated });
    eventBus.emit(EVENT.MATCH_RESOLVED, { matchId, dateStr: date, actualH: h, actualA: a });
  };

  const handleRebuild = async (period) => {
    setRebuilding(period);
    try {
      if (period === 'daily') await rebuildDailySummary(date);
      else if (period === 'goat') await rebuildGoatLeaderboard();
      else if (period === 'weekly') await rebuildPeriodLeaderboard('weekly');
      else if (period === 'monthly') await rebuildPeriodLeaderboard('monthly');
      else if (period === 'all') await rebuildAllLeaderboards();
    } catch (e) { console.error('[Admin] Rebuild err:', e); }
    setRebuilding(null);
  };

  return (
    <div className="ap">
      <SEO title="Admin Dashboard | ZOKASCORE" description="Access the ZOKASCORE admin control room to securely manage fixtures, review Zoka picks, resolve match results, and rebuild leaderboards efficiently." keywords="admin dashboard, ZOKASCORE admin, manage fixtures, resolve matches, rebuild leaderboards" path="/admin" robots="noindex,nofollow" />
      <div className="aw">
        <div className="ah">
          <button className="ab ab-gh ab-sm" onClick={() => nav('/')} style={{ position: 'absolute', left: 16, top: 20 }}>
            <ArrowLeft size={14} />
          </button>
          <h1><ShieldAlert size={14} style={{ color: 'var(--gold)', verticalAlign: 'middle', marginRight: 6 }} /> Admin Control Room</h1>
          <div className="sub">{userProfile?.displayName || 'Staff'} · {dateLabel(date)}</div>
        </div>

        <div className="at">
          {TABS.map(t => (
            <button key={t.key} className={`atb${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
              <t.icon size={13} /><span className="lb">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="ask" style={{ top: 108 }}>
          <div className="adb">
            {defaultDates.map(d => (
              <button key={d} className={`adp${d === date ? ' on' : ''}`} onClick={() => setDate(d)}>{dateLabel(d)}</button>
            ))}
            <button className="more-dates-btn" onClick={() => setShowMoreDates(p => !p)}>
              {showMoreDates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showMoreDates ? 'Less' : 'More dates'}
            </button>
            {showMoreDates && extraDates.map(d => (
              <button key={d} className={`adp past${d === date ? ' on' : ''}`} onClick={() => setDate(d)}>{dateLabel(d)}</button>
            ))}
          </div>
        </div>

        {tab === 'dashboard' && (
          <DashTab preds={preds} pubPicks={pubPicks} fxCount={dayFixtures.length} liveCount={liveCount} finCount={finCount} date={date} onRebuild={handleRebuild} rebuilding={rebuilding} />
        )}

        {tab === 'zoka' && (
          <ZokaTab date={date} fixtures={allFixtures} fxLoading={primaryLoading} pubPicks={pubPicks} onPublish={handleZokaPublish} onUnpublish={handleZokaUnpublish} onSaveDraft={handleZokaSaveDraft} toast={setToast} />
        )}

        {tab === 'featured' && (
          <FeaturedTab date={date} preds={preds} fixtures={allFixtures} onAdd={handleFeaturedAdd} onRemove={handleFeaturedRemove} fxLoading={primaryLoading} toast={setToast} />
        )}

        {tab === 'results' && (
          <ResultsTab date={date} preds={preds} onResolve={handleResolve} onOverride={handleOverride} toast={setToast} />
        )}

        {tab === 'broadcast' && <BroadcastTab toast={setToast} />}
        {tab === 'staff' && <StaffTab toast={setToast} />}
        {tab === 'users' && <UsersTab toast={setToast} />}
      </div>

      {toast && <Toast message={typeof toast === 'string' ? toast : toast} type={typeof toast === 'string' ? 'ok' : toast} onDone={() => setToast(null)} />}
      {confirm && <Confirm title={confirm.title} msg={confirm.msg} onYes={confirm.onYes} onNo={() => setConfirm(null)} danger={confirm.danger} />}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
function DashTab({ preds, pubPicks, fxCount, liveCount, finCount, date, onRebuild, rebuilding }) {
  const pr = pubPicks?.matches || [];
  let zE = 0, zR = 0, zM = 0, zP = 0;
  pr.forEach(p => {
    if (p.status !== 'finished' || p.homeScore == null) { zP++; return; }
    const h = p.adminPick?.home, a = p.adminPick?.away;
    if (h === p.homeScore && a === p.awayScore) { zE++; return; }
    if ((h > a ? 'H' : h < a ? 'A' : 'D') === (p.homeScore > p.awayScore ? 'H' : p.homeScore < p.awayScore ? 'A' : 'D')) { zR++; return; }
    zM++;
  });
  const zT = pr.length, res = Math.max(zT - zP, 1);
  const zAcc = zT > 0 ? Math.round(((zE + zR) / res) * 100) : 0;

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Activity size={15} /> Overview — {dateLabel(date)}</h3>
        <div className="asg">
          <div className="astat"><span className="n bl">{fxCount}</span><span className="l">Fixtures</span></div>
          <div className="astat"><span className="n rd">{liveCount}</span><span className="l">Live</span></div>
          <div className="astat"><span className="n gn">{finCount}</span><span className="l">Finished</span></div>
          <div className="astat"><span className="n gd">{preds.length}</span><span className="l">Featured</span></div>
          <div className="astat"><span className="n gd">{zT}</span><span className="l">Zoka</span></div>
          <div className="astat"><span className="n gn">{zAcc}%</span><span className="l">Zoka Acc</span></div>
        </div>
        {zT > 0 && (
          <div className="azs">
            <span className="abdg ex"><CheckCircle2 size={9} /> {zE} Exact</span>
            <span className="abdg rs"><TrendingUp size={9} /> {zR} Result</span>
            <span className="abdg ms"><XCircle size={9} /> {zM} Miss</span>
            {zP > 0 && <span className="abdg pn">{zP} Pending</span>}
          </div>
        )}
      </div>
      <div className="asec">
        <h3 className="ast"><RotateCcw size={15} /> Rebuild Leaderboards</h3>
        <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: '0 0 12px', fontWeight: 600, lineHeight: 1.4 }}>
          Run after scoring matches to update all user rankings.
          <br /><span style={{ fontSize: '.68rem', opacity: 0.7 }}>Other pages auto-update via events</span>
        </p>
        <div className="arg">
          {[['daily','Daily ('+dateLabel(date)+')',CalendarDays],['goat','GOAT',Crown],['weekly','Weekly',Timer],['monthly','Monthly',BarChart3]].map(([k,l,Ic]) => (
            <button key={k} className="arb" onClick={() => onRebuild(k)} disabled={rebuilding === k}>
              {rebuilding === k ? <Loader2 size={13} className="asp" /> : <Ic size={13} />}{l}
            </button>
          ))}
          <button className="arb" onClick={() => onRebuild('all')} disabled={rebuilding === 'all'} style={{ gridColumn: '1 / -1' }}>
            {rebuilding === 'all' ? <Loader2 size={13} className="asp" /> : <Sparkles size={13} />}Rebuild All
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════
   ZOKA PICKS TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
function ZokaTab({ date, fixtures, fxLoading, pubPicks, onPublish, onUnpublish, onSaveDraft, toast }) {
  const mounted = useMounted();
  const [, refresh] = useState(0);
  const mk = `zoka_${date}`;

  const setSel = (v) => { memUpdate(`${mk}_sel`, v); refresh(n => n + 1); };
  const setLg = (v) => { memUpdate(`${mk}_lg`, v); refresh(n => n + 1); };
  const setShowAll = (v) => { memUpdate(`${mk}_show`, v); refresh(n => n + 1); };

  const sel = mem.get(`${mk}_sel`, {});
  const lg = mem.get(`${mk}_lg`, 'ALL');
  const showAll = mem.get(`${mk}_show`, false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [hist, setHist] = useState([]);
  const [histLoad, setHistLoad] = useState(false);
  const [openDay, setOpenDay] = useState(null);

  const dayFx = useMemo(() => fixtures?.filter(m => extractDate(m) === date) || [], [fixtures, date]);
  const selectableFx = useMemo(() => dayFx.filter(m => !isFin(m) && !isLive(m)), [dayFx]);

  const leagues = useMemo(() => {
    const map = new Map();
    selectableFx.forEach(f => {
      const c = f.competition || f.league; if (!c) return;
      const id = String(c.id || c.code || 'x');
      if (!map.has(id)) map.set(id, { id, name: c.name || 'Other', emblem: c.emblem || c.logo || null, n: 0 });
      map.get(id).n++;
    });
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [selectableFx]);

  const filtered = useMemo(() => {
    let l = selectableFx;
    if (lg !== 'ALL') l = l.filter(f => String(f.competition?.id || f.league?.id) === lg);
    return l;
  }, [selectableFx, lg]);

  const vis = useMemo(() => showAll ? filtered : filtered.slice(0, SHOW_INIT), [filtered, showAll]);
  const hidden = Math.max(0, filtered.length - SHOW_INIT);
  const ids = useMemo(() => new Set(Object.keys(sel)), [sel]);
  const cnt = ids.size;
  const full = cnt >= MAX_ZOKA;
  const scored = Object.values(sel).filter(s => s.h !== '' && s.a !== '').length;
  const ready = cnt > 0 && scored === cnt;

  const pubMatches = useMemo(() => Array.isArray(pubPicks) ? pubPicks : (pubPicks?.matches || []), [pubPicks]);
  const pubMap = useMemo(() => new Map(pubMatches.map(p => [String(p.matchId), p])), [pubMatches]);

  const toggle = (m) => {
    if (isFin(m) || isLive(m)) { toast('Cannot select finished or live matches', 'in'); return; }
    const id = String(m.id);
    if (ids.has(id)) {
      setSel(prev => { const n = { ...prev }; delete n[id]; return n; });
    } else if (!full) {
      const existing = pubMap.get(id);
      setSel(prev => ({ ...prev, [id]: existing ? { h: String(existing.adminPick?.home ?? ''), a: String(existing.adminPick?.away ?? '') } : { h: '', a: '' } }));
    } else {
      toast(`Max ${MAX_ZOKA} Zoka Picks`, 'in');
    }
  };

  const updScore = (mid, f, v) => {
    const c = v.replace(/[^0-9]/g, '').slice(0, 2);
    setSel(prev => ({ ...prev, [mid]: { ...(prev[mid] || {}), [f]: c } }));
  };

  const buildNewPicks = () => {
    const picks = [];
    for (const [mid, sc] of Object.entries(sel)) {
      const m = dayFx.find(x => String(x.id) === mid);
      if (!m || sc.h === '' || sc.a === '') continue;
      const s = getScore(m);
      picks.push({
        matchId: m.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        homeLogo: m.homeTeam?.crest || null, awayLogo: m.awayTeam?.crest || null,
        league: m.competition || m.league, kickoff: m.utcDate || m.kickoff,
        adminPick: { home: Number(sc.h), away: Number(sc.a) },
        homeScore: isFin(m) ? s.h : null, awayScore: isFin(m) ? s.a : null,
        status: isFin(m) ? 'finished' : 'upcoming',
      });
    }
    return picks;
  };

  const mergeWithExisting = (newPicks) => {
    const existing = pubMatches;
    const merged = [...existing];
    for (const np of newPicks) {
      const idx = merged.findIndex(p => String(p.matchId) === String(np.matchId));
      if (idx >= 0) merged[idx] = np;
      else merged.push(np);
    }
    return merged;
  };

  const handleSave = async () => {
    if (!db || cnt === 0) return;
    setSaving(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setSaving(false); return; }
      const merged = mergeWithExisting(newPicks);
      await onSaveDraft({ matches: merged, date, totalMatches: merged.length, isDraft: !ready, publishedAt: serverTimestamp() });
      setSel({});
      setFlash(true);
      setTimeout(() => { if (mounted.current) setFlash(false); }, 1400);
      toast(`Saved ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)`, 'ok');
    } catch (e) { console.error('[Zoka] Save err:', e); toast('Save failed', 'er'); }
    setSaving(false);
  };

  const handlePublish = async () => {
    if (!db || !ready) return;
    setPublishing(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setPublishing(false); return; }
      const merged = mergeWithExisting(newPicks);
      await onPublish({ matches: merged, date, totalMatches: merged.length, isDraft: false, publishedAt: serverTimestamp() });
      setSel({});
      toast(`Published ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)!`, 'ok');
    } catch (e) { console.error('[Zoka] Pub err:', e); toast('Publish failed', 'er'); }
    setPublishing(false);
  };

  const loadHist = async () => {
    if (hist.length > 0 || histLoad) return;
    setHistLoad(true);
    try {
      const days = [];
      for (let i = 1; i <= 7; i++) {
        const d = dateOffset(-i);
        try {
          const data = await dataLayer.fetchZokaPicks(d);
          if (data && data.matches) {
            const matches = data.matches || [];
            let e = 0, r = 0, mi = 0, p = 0;
            matches.forEach(pk => {
              if (pk.status !== 'finished' || pk.homeScore == null) { p++; return; }
              const h = pk.adminPick?.home, a = pk.adminPick?.away;
              if (h === pk.homeScore && a === pk.awayScore) { e++; return; }
              if ((h > a ? 'H' : h < a ? 'A' : 'D') === (pk.homeScore > pk.awayScore ? 'H' : pk.homeScore < pk.awayScore ? 'A' : 'D')) { r++; return; }
              mi++;
            });
            days.push({ date: d, matches, e, r, mi, p, total: matches.length });
          }
        } catch { /* skip */ }
      }
      if (mounted.current) setHist(days);
    } catch (e) { console.error('[Zoka] Hist err:', e); }
    setHistLoad(false);
  };

  const pubRes = useMemo(() => {
    if (!pubMatches.length) return { e: 0, r: 0, mi: 0, p: 0 };
    let e = 0, r = 0, mi = 0, p = 0;
    pubMatches.forEach(pk => {
      if (pk.status !== 'finished' || pk.homeScore == null) { p++; return; }
      const h = pk.adminPick?.home, a = pk.adminPick?.away;
      if (h === pk.homeScore && a === pk.awayScore) { e++; return; }
      if ((h > a ? 'H' : h < a ? 'A' : 'D') === (pk.homeScore > pk.awayScore ? 'H' : pk.homeScore < pk.awayScore ? 'A' : 'D')) { r++; return; }
      mi++;
    });
    return { e, r, mi, p };
  }, [pubMatches]);

  return (
    <div className="ae">
      {cnt > 0 && (
        <div className="asec pop" style={{ background: 'rgba(245,197,66,.03)', borderColor: 'rgba(245,197,66,.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                {cnt}/{MAX_ZOKA} selected
                {scored === cnt && cnt > 0 && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>✓ All scored</span>}
              </span>
              {Object.keys(sel).some(mid => pubMap.has(mid)) && (
                <div className="aedit-hint"><Pencil size={9} /> Editing {Object.keys(sel).filter(mid => pubMap.has(mid)).length} existing</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button className="ab ab-gh ab-sm" onClick={handleSave} disabled={saving || cnt === 0 || scored === 0}>
                <Save size={12} /> Save
              </button>
              <button className="ab ab-gd ab-sm" onClick={handlePublish} disabled={publishing || !ready} title={!ready ? 'Enter scores for all picks to publish' : ''}>
                <Send size={12} /> Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {pubMatches.length > 0 && cnt === 0 && (
        <div className="azs pop" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{pubMatches.length} published · Tap a match to edit</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <span className="abdg ex"><CheckCircle2 size={9} /> {pubRes.e}</span>
              <span className="abdg rs"><TrendingUp size={9} /> {pubRes.r}</span>
              <span className="abdg ms"><XCircle size={9} /> {pubRes.mi}</span>
              {pubRes.p > 0 && <span className="abdg pn">{pubRes.p}</span>}
            </div>
            <button className="ab ab-dg ab-sm" onClick={onUnpublish} style={{ marginLeft: 'auto' }}><X size={11} /> Unpublish All</button>
          </div>
        </div>
      )}

      {leagues.length > 1 && (
        <div className="alb" style={{ marginTop: 10 }}>
          <button className={`alp${lg === 'ALL' ? ' on' : ''}`} onClick={() => setLg('ALL')}>All ({selectableFx.length})</button>
          {leagues.map(l => (
            <button key={l.id} className={`alp${lg === l.id ? ' on' : ''}`} onClick={() => setLg(l.id)}>
              {l.emblem && <img src={l.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
              {l.name} ({l.n})
            </button>
          ))}
        </div>
      )}

      {fxLoading ? <Skel n={4} /> : vis.length > 0 ? (
        <div className={flash ? 'sf' : ''}>
          {vis.map((m, i) => {
            const mid = String(m.id);
            const isPublished = pubMap.has(mid);
            return (
              <div key={mid}>
                <MatchRow m={m} idx={i} mode="zoka" sel={sel[mid]} onToggleSel={toggle}
                  scoreInput={sel[mid]} onScoreInput={updScore} pubPick={isPublished ? pubMap.get(mid) : null}
                  extraBadge={isPublished && !sel[mid] ? (<span className="abdg gd"><Star size={9} /> Published</span>) : null}
                />
                {isPublished && !sel[mid] && (
                  <div className="aedit-hint" style={{ margin: '-4px 16px 8px', cursor: 'pointer' }} onClick={() => toggle(m)}>
                    <Pencil size={9} /> Tap to edit published pick: {pubMap.get(mid).adminPick?.home}-{pubMap.get(mid).adminPick?.away}
                  </div>
                )}
              </div>
            );
          })}
          <ShowMore count={hidden} show={showAll} onToggle={() => setShowAll(p => !p)} />
        </div>
      ) : (
        <Empty icon={Star} title={dayFx.length === 0 ? 'No fixtures for this date' : 'No upcoming matches available'} hint={dayFx.length === 0 ? 'Try a different day' : 'Live and finished matches cannot be selected'} />
      )}

      <div className="asec" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => { setShowHist(p => !p); if (!showHist) loadHist(); }}>
          <h3 className="ast" style={{ margin: 0 }}><History size={15} /> Zoka Picks History</h3>
          {showHist ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </div>
        {showHist && (
          <div style={{ marginTop: 10 }}>
            {histLoad ? <Skel n={2} /> : hist.length > 0 ? hist.map(day => {
              const isOpen = openDay === day.date;
              const res = day.total - day.p;
              const acc = res > 0 ? Math.round(((day.e + day.r) / res) * 100) : 0;
              return (
                <div key={day.date} className={`ahc${isOpen ? ' op' : ''}`} onClick={() => setOpenDay(isOpen ? null : day.date)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>{dateLabel(day.date)}</div>
                      <div style={{ fontSize: '.67rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>{day.total} picks · {acc}% accuracy</div>
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <span className="abdg ex" style={{ fontSize: '.6rem' }}>{day.e}E</span>
                      <span className="abdg rs" style={{ fontSize: '.6rem' }}>{day.r}R</span>
                      <span className="abdg ms" style={{ fontSize: '.6rem' }}>{day.mi}M</span>
                    </div>
                  </div>
                  {isOpen && day.matches.map((pk, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', marginTop: 6, fontSize: '.75rem', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pk.homeTeam?.shortName || pk.homeTeam?.name || '?'}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 5px' }}>vs</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pk.awayTeam?.shortName || pk.awayTeam?.name || '?'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--gold,#f5c542)', fontSize: '.82rem' }}>{pk.adminPick?.home}-{pk.adminPick?.away}</span>
                        {pk.status === 'finished' && pk.homeScore != null && <><span style={{ color: 'var(--text-muted)' }}>→</span><span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', fontSize: '.82rem' }}>{pk.homeScore}-{pk.awayScore}</span></>}
                        <RBadge pick={pk} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }) : <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: 14, fontWeight: 600 }}>No previous Zoka Picks found</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════
   FEATURED TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
function FeaturedTab({ date, preds, fixtures, onAdd, onRemove, fxLoading, toast }) {
  const [, refresh] = useState(0);
  const mk = `feat_${date}`;
  const setLg = (v) => { memUpdate(`${mk}_lg`, v); refresh(n => n + 1); };
  const setShowAll = (v) => { memUpdate(`${mk}_show`, v); refresh(n => n + 1); };
  const lg = mem.get(`${mk}_lg`, 'ALL');
  const showAll = mem.get(`${mk}_show`, false);
  const [addingId, setAddingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const isFull = preds.length >= MAX_FEATURED;

  const pids = useMemo(() => new Set(preds.map(p => String(p.matchId))), [preds]);

  const avail = useMemo(() => {
    if (!fixtures?.length) return [];
    let l = fixtures.filter(m => extractDate(m) === date && !isFin(m) && !isLive(m)); 
    if (lg !== 'ALL') l = l.filter(f => String(f.competition?.id || f.league?.id) === lg);
    return l;
  }, [fixtures, date, lg]);

  const leagues = useMemo(() => {
    const map = new Map();
    (fixtures?.filter(m => extractDate(m) === date && !isFin(m) && !isLive(m)) || []).forEach(f => {
      const c = f.competition || f.league; if (!c) return;
      const id = String(c.id || c.code || 'x');
      if (!map.has(id)) map.set(id, { id, name: c.name || 'Other', emblem: c.emblem || c.logo || null, n: 0 });
      map.get(id).n++;
    });
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [fixtures, date]);

  const vis = useMemo(() => showAll ? avail : avail.slice(0, SHOW_INIT), [avail, showAll]);
  const hidden = Math.max(0, avail.length - SHOW_INIT);

  const handleAddClick = async (m) => {
    if (isFull) return;
    const mid = String(m.id);
    setAddingId(mid);
    try { await onAdd(m); } catch (e) { toast('Add failed: ' + e.message, 'er'); }
    finally { setAddingId(null); }
  };

  const handleRemoveClick = async (p) => {
    setRemovingId(String(p.matchId));
    try { await onRemove(p); } catch (e) { toast('Remove failed: ' + e.message, 'er'); }
    finally { setRemovingId(null); }
  };

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Radio size={15} /> Featured Matches ({preds.length}/{MAX_FEATURED})</h3>
        {preds.length > 0 ? (
          <div>
            {preds.map((p, i) => {
              const mid = String(p.matchId);
              const isRemoving = removingId === mid;
              const sc = p.homeScore != null ? { h: p.homeScore, a: p.awayScore } : null;
              const live = isLive(p);
              const finished = isFin(p);
              const st = finished ? { c: 'var(--accent)', b: 'rgba(0,230,118,.08)', l: 'FT' } : live ? { c: '#ef4444', b: 'rgba(239,68,68,.1)', l: 'Live' } : { c: 'var(--text-muted)', b: 'rgba(255,255,255,.04)', l: p.kickoff || 'VS' };
              return (
                <div key={mid} className="am card-in" style={{ animationDelay: `${i * 20}ms`, borderLeft: '3px solid var(--accent)' }}>
                  <div className="amh">
                    <div className="aml">
                      {p.league?.emblem && <img src={p.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{p.league?.name || 'Featured'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {live && <span className="ld" />}
                      <span className="as" style={{ color: st.c, background: st.b }}>{st.l}</span>
                    </div>
                  </div>
                  <div className="atm">
                    <div className="ate">
                      {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                    </div>
                    <div className={`asb${live ? ' lv' : ''}${finished ? ' ft' : ''}`}>
                      {sc ? (<><span className={`asn${live ? ' r' : ' g'}`}>{sc.h}</span><span className="asep">–</span><span className={`asn${live ? ' r' : ' g'}`}>{sc.a}</span></>) : <span className="avs">VS</span>}
                    </div>
                    <div className="ate aw">
                      {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                    </div>
                  </div>
                  <div className="aa">
                    <span className="abdg gn"><Radio size={9} /> Featured</span>
                    <button className="ab ab-sm ab-dg" onClick={() => handleRemoveClick(p)} disabled={isRemoving}>
                      {isRemoving ? <Loader2 size={11} className="asp" /> : <Trash2 size={11} />} Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={Radio} title="No featured matches yet" hint="Add matches below for users to predict" />
        )}
      </div>

      <div className="asec">
        <h3 className="ast"><Plus size={15} /> Available Matches {isFull && <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: '.75rem' }}>(FULL)</span>}</h3>
        {leagues.length > 1 && (
          <div className="alb" style={{ marginBottom: 10 }}>
            <button className={`alp${lg === 'ALL' ? ' on' : ''}`} onClick={() => setLg('ALL')}>All</button>
            {leagues.map(l => (
              <button key={l.id} className={`alp${lg === l.id ? ' on' : ''}`} onClick={() => setLg(l.id)}>
                {l.emblem && <img src={l.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                {l.name} ({l.n})
              </button>
            ))}
          </div>
        )}
        {fxLoading ? <Skel n={3} /> : vis.length > 0 ? (
          <div>
            {vis.map((m, i) => {
              const mid = String(m.id);
              const isAdding = addingId === mid;
              const isFeatured = pids.has(mid);
              return (
                <MatchRow key={mid} m={m} idx={i} mode="featured"
                  onAction={(match) => (
                    isFeatured ? (
                      <span className="abdg gn"><CheckCircle2 size={9} /> Featured</span>
                    ) : (
                      <button className="ab ab-sm ab-sc" onClick={() => handleAddClick(match)} disabled={isAdding || isFull}>
                        {isAdding ? <Loader2 size={11} className="asp" /> : <Plus size={11} />}
                        {isFull ? 'Full' : 'Add'}
                      </button>
                    )
                  )}
                />
              );
            })}
            <ShowMore count={hidden} show={showAll} onToggle={() => setShowAll(p => !p)} />
          </div>
        ) : (
          <Empty icon={CalendarDays} title="No available matches" hint="Live and finished matches cannot be featured" />
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════
   RESULTS TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
function ResultsTab({ date, preds, onResolve, onOverride, toast }) {
  const mounted = useMounted();
  const [scores, setScores] = useState({});
  const [resolving, setResolving] = useState({});
  const [overriding, setOverriding] = useState({});

  const unresolved = useMemo(() =>
    preds.filter(p => {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      const hasNewScore = s && s.h !== '' && s.a !== '';
      const hasExistingScore = p.homeScore != null && p.awayScore != null;
      return !p.isFinished && p.status !== 'finished' || hasNewScore || !hasExistingScore;
    }),
    [preds, scores]
  );

  const resolved = useMemo(() => preds.filter(p => p.isFinished || p.status === 'finished'), [preds]);

  const updScore = (mid, f, v) => {
    const c = v.replace(/[^0-9]/g, '').slice(0, 2);
    setScores(prev => ({ ...prev, [mid]: { ...(prev[mid] || {}), [f]: c } }));
  };

  const handleResolve = async (pred) => {
    const mid = String(pred.matchId || pred.id);
    const s = scores[mid];
    const h = s?.h !== '' ? Number(s.h) : (pred.homeScore ?? null);
    const a = s?.a !== '' ? Number(s.a) : (pred.awayScore ?? null);

    if (h == null || a == null) { toast('Enter both scores', 'in'); return; }

    setResolving(prev => ({ ...prev, [mid]: true }));
    try {
      await onResolve(pred, h, a);
      setScores(prev => { const n = { ...prev }; delete n[mid]; return n; });
      toast(`Resolved: ${pred.homeTeam?.shortName || pred.homeTeam?.name} ${h}-${a} ${pred.awayTeam?.shortName || pred.awayTeam?.name}`, 'ok');
    } catch (e) { toast('Resolve failed: ' + e.message, 'er'); }
    setResolving(prev => ({ ...prev, [mid]: false }));
  };

  const handleOverride = async (pred) => {
    const mid = String(pred.matchId || pred.id);
    const s = scores[mid];
    const h = s?.h !== '' ? Number(s.h) : null;
    const a = s?.a !== '' ? Number(s.a) : null;

    if (h == null || a == null) { toast('Enter new scores to override', 'in'); return; }

    setOverriding(prev => ({ ...prev, [mid]: true }));
    try {
      await onOverride(pred, h, a);
      setScores(prev => { const n = { ...prev }; delete n[mid]; return n; });
      toast(`Override: ${pred.homeTeam?.shortName || pred.homeTeam?.name} → ${h}-${a}`, 'ok');
    } catch (e) { toast('Override failed: ' + e.message, 'er'); }
    setOverriding(prev => ({ ...prev, [mid]: false }));
  };

  const handleResolveAll = async () => {
    const toResolve = unresolved.filter(p => {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      return s?.h !== '' && s?.a !== '';
    });
    if (toResolve.length === 0) { toast('No scored matches to resolve', 'in'); return; }

    setResolving(prev => { const n = { ...prev }; toResolve.forEach(p => { n[String(p.matchId || p.id)] = true; }); return n; });

    let ok = 0, fail = 0;
    for (const p of toResolve) {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      try { await onResolve(p, Number(s.h), Number(s.a)); ok++; } catch { fail++; }
    }

    setScores({});
    setResolving({});
    toast(`Resolved ${ok} match${ok !== 1 ? 'es' : ''}${fail > 0 ? ', ' + fail + ' failed' : ''}`, fail > 0 ? 'er' : 'ok');
  };

  return (
    <div className="ae">
      {unresolved.length > 0 && (
        <div className="asec">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 className="ast" style={{ margin: 0 }}><Zap size={15} /> Score & Resolve ({unresolved.length})</h3>
            <button className="ab ab-sm ab-p" onClick={handleResolveAll} disabled={Object.values(resolving).some(Boolean)}>
              <Zap size={11} /> Resolve All Scored
            </button>
          </div>
          {unresolved.map((p, i) => {
            const mid = String(p.matchId || p.id);
            const s = scores[mid] || {};
            const isResolving = resolving[mid];
            const hasExisting = p.homeScore != null;
            return (
              <div key={mid} className={`am card-in${hasExisting ? ' editing' : ''}`} style={{ animationDelay: `${i * 20}ms` }}>
                <div className="amh">
                  <div className="aml">
                    {p.league?.emblem && <img src={p.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.league?.name || 'Match'}</span>
                  </div>
                  {hasExisting && <span className="as" style={{ color: 'var(--gold)', background: 'rgba(245,158,11,.1)' }}>OVERRIDE</span>}
                </div>
                <div className="atm">
                  <div className="ate">
                    {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                  </div>
                  <div className="asb" style={{ borderColor: 'rgba(0,230,118,.25)', background: 'rgba(0,230,118,.04)' }}>
                    <input className={`ari${s.h ? ' hv' : ''}`} type="number" min="0" max="99" value={s.h ?? (p.homeScore ?? '')} onChange={e => updScore(mid, 'h', e.target.value)} placeholder={p.homeScore ?? '-'} />
                    <span className="asep">–</span>
                    <input className={`ari${s.a ? ' hv' : ''}`} type="number" min="0" max="99" value={s.a ?? (p.awayScore ?? '')} onChange={e => updScore(mid, 'a', e.target.value)} placeholder={p.awayScore ?? '-'} />
                  </div>
                  <div className="ate aw">
                    {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                  </div>
                </div>
                <div className="aa">
                  {hasExisting ? (
                    <button className="ab ab-sm ab-olive" onClick={() => handleOverride(p)} disabled={overriding[mid] || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                      {overriding[mid] ? <Loader2 size={11} className="asp" /> : <Copy size={11} />} Override
                    </button>
                  ) : (
                    <button className="ab ab-sm ab-p" onClick={() => handleResolve(p)} disabled={isResolving || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                      {isResolving ? <Loader2 size={11} className="asp" /> : <Check size={11} />} Resolve
                    </button>
                  )}
                  {p.homeScore != null && <span className="abdg pn">Was: {p.homeScore}-{p.awayScore}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="asec">
          <h3 className="ast"><CheckCircle2 size={15} /> Resolved ({resolved.length})</h3>
          {resolved.map((p, i) => {
            const mid = String(p.matchId || p.id);
            const s = scores[mid] || {};
            const isOverriding = overriding[mid];
            return (
              <div key={mid} className="am card-in ok resolved" style={{ animationDelay: `${i * 15}ms` }}>
                <div className="amh">
                  <div className="aml">
                    {p.league?.emblem && <img src={p.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.league?.name || 'Match'}</span>
                  </div>
                  <span className="as" style={{ color: 'var(--accent)', background: 'rgba(0,230,118,.08)' }}>FT</span>
                </div>
                <div className="atm">
                  <div className="ate">
                    {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                  </div>
                  <div className="asb ft" style={{ borderColor: 'rgba(0,230,118,.25)', background: 'rgba(0,230,118,.04)' }}>
                    <input className={`ari${s.h ? ' hv' : ''}`} type="number" min="0" max="99" value={s.h ?? p.homeScore} onChange={e => updScore(mid, 'h', e.target.value)} />
                    <span className="asep">–</span>
                    <input className={`ari${s.a ? ' hv' : ''}`} type="number" min="0" max="99" value={s.a ?? p.awayScore} onChange={e => updScore(mid, 'a', e.target.value)} />
                  </div>
                  <div className="ate aw">
                    {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                  </div>
                </div>
                <div className="aa">
                  <span className="abdg ex"><CheckCircle2 size={9} /> {p.homeScore}-{p.awayScore}</span>
                  <button className="ab ab-sm ab-olive" onClick={() => handleOverride(p)} disabled={isOverriding || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                    {isOverriding ? <Loader2 size={11} className="asp" /> : <Copy size={11} />} Override
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preds.length === 0 && (
        <Empty icon={Trophy} title="No featured matches for this date" hint="Add featured matches first, then score them here" />
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════
   BROADCAST TAB (UPGRADED)
   ═════════════════════════════════════════════════════════════════════════════════ */
function BroadcastTab({ toast }) {
  const [type, setType] = useState('global');
  const [uid, setUid] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  // User loading state for personal messages
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState('');
  const [showUserList, setShowUserList] = useState(false);

  const loadUsers = async () => {
    if (!db) return;
    setLoadingUsers(true);
    try {
      // ★ FIX: Removed orderBy('createdAt') which crashes if a user is missing that field
      const snap = await getDocs(query(collection(db, 'users'), limitQ(100)));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setShowUserList(true);
    } catch (e) {
      toast('Load failed: ' + e.message, 'er');
    }
    setLoadingUsers(false);
  };

  const selectUser = (u) => {
    setType('personal');
    setUid(u.id);
    setSearch(`${u.displayName || u.email || u.id}`);
    setShowUserList(false);
    toast(`Selected ${u.displayName || u.email}`, 'ok');
  };

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => 
      (u.displayName || '').toLowerCase().includes(q) || 
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleSend = async () => {
    if (!db || !title.trim() || !message.trim()) return;
    if (type === 'personal' && !uid.trim()) { toast('Target UID required', 'in'); return; }
    
    setSending(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        type,
        targetUid: type === 'personal' ? uid.trim() : null,
        title: title.trim(),
        body: message.trim(),
        createdAt: serverTimestamp(),
        readBy: [],
      });
      toast(`Notification sent!`, 'ok');
      setTitle(''); setMessage(''); setUid(''); setSearch('');
    } catch (e) { toast('Send failed: ' + e.message, 'er'); }
    setSending(false);
  };

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Megaphone size={15} /> Send Notification</h3>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className={`ab ab-sm ${type === 'global' ? 'ab-p' : 'ab-ol'}`} onClick={() => setType('global')} style={{ flex: 1 }}>
            <Users size={12} /> Global
          </button>
          <button className={`ab ab-sm ${type === 'personal' ? 'ab-p' : 'ab-ol'}`} onClick={() => setType('personal')} style={{ flex: 1 }}>
            <UserCog size={12} /> Personal
          </button>
        </div>

        {type === 'personal' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="aip" placeholder="Enter User UID manually or load users..." value={search} onChange={e => setSearch(e.target.value)} />
              <button className="ab ab-bl ab-sm" onClick={loadUsers} disabled={loadingUsers} style={{ flexShrink: 0 }}>
                {loadingUsers ? <Loader2 size={11} className="asp" /> : <Users size={11} />} Load Users
              </button>
            </div>
            {showUserList && (
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-surface)' }}>
                {filteredUsers.length > 0 ? filteredUsers.map(u => (
                  <div key={u.id} className="aur" style={{ margin: 0, borderRadius: 0, borderBottom: '1px solid var(--border)' }} onClick={() => selectUser(u)}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', fontWeight: 800, color: '#fff' }}>
                      {(u.displayName || u.email || '??').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName || 'Anonymous'}</div>
                      <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{u.email || u.id}</div>
                    </div>
                  </div>
                )) : <p style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>No users found</p>}
              </div>
            )}
            {uid && <div className="aedit-hint" style={{ marginTop: 4 }}>Target UID: {uid}</div>}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <input className="aip" placeholder="Notification Title..." value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        
        <div style={{ marginBottom: 14 }}>
          <textarea className="aip" placeholder="Message body..." value={message} onChange={e => setMessage(e.target.value)} rows={4} style={{ resize: 'vertical', minHeight: 100 }} />
        </div>

        <button className="ab ab-p" onClick={handleSend} disabled={sending || !title.trim() || !message.trim()} style={{ width: '100%' }}>
          {sending ? <Loader2 size={13} className="asp" /> : <Send size={13} />} Broadcast Message
        </button>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════
   STAFF TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
function StaffTab({ toast }) {
  const mounted = useMounted();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const loadStaff = async () => {
    if (!db) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'staff'])));
      if (mounted.current) {
        setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1)));
      }
    } catch (e) { toast('Load failed: ' + e.message, 'er'); }
    setLoading(false);
  };

  const addStaff = async () => {
    if (!db || !email.trim()) return;
    setAdding(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase())));
      if (snap.empty) { toast('User not found', 'er'); setAdding(false); return; }
      const uid = snap.docs[0].id;
      await setDoc(doc(db, 'users', uid), { role: 'staff', updatedAt: serverTimestamp() }, { merge: true });
      toast(`Added ${email} as staff`, 'ok');
      setEmail('');
      loadStaff();
    } catch (e) { toast('Add failed: ' + e.message, 'er'); }
    setAdding(false);
  };

  const removeRole = async (uid) => {
    if (!db) return;
    try {
      await setDoc(doc(db, 'users', uid), { role: 'user', updatedAt: serverTimestamp() }, { merge: true });
      toast('Role removed', 'ok');
      setStaff(prev => prev.filter(s => s.id !== uid));
    } catch (e) { toast('Remove failed: ' + e.message, 'er'); }
  };

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><UserCog size={15} /> Staff Members</h3>
        <div className="ausr-input">
          <input className="aip" placeholder="Enter email to add as staff..." value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStaff()} />
          <button className="ab ab-p ab-sm" onClick={addStaff} disabled={adding || !email.trim()}>
            {adding ? <Loader2 size={11} className="asp" /> : <Plus size={11} />} Add
          </button>
        </div>
        <button className="ab ab-gh ab-sm" onClick={loadStaff} disabled={loading} style={{ marginBottom: 12 }}>
          {loading ? <Loader2 size={11} className="asp" /> : <Users size={11} />} {staff.length > 0 ? 'Refresh' : 'Load Staff from Firebase'}
        </button>
        {staff.length > 0 ? staff.map(s => (
          <div key={s.id} className="aur">
            <div style={{ width: 38, height: 38, borderRadius: 10, background: s.role === 'admin' ? 'rgba(245,197,66,.12)' : 'rgba(96,165,250,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.role === 'admin' ? 'var(--gold)' : 'var(--blue)', fontWeight: 900, fontSize: '.85rem', flexShrink: 0 }}>
              {(s.displayName || s.email || '??').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.displayName || 'Unknown'}</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>{s.email}</div>
            </div>
            <span className={`abdg ${s.role === 'admin' ? 'gd' : 'bl'}`}>{s.role?.toUpperCase()}</span>
            <button className="ab ab-sm ab-dg" onClick={() => removeRole(s.id)}><Ban size={11} /></button>
          </div>
        )) : !loading && <Empty icon={UserCog} title="No staff loaded" hint="Click the button above to load from Firebase" />}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════
   USERS TAB (FIXED)
   ═════════════════════════════════════════════════════════════════════════════════ */
function UsersTab({ toast }) {
  const mounted = useMounted();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [lastKey, setLastKey] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const loadUsers = async (more = false) => {
    if (!db) return;
    setLoading(true);
    try {
      // ★ FIX: Removed orderBy('createdAt') to prevent query from failing if a user is missing the field
      let q = query(collection(db, 'users'), limitQ(50));
      const snap = await getDocs(q);
      if (mounted.current) {
        const newUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort client-side by createdAt if it exists
        newUsers.sort((a, b) => {
          const tsA = a.createdAt?.seconds || 0;
          const tsB = b.createdAt?.seconds || 0;
          return tsB - tsA;
        });
        setUsers(prev => more ? [...prev, ...newUsers] : newUsers);
        setLastKey(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 50);
      }
    } catch (e) { toast('Load failed: ' + e.message, 'er'); }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => 
      (u.displayName || '').toLowerCase().includes(q) || 
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Users size={15} /> Users</h3>
        <button className="ab ab-p" onClick={() => loadUsers(false)} disabled={loading} style={{ marginBottom: 14, width: '100%', justifyContent: 'center' }}>
          {loading ? <Loader2 size={14} className="asp" /> : <Users size={14} />}
          {users.length > 0 ? 'Reload Users' : 'Load Users from Firebase'}
        </button>
        {users.length > 0 && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input className="aip" style={{ paddingLeft: 36 }} placeholder="Search by name, email, UID..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
        {filtered.length > 0 ? filtered.map((u, i) => (
          <div key={u.id} className="aur">
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `hsl(${(i * 37) % 360}, 50%, 25%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '.78rem', flexShrink: 0 }}>
              {(u.displayName || u.email || '??').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName || 'Anonymous'}</div>
              <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.email || u.id}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: u.role === 'admin' ? 'var(--gold)' : u.role === 'staff' ? 'var(--blue)' : 'var(--text-muted)' }}>{(u.role || 'user').toUpperCase()}</div>
              <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.createdAt ? fmtTimeAgo(u.createdAt) : ''}</div>
            </div>
          </div>
        )) : !loading && users.length > 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem', padding: 20, fontWeight: 600 }}>No users match "{search}"</p>}
        {hasMore && (
          <button className="asm" onClick={() => loadUsers(true)} disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <Loader2 size={13} className="asp" /> : <ChevronDown size={13} />} Load more
          </button>
        )}
      </div>
    </div>
  );
}