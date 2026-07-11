import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, RefreshCw, Trash2, CheckCircle2, XCircle, Zap, Trophy, Target,
  CalendarDays, BarChart3, Eye, EyeOff, Crown, Pencil, Check, Radio,
  AlertTriangle, Loader, Plus, ChevronDown, Send, Globe, CircleDot,
  ArrowUpToLine, Unplug, Clock, TrendingUp, Star, Sparkles, X,
  Rocket, Monitor, Save, Ban, BadgeCheck, Database,
  ArrowRight, Timer, Hash, Users, UserCog, Search, Mail, Shield,
  ChevronRight, LayoutDashboard, StarOff, Copy, CheckCheck, FolderOpen,
  UserPlus, UserMinus, ToggleLeft, ToggleRight, Info, Filter, SortAsc,
  Hammer, RotateCcw, ChevronUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import {
  collection, query, where, onSnapshot, doc, setDoc, deleteDoc,
  updateDoc, writeBatch, serverTimestamp, getDoc, getDocs, increment
} from 'firebase/firestore';
import { fetchFixtures, subscribeToTodayFixtures } from '../utils/api';
import {
  useActivePredictions, useZokaPicks, todayStr, tomorrowStr, calcPoints,
  resolveMatchForAllUsers, rebuildDailySummary, rebuildGoatLeaderboard,
  rebuildPeriodLeaderboard, rebuildAllLeaderboards, adminRefreshActivePredictions,
  invalidateCache, invalidateCachePrefix
} from '../hooks/useMatchData';

function safeMatches(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.matches)) return res.matches;
  return [];
}

const ST = {
  NS: { c: 'var(--text-muted)', b: 'rgba(255,255,255,.04)', l: 'Upcoming' },
  TBD: { c: 'var(--text-muted)', b: 'rgba(255,255,255,.04)', l: 'Upcoming' },
  SUSP: { c: 'var(--text-muted)', b: 'rgba(255,255,255,.04)', l: 'Suspended' },
  '1H': { c: '#ef4444', b: 'rgba(239,68,68,.1)', l: 'Live' },
  '2H': { c: '#ef4444', b: 'rgba(239,68,68,.1)', l: 'Live' },
  HT: { c: '#f97316', b: 'rgba(249,115,22,.1)', l: 'HT' },
  ET: { c: '#ef4444', b: 'rgba(239,68,68,.1)', l: 'ET' },
  P: { c: '#ef4444', b: 'rgba(239,68,68,.1)', l: 'Pens' },
  FT: { c: 'var(--accent)', b: 'rgba(0,230,118,.08)', l: 'FT' },
  AET: { c: 'var(--accent)', b: 'rgba(0,230,118,.08)', l: 'FT' },
  PEN: { c: 'var(--accent)', b: 'rgba(0,230,118,.08)', l: 'FT' },
  PST: { c: '#f59e0b', b: 'rgba(245,158,11,.1)', l: 'PST' },
  upcoming: { c: 'var(--text-muted)', b: 'rgba(255,255,255,.04)', l: 'Upcoming' },
  finished: { c: 'var(--accent)', b: 'rgba(0,230,118,.08)', l: 'FT' },
};

const MAX_FEATURED = 10;
const MAX_ZOKA = 10;
const INITIAL_SHOW = 10;
const TABS = [
  { key: 'zoka', label: 'Zoka Picks', icon: Star },
  { key: 'matches', label: 'Matches', icon: Radio },
  { key: 'results', label: 'Results', icon: Trophy },
  { key: 'staff', label: 'Staff', icon: UserCog },
  { key: 'users', label: 'Users', icon: Users },
];

