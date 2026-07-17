// ═══════════════════════════════════════════════════════════════
// FILE: src/pages/Leaderboard.jsx
// v20.2 — Bulletproof historical fetching & reactive context
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useMemo, useCallback, useEffect, useDeferredValue, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Trophy, TrendingUp, Target, BarChart3,
  X, Crown, Flame, AlertCircle, ShieldAlert, Users,
  Calendar, Medal, Award, Database, Clock, ArrowLeft, 
  ChevronDown, RotateCcw, ChevronRight
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { PERIOD, PERIOD_LABEL } from '../utils/constants';
import { todayStr } from '../utils/dates';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════ */
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SMOOTH = 'cubic-bezier(0.22, 1, 0.36, 1)';

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#78716c',
];

const PODIUM_CFG = [
  { h: 130, border: 'var(--gold)', bg: 'linear-gradient(180deg,rgba(245,197,66,.12) 0%,rgba(245,197,66,.02) 100%)', text: 'var(--gold)', avatar: 72, font: '1.25rem', shadow: '0 0 24px rgba(245,197,66,.15)', order: 2 },
  { h: 95, border: '#94a3b8', bg: 'linear-gradient(180deg,rgba(148,163,184,.07) 0%,rgba(148,163,184,.01) 100%)', text: '#94a3b8', avatar: 58, font: '1rem', shadow: '0 0 16px rgba(148,163,184,.08)', order: 1 },
  { h: 75, border: '#b45309', bg: 'linear-gradient(180deg,rgba(180,83,9,.07) 0%,rgba(180,83,9,.01) 100%)', text: '#d97706', avatar: 50, font: '.85rem', shadow: '0 0 12px rgba(180,83,9,.08)', order: 3 },
];

const TABS = [
  { key: PERIOD.DAILY, label: 'Today', Icon: Calendar },
  { key: PERIOD.WEEKLY, label: 'Week', Icon: TrendingUp },
  { key: PERIOD.MONTHLY, label: 'Month', Icon: BarChart3 },
  { key: PERIOD.GOAT, label: 'G.O.A.T', Icon: Crown, isGoat: true },
];

/* ═══════════════════════════════════════
   STYLES
   ═══════════════════════════════════════ */
