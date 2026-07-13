// ═══════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Leaderboard.jsx
// v16.0 — Event-driven reactive updates
//
// ★ Uses dataLayer directly (0 extra reads from useMatchData hooks)
// ★ Never crashes — graceful fallbacks for every data source
// ★ FPL-style ranking with podium, stats, search, user highlight
// ★ Reactive: auto-refreshes when predictions are submitted or leaderboards rebuilt
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Trophy, TrendingUp, Target, BarChart3,
  X, Crown, Flame, AlertCircle, ShieldAlert, Users,
  Calendar, Medal, Star, Loader, ChevronDown, Award,
  Database, Clock, ArrowLeft, Eye, Zap, Percent,
  ChevronRight, Activity, RotateCcw, CheckCircle,
  CircleDot, Home, Hash
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { dataLayer, todayStr, getWeekStart, getMonthStart } from '../utils/dataLayer';
import { eventBus, EVENT } from '../utils/eventBus';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════ */
const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#78716c',
];

const PODIUM_CFG = [
  { h: 140, border: 'var(--gold)', bg: 'linear-gradient(180deg,rgba(245,197,66,.16) 0%,rgba(245,197,66,.03) 100%)', text: 'var(--gold)', avatar: 78, font: '1.35rem', shadow: '0 0 28px rgba(245,197,66,.18)', order: 2 },
  { h: 100, border: '#94a3b8', bg: 'linear-gradient(180deg,rgba(148,163,184,.1) 0%,rgba(148,163,184,.02) 100%)', text: '#94a3b8', avatar: 62, font: '1.05rem', shadow: '0 0 18px rgba(148,163,184,.08)', order: 1 },
  { h: 80, border: '#b45309', bg: 'linear-gradient(180deg,rgba(180,83,9,.1) 0%,rgba(180,83,9,.02) 100%)', text: '#d97706', avatar: 54, font: '.9rem', shadow: '0 0 14px rgba(180,83,9,.08)', order: 3 },
];

const TABS = [
  { key: 'daily', label: 'Daily', Icon: Calendar },
  { key: 'weekly', label: 'Weekly', Icon: TrendingUp },
  { key: 'monthly', label: 'Monthly', Icon: BarChart3 },
  { key: 'goat', label: 'G.O.A.T', Icon: Crown, isGoat: true },
];