function useInterval(cb, ms) {
  const saved = useRef(cb);
  useEffect(() => { saved.current = cb; }, [cb]);
  useEffect(() => {
    if (ms <= 0) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

const injectStyles = () => {
  if (document.getElementById('adm-mob-v19')) return;
  const s = document.createElement('style');
  s.id = 'adm-mob-v19';
  s.textContent = `
@keyframes afu{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes asp{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes afl{0%{background:rgba(0,230,118,.18)}100%{background:transparent}}
@keyframes pulse-live{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes slide-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes glow-gold{0%,100%{box-shadow:0 0 8px rgba(245,197,66,.12)}50%{box-shadow:0 0 20px rgba(245,197,66,.25)}}
@keyframes pop-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes live-border-glow{0%,100%{border-color:rgba(239,68,68,.1);box-shadow:0 0 4px rgba(239,68,68,.02)}50%{border-color:rgba(239,68,68,.35);box-shadow:0 0 14px rgba(239,68,68,.06)}}
@keyframes score-pop{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes save-flash{0%{background:linear-gradient(135deg,rgba(0,230,118,.2),rgba(0,230,118,.05))}100%{background:var(--bg-card)}}
@keyframes tab-indicator{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
@keyframes count-up{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes card-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.ae{animation:afu .45s cubic-bezier(.22,1,.36,1) both}
.fl{animation:afl 2s ease-out}
.si{animation:slide-in .35s cubic-bezier(.22,1,.36,1) both}
.pi-pop{animation:pop-in .3s cubic-bezier(.22,1,.36,1) both}
.score-pop{animation:score-pop .35s ease-out}
.save-flash{animation:save-flash 1.2s ease-out}
.fade-in{animation:fade-in .3s ease-out}
.count-up{animation:count-up .4s cubic-bezier(.22,1,.36,1) both}
.card-in{animation:card-in .4s cubic-bezier(.22,1,.36,1) both}
.zb{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}
.zb:hover{transform:translateY(-1px);filter:brightness(1.08)}
.zb:active{transform:translateY(0) scale(.97);filter:brightness(.95)}
.sh::-webkit-scrollbar{display:none}.sh{scrollbar-width:none}
.sk{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite}
.live-dot{width:10px;height:10px;border-radius:50%;background:#ef4444;animation:pulse-live 1.2s ease-in-out infinite;box-shadow:0 0 8px rgba(239,68,68,.6);flex-shrink:0}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:14px 24px;border-radius:14px;font-size:.9rem;font-weight:700;z-index:9999;animation:slide-in .3s ease-out;box-shadow:0 8px 30px rgba(0,0,0,.5);display:flex;align-items:center;gap:10px;max-width:90vw;white-space:nowrap}
.zoka-row{background:linear-gradient(90deg,rgba(245,197,66,.06) 0%,rgba(245,197,66,.02) 100%)!important;border-color:rgba(245,197,66,.3)!important}
.match-live-border{animation:live-border-glow 2s ease-in-out infinite}
.result-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;font-size:.78rem;font-weight:800;letter-spacing:.02em;font-family:var(--font-display,monospace);white-space:nowrap}
.pi{width:54px;height:48px;padding:0;border-radius:10px;background:var(--bg-surface);border:2px solid rgba(245,197,66,.25);color:var(--gold);text-align:center;font-weight:900;font-size:1.15rem;outline:none;font-variant-numeric:tabular-nums;transition:border-color .2s,box-shadow .2s;-webkit-appearance:none;appearance:none}
.pi:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(245,197,66,.2)}
.pi::placeholder{color:var(--text-muted);opacity:.35;font-weight:700;font-size:.9rem}
.pi.has-val{border-color:var(--gold);background:rgba(245,197,66,.06)}
.tab-btn{position:relative;display:flex;align-items:center;gap:8px;padding:14px 20px;font-weight:800;font-size:.88rem;color:var(--text-muted);background:transparent;border:none;cursor:pointer;transition:color .2s,background .2s;border-radius:12px 12px 0 0;white-space:nowrap;-webkit-tap-highlight-color:transparent;min-height:50px}
.tab-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.02)}
.tab-btn.active{color:var(--gold);background:rgba(245,197,66,.06)}
.tab-btn.active::after{content:'';position:absolute;bottom:0;left:14px;right:14px;height:3px;background:var(--gold);border-radius:3px 3px 0 0;animation:tab-indicator .25s ease-out;box-shadow:0 0 10px rgba(245,197,66,.4)}
.section-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px}
.section-title{font-size:1.05rem;font-weight:900;color:var(--text-primary);margin:0 0 16px;display:flex;align-items:center;gap:10px;letter-spacing:.01em}
.stat-mini{display:flex;flex-direction:column;align-items:center;padding:14px 10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;min-width:0}
.stat-mini .num{font-size:1.5rem;font-weight:900;font-family:var(--font-display);line-height:1}
.stat-mini .lbl{font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-top:6px}
.staff-row{display:flex;align-items:center;gap:14px;padding:16px;border-radius:12px;border:1px solid var(--border);background:var(--bg-surface);margin-bottom:10px;transition:background .15s}
.staff-row:hover{background:rgba(255,255,255,.03)}
.user-row{display:grid;grid-template-columns:2fr 1.5fr 1fr 1fr 90px;align-items:center;gap:12px;padding:14px 18px;border-radius:12px;border:1px solid var(--border);background:var(--bg-surface);margin-bottom:8px;font-size:.88rem;font-weight:600;transition:background .15s}
.user-row:hover{background:rgba(255,255,255,.03)}
.user-header{color:var(--text-muted);font-weight:800;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;background:transparent;border-bottom:2px solid var(--border);border-radius:12px 12px 0 0;margin-bottom:10px}
.user-header:hover{background:transparent}
.input-field{padding:12px 16px;border-radius:12px;background:var(--bg-surface);border:2px solid var(--border);color:var(--text-primary);font-size:.95rem;font-weight:600;outline:none;transition:border-color .2s,box-shadow .2s;width:100%;min-height:50px;-webkit-appearance:none;appearance:none}
.input-field:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(245,197,66,.12)}
.input-field::placeholder{color:var(--text-muted);opacity:.5}
.btn-primary{padding:14px 24px;border-radius:12px;font-size:.9rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:10px;transition:all .18s;min-height:50px;-webkit-tap-highlight-color:transparent}
.btn-primary:hover{transform:translateY(-1px);filter:brightness(1.08)}
.btn-primary:active{transform:translateY(0) scale(.97)}
.btn-primary:disabled{opacity:.35;pointer-events:none;filter:none;transform:none}
.btn-ghost{padding:12px 18px;border-radius:12px;font-size:.88rem;font-weight:700;background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-primary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;min-height:48px;-webkit-tap-highlight-color:transparent}
.btn-ghost:hover{background:rgba(255,255,255,.06);transform:translateY(-1px)}
.btn-ghost:active{transform:translateY(0) scale(.97)}
.btn-ghost:disabled{opacity:.35;pointer-events:none;transform:none}
.btn-danger{padding:10px 16px;border-radius:10px;font-size:.82rem;font-weight:800;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;min-height:44px;-webkit-tap-highlight-color:transparent}
.btn-danger:hover{background:rgba(239,68,68,.15);transform:translateY(-1px)}
.btn-danger:active{transform:translateY(0) scale(.97)}
.btn-sm{padding:10px 14px;border-radius:10px;font-size:.82rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;min-height:44px;-webkit-tap-highlight-color:transparent}
.role-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:8px;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.empty-state{padding:48px 24px;text-align:center;border:2px dashed var(--border);border-radius:16px;background:var(--bg-surface)}
.league-pill{padding:8px 16px;border-radius:10px;font-size:.82rem;font-weight:700;border:none;white-space:nowrap;-webkit-tap-highlight-color:transparent;min-height:40px;display:inline-flex;align-items:center;gap:6px}
.match-action{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:all .15s;flex-shrink:0;-webkit-tap-highlight-color:transparent}
.match-action:active{transform:scale(.9)}
.rebuild-btn{padding:10px 16px;border-radius:10px;font-size:.8rem;font-weight:800;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-primary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;min-height:42px;-webkit-tap-highlight-color:transparent}
.rebuild-btn:hover{background:rgba(255,255,255,.06);border-color:var(--gold);color:var(--gold)}
.rebuild-btn:active{transform:scale(.97)}
.rebuild-btn:disabled{opacity:.35;pointer-events:none}
.pub-sticky{position:sticky;top:0;z-index:50;background:var(--bg-deep);padding:12px 0 16px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--border);margin:0 -20px;padding-left:20px;padding-right:20px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.pub-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pub-stats{display:flex;align-items:center;gap:12px;font-size:.82rem;font-weight:700;color:var(--text-muted)}
.pub-stats .num{font-weight:900;font-family:var(--font-display);color:var(--text-primary)}
.pub-actions{display:flex;gap:8px;flex-wrap:wrap}
.show-more-btn{width:100%;padding:14px;border-radius:12px;background:var(--bg-card);border:2px dashed var(--border);color:var(--text-muted);font-size:.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;-webkit-tap-highlight-color:transparent}
.show-more-btn:hover{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.06)}
.show-more-btn:active{transform:scale(.98)}
@media(max-width:768px){
.user-row{grid-template-columns:1fr!important;gap:8px;padding:16px;border-radius:14px}
.user-row .hide-mobile{display:none!important}
.user-header{grid-template-columns:1fr!important;gap:4px;padding:12px 16px;font-size:.72rem}
.user-header .hide-mobile{display:none!important}
.stat-mini{padding:12px 6px;border-radius:10px}
.stat-mini .num{font-size:1.3rem}
.stat-mini .lbl{font-size:.65rem}
.tab-btn{padding:12px 16px;font-size:.82rem;min-height:46px}
.section-card{padding:16px;border-radius:14px}
.section-title{font-size:.95rem;margin-bottom:14px}
.pub-bar{flex-direction:column;align-items:stretch!important;gap:8px}
.pub-actions .btn-primary,.pub-actions .btn-ghost{width:100%;justify-content:center}
.rebuild-grid{grid-template-columns:1fr 1fr!important}
}
@media(max-width:420px){
.stat-mini .num{font-size:1.15rem}
.stat-mini .lbl{font-size:.6rem}
.tab-btn{padding:10px 14px;font-size:.78rem;gap:6px}
.section-card{padding:14px}
.pi{width:48px;height:44px;font-size:1rem}
.rebuild-grid{grid-template-columns:1fr!important}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

function Toast({ message, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  const cfg = {
    success: { bg: 'rgba(0,230,118,.15)', border: 'rgba(0,230,118,.3)', color: 'var(--accent)', Icon: CheckCircle2 },
    error: { bg: 'rgba(239,68,68,.15)', border: 'rgba(239,68,68,.3)', color: '#ef4444', Icon: XCircle },
    info: { bg: 'rgba(245,197,66,.15)', border: 'rgba(245,197,66,.3)', color: 'var(--gold)', Icon: AlertTriangle },
  }[type] || { bg: 'rgba(245,197,66,.15)', border: 'rgba(245,197,66,.3)', color: 'var(--gold)', Icon: AlertTriangle };
  return (
    <div className="toast" style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
      <cfg.Icon size={18} /> {message}
    </div>
  );
}

function ResultBadge({ pick }) {
  if (!pick.adminPick || pick.status !== 'finished') return null;
  const h = pick.adminPick.home;
  const a = pick.adminPick.away;
  const ph = pick.homeScore;
  const pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="result-badge" style={{ background:'rgba(255,255,255,.05)',color:'var(--text-muted)'}}>PENDING</span>;
  if (h === ph && a === pa) return <span className="result-badge" style={{ background:'rgba(0,230,118,.15)',color:'var(--accent)',border:'1px solid rgba(0,230,118,.3)'}}><CheckCircle2 size={12}/> EXACT +10</span>;
  const pR = h > a ? 'H' : h < a ? 'A' : 'D';
  const aR = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  if (pR === aR) return <span className="result-badge" style={{ background:'rgba(245,197,66,.12)',color:'var(--gold)',border:'1px solid rgba(245,197,66,.25)'}}><TrendingUp size={12}/> RESULT +3</span>;
  return <span className="result-badge" style={{ background:'rgba(239,68,68,.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,.2)'}}><XCircle size={12}/> MISS</span>;
}

const S = {
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16 },
  tinyLabel: { fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' },
  smallVal: { fontSize: '.88rem', fontWeight: 700 },
  bigNum: { fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-display)' },
};

export default function Admin() {
  injectStyles();
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoad, setAuthLoad] = useState(true);
  const [day, setDay] = useState('today');
  const date = day === 'today' ? todayStr() : tomorrowStr();
  const [tab, setTab] = useState('zoka');
  const [fx, setFx] = useState([]);
  const [fxLoad, setFxLoad] = useState(false);
  const [fxErr, setFxErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lg, setLg] = useState('all');
  const [dataSource, setDataSource] = useState('idle');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tick, setTick] = useState(0);
  const [flashIds, setFlashIds] = useState([]);
  const [zokaSel, setZokaSel] = useState({});
  const [savingZoka, setSavingZoka] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [staffLoad, setStaffLoad] = useState(true);
  const [editingStaff, setEditingStaff] = useState(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('analyst');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [usersLoad, setUsersLoad] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [resolvedMatches, setResolvedMatches] = useState(new Set());
  const resolvedMatchesRef = useRef(new Set());
  const [rebuilding, setRebuilding] = useState(null);

  // ★ NEW: Show-more state for Zoka tab
  const [showAllZoka, setShowAllZoka] = useState(false);
  // ★ NEW: Show-more state for Matches tab
  const [showAllMatches, setShowAllMatches] = useState(false);

  const { preds: hookPreds } = useActivePredictions(date);
  const hookPicks = useZokaPicks(date);
  const [predsOverride, setPredsOverride] = useState(null);
  const [picksOverride, setPicksOverride] = useState(null);
  const preds = predsOverride ?? hookPreds;
  const publishedPicks = picksOverride ?? hookPicks;
  const predsRef = useRef(preds);
  useEffect(() => { predsRef.current = preds; }, [preds]);

  useEffect(() => {
    if (predsOverride && hookPreds.length >= (predsOverride?.length || 0) && hookPreds.length > 0) setPredsOverride(null);
  }, [predsOverride, hookPreds]);
  useEffect(() => {
    if (picksOverride === null && hookPicks === null) return;
    if (picksOverride !== null && hookPicks !== null && hookPicks.publishedAt) setPicksOverride(null);
  }, [picksOverride, hookPicks]);

  const publishState = publishedPicks ? 'published' : 'draft';
  const publishedAt = publishedPicks?.publishedAt || null;

  useInterval(() => setTick((t) => t + 1), 10000);
  const showToast = useCallback((message, type) => { setToast({ message, type: type || 'success', key: Date.now() }); }, []);

  useEffect(() => { setZokaSel({}); }, [day]);
  useEffect(() => {
    if (currentUser && userProfile?.role === 'admin') setIsAdmin(true);
    setAuthLoad(false);
  }, [currentUser, userProfile]);
  useEffect(() => { setPredsOverride(null); setPicksOverride(null); }, [date]);

  // ★ FIX: Reset show-more when date or filters change
  useEffect(() => { setShowAllZoka(false); }, [date, lg]);
  useEffect(() => { setShowAllMatches(false); }, [date, lg]);

  const loadFx = useCallback(async (d) => {
    setFxLoad(true); setFxErr(null); setDataSource('loading');
    try {
      const res = await fetchFixtures(d);
      const m = safeMatches(res);
      setDataSource('backend'); setLastUpdate(new Date());
      if (m.length === 0) { if (res.error && res.error !== 'NO_DATA') setFxErr(res.error); }
      else setFx(m);
    } catch (e) {
      console.error('[Admin] Load error:', e);
      setFxErr('NETWORK'); setDataSource('error'); setFx([]);
    }
    setFxLoad(false);
  }, []);

  // ★ FIX: Added mountedRef guard to prevent dead callbacks
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToTodayFixtures(({ matches, error }) => {
      if (!mountedRef.current) return;
      if (error) { console.warn('[Admin] Today fixtures error:', error); if (dataSource !== 'backend') setDataSource('error'); return; }
      setFx(matches); setDataSource('backend'); setLastUpdate(new Date()); setFxLoad(false);
      const finishedMap = new Map();
      matches.forEach((m) => { if (m.isFinished) finishedMap.set(String(m.id), { h: m.homeScore, a: m.awayScore }); });
      if (finishedMap.size === 0) return;
      const currentPreds = predsRef.current;
      const batch = writeBatch(db);
      const updatedIds = [];
      currentPreds.forEach((p) => {
        const r = finishedMap.get(String(p.matchId));
        if (!r || p.status === 'finished') return;
        batch.update(doc(db, 'active_predictions', p.id), { status: 'finished', homeScore: r.h, awayScore: r.a, finishedAt: serverTimestamp() });
        updatedIds.push(p.id);
      });
      if (updatedIds.length === 0) return;
      batch.commit().then(async () => {
        if (!mountedRef.current) return;
        invalidateCache(`active_${date}`);
        try {
          const fresh = await adminRefreshActivePredictions(date);
          setPredsOverride(fresh);
        } catch (e) { console.warn('[Admin] Force refresh failed:', e); }
        setFlashIds(updatedIds);
        setTimeout(() => { if (mountedRef.current) setFlashIds([]); }, 2500);
        setSyncMsg(`Updating ${updatedIds.length} result${updatedIds.length > 1 ? 's' : ''}...`);
        const todayKey = todayStr();
        let totalResolved = 0;
        for (const [matchId, scores] of finishedMap.entries()) {
          if (resolvedMatchesRef.current.has(matchId)) continue;
          try {
            const count = await resolveMatchForAllUsers(matchId, scores.h, scores.a, todayKey);
            if (count > 0) { totalResolved += count; resolvedMatchesRef.current.add(matchId); setResolvedMatches((prev) => new Set([...prev, matchId])); }
          } catch (e) { console.error(`[Admin] Failed to resolve match ${matchId}:`, e); }
        }
        invalidateCache(`zoka_${todayKey}`);
        if (totalResolved > 0) { setSyncMsg(`✓ ${updatedIds.length} synced · ${totalResolved} predictions scored`); showToast(`${totalResolved} predictions scored automatically`, 'success'); }
        else { setSyncMsg(`✓ ${updatedIds.length} synced`); }
        setTimeout(() => { if (mountedRef.current) setSyncMsg(''); }, 6000);
      }).catch((e) => console.warn('[Admin] Batch update failed:', e));
    });
    return () => unsub();
  }, [isAdmin, date, showToast, dataSource]);

  useEffect(() => { resolvedMatchesRef.current = new Set(); setResolvedMatches(new Set()); }, [date]);

  useEffect(() => {
    if (!isAdmin || !db) return;
    const unsub = onSnapshot(collection(db, 'staff'), (snap) => {
      if (!mountedRef.current) return;
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => { const o = { admin: 0, lead: 1, analyst: 2, writer: 3 }; return (o[a.role] || 9) - (o[b.role] || 9); });
      setStaffList(list); setStaffLoad(false);
    }, (err) => { console.error('[Admin] Staff snapshot:', err); if (mountedRef.current) setStaffLoad(false); });
    return () => unsub();
  }, [isAdmin]);

  const predMap = useMemo(() => new Map(preds.map((p) => [String(p.matchId), p])), [preds]);
  const isFull = preds.length >= MAX_FEATURED;
  const zokaIds = useMemo(() => new Set(Object.keys(zokaSel)), [zokaSel]);
  const zokaCount = zokaIds.size;
  const zokaFull = zokaCount >= MAX_ZOKA;
  const zokaScored = Object.values(zokaSel).filter((s) => s.h !== '' && s.a !== '').length;
  const zokaReady = zokaCount > 0 && zokaScored === zokaCount;

  const zokaPicksForPublish = useMemo(() => {
    const picks = [];
    for (const [matchId, scores] of Object.entries(zokaSel)) {
      const match = fx.find((m) => String(m.id) === matchId);
      if (match && scores.h !== '' && scores.a !== '') {
        picks.push({
          matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
          homeLogo: match.homeLogo || null, awayLogo: match.awayLogo || null,
          league: match.league, kickoff: match.kickoff,
          adminPick: { home: Number(scores.h), away: Number(scores.a) },
          homeScore: match.isFinished ? match.homeScore : null,
          awayScore: match.isFinished ? match.awayScore : null,
          status: match.isFinished ? 'finished' : 'upcoming',
        });
      }
    }
    return picks;
  }, [zokaSel, fx]);

  const publishedResults = useMemo(() => {
    if (!publishedPicks?.matches) return { total: 0, exact: 0, result: 0, miss: 0, pending: 0 };
    let exact = 0, result = 0, miss = 0, pending = 0;
    publishedPicks.matches.forEach((pick) => {
      if (pick.status !== 'finished' || pick.homeScore == null) { pending++; return; }
      const h = pick.adminPick?.home; const a = pick.adminPick?.away;
      if (h === pick.homeScore && a === pick.awayScore) { exact++; return; }
      const pR = h > a ? 'H' : h < a ? 'A' : 'D';
      const aR = pick.homeScore > pick.awayScore ? 'H' : pick.homeScore < pick.awayScore ? 'A' : 'D';
      if (pR === aR) { result++; return; }
      miss++;
    });
    return { total: publishedPicks.matches.length, exact, result, miss, pending };
  }, [publishedPicks, tick]);

  const finCnt = preds.filter((p) => p.status === 'finished').length;
  const hasLive = fx.some((m) => m.isLive);
  const liveCount = fx.filter((m) => m.isLive).length;

  const leagues = useMemo(() => {
    const m = new Map();
    fx.forEach((f) => {
      const id = f.league && f.league.id ? String(f.league.id) : 'x';
      if (!m.has(id)) m.set(id, { id, name: f.league?.name || 'Other', logo: f.league?.emblem || f.league?.logo || null, n: 0 });
      m.get(id).n++;
    });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [fx]);

  const shown = useMemo(() => (lg === 'all' ? fx : fx.filter((f) => f.league && String(f.league.id) === lg)), [fx, lg]);

  // ★ NEW: Visible matches with show-more
  const visibleZoka = useMemo(() => showAllZoka ? shown : shown.slice(0, INITIAL_SHOW), [shown, showAllZoka]);
  const hiddenZokaCount = Math.max(0, shown.length - INITIAL_SHOW);

  const filteredUsers = useMemo(() => {
    let list = usersList;
    if (userSearch) { const q = userSearch.toLowerCase(); list = list.filter((u) => (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.uid || '').toLowerCase().includes(q)); }
    if (userFilter === 'admin') list = list.filter((u) => u.role === 'admin');
    else if (userFilter === 'user') list = list.filter((u) => u.role !== 'admin');
    return list;
  }, [usersList, userSearch, userFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await loadFx(date); showToast('Data refreshed', 'success'); }
    catch { showToast('Refresh failed', 'error'); }
    setRefreshing(false);
  };

  const handleAdd = async (match) => {
    if (!db || isFull) return;
    try {
      await setDoc(doc(db, 'active_predictions', `${date}_${match.id}`), {
        matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
        homeLogo: match.homeLogo || null, awayLogo: match.awayLogo || null,
        league: match.league, matchDate: date, kickoff: match.kickoff,
        status: 'upcoming', priority: MAX_FEATURED - preds.length,
        homeScore: null, awayScore: null, createdAt: serverTimestamp(),
      });
      const fresh = await adminRefreshActivePredictions(date);
      setPredsOverride(fresh);
      showToast(`Featured: ${match.homeTeam?.name || 'match'}`, 'success');
    } catch { showToast('Failed to add', 'error'); }
  };

  const removePred = async (pred) => {
    if (!db) return;
    await deleteDoc(doc(db, 'active_predictions', pred.id));
    try { const fresh = await adminRefreshActivePredictions(date); setPredsOverride(fresh); }
    catch (e) { console.warn('[Admin] Refresh after remove failed:', e); }
    showToast('Removed from featured', 'info');
  };

  const toggleZokaPick = (match) => {
    const id = String(match.id);
    if (zokaIds.has(id)) { setZokaSel((prev) => { const n = { ...prev }; delete n[id]; return n; }); showToast('Removed from Zoka Picks', 'info'); }
    else if (!zokaFull) { setZokaSel((prev) => ({ ...prev, [id]: { h: '', a: '' } })); showToast('Pick selected — enter score', 'success'); }
    else showToast(`Max ${MAX_ZOKA} Zoka Picks`, 'error');
  };

  const updateZokaScore = (matchId, field, value) => {
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, 2);
    setZokaSel((prev) => ({ ...prev, [matchId]: { ...prev[matchId], [field]: cleaned } }));
  };

  const saveZokaPicks = async () => {
    if (!db || zokaCount === 0) return;
    setSavingZoka(true);
    try {
      const draftPicks = [];
      for (const [matchId, scores] of Object.entries(zokaSel)) {
        const match = fx.find((m) => String(m.id) === matchId);
        if (match) {
          draftPicks.push({
            matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awawayTeam,
            homeLogo: match.homeLogo || null, awayLogo: match.awayLogo || null,
            league: match.league, kickoff: match.kickoff,
            adminPick: scores.h !== '' && scores.a !== '' ? { home: Number(scores.h), away: Number(scores.a) } : null,
            homeScore: match.isFinished ? match.homeScore : null, awayScore: match.isFinished ? match.awayScore : null,
            status: match.isFinished ? 'finished' : 'upcoming',
          });
        }
      }
      const savedData = { matches: draftPicks, publishedAt: serverTimestamp(), date, totalMatches: draftPicks.length, isDraft: !zokaReady };
      await setDoc(doc(db, 'zoka_picks', date), savedData);
      setPicksOverride({ ...savedData, publishedAt: { seconds: Math.floor(Date.now() / 1000) } });
      invalidateCache(`zoka_${date}`);
      setSavedFlash(true);
      setTimeout(() => { if (mountedRef.current) setSavedFlash(false); }, 1500);
      showToast(`Saved ${zokaCount} Zoka Pick${zokaCount > 1 ? 's' : ''}`, 'success');
    } catch (e) { console.error('[Admin] Save failed:', e); showToast('Save failed', 'error'); }
    setSavingZoka(false);
  };

  const publishZokaPicks = async () => {
    if (!db || !zokaReady) return;
    setPublishing(true);
    try {
      if (zokaPicksForPublish.length === 0) { showToast('No valid picks', 'error'); setPublishing(false); return; }
      const publishedData = { matches: zokaPicksForPublish, publishedAt: serverTimestamp(), date, totalMatches: zokaPicksForPublish.length, isDraft: false };
      await setDoc(doc(db, 'zokaPicks', date), publishedData);
      setPicksOverride({ ...publishedData, publishedAt: { seconds: Math.floor(Date.now() / 1000) } });
      invalidateCache(`zoka_${date}`);
      showToast(`PUBLISHED ${zokaPicksForPublish.length} Zoka Picks!`, 'success');
    } catch (e) { console.error('[Admin] Publish failed:', e); showToast('Publish failed', 'error'); }
    setPublishing(false);
  };

  const unpublishZokaPicks = async () => {
    if (!db) return;
    setPublishing(true);
    try { await deleteDoc(doc(db, 'zoka_picks', date)); setPicksOverride(null); invalidateCache(`zoka_${date}`); showToast('Unpublished', 'info'); }
    catch { showToast('Unpublish failed', 'error'); }
    setPublishing(false);
  };

  const handleRebuild = async (type) => {
    setRebuilding(type);
    try {
      switch (type) {
        case 'daily': await rebuildDailySummary(date); showToast(`Daily summary rebuilt for ${date}`, 'success'); break;
        case 'goat': await rebuildGoatLeaderboard(); showToast('GOAT leaderboard rebuilt', 'success'); break;
        case 'weekly': await rebuildPeriodLeaderboard('weekly'); showToast('Weekly leaderboard rebuilt', 'success'); break;
        case 'monthly': await rebuildPeriodLeaderboard('monthly'); showToast('Monthly leaderboard rebuilt', 'success'); break;
        case 'all': await rebuildAllLeaderboards(); showToast('All leaderboards rebuilt', 'success'); break;
      }
      invalidateCache(`dlb_${date}`); invalidateCache('hist_goat'); invalidateCache('hist_weekly'); invalidateCache('hist_monthly');
    } catch (e) { console.error(`[Admin] Rebuild ${type} failed:`, e); showToast(`Rebuild failed: ${e.message}`, 'error'); }
    setRebuilding(null);
  };

  const addStaff = async () => {
    if (!db || !newStaffName.trim()) return;
    try {
      await setDoc(doc(db, 'staff', newStaffName.trim().toLowerCase().replace(/\s+/g, '_')), {
        name: newStaffName.trim(), role: newStaffRole, bio: '', avatar: null, active: true, createdAt: serverTimestamp(),
      });
      setNewStaffName(''); setNewStaffRole('analyst'); setShowAddStaff(false);
      showToast('Staff added', 'success');
      } catch { showToast('Failed', 'error'); }
  };

  const updateStaff = async (id, data) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'staff', id), { ...data, updatedAt: serverTimestamp() });
      showToast('Updated', 'success');
    } catch { showToast('Update failed', 'error'); }
  };

  const deleteStaff = async (id) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'staff', id));
      showToast('Removed', 'info');
    } catch { showToast('Delete failed', 'error'); }
  };

  const loadUsers = async () => {
    setUsersLoad(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setUsersList(list);
      setUsersLoaded(true);
      showToast(`Loaded ${list.length} users`, 'success');
    } catch (e) {
      console.error('[Admin] Load users:', e);
      showToast('Failed to load users', 'error');
    }
    setUsersLoad(false);
  };

  const updateUserRole = async (uid, newRole) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole, updatedAt: serverTimestamp() });
      showToast(`Role → ${newRole}`, 'success');
    } catch { showToast('Role update failed', 'error'); }
  };

  const toMs = (dt) => {
    if (!dt) return 0;
    if (typeof dt === 'number') return dt < 1e12 ? dt * 1000 : dt;
    if (typeof dt === 'string') { const n = Date.parse(dt); return isNaN(n) ? 0 : n; }
    if (dt.seconds != null) return dt.seconds * 1000;
    if (typeof dt.getTime === 'function') return dt.getTime();
    return 0;
  };

  const formatTimeAgo = (dt) => {
    if (!dt) return 'Never';
    const ts = toMs(dt);
    if (!ts) return 'Unknown';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'Just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  if (authLoad) return null;
  if (!isAdmin) {
    return (
      <div style={{ minHeight: '100vh', overflow: 'hidden', background: 'var(--bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', padding: '48px 32px', ...S.card }}>
          <ShieldAlert size={56} style={{ color: '#ef4444', marginBottom: 20 }} />
          <h2 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: '1.3rem', fontWeight: 900 }}>Access Denied</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '.95rem', fontWeight: 600 }}>Admin only.</p>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER: MATCH ROW (complete — was cut off at {isFi)
     ═══════════════════════════════════════════════════════════ */
  const renderMatchRow = (match, idx, mode) => {
    const mid = String(match.id);
    const isZoka = mode === 'zoka';
    const isMatch = mode === 'matches';
    const sel = zokaSel[mid];
    const isPred = predMap.has(mid);
    const pred = predMap.get(mid);
    const isLive = match.isLive;
    const isFin = match.isFinished;
    const st = ST[match.status] || ST.upcoming;
    const isFlash = flashIds.includes(pred?.id);

    return (
      <div
        key={mid}
        className={`card-in ${sel ? 'zoka-row' : ''} ${isLive ? 'match-live-border' : ''} ${isFlash ? 'fl' : ''}`}
        style={{
          display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', borderRadius: 14,
          background: isFlash ? 'rgba(0,230,118,.06)' : 'var(--bg-surface)',
          border: `1px solid ${isLive ? 'rgba(239,68,68,.2)' : sel ? 'rgba(245,197,66,.25)' : 'var(--border)'}`,
          marginBottom: 10, animationDelay: `${idx * 30}ms`,
        }}
      >
        {/* League + Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            {match.league?.emblem && (
              <img src={match.league.emblem} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.league?.name || 'Unknown'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {isLive && <span className="live-dot" />}
            <span style={{ fontSize: '.78rem', fontWeight: 800, color: st.c, background: st.b, padding: '4px 12px', borderRadius: 8, letterSpacing: '.04em' }}>
              {isLive && match.minute != null ? `${match.minute}' : st.l}
            </span>
          </div>
        </div>

        {/* Teams + Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {match.homeLogo ? (
              <img src={match.homeLogo} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '.7rem' }}>⚽</div>
            )}
            <span style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.homeTeam?.shortName || match.homeTeam?.name || 'TBD'}
            </span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, minWidth: 80, justifyContent: 'center',
            background: isLive ? 'rgba(239,68,68,.1)' : isFin ? 'rgba(0,230,118,.06)' : 'rgba(255,255,255,.03)',
            border: `1px solid ${isLive ? 'rgba(239,68,68,.2)' : isFin ? 'rgba(0,230,118,.12)' : 'var(--border)'}`,
          }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: isLive ? '#ef4444' : isFin ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {match.homeScore ?? '-'}
            </span>
            <span style={{ fontSize: '.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>–</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: isLive ? '#ef4444' : isFin ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {match.awayScore ?? '-'}
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.awayTeam?.shortName || match.awayTeam?.name || 'TBD'}
            </span>
            {match.awayLogo ? (
              <img src={match.awayLogo} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '.7rem' }}>⚽</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {isZoka && (
            <button
              className="btn-sm zb"
              style={{
                background: sel ? 'rgba(245,197,66,.15)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${sel ? 'rgba(245,197,66,.4)' : 'var(--border)'}`,
                color: sel ? 'var(--gold)' : 'var(--text-muted)',
              }}
              onClick={() => toggleZokaPick(match)}
            >
              <Star size={14} fill={sel ? 'var(--gold)' : 'none'} />
              {sel ? 'Selected' : 'Zoka Pick'}
            </button>
          )}

          {sel && isZoka && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                className={`pi ${sel.h ? 'has-val' : ''}`}
                value={sel.h}
                onChange={(e) => updateZokaScore(mid, 'h', e.target.value)}
                placeholder="H"
                maxLength={2}
              />
              <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>–</span>
              <input
                className={`pi ${sel.a ? 'has-val' : ''}`}
                value={sel.a}
                onChange={(e) => updateZokaScore(mid, 'a', e.target.value)}
                placeholder="A"
                maxLength={2}
              />
            </div>
          )}

          {isMatch && (
            <>
              {isPred ? (
                <button className="btn-sm zb" style={{ background: 'rgba(0,230,118,.08)', border: '1px solid rgba(0,230,118,.2)', color: 'var(--accent)' }} onClick={() => removePred(pred)}>
                  <Check size={14} /> Featured
                </button>
              ) : (
                <button className="btn-sm zb" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', color: 'var(--text-muted)' }} onClick={() => handleAdd(match)} disabled={isFull}>
                  <Plus size={14} /> Feature
                </button>
              )}
            </>
          )}

          {/* Result badge for published picks */}
          {isZoka && publishedPicks?.matches && (
            (() => {
              const pick = publishedPicks.matches.find(p => String(p.matchId) === mid);
              if (!pick) return null;
              return <ResultBadge pick={pick} />;
            })()
          )}
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER: TABS
     ═══════════════════════════════════════════════════════════ */
  const renderTabContent = () => {
    if (tab === 'zoka') {
      const hasPicks = Object.keys(zokaSel).length > 0;
      const hasPublished = publishedPicks && publishedPicks.matches && publishedPicks.matches.length > 0;

      return (
        <div className="ae">
          {/* ★ PUBLISH BAR — sticky at top, no scrolling needed */}
          {hasPicks && (
            <div className="pub-sticky">
              <div className="pub-bar">
                <div className="pub-stats">
                  <span>{zokaCount}/{MAX_ZOKA} selected</span>
                  {zokaScored === zokaCount && zokaCount > 0 && (
                    <span className="count-up" style={{ color: 'var(--accent)' }}>✓ All scored</span>
                  )}
                </div>
                <div className="pub-actions">
                  <button
                    className="btn-ghost"
                    onClick={saveZokaPicks}
                    disabled={savingZoka || zokaScored < zokaCount}
                    style={savedFlash ? { animation: 'save-flash 1.2s ease-out' } : {}}
                  >
                    <Save Draft
                  </button>
                  {zokaReady && (
                    <button
                      className="btn-primary"
                      onClick={publishZokaPicks}
                      disabled={publishing || zokaPicksForPublish.length === 0}
                      style={{ background: 'linear-gradient(135deg, rgba(245,197,66,.9), rgba(245,197,66,.7))', color: '#000', border: 'none' }}
                    >
                      <Send size={16} /> Publish
                    </button>
                  )}
                  {hasPublished && (
                    <button
                      className="btn-danger"
                      onClick={unpublishZokaPicks}
                      disabled={publishing}
                    >
                      <X size={14} /> Unpublish
                    </button>
                  )}
                </div>
              </div>
              {/* Published results summary */}
              {hasPublished && (
                <div style={{
                  display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 12px',
                  background: 'rgba(245,197,66,.06)', borderRadius: 10, marginBottom: 4,
                }}>
                  <span className="result-badge" style={{ background: 'rgba(0,230,118,.15)', color: 'var(--accent)', border: '1px solid rgba(0,230,118,.3)' }}>
                    <CheckCircle2 size={12} /> {publishedResults.exact} Exact
                  </span>
                  <span className="result-badge" style={{ background: 'rgba(245,197,66,.12)', color: 'var(--gold)', border: '1px solid rgba(245,197,66,.25)' }}>
                    <TrendingUp size={12} /> {publishedResults.result} Result
                  </span>
                  <span className="result-badge" style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,.2)' }}>
                    <XCircle size={12} /> {publishedResults.miss} Miss
                  </span>
                  {publishedResults.pending > 0 && (
                    <span className="result-badge" style={{ background: 'rgba(255,255,255,.05)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {publishedResults.pending} Pending
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Match list with show-more */}
          {visibleZoka.length > 0 ? (
            <div>
              {visibleZoka.map((m, i) => renderMatchRow(m, i, 'zoka'))}
              {hiddenZokaCount > 0 && !showAllZoka && (
                <button className="show-more-btn" onClick={() => setShowAllZoka(true)}>
                  <ChevronDown size={16} />
                  Show {hiddenZokaCount} more matches
                </button>
              )}
              {showAllZoka && (
                <button className="show-more-btn" onClick={() => setShowAllZoka(false)} style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                  <ChevronUp size={16} />
                  Show less
                </button>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <Star size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '.95rem', fontWeight: 600 }}>
                {fxLoad ? 'Loading matches...' : fx.length === 0 ? 'No matches for this day' : 'Select matches to add as Zoka Picks'}
              </p>
            </div>
          )}
        </div>
      );
    }

    if (tab === 'matches') {
      return (
        <div className="ae">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                Featured Matches ({preds.length}/{MAX_FEATURED})
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {finCnt} finished / {fx.length} total
              </p>
            </div>
            <button className="btn-ghost" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw size={14} style={refreshing ? { animation: 'asp 1s linear infinite' } : {}} />
            </button>
          </div>

          {/* League filter */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 16px, scrollbarWidth: 'none' }}>
            <button
              className={`league-pill ${lg === 'all' ? 'active' : ''}`}
              style={lg === 'all' ? { background: 'var(--gold)', color: '#000', fontWeight: 800 } : { background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
              onClick={() => setLg('all')}
            >
              All ({fx.length})
            </button>
            {leagues.slice(0, 15).map((l) => (
              <button
                key={l.id}
                className={`league-pill ${lg === l.id ? 'active' : ''}`}
                style={lg === l.id ? { background: 'var(--gold)', color: '#000', fontWeight: 800 } : { background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
                onClick={() => setLg(l.id)}
              >
                {l.logo && <img src={l.logo} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain' }} />}
                <span>{l.name}</span>
              </button>
            ))}
            {leagues.length > 15 && (
              <button className="league-pill" style={{ background: 'rgba(255,255,255,.03)', color: 'var(--text-muted)' }}>
                +{leagues.length - 15} more
              </button>
            )}
          </div>

          {/* Match list with show-more */}
          {shown.length > 0 ? (
            <div>
              {shown.map((m, i) => renderMatchRow(m, i, 'matches'))}
              {shown.length < shown.length && !showAllMatches && (
                <button className="show-more-btn" onClick={() => setShowAllMatches(true)}>
                  <ChevronDown size={16} />
                  Show {shown.length - INITIAL_SHOW} more matches
                </button>
              )}
              {showAllMatches && (
                <button className="show-more-btn" onClick={() => setShowAllMatches(false)} style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                <ChevronUp size={16} />
                Show less
              </button>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <Radio size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '.95rem', fontWeight: 600 }}>
                {fxLoad ? 'Loading...' : fx.length === 0 ? 'No matches for this day' : 'Select matches to feature'}
              </p>
            </div>
          )}
        </div>
      );
    }

    if (tab === 'results') {
      const finishedPreds = preds.filter(p => p.status === 'finished');
      const pendingPreds = preds.filter(p => p.status !== 'finished');

      return (
        <div className="ae">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                Prediction Results
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {finishedPreds.length} finished / {preds.length} total
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowAllZoka(false)} disabled={rebuilding === null}>
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          {/* Rebuild buttons */}
          <div className="section-card">
            <h4 className="section-title">
              <Database Rebuild
              <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'none' }}>
                (admin only)
              </span>
            </h4>
            <div className="rebuild-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { key: 'daily', label: 'Daily Summary', desc: `For ${date}` },
                { key: 'goat', label: 'GOAT', desc: 'All-time' },
                { key: 'weekly', label: 'Weekly', desc: 'This week' },
                { key: 'monthly', label: 'Monthly', desc: 'This month' },
                { key: 'all', label: 'All', desc: 'Full rebuild' },
              ].map(r => (
                <button
                  key={r.key}
                  className="rebuild-btn"
                  onClick={() => handleRebuild(r.key)}
                  disabled={rebuilding !== null}
                >
                  <Database size={14} />
                  <div>
                    <div style={{ fontWeight: 800 }}>{r.label}</div>
                    <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>{r.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            {rebuilding && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                <Loader size={16} style={{ animation: 'asp 1s linear infinite' }} />
                <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '.88rem' }}>
                  Rebuilding {rebuilding}...
                </span>
              </div>
            )}
          </div>

          {/* Finished predictions */}
          {finishedPreds.length > 0 ? (
            <div>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Finished ({finishedPreds.length})
              </div>
              {finishedPreds.map((p, i) => (
                <div key={p.id} className="card-in" style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', marginBottom: 8, animationDelay: `${i * 20}ms` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      {p.league?.emblem && <img src={p.league.emblem} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain' }} />}
                      <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.league?.name || 'Unknown'}
                      </span>
                    </div>
                    <span style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(0,230,118,.08)', padding: '4px 10px', borderRadius: 6 }}>
                      {p.homeScore ?? '-'}-{p.awayScore ?? '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ flex: 1, fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.homeTeam?.name || 'TBD'}
                    </span>
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>vs</span>
                    <span style={{ flex: 1, fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.awayTeam?.name || 'TBD'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--gold)' }}>
                      Pick: {p.homeScore ?? '?'}-{p.awayScore ?? '?'}
                    </span>
                    <ResultBadge pick={p} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Trophy size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '.95rem', fontWeight: 600 }}>
                {preds.length === 0 ? 'No predictions yet' : 'No finished predictions'}
              </p>
            </div>
          )}

          {/* Pending predictions */}
          {pendingPreds.length > 0 && (
            <div>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Pending ({pendingPreds.length})
              </div>
              {pendingPreds.map((p, i) => (
                <div key={p.id} className="card-in" style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', marginBottom: 8, opacity: .7, animationDelay: `${(finishedPreds.length + i) * 20}ms` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      {p.league?.emblem && <img src={p.league.emblem} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain' }} />}
                      <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.league?.name || 'Unknown'}
                      </span>
                    </div>
                    <span style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-muted)', background: 'rgba(255,255,255,.04)', padding: '4px 10px', borderRadius: 6 }}>
                      {p.status === 'upcoming' ? 'UPCOMING' : p.status?.toUpperCase() || 'PENDING'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ flex: 1, fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.homeTeam?.name || 'TBD'}
                    </span>
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>vs</span>
                    <span style={{ flex: 1, fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.awayTeam?.name || 'TBD'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--gold)' }}>
                      Pick: {p.homeScore ?? '?'}-{p.awayScore ?? '?'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (tab === 'staff') {
      return (
        <div className="ae">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)' }}>
              Staff ({staffList.length})
            </h3>
            <button className="btn-primary" onClick={() => setShowAddStaff(!showAddStaff)} style={{ background: 'linear-gradient(135deg,rgba(0,230,118,.9),rgba(0,230,118,.7))', color: '#000', border: 'none' }}>
              <UserPlus size={16} /> Add Staff
            </button>
          </div>

          {showAddStaff && (
            <div className="section-card" style={{ marginBottom: 16, animation: 'pop-in .3s ease-out' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>Add New Staff</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input className="input-field" placeholder="Full name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} />
                <select
                  className="input-field"
                  value={newStaffRole}
                  onChange={e => setNewStaffRole(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="analyst">Analyst</option>
                  <option value="writer">Writer</option>
                  <option value="lead">Lead Analyst</option>
                  <option value="admin">Admin</option>
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" onClick={() => { setShowAddStaff(false); setNewStaffName(''); setNewStaffRole('analyst'); }}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={addStaff} disabled={!newStaffName.trim()}>
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {staffLoad ? (
            <div style={{ padding: 40px 0 }}>
              {[1, 2, 3].map(i => <div key={i} className="sk" style={{ height: 70, marginBottom: 10, borderRadius: 12 }} />)}
            </div>
          ) : staffList.length > 0 ? (
            <div>
              {staffList.map((staff) => (
                <div key={staff.id} className="staff-row">
                  {staff.avatar ? (
                    <img src={staff.avatar} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover', border: '2px solid var(--border)' }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,197,66,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {staff.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{staff.name || 'Unknown'}</div>
                    <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {staff.bio || 'No bio'}
                    </div>
                  </div>
                  <span className="role-badge" style={{
                    background: staff.role === 'admin' ? 'rgba(239,68,68,.12)' : staff.role === 'lead' ? 'rgba(245,197,66,.12)' : 'rgba(255,255,255,.06)',
                    color: staff.role === 'admin' ? '#ef4444' : staff.role === 'lead' ? 'var(--gold)' : 'var(--text-muted)',
                  }}>
                    {staff.role || 'analyst'}
                  </span>
                  {editingStaff === staff.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-ghost" onClick={() => updateStaff(staff.id, { role: 'lead' })}>
                        <ChevronUp size={14} />
                      </button>
                      <button className="btn-ghost" onClick={() => updateStaff(staff.id, { role: 'admin' })}>
                        <Crown size={14} />
                      </button>
                      <button className="btn-ghost" onClick={() => setEditingStaff(null)}>
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <button className="btn-ghost" onClick={() => setEditingStaff(staff.id)} style={{ padding: '6px 8px', minWidth: 36 }}>
                      <Pencil size={13} />
                    </button>
                  )}
                  {editingStaff !== staff.id && (
                    <button className="btn-danger" onClick={() => deleteStaff(staff.id)} style={{ padding: '6px 8px', minWidth: 36 }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <UserCog size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '.95rem', fontWeight: 600 }}>No staff members yet</p>
            </div>
          )}
        </div>
      );
    }

    if (tab === 'users') {
      return (
        <div className="ae">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)' }}>
              Users ({filteredUsers.length})
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {!usersLoaded && (
                <button className="btn-ghost" onClick={loadUsers} disabled={usersLoad}>
                  <Database size={14} />
                  Load Users
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  className="input-field"
                  placeholder="Search users by name, email, uid..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  style={{ paddingLeft: 38 }}
                />
              </div>
            </div>
            <select
              className="input-field"
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              style={{ width: 140, cursor: 'pointer' }}
            >
              <option value="all">All Users</option>
              <option value="admin">Admins</option>
              <option value="user">Regular Users</option>
            </select>
          </div>

          {/* User list with show-more */}
          {filteredUsers.length > 0 ? (
            <div>
              <div className="user-header user-header">
                <span>User</span>
                <span className="hide-mobile">Email</span>
                <span className="hide-mobile">Role</span>
                <span>Actions</span>
              </div>
              {filteredUsers.slice(0, showAllUsers ? filteredUsers.length : INITIAL_SHOW).map((u) => (
                <div key={u.id} className="user-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <img
                      src={u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || 'U')}&background=var(--bg-surface)&color=var(--text-muted)`}
                      alt=""
                      style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {u.displayName || 'Unknown'}
                      </div>
                      <div className="hide-mobile" style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                        {u.email || '—'}
                      </div>
                    </div>
                  </div>
                  <div className="hide-mobile" style={{ justifyContent: 'center' }}>
                    <span className="role-badge" style={{
                      background: u.role === 'admin' ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.06)',
                      color: u.role === 'admin' ? '#ef4444' : 'var(--text-muted)',
                    }}>
                      {u.role || 'user'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <select
                      className="input-field"
                      value={u.role || 'user'}
                      onChange={e => updateUserRole(u.id, e.target.value)}
                      style={{ width: 90, padding: '8px 10px', fontSize: '.78rem', cursor: 'pointer', minHeight: 38 }}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              ))}
              {filteredUsers.length > INITIAL_SHOW && !showAllUsers && (
                <button className="show-more-btn" onClick={() => setShowAllUsers(true)}>
                  <ChevronDown size={16} />
                  Show {filteredUsers.length - INITIAL_SHOW} more users
                </button>
              )}
              {showAllUsers && (
                <button className="show-more-btn" onClick={() => setShowAllUsers(false)} style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                <ChevronUp size={16} />
                Show less
              </button>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <Users size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '.95rem', fontWeight: 600 }}>
                {userSearch ? 'No users match your search' : usersLoaded ? 'No users found' : 'Click "Load Users" to fetch from Firestore'}
              </p>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const visibleMatches = showAllMatches ? shown : shown.slice(0, INITIAL_SHOW);
  const hiddenMatchesCount = Math.max(0, shown.length - INITIAL_SHOW);

  const toMs = (dt) => {
    if (!dt) return 0;
    if (typeof dt === 'number') return dt < 1e12 ? dt * 1000 : dt;
    if (typeof dt === 'string') { const n = Date.parse(dt); return isNaN(n) ? 0 : n; }
    if (dt.seconds != null) return dt.seconds * 1000;
    if (typeof dt.getTime === 'function') return dt.getTime();
    return 0;
  };

  const formatTimeAgo = (dt) => {
    if (!dt) return 'Never';
    const ts = toMs(dt);
    if (!ts) return 'Unknown';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'Just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 16px 100px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', padding: '24px 0 20px' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-.02em' }}>
            Admin Panel
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {day === 'today' ? 'Today' : 'Tomorrow'} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasLive && <span className="live-dot" />}
            <span style={{ fontSize: '.82rem', fontWeight: 700, color: hasLive ? '#ef4444' : 'var(--text-muted)' }}>
              {hasLive ? `${liveCount} LIVE` : 'No live'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {dataSource === 'loading' ? 'Loading...' : fxErr ? `Error: ${fxErr}` : `${fx.length} matches`}
            </span>
            {lastUpdate && (
              <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Updated {formatTimeAgo(lastUpdate)}
              </span>
            )}
          </div>
        </div>

        {/* Sync message */}
        {syncMsg && (
          <div style={{
            padding: '10px 16px', borderRadius: 10, marginBottom: 12,
            background: 'rgba(0,230,118,.08)', border: '1px solid rgba(0,230,118,.15)',
            color: 'var(--accent)', fontSize: '.88rem', fontWeight: 700, textAlign: 'center',
            animation: 'fade-in .3s ease-out',
          }}>
            {syncMsg}
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
          paddingBottom: 2, borderBottom: '1px solid var(--border)', marginBottom: 0,
        }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab-btn ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <t.icon size={16} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {renderTabContent()}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}