const injectCSS = () => {
  if (document.getElementById('lb-v20-css')) return;
  const s = document.createElement('style');
  s.id = 'lb-v20-css';
  s.textContent = `
@keyframes lb-fade-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes lb-slide-row{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
@keyframes lb-pop{0%{transform:scale(.88);opacity:0}60%{transform:scale(1.03)}100%{transform:scale(1);opacity:1}}
@keyframes lb-crown{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-4px) rotate(5deg)}}
@keyframes lb-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes lb-podium{from{transform:scaleY(0);transform-origin:bottom}to{transform:scaleY(1);transform-origin:bottom}}
@keyframes lb-shim{0%{background-position:-300% 0}100%{background-position:300% 0}}
@keyframes lb-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.6)}}
@keyframes lb-shine{0%{left:-100%}100%{left:200%}}

.lb-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:90px}
.lb-wrap{max-width:860px;margin:0 auto;padding:0 16px}

.lb-hdr{position:sticky;top:0;z-index:100;padding:10px 0;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb,var(--bg-deep,#0a0f1a) 88%,transparent);border-bottom:1px solid var(--border)}
.lb-hdr-inner{display:flex;align-items:center;justify-content:space-between}
.lb-hdr-title{display:flex;align-items:center;gap:6px;font-size:.86rem;font-weight:800;color:var(--gold,#f5c542)}
.lb-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.72rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.lb-hdr-btn:hover{color:var(--text-primary);border-color:var(--border-hover)}
.lb-hdr-btn:active{transform:scale(.97)}
.lb-live{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:lb-pulse 1.5s ease-in-out infinite;box-shadow:0 0 8px rgba(0,230,118,.5)}

.lb-title{margin-bottom:20px;text-align:center;animation:lb-fade-up .4s ${SMOOTH} both}
.lb-title-icon{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:13px;background:rgba(245,197,66,.06);border:1px solid rgba(245,197,66,.1);margin-bottom:10px}
.lb-title h1{margin:0;font-size:1.5rem;font-weight:900;color:var(--text-primary);letter-spacing:-.02em}
.lb-title p{font-size:.8rem;color:var(--text-muted);margin:4px 0 0;font-weight:600}

.lb-tabs{position:relative;display:flex;gap:2px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:3px;margin-bottom:24px;overflow-x:auto;scrollbar-width:none}
.lb-tabs::-webkit-scrollbar{display:none}
.lb-tab{flex:1;position:relative;display:flex;align-items:center;justify-content:center;gap:5px;padding:10px 6px;border:none;border-radius:10px;background:transparent;color:var(--text-muted);font-size:.74rem;font-weight:700;cursor:pointer;transition:color .2s,background .2s;white-space:nowrap;font-family:inherit;-webkit-tap-highlight-color:transparent;z-index:1}
.lb-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.02)}
.lb-tab.on{color:var(--gold)}
.lb-tab.goat.on{color:#000}
.lb-tab-ind{position:absolute;bottom:4px;height:2px;background:var(--gold);border-radius:2px;transition:left .3s ${SMOOTH},width .3s ${SMOOTH};box-shadow:0 0 8px rgba(245,197,66,.3);pointer-events:none;z-index:2}

.lb-my{background:linear-gradient(135deg,rgba(168,85,247,.04),rgba(0,230,118,.02));border:1.5px solid rgba(168,85,247,.1);border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:12px;margin-bottom:20px;position:relative;overflow:hidden;animation:lb-pop .4s ${SPRING} both}
.lb-my.top{border-color:rgba(245,197,66,.18);background:linear-gradient(135deg,rgba(245,197,66,.05),rgba(168,85,247,.02))}
.lb-my::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(168,85,247,.04),transparent);animation:lb-shine 4s ease-in-out infinite}
.lb-my-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;z-index:1}
.lb-my-pts{font-size:1.4rem;font-weight:900;color:#a855f7;font-family:var(--font-display);line-height:1}

.lb-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:32px}
.lb-stat{background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:12px;display:flex;align-items:center;gap:10px;animation:lb-pop .35s ${SPRING} both}
.lb-stat-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.lb-stat-val{font-size:1.1rem;font-weight:900;font-family:var(--font-display);line-height:1;color:var(--text-primary)}
.lb-stat-lbl{font-size:.56rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:2px}

.lb-podium{display:flex;align-items:flex-end;justify-content:center;gap:10px;margin-bottom:40px;padding:0 12px}
.lb-pod-u{display:flex;flex-direction:column;align-items:center;flex:1;max-width:140px}
.lb-pod-avatar{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-family:var(--font-display)}
.lb-pod-name{margin-top:6px;font-size:.76rem;font-weight:700;color:var(--text-primary);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px}
.lb-pod-sub{font-size:.62rem;color:var(--text-muted);font-weight:600}
.lb-pod-bar{width:100%;border-radius:12px 12px 0 0;border:1px solid rgba(255,255,255,.03);border-bottom:none;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:10px;overflow:hidden;animation:lb-podium .5s ${SMOOTH} both}
.lb-pod-num{font-size:1.6rem;font-weight:900;font-family:var(--font-display);line-height:1}

.lb-top3{display:flex;justify-content:center;gap:16px;margin-bottom:28px}
.lb-top3-item{display:flex;flex-direction:column;align-items:center;gap:5px;animation:lb-pop .35s ${SPRING} both}
.lb-top3-avatar{width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:900}

.lb-search-wrap{max-width:400px;margin:0 auto 20px;position:relative}
.lb-search{width:100%;padding:11px 38px 11px 42px;border-radius:11px;background:var(--bg-card);border:1.5px solid var(--border);color:var(--text-primary);font-size:.82rem;font-weight:600;outline:none;transition:all .15s;min-height:46px;-webkit-appearance:none;font-family:inherit;box-sizing:border-box}
.lb-search:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,230,118,.08)}
.lb-search::placeholder{color:var(--text-muted);opacity:.35}
.lb-search-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.05);border:none;border-radius:7px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);cursor:pointer;transition:all .12s;padding:0}
.lb-search-clear:hover{color:var(--text-primary);background:rgba(255,255,255,.1)}
.lb-search-count{margin-bottom:12px;font-size:.78rem;color:var(--text-muted);text-align:center;font-weight:600}

.lb-table-wrap{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.lb-table-scroll{overflow-x:auto;scrollbar-width:none}
.lb-table-scroll::-webkit-scrollbar{display:none}
.lb-table{min-width:520px;width:100%;border-collapse:collapse}
.lb-th{padding:12px 14px;font-size:.64rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;text-align:left;background:rgba(255,255,255,.015);border-bottom:1px solid var(--border)}
.lb-th.r{text-align:right}
.lb-row{transition:background .15s;border-bottom:1px solid rgba(255,255,255,.012);animation:lb-slide-row .3s ${SMOOTH} both}
.lb-row:hover{background:rgba(255,255,255,.02)}
.lb-row.me{background:rgba(0,230,118,.035)!important}
.lb-row.me:hover{background:rgba(0,230,118,.055)!important}
.lb-td{padding:12px 14px;vertical-align:middle;font-size:.82rem;font-weight:600}
.lb-td.r{text-align:right}

.lb-acc{display:flex;align-items:center;gap:5px;min-width:90px}
.lb-acc-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.04);overflow:hidden;flex:1}
.lb-acc-fill{height:100%;border-radius:2px;transition:width .4s ${SMOOTH};transform-origin:left;animation:lb-bar .5s ${SMOOTH} both}
.lb-acc-val{font-size:.68rem;font-weight:700;min-width:28px;text-align:right;font-family:var(--font-display)}

.lb-more{width:100%;padding:11px;border-radius:11px;background:var(--bg-card);border:1.5px dashed var(--border);color:var(--text-muted);font-size:.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;font-family:inherit;-webkit-tap-highlight-color:transparent;margin-top:12px}
.lb-more:hover{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.02)}
.lb-more:active{transform:scale(.98)}

.lb-stale{display:flex;flex-direction:column;align-items:center;gap:12px;padding:36px 24px;background:var(--bg-card);border:2px dashed rgba(245,197,66,.1);border-radius:14px;text-align:center;margin-bottom:20px;animation:lb-fade-up .4s ${SMOOTH} both}
.lb-stale-icon{width:48px;height:48px;border-radius:13px;background:rgba(245,197,66,.05);border:1px solid rgba(245,197,66,.1);display:flex;align-items:center;justify-content:center;color:var(--gold)}
.lb-error{display:flex;flex-direction:column;align-items:center;gap:12px;padding:36px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;text-align:center;margin-bottom:20px;animation:lb-fade-up .4s ${SMOOTH} both}
.lb-error-icon{width:48px;height:48px;border-radius:13px;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.1);display:flex;align-items:center;justify-content:center;color:#ef4444}
.lb-skel{background:linear-gradient(90deg,var(--bg-surface) 25%,rgba(255,255,255,.03) 50%,var(--bg-surface) 75%);background-size:300% 100%;animation:lb-shim 1.2s ease-in-out infinite;border-radius:10px}
.lb-empty{padding:36px 20px;text-align:center;color:var(--text-muted);font-size:.84rem;font-weight:600}
.lb-cta{display:inline-flex;align-items:center;gap:7px;padding:11px 22px;border-radius:11px;background:var(--accent);color:var(--bg-deep);font-weight:900;font-size:.84rem;border:none;box-shadow:0 4px 14px rgba(0,230,118,.18);cursor:pointer;transition:all .15s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.lb-cta:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,230,118,.22)}
.lb-cta:active{transform:scale(.97)}
.lb-refresh{display:inline-flex;align-items:center;gap:5px;padding:9px 16px;border-radius:9px;background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-muted);font-weight:700;font-size:.8rem;cursor:pointer;transition:all .15s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.lb-refresh:hover{border-color:var(--border-hover);color:var(--text-primary)}

@media(max-width:768px){
  .lb-table{min-width:480px}
  .lb-podium{gap:8px;padding:0 8px}
  .lb-pod-u{max-width:110px}
  .lb-tab{padding:9px 5px;font-size:.7rem;gap:4px}
  .lb-tab .lbl{display:none}
  .lb-my{padding:14px 16px}
}
@media(max-width:420px){
  .lb-tab{padding:8px 4px;font-size:.68rem;gap:3px}
  .lb-search{padding:9px 34px 9px 36px;font-size:.8rem;min-height:42px}
  .lb-pod-u{max-width:90px}
  .lb-stat{padding:10px;gap:8px}
  .lb-stat-val{font-size:1rem}
  .lb-stat-icon{width:34px;height:34px}
  .lb-my{padding:12px 14px;gap:10px}
  .lb-my-pts{font-size:1.25rem}
  .lb-my-icon{width:40px;height:40px}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════ */
function AccBar({ value, delay }) {
  const fill = value >= 70 ? 'var(--accent)' : value >= 45 ? 'var(--gold)' : '#ef4444';
  return (
    <div className="lb-acc">
      <div className="lb-acc-bar">
        <div className="lb-acc-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: `linear-gradient(90deg,${fill},${fill}88)`, animationDelay: `${delay || 0}ms` }} />
      </div>
      <span className="lb-acc-val" style={{ color: fill }}>{value}%</span>
    </div>
  );
}

function StatCard({ icon, label, value, color, bg, delay }) {
  return (
    <div className="lb-stat" style={{ animationDelay: `${delay || 0}ms` }}>
      <div className="lb-stat-icon" style={{ background: bg, color }}>{icon}</div>
      <div>
        <div className="lb-stat-val" style={{ animationDelay: `${(delay || 0) + 60}ms` }}>{value}</div>
        <div className="lb-stat-lbl">{label}</div>
      </div>
    </div>
  );
}

function PodiumUser({ user, position, delay }) {
  const c = PODIUM_CFG[position];
  if (!c) return null;
  return (
    <div className="lb-pod-u" style={{ order: c.order, animation: `lb-pop .4s ${SPRING} ${(delay || 0) + 150}ms both` }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6, position: 'relative' }}>
        {position === 0 && (
          <div style={{ color: 'var(--gold)', marginBottom: -2, filter: 'drop-shadow(0 0 5px rgba(245,197,66,.3))', animation: 'lb-crown 3s ease-in-out infinite' }}>
            <Crown size={20} />
          </div>
        )}
        <div className="lb-pod-avatar" style={{ width: c.avatar, height: c.avatar, background: `linear-gradient(135deg,${c.border}25,${c.border}08)`, border: `3px solid ${c.border}`, fontSize: c.font, color: c.text, boxShadow: c.shadow }}>
          {(user.displayName || '??').slice(0, 2).toUpperCase()}
        </div>
        <div className="lb-pod-name">{user.displayName}</div>
        <div className="lb-pod-sub">{user.points} pts · {user.accuracy}%</div>
      </div>
      <div className="lb-pod-bar" style={{ height: c.h, background: c.bg, animationDelay: `${(delay || 0) + 300}ms` }}>
        <div className="lb-pod-num" style={{ color: c.text }}>#{position + 1}</div>
      </div>
    </div>
  );
}

function StaleState({ period }) {
  const label = PERIOD_LABEL[period] || period;
  const desc = {
    weekly: 'Covers Monday through Sunday. Updated after matches finish.',
    monthly: 'Covers the current calendar month. Updated periodically.',
    goat: 'All-time rankings by lifetime points.',
  }[period] || '';
  return (
    <div className="lb-stale">
      <div className="lb-stale-icon"><Database size={20} /></div>
      <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '.95rem' }}>{label} Leaderboard Not Ready</div>
      <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', maxWidth: 340, lineHeight: 1.5, fontWeight: 600 }}>{desc}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.66rem', color: 'var(--text-muted)', fontWeight: 600, opacity: .6 }}>
        <Clock size={10} /> Check back later
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="lb-error">
      <div className="lb-error-icon">{error === 'permissions' ? <ShieldAlert size={20} /> : <AlertCircle size={20} />}</div>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '.95rem' }}>{error === 'permissions' ? 'Permissions Required' : 'Failed to Load'}</div>
      <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5, fontWeight: 600 }}>{String(error)}</div>
      {onRetry && <button className="lb-refresh" onClick={onRetry}><RotateCcw size={12} /> Retry</button>}
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  const barRef = useRef(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const isGoat = active === PERIOD.GOAT;

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const btn = bar.querySelector(`[data-tab="${active}"]`);
    if (!btn) return;
    const barRect = bar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setInd({ left: btnRect.left - barRect.left + btnRect.width * 0.18, width: btnRect.width * 0.64 });
  }, [active]);

  return (
    <div className="lb-tabs" ref={barRef}>
      {tabs.map(t => (
        <button key={t.key} data-tab={t.key} className={`lb-tab${active === t.key ? ' on' : ''}${t.isGoat ? ' goat' : ''}`} onClick={() => startTransition(() => onChange(t.key))}>
          <t.Icon size={12} />
          <span className="lbl">{t.label}</span>
        </button>
      ))}
      <div className="lb-tab-ind" style={{ left: ind.left, width: ind.width, background: isGoat ? 'rgba(0,0,0,.15)' : 'var(--gold)', boxShadow: isGoat ? 'none' : '0 0 8px rgba(245,197,66,.3)' }} />
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function Leaderboard() {
  injectCSS();
  const { user: currentUser } = useAuth();
  const uid = currentUser?.uid;
  const nav = useNavigate();
  const searchRef = useRef(null);

  // ★ Get reactive data from context
  const appData = useAppData();
  
  const [tab, setTab] = useState(PERIOD.DAILY);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showCount, setShowCount] = useState(15);

  const deferredSearch = useDeferredValue(search);

  const isDaily = tab === PERIOD.DAILY;

  // ★ Trigger fetch for historical tabs if not already loaded
  useEffect(() => {
    if (!isDaily && !appData.historicalLeaderboards?.[tab] && appData.loadHistoricalLeaderboard) {
      appData.loadHistoricalLeaderboard(tab);
    }
  }, [tab, isDaily, appData]);

  // ★ Safe extraction of historical data
  const historicalData = !isDaily ? (appData.historicalLeaderboards?.[tab] || null) : null;
  const isLoadingHistorical = !isDaily && !historicalData;

  const entries = useMemo(() => {
    if (isDaily) return appData.dailyEntries || [];
    return historicalData?.entries || [];
  }, [isDaily, appData.dailyEntries, historicalData]);

  const stats = useMemo(() => {
    if (isDaily) return appData.dailyStats || { avg: '0.0', preds: 0, exact: 0, players: 0 };
    return historicalData?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 };
  }, [isDaily, appData.dailyStats, historicalData]);

  const loading = isDaily ? appData.loading : isLoadingHistorical;
  const error = isDaily ? null : (historicalData?.error || null);
  const isStale = !isDaily && historicalData ? (historicalData.stale ?? true) : false;

  const myEntry = useMemo(() => {
    if (!uid) return null;
    return entries.find(u => u.uid === uid) || null;
  }, [entries, uid]);

  // Search
  const filtered = useMemo(() => {
    if (!deferredSearch.trim()) return entries;
    const q = deferredSearch.toLowerCase();
    return entries.filter(u => (u.displayName || '').toLowerCase().includes(q));
  }, [entries, deferredSearch]);

  const filteredTop3 = useMemo(() => filtered.slice(0, 3), [filtered]);
  const filteredRest = useMemo(() => filtered.slice(3), [filtered]);
  const visibleRest = useMemo(() => filteredRest.slice(0, showCount - 3), [filteredRest, showCount]);
  const hasMore = filteredRest.length > showCount - 3;

  const handleClear = useCallback(() => { setSearch(''); searchRef.current?.focus(); }, []);
  const handleTabChange = useCallback((t) => { 
    startTransition(() => { setTab(t); setShowCount(15); setSearch(''); }); 
  }, []);

  const tabDesc = useMemo(() => {
    const descriptions = {
      daily: "Today's top predictors",
      weekly: 'Monday – Sunday rankings',
      monthly: 'This month\'s top predictors',
      goat: 'Greatest of All Time',
    };
    return descriptions[tab] || '';
  }, [tab]);

  const handleRefresh = () => {
    if (appData.refresh) {
      appData.refresh({ invalidateCache: true, includeUserData: true });
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="lb-page">
      <SEO
        title="Football Prediction Leaderboard | ZOKASCORE"
        description="Compete with football fans, climb the leaderboard, and view the best prediction rankings on ZOKASCORE."
        keywords="football leaderboard, prediction rankings, ZOKASCORE"
        path="/leaderboard"
        robots="index,follow"
      />

      {/* Header */}
      <div className="lb-hdr">
        <div className="lb-wrap">
          <div className="lb-hdr-inner">
            <button className="lb-hdr-btn" onClick={() => nav('/predictions')}><ArrowLeft size={12} /> Predictions</button>
            <div className="lb-hdr-title"><Trophy size={14} /> Leaderboard{!loading && entries.length > 0 && <span className="lb-live" />}</div>
          </div>
        </div>
      </div>

      <div className="lb-wrap">
        {/* Title */}
        <div className="lb-title">
          <div className="lb-title-icon"><Trophy size={24} style={{ color: 'var(--gold)' }} /></div>
          <h1>Leaderboard</h1>
          <p>{tabDesc}</p>
        </div>

        {/* My Rank */}
        {myEntry && !loading && (
          <div className={`lb-my${myEntry.rank <= 3 ? ' top' : ''}`}>
            <div className="lb-my-icon" style={{ background: myEntry.rank <= 3 ? 'rgba(245,197,66,.08)' : 'rgba(168,85,247,.06)', border: myEntry.rank <= 3 ? '1.5px solid rgba(245,197,66,.18)' : '1.5px solid rgba(168,85,247,.12)', color: myEntry.rank <= 3 ? 'var(--gold)' : '#a855f7' }}>
              {myEntry.rank <= 3 ? <Crown size={20} /> : <span style={{ fontSize: '1rem', fontWeight: 900, fontFamily: 'var(--font-display)' }}>#{myEntry.rank}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Your {PERIOD_LABEL[tab] || tab} Rank</div>
              <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 1 }}>{myEntry.points} pts · {myEntry.exact || 0} exact · {myEntry.accuracy || 0}%</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}>
              <div className="lb-my-pts">{myEntry.points}</div>
              <div style={{ fontSize: '.54rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.04em' }}>Points</div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <ErrorState error={error} onRetry={() => setTab(tab)} />}

        {!error && (
          <>
            <TabBar tabs={TABS} active={tab} onChange={handleTabChange} />

            {isStale && !loading ? (
              <StaleState period={tab} />
            ) : (
              <>
                {/* Stats Grid */}
                <div className="lb-stats">
                  <StatCard icon={<Flame size={16} />} label="Top Score" value={entries[0] ? `${entries[0].points} pts` : '–'} color="var(--gold)" bg="rgba(245,197,66,.05)" delay={0} />
                  <StatCard icon={<Users size={16} />} label="Players" value={stats.players || 0} color="#60a5fa" bg="rgba(59,130,246,.05)" delay={50} />
                  <StatCard icon={<Target size={16} />} label="Avg Accuracy" value={`${stats.avg || '0.0'}%`} color="var(--accent)" bg="rgba(0,230,118,.04)" delay={100} />
                  <StatCard icon={<Award size={16} />} label="Exact Scores" value={stats.exact || 0} color="#f97316" bg="rgba(249,115,22,.05)" delay={150} />
                </div>

                {/* Daily Podium */}
                {isDaily && (
                  loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 40, padding: '32px 0' }}>
                      {[0, 1, 2].map(i => <div key={i} className="lb-skel" style={{ width: 120, height: 180, borderRadius: 12, animationDelay: `${i * 70}ms` }} />)}
                    </div>
                  ) : filteredTop3.length >= 3 ? (
                    <div className="lb-podium">{filteredTop3.map((u, i) => <PodiumUser key={u.uid} user={u} position={i} delay={i * 80} />)}</div>
                  ) : (
                    <div className="lb-empty" style={{ marginBottom: 40 }}>{entries.length === 0 ? 'No predictions yet — be the first!' : 'Need at least 3 players for podium'}</div>
                  )
                )}

                {/* Non-Daily Top 3 */}
                {!isDaily && (
                  loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
                      {[0, 1, 2].map(i => <div key={i} className="lb-skel" style={{ width: 50, height: 50, borderRadius: '50%', animationDelay: `${i * 70}ms` }} />)}
                    </div>
                  ) : filteredTop3.length >= 1 ? (
                    <div className="lb-top3">
                      {filteredTop3.slice(0, 3).map((u, i) => {
                        const colors = ['var(--gold)', '#94a3b8', '#d97706'];
                        return (
                          <div key={u.uid} className="lb-top3-item" style={{ animationDelay: `${i * 70}ms` }}>
                            <div style={{ position: 'relative' }}>
                              {i === 0 && <Crown size={16} style={{ color: 'var(--gold)', position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)' }} />}
                              <div className="lb-top3-avatar" style={{ background: `linear-gradient(135deg,${colors[i]}25,${colors[i]}08)`, border: `2px solid ${colors[i]}`, color: colors[i], boxShadow: `0 0 16px ${colors[i]}12` }}>
                                {(u.displayName || '??').slice(0, 2).toUpperCase()}
                              </div>
                            </div>
                            <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName}</span>
                            <span style={{ fontSize: '.68rem', fontWeight: 800, color: colors[i], fontFamily: 'var(--font-display)' }}>{u.points} pts</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null
                )}

                {/* Search */}
                <div className="lb-search-wrap">
                  <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: searchFocused ? 'var(--accent)' : 'var(--text-muted)', transition: 'color .15s', pointerEvents: 'none', zIndex: 1 }} />
                  <input ref={searchRef} type="text" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} className="lb-search" />
                  {search && <button className="lb-search-clear" onClick={handleClear}><X size={11} /></button>}
                </div>
                {search.trim() && <div className="lb-search-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</div>}

                {/* Table */}
                <div className="lb-table-wrap">
                  <div className="lb-table-scroll">
                    <table className="lb-table">
                      <thead>
                        <tr>
                          <th className="lb-th" style={{ width: 48 }}>Rank</th>
                          <th className="lb-th">Player</th>
                          <th className="lb-th" style={{ minWidth: 95 }}>Accuracy</th>
                          <th className="lb-th r" style={{ width: 60 }}>Points</th>
                          <th className="lb-th r" style={{ width: 56 }}>Preds</th>
                          <th className="lb-th r" style={{ width: 48 }}>Exact</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          Array.from({ length: 6 }).map((_, i) => (
                            <tr key={i}><td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                                <div className="lb-skel" style={{ width: 24, height: 10, borderRadius: 3, animationDelay: `${i * 40}ms` }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                  <div className="lb-skel" style={{ width: 30, height: 30, borderRadius: 7, animationDelay: `${i * 40 + 25}ms` }} />
                                  <div className="lb-skel" style={{ width: 80, height: 10, borderRadius: 3, animationDelay: `${i * 40 + 50}ms` }} />
                                </div>
                                <div className="lb-skel" style={{ width: 60, height: 8, borderRadius: 3, animationDelay: `${i * 40 + 75}ms` }} />
                              </div>
                            </td></tr>
                          ))
                        ) : visibleRest.length === 0 && !search.trim() && filteredTop3.length === 0 ? (
                          <tr><td colSpan={6} className="lb-empty" style={{ borderRadius: 0 }}>{entries.length === 0 ? 'No predictions yet — be the first!' : 'Top players shown above.'}</td></tr>
                        ) : visibleRest.length === 0 && search.trim() ? (
                          <tr><td colSpan={6} className="lb-empty" style={{ borderRadius: 0 }}>No players found matching "{deferredSearch}"</td></tr>
                        ) : (
                          visibleRest.map((user, i) => {
                            const rank = user.rank || (entries.findIndex(e => e.uid === user.uid) + 1);
                            const isMe = uid === user.uid;
                            const delay = Math.min(i * 25, 250);
                            const avColor = AVATAR_COLORS[(rank - 1) % AVATAR_COLORS.length];
                            const exactColor = (user.exact || 0) >= 15 ? 'var(--accent)' : (user.exact || 0) >= 10 ? 'var(--gold)' : 'var(--text-primary)';

                            return (
                              <tr key={user.uid} className={`lb-row${isMe ? ' me' : ''}`} style={{ animationDelay: `${delay}ms` }}>
                                <td className="lb-td" style={{ fontWeight: 800, fontFamily: 'var(--font-display)', color: rank <= 10 ? 'var(--accent)' : 'var(--text-primary)' }}>#{rank}</td>
                                <td className="lb-td">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: avColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.68rem', fontWeight: 800, color: '#fff', flexShrink: 0, boxShadow: isMe ? '0 0 0 2px var(--accent)' : 'none' }}>
                                      {(user.displayName || '??').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {user.displayName || 'Anonymous'}
                                        {isMe && <span style={{ marginLeft: 4, fontSize: '.56rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(0,230,118,.07)', padding: '2px 6px', borderRadius: 4 }}>YOU</span>}
                                      </div>
                                      <div style={{ fontSize: '.56rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>{user.predictions || 0} predictions</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="lb-td"><AccBar value={user.accuracy || 0} delay={delay + 60} /></td>
                                <td className="lb-td r" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: '#a855f7', fontSize: '.88rem' }}>{user.points || 0}</td>
                                <td className="lb-td r" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '.78rem' }}>{user.predictions || 0}</td>
                                <td className="lb-td r" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: exactColor, fontSize: '.78rem' }}>{user.exact || 0}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Show More */}
                {hasMore && !loading && (
                  <button className="lb-more" onClick={() => setShowCount(p => Math.min(p + 15, 200))}>
                    <ChevronDown size={12} /> Show more ({filteredRest.length - visibleRest.length} remaining)
                  </button>
                )}

                {/* Empty Refresh */}
                {entries.length === 0 && !loading && !isStale && !error && (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <button className="lb-refresh" onClick={handleRefresh}><RotateCcw size={12} /> Refresh</button>
                  </div>
                )}

                {/* CTA */}
                {entries.length > 0 && (
                  <div style={{ textAlign: 'center', marginTop: 20, padding: '16px 0' }}>
                    <button className="lb-cta" onClick={() => nav('/predictions')}><Target size={14} /> Make Predictions <ChevronRight size={13} /></button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}