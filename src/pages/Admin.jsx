// FILE: src/pages/Admin.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ShieldAlert, RefreshCw, Trash2, CheckCircle2, XCircle, Zap, Trophy, Target,
  CalendarDays, BarChart3, Eye, EyeOff, Crown, Pencil, Check, Radio,
  AlertTriangle, Loader, Plus, ChevronDown, Send, Globe, CircleDot,
  ArrowUpToLine, Unplug, Clock, TrendingUp, Star, Sparkles, X,
  Rocket, Monitor, Save, Ban, RadioTower, BadgeCheck, Database,
  ArrowRight, Timer, Hash, Users, UserCog, Search, Mail, Shield,
  ChevronRight, LayoutDashboard, StarOff, Copy, CheckCheck, FolderOpen,
  UserPlus, UserMinus, ToggleLeft, ToggleRight, Info, Filter, SortAsc
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import {
  collection, query, where, onSnapshot, doc, setDoc, deleteDoc,
  updateDoc, writeBatch, serverTimestamp, getDoc, getDocs, orderBy, limit
} from 'firebase/firestore';
import { fetchFixtures, subscribeToTodayFixtures } from '../utils/api';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().split('T')[0];
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};
  
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
  { key: 'matches', label: 'Matches', icon: RadioTower },
  { key: 'results', label: 'Results', icon: Trophy },
  { key: 'staff', label: 'Staff', icon: UserCog },
  { key: 'users', label: 'Users', icon: Users },
];

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
  if (document.getElementById('adm-pro-v16')) return;
  const s = document.createElement('style');
  s.id = 'adm-pro-v16';
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
    .ae{animation:afu .45s cubic-bezier(.22,1,.36,1) both}
    .fl{animation:afl 2s ease-out}
    .si{animation:slide-in .35s cubic-bezier(.22,1,.36,1) both}
    .pi-pop{animation:pop-in .3s cubic-bezier(.22,1,.36,1) both}
    .score-pop{animation:score-pop .35s ease-out}
    .save-flash{animation:save-flash 1.2s ease-out}
    .fade-in{animation:fade-in .3s ease-out}
    .count-up{animation:count-up .4s cubic-bezier(.22,1,.36,1) both}
    .zb{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none}
    .zb:hover{transform:translateY(-1px);filter:brightness(1.08)}
    .zb:active{transform:translateY(0) scale(.98);filter:brightness(.95)}
    .zb:disabled{opacity:.35;pointer-events:none;filter:none;transform:none}
    .sh::-webkit-scrollbar{display:none}.sh{scrollbar-width:none}
    .sk{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite}
    .live-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse-live 1.2s ease-in-out infinite}
    .toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:.82rem;font-weight:600;z-index:9999;animation:slide-in .3s ease-out;box-shadow:0 8px 30px rgba(0,0,0,.4);display:flex;align-items:center;gap:8px;max-width:380px}
    .zoka-row{background:linear-gradient(90deg,rgba(245,197,66,.05) 0%,rgba(245,197,66,.015) 100%)!important;border-color:rgba(245,197,66,.3)!important}
    .match-live-border{animation:live-border-glow 2s ease-in-out infinite}
    .result-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:.68rem;font-weight:800;letter-spacing:.02em;font-family:var(--font-display,monospace);white-space:nowrap}
    .pi{width:48px;padding:7px 4px;border-radius:8px;background:var(--bg-surface);border:1.5px solid rgba(245,197,66,.2);color:var(--gold);text-align:center;font-weight:800;font-size:1rem;outline:none;font-variant-numeric:tabular-nums;transition:border-color .2s,box-shadow .2s}
    .pi:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(245,197,66,.15)}
    .pi::placeholder{color:var(--text-muted);opacity:.3;font-weight:600}
    .pi.has-val{border-color:var(--gold);background:rgba(245,197,66,.05)}
    .tab-btn{position:relative;display:flex;align-items:center;gap:7px;padding:12px 20px;font-weight:700;font-size:.8rem;color:var(--text-muted);background:transparent;border:none;cursor:pointer;transition:color .2s,background .2s;border-radius:10px 10px 0 0;white-space:nowrap}
    .tab-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.02)}
    .tab-btn.active{color:var(--gold);background:rgba(245,197,66,.06)}
    .tab-btn.active::after{content:'';position:absolute;bottom:0;left:16px;right:16px;height:2.5px;background:var(--gold);border-radius:2px 2px 0 0;animation:tab-indicator .25s ease-out}
    .section-card{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:16px}
    .section-title{font-size:.92rem;font-weight:800;color:var(--text-primary);margin:0 0 14px;display:flex;align-items:center;gap:8px}
    .stat-mini{display:flex;flex-direction:column;align-items:center;padding:12px 8px;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;min-width:80px}
    .stat-mini .num{font-size:1.3rem;font-weight:900;font-family:var(--font-display);line-height:1}
    .stat-mini .lbl{font-size:.58rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:4px}
    .staff-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-surface);margin-bottom:8px;transition:background .15s}
    .staff-row:hover{background:rgba(255,255,255,.03)}
    .user-row{display:grid;grid-template-columns:2fr 1.5fr 1fr 1fr 80px;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;border:1px solid var(--border);background:var(--bg-surface);margin-bottom:6px;font-size:.8rem;transition:background .15s}
    .user-row:hover{background:rgba(255,255,255,.03)}
    .user-header{color:var(--text-muted);font-weight:700;font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;background:transparent;border-bottom:1px solid var(--border);border-radius:8px 8px 0 0;margin-bottom:8px}
    .user-header:hover{background:transparent}
    .input-field{padding:8px 12px;border-radius:8px;background:var(--bg-surface);border:1.5px solid var(--border);color:var(--text-primary);font-size:.82rem;font-weight:600;outline:none;transition:border-color .2s,box-shadow .2s;width:100%}
    .input-field:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(245,197,66,.1)}
    .input-field::placeholder{color:var(--text-muted);opacity:.5}
    .btn-primary{padding:10px 20px;border-radius:10px;font-size:.82rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:all .18s}
    .btn-primary:hover{transform:translateY(-1px);filter:brightness(1.08)}
    .btn-primary:active{transform:translateY(0) scale(.98)}
    .btn-primary:disabled{opacity:.35;pointer-events:none;filter:none;transform:none}
    .btn-ghost{padding:8px 14px;border-radius:8px;font-size:.78rem;font-weight:700;background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-primary);cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
    .btn-ghost:hover{background:rgba(255,255,255,.06);transform:translateY(-1px)}
    .btn-ghost:active{transform:translateY(0) scale(.98)}
    .btn-ghost:disabled{opacity:.35;pointer-events:none;transform:none}
    .btn-danger{padding:6px 12px;border-radius:6px;font-size:.7rem;font-weight:700;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.15);color:#ef4444;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all .15s}
    .btn-danger:hover{background:rgba(239,68,68,.15);transform:translateY(-1px)}
    .role-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
    .empty-state{padding:48px 24px;text-align:center;border:1px dashed var(--border);border-radius:14px;background:var(--bg-surface)}
    @media(max-width:768px){
      .user-row{grid-template-columns:1.5fr 1fr 1fr;gap:8px;padding:10px 12px}
      .user-row .hide-mobile{display:none}
      .stat-mini{min-width:60px;padding:10px 6px}
      .stat-mini .num{font-size:1.1rem}
    }
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   TOAST COMPONENT
   ═══════════════════════════════════════════════════════════════ */
