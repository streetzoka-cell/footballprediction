// FILE: src/pages/Admin.jsx
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
  UserPlus, UserMinus, ToggleLeft, ToggleRight, Info, Filter, SortAsc
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import {
  collection, query, where, onSnapshot, doc, setDoc, deleteDoc,
  updateDoc, writeBatch, serverTimestamp, getDoc, getDocs,
  increment
} from 'firebase/firestore';
import { fetchFixtures, subscribeToTodayFixtures } from '../utils/api';
import {
  useUniversalResolver,
  useActivePredictions,
  useZokaPicks,
  todayStr,
  tomorrowStr,
  calcPoints,
} from '../hooks/useMatchData';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
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

const TABS = [
  { key: 'zoka', label: 'Zoka Picks', icon: Star },
  { key: 'matches', label: 'Matches', icon: Radio },
  { key: 'results', label: 'Results', icon: Trophy },
  { key: 'staff', label: 'Staff', icon: UserCog },
  { key: 'users', label: 'Users', icon: Users },
];

/* ═══════════════════════════════════════════════════════════════
   RESOLVER — kept local for Admin's write-path context
   ═══════════════════════════════════════════════════════════════ */
async function resolveAllUsersForMatch(matchId, actualH, actualA, matchDate) {
  if (!db) return 0;
  const userPredsSnap = await getDocs(
    query(collection(db, 'user_predictions'), where('matchId', '==', matchId))
  );
  if (userPredsSnap.empty) return 0;
  const batch = writeBatch(db);
  let resolved = 0;
  userPredsSnap.forEach(docSnap => {
    const p = docSnap.data();
    const uid = p.userId;
    const r = calcPoints(p.homeScore, p.awayScore, actualH, actualA);
    batch.set(doc(db, 'prediction_results', `${uid}_${matchId}`), {
      userId: uid, matchId: String(matchId), predId: p.predId,
      matchDate: p.matchDate || matchDate || todayStr(),
      homeTeam: p.homeTeam || 'Home', awayTeam: p.awayTeam || 'Away',
      homeLogo: p.homeLogo || null, awayLogo: p.awayLogo || null,
      league: p.league || '', kickoff: p.kickoff || null,
      predictedHome: p.homeScore, predictedAway: p.awayScore,
      actualHome: actualH, actualAway: actualA,
      points: r.points, resultType: r.type, resolvedAt: serverTimestamp(),
    }, { merge: true });
    batch.set(doc(db, 'user_points_total', uid), {
      totalPoints: increment(r.points),
      exactCount: increment(r.type === 'exact' ? 1 : 0),
      resultCount: increment(r.type === 'result' ? 1 : 0),
      missCount: increment(r.type === 'miss' ? 1 : 0),
      predictionsCount: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    resolved++;
  });
  await batch.commit();
  return resolved;
}

/* ═══════════════════════════════════════════════════════════════
   USE INTERVAL
   ═══════════════════════════════════════════════════════════════ */
function useInterval(cb, ms) {
  const saved = useRef(cb);
  useEffect(() => { saved.current = cb; }, [cb]);
  useEffect(() => {
    if (ms <= 0) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/* ═══════════════════════════════════════════════════════════════
   INJECT STYLES
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('adm-mob-v17')) return;
  const s = document.createElement('style');
  s.id = 'adm-mob-v17';
  s.textContent = `
    @keyframes afu{from{opacity:0;transform:translateY(16px)}
body{overflow-x:hidden;width:100%;max-width:100vw}to{opacity:1;transform:translateY(0)}}
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
      .pub-row{flex-direction:column!important;align-items:stretch!important;gap:10px!important}
      .pub-row .pub-teams{flex-direction:row!important;justify-content:space-between!important}
      .pub-row .pub-scores{flex-direction:row!important;justify-content:center!important;gap:12px!important}
      .pub-row .pub-badge{align-self:flex-end!important}
      .pi{width:52px;height:46px;font-size:1.1rem}
      .toast{bottom:20px;font-size:.85rem;padding:12px 20px;border-radius:12px}
      .action-bar{flex-direction:column!important;align-items:stretch!important}
      .action-bar .btn-primary,.action-bar .btn-ghost{width:100%;justify-content:center}
    }

    @media(max-width:420px){
      .stat-mini .num{font-size:1.15rem}
      .stat-mini .lbl{font-size:.6rem}
      .tab-btn{padding:10px 14px;font-size:.78rem;gap:6px}
      .section-card{padding:14px}
      .pi{width:48px;height:44px;font-size:1rem}
    }
  
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
    }
`;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   RESULT BADGE
   ═══════════════════════════════════════════════════════════════ */
function ResultBadge({ pick }) {
  if (!pick.adminPick || pick.status !== 'finished') return null;
  const h = pick.adminPick.home, a = pick.adminPick.away;
  const ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return (
    <span className="result-badge" style={{ background: 'rgba(255,255,255,.05)', color: 'var(--text-muted)' }}>PENDING</span>
  );
  if (h === ph && a === pa) {
    return <span className="result-badge" style={{ background: 'rgba(0,230,118,.15)', color: 'var(--accent)', border: '1px solid rgba(0,230,118,.3)' }}><CheckCircle2 size={12} /> EXACT +10</span>;
  }
  const pR = h > a ? 'H' : h < a ? 'A' : 'D';
  const aR = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  if (pR === aR) {
    return <span className="result-badge" style={{ background: 'rgba(245,197,66,.12)', color: 'var(--gold)', border: '1px solid rgba(245,197,66,.25)' }}><TrendingUp size={12} /> RESULT +3</span>;
  }
  return <span className="result-badge" style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,.2)' }}><XCircle size={12} /> MISS</span>;
}

/* ═══════════════════════════════════════════════════════════════
   STYLE SHORTCUTS
   ═══════════════════════════════════════════════════════════════ */
const S = {
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16 },
  tinyLabel: { fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' },
  smallVal: { fontSize: '.88rem', fontWeight: 700 },
  bigNum: { fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-display)' },
};

/* ═══════════════════════════════════════════════════════════════
   MAIN ADMIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
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

  // Staff state
  const [staffList, setStaffList] = useState([]);
  const [staffLoad, setStaffLoad] = useState(true);
  const [editingStaff, setEditingStaff] = useState(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('analyst');
  const [showAddStaff, setShowAddStaff] = useState(false);

  // Users state
  const [usersList, setUsersList] = useState([]);
  const [usersLoad, setUsersLoad] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');

  // Resolution tracking
  const [resolvedMatches, setResolvedMatches] = useState(new Set());
  const resolvedMatchesRef = useRef(new Set());

  /* ═══════════════════════════════════════════════════════════
     DATA — From useMatchData.js (single source of truth for reads)
     ═══════════════════════════════════════════════════════════ */
  useUniversalResolver();
  const { preds } = useActivePredictions(date);
  const publishedPicks = useZokaPicks(date);

  // Keep a ref for the auto-resolver to use synchronously
  const predsRef = useRef(preds);
  useEffect(() => { predsRef.current = preds; }, [preds]);

  // Derive publish state from hook data
  const publishState = publishedPicks ? 'published' : 'draft';
  const publishedAt = publishedPicks?.publishedAt || null;

  useInterval(() => setTick(t => t + 1), 10000);

  const showToast = useCallback((message, type) => {
    setToast({ message, type: type || 'success', key: Date.now() });
  }, []);

  useEffect(() => { setZokaSel({}); }, [day]);

  useEffect(() => {
    if (currentUser && userProfile?.role === 'admin') setIsAdmin(true);
    setAuthLoad(false);
  }, [currentUser, userProfile]);

  /* ═══════════════════════════════════════════════════════════
     LOAD FIXTURES (external API)
  ═══════════════════════════════════════════════════════════ */
  const loadFx = useCallback(async (d) => {
    setFxLoad(true); setFxErr(null); setDataSource('loading');
    try {
      const res = await fetchFixtures(d);
      const m = safeMatches(res);
      setDataSource('backend'); setLastUpdate(new Date());
      if (m.length === 0) {
        if (res.error && res.error !== 'NO_DATA') setFxErr(res.error);
      } else { setFx(m); }
    } catch (e) {
      console.error('[Admin] Load error:', e);
      setFxErr('NETWORK'); setDataSource('error'); setFx([]);
    }
    setFxLoad(false);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     REAL-TIME FIXTURES + AUTO-RESOLVER (external API + writes)
     Writes to active_predictions & zoka_picks, then resolves.
     useUniversalResolver provides a safety net for when Admin isn't open.
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToTodayFixtures(({ matches, error }) => {
      if (error) {
        console.warn('[Admin] Today fixtures error:', error);
        if (dataSource !== 'backend') setDataSource('error');
        return;
      }
      setFx(matches); setDataSource('backend'); setLastUpdate(new Date()); setFxLoad(false);

      const finishedMap = new Map();
      matches.forEach(m => {
        if (m.isFinished) finishedMap.set(String(m.id), { h: m.homeScore, a: m.awayScore });
      });
      if (finishedMap.size === 0) return;

      const currentPreds = predsRef.current;
      const batch = writeBatch(db);
      const updatedIds = [];

      currentPreds.forEach(p => {
        const r = finishedMap.get(String(p.matchId));
        if (!r || p.status === 'finished') return;
        batch.update(doc(db, 'active_predictions', p.id), {
          status: 'finished', homeScore: r.h, awayScore: r.a, finishedAt: serverTimestamp(),
        });
        updatedIds.push(p.id);
      });

      const zokaDocRef = doc(db, 'zoka_picks', date);
      getDoc(zokaDocRef).then(snap => {
        if (!snap.exists()) return;
        const zokaData = snap.data();
        let changed = false;
        const newMatches = (zokaData.matches || []).map(m => {
          const r = finishedMap.get(String(m.matchId));
          if (r && m.status !== 'finished') { changed = true; return { ...m, homeScore: r.h, awayScore: r.a, status: 'finished' }; }
          return m;
        });
        if (changed) {
          setDoc(zokaDocRef, { ...zokaData, matches: newMatches, updatedAt: serverTimestamp() }).catch(e => console.warn('[Admin] Zoka update failed:', e));
        }
      });

      if (updatedIds.length > 0) {
        batch.commit().then(async () => {
          setFlashIds(updatedIds);
          setTimeout(() => setFlashIds([]), 2500);
          setSyncMsg(`Updating ${updatedIds.length} result${updatedIds.length > 1 ? 's' : ''}...`);
          let totalResolved = 0;
          for (const [matchId, scores] of finishedMap.entries()) {
            if (resolvedMatchesRef.current.has(matchId)) continue;
            try {
              const count = await resolveAllUsersForMatch(matchId, scores.h, scores.a, date);
              if (count > 0) { totalResolved += count; resolvedMatchesRef.current.add(matchId); setResolvedMatches(prev => new Set([...prev, matchId])); }
            } catch (e) { console.error(`[Admin] Failed to resolve match ${matchId}:`, e); }
          }
          if (totalResolved > 0) {
            setSyncMsg(`✓ ${updatedIds.length} synced · ${totalResolved} predictions scored`);
            showToast(`${totalResolved} predictions scored automatically`, 'success');
          } else { setSyncMsg(`✓ ${updatedIds.length} synced`); }
          setTimeout(() => setSyncMsg(''), 6000);
        }).catch(e => console.warn('[Admin] Batch update failed:', e));
      }
    });
    return () => unsub();
  }, [isAdmin, date, showToast, dataSource]);

  useEffect(() => { resolvedMatchesRef.current = new Set(); setResolvedMatches(new Set()); }, [date]);

  /* ═══════════════════════════════════════════════════════════
     LISTEN TO STAFF (local — not in useMatchData)
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!isAdmin || !db) return;
    const unsub = onSnapshot(collection(db, 'staff'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => { const o = { admin: 0, lead: 1, analyst: 2, writer: 3 }; return (o[a.role] || 9) - (o[b.role] || 9); });
      setStaffList(list); setStaffLoad(false);
    }, err => { console.error('[Admin] Staff snapshot:', err); setStaffLoad(false); });
    return () => unsub();
  }, [isAdmin]);

  /* ═══════════════════════════════════════════════════════════
     COMPUTED VALUES
  ═══════════════════════════════════════════════════════════ */
  const predMap = useMemo(() => new Map(preds.map(p => [String(p.matchId), p])), [preds]);
  const isFull = preds.length >= MAX_FEATURED;
  const zokaIds = useMemo(() => new Set(Object.keys(zokaSel)), [zokaSel]);
  const zokaCount = zokaIds.size;
  const zokaFull = zokaCount >= MAX_ZOKA;
  const zokaScored = Object.values(zokaSel).filter(s => s.h !== '' && s.a !== '').length;
  const zokaReady = zokaCount > 0 && zokaScored === zokaCount;

  const zokaPicksForPublish = useMemo(() => {
    const picks = [];
    for (const [matchId, scores] of Object.entries(zokaSel)) {
      const match = fx.find(m => String(m.id) === matchId);
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
    publishedPicks.matches.forEach(pick => {
      if (pick.status !== 'finished' || pick.homeScore == null) { pending++; return; }
      const h = pick.adminPick?.home, a = pick.adminPick?.away;
      if (h === pick.homeScore && a === pick.awayScore) { exact++; return; }
      const pR = h > a ? 'H' : h < a ? 'A' : 'D';
      const aR = pick.homeScore > pick.awayScore ? 'H' : pick.homeScore < pick.awayScore ? 'A' : 'D';
      if (pR === aR) { result++; return; }
      miss++;
    });
    return { total: publishedPicks.matches.length, exact, result, miss, pending };
  }, [publishedPicks, tick]);

  const finCnt = preds.filter(p => p.status === 'finished').length;
  const hasLive = fx.some(m => m.isLive);
  const liveCount = fx.filter(m => m.isLive).length;

  const leagues = useMemo(() => {
    const m = new Map();
    fx.forEach(f => {
      const id = f.league && f.league.id ? String(f.league.id) : 'x';
      if (!m.has(id)) m.set(id, { id, name: f.league?.name || 'Other', logo: f.league?.emblem || f.league?.logo || null, n: 0 });
      m.get(id).n++;
    });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [fx]);

  const shown = useMemo(() => lg === 'all' ? fx : fx.filter(f => f.league && String(f.league.id) === lg), [fx, lg]);

  const filteredUsers = useMemo(() => {
    let list = usersList;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      list = list.filter(u => (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.uid || '').toLowerCase().includes(q));
    }
    if (userFilter === 'admin') list = list.filter(u => u.role === 'admin');
    else if (userFilter === 'user') list = list.filter(u => u.role !== 'admin');
    return list;
  }, [usersList, userSearch, userFilter]);

  /* ═══════════════════════════════════════════════════════════
     HANDLERS
  ═══════════════════════════════════════════════════════════ */
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await loadFx(date); showToast('Data refreshed', 'success'); } catch { showToast('Refresh failed', 'error'); }
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
      showToast(`Featured: ${match.homeTeam?.name || 'match'}`, 'success');
    } catch { showToast('Failed to add', 'error'); }
  };

  const removePred = async (pred) => {
    if (!db) return;
    await deleteDoc(doc(db, 'active_predictions', pred.id));
    showToast('Removed from featured', 'info');
  };

  const toggleZokaPick = (match) => {
    const id = String(match.id);
    if (zokaIds.has(id)) { setZokaSel(prev => { const n = { ...prev }; delete n[id]; return n; }); showToast('Removed from Zoka Picks', 'info'); }
    else if (!zokaFull) { setZokaSel(prev => ({ ...prev, [id]: { h: '', a: '' } })); showToast('Pick selected — enter score', 'success'); }
    else { showToast(`Max ${MAX_ZOKA} Zoka Picks`, 'error'); }
  };

  const updateZokaScore = (matchId, field, value) => {
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, 2);
    setZokaSel(prev => ({ ...prev, [matchId]: { ...prev[matchId], [field]: cleaned } }));
  };

  const saveZokaPicks = async () => {
    if (!db || zokaCount === 0) return;
    setSavingZoka(true);
    try {
      const draftPicks = [];
      for (const [matchId, scores] of Object.entries(zokaSel)) {
        const match = fx.find(m => String(m.id) === matchId);
        if (match) {
          draftPicks.push({
            matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
            homeLogo: match.homeLogo || null, awayLogo: match.awayLogo || null,
            league: match.league, kickoff: match.kickoff,
            adminPick: scores.h !== '' && scores.a !== '' ? { home: Number(scores.h), away: Number(scores.a) } : null,
            homeScore: match.isFinished ? match.homeScore : null, awayScore: match.isFinished ? match.awayScore : null,
            status: match.isFinished ? 'finished' : 'upcoming',
          });
        }
      }
      await setDoc(doc(db, 'zoka_picks', date), { matches: draftPicks, publishedAt: serverTimestamp(), date, totalMatches: draftPicks.length, isDraft: !zokaReady });
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
      showToast(`Saved ${zokaCount} Zoka Pick${zokaCount > 1 ? 's' : ''}`, 'success');
    } catch (e) { console.error('[Admin] Save failed:', e); showToast('Save failed', 'error'); }
    setSavingZoka(false);
  };

  const publishZokaPicks = async () => {
    if (!db || !zokaReady) return;
    setPublishing(true);
    try {
      if (zokaPicksForPublish.length === 0) { showToast('No valid picks', 'error'); setPublishing(false); return; }
      await setDoc(doc(db, 'zoka_picks', date), { matches: zokaPicksForPublish, publishedAt: serverTimestamp(), date, totalMatches: zokaPicksForPublish.length, isDraft: false });
      showToast(`PUBLISHED ${zokaPicksForPublish.length} Zoka Picks!`, 'success');
    } catch (e) { console.error('[Admin] Publish failed:', e); showToast('Publish failed', 'error'); }
    setPublishing(false);
  };

  const unpublishZokaPicks = async () => {
    if (!db) return; setPublishing(true);
    try { await deleteDoc(doc(db, 'zoka_picks', date)); showToast('Unpublished', 'info'); } catch { showToast('Unpublish failed', 'error'); }
    setPublishing(false);
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
    try { await updateDoc(doc(db, 'staff', id), { ...data, updatedAt: serverTimestamp() }); showToast('Updated', 'success'); } catch { showToast('Update failed', 'error'); }
  };

  const deleteStaff = async (id) => {
    if (!db) return;
    try { await deleteDoc(doc(db, 'staff', id)); showToast('Removed', 'info'); } catch { showToast('Delete failed', 'error'); }
  };

  const loadUsers = async () => {
    setUsersLoad(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setUsersList(list); setUsersLoaded(true);
      showToast(`Loaded ${list.length} users`, 'success');
    } catch (e) { console.error('[Admin] Load users:', e); showToast('Failed to load users', 'error'); }
    setUsersLoad(false);
  };

  const updateUserRole = async (uid, newRole) => {
    if (!db) return;
    try { await updateDoc(doc(db, 'users', uid), { role: newRole, updatedAt: serverTimestamp() }); showToast(`Role → ${newRole}`, 'success'); } catch { showToast('Role update failed', 'error'); }
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
    const ts = toMs(dt); if (!ts) return 'Unknown';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'Just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  /* ═══════════════════════════════════════════════════════════
     AUTH GUARD
  ═══════════════════════════════════════════════════════════ */
  if (authLoad) return null;
  if (!isAdmin) {
    return (
      <div style={{ minHeight:'100vh',overflow:'hidden', background:'var(--bg-deep)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ textAlign:'center', padding:'48px 32px', ...S.card }}>
          <ShieldAlert size={56} style={{ color:'#ef4444', marginBottom:20 }} />
          <h2 style={{ margin:'0 0 12px', color:'var(--text-primary)', fontSize:'1.3rem', fontWeight:900 }}>Access Denied</h2>
          <p style={{ color:'var(--text-muted)', margin:0, fontSize:'.95rem', fontWeight:600 }}>Admin only.</p>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER: MATCH ROW
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
      <div key={mid} className={`card-in ${sel ? 'zoka-row' : ''} ${isLive ? 'match-live-border' : ''} ${isFlash ? 'fl' : ''}`}
        style={{ display:'flex', flexDirection:'column', gap:12, padding:'16px', borderRadius:14,
          background: isFlash ? 'rgba(0,230,118,.06)' : 'var(--bg-surface)',
          border: `1px solid ${isLive ? 'rgba(239,68,68,.2)' : sel ? 'rgba(245,197,66,.25)' : 'var(--border)'}`,
          marginBottom:10, animationDelay: `${idx * 30}ms` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, flex:1 }}>
            {match.league?.emblem && <img src={match.league.emblem} alt="" style={{ width:20, height:20, borderRadius:4, objectFit:'contain', flexShrink:0 }} />}
            <span style={{ fontSize:'.78rem', fontWeight:700, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{match.league?.name || 'Unknown'}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            {isLive && <span className="live-dot" />}
            <span style={{ fontSize:'.78rem', fontWeight:800, color:st.c, background:st.b, padding:'4px 12px', borderRadius:8, letterSpacing:'.04em' }}>
              {isLive && match.minute != null ? `${match.minute}'` : st.l}
            </span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
            {match.homeLogo ? <img src={match.homeLogo} alt="" style={{ width:28, height:28, borderRadius:6, objectFit:'contain', flexShrink:0 }} /> : <div style={{ width:28, height:28, borderRadius:6, background:'rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'.7rem' }}>⚽</div>}
            <span style={{ fontSize:'.95rem', fontWeight:800, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{match.homeTeam?.shortName || match.homeTeam?.name || 'TBD'}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, background: isLive ? 'rgba(239,68,68,.1)' : isFin ? 'rgba(0,230,118,.06)' : 'rgba(255,255,255,.03)', padding:'8px 16px', borderRadius:10, border: `1px solid ${isLive ? 'rgba(239,68,68,.2)' : isFin ? 'rgba(0,230,118,.12)' : 'var(--border)'}`, minWidth:80, justifyContent:'center' }}>
            <span style={{ fontSize:'1.2rem', fontWeight:900, fontFamily:'var(--font-display)', color: isLive ? '#ef4444' : isFin ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric:'tabular-nums' }}>{match.homeScore ?? '-'}</span>
            <span style={{ fontSize:'.9rem', fontWeight:600, color:'var(--text-muted)' }}>–</span>
            <span style={{ fontSize:'1.2rem', fontWeight:900, fontFamily:'var(--font-display)', color: isLive ? '#ef4444' : isFin ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric:'tabular-nums' }}>{match.awayScore ?? '-'}</span>
          </div>
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, minWidth:0, justifyContent:'flex-end' }}>
            <span style={{ fontSize:'.95rem', fontWeight:800, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'right' }}>{match.awayTeam?.shortName || match.awayTeam?.name || 'TBD'}</span>
            {match.awayLogo ? <img src={match.awayLogo} alt="" style={{ width:28, height:28, borderRadius:6, objectFit:'contain', flexShrink:0 }} /> : <div style={{ width:28, height:28, borderRadius:6, background:'rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'.7rem' }}>⚽</div>}
          </div>
        </div>
        {!isLive && !isFin && match.kickoff && (
          <div style={{ fontSize:'.82rem', fontWeight:600, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:6 }}><Clock size={13} /> {match.kickoff}</div>
        )}
        {isZoka && sel && (
          <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:8, borderTop:'1px solid rgba(245,197,66,.12)' }}>
            <span style={{ fontSize:'.82rem', fontWeight:800, color:'var(--gold)', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}><Star size={14} fill="var(--gold)" /> Your Pick:</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input type="text" inputMode="numeric" maxLength={2} className={`pi ${sel.h !== '' ? 'has-val' : ''}`} value={sel.h} onChange={e => updateZokaScore(mid, 'h', e.target.value)} placeholder="H" />
              <span style={{ fontSize:'1rem', fontWeight:700, color:'var(--text-muted)' }}>–</span>
              <input type="text" inputMode="numeric" maxLength={2} className={`pi ${sel.a !== '' ? 'has-val' : ''}`} value={sel.a} onChange={e => updateZokaScore(mid, 'a', e.target.value)} placeholder="A" />
            </div>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
          {isZoka && (
            <button onClick={() => toggleZokaPick(match)} className="btn-sm zb" style={{ background: sel ? 'rgba(245,197,66,.15)' : 'rgba(245,197,66,.06)', color: 'var(--gold)', border: `1px solid ${sel ? 'rgba(245,197,66,.3)' : 'rgba(245,197,66,.15)'}`, flex:1 }}>
              <Star size={15} fill={sel ? 'var(--gold)' : 'none'} /> {sel ? 'Selected' : 'Zoka Pick'}
            </button>
          )}
          {isMatch && (
            <>
              <button onClick={() => handleAdd(match)} disabled={isPred || isFull} className="btn-sm zb" style={{ background: isPred ? 'rgba(0,230,118,.1)' : 'rgba(0,230,118,.06)', color: 'var(--accent)', border: `1px solid ${isPred ? 'rgba(0,230,118,.25)' : 'rgba(0,230,118,.15)'}`, flex:1 }}>
                {isPred ? <><CheckCircle2 size={15} /> Featured</> : <><Plus size={15} /> Feature</>}
              </button>
              {isPred && <button onClick={() => removePred(pred)} className="btn-danger" style={{ flexShrink:0 }}><Trash2 size={14} /></button>}
            </>
          )}
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER: PUBLISHED RESULT ROW
  ═══════════════════════════════════════════════════════════ */
  const renderPubResult = (pick, i) => (
    <div key={i} className="pub-row card-in" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, background:'var(--bg-surface)', border:'1px solid var(--border)', marginBottom:8, animationDelay:`${i*25}ms` }}>
      <div className="pub-teams" style={{ flex:1, display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
        {pick.homeLogo && <img src={pick.homeLogo} alt="" style={{ width:22, height:22, borderRadius:5, objectFit:'contain', flexShrink:0 }} />}
        <span style={{ fontSize:'.85rem', fontWeight:700, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pick.homeTeam?.shortName || pick.homeTeam?.name}</span>
      </div>
      <div className="pub-scores" style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <span style={{ fontSize:'.95rem', fontWeight:900, fontFamily:'var(--font-display)', color:'var(--gold)', fontVariantNumeric:'tabular-nums' }}>{pick.adminPick?.home ?? '?'}-{pick.adminPick?.away ?? '?'}</span>
        <span style={{ fontSize:'.8rem', color:'var(--text-muted)' }}>→</span>
        <span style={{ fontSize:'.95rem', fontWeight:900, fontFamily:'var(--font-display)', color: pick.status === 'finished' ? 'var(--accent)' : 'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>{pick.homeScore ?? '?'}-{pick.awayScore ?? '?'}</span>
      </div>
      <div className="pub-badge" style={{ flexShrink:0 }}><ResultBadge pick={pick} /></div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     RENDER: STAFF TAB
  ═══════════════════════════════════════════════════════════ */
  const renderStaffTab = () => (
    <div className="section-card ae">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h3 className="section-title" style={{ margin:0 }}><UserCog size={18} /> Staff Members</h3>
        <button onClick={() => setShowAddStaff(v => !v)} className="btn-sm zb" style={{ background:'rgba(245,197,66,.08)', color:'var(--gold)', border:'1px solid rgba(245,197,66,.2)' }}>
          <Plus size={15} /> Add
        </button>
      </div>

      {showAddStaff && (
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }} className="card-in">
          <input className="input-field" style={{ flex:2, minWidth:150 }} placeholder="Name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} />
          <select className="input-field" style={{ flex:1, minWidth:120 }} value={newStaffRole} onChange={e => setNewStaffRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="lead">Lead</option>
            <option value="analyst">Analyst</option>
            <option value="writer">Writer</option>
          </select>
          <button onClick={addStaff} className="btn-primary" style={{ background:'var(--gold)', color:'var(--bg-deep)' }}><Check size={16} /> Add</button>
        </div>
      )}

      {staffLoad ? (
        <div className="sk" style={{ height:60, borderRadius:12, marginBottom:10 }} />
      ) : staffList.length === 0 ? (
        <div className="empty-state"><Users size={32} style={{ color:'var(--text-muted)', marginBottom:12 }} /><p style={{ color:'var(--text-muted)', fontWeight:700, margin:0 }}>No staff members yet</p></div>
      ) : (
        staffList.map(s => (
          <div key={s.id} className="staff-row">
            <div style={{ width:40, height:40, borderRadius:10, background:'rgba(245,197,66,.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:900, fontSize:'.9rem', color:'var(--gold)' }}>
              {(s.name || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'.95rem', fontWeight:800, color:'var(--text-primary)' }}>{s.name || 'Unnamed'}</div>
              <span className="role-badge" style={{
                background: s.role === 'admin' ? 'rgba(239,68,68,.1)' : s.role === 'lead' ? 'rgba(245,197,66,.1)' : 'rgba(255,255,255,.04)',
                color: s.role === 'admin' ? '#ef4444' : s.role === 'lead' ? 'var(--gold)' : 'var(--text-muted)',
                border: `1px solid ${s.role === 'admin' ? 'rgba(239,68,68,.2)' : s.role === 'lead' ? 'rgba(245,197,66,.2)' : 'var(--border)'}`,
                marginTop: 4,
              }}>{s.role || 'analyst'}</span>
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              <button onClick={() => setEditingStaff(editingStaff === s.id ? null : s.id)} className="btn-ghost" style={{ padding:'8px 12px', minWidth:40 }}><Pencil size={14} /></button>
              <button onClick={() => deleteStaff(s.id)} className="btn-danger" style={{ padding:'8px 12px', minWidth:40 }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     RENDER: USERS TAB
  ═══════════════════════════════════════════════════════════ */
  const renderUsersTab = () => (
    <div className="section-card ae">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h3 className="section-title" style={{ margin:0 }}><Users size={18} /> Users</h3>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {!usersLoaded && (
            <button onClick={loadUsers} disabled={usersLoad} className="btn-primary" style={{ background:'var(--gold)', color:'var(--bg-deep)', padding:'10px 18px', fontSize:'.82rem' }}>
              {usersLoad ? <Loader size={14} className="asp" /> : <Database size={14} />} Load Users
            </button>
          )}
          {usersLoaded && (
            <button onClick={loadUsers} disabled={usersLoad} className="btn-ghost" style={{ padding:'10px 14px', fontSize:'.82rem' }}>
              <RefreshCw size={14} /> Refresh
            </button>
          )}
        </div>
      </div>

      {usersLoaded && (
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <div style={{ flex:2, minWidth:180, position:'relative' }}>
            <Search size={15} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
            <input className="input-field" style={{ paddingLeft:38 }} placeholder="Search name, email, uid..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
          </div>
          <select className="input-field" style={{ flex:1, minWidth:120 }} value={userFilter} onChange={e => setUserFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="user">Users</option>
          </select>
        </div>
      )}

      {usersLoad ? (
        <><div className="sk" style={{ height:48, borderRadius:12, marginBottom:8 }} /><div className="sk" style={{ height:48, borderRadius:12, marginBottom:8 }} /><div className="sk" style={{ height:48, borderRadius:12 }} /></>
      ) : usersLoaded ? (
        <>
          <div className="user-row user-header">
            <span>User</span>
            <span className="hide-mobile">Email</span>
            <span className="hide-mobile">Role</span>
            <span className="hide-mobile">Joined</span>
            <span>Actions</span>
          </div>
          {filteredUsers.length === 0 ? (
            <div className="empty-state" style={{ padding:32 }}><Search size={28} style={{ color:'var(--text-muted)', marginBottom:10 }} /><p style={{ color:'var(--text-muted)', fontWeight:700, margin:0, fontSize:'.88rem' }}>No users found</p></div>
          ) : filteredUsers.map(u => (
            <div key={u.id} className="user-row">
              <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:800, fontSize:'.78rem', color:'var(--text-muted)' }}>
                  {(u.displayName || u.email || '?')[0].toUpperCase()}
                </div>
                <span style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.displayName || 'Anonymous'}</span>
              </div>
              <span className="hide-mobile" style={{ color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'.82rem' }}>{u.email || '—'}</span>
              <span className="hide-mobile">
                <span className="role-badge" style={{
                  background: u.role === 'admin' ? 'rgba(239,68,68,.1)' : 'rgba(255,255,255,.04)',
                  color: u.role === 'admin' ? '#ef4444' : 'var(--text-muted)',
                  border: `1px solid ${u.role === 'admin' ? 'rgba(239,68,68,.2)' : 'var(--border)'}`,
                }}>{u.role || 'user'}</span>
              </span>
              <span className="hide-mobile" style={{ color:'var(--text-muted)', fontSize:'.82rem' }}>{formatTimeAgo(u.createdAt)}</span>
              <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                {u.role !== 'admin' && (
                  <button onClick={() => updateUserRole(u.id, 'admin')} className="btn-sm zb" style={{ background:'rgba(239,68,68,.06)', color:'#ef4444', border:'1px solid rgba(239,68,68,.15)', padding:'6px 10px', fontSize:'.72rem' }}>
                    <Crown size={12} />
                  </button>
                )}
                {u.role === 'admin' && (
                  <button onClick={() => updateUserRole(u.id, 'user')} className="btn-sm zb" style={{ background:'rgba(255,255,255,.04)', color:'var(--text-muted)', border:'1px solid var(--border)', padding:'6px 10px', fontSize:'.72rem' }}>
                    <Ban size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <div style={{ marginTop:12, fontSize:'.8rem', fontWeight:700, color:'var(--text-muted)' }}>Showing {filteredUsers.length} of {usersList.length} users</div>
        </>
      ) : (
        <div className="empty-state"><Database size={32} style={{ color:'var(--text-muted)', marginBottom:12 }} /><p style={{ color:'var(--text-muted)', fontWeight:700, margin:0 }}>Click "Load Users" to fetch user data</p></div>
      )}
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     MAIN RENDER
  ═══════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight:'100vh',overflow:'hidden', background:'var(--bg-deep)' }}>
      {/* Header */}
      <div style={{ position:'sticky',top:0,zIndex:100,background:'rgba(10,10,10,.92)',backdropFilter:'blur(20px)',borderBottom:'1px solid var(--border)' }}>
        <div style={{ maxWidth:920,margin:'0 auto',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer' }} onClick={() => navigate('/')}>
            <div style={{ width:30,height:30,borderRadius:9,background:'linear-gradient(145deg,#f5c542,#f59e0b)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:'.76rem',color:'var(--bg-deep)',fontFamily:'var(--font-display)' }}>Z</div>
            <span style={{ fontSize:'.9rem',fontWeight:800,color:'var(--text-primary)' }}>Admin<span style={{ color:'var(--gold)' }}>.zokascore</span></span>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <button onClick={() => setDay(d => d === 'today' ? 'tomorrow' : 'today')} className="zb" style={{ padding:'8px 16px',borderRadius:10,background: day === 'tomorrow' ? 'rgba(245,197,66,.1)' : 'rgba(255,255,255,.04)',border: day === 'tomorrow' ? '1px solid rgba(245,197,66,.2)' : '1px solid var(--border)',color: day === 'tomorrow' ? 'var(--gold)' : 'var(--text-muted)',fontWeight:700,fontSize:'.82rem',display:'flex',alignItems:'center',gap:6 }}>
              <CalendarDays size={14} /> {day === 'today' ? 'Today' : 'Tomorrow'}
            </button>
            <button onClick={() => navigate('/')} className="zb" style={{ padding:'8px 14px',borderRadius:10,background:'rgba(255,255,255,.04)',border:'1px solid var(--border)',color:'var(--text-muted)',fontSize:'.82rem' }}>Exit</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:920,margin:'0 auto',padding:'20px 20px 100px' }}>
        {/* Stats row */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:20 }}>
          <div className="stat-mini ae" style={{ animationDelay:'0ms' }}><div className="num" style={{ color: dataSource === 'backend' ? 'var(--accent)' : 'var(--text-muted)' }}>{fx.length}</div><div className="lbl">Fixtures</div></div>
          <div className="stat-mini ae" style={{ animationDelay:'60ms' }}><div className="num" style={{ color: preds.length > 0 ? '#60a5fa' : 'var(--text-muted)' }}>{preds.length}/{MAX_FEATURED}</div><div className="lbl">Featured</div></div>
          <div className="stat-mini ae" style={{ animationDelay:'120ms' }}><div className="num" style={{ color: hasLive ? '#ef4444' : 'var(--text-muted)' }}>{liveCount}</div><div className="lbl">Live</div></div>
          <div className="stat-mini ae" style={{ animationDelay:'180ms' }}><div className="num" style={{ color: finCnt > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{finCnt}</div><div className="lbl">Finished</div></div>
          <div className="stat-mini ae" style={{ animationDelay:'240ms' }}><div className="num" style={{ color: publishState === 'published' ? 'var(--gold)' : 'var(--text-muted)' }}>{publishState === 'published' ? '✓' : '—'}</div><div className="lbl">Published</div></div>
        </div>

        {/* Sync message */}
        {syncMsg && (
          <div className="fade-in" style={{ padding:'10px 16px',borderRadius:10,background:'rgba(0,230,118,.06)',border:'1px solid rgba(0,230,118,.15)',marginBottom:16,fontSize:'.82rem',fontWeight:700,color:'var(--accent)',display:'flex',alignItems:'center',gap:8 }}>
            <Zap size={14} /> {syncMsg}
          </div>
        )}

        {/* Error state */}
        {fxErr && (
          <div className="section-card" style={{ borderColor:'rgba(239,68,68,.2)',background:'rgba(239,68,68,.04)' }}>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:12 }}>
              <AlertTriangle size={18} style={{ color:'#ef4444' }} />
              <span style={{ fontWeight:800,color:'#ef4444' }}>Failed to load fixtures</span>
            </div>
            <p style={{ fontSize:'.88rem',color:'var(--text-muted)',margin:'0 0 12px',fontWeight:600 }}>{fxErr === 'NETWORK' ? 'Network error — check your connection' : `Error: ${fxErr}`}</p>
            <button onClick={handleRefresh} className="btn-primary" style={{ background:'rgba(239,68,68,.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,.2)' }}><RefreshCw size={15} /> Retry</button>
          </div>
        )}

        {/* Loading skeleton */}
        {fxLoad && fx.length === 0 && (
          <div style={{ display:'flex',flexDirection:'column',gap:10,marginBottom:20 }}>
            {[0,1,2,3].map(i => <div key={i} className="sk" style={{ height:100,borderRadius:14,animationDelay:`${i*100}ms` }} />)}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex',gap:4,overflowX:'auto',borderBottom:'2px solid var(--border)',marginBottom:20 }} className="sh">
          {TABS.map(t => {
            const Icon = t.icon;
            const count = t.key === 'zoka' ? zokaCount : t.key === 'matches' ? preds.length : t.key === 'results' ? publishedResults.total : t.key === 'staff' ? staffList.length : usersList.length;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className={`tab-btn ${tab === t.key ? 'active' : ''}`}>
                <Icon size={16} /> {t.label}
                {count > 0 && <span style={{ fontSize:'.72rem',fontWeight:800,padding:'2px 8px',borderRadius:6,background: tab === t.key ? 'rgba(245,197,66,.15)' : 'rgba(255,255,255,.05)',color: tab === t.key ? 'var(--gold)' : 'var(--text-muted)' }}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* ═══════ ZOKA PICKS TAB ═══════ */}
        {tab === 'zoka' && (
          <div className="ae">
            {/* Action bar */}
            <div className="action-bar" style={{ display:'flex',gap:10,marginBottom:16,flexWrap:'wrap' }}>
              <button onClick={saveZokaPicks} disabled={zokaCount === 0 || savingZoka} className="btn-ghost" style={{ flex:1,minWidth:120 }}>
                {savingZoka ? <Loader size={15} className="asp" /> : <Save size={15} />} Save Draft ({zokaCount})
              </button>
              <button onClick={publishZokaPicks} disabled={!zokaReady || publishing} className="btn-primary" style={{ flex:1,minWidth:120,background: zokaReady ? 'var(--gold)' : 'rgba(245,197,66,.2)',color: zokaReady ? 'var(--bg-deep)' : 'var(--text-muted)' }}>
                {publishing ? <Loader size={15} className="asp" /> : <Rocket size={15} />} Publish
              </button>
              {publishState === 'published' && (
                <button onClick={unpublishZokaPicks} disabled={publishing} className="btn-danger" style={{ minWidth:100 }}>
                  <X size={14} /> Unpublish
                </button>
              )}
            </div>

            {zokaCount > 0 && !zokaReady && (
              <div style={{ padding:'10px 16px',borderRadius:10,background:'rgba(245,197,66,.06)',border:'1px solid rgba(245,197,66,.15)',marginBottom:16,fontSize:'.82rem',fontWeight:700,color:'var(--gold)',display:'flex',alignItems:'center',gap:8 }}>
                <AlertTriangle size={14} /> {zokaScored}/{zokaCount} picks have scores — fill all to publish
              </div>
            )}

            {savedFlash && (
              <div className="save-flash" style={{ padding:'10px 16px',borderRadius:10,border:'1px solid rgba(0,230,118,.2)',marginBottom:16,fontSize:'.82rem',fontWeight:700,color:'var(--accent)',display:'flex',alignItems:'center',gap:8 }}>
                <CheckCheck size={14} /> Draft saved
              </div>
            )}

            {/* League filter for zoka */}
            {leagues.length > 1 && (
              <div style={{ display:'flex',gap:6,marginBottom:16,overflowX:'auto',paddingBottom:4 }} className="sh">
                <button onClick={() => setLg('all')} className="league-pill zb" style={{ background: lg === 'all' ? 'rgba(245,197,66,.1)' : 'rgba(255,255,255,.03)',color: lg === 'all' ? 'var(--gold)' : 'var(--text-muted)',border: `1px solid ${lg === 'all' ? 'rgba(245,197,66,.2)' : 'var(--border)'}` }}>All ({fx.length})</button>
                {leagues.map(l => (
                  <button key={l.id} onClick={() => setLg(l.id)} className="league-pill zb" style={{ background: lg === l.id ? 'rgba(245,197,66,.1)' : 'rgba(255,255,255,.03)',color: lg === l.id ? 'var(--gold)' : 'var(--text-muted)',border: `1px solid ${lg === l.id ? 'rgba(245,197,66,.2)' : 'var(--border)'}` }}>
                    {l.logo && <img src={l.logo} alt="" style={{ width:16,height:16,borderRadius:3,objectFit:'contain' }} />}
                    {l.name} ({l.n})
                  </button>
                ))}
              </div>
            )}

            {shown.length === 0 ? (
              <div className="empty-state">
                <Radio size={32} style={{ color:'var(--text-muted)',marginBottom:12 }} />
                <p style={{ color:'var(--text-muted)',fontWeight:700,margin:'0 0 6px' }}>No fixtures available</p>
                <p style={{ color:'var(--text-muted)',fontWeight:600,margin:0,fontSize:'.85rem' }}>Try refreshing or switching days</p>
              </div>
            ) : (
              shown.map((m, i) => renderMatchRow(m, i, 'zoka'))
            )}
          </div>
        )}

        {/* ═══════ MATCHES TAB ═══════ */}
        {tab === 'matches' && (
          <div className="ae">
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10 }}>
              <div style={{ fontSize:'.88rem',fontWeight:700,color:'var(--text-muted)' }}>
                {preds.length}/{MAX_FEATURED} featured slots used
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button onClick={handleRefresh} disabled={refreshing} className="btn-ghost" style={{ padding:'10px 14px',fontSize:'.82rem' }}>
                  {refreshing ? <Loader size={14} className="asp" /> : <RefreshCw size={14} />} Refresh
                </button>
              </div>
            </div>

            {isFull && (
              <div style={{ padding:'10px 16px',borderRadius:10,background:'rgba(245,197,66,.06)',border:'1px solid rgba(245,197,66,.15)',marginBottom:16,fontSize:'.82rem',fontWeight:700,color:'var(--gold)',display:'flex',alignItems:'center',gap:8 }}>
                <AlertTriangle size={14} /> All {MAX_FEATURED} featured slots are full — remove one to add another
              </div>
            )}

            {leagues.length > 1 && (
              <div style={{ display:'flex',gap:6,marginBottom:16,overflowX:'auto',paddingBottom:4 }} className="sh">
                <button onClick={() => setLg('all')} className="league-pill zb" style={{ background: lg === 'all' ? 'rgba(245,197,66,.1)' : 'rgba(255,255,255,.03)',color: lg === 'all' ? 'var(--gold)' : 'var(--text-muted)',border: `1px solid ${lg === 'all' ? 'rgba(245,197,66,.2)' : 'var(--border)'}` }}>All ({fx.length})</button>
                {leagues.map(l => (
                  <button key={l.id} onClick={() => setLg(l.id)} className="league-pill zb" style={{ background: lg === l.id ? 'rgba(245,197,66,.1)' : 'rgba(255,255,255,.03)',color: lg === l.id ? 'var(--gold)' : 'var(--text-muted)',border: `1px solid ${lg === l.id ? 'rgba(245,197,66,.2)' : 'var(--border)'}` }}>
                    {l.logo && <img src={l.logo} alt="" style={{ width:16,height:16,borderRadius:3,objectFit:'contain' }} />}
                    {l.name} ({l.n})
                  </button>
                ))}
              </div>
            )}

            {shown.length === 0 ? (
              <div className="empty-state">
                <Monitor size={32} style={{ color:'var(--text-muted)',marginBottom:12 }} />
                <p style={{ color:'var(--text-muted)',fontWeight:700,margin:'0 0 6px' }}>No fixtures</p>
                <p style={{ color:'var(--text-muted)',fontWeight:600,margin:0,fontSize:'.85rem' }}>Refresh or try another day</p>
              </div>
            ) : (
              shown.map((m, i) => renderMatchRow(m, i, 'matches'))
            )}
          </div>
        )}

        {/* ═══════ RESULTS TAB ═══════ */}
        {tab === 'results' && (
          <div className="ae">
            {publishState === 'published' ? (
              <>
                {/* Results summary */}
                <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:8,marginBottom:20 }}>
                  <div className="stat-mini"><div className="num" style={{ color:'var(--accent)' }}>{publishedResults.exact}</div><div className="lbl">Exact</div></div>
                  <div className="stat-mini"><div className="num" style={{ color:'var(--gold)' }}>{publishedResults.result}</div><div className="lbl">Result</div></div>
                  <div className="stat-mini"><div className="num" style={{ color:'#ef4444' }}>{publishedResults.miss}</div><div className="lbl">Miss</div></div>
                  <div className="stat-mini"><div className="num" style={{ color:'var(--text-muted)' }}>{publishedResults.pending}</div><div className="lbl">Pending</div></div>
                </div>
                <div style={{ fontSize:'.82rem',fontWeight:700,color:'var(--text-muted)',marginBottom:12 }}>
                  Published {formatTimeAgo(publishedAt)} · {publishedResults.total} picks
                </div>
                {publishedPicks.matches.map((p, i) => renderPubResult(p, i))}
              </>
            ) : (
              <div className="empty-state">
                <Trophy size={32} style={{ color:'var(--text-muted)',marginBottom:12 }} />
                <p style={{ color:'var(--text-muted)',fontWeight:700,margin:'0 0 6px' }}>No published picks for {day}</p>
                <p style={{ color:'var(--text-muted)',fontWeight:600,margin:0,fontSize:'.85rem' }}>Go to Zoka Picks tab to create & publish</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════ STAFF TAB ═══════ */}
        {tab === 'staff' && renderStaffTab()}

        {/* ═══════ USERS TAB ═══════ */}
        {tab === 'users' && renderUsersTab()}

        {/* Last update */}
        {lastUpdate && (
          <div style={{ marginTop:24,textAlign:'center',fontSize:'.78rem',fontWeight:600,color:'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'center',gap:6 }}>
            <Clock size={12} /> Last update: {formatTimeAgo(lastUpdate)}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}