/* ═══════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════ */
const injectCSS = () => {
  if (document.getElementById('lb-v16')) return;
  const s = document.createElement('style');
  s.id = 'lb-v16';
  s.textContent = `
@keyframes lbFu{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes lbSr{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:translateX(0)}}
@keyframes lbPop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}}
@keyframes lbCrown{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-5px) rotate(5deg)}}
@keyframes lbBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes lbGlow{0%,100%{box-shadow:0 0 10px rgba(0,230,118,.12)}50%{box-shadow:0 0 22px rgba(0,230,118,.25)}}
@keyframes lbShim{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes lbPodium{from{transform:scaleY(0);transform-origin:bottom}to{transform:scaleY(1);transform-origin:bottom}}
@keyframes lbFi{from{opacity:0}to{opacity:1}}
@keyframes lbGold{0%,100%{text-shadow:0 0 6px rgba(245,197,66,.25)}50%{text-shadow:0 0 16px rgba(245,197,66,.5)}}
@keyframes lbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.5)}}
@keyframes lbShine{0%{left:-100%}100%{left:200%}}

.lb-up{animation:lbFu .45s cubic-bezier(.22,1,.36,1) both}
.lb-sr{animation:lbSr .35s cubic-bezier(.22,1,.36,1) both}
.lb-pop{animation:lbPop .35s cubic-bezier(.22,1,.36,1) both}
.lb-crown{animation:lbCrown 3s ease-in-out infinite}
.lb-bar{transform-origin:left center;animation:lbBar .7s cubic-bezier(.22,1,.36,1) both}
.lb-glow{animation:lbGlow 2s ease-in-out infinite}
.lb-shim{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:lbShim 1.5s ease-in-out infinite;border-radius:10px}
.lb-fi{animation:lbFi .3s ease-out both}
.lb-gold{animation:lbGold 2s ease-in-out infinite}

.zb{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}
.zb:hover{transform:translateY(-1px);filter:brightness(1.06)}
.zb:active{transform:translateY(0) scale(.97)}
.zb:disabled{opacity:.3;pointer-events:none;filter:none;transform:none}

.lb-tab{position:relative;padding:12px 20px;font-weight:700;font-size:.82rem;color:var(--text-muted);background:transparent;border:none;cursor:pointer;transition:all .2s;border-radius:12px 12px 0 0;white-space:nowrap;display:flex;align-items:center;gap:6px;min-height:48px;-webkit-tap-highlight-color:transparent;font-family:inherit}
.lb-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.02)}
.lb-tab.on{color:var(--gold);background:rgba(245,197,66,.05)}
.lb-tab.on::after{content:'';position:absolute;bottom:0;left:16px;right:16px;height:3px;background:var(--gold);border-radius:3px 3px 0 0;box-shadow:0 0 8px rgba(245,197,66,.35)}
.lb-tab.goat.on{color:#000;background:linear-gradient(135deg,#fbbf24,#f59e0b);font-weight:800}
.lb-tab.goat.on::after{background:rgba(0,0,0,.15);box-shadow:none}

.lb-search{width:100%;padding:13px 42px 13px 44px;border-radius:13px;background:var(--bg-card);border:2px solid var(--border);color:var(--text-primary);font-size:.86rem;font-weight:600;outline:none;transition:all .2s;min-height:52px;-webkit-appearance:none;appearance:none;font-family:inherit}
.lb-search:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,230,118,.08)}
.lb-search::placeholder{color:var(--text-muted);opacity:.4}
.lb-search:-webkit-autofill,.lb-search:-webkit-autofill:hover,.lb-search:-webkit-autofill:focus{-webkit-box-shadow:0 0 0 1000px var(--bg-card) inset;-webkit-text-fill-color:var(--text-primary);transition:background-color 5000s ease-in-out 0s}

.lb-scroll::-webkit-scrollbar{display:none}.lb-scroll{scrollbar-width:none}

.sc{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.sc-head{background:rgba(255,255,255,.02);border-bottom:1px solid var(--border)}
.sc-head th{padding:13px 16px;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;text-align:left}
.sc-head th.r{text-align:right}
.sc-row{transition:background .15s;border-bottom:1px solid rgba(255,255,255,.02)}
.sc-row:hover{background:rgba(255,255,255,.015)}
.sc-row.me{background:rgba(0,230,118,.04)!important}
.sc-row.me:hover{background:rgba(0,230,118,.06)!important}
.sc-td{padding:13px 16px;vertical-align:middle;font-size:.84rem;font-weight:600}

.acc-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.04);overflow:hidden;flex:1}
.acc-fill{height:100%;border-radius:3px;transition:width .4s cubic-bezier(.22,1,.36,1)}

.stat-c{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:12px}
.stat-icon{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.stat-val{font-size:1.3rem;font-weight:900;font-family:var(--font-display);line-height:1;color:var(--text-primary)}
.stat-lbl{font-size:.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:3px}

.rank-card{background:linear-gradient(135deg,rgba(168,85,247,.05),rgba(0,230,118,.03));border:1.5px solid rgba(168,85,247,.1);border-radius:16px;padding:16px 20px;display:flex;align-items:center;gap:14px}
.rank-card.top{border-color:rgba(245,197,66,.18);background:linear-gradient(135deg,rgba(245,197,66,.06),rgba(168,85,247,.03))}

.stale-card{display:flex;flex-direction:column;align-items:center;gap:14px;padding:40px 28px;background:var(--bg-card);border:2px dashed rgba(245,197,66,.15);border-radius:16px;text-align:center;margin-bottom:24px}

.show-more{width:100%;padding:13px;border-radius:12px;background:var(--bg-card);border:1.5px dashed var(--border);color:var(--text-muted);font-size:.84rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.show-more:hover{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.03)}
.show-more:active{transform:scale(.98)}

.back-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.back-btn:hover{color:var(--text-primary);border-color:var(--border-hover,#334155)}

@media(max-width:768px){
  .sc-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .sc-table{min-width:520px}
  .lb-podium{gap:8px!important;padding:0 8px!important}
  .lb-podium-u{max-width:115px!important}
  .stats-grid{grid-template-columns:repeat(2,1fr)!important;gap:8px!important}
  .lb-tab{padding:11px 16px;font-size:.78rem;min-height:46px}
  .rank-card{padding:14px 16px}
}
@media(max-width:420px){
  .lb-tab{padding:10px 13px;font-size:.74rem;gap:5px;min-height:44px}
  .lb-search{padding:11px 38px 11px 40px;font-size:.82rem;min-height:48px}
  .stats-grid{grid-template-columns:repeat(2,1fr)!important;gap:6px!important}
  .lb-podium-u{max-width:95px!important}
  .stat-c{padding:12px 14px;gap:10px}
  .stat-val{font-size:1.15rem}
  .stat-icon{width:36px;height:36px}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function AccBar({ value, delay }) {
  const fill = value >= 70 ? 'var(--accent)' : value >= 45 ? 'var(--gold)' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
      <div className="acc-bar"><div className="acc-fill" style={{ width: `${value}%`, background: `linear-gradient(90deg,${fill},${fill}88)`, animationDelay: `${delay || 0}ms` }} /></div>
      <span style={{ fontSize: '.7rem', fontWeight: 700, color: fill, minWidth: 30, textAlign: 'right', fontFamily: 'var(--font-display)' }}>{value}%</span>
    </div>
  );
}

function StatCard({ icon, label, value, color, bg, delay }) {
  return (
    <div className="stat-c lb-pop" style={{ animationDelay: `${delay || 0}ms` }}>
      <div className="stat-icon" style={{ background: bg, color }}>{icon}</div>
      <div><div className="stat-val">{value}</div><div className="stat-lbl">{label}</div></div>
    </div>
  );
}

function PodiumUser({ user, position, delay }) {
  const c = PODIUM_CFG[position];
  return (
    <div className="lb-pop lb-podium-u" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', order: c.order, animationDelay: `${(delay || 0) + 200}ms`, flex: 1, maxWidth: 155 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8, position: 'relative' }}>
        {position === 0 && <div className="lb-crown" style={{ color: 'var(--gold)', marginBottom: -3, filter: 'drop-shadow(0 0 6px rgba(245,197,66,.35))' }}><Crown size={22} /></div>}
        <div style={{ width: c.avatar, height: c.avatar, borderRadius: '50%', background: `linear-gradient(135deg,${c.border}30,${c.border}10)`, border: `3px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: c.font, fontWeight: 900, color: c.text, boxShadow: c.shadow, fontFamily: 'var(--font-display)' }}>
          {(user.displayName || '??').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ marginTop: 7, fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{user.displayName}</div>
        <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>{user.points} pts · {user.accuracy}%</div>
      </div>
      <div style={{ width: '100%', height: c.h, background: c.bg, borderRadius: '12px 12px 0 0', border: '1px solid rgba(255,255,255,.03)', borderBottom: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10, position: 'relative', overflow: 'hidden', animation: `lbPodium .55s cubic-bezier(.22,1,.36,1) ${(delay || 0) + 400}ms both` }}>
        <div style={{ fontSize: '1.7rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: c.text, lineHeight: 1 }}>#{position + 1}</div>
      </div>
    </div>
  );
}

function StaleState({ period }) {
  const label = { weekly: 'Weekly', monthly: 'Monthly', goat: 'G.O.A.T (All-Time)' }[period] || period;
  const desc = { weekly: 'Covers Monday through Sunday. An admin needs to rebuild it after matches finish.', monthly: 'Covers the current calendar month. An admin needs to rebuild it.', goat: 'Ranks every player by lifetime points. An admin needs to rebuild it.' }[period] || '';
  return (
    <div className="stale-card lb-up">
      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(245,197,66,.06)', border: '1px solid rgba(245,197,66,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)' }}><Database size={22} /></div>
      <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.05rem' }}>{label} Leaderboard Not Ready</div>
      <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.6, fontWeight: 600 }}>{desc}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600, opacity: .65 }}><Clock size={11} /> Requires admin rebuild — check back later</div>
    </div>
  );
}