function Toast({ message, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  const cfg = {
    success: { bg: 'rgba(0,230,118,.15)', border: 'rgba(0,230,118,.3)', color: 'var(--accent)', Icon: CheckCircle2 },
    error: { bg: 'rgba(239,68,68,.15)', border: 'rgba(239,68,68,.3)', color: '#ef4444', Icon: XCircle },
    info: { bg: 'rgba(245,197,66,.15)', border: 'rgba(245,197,66,.3)', color: 'var(--gold)', Icon: AlertTriangle },
  }[type] || { bg: 'rgba(245,197,66,.15)', border: 'rgba(245,197,66,.3)', color: 'var(--gold)', Icon: AlertTriangle };

  return (
    <div className="toast" style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
      <cfg.Icon size={16} /> {message}
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
    <span className="result-badge" style={{ background: 'rgba(255,255,255,.04)', color: 'var(--text-muted)' }}>PENDING</span>
  );
  if (h === ph && a === pa) {
    return <span className="result-badge" style={{ background: 'rgba(0,230,118,.15)', color: 'var(--accent)', border: '1px solid rgba(0,230,118,.25)' }}><CheckCircle2 size={10} /> EXACT +3</span>;
  }
  const pR = h > a ? 'H' : h < a ? 'A' : 'D';
  const aR = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  if (pR === aR) {
    return <span className="result-badge" style={{ background: 'rgba(245,197,66,.12)', color: 'var(--gold)', border: '1px solid rgba(245,197,66,.2)' }}><TrendingUp size={10} /> RESULT +1</span>;
  }
  return <span className="result-badge" style={{ background: 'rgba(239,68,68,.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,.15)' }}><XCircle size={10} /> MISS</span>;
}

/* ═══════════════════════════════════════════════════════════════
   STYLE SHORTCUTS
   ═══════════════════════════════════════════════════════════════ */
const S = {
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 },
  tinyLabel: { fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' },
  smallVal: { fontSize: '.78rem', fontWeight: 700 },
  bigNum: { fontSize: '1.2rem', fontWeight: 900, fontFamily: 'var(--font-display)' },
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

  const [preds, setPreds] = useState([]);
  const [flashIds, setFlashIds] = useState([]);

  const [zokaSel, setZokaSel] = useState({});
  const [savingZoka, setSavingZoka] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [syncMsg, setSyncMsg] = useState('');

  const [publishState, setPublishState] = useState('checking');
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState(null);
  const [publishedPicks, setPublishedPicks] = useState(null);

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

  const predsRef = useRef([]);
  useEffect(() => { predsRef.current = preds; }, [preds]);

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
     LOAD FIXTURES
  ═══════════════════════════════════════════════════════════ */
  const loadFx = useCallback(async (d) => {
    setFxLoad(true);
    setFxErr(null);
    setDataSource('loading');
    try {
      const res = await fetchFixtures(d);
      const m = safeMatches(res);
      setDataSource('backend');
      setLastUpdate(new Date());
      if (m.length === 0) {
        if (res.error && res.error !== 'NO_DATA') setFxErr(res.error);
      } else {
        setFx(m);
      }
    } catch (e) {
      console.error('[Admin] Load error:', e);
      setFxErr('NETWORK');
      setDataSource('error');
      setFx([]);
    }
    setFxLoad(false);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     REAL-TIME FIXTURES
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToTodayFixtures(({ matches, error }) => {
      if (error) {
        console.warn('[Admin] Today fixtures error:', error);
        if (dataSource !== 'backend') setDataSource('error');
        return;
      }
      setFx(matches);
      setDataSource('backend');
      setLastUpdate(new Date());
      setFxLoad(false);

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
      if (updatedIds.length > 0) {
        batch.commit().then(() => {
          setFlashIds(updatedIds);
          setTimeout(() => setFlashIds([]), 2500);
          setSyncMsg(`Updated ${updatedIds.length} result${updatedIds.length > 1 ? 's' : ''}!`);
          showToast(`${updatedIds.length} result${updatedIds.length > 1 ? 's' : ''} auto-synced`, 'success');
          setTimeout(() => setSyncMsg(''), 5000);
        }).catch(e => console.warn('[Admin] Batch update failed:', e));
      }

      getDoc(doc(db, 'zoka_picks', date)).then(snap => {
        if (!snap.exists()) return;
        const zokaData = snap.data();
        let changed = false;
        const newMatches = (zokaData.matches || []).map(m => {
          const r = finishedMap.get(String(m.matchId));
          if (r && m.status !== 'finished') { changed = true; return { ...m, homeScore: r.h, awayScore: r.a, status: 'finished' }; }
          return m;
        });
        if (changed) {
          setDoc(doc(db, 'zoka_picks', date), { ...zokaData, matches: newMatches, updatedAt: serverTimestamp() }).catch(e => console.warn('[Admin] Zoka picks update failed:', e));
        }
      });
    });
    return () => unsub();
  }, [isAdmin, date, showToast, dataSource]);

  /* ═══════════════════════════════════════════════════════════
     LISTEN TO ACTIVE PREDICTIONS
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!isAdmin || !db) return;
    const q = query(collection(db, 'active_predictions'), where('matchDate', '==', date));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      setPreds(list);
    }, err => console.error('[Admin] Preds snapshot:', err));
    return () => unsub();
  }, [isAdmin, date]);

  /* ═══════════════════════════════════════════════════════════
     LISTEN TO PUBLISH STATE
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!isAdmin || !db) return;
    const unsub = onSnapshot(doc(db, 'zoka_picks', date), (snap) => {
      if (snap.exists()) {
        setPublishState('published');
        setPublishedAt(snap.data().publishedAt);
        setPublishedPicks(snap.data());
        // Pre-populate zokaSel from saved picks
        const sel = {};
        (snap.data().matches || []).forEach(m => {
          if (m.adminPick) {
            sel[String(m.matchId)] = { h: String(m.adminPick.home), a: String(m.adminPick.away) };
          }
        });
        setZokaSel(prev => {
          if (Object.keys(prev).length === 0) return sel;
          return prev;
        });
      } else {
        setPublishState('draft');
        setPublishedAt(null);
        setPublishedPicks(null);
      }
    }, () => { setPublishState('draft'); setPublishedPicks(null); });
    return () => unsub();
  }, [isAdmin, date]);

  /* ═══════════════════════════════════════════════════════════
     LISTEN TO STAFF
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!isAdmin || !db) return;
    const unsub = onSnapshot(collection(db, 'staff'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const order = { admin: 0, lead: 1, analyst: 2, writer: 3 };
        return (order[a.role] || 9) - (order[b.role] || 9);
      });
      setStaffList(list);
      setStaffLoad(false);
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
    const matches = publishedPicks.matches;
    let exact = 0, result = 0, miss = 0, pending = 0;
    matches.forEach(pick => {
      if (pick.status !== 'finished' || pick.homeScore == null) { pending++; return; }
      const h = pick.adminPick?.home, a = pick.adminPick?.away;
      const ph = pick.homeScore, pa = pick.awayScore;
      if (h === ph && a === pa) { exact++; return; }
      const pR = h > a ? 'H' : h < a ? 'A' : 'D';
      const aR = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
      if (pR === aR) { result++; return; }
      miss++;
    });
    return { total: matches.length, exact, result, miss, pending };
  }, [publishedPicks, tick]);

  const finCnt = preds.filter(p => p.status === 'finished').length;
  const hasLive = fx.some(m => m.isLive);
  const liveCount = fx.filter(m => m.isLive).length;
  const finishedFxCount = fx.filter(m => m.isFinished).finishedFxCount;

  const leagues = useMemo(() => {
    const m = new Map();
    fx.forEach(f => {
      const id = f.league && f.league.id ? String(f.league.id) : 'x';
      if (!m.has(id)) {
        m.set(id, { id, name: f.league?.name || 'Other', logo: f.league?.emblem || f.league?.logo || null, n: 0 });
      }
      m.get(id).n++;
    });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [fx]);

  const shown = useMemo(() => {
    if (lg === 'all') return fx;
    return fx.filter(f => f.league && String(f.league.id) === lg);
  }, [fx, lg]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    let list = usersList;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      list = list.filter(u =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.uid || '').toLowerCase().includes(q)
      );
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
      showToast(`Featured: ${match.homeTeam?.name || 'match'}`, 'success');
    } catch { showToast('Failed to add match', 'error'); }
  };

  const removePred = async (pred) => {
    if (!db) return;
    await deleteDoc(doc(db, 'active_predictions', pred.id));
    showToast('Removed from featured', 'info');
  };

  const toggleZokaPick = (match) => {
    const id = String(match.id);
    if (zokaIds.has(id)) {
      setZokaSel(prev => { const n = { ...prev }; delete n[id]; return n; });
      showToast('Removed from Zoka Picks', 'info');
    } else if (!zokaFull) {
      setZokaSel(prev => ({ ...prev, [id]: { h: '', a: '' } }));
      showToast('Pick selected — enter score', 'success');
    } else {
      showToast(`Max ${MAX_ZOKA} Zoka Picks`, 'error');
    }
  };

  const updateZokaScore = (matchId, field, value) => {
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, 2);
    setZokaSel(prev => ({ ...prev, [matchId]: { ...prev[matchId], [field]: cleaned } }));
  };

  /* ═══ SAVE ZOKA PICKS TO FIRESTORE ═══ */
  const saveZokaPicks = async () => {
    if (!db || zokaCount === 0) return;
    setSavingZoka(true);
    try {
      if (zokaPicksForPublish.length === 0) {
        // Save partial picks (unscored) as draft
        const draftPicks = [];
        for (const [matchId, scores] of Object.entries(zokaSel)) {
          const match = fx.find(m => String(m.id) === matchId);
          if (match) {
            draftPicks.push({
              matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
              homeLogo: match.homeLogo || null, awayLogo: match.awayLogo || null,
              league: match.league, kickoff: match.kickoff,
              adminPick: scores.h !== '' && scores.a !== '' ? { home: Number(scores.h), away: Number(scores.a) } : null,
              homeScore: match.isFinished ? match.homeScore : null,
              awayScore: match.isFinished ? match.awayScore : null,
              status: match.isFinished ? 'finished' : 'upcoming',
            });
          }
        }
        await setDoc(doc(db, 'zoka_picks', date), {
          matches: draftPicks, publishedAt: serverTimestamp(), date,
          totalMatches: draftPicks.length, isDraft: true,
        });
      } else {
        await setDoc(doc(db, 'zoka_picks', date), {
          matches: zokaPicksForPublish, publishedAt: serverTimestamp(), date,
          totalMatches: zokaPicksForPublish.length, isDraft: false,
        });
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      showToast(`Saved ${zokaCount} Zoka Pick${zokaCount > 1 ? 's' : ''} to Firestore`, 'success');
    } catch (e) {
      console.error('[Admin] Save failed:', e);
      showToast('Save failed — check console', 'error');
    }
    setSavingZoka(false);
  };

  const publishZokaPicks = async () => {
    if (!db || !zokaReady) return;
    setPublishing(true);
    try {
      if (zokaPicksForPublish.length === 0) { showToast('No valid picks', 'error'); setPublishing(false); return; }
      await setDoc(doc(db, 'zoka_picks', date), {
        matches: zokaPicksForPublish, publishedAt: serverTimestamp(), date,
        totalMatches: zokaPicksForPublish.length, isDraft: false,
      });
      showToast(`PUBLISHED ${zokaPicksForPublish.length} Zoka Picks!`, 'success');
    } catch (e) { console.error('[Admin] Publish failed:', e); showToast('Publish failed', 'error'); }
    setPublishing(false);
  };

  const unpublishZokaPicks = async () => {
    if (!db) return;
    setPublishing(true);
    try { await deleteDoc(doc(db, 'zoka_picks', date)); showToast('Zoka Picks unpublished', 'info'); }
    catch { showToast('Unpublish failed', 'error'); }
    setPublishing(false);
  };

  /* ═══ STAFF HANDLERS ═══ */
  const addStaff = async () => {
    if (!db || !newStaffName.trim()) return;
    try {
      await setDoc(doc(db, 'staff', newStaffName.trim().toLowerCase().replace(/\s+/g, '_')), {
        name: newStaffName.trim(),
        role: newStaffRole,
        bio: '',
        avatar: null,
        active: true,
        createdAt: serverTimestamp(),
      });
      setNewStaffName('');
      setNewStaffRole('analyst');
      setShowAddStaff(false);
      showToast('Staff member added', 'success');
    } catch { showToast('Failed to add staff', 'error'); }
  };

  const updateStaff = async (id, data) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'staff', id), { ...data, updatedAt: serverTimestamp() });
      showToast('Staff updated', 'success');
    } catch { showToast('Update failed', 'error'); }
  };

  const deleteStaff = async (id) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'staff', id));
      showToast('Staff removed', 'info');
    } catch { showToast('Delete failed', 'error'); }
  };

  /* ═══ USERS HANDLERS ═══ */
  const loadUsers = async () => {
    setUsersLoad(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ta = a.createdAt?.seconds || 0;
        const tb = b.createdAt?.seconds || 0;
        return tb - ta;
      });
      setUsersList(list);
      setUsersLoaded(true);
      showToast(`Loaded ${list.length} registered users`, 'success');
    } catch (e) {
      console.error('[Admin] Load users error:', e);
      showToast('Failed to load users', 'error');
    }
    setUsersLoad(false);
  };

  const updateUserRole = async (uid, newRole) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole, updatedAt: serverTimestamp() });
      showToast(`Role updated to ${newRole}`, 'success');
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
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

