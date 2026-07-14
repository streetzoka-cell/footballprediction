// ═════════════════════════════════════════════════════════════════
// FILE: src/pages/Leaderboard.jsx
// v18.0 — Aligned with Core Architecture (FPL Style Competition)
// ═════════════════════════════════════════════════════════════════

import { useState, useRef, useMemo, useCallback, useEffect, useTransition, useDeferredValue, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Trophy, TrendingUp, Target, BarChart3,
  X, Crown, Flame, AlertCircle, ShieldAlert, Users,
  Calendar, Medal, Star, Loader, ChevronDown, Award,
  Database, Clock, ArrowLeft, Eye, Zap, Percent,
  ChevronRight, Activity, RotateCcw, CheckCircle,
  CircleDot, Home, Hash, ChevronLeft, Minus
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useDailyLeaderboard, useHistoricalLeaderboard } from '../hooks/useMatchData';
import { PERIOD } from '../utils/constants';
import { todayStr } from '../utils/dates';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════ */
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SMOOTH = 'cubic-bezier(0.22, 1, 0.36, 1)';

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#78716c',
];

const PODIUM_CFG = [
  { h: 140, border: 'var(--gold)', bg: 'linear-gradient(180deg,rgba(245,197,66,.14) 0%,rgba(245,197,66,.02) 100%)', text: 'var(--gold)', avatar: 78, font: '1.35rem', shadow: '0 0 28px rgba(245,197,66,.18)', order: 2 },
  { h: 100, border: '#94a3b8', bg: 'linear-gradient(180deg,rgba(148,163,184,.08) 0%,rgba(148,163,184,.01) 100%)', text: '#94a3b8', avatar: 62, font: '1.05rem', shadow: '0 0 18px rgba(148,163,184,.08)', order: 1 },
  { h: 80, border: '#b45309', bg: 'linear-gradient(180deg,rgba(180,83,9,.08) 0%,rgba(180,83,9,.01) 100%)', text: '#d97706', avatar: 54, font: '.9rem', shadow: '0 0 14px rgba(180,83,9,.08)', order: 3 },
];

const TABS = [
  { key: PERIOD.DAILY, label: 'Daily', Icon: Calendar },
  { key: PERIOD.WEEKLY, label: 'Weekly', Icon: TrendingUp },
  { key: PERIOD.MONTHLY, label: 'Monthly', Icon: BarChart3 },
  { key: PERIOD.GOAT, label: 'G.O.A.T', Icon: Crown, isGoat: true },
];