function ErrorState({ error }) {
  return (
    <div className="lb-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 40, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, textAlign: 'center', marginBottom: 24 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>{error === 'permissions' ? <ShieldAlert size={22} /> : <AlertCircle size={22} />}</div>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>{error === 'permissions' ? 'Permissions Required' : 'Failed to Load'}</div>
      <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.5, fontWeight: 600 }}>{error === 'permissions' ? 'Allow read access to leaderboard_summaries and daily_leaderboard collections.' : error}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT — Now reactive via events
   ═══════════════════════════════════════════════════════════════ */
export default function Leaderboard() {
  injectCSS();
  const { currentUser } = useAuth();
  const nav = useNavigate();
  const searchRef = useRef(null);
  const mounted = useRef(true);

  const [tab, setTab] = useState('daily');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showCount, setShowCount] = useState(15);
  const [retryKey, setRetryKey] = useState(0);

  // ── Data state ──
  const [dailyData, setDailyData] = useState(null);
  const [histData, setHistData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isStale, setIsStale] = useState(false);

  // ── Load data based on tab ──
  const loadData = useCallback(async (currentTab) => {
    if (!mounted.current) return;
    setLoading(true);
    setError(null);
    setIsStale(false);

    try {
      if (currentTab === 'daily') {
        const data = await dataLayer.fetchDailyLeaderboard(todayStr());
        if (!mounted.current) return;
        if (!data) {
          setDailyData(null);
          setIsStale(false);
        } else {
          setDailyData(data);
        }
      } else {
        const data = await dataLayer.fetchHistoricalLeaderboard(currentTab);
        if (!mounted.current) return;
        if (!data || data.stale) {
          setHistData(null);
          setIsStale(true);
        } else {
          setHistData(data);
        }
      }
    } catch (e) {
      console.error('[LB] Load err:', e);
      if (mounted.current) setError(e.message || 'Unknown error');
    }
    if (mounted.current) setLoading(false);
  }, []);

  // Initial load and tab change
  useEffect(() => { loadData(tab); }, [tab, retryKey]);

  // ★ REACTIVE: Subscribe to leaderboard update events
  useEffect(() => {
    // Daily leaderboard updates — fired after prediction submit triggers rebuild
    const unsubDaily = eventBus.on(EVENT.DAILY_LEADERBOARD_UPDATED, (payload) => {
      if (tab === 'daily' && payload.dateStr === todayStr()) {
        loadData('daily');
      }
    });

    // Historical leaderboard updates (weekly, monthly) — fired after admin rebuild
    const unsubHist = eventBus.on(EVENT.LEADERBOARD_UPDATED, (payload) => {
      if (payload.period === tab) {
        loadData(tab);
      }
    });

    // GOAT-specific events — fired after admin rebuild
    const unsubGoat = eventBus.on(EVENT.GOAT_LEADERBOARD_UPDATED, () => {
      if (tab === 'goat') {
        loadData('goat');
      }
    });

    return () => {
      unsubDaily();
      unsubHist();
      unsubGoat();
    };
  }, [tab, loadData]);

  // Cleanup
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── Derived ──
  const activeData = tab === 'daily' ? dailyData : histData;
  const entries = useMemo(() => activeData?.entries || [], [activeData]);
  const stats = useMemo(() => activeData?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 }, [activeData]);

  const top3 = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);

  const myEntry = useMemo(() => {
    if (!currentUser?.uid) return null;
    return entries.find(u => u.uid === currentUser.uid) || null;
  }, [entries, currentUser]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(u => (u.displayName || '').toLowerCase().includes(q));
  }, [entries, search]);

  const filteredTop3 = useMemo(() => filtered.slice(0, 3), [filtered]);
  const filteredRest = useMemo(() => filtered.slice(3), [filtered]);
  const visibleRest = useMemo(() => filteredRest.slice(0, showCount - 3), [filteredRest, showCount]);
  const hasMore = filteredRest.length > showCount - 3;

  const handleClear = useCallback(() => { setSearch(''); searchRef.current?.focus(); }, []);
  const handleRetry = () => { setRetryKey(k => k + 1); };

  useEffect(() => { setShowCount(15); setSearch(''); }, [tab]);

  // ── Tab description ──
  const tabDesc = {
    daily: 'Today\'s top predictors',
    weekly: 'Monday – Sunday rankings',
    monthly: 'This month\'s top predictors',
    goat: 'Greatest of All Time — Historical Top 100',
  }[tab] || '';

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', paddingBottom: 80 }}>
      <SEO
  title="Football Prediction Leaderboard"
  description="View the ZOKASCORE football prediction leaderboard. See top predictors ranked by accuracy, points, daily, weekly, monthly and all-time performance."
  keywords="football prediction leaderboard, football rankings, top football predictors, prediction accuracy, football tips leaderboard"
  path="/leaderboard"