const formatDate = (dt) => {
  if (!dt) return '—';
  const ts = toMs(dt);
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

  /* ═══════════════════════════════════════════════════════════
     AUTH GUARD
  ═══════════════════════════════════════════════════════════ */
  if (authLoad) return null;
  if (!isAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', padding: 48, ...S.card }}>
          <ShieldAlert size={48} style={{ color: '#ef4444', marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Access Denied</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Admin only.</p>
        </div>
      </div>
    );
  }
  
  
  /* ═══════════════════════════════════════════════════════════
     ZOKA PICKS TAB
  ═══════════════════════════════════════════════════════════ */
  const renderZokaTab = () => (
    <div className="ae">
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 20 }}>
        <div className="stat-mini">
          <span className="num count-up" style={{ color: 'var(--gold)' }}>{zokaCount}</span>
          <span className="lbl">Selected</span>
        </div>
        <div className="stat-mini">
          <span className="num count-up" style={{ color: zokaScored === zokaCount && zokaCount > 0 ? 'var(--accent)' : '#f59e0b', animationDelay: '.1s' }}>{zokaScored}</span>
          <span className="lbl">Scored</span>
        </div>
        <div className="stat-mini">
          <span className="num count-up" style={{ color: publishState === 'published' ? 'var(--accent)' : 'var(--text-muted)', animationDelay: '.2s' }}>
            {publishState === 'published' ? 'LIVE' : '—'}
          </span>
          <span className="lbl">Status</span>
        </div>
        <div className="stat-mini">
          <span className="num count-up" style={{ color: 'var(--accent)', animationDelay: '.3s' }}>{publishedResults.exact}</span>
          <span className="lbl">Exact</span>
        </div>
        <div className="stat-mini">
          <span className="num count-up" style={{ color: 'var(--gold)', animationDelay: '.4s' }}>{publishedResults.result}</span>
          <span className="lbl">Result</span>
        </div>
        <div className="stat-mini">
          <span className="num count-up" style={{ color: '#ef4444', animationDelay: '.5s' }}>{publishedResults.miss}</span>
          <span className="lbl">Miss</span>
        </div>
      </div>

      {/* Action Bar */}
      <div className={`section-card ${savedFlash ? 'save-flash' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20, borderColor: 'rgba(245,197,66,.15)', background: 'linear-gradient(135deg, rgba(245,197,66,.04), transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={18} style={{ color: 'var(--gold)' }} />
          <div>
            <span style={{ fontWeight: 800, fontSize: '.88rem', color: 'var(--gold)' }}>Zoka Picks — {date}</span>
            {publishedAt && <span style={{ display: 'block', fontSize: '.66rem', color: 'var(--text-muted)' }}>Published {formatTimeAgo(publishedAt)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={saveZokaPicks}
            disabled={zokaCount === 0 || savingZoka}
            className="btn-primary"
            style={{ background: 'linear-gradient(135deg, #00e676, #00c853)', color: '#000', boxShadow: '0 4px 20px rgba(0,230,118,.25)' }}
          >
            {savingZoka ? <Loader size={15} style={{ animation: 'asp 1s linear infinite' }} /> : <Save size={15} />}
            {savingZoka ? 'Saving...' : 'Save to Firestore'}
          </button>
          {publishState === 'published' ? (
            <button onClick={unpublishZokaPicks} disabled={publishing} className="btn-ghost" style={{ borderColor: 'rgba(239,68,68,.2)', color: '#ef4444' }}>
              <EyeOff size={14} /> {publishing ? '...' : 'Unpublish'}
            </button>
          ) : (
            <button
              onClick={publishZokaPicks}
              disabled={!zokaReady || publishing}
              className="btn-primary"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', boxShadow: '0 4px 20px rgba(245,197,66,.25)' }}
            >
              {publishing ? <Loader size={15} style={{ animation: 'asp 1s linear infinite' }} /> : <Rocket size={15} />}
              {publishing ? 'Publishing...' : 'Publish Live'}
            </button>
          )}
        </div>
      </div>

      {/* Published Picks Results */}
      {publishState === 'published' && publishedPicks?.matches && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <h3 className="section-title"><Trophy size={16} style={{ color: 'var(--gold)' }} /> Published Picks Results</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {publishedPicks.matches.map((pick, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)'
              }}>
                <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--text-muted)', width: 18, textAlign: 'center', fontFamily: 'var(--font-display)' }}>{i + 1}</span>
                {pick.homeLogo && <img src={pick.homeLogo} alt="" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'contain' }} />}
                <span style={{ flex: 1, fontSize: '.76rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.homeTeam?.name}</span>
                <span style={{ fontSize: '.88rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--gold)', background: 'rgba(245,197,66,.08)', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(245,197,66,.15)', fontVariantNumeric: 'tabular-nums' }}>
                  {pick.adminPick?.home ?? '?'} - {pick.adminPick?.away ?? '?'}
                </span>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
                  {pick.homeScore != null ? `${pick.homeScore} - ${pick.awayScore}` : '–'}
                </span>
                <span style={{ flex: 1, fontSize: '.76rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{pick.awayTeam?.name}</span>
                {pick.awayLogo && <img src={pick.awayLogo} alt="" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'contain' }} />}
                <div style={{ width: 90, textAlign: 'right' }}><ResultBadge pick={pick} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zoka Selection */}
      <div className="section-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            <Star size={16} style={{ color: 'var(--gold)' }} /> Select Matches & Predict
            <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 8 }}>
              {zokaCount}/{MAX_ZOKA} picks
            </span>
          </h3>
          {zokaScored < zokaCount && zokaCount > 0 && (
            <span style={{ fontSize: '.72rem', color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={12} /> {zokaCount - zokaScored} score{zokaCount - zokaScored !== 1 ? 's' : ''} missing
            </span>
          )}
        </div>

        {/* League filter */}
        {leagues.length > 1 && (
          <div className="ae sh" style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
            <button onClick={() => setLg('all')} className="zb" style={{ padding: '5px 12px', borderRadius: 8, fontSize: '.7rem', fontWeight: 700, border: 'none', background: lg === 'all' ? 'rgba(245,197,66,.12)' : 'rgba(255,255,255,.04)', color: lg === 'all' ? 'var(--gold)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              All ({fx.length})
            </button>
            {leagues.map(l => (
              <button key={l.id} onClick={() => setLg(l.id)} className="zb" style={{ padding: '5px 12px', borderRadius: 8, fontSize: '.7rem', fontWeight: 700, border: 'none', background: lg === l.id ? 'rgba(245,197,66,.12)' : 'rgba(255,255,255,.04)', color: lg === l.id ? 'var(--gold)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                {l.logo && <img src={l.logo} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} />}
                {l.name} ({l.n})
              </button>
            ))}
          </div>
        )}

        {fxLoad && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="sk" style={{ height: 72, borderRadius: 10 }} />)}
          </div>
        )}

        {fxErr && !fxLoad && (
          <div className="empty-state">
            <AlertTriangle size={32} style={{ color: '#f59e0b', marginBottom: 10 }} />
            <p style={{ color: 'var(--text-primary)', fontWeight: 700, margin: '0 0 6px' }}>No fixtures found</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: '0 0 16px' }}>Backend hasn't written data for this date yet.</p>
            <button onClick={handleRefresh} className="btn-ghost"><RefreshCw size={14} /> Retry</button>
          </div>
        )}

        {!fxErr && !fxLoad && shown.length === 0 && (
          <div className="empty-state">
            <CalendarDays size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
            <p style={{ color: 'var(--text-primary)', fontWeight: 700, margin: '0 0 6px' }}>No matches scheduled</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: 0 }}>No fixtures for this date.</p>
          </div>
        )}

        {!fxLoad && shown.length > 0 && shown.map((match, i) => {
          const isZoka = zokaIds.has(String(match.id));
          const isFlash = flashIds.includes(match.id);
          const st = ST[match.status] || ST.NS;
          const matchIsLive = match.isLive;
          const zokaScores = zokaSel[match.id];

          return (
            <div
              key={match.id}
              className={`${isFlash ? 'fl' : 'ae'} ${matchIsLive ? 'match-live-border' : ''} ${isZoka ? 'zoka-row' : ''}`}
              style={{
                padding: '14px 16px', background: 'var(--bg-card)',
                border: `1px solid ${isZoka ? 'rgba(245,197,66,.3)' : 'var(--border)'}`,
                borderRadius: 10, marginBottom: 6, animationDelay: `${i * 25}ms`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {matchIsLive && <span className="live-dot" />}
                  <span style={{ fontSize: '.66rem', fontWeight: 700, color: st.c, background: st.b, padding: '2px 8px', borderRadius: 4 }}>{st.l || match.status}</span>
                  {match.league?.logo && <img src={match.league.logo} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} />}
                  <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>{match.league?.name}</span>
                </div>
                <button
                  onClick={() => toggleZokaPick(match)}
                  className="zb"
                  style={{
                    padding: '5px 12px', borderRadius: 7, fontSize: '.68rem', fontWeight: 800,
                    background: isZoka ? 'rgba(245,197,66,.15)' : 'rgba(245,197,66,.04)',
                    border: `1.5px solid ${isZoka ? 'rgba(245,197,66,.35)' : 'rgba(245,197,66,.12)'}`,
                    color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 5
                  }}
                >
                  {isZoka ? <StarOff size={11} /> : <Star size={11} />}
                  {isZoka ? 'Remove' : 'Zoka Pick'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {match.homeLogo && <img src={match.homeLogo} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />}
                  <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.homeTeam?.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span className={isFlash ? 'score-pop' : ''} style={{ fontSize: '1.2rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: matchIsLive ? '#ef4444' : 'var(--text-primary)', minWidth: 20, textAlign: 'center' }}>
                    {match.homeScore ?? '-'}
                  </span>
                  <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>:</span>
                  <span className={isFlash ? 'score-pop' : ''} style={{ fontSize: '1.2rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: matchIsLive ? '#ef4444' : 'var(--text-primary)', minWidth: 20, textAlign: 'center' }}>
                    {match.awayScore ?? '-'}
                  </span>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 0 }}>
                  <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.awayTeam?.name}</span>
                  {match.awayLogo && <img src={match.awayLogo} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />}
                </div>
              </div>

              {isZoka && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 14px', background: 'rgba(245,197,66,.05)', borderRadius: 8, border: '1px solid rgba(245,197,66,.12)' }}>
                  <Star size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                  <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>Predict:</span>
                  <input
                    type="text" inputMode="numeric"
                    className={`pi ${zokaScores?.h ? 'has-val' : ''}`}
                    placeholder="H" value={zokaScores?.h || ''}
                    onChange={e => updateZokaScore(String(match.id), 'h', e.target.value)}
                    maxLength={2} aria-label="Home score prediction"
                  />
                  <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>—</span>
                  <input
                    type="text" inputMode="numeric"
                    className={`pi ${zokaScores?.a ? 'has-val' : ''}`}
                    placeholder="A" value={zokaScores?.a || ''}
                    onChange={e => updateZokaScore(String(match.id), 'a', e.target.value)}
                    maxLength={2} aria-label="Away score prediction"
                  />
                  {zokaScores?.h && zokaScores?.a && (
                    <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <CheckCircle2 size={11} /> Ready
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     MATCHES TAB
  ═══════════════════════════════════════════════════════════ */
  const renderMatchesTab = () => (
    <div className="ae">
      <div className="section-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h3 className="section-title" style={{ margin: 0 }}>
          <RadioTower size={16} style={{ color: '#60a5fa' }} /> Featured Matches
          <span style={{ fontSize: '.72rem', fontWeight: 600, color: isFull ? '#ef4444' : 'var(--accent)', marginLeft: 8 }}>
            {preds.length}/{MAX_FEATURED}
          </span>
        </h3>
        <button onClick={handleRefresh} disabled={refreshing} className="btn-ghost" style={{ borderColor: 'rgba(59,130,246,.2)', color: '#60a5fa' }}>
          <RefreshCw size={14} style={{ animation: refreshing ? 'asp 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {leagues.length > 1 && (
        <div className="ae sh" style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
          <button onClick={() => setLg('all')} className="zb" style={{ padding: '5px 12px', borderRadius: 8, fontSize: '.7rem', fontWeight: 700, border: 'none', background: lg === 'all' ? 'rgba(59,130,246,.1)' : 'rgba(255,255,255,.04)', color: lg === 'all' ? '#60a5fa' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            All ({fx.length})
          </button>
          {leagues.map(l => (
            <button key={l.id} onClick={() => setLg(l.id)} className="zb" style={{ padding: '5px 12px', borderRadius: 8, fontSize: '.7rem', fontWeight: 700, border: 'none', background: lg === l.id ? 'rgba(59,130,246,.1)' : 'rgba(255,255,255,.04)', color: lg === l.id ? '#60a5fa' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              {l.logo && <img src={l.logo} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} />}
              {l.name} ({l.n})
            </button>
          ))}
        </div>
      )}

      {fxLoad && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="sk" style={{ height: 72, borderRadius: 10 }} />)}
        </div>
      )}

      {!fxLoad && shown.map((match, i) => {
        const isPred = predMap.has(String(match.id));
        const pred = predMap.get(String(match.id));
        const isFlash = flashIds.includes(match.id);
        const st = ST[match.status] || ST.NS;
        const matchIsLive = match.isLive;

        return (
          <div key={match.id} className={`${isFlash ? 'fl' : 'ae'} ${matchIsLive ? 'match-live-border' : ''}`} style={{
            padding: '14px 16px', background: 'var(--bg-card)',
            border: `1px solid ${isPred ? 'rgba(59,130,246,.2)' : 'var(--border)'}`,
            borderRadius: 10, marginBottom: 6, animationDelay: `${i * 25}ms`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {matchIsLive && <span className="live-dot" />}
                <span style={{ fontSize: '.66rem', fontWeight: 700, color: st.c, background: st.b, padding: '2px 8px', borderRadius: 4 }}>{st.l || match.status}</span>
                {match.league?.logo && <img src={match.league.logo} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} />}
                <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>{match.league?.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {!isPred && (
                  <button onClick={() => handleAdd(match)} disabled={isFull} className="zb" style={{ padding: '5px 12px', borderRadius: 7, fontSize: '.68rem', fontWeight: 800, background: isFull ? 'rgba(255,255,255,.02)' : 'rgba(59,130,246,.08)', border: `1.5px solid ${isFull ? 'var(--border)' : 'rgba(59,130,246,.2)'}`, color: isFull ? 'var(--text-muted)' : '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={10} /> Feature
                  </button>
                )}
                {isPred && (
                  <button onClick={() => removePred(pred)} className="zb" style={{ padding: '5px 12px', borderRadius: 7, fontSize: '.68rem', fontWeight: 800, background: 'rgba(59,130,246,.12)', border: '1.5px solid rgba(59,130,246,.25)', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Trash2 size={10} /> Featured
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {match.homeLogo && <img src={match.homeLogo} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />}
                <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.homeTeam?.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span className={isFlash ? 'score-pop' : ''} style={{ fontSize: '1.2rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: matchIsLive ? '#ef4444' : 'var(--text-primary)', minWidth: 20, textAlign: 'center' }}>{match.homeScore ?? '-'}</span>
                <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>:</span>
                <span className={isFlash ? 'score-pop' : ''} style={{ fontSize: '1.2rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: matchIsLive ? '#ef4444' : 'var(--text-primary)', minWidth: 20, textAlign: 'center' }}>{match.awayScore ?? '-'}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 0 }}>
                <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.awayTeam?.name}</span>
                {match.awayLogo && <img src={match.awayLogo} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     RESULTS TAB
  ═══════════════════════════════════════════════════════════ */
  const renderResultsTab = () => (
    <div className="ae">
      <div className="section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div className="stat-mini">
            <span className="num" style={{ color: 'var(--text-primary)' }}>{preds.length}</span>
            <span className="lbl">Featured</span>
          </div>
          <div className="stat-mini">
            <span className="num" style={{ color: 'var(--accent)' }}>{finCnt}</span>
            <span className="lbl">Finished</span>
          </div>
          <div className="stat-mini">
            <span className="num" style={{ color: '#f59e0b' }}>{preds.length - finCnt}</span>
            <span className="lbl">Pending</span>
          </div>
        </div>
        {syncMsg && (
          <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(0,230,118,.08)', border: '1px solid rgba(0,230,118,.15)', fontSize: '.78rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCheck size={14} /> {syncMsg}
          </div>
        )}
      </div>

      {preds.length === 0 ? (
        <div className="empty-state">
          <Target size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
          <p style={{ color: 'var(--text-primary)', fontWeight: 700, margin: '0 0 6px' }}>No featured matches yet</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: 0 }}>Go to Matches tab to feature matches.</p>
        </div>
      ) : (
        preds.map((pred, i) => {
          const st = ST[pred.status] || ST.NS;
          return (
            <div key={pred.id} className="ae" style={{
              padding: '14px 16px', background: 'var(--bg-card)',
              border: `1px solid ${pred.status === 'finished' ? 'rgba(0,230,118,.15)' : 'var(--border)'}`,
              borderRadius: 10, marginBottom: 6, animationDelay: `${i * 25}ms`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '.66rem', fontWeight: 700, color: st.c, background: st.b, padding: '2px 8px', borderRadius: 4 }}>{st.l || pred.status}</span>
                  {pred.league?.logo && <img src={pred.league.logo} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} />}
                  <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>{pred.league?.name}</span>
                </div>
                <button onClick={() => removePred(pred)} className="btn-danger"><Trash2 size={10} /> Remove</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {pred.homeLogo && <img src={pred.homeLogo} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }} />}
                  <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{pred.homeTeam?.name}</span>
                </div>
                <span style={{ fontSize: '1.15rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: pred.status === 'finished' ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {pred.homeScore ?? '-'} : {pred.awayScore ?? '-'}
                </span>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 0 }}>
                  <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{pred.awayTeam?.name}</span>
                  {pred.awayLogo && <img src={pred.awayLogo} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }} />}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     STAFF TAB
  ═══════════════════════════════════════════════════════════ */
  const renderStaffTab = () => {
    const ROLE_COLORS = {
      admin: { bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.25)', color: '#ef4444' },
      lead: { bg: 'rgba(245,197,66,.12)', border: 'rgba(245,197,66,.25)', color: 'var(--gold)' },
      analyst: { bg: 'rgba(59,130,246,.12)', border: 'rgba(59,130,246,.25)', color: '#60a5fa' },
      writer: { bg: 'rgba(0,230,118,.12)', border: 'rgba(0,230,118,.25)', color: 'var(--accent)' },
    };
    const ROLES = ['admin', 'lead', 'analyst', 'writer'];

    return (
      <div className="ae">
        <div className="section-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              <UserCog size={16} style={{ color: '#60a5fa' }} /> Staff Members
              <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 8 }}>{staffList.length} total</span>
            </h3>
            <button onClick={() => setShowAddStaff(!showAddStaff)} className="btn-primary" style={{ background: 'linear-gradient(135deg, #60a5fa, #3b82f6)', color: '#fff', fontSize: '.78rem', padding: '8px 16px' }}>
              {showAddStaff ? <X size={14} /> : <UserPlus size={14} />}
              {showAddStaff ? 'Cancel' : 'Add Staff'}
            </button>
          </div>

          {/* Add Staff Form */}
          {showAddStaff && (
            <div className="pi-pop" style={{ padding: 16, marginBottom: 16, borderRadius: 10, background: 'rgba(59,130,246,.04)', border: '1.5px solid rgba(59,130,246,.15)' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '2 1 200px' }}>
                  <label style={{ ...S.tinyLabel, display: 'block', marginBottom: 6 }}>Name</label>
                  <input
                    type="text" className="input-field" placeholder="Staff member name"
                    value={newStaffName} onChange={e => setNewStaffName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addStaff()}
                  />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ ...S.tinyLabel, display: 'block', marginBottom: 6 }}>Role</label>
                  <select
                    className="input-field" value={newStaffRole} onChange={e => setNewStaffRole(e.target.value)}
                    style={{ cursor: 'pointer' }}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <button onClick={addStaff} disabled={!newStaffName.trim()} className="btn-primary" style={{ background: 'linear-gradient(135deg, #00e676, #00c853)', color: '#000', padding: '8px 20px' }}>
                  <Check size={14} /> Add
                </button>
              </div>
            </div>
          )}

          {staffLoad ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="sk" style={{ height: 60, borderRadius: 10 }} />)}
            </div>
          ) : staffList.length === 0 ? (
            <div className="empty-state">
              <UserCog size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
              <p style={{ color: 'var(--text-primary)', fontWeight: 700, margin: '0 0 6px' }}>No staff members</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: 0 }}>Click "Add Staff" to create one.</p>
            </div>
          ) : (
            staffList.map((member, i) => {
              const rc = ROLE_COLORS[member.role] || ROLE_COLORS.analyst;
              const isEditing = editingStaff === member.id;

              return (
                <div key={member.id} className="staff-row ae" style={{ animationDelay: `${i * 40}ms` }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: `linear-gradient(135deg, ${rc.bg}, transparent)`,
                    border: `1px solid ${rc.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.9rem', fontWeight: 900, color: rc.color
                  }}>
                    {(member.name || '?').charAt(0).toUpperCase()}
                  </div>

                  {isEditing ? (
                    <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="text" className="input-field" style={{ flex: '2 1 150px', padding: '6px 10px', fontSize: '.78rem' }}
                        defaultValue={member.name}
                        id={`staff-name-${member.id}`}
                        placeholder="Name"
                      />
                      <select
                        className="input-field" style={{ flex: '1 1 120px', padding: '6px 10px', fontSize: '.78rem', cursor: 'pointer' }}
                        defaultValue={member.role}
                        id={`staff-role-${member.id}`}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                      </select>
                      <input
                        type="text" className="input-field" style={{ flex: '2 1 200px', padding: '6px 10px', fontSize: '.78rem' }}
                        defaultValue={member.bio || ''}
                        id={`staff-bio-${member.id}`}
                        placeholder="Short bio"
                      />
                      <button
                        onClick={() => {
                          const name = document.getElementById(`staff-name-${member.id}`)?.value?.trim();
                          const role = document.getElementById(`staff-role-${member.id}`)?.value;
                          const bio = document.getElementById(`staff-bio-${member.id}`)?.value?.trim();
                          if (name) updateStaff(member.id, { name, role, bio });
                          setEditingStaff(null);
                        }}
                        className="zb" style={{ padding: '6px 12px', borderRadius: 6, fontSize: '.7rem', fontWeight: 800, background: 'rgba(0,230,118,.1)', border: '1px solid rgba(0,230,118,.2)', color: 'var(--accent)' }}
                      >
                        <Check size={12} /> Save
                      </button>
                      <button
                        onClick={() => setEditingStaff(null)}
                        className="zb" style={{ padding: '6px 10px', borderRadius: 6, fontSize: '.7rem', fontWeight: 700, background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{member.name}</div>
                        {member.bio && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.bio}</div>}
                      </div>
                      <span className="role-badge" style={{ background: rc.bg, border: `1px solid ${rc.border}`, color: rc.color }}>
                        {member.role?.toUpperCase() || 'ANALYST'}
                      </span>
                      {member.active === false && (
                        <span className="role-badge" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>INACTIVE</span>
                      )}
                      <button onClick={() => setEditingStaff(member.id)} className="zb" style={{ padding: '6px 10px', borderRadius: 6, fontSize: '.7rem', fontWeight: 700, background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.12)', color: '#60a5fa' }}>
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => {
                        if (confirm(`Remove ${member.name}?`)) deleteStaff(member.id);
                      }} className="btn-danger" style={{ padding: '6px 10px' }}>
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     USERS TAB
  ═══════════════════════════════════════════════════════════ */
  const renderUsersTab = () => (
    <div className="ae">
      <div className="section-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            <Users size={16} style={{ color: 'var(--accent)' }} /> Registered Users
            {usersLoaded && <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 8 }}>{usersList.length} total</span>}
          </h3>
          <button onClick={loadUsers} disabled={usersLoad} className="btn-primary" style={{ background: 'linear-gradient(135deg, #00e676, #00c853)', color: '#000', fontSize: '.78rem', padding: '8px 18px' }}>
            {usersLoad ? <Loader size={14} style={{ animation: 'asp 1s linear infinite' }} /> : <Database size={14} />}
            {usersLoad ? 'Loading...' : usersLoaded ? 'Refresh Users' : 'Load All Users'}
          </button>
        </div>

        {usersLoaded && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 200px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text" className="input-field" placeholder="Search by name, email, or UID..."
                value={userSearch} onChange={e => setUserSearch(e.target.value)}
                style={{ paddingLeft: 34 }}
              />
            </div>
            <select
              className="input-field" style={{ flex: '0 0 140px', cursor: 'pointer' }}
              value={userFilter} onChange={e => setUserFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              <option value="admin">Admins</option>
              <option value="user">Users</option>
            </select>
          </div>
        )}

        {!usersLoaded && !usersLoad && (
          <div className="empty-state">
            <Users size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
            <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '.95rem', margin: '0 0 8px' }}>Click "Load All Users" to fetch from Firebase</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: 0, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
              This reads all documents from the <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4, fontSize: '.76rem' }}>users</code> collection in Firestore.
            </p>
          </div>
        )}

        {usersLoad && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="sk" style={{ height: 56, borderRadius: 10 }} />)}
          </div>
        )}

        {usersLoaded && !usersLoad && filteredUsers.length === 0 && (
          <div className="empty-state" style={{ padding: '32px 20px' }}>
            <Search size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
            <p style={{ color: 'var(--text-primary)', fontWeight: 700, margin: '0 0 4px' }}>No users found</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: 0 }}>{userSearch ? 'Try a different search term.' : 'No users registered yet.'}</p>
          </div>
        )}

        {usersLoaded && !usersLoad && filteredUsers.length > 0 && (
          <>
            <div className="user-row user-header">
              <span>User</span>
              <span>Email</span>
              <span className="hide-mobile">Role</span>
              <span className="hide-mobile">Joined</span>
              <span>Actions</span>
            </div>
            {filteredUsers.map((user, i) => (
              <div key={user.id} className="user-row ae" style={{ animationDelay: `${i * 20}ms` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: user.role === 'admin' ? 'rgba(239,68,68,.12)' : 'rgba(0,230,118,.08)',
                    border: `1px solid ${user.role === 'admin' ? 'rgba(239,68,68,.2)' : 'rgba(0,230,118,.15)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.75rem', fontWeight: 800, color: user.role === 'admin' ? '#ef4444' : 'var(--accent)'
                  }}>
                    {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.displayName || 'Unnamed'}
                    </div>
                    <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.uid ? user.uid.slice(0, 12) + '...' : user.id.slice(0, 12) + '...'}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email || '—'}</span>
                <span className="hide-mobile">
                  <span className="role-badge" style={{
                    background: user.role === 'admin' ? 'rgba(239,68,68,.12)' : 'rgba(0,230,118,.08)',
                    border: `1px solid ${user.role === 'admin' ? 'rgba(239,68,68,.2)' : 'rgba(0,230,118,.15)'}`,
                    color: user.role === 'admin' ? '#ef4444' : 'var(--accent)'
                  }}>
                    {user.role === 'admin' && <Shield size={9} />}
                    {(user.role || 'user').toUpperCase()}
                  </span>
                </span>
                <span className="hide-mobile" style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>{formatDate(user.createdAt)}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => updateUserRole(user.id, user.role === 'admin' ? 'user' : 'admin')}
                    className="zb"
                    title={user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                    style={{
                      padding: '5px 8px', borderRadius: 6, fontSize: '.68rem', fontWeight: 700,
                      background: user.role === 'admin' ? 'rgba(245,158,11,.08)' : 'rgba(0,230,118,.08)',
                      border: `1px solid ${user.role === 'admin' ? 'rgba(245,158,11,.15)' : 'rgba(0,230,118,.15)'}`,
                      color: user.role === 'admin' ? '#f59e0b' : 'var(--accent)'
                    }}
                  >
                    {user.role === 'admin' ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </button>
                </div>
              </div>
            ))}
            <div style={{ padding: '10px 0', textAlign: 'center', fontSize: '.72rem', color: 'var(--text-muted)' }}>
              Showing {filteredUsers.length} of {usersList.length} users
            </div>
          </>
        )}
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     MAIN RENDER
  ═══════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px 140px' }}>

        {/* ═══ HEADER ═══ */}
        <div className="ae" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Zap size={24} style={{ color: 'var(--accent)' }} />
              Admin Panel
              {hasLive && <span className="live-dot" title="Live matches" />}
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '.82rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Database size={12} style={{ color: dataSource === 'backend' ? 'var(--accent)' : 'var(--text-muted)' }} />
                {dataSource === 'backend' ? 'Connected' : 'Idle'}
              </span>
              {hasLive && <span style={{ color: '#ef4444', fontWeight: 700 }}>· {liveCount} live</span>}
              {lastUpdate && dataSource === 'backend' && (
                <span style={{ opacity: .6 }}>· {formatTimeAgo(lastUpdate)}</span>
              )}
            </p>
          </div>
          <button onClick={() => navigate('/')} className="btn-ghost">
            <ArrowRight size={14} /> Back to Site
          </button>
        </div>

        {/* ═══ DAY SELECTOR ═══ */}
        <div className="ae" style={{ display: 'flex', ...S.card, overflow: 'hidden', marginBottom: 20, borderRadius: 12 }}>
          {[
            { key: 'today', label: 'Today', sub: todayStr() },
            { key: 'tomorrow', label: 'Tomorrow', sub: tomorrowStr() }
          ].map(d => (
            <button key={d.key} onClick={() => { setDay(d.key); setZokaSel({}); setLg('all'); }} className="zb" style={{
              flex: 1, padding: '14px 22px', border: 'none',
              background: day === d.key ? 'rgba(0,230,118,.08)' : 'transparent',
              color: day === d.key ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '.84rem', textAlign: 'center',
              display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 0
            }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <CalendarDays size={14} /> {d.label}
              </span>
              <span style={{ fontSize: '.66rem', fontWeight: 500, opacity: .7 }}>{d.sub}</span>
            </button>
          ))}
          {syncMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', fontSize: '.72rem', fontWeight: 600, color: 'var(--accent)' }}>
              <CheckCheck size={13} /> {syncMsg}
            </div>
          )}
        </div>

        {/* ═══ QUICK STATS BAR ═══ */}
        <div className="ae" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 20 }}>
          <div className="stat-mini">
            <span className="num" style={{ color: '#60a5fa' }}>{fx.length}</span>
            <span className="lbl">Fixtures</span>
          </div>
          <div className="stat-mini">
            <span className="num" style={{ color: '#ef4444' }}>{liveCount}</span>
            <span className="lbl">Live</span>
          </div>
          <div className="stat-mini">
            <span className="num" style={{ color: isFull ? '#ef4444' : '#60a5fa' }}>{preds.length}</span>
            <span className="lbl">Featured</span>
          </div>
          <div className="stat-mini">
            <span className="num" style={{ color: 'var(--gold)' }}>{zokaCount}</span>
            <span className="lbl">Zoka</span>
          </div>
          <div className="stat-mini">
            <span className="num" style={{ color: 'var(--accent)' }}>{finCnt}</span>
            <span className="lbl">Finished</span>
          </div>
          <div className="stat-mini">
            <span className="num" style={{ color: publishState === 'published' ? 'var(--gold)' : 'var(--text-muted)' }}>
              {publishState === 'published' ? 'ON' : 'OFF'}
            </span>
            <span className="lbl">Published</span>
          </div>
        </div>

        {/* ═══ TABS ═══ */}
        <div className="ae" style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid var(--border)', overflowX: 'auto' }} className="sh">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`tab-btn ${tab === t.key ? 'active' : ''}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* ═══ TAB CONTENT ═══ */}
        <div style={{ paddingTop: 20 }}>
          {tab === 'zoka' && renderZokaTab()}
          {tab === 'matches' && renderMatchesTab()}
          {tab === 'results' && renderResultsTab()}
          {tab === 'staff' && renderStaffTab()}
          {tab === 'users' && renderUsersTab()}
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}