/* ═══════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════ */
const injectCSS = () => {
  if (document.getElementById('lb-v18')) return;
  const s = document.createElement('style');
  s.id = 'lb-v18';
  s.textContent = `
@keyframes lb18-fade-up{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes lb18-slide-row{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
@keyframes lb18-pop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}}
@keyframes lb18-crown{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-5px) rotate(5deg)}}
@keyframes lb18-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes lb18-glow{0%,100%{box-shadow:0 0 10px rgba(0,230,118,.12)}50%{box-shadow:0 0 22px rgba(0,230,118,.25)}}
@keyframes lb18-shim{0%{background-position:-300% 0}100%{background-position:300% 0}}
@keyframes lb18-podium{from{transform:scaleY(0);transform-origin:bottom}to{transform:scaleY(1);transform-origin:bottom}}
@keyframes lb18-fade-in{from{opacity:0}to{opacity:1}}
@keyframes lb18-gold{0%,100%{text-shadow:0 0 6px rgba(245,197,66,.25)}50%{text-shadow:0 0 16px rgba(245,197,66,.5)}}
@keyframes lb18-pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.6)}}
@keyframes lb18-shine{0%{left:-100%}100%{left:200%}}
@keyframes lb18-tab-ind{from{transform:scaleX(0);opacity:0}to{transform:scaleX(1);opacity:1}}
@keyframes lb18-count{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes lb18-overlay{from{opacity:0}to{opacity:1}}

.lb18-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:90px;position:relative;overflow-x:hidden}
.lb18-page::before{content:'';position:fixed;top:-40%;left:-20%;width:140%;height:80%;background:radial-gradient(ellipse at 50% 0%,rgba(245,197,66,.012) 0%,transparent 60%);pointer-events:none;z-index:0}
.lb18-wrap{max-width:900px;margin:0 auto;padding:0 18px;position:relative;z-index:1}

.lb18-hdr{position:sticky;top:0;z-index:100;padding:10px 0;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb, var(--bg-deep,#0a0f1a) 88%, transparent);border-bottom:1px solid var(--border)}
.lb18-hdr-inner{display:flex;align-items:center;justify-content:space-between}
.lb18-hdr-title{display:flex;align-items:center;gap:6px;font-size:.88rem;font-weight:800;color:var(--gold,#f5c542)}
.lb18-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.74rem;font-weight:700;cursor:pointer;transition:all .15s ${SMOOTH};font-family:inherit;-webkit-tap-highlight-color:transparent}
.lb18-hdr-btn:hover{color:var(--text-primary);border-color:var(--border-hover);background:rgba(255,255,255,.03)}
.lb18-hdr-btn:active{transform:scale(.97)}
.lb18-live-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:lb18-pulse-dot 1.5s ease-in-out infinite;box-shadow:0 0 8px rgba(0,230,118,.5)}

.lb18-title{margin-bottom:24px;text-align:center;animation:lb18-fade-up .4s ${SMOOTH} both}
.lb18-title-icon{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:14px;background:rgba(245,197,66,.07);border:1px solid rgba(245,197,66,.12);margin-bottom:12px}
.lb18-title h1{margin:0;font-size:1.7rem;font-weight:900;color:var(--text-primary);letter-spacing:-.02em}
.lb18-title p{font-size:.84rem;color:var(--text-muted);margin:4px 0 0;font-weight:600}

.lb18-tabs{position:relative;display:flex;gap:2px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:3px;margin-bottom:28px;overflow-x:auto;scrollbar-width:none}
.lb18-tabs::-webkit-scrollbar{display:none}
.lb18-tab{flex:1;position:relative;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px 6px;border:none;border-radius:11px;background:transparent;color:var(--text-muted);font-size:.76rem;font-weight:700;cursor:pointer;transition:color .2s,background .2s;white-space:nowrap;font-family:inherit;-webkit-tap-highlight-color:transparent;z-index:1}
.lb18-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.02)}
.lb18-tab.on{color:var(--gold)}
.lb18-tab.goat.on{color:#000}
.lb18-tab-ind{position:absolute;bottom:4px;height:2.5px;background:var(--gold);border-radius:2px;transition:left .3s ${SMOOTH},width .3s ${SMOOTH},background .2s;box-shadow:0 0 10px rgba(245,197,66,.35);pointer-events:none;z-index:2}

.lb18-my-rank{background:linear-gradient(135deg,rgba(168,85,247,.04),rgba(0,230,118,.02));border:1.5px solid rgba(168,85,247,.1);border-radius:16px;padding:16px 20px;display:flex;align-items:center;gap:14px;margin-bottom:22px;position:relative;overflow:hidden;animation:lb18-pop .4s ${SPRING} both}
.lb18-my-rank.top{border-color:rgba(245,197,66,.18);background:linear-gradient(135deg,rgba(245,197,66,.05),rgba(168,85,247,.02))}
.lb18-my-rank::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(168,85,247,.04),transparent);animation:lb18-shine 4s ease-in-out infinite}
.lb18-my-rank.top::before{background:linear-gradient(90deg,transparent,rgba(245,197,66,.04),transparent)}
.lb18-my-rank-icon{width:48px;height:48px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;z-index:1}
.lb18-my-rank-pts{font-size:1.5rem;font-weight:900;color:#a855f7;font-family:var(--font-display);line-height:1}

.lb18-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:36px}
.lb18-stat{background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;align-items:center;gap:11px;transition:transform .15s ${SMOOTH},box-shadow .15s;animation:lb18-pop .35s ${SPRING} both}
.lb18-stat:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.2)}
.lb18-stat-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.lb18-stat-val{font-size:1.2rem;font-weight:900;font-family:var(--font-display);line-height:1;color:var(--text-primary);animation:lb18-count .4s ${SMOOTH} both}
.lb18-stat-lbl{font-size:.58rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-top:3px}

.lb18-podium{display:flex;align-items:flex-end;justify-content:center;gap:10px;margin-bottom:48px;padding:0 16px}
.lb18-podium-u{display:flex;flex-direction:column;align-items:center;flex:1;max-width:155px}
.lb18-podium-avatar{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-family:var(--font-display)}
.lb18-podium-name{margin-top:7px;font-size:.8rem;font-weight:700;color:var(--text-primary);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px}
.lb18-podium-sub{font-size:.66rem;color:var(--text-muted);font-weight:600}
.lb18-podium-bar{width:100%;border-radius:12px 12px 0 0;border:1px solid rgba(255,255,255,.03);border-bottom:none;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:10px;position:relative;overflow:hidden;animation:lb18-podium .55s ${SMOOTH} both}
.lb18-podium-num{font-size:1.7rem;font-weight:900;font-family:var(--font-display);line-height:1}

.lb18-top3{display:flex;justify-content:center;gap:14px;margin-bottom:30px}
.lb18-top3-badge{display:flex;flex-direction:column;align-items:center;gap:6px;animation:lb18-pop .35s ${SPRING} both}
.lb18-top3-avatar{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:900}

.lb18-search-wrap{max-width:420px;margin:0 auto 22px;position:relative}
.lb18-search{width:100%;padding:12px 40px 12px 44px;border-radius:12px;background:var(--bg-card);border:1.5px solid var(--border);color:var(--text-primary);font-size:.84rem;font-weight:600;outline:none;transition:all .15s;min-height:50px;-webkit-appearance:none;appearance:none;font-family:inherit;box-sizing:border-box}
.lb18-search:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,230,118,.08)}
.lb18-search::placeholder{color:var(--text-muted);opacity:.35}
.lb18-search-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.05);border:none;border-radius:7px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);cursor:pointer;transition:all .12s;padding:0}
.lb18-search-clear:hover{color:var(--text-primary);background:rgba(255,255,255,.1)}

.lb18-table-wrap{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.lb18-table-scroll{overflow-x:auto;scrollbar-width:none}
.lb18-table-scroll::-webkit-scrollbar{display:none}
.lb18-table{min-width:560px;width:100%;border-collapse:collapse}
.lb18-th{padding:13px 16px;font-size:.66rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;text-align:left;background:rgba(255,255,255,.015);border-bottom:1px solid var(--border)}
.lb18-th.r{text-align:right}
.lb18-row{transition:background .15s;border-bottom:1px solid rgba(255,255,255,.015);animation:lb18-slide-row .3s ${SMOOTH} both}
.lb18-row:hover{background:rgba(255,255,255,.02)}
.lb18-row.me{background:rgba(0,230,118,.035)!important}
.lb18-row.me:hover{background:rgba(0,230,118,.055)!important}
.lb18-td{padding:13px 16px;vertical-align:middle;font-size:.84rem;font-weight:600}

.lb18-acc{display:flex;align-items:center;gap:6px;min-width:100px}
.lb18-acc-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.04);overflow:hidden;flex:1}
.lb18-acc-fill{height:100%;border-radius:3px;transition:width .4s ${SMOOTH};transform-origin:left center;animation:lb18-bar .6s ${SMOOTH} both}
.lb18-acc-val{font-size:.7rem;font-weight:700;min-width:30px;text-align:right;font-family:var(--font-display)}

.lb18-more{width:100%;padding:12px;border-radius:12px;background:var(--bg-card);border:1.5px dashed var(--border);color:var(--text-muted);font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:all .15s ${SMOOTH};font-family:inherit;-webkit-tap-highlight-color:transparent;margin-top:12px}
.lb18-more:hover{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.02)}
.lb18-more:active{transform:scale(.98)}

.lb18-stale{display:flex;flex-direction:column;align-items:center;gap:14px;padding:40px 28px;background:var(--bg-card);border:2px dashed rgba(245,197,66,.12);border-radius:16px;text-align:center;margin-bottom:24px;animation:lb18-fade-up .4s ${SMOOTH} both}
.lb18-stale-icon{width:52px;height:52px;border-radius:14px;background:rgba(245,197,66,.05);border:1px solid rgba(245,197,66,.1);display:flex;align-items:center;justify-content:center;color:var(--gold)}

.lb18-error{display:flex;flex-direction:column;align-items:center;gap:14px;padding:40px;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;text-align:center;margin-bottom:24px;animation:lb18-fade-up .4s ${SMOOTH} both}
.lb18-error-icon{width:52px;height:52px;border-radius:14px;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.1);display:flex;align-items:center;justify-content:center;color:#ef4444}

.lb18-skel{background:linear-gradient(90deg,var(--bg-surface) 25%,rgba(255,255,255,.03) 50%,var(--bg-surface) 75%);background-size:300% 100%;animation:lb18-shim 1.2s ease-in-out infinite;border-radius:10px}

.lb18-cta{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:12px;background:var(--accent);color:var(--bg-deep);font-weight:900;font-size:.85rem;border:none;box-shadow:0 4px 16px rgba(0,230,118,.18);cursor:pointer;transition:all .15s ${SMOOTH};font-family:inherit;-webkit-tap-highlight-color:transparent}
.lb18-cta:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,230,118,.22)}
.lb18-cta:active{transform:scale(.97)}

.lb18-refresh{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-muted);font-weight:700;font-size:.82rem;cursor:pointer;transition:all .15s ${SMOOTH};font-family:inherit;-webkit-tap-highlight-color:transparent}
.lb18-refresh:hover{border-color:var(--border-hover);color:var(--text-primary);background:rgba(255,255,255,.05)}
.lb18-refresh:active{transform:scale(.97)}

.lb18-search-count{margin-bottom:14px;font-size:.8rem;color:var(--text-muted);text-align:center;font-weight:600;animation:lb18-fade-in .2s ease both}

@media(max-width:768px){
  .lb18-table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .lb18-table{min-width:520px}
  .lb18-podium{gap:8px!important;padding:0 8px!important}
  .lb18-podium-u{max-width:115px!important}
  .lb18-stats{grid-template-columns:repeat(2,1fr)!important;gap:8px!important}
  .lb18-tab{padding:10px 5px;font-size:.72rem;gap:4px}
  .lb18-tab span.lb-label{display:none}
  .lb18-my-rank{padding:14px 16px}
}
@media(max-width:420px){
  .lb18-tab{padding:10px 4px;font-size:.68rem;gap:3px}
  .lb18-search{padding:10px 36px 10px 38px;font-size:.8rem;min-height:46px}
  .lb18-stats{gap:6px!important}
  .lb18-podium-u{max-width:95px!important}
  .lb18-stat{padding:12px;gap:9px}
  .lb18-stat-val{font-size:1.05rem}
  .lb18-stat-icon{width:36px;height:36px}
  .lb18-my-rank{padding:12px 14px;gap:10px}
  .lb18-my-rank-pts{font-size:1.3rem}
  .lb18-my-rank-icon{width:42px;height:42px}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════ */
function AccBar({ value, delay }) {
  const fill = value >= 70 ? 'var(--accent)' : value >= 45 ? 'var(--gold)' : '#ef4444';
  return (
    <div className="lb18-acc">
      <div className="lb18-acc-bar">
        <div
          className="lb18-acc-fill"
          style={{
            width: `${Math.min(100, Math.max(0, value))}%`,
            background: `linear-gradient(90deg,${fill},${fill}88)`,
            animationDelay: `${delay || 0}ms`,
          }}
        />
      </div>
      <span className="lb18-acc-val" style={{ color: fill }}>{value}%</span>
    </div>
  );
}

function StatCard({ icon, label, value, color, bg, delay }) {
  return (
    <div className="lb18-stat" style={{ animationDelay: `${delay || 0}ms` }}>
      <div className="lb18-stat-icon" style={{ background: bg, color }}>{icon}</div>
      <div>
        <div className="lb18-stat-val" style={{ animationDelay: `${(delay || 0) + 80}ms` }}>{value}</div>
        <div className="lb18-stat-lbl">{label}</div>
      </div>
    </div>
  );
}

function PodiumUser({ user, position, delay }) {
  const c = PODIUM_CFG[position];
  return (
    <div className="lb18-podium-u" style={{ order: c.order, animation: `lb18-pop .4s ${SPRING} ${(delay || 0) + 200}ms both` }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8, position: 'relative' }}>
        {position === 0 && (
          <div style={{ color: 'var(--gold)', marginBottom: -3, filter: 'drop-shadow(0 0 6px rgba(245,197,66,.35))', animation: 'lb18-crown 3s ease-in-out infinite' }}>
            <Crown size={22} />
          </div>
        )}
        <div
          className="lb18-podium-avatar"
          style={{
            width: c.avatar,
            height: c.avatar,
            background: `linear-gradient(135deg,${c.border}28,${c.border}08)`,
            border: `3px solid ${c.border}`,
            fontSize: c.font,
            color: c.text,
            boxShadow: c.shadow,
          }}
        >
          {(user.displayName || '??').slice(0, 2).toUpperCase()}
        </div>
        <div className="lb18-podium-name">{user.displayName}</div>
        <div className="lb18-podium-sub">{user.points} pts · {user.accuracy}%</div>
      </div>
      <div
        className="lb18-podium-bar"
        style={{ height: c.h, background: c.bg, animationDelay: `${(delay || 0) + 400}ms` }}
      >
        <div className="lb18-podium-num" style={{ color: c.text }}>#{position + 1}</div>
      </div>
    </div>
  );
}

function StaleState({ period }) {
  const label = { weekly: 'Weekly', monthly: 'Monthly', goat: 'G.O.A.T (All-Time)' }[period] || period;
  const desc = {
    weekly: 'Covers Monday through Sunday. An admin needs to rebuild it after matches finish.',
    monthly: 'Covers the current calendar month. An admin needs to rebuild it.',
    goat: 'Ranks every player by lifetime points. An admin needs to rebuild it.',
  }[period] || '';
  return (
    <div className="lb18-stale">
      <div className="lb18-stale-icon"><Database size={22} /></div>
      <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.02rem' }}>{label} Leaderboard Not Ready</div>
      <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.6, fontWeight: 600 }}>{desc}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 600, opacity: 0.6 }}>
        <Clock size={11} /> Requires admin rebuild
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="lb18-error">
      <div className="lb18-error-icon">
        {error === 'permissions' ? <ShieldAlert size={22} /> : <AlertCircle size={22} />}
      </div>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.02rem' }}>
        {error === 'permissions' ? 'Permissions Required' : 'Failed to Load'}
      </div>
      <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.5, fontWeight: 600 }}>
        {error === 'permissions' ? 'Allow read access to leaderboard collections.' : String(error)}
      </div>
      {onRetry && (
        <button className="lb18-refresh" onClick={onRetry} style={{ marginTop: 4 }}>
          <RotateCcw size={13} /> Try Again
        </button>
      )}
    </div>
  );
}

/* ─── Tab Bar with Sliding Indicator ─── */
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
    setInd({
      left: btnRect.left - barRect.left + btnRect.width * 0.18,
      width: btnRect.width * 0.64,
    });
  }, [active]);

  return (
    <div className="lb18-tabs" ref={barRef}>
      {tabs.map(t => (
        <button
          key={t.key}
          data-tab={t.key}
          className={`lb18-tab${active === t.key ? ' on' : ''}${t.isGoat ? ' goat' : ''}`}
          onClick={() => startTransition(() => onChange(t.key))}
        >
          <t.Icon size={13} />
          <span className="lb-label">{t.label}</span>
        </button>
      ))}
      <div
        className="lb18-tab-ind"
        style={{
          left: ind.left,
          width: ind.width,
          background: isGoat ? 'rgba(0,0,0,.15)' : 'var(--gold)',
          boxShadow: isGoat ? 'none' : '0 0 10px rgba(245,197,66,.35)',
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function Leaderboard() {
  injectCSS();
  const { currentUser } = useAuth();
  const nav = useNavigate();
  const searchRef = useRef(null);
  const mounted = useRef(true);

  const [tab, setTab] = useState(PERIOD.DAILY);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showCount, setShowCount] = useState(15);
  const [retryKey, setRetryKey] = useState(0);

  // ★ Hooks from the new architecture
  const dailyLB = useDailyLeaderboard(todayStr());
  const histLB = useHistoricalLeaderboard(tab);

  const deferredSearch = useDeferredValue(search);

  // Select which hook data to use based on the active tab
  const activeLB = tab === PERIOD.DAILY ? dailyLB : histLB;
  
  const entries = useMemo(() => activeLB?.entries || [], [activeLB]);
  const stats = useMemo(
    () => activeLB?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 },
    [activeLB]
  );
  const loading = activeLB?.loading;
  const error = activeLB?.error;
  const isStale = tab !== PERIOD.DAILY ? activeLB?.stale : false;

  /* ─--- Derived data ─--- */
  const top3 = useMemo(() => entries.slice(0, 3), [entries]);

  const myEntry = useMemo(() => {
    if (!currentUser?.uid) return null;
    return entries.find(u => u.uid === currentUser.uid) || null;
  }, [entries, currentUser]);

  /* ─--- Search (uses actual rank from entries, not sequential) ─--- */
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
  const handleRetry = () => { setRetryKey(k => k + 1); };
  const handleTabChange = (t) => {
    startTransition(() => { setTab(t); setShowCount(15); setSearch(''); });
  };

  const tabDesc = {
    daily: 'Today\'s top predictors',
    weekly: 'Monday – Sunday rankings',
    monthly: 'This month\'s top predictors',
    goat: 'Greatest of All Time — Historical Top 100',
  }[tab] || '';

  return (
    <div className="lb18-page">
      <SEO
        title="Football Prediction Leaderboard"
        description="View the ZOKASCORE football prediction leaderboard."
        keywords="football prediction leaderboard, football rankings"
        path="/leaderboard"
      />

      {/* ─── Sticky Header ─── */}
      <div className="lb18-hdr">
        <div className="lb18-wrap">
          <div className="lb18-hdr-inner">
            <button className="lb18-hdr-btn" onClick={() => nav('/predictions')}>
              <ArrowLeft size={13} /> Predictions
            </button>
            <div className="lb18-hdr-title">
              <Trophy size={15} /> Leaderboard
              {!loading && !error && entries.length > 0 && <span className="lb18-live-dot" />}
            </div>
          </div>
        </div>
      </div>

      <div className="lb18-wrap">
        {/* ─── Title ─── */}
        <div className="lb18-title">
          <div className="lb18-title-icon">
            <Trophy size={26} style={{ color: 'var(--gold)' }} />
          </div>
          <h1>Leaderboard</h1>
          <p>{tabDesc}</p>
        </div>

        {/* ─── My Rank Card ─── */}
        {myEntry && !loading && (
          <div className={`lb18-my-rank${myEntry.rank <= 3 ? ' top' : ''}`}>
            <div
              className="lb18-my-rank-icon"
              style={{
                background: myEntry.rank <= 3 ? 'rgba(245,197,66,.08)' : 'rgba(168,85,247,.06)',
                border: myEntry.rank <= 3
                  ? '1.5px solid rgba(245,197,66,.18)'
                  : '1.5px solid rgba(168,85,247,.12)',
                color: myEntry.rank <= 3 ? 'var(--gold)' : '#a855f7',
              }}
            >
              {myEntry.rank <= 3
                ? <Crown size={22} />
                : <span style={{ fontSize: '1.1rem', fontWeight: 900, fontFamily: 'var(--font-display)' }}>#{myEntry.rank}</span>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Your {tab.charAt(0).toUpperCase() + tab.slice(1)} Rank
              </div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {myEntry.points} pts · {myEntry.exact || 0} exact · {myEntry.accuracy || 0}%
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}>
              <div className="lb18-my-rank-pts">{myEntry.points}</div>
              <div style={{ fontSize: '.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.04em' }}>
                Points
              </div>
            </div>
          </div>
        )}

        {/* ─── Error ─── */}
        {error && <ErrorState error={error} onRetry={handleRetry} />}

        {!error && (
          <>
            <TabBar tabs={TABS} active={tab} onChange={handleTabChange} />

            {isStale && !loading ? (
              <StaleState period={tab} />
            ) : (
              <>
                {/* ─── Stats Grid ─── */}
                <div className="lb18-stats">
                  <StatCard
                    icon={<Flame size={17} />}
                    label="Top Score"
                    value={entries[0] ? `${entries[0].points} pts` : '–'}
                    color="var(--gold)"
                    bg="rgba(245,197,66,.05)"
                    delay={0}
                  />
                  <StatCard
                    icon={<Users size={17} />}
                    label="Players"
                    value={stats.players || 0}
                    color="#60a5fa"
                    bg="rgba(59,130,246,.05)"
                    delay={60}
                  />
                  <StatCard
                    icon={<Target size={17} />}
                    label="Avg Accuracy"
                    value={`${stats.avg || '0.0'}%`}
                    color="var(--accent)"
                    bg="rgba(0,230,118,.04)"
                    delay={120}
                  />
                  <StatCard
                    icon={<Award size={17} />}
                    label="Exact Scores"
                    value={stats.exact || 0}
                    color="#f97316"
                    bg="rgba(249,115,22,.05)"
                    delay={180}
                  />
                </div>

                {/* ─── Daily Podium ─── */}
                {tab === PERIOD.DAILY && (
                  loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 48, padding: '36px 0' }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} className="lb18-skel" style={{ width: 130, height: 190, borderRadius: 14, animationDelay: `${i * 80}ms` }} />
                      ))}
                    </div>
                  ) : filteredTop3.length >= 3 ? (
                    <div className="lb18-podium">
                      {filteredTop3.map((u, i) => (
                        <PodiumUser key={u.uid} user={u} position={i} delay={i * 100} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', marginBottom: 48, fontSize: '.86rem', fontWeight: 600 }}>
                      {entries.length === 0
                        ? 'No predictions yet — be the first!'
                        : 'Need at least 3 players for podium'}
                    </div>
                  )
                )}

                {/* ─── Non-Daily Top 3 Badges ─── */}
                {tab !== PERIOD.DAILY && filteredTop3.length >= 1 && (
                  <div className="lb18-top3">
                    {filteredTop3.slice(0, 3).map((u, i) => {
                      const colors = ['var(--gold)', '#94a3b8', '#d97706'];
                      return (
                        <div key={u.uid} className="lb18-top3-badge" style={{ animationDelay: `${i * 80}ms` }}>
                          <div style={{ position: 'relative' }}>
                            {i === 0 && (
                              <Crown
                                size={18}
                                style={{ color: 'var(--gold)', position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)' }}
                              />
                            )}
                            <div
                              className="lb18-top3-avatar"
                              style={{
                                background: `linear-gradient(135deg,${colors[i]}25,${colors[i]}08)`,
                                border: `2px solid ${colors[i]}`,
                                color: colors[i],
                                boxShadow: `0 0 18px ${colors[i]}15`,
                              }}
                            >
                              {(u.displayName || '??').slice(0, 2).toUpperCase()}
                            </div>
                          </div>
                          <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {u.displayName}
                          </span>
                          <span style={{ fontSize: '.7rem', fontWeight: 800, color: colors[i], fontFamily: 'var(--font-display)' }}>
                            {u.points} pts
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ─── Search ─── */}
                <div className="lb18-search-wrap">
                  <Search
                    size={16}
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: searchFocused ? 'var(--accent)' : 'var(--text-muted)',
                      transition: 'color .15s',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }}
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search players..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    className="lb18-search"
                  />
                  {search && (
                    <button className="lb18-search-clear" onClick={handleClear}>
                      <X size={12} />
                    </button>
                  )}
                </div>

                {search.trim() && (
                  <div className="lb18-search-count">
                    {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                  </div>
                )}

                {/* ─── Table ─── */}
                <div className="lb18-table-wrap">
                  <div className="lb18-table-scroll">
                    <table className="lb18-table">
                      <thead>
                        <tr>
                          {['Rank', 'Player', 'Accuracy', 'Points', 'Predicted', 'Exact'].map(h => (
                            <th key={h} className={`lb18-th${h === 'Exact' ? ' r' : ''}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          Array.from({ length: 8 }).map((_, i) => (
                            <tr key={i}>
                              <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                                  <div className="lb18-skel" style={{ width: 28, height: 12, borderRadius: 4, animationDelay: `${i * 50}ms` }} />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                                    <div className="lb18-skel" style={{ width: 34, height: 34, borderRadius: 8, animationDelay: `${i * 50 + 30}ms` }} />
                                    <div className="lb18-skel" style={{ width: 90, height: 12, borderRadius: 4, animationDelay: `${i * 50 + 60}ms` }} />
                                  </div>
                                  <div className="lb18-skel" style={{ width: 70, height: 10, borderRadius: 4, animationDelay: `${i * 50 + 90}ms` }} />
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : visibleRest.length === 0 && !search.trim() && filteredTop3.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '.86rem', fontWeight: 600 }}>
                              {entries.length === 0
                                ? 'No predictions yet — be the first!'
                                : 'Top players shown above.'}
                            </td>
                          </tr>
                        ) : visibleRest.length === 0 && search.trim() ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '.86rem', fontWeight: 600 }}>
                              No players found matching &quot;{deferredSearch}&quot;
                            </td>
                          </tr>
                        ) : (
                          visibleRest.map((user, i) => {
                            // Use the user's actual rank from the entries array, NOT sequential
                            const rank = user.rank;
                            const isMe = currentUser?.uid === user.uid;
                            const delay = Math.min(i * 30, 300);
                            const avColor = AVATAR_COLORS[(rank - 1) % AVATAR_COLORS.length];
                            const exactColor = (user.exact || 0) >= 15
                              ? 'var(--accent)'
                              : (user.exact || 0) >= 10
                                ? 'var(--gold)'
                                : 'var(--text-primary)';

                            return (
                              <tr
                                key={user.uid}
                                className={`lb18-row${isMe ? ' me' : ''}`}
                                style={{ animationDelay: `${delay}ms` }}
                              >
                                <td
                                  className="lb18-td"
                                  style={{
                                    fontWeight: 800,
                                    fontFamily: 'var(--font-display)',
                                    color: rank <= 10 ? 'var(--accent)' : 'var(--text-primary)',
                                    width: 50,
                                  }}
                                >
                                  #{rank}
                                </td>
                                <td className="lb18-td">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                    <div
                                      style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: 9,
                                        background: avColor,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '.7rem',
                                        fontWeight: 800,
                                        color: '#fff',
                                        flexShrink: 0,
                                        boxShadow: isMe ? '0 0 0 2px var(--accent)' : 'none',
                                      }}
                                    >
                                      {(user.displayName || '??').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {user.displayName || 'Anonymous'}
                                        {isMe && (
                                          <span style={{
                                            marginLeft: 5,
                                            fontSize: '.58rem',
                                            fontWeight: 800,
                                            color: 'var(--accent)',
                                            background: 'rgba(0,230,118,.07)',
                                            padding: '2px 7px',
                                            borderRadius: 5,
                                          }}>
                                            YOU
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>
                                        {user.totalPredictions || user.predictions || 0} predictions
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="lb18-td" style={{ minWidth: 100 }}>
                                  <AccBar value={user.accuracy || 0} delay={delay + 80} />
                                </td>
                                <td
                                  className="lb18-td r"
                                  style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: '#a855f7', fontSize: '.9rem', width: 65 }}
                                >
                                  {user.points || 0}
                                </td>
                                <td
                                  className="lb18-td r"
                                  style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '.8rem', width: 60 }}
                                >
                                  {user.totalPredictions || user.predictions || 0}
                                </td>
                                <td
                                  className="lb18-td r"
                                  style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: exactColor, fontSize: '.8rem', width: 50 }}
                                >
                                  {user.exact || 0}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ─── Show More ─── */}
                {hasMore && !loading && (
                  <button
                    className="lb18-more"
                    onClick={() => setShowCount(p => Math.min(p + 15, 200))}
                  >
                    <ChevronDown size={13} /> Show more ({filteredRest.length - visibleRest.length} remaining)
                  </button>
                )}

                {/* ─── Empty Refresh ─── */}
                {entries.length === 0 && !loading && !isStale && !error && (
                  <div style={{ textAlign: 'center', padding: '30px 0 10' }}>
                    <button className="lb18-refresh" onClick={handleRetry}>
                      <RotateCcw size={13} /> Refresh
                    </button>
                  </div>
                )}

                {/* ─── CTA ─── */}
                {entries.length > 0 && (
                  <div style={{ textAlign: 'center', marginTop: 24, padding: '20px 0' }}>
                    <button className="lb18-cta" onClick={() => nav('/predictions')}>
                      <Target size={15} /> Make Predictions <ChevronRight size={14} />
                    </button>
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