/>

      {/* Sticky Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,15,26,.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="back-btn" onClick={() => nav('/predictions')}>
            <ArrowLeft size={14} /> Predictions
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.84rem', fontWeight: 700, color: 'var(--gold)' }}>
            <Trophy size={15} /> Leaderboard
            {!loading && !error && entries.length > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} className="lb-glow" />}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 18px' }}>
        {/* Title */}
        <div className="lb-up" style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 14, background: 'rgba(245,197,66,.08)', border: '1px solid rgba(245,197,66,.12)', marginBottom: 12 }}>
            <Trophy size={26} style={{ color: 'var(--gold)' }} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.02em' }}>Leaderboard</h1>
          <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>{tabDesc}</p>
        </div>

        {/* My Rank Card */}
        {myEntry && !loading && (
          <div className={`rank-card lb-up ${myEntry.rank <= 3 ? 'top' : ''}`} style={{ marginBottom: 22 }}>
            <div style={{ width: 48, height: 48, borderRadius: 13, background: myEntry.rank <= 3 ? 'rgba(245,197,66,.1)' : 'rgba(168,85,247,.08)', border: myEntry.rank <= 3 ? '1.5px solid rgba(245,197,66,.18)' : '1.5px solid rgba(168,85,247,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: myEntry.rank <= 3 ? 'var(--gold)' : '#a855f7', flexShrink: 0 }}>
              {myEntry.rank <= 3 ? <Crown size={22} /> : <span style={{ fontSize: '1.1rem', fontWeight: 900, fontFamily: 'var(--font-display)' }}>#{myEntry.rank}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Your {tab.charAt(0).toUpperCase() + tab.slice(1)} Rank</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{myEntry.points} pts · {myEntry.exact || 0} exact · {myEntry.accuracy || 0}%</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#a855f7', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{myEntry.points}</div>
              <div style={{ fontSize: '.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.04em' }}>Points</div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <ErrorState error={error} />}

        {!error && (
          <>
            {/* Tabs */}
            <div className="lb-scroll lb-fi" style={{ display: 'flex', gap: 3, borderBottom: '1px solid var(--border)', marginBottom: 30, overflowX: 'auto' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`lb-tab ${tab === t.key ? 'on' : ''} ${t.isGoat ? 'goat' : ''}`}>
                  <t.Icon size={14} /> {t.label}
                </button>
              ))}
            </div>

            {/* Stale */}
            {isStale && !loading ? <StaleState period={tab} /> : (
              <>
                {/* Stats Grid */}
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 38 }}>
                  <StatCard icon={<Flame size={18} />} label="Top Score" value={entries[0] ? `${entries[0].points} pts` : '–'} color="var(--gold)" bg="rgba(245,197,66,.06)" delay={0} />
                  <StatCard icon={<Users size={18} />} label="Players" value={stats.players || 0} color="#60a5fa" bg="rgba(59,130,246,.06)" delay={60} />
                  <StatCard icon={<Target size={18} />} label="Avg Accuracy" value={`${stats.avg || '0.0'}%`} color="var(--accent)" bg="rgba(0,230,118,.05)" delay={120} />
                  <StatCard icon={<Award size={18} />} label="Exact Scores" value={stats.exact || 0} color="#f97316" bg="rgba(249,115,22,.06)" delay={180} />
                </div>

                {/* Podium — Daily */}
                {tab === 'daily' && (
                  loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 48, padding: '36px 0' }}>
                      {[0, 1, 2].map(i => <div key={i} className="lb-shim" style={{ width: 130, height: 190, borderRadius: 14 }} />)}
                    </div>
                  ) : filteredTop3.length >= 3 ? (
                    <div className="lb-podium" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10, marginBottom: 48, padding: '0 16px' }}>
                      {filteredTop3.map((u, i) => <PodiumUser key={u.uid} user={u} position={i} delay={i * 100} />)}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', marginBottom: 48, fontSize: '.88rem', fontWeight: 600 }}>
                      {entries.length === 0 ? 'No predictions yet — be the first!' : 'Need at least 3 players for podium'}
                    </div>
                  )
                )}

                {/* Non-daily top 3 badges */}
                {tab !== 'daily' && filteredTop3.length >= 1 && (
                  <div className="lb-up" style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 30 }}>
                    {filteredTop3.slice(0, 3).map((u, i) => {
                      const colors = ['var(--gold)', '#94a3b8', '#d97706'];
                      return (
                        <div key={u.uid} className="lb-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animationDelay: `${i * 80}ms` }}>
                          <div style={{ position: 'relative' }}>
                            {i === 0 && <Crown size={18} style={{ color: 'var(--gold)', position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)' }} />}
                            <div style={{ width: 54, height: 54, borderRadius: '50%', background: `linear-gradient(135deg,${colors[i]}28,${colors[i]}08)`, border: `2px solid ${colors[i]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 900, color: colors[i], boxShadow: `0 0 18px ${colors[i]}18` }}>
                              {(u.displayName || '??').slice(0, 2).toUpperCase()}
                            </div>
                          </div>
                          <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName}</span>
                          <span style={{ fontSize: '.7rem', fontWeight: 800, color: colors[i], fontFamily: 'var(--font-display)' }}>{u.points} pts</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Search */}
                <div style={{ maxWidth: 420, margin: '0 auto 22px', position: 'relative' }}>
                  <Search size={17} style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: searchFocused ? 'var(--accent)' : 'var(--text-muted)', transition: 'color .2s', pointerEvents: 'none', zIndex: 1 }} />
                  <input ref={searchRef} type="text" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} className="lb-search" />
                  {search && <button className="zb" onClick={handleClear} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.05)', border: 'none', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><X size={13} /></button>}
                </div>

                {search.trim() && (
                  <div style={{ marginBottom: 14, fontSize: '.82rem', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</div>
                )}

                {/* Table */}
                <div className="sc-wrap sc">
                  <table className="sc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Rank', 'Player', 'Accuracy', 'Points', 'Predicted', 'Exact'].map(h => (
                          <th key={h} className={`sc-head${h === 'Exact' ? ' r' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                          <tr key={i}><td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}><div className="lb-shim" style={{ width: 28, height: 12, borderRadius: 4 }} /><div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}><div className="lb-shim" style={{ width: 34, height: 34, borderRadius: 8 }} /><div className="lb-shim" style={{ width: 90, height: 12, borderRadius: 4 }} /></div><div className="lb-shim" style={{ width: 70, height: 10, borderRadius: 4 }} /></div></td></tr>
                        ))
                      ) : visibleRest.length === 0 && !search.trim() && filteredTop3.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '.88rem', fontWeight: 600 }}>{entries.length === 0 ? 'No predictions yet — be the first!' : 'Top players shown above.'}</td></tr>
                      ) : visibleRest.length === 0 && search.trim() ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '.88rem', fontWeight: 600 }}>No players found matching "{search}"</td></tr>
                      ) : (
                        visibleRest.map((user, i) => {
                          const rank = i + 4;
                          const isMe = currentUser?.uid === user.uid;
                          const delay = Math.min(i * 35, 350);
                          const avColor = AVATAR_COLORS[(i + 3) % AVATAR_COLORS.length];
                          const exactColor = (user.exact || 0) >= 15 ? 'var(--accent)' : (user.exact || 0) >= 10 ? 'var(--gold)' : 'var(--text-primary)';

                          return (
                            <tr key={user.uid} className={`sc-row lb-sr${isMe ? ' me' : ''}`} style={{ animationDelay: `${delay}ms` }}>
                              <td className="sc-td" style={{ fontWeight: 800, fontFamily: 'var(--font-display)', color: rank <= 10 ? 'var(--accent)' : 'var(--text-primary)', width: 50 }}>#{rank}</td>
                              <td className="sc-td">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                  <div style={{ width: 34, height: 34, borderRadius: 9, background: avColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 800, color: '#fff', flexShrink: 0, boxShadow: isMe ? '0 0 0 2px var(--accent)' : 'none' }}>
                                    {(user.displayName || '??').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {user.displayName || 'Anonymous'}
                                      {isMe && <span style={{ marginLeft: 5, fontSize: '.6rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(0,230,118,.08)', padding: '2px 7px', borderRadius: 5 }}>YOU</span>}
                                    </div>
                                    <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>{user.totalPredictions || user.predictions || 0} predictions</div>
                                  </div>
                                </div>
                              </td>
                              <td className="sc-td" style={{ minWidth: 100 }}><AccBar value={user.accuracy || 0} delay={delay + 100} /></td>
                              <td className="sc-td r" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: '#a855f7', fontSize: '.92rem', width: 65 }}>{user.points || 0}</td>
                              <td className="sc-td r" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '.82rem', width: 60 }}>{user.totalPredictions || user.predictions || 0}</td>
                              <td className="sc-td r" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: exactColor, fontSize: '.82rem', width: 50 }}>{user.exact || 0}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Show More */}
                {hasMore && !loading && (
                  <button className="show-more" onClick={() => setShowCount(p => Math.min(p + 15, 200))} style={{ marginTop: 12 }}>
                    <ChevronDown size={14} /> Show more ({filteredRest.length - visibleRest.length} remaining)
                  </button>
                )}

                {/* Empty state with retry when no data at all */}
                {entries.length === 0 && !loading && !isStale && !error && (
                  <div style={{ textAlign: 'center', padding: '30px 0 10' }}>
                    <button className="zb" onClick={handleRetry} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '.82rem' }}>
                      <RotateCcw size={13} /> Refresh
                    </button>
                  </div>
                )}

                {/* Back to predictions CTA */}
                {entries.length > 0 && (
                  <div style={{ textAlign: 'center', marginTop: 24, padding: '20px 0' }}>
                    <button className="zb" onClick={() => nav('/predictions')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '.85rem', border: 'none', boxShadow: '0 4px 14px rgba(0,230,118,.18)' }}>
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