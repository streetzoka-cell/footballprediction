// FILE: src/components/Navbar.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogOut, User, Shield, ChevronRight, Zap, ArrowLeft,
  Home, AlertTriangle, Search, Bell, Trophy, Star,
  Clock, ChevronDown, CheckCircle, CircleX, Target, Flame, CircleCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { db } from '../utils/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const ADMIN_PATH = '/zks-admin-8f9x2-control-panel';

/* ═══════════════════════════════════════════════════════════════
   KEYFRAMES + BREAKPOINTS
   ═══════════════════════════════════════════════════════════════ */
const injectBase = () => {
  if (document.getElementById('nv-base-v10')) return;
  const s = document.createElement('style');
  s.id = 'nv-base-v10';
  s.textContent = `
    @keyframes nvMarquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    @keyframes nvBannerShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes nvFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvSlideRight{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
    @keyframes nvDotBlink{0%,100%{opacity:1}50%{opacity:.2}}
    @keyframes nvDangerPulse{0%,100%{opacity:.5}50%{opacity:1}}
    @keyframes nvRingPulse{0%{box-shadow:0 0 0 0 rgba(0,230,118,.3)}70%{box-shadow:0 0 0 6px rgba(0,230,118,0)}100%{box-shadow:0 0 0 0 rgba(0,230,118,0)}}
    @keyframes nvShine{0%{left:-100%}100%{left:200%}}
    @keyframes nvLiveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.6)}}
    @keyframes nvPanelIn{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
    @keyframes nvGlowBreathe{0%,100%{box-shadow:0 0 8px rgba(0,230,118,.15)}50%{box-shadow:0 0 22px rgba(0,230,118,.3)}}
    @keyframes nvScoreGlow{0%,100%{text-shadow:0 0 10px rgba(0,230,118,.35),0 0 30px rgba(0,230,118,.1)}50%{text-shadow:0 0 20px rgba(0,230,118,.55),0 0 50px rgba(0,230,118,.2)}}
    @keyframes nvBellRing{0%,100%{transform:rotate(0)}15%{transform:rotate(14deg)}30%{transform:rotate(-12deg)}45%{transform:rotate(8deg)}60%{transform:rotate(-4deg)}75%{transform:rotate(0)}}
    @keyframes nvBadgePop{0%{transform:scale(0)}60%{transform:scale(1.2)}100%{transform:scale(1)}}
    @keyframes nvStreakFire{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
    @keyframes nvBorderGlow{0%,100%{border-color:rgba(0,230,118,.06)}50%{border-color:rgba(0,230,118,.14)}}
    @keyframes nvNotifSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvOverlayIn{from{opacity:0}to{opacity:1}}
    @keyframes nvMobSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
    @keyframes nvMobItemIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    @media(max-width:900px){.nv-dk{display:none!important}.nv-tg{display:flex!important}}
    @media(min-width:901px){.nv-tg{display:none!important}}
    @media(max-width:480px){.nv-bk-txt{display:none}.nv-bk-btn{padding:6px 9px}.nv-inn{padding:0 12px}.nv-pts-label{display:none}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().split('T')[0];

function calcPoints(predH, predA, actualH, actualA) {
  if (actualH == null || actualA == null) return { points: 0, type: 'pending' };
  if (predH === actualH && predA === actualA) return { points: 10, type: 'exact' };
  const pR = predH > predA ? 'H' : predH < predA ? 'A' : 'D';
  const aR = actualH > actualA ? 'H' : actualH < actualA ? 'A' : 'D';
  if (pR === aR) return { points: 3, type: 'result' };
  return { points: 0, type: 'miss' };
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - (ts?.toMillis?.() || ts);
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/* ═══════════════════════════════════════════════════════════════
   SVG COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
const FootballIcon = ({ size = 20, color = '#0a0f1e' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
    <circle cx="12" cy="12" r="10.5" fill="white" fillOpacity="0.95" />
    <polygon points="12,4.5 15.2,9.5 20.8,10.8 16.8,14.8 17.8,20.5 12,17.8 6.2,20.5 7.2,14.8 3.2,10.8 8.8,9.5" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="0.7" strokeLinejoin="round" />
    {[[12,4.5,8.8,9.5],[12,4.5,15.2,9.5],[8.8,9.5,3.2,10.8],[15.2,9.5,20.8,10.8],[3.2,10.8,7.2,14.8],[20.8,10.8,16.8,14.8],[7.2,14.8,6.2,20.5],[16.8,14.8,17.8,20.5],[6.2,20.5,12,17.8],[17.8,20.5,12,17.8]].map(([x1,y1,x2,y2],i) => (
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.4" opacity="0.3" />
    ))}
    <circle cx="12" cy="12" r="3" fill="none" stroke={color} strokeWidth="0.35" opacity="0.18" />
  </svg>
);

const PitchLines = () => (
  <svg width="100%" height="100%" style={{ position:'absolute',inset:0,opacity:0.025,pointerEvents:'none' }} preserveAspectRatio="none">
    <line x1="50%" y1="0" x2="50%" y2="100%" stroke="white" strokeWidth="1" />
    <circle cx="50%" cy="50%" r="18%" fill="none" stroke="white" strokeWidth="1" />
    <rect x="15%" y="0" width="30%" height="14%" fill="none" stroke="white" strokeWidth="1" />
    <rect x="55%" y="86%" width="30%" height="14%" fill="none" stroke="white" strokeWidth="1" />
  </svg>
);

const StatusDot = ({ status }) => {
  if (status === 'live') return (
    <span style={{ width:5,height:5,borderRadius:'50%',background:'#00e676',boxShadow:'0 0 6px rgba(0,230,118,0.7)',animation:'nvLiveDot 1.2s ease-in-out infinite',display:'inline-block' }} />
  );
  if (status === 'ft') return (
    <span style={{ fontSize:'0.48rem',fontWeight:800,color:'rgba(255,255,255,0.3)',letterSpacing:'0.04em' }}>FT</span>
  );
  return <Clock size={7} style={{ color:'rgba(255,255,255,0.25)',flexShrink:0 }} />;
};

/* ═══════════════════════════════════════════════════════════════
   NAV LINKS — Home included alongside others
   ═══════════════════════════════════════════════════════════════ */
const LINKS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/fixtures', label: 'Fixtures', icon: '⚽' },
  { to: '/predictions', label: 'Predictions', icon: '🎯', badge: 'NEW' },
  { to: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { to: '/highlights', label: 'Highlights', icon: '🎬' },
  { to: '/livestream', label: 'Live', icon: '📡', isLive: true },
];

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Navbar() {
  injectBase();

  /* ── UI state ── */
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [pointsHover, setPointsHover] = useState(false);
  const [seenNotifIds, setSeenNotifIds] = useState(new Set());

  /* ── Real data state ── */
  const [bannerMatches, setBannerMatches] = useState([]);
  const [activePreds, setActivePreds] = useState([]);
  const [allPreds, setAllPreds] = useState([]);

  /* ── Context ── */
  const { currentUser, userProfile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const uid = currentUser?.uid;
  const isLoggedIn = !!uid;

  /* ── Refs ── */
  const linksRef = useRef(null);
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const rafRef = useRef(false);
  const prevScoresRef = useRef(new Map());

  const isHome = location.pathname === '/';
  const isActive = useCallback((p) => location.pathname === p, [location.pathname]);

  /* ═══════════════════════════════════════════════════════════
     COMPUTED: Prediction data
     ═══════════════════════════════════════════════════════════ */
  const scoreMap = useMemo(() => {
    const m = new Map();
    activePreds.forEach(p => {
      if (p.status === 'finished' && p.homeScore != null)
        m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore, homeTeam: p.homeTeam, awayTeam: p.awayTeam });
    });
    return m;
  }, [activePreds]);

  const userPredMap = useMemo(() => {
    if (!uid) return {};
    const m = {};
    allPreds.filter(p => p.userId === uid).forEach(p => { m[p.predId] = p; });
    return m;
  }, [allPreds, uid]);

  const userStats = useMemo(() => {
    const my = Object.values(userPredMap);
    let exact = 0, result = 0, miss = 0, points = 0, resolved = 0;
    my.forEach(p => {
      const a = scoreMap.get(String(p.matchId));
      if (!a) return;
      resolved++;
      const r = calcPoints(p.homeScore, p.awayScore, a.h, a.a);
      points += r.points;
      if (r.type === 'exact') exact++;
      else if (r.type === 'result') result++;
      else miss++;
    });
    return { predicted: my.length, total: activePreds.length, exact, result, miss, points, resolved };
  }, [userPredMap, scoreMap, activePreds]);

  const streak = useMemo(() => {
    const my = Object.values(userPredMap);
    const resolved = my.filter(p => {
      const a = scoreMap.get(String(p.matchId));
      return a != null;
    }).map(p => {
      const a = scoreMap.get(String(p.matchId));
      return calcPoints(p.homeScore, p.awayScore, a.h, a.a).type !== 'miss' ? 1 : 0;
    });
    let s = 0;
    for (let i = resolved.length - 1; i >= 0; i--) { if (resolved[i]) s++; else break; }
    return s;
  }, [userPredMap, scoreMap]);

  const userRank = useMemo(() => {
    if (!uid) return null;
    const um = {};
    allPreds.forEach(p => {
      if (!um[p.userId]) um[p.userId] = { uid: p.userId, points: 0, resolved: 0 };
      const u = um[p.userId];
      const a = scoreMap.get(String(p.matchId));
      if (!a) return;
      u.resolved++;
      u.points += calcPoints(p.homeScore, p.awayScore, a.h, a.a).points;
    });
    const sorted = Object.values(um).filter(u => u.resolved > 0).sort((a, b) => b.points - a.points);
    const idx = sorted.findIndex(u => u.uid === uid);
    return idx >= 0 ? idx + 1 : null;
  }, [allPreds, scoreMap, uid]);

  /* ═══════════════════════════════════════════════════════════
     COMPUTED: Prediction result notifications
     ═══════════════════════════════════════════════════════════ */
  const predNotifs = useMemo(() => {
    if (!uid) return [];
    const notifs = [];
    Object.values(userPredMap).forEach(p => {
      const actual = scoreMap.get(String(p.matchId));
      if (!actual) return;
      const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
      if (r.type === 'pending') return;
      notifs.push({
        id: p.predId,
        type: r.type,
        points: r.points,
        homeTeam: p.homeTeam || 'Home',
        awayTeam: p.awayTeam || 'Away',
        homeLogo: p.homeLogo || null,
        awayLogo: p.awayLogo || null,
        predScore: `${p.homeScore}-${p.awayScore}`,
        actualScore: `${actual.h}-${actual.a}`,
        time: p.updatedAt?.toMillis?.() || p.createdAt?.toMillis?.() || 0,
      });
    });
    return notifs.sort((a, b) => b.time - a.time);
  }, [userPredMap, scoreMap, uid]);

  const notifCount = useMemo(() => {
    return predNotifs.filter(n => !seenNotifIds.has(n.id)).length;
  }, [predNotifs, seenNotifIds]);

  /* ═══════════════════════════════════════════════════════════
     COMPUTED: Banner ticker matches
     ═══════════════════════════════════════════════════════════ */
  const tickerMatches = useMemo(() => {
    if (bannerMatches.length === 0) return [];
    const live = bannerMatches.filter(m => m.isLive);
    const finished = bannerMatches.filter(m => m.isFinished && !m.isLive).slice(0, 5);
    const upcoming = bannerMatches.filter(m => !m.isLive && !m.isFinished).slice(0, 5);
    return [...live, ...finished, ...upcoming];
  }, [bannerMatches]);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Fetch today's fixtures for banner
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchFixtures(todayStr());
        if (!cancelled && res?.matches?.length > 0) {
          setBannerMatches(res.matches);
          res.matches.forEach(m => {
            if (m.isLive) prevScoresRef.current.set(String(m.id), { h: m.homeScore, a: m.awayScore });
          });
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Real-time live fixture updates for banner
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const unsub = subscribeToLiveFixtures(({ matches: liveMatches }) => {
      if (liveMatches.length === 0) return;
      const liveMap = new Map(liveMatches.map(m => [String(m.id), m]));
      setBannerMatches(prev => {
        if (prev.length === 0) return liveMatches;
        return prev.map(f => {
          const live = liveMap.get(String(f.id));
          if (!live) return f;
          return {
            ...f,
            homeScore: live.homeScore ?? f.homeScore,
            awayScore: live.awayScore ?? f.awayScore,
            isLive: true, isFinished: false,
            status: live.status || f.status,
            minute: live.minute ?? f.minute,
          };
        });
      });
    });
    return () => unsub();
  }, []);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Listen to active_predictions
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'active_predictions'), where('matchDate', '==', todayStr()));
    const unsub = onSnapshot(q, snap => {
      setActivePreds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Listen to user_predictions
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'user_predictions'), where('matchDate', '==', todayStr()));
    const unsub = onSnapshot(q, snap => {
      setAllPreds(snap.docs.map(d => d.data()));
    }, () => {});
    return () => unsub();
  }, []);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Scroll detection
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const fn = () => {
      if (!rafRef.current) {
        rafRef.current = true;
        requestAnimationFrame(() => { setScrolled(window.scrollY > 10); rafRef.current = false; });
      }
    };
    window.addEventListener('scroll', fn, { passive: true });
    setScrolled(window.scrollY > 10);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Indicator tracking
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const el = linksRef.current?.querySelector('[data-act="1"]');
    if (el && linksRef.current) {
      const cR = linksRef.current.getBoundingClientRect();
      const aR = el.getBoundingClientRect();
      setIndicator({ left: aR.left - cR.left, width: aR.width, opacity: 1 });
    } else {
      setIndicator(p => ({ ...p, opacity: 0 }));
    }
  }, [location.pathname, scrolled]);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Cleanup on route change
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => { setMobileOpen(false); setSearchOpen(false); setNotifOpen(false); }, [location.pathname]);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Body scroll lock
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Escape key
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') {
        if (mobileOpen) setMobileOpen(false);
        if (searchOpen) { setSearchOpen(false); setSearchQuery(''); }
        if (notifOpen) setNotifOpen(false);
      }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [mobileOpen, searchOpen, notifOpen]);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Outside click for dropdowns
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const fn = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS: Mark notifications seen when opened
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (notifOpen && predNotifs.length > 0) {
      setSeenNotifIds(new Set(predNotifs.map(n => n.id)));
    }
  }, [notifOpen, predNotifs]);

  /* ═══════════════════════════════════════════════════════════
     HANDLERS
     ═══════════════════════════════════════════════════════════ */
  const handleLogout = useCallback(async () => {
    setMobileOpen(false);
    try { await logout(); } catch { /* */ }
    navigate('/');
  }, [logout, navigate]);

  const handleSearch = useCallback((e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  }, [searchQuery, navigate]);

  /* ═══════════════════════════════════════════════════════════
     TICKER ITEMS
     ═══════════════════════════════════════════════════════════ */
  const renderTickerItem = (m, i) => {
    const status = m.isLive ? 'live' : m.isFinished ? 'ft' : 'upcoming';
    return (
      <span key={`t-${m.id}-${i}`} style={{ display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap' }}>
        <StatusDot status={status} />
        <span style={{ fontWeight:700,fontSize:'0.68rem',color:m.isLive?'white':'rgba(255,255,255,0.82)' }}>
          {m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}
        </span>
        <span style={{
          background: m.isLive ? 'rgba(0,230,118,0.18)' : m.isFinished ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
          borderRadius:4, padding:'1px 7px',
          fontWeight:800, fontSize:'0.64rem', letterSpacing:'0.04em',
          fontFamily:'ui-monospace, monospace',
          color: m.isLive ? '#00e676' : m.isFinished ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.45)',
          boxShadow: m.isLive ? '0 0 8px rgba(0,230,118,0.12)' : 'none',
        }}>
          {m.homeScore ?? '?'}–{m.awayScore ?? '?'}
        </span>
        <span style={{ fontWeight:700,fontSize:'0.68rem',color:m.isLive?'white':'rgba(255,255,255,0.82)' }}>
          {m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}
        </span>
        <span style={{
          fontSize:'0.52rem',fontWeight:600,
          color: m.isLive ? 'rgba(0,230,118,0.7)' : 'rgba(255,255,255,0.25)',
          fontFamily:'ui-monospace, monospace', minWidth:24, textAlign:'center',
        }}>
          {m.isLive && m.minute != null ? `${m.minute}'` : m.isFinished ? '' : m.kickoff || ''}
        </span>
      </span>
    );
  };

  const tickerContent = tickerMatches.length > 0
    ? tickerMatches.map((m, i) => renderTickerItem(m, i))
    : null;

  /* ═══════════════════════════════════════════════════════════
     NOTIFICATION ITEM RENDERER
     ═══════════════════════════════════════════════════════════ */
  const renderNotifItem = (n, i) => {
    const cfg = {
      exact: { icon:'🏆', title:'Exact Score!', desc:`${n.homeTeam} ${n.actualScore} ${n.awayTeam}`, sub:`Your pick: ${n.predScore}`, pts:'+10 pts', color:'#00e676', bg:'rgba(0,230,118,0.06)', border:'rgba(0,230,118,0.1)', ptsBg:'rgba(0,230,118,0.1)', ptsBorder:'rgba(0,230,118,0.2)' },
      result: { icon:'📈', title:'Correct Result!', desc:`${n.homeTeam} ${n.actualScore} ${n.awayTeam}`, sub:`Your pick: ${n.predScore}`, pts:'+3 pts', color:'#fbbf24', bg:'rgba(251,191,36,0.05)', border:'rgba(251,191,36,0.1)', ptsBg:'rgba(251,191,36,0.1)', ptsBorder:'rgba(251,191,36,0.2)' },
      miss:   { icon:'❌', title:'Prediction Miss', desc:`${n.homeTeam} ${n.actualScore} ${n.awayTeam}`, sub:`Your pick: ${n.predScore}`, pts:'+0 pts', color:'#ef4444', bg:'rgba(239,68,68,0.04)', border:'rgba(239,68,68,0.08)', ptsBg:'rgba(239,68,68,0.08)', ptsBorder:'rgba(239,68,68,0.15)' },
    }[n.type];
    if (!cfg) return null;
    return (
      <div key={n.id} style={{
        padding:'11px 14px', display:'flex', gap:10, alignItems:'flex-start',
        borderBottom:'1px solid rgba(255,255,255,0.03)',
        background:cfg.bg, cursor:'pointer',
        transition:'background 0.15s ease',
        animation:`nvNotifSlide 0.3s cubic-bezier(0.22,1,0.36,1) ${i * 50}ms both`,
      }}
      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.background=cfg.bg; }}
      onClick={() => { navigate('/predictions'); setNotifOpen(false); }}
      >
        <span style={{ fontSize:'1.15rem',lineHeight:1,marginTop:1,flexShrink:0 }}>{cfg.icon}</span>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:'0.76rem',fontWeight:700,color:cfg.color,marginBottom:2 }}>{cfg.title}</div>
          <div style={{ fontSize:'0.68rem',color:'#e2e8f0',fontWeight:500 }}>{cfg.desc}</div>
          <div style={{ fontSize:'0.6rem',color:'#6b7280',marginTop:2 }}>{cfg.sub}</div>
        </div>
        <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0 }}>
          <span style={{
            fontSize:'0.58rem',fontWeight:800,color:cfg.color,
            background:cfg.ptsBg, padding:'2px 7px', borderRadius:5,
            border:`1px solid ${cfg.ptsBorder}`,
            boxShadow:n.type==='exact'?'0 0 8px rgba(0,230,118,0.12)':'none',
          }}>{cfg.pts}</span>
          <span style={{ fontSize:'0.52rem',color:'#4a5568' }}>{timeAgo(n.time)}</span>
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ╔═══════════════════════════════════════════════════════╗
          ║              COLOURED TOP BANNER                     ║
          ╚═══════════════════════════════════════════════════════╝ */}
      <div style={{
        position:'sticky',top:0,zIndex:1001,height:34,overflow:'hidden',
        display:'flex',alignItems:'center',
        background:'linear-gradient(90deg, #059669 0%, #0d9488 15%, #0891b2 30%, #0ea5e9 48%, #6366f1 65%, #a855f7 82%, #ec4899 95%, #059669 110%)',
        backgroundSize:'200% 100%',
        animation:'nvBannerShimmer 10s linear infinite',
        borderBottom:'1px solid rgba(255,255,255,0.1)',
        boxShadow:'0 2px 24px rgba(5,150,105,0.2), 0 0 50px rgba(14,165,233,0.08), 0 1px 0 rgba(255,255,255,0.05) inset',
      }}>
        <div style={{ position:'absolute',inset:0,pointerEvents:'none',background:'linear-gradient(90deg, rgba(0,0,0,0.4) 0%, transparent 10%, transparent 90%, rgba(0,0,0,0.4) 100%)' }} />
        <div style={{ position:'absolute',inset:0,pointerEvents:'none',background:'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 50%, transparent 100%)',backgroundSize:'200% 100%',animation:'nvBannerShimmer 3.5s ease-in-out infinite' }} />

        {tickerMatches.length > 0 && (
          <div style={{
            position:'absolute',left:14,zIndex:2,
            display:'flex',alignItems:'center',gap:5,
            background:'linear-gradient(135deg, #dc2626, #ef4444)',
            borderRadius:6, padding:'2px 10px',
            fontSize:'0.54rem',fontWeight:800,
            color:'white',letterSpacing:'0.12em',textTransform:'uppercase',
            boxShadow:'0 0 14px rgba(239,68,68,0.55), 0 0 30px rgba(239,68,68,0.15), 0 1px 0 rgba(255,255,255,0.15) inset',
          }}>
            <span style={{ width:5,height:5,borderRadius:'50%',background:'white',animation:'nvLiveDot 1.2s ease-in-out infinite',boxShadow:'0 0 5px rgba(255,255,255,0.7)' }} />
            LIVE
          </div>
        )}

        {tickerContent ? (
          <div style={{
            flex:1,overflow:'hidden',
            marginLeft: tickerMatches.some(m => m.isLive) ? 72 : 16,
            marginRight:16,
            maskImage:'linear-gradient(90deg, transparent, black 5%, black 95%, transparent)',
            WebkitMaskImage:'linear-gradient(90deg, transparent, black 5%, black 95%, transparent)',
          }}>
            <div style={{
              display:'inline-flex',alignItems:'center',gap:18,
              animation:'nvMarquee 45s linear infinite',
              color:'rgba(255,255,255,0.9)',fontSize:'0.68rem',fontWeight:500,
            }}>
              {tickerContent}
              <span style={{ color:'rgba(255,255,255,0.12)',fontSize:'0.5rem' }}>⚽</span>
              {tickerContent}
              <span style={{ color:'rgba(255,255,255,0.12)',fontSize:'0.5rem' }}>⚽</span>
            </div>
          </div>
        ) : (
          <div style={{ flex:1,textAlign:'center',fontSize:'0.68rem',fontWeight:600,color:'rgba(255,255,255,0.5)',letterSpacing:'0.04em' }}>
            ⚽ zokascore.xyz — Live football scores & predictions
          </div>
        )}
      </div>

      {/* ╔═══════════════════════════════════════════════════════╗
          ║                   NAVBAR BAR                         ║
          ╚═══════════════════════════════════════════════════════╝ */}
      <nav style={{
        position:'sticky',top:34,zIndex:1000,height:60,
        background:scrolled?'rgba(6,11,20,0.97)':'rgba(6,11,20,0)',
        backdropFilter:scrolled?'blur(40px) saturate(190%)':'none',
        WebkitBackdropFilter:scrolled?'blur(40px) saturate(190%)':'none',
        borderBottom:`1px solid ${scrolled?'rgba(0,230,118,0.06)':'rgba(255,255,255,0)'}`,
        boxShadow:scrolled?'0 1px 0 rgba(0,230,118,0.04), 0 8px 40px rgba(0,0,0,0.3), 0 0 80px rgba(0,230,118,0.02)':'none',
        transition:'all 0.5s cubic-bezier(0.22,1,0.36,1)',
        willChange:'background, backdrop-filter, box-shadow',
        animation:scrolled?'nvBorderGlow 4s ease-in-out infinite':'none',
      }}>
        <div className="nv-inn" style={{ maxWidth:'var(--max-width, 1140px)',margin:'0 auto',padding:'0 20px',height:'100%',display:'grid',gridTemplateColumns:'auto 1fr auto',alignItems:'center',gap:6 }}>

          {/* ── LEFT: Standalone Home button (always visible) ── */}
          <div style={{ display:'flex',alignItems:'center',gap:8,minWidth:0 }}>
            <Link to="/" className="nv-bk-btn" style={{
              display:'inline-flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,
              fontSize:'0.75rem',fontWeight:600,textDecoration:'none',whiteSpace:'nowrap',
              color: isHome ? '#00e676' : '#6b7280',
              background: isHome ? 'rgba(0,230,118,0.08)' : 'rgba(255,255,255,0.02)',
              border: isHome ? '1px solid rgba(0,230,118,0.15)' : '1px solid rgba(255,255,255,0.06)',
              cursor:'pointer',
              transition:'all 0.25s cubic-bezier(0.22,1,0.36,1)',
              animation:'nvFadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both',
              boxShadow: isHome ? '0 0 14px rgba(0,230,118,0.08)' : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(0,230,118,0.1)';e.currentTarget.style.color='#00e676';e.currentTarget.style.borderColor='rgba(0,230,118,0.2)';e.currentTarget.style.boxShadow='0 0 14px rgba(0,230,118,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background=isHome?'rgba(0,230,118,0.08)':'rgba(255,255,255,0.02)';e.currentTarget.style.color=isHome?'#00e676':'#6b7280';e.currentTarget.style.borderColor=isHome?'rgba(0,230,118,0.15)':'rgba(255,255,255,0.06)';e.currentTarget.style.boxShadow=isHome?'0 0 14px rgba(0,230,118,0.08)':'none'; }}
            aria-label="Home"
            >
              <Home size={14} /><span className="nv-bk-txt">Home</span>
            </Link>
          </div>

          {/* ── CENTER: Logo ── */}
          <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minWidth:0 }}>
            <Link to="/" style={{
              display:'flex',alignItems:'center',gap:10,textDecoration:'none',cursor:'pointer',
              transition:'all 0.2s ease',position:'relative',
              animation:'nvFadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both',
            }}
            onMouseEnter={e => { e.currentTarget.style.filter='brightness(1.1)';e.currentTarget.querySelector('.nv-lglow').style.opacity='1'; }}
            onMouseLeave={e => { e.currentTarget.style.filter='brightness(1)';e.currentTarget.querySelector('.nv-lglow').style.opacity='0'; }}
            >
              <div className="nv-lglow" style={{ position:'absolute',left:-12,top:'50%',transform:'translateY(-50%)',width:90,height:56,borderRadius:'50%',background:'radial-gradient(ellipse, rgba(0,230,118,0.14) 0%, transparent 70%)',filter:'blur(10px)',pointerEvents:'none',opacity:0,transition:'opacity 0.4s ease' }} />
              <div style={{
                width:38,height:38,borderRadius:11,position:'relative',overflow:'hidden',flexShrink:0,
                background:'linear-gradient(145deg, #00e676 0%, #00c853 35%, #059669 100%)',
                display:'flex',alignItems:'center',justifyContent:'center',
                boxShadow:'0 0 22px rgba(0,230,118,0.3), 0 2px 10px rgba(0,230,118,0.2), 0 1px 0 rgba(255,255,255,0.2) inset',
                animation:'nvGlowBreathe 3s ease-in-out infinite',
              }}>
                <FootballIcon size={22} />
                <div style={{ position:'absolute',top:0,left:'-100%',width:'50%',height:'100%',background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',animation:'nvShine 4s ease-in-out 1.5s infinite' }} />
                <div style={{ position:'absolute',top:0,left:0,right:0,height:'45%',background:'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)',borderRadius:'11px 11px 0 0',pointerEvents:'none' }} />
              </div>
              <div className="nv-dk" style={{ display:'flex',alignItems:'baseline',gap:0 }}>
                <span style={{ fontWeight:800,fontSize:'1.15rem',letterSpacing:'0.02em',color:'#e2e8f0',whiteSpace:'nowrap',textShadow:'0 0 20px rgba(255,255,255,0.03)' }}>ZOKA</span>
                <span style={{ fontWeight:900,fontSize:'1.15rem',letterSpacing:'0.03em',color:'#00e676',whiteSpace:'nowrap',marginLeft:1,animation:'nvScoreGlow 3s ease-in-out infinite' }}>SCORE</span>
                <span style={{ color:'#00e676',fontSize:'1.35rem',lineHeight:1,animation:'nvDotBlink 2.5s ease-in-out infinite',textShadow:'0 0 12px rgba(0,230,118,0.7)',marginLeft:0 }}>.</span>
                <span style={{ fontSize:'0.48rem',fontWeight:700,color:'#4a5568',letterSpacing:'0.12em',textTransform:'uppercase',marginLeft:3,opacity:0.35 }}>xyz</span>
              </div>
            </Link>
          </div>

          {/* ── RIGHT ── */}
          <div style={{ display:'flex',alignItems:'center',gap:2,flexShrink:0,justifyContent:'flex-end' }}>

            {/* Search */}
            <div ref={searchRef} className="nv-dk" style={{ position:'relative' }}>
              <button onClick={() => { setSearchOpen(p => !p);if(searchOpen) setSearchQuery(''); }} style={{
                width:35,height:35,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',
                background:searchOpen?'rgba(0,230,118,0.08)':'transparent',
                color:searchOpen?'#00e676':'#6b7280',
                border:`1.5px solid ${searchOpen?'rgba(0,230,118,0.18)':'transparent'}`,
                cursor:'pointer',transition:'all 0.2s cubic-bezier(0.22,1,0.36,1)',
                animation:`nvFadeUp 0.4s cubic-bezier(0.22,1,0.36,1) 60ms both`,
                boxShadow:searchOpen?'0 0 14px rgba(0,230,118,0.1)':'none',
              }}
              onMouseEnter={e => { if(!searchOpen){e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.color='#e2e8f0';} }}
              onMouseLeave={e => { if(!searchOpen){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#6b7280';} }}
              aria-label="Search"
              >
                <Search size={15} />
              </button>
              {searchOpen && (
                <form onSubmit={handleSearch} style={{
                  position:'absolute',top:'calc(100% + 8px)',right:0,width:260,
                  background:'rgba(12,18,32,0.98)',border:'1px solid rgba(0,230,118,0.12)',
                  borderRadius:12,padding:'6px',display:'flex',alignItems:'center',gap:8,
                  boxShadow:'0 12px 40px rgba(0,0,0,0.5), 0 0 30px rgba(0,230,118,0.06)',
                  backdropFilter:'blur(20px)',animation:'nvFadeUp 0.25s cubic-bezier(0.22,1,0.36,1) both',
                }}>
                  <Search size={14} style={{ color:'#4a5568',flexShrink:0,marginLeft:6 }} />
                  <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search matches, teams..." style={{
                    flex:1,background:'none',border:'none',outline:'none',color:'#e2e8f0',fontSize:'0.82rem',fontWeight:500,fontFamily:'inherit',
                  }} />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} style={{ background:'rgba(255,255,255,0.06)',border:'none',borderRadius:6,width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',color:'#6b7280',cursor:'pointer',fontSize:'0.7rem',flexShrink:0 }}>✕</button>
                  )}
                </form>
              )}
            </div>

            {/* Notifications — only when logged in */}
            {isLoggedIn && (
              <div ref={notifRef} className="nv-dk" style={{ position:'relative' }}>
                <button onClick={() => setNotifOpen(p => !p)} style={{
                  width:35,height:35,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',
                  background:notifOpen?'rgba(0,230,118,0.08)':'transparent',
                  color:notifOpen?'#00e676':'#6b7280',
                  border:`1.5px solid ${notifOpen?'rgba(0,230,118,0.18)':'transparent'}`,
                  cursor:'pointer',position:'relative',
                  transition:'all 0.2s cubic-bezier(0.22,1,0.36,1)',
                  animation:`nvFadeUp 0.4s cubic-bezier(0.22,1,0.36,1) 90ms both`,
                  boxShadow:notifOpen?'0 0 14px rgba(0,230,118,0.1)':'none',
                }}
                onMouseEnter={e => { if(!notifOpen){e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.color='#e2e8f0';}e.currentTarget.querySelector('.nv-bell-ic').style.animation='nvBellRing 0.8s ease'; }}
                onMouseLeave={e => { if(!notifOpen){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#6b7280';} }}
                aria-label="Notifications"
                >
                  <Bell size={15} className="nv-bell-ic" />
                  {notifCount > 0 && (
                    <span style={{
                      position:'absolute',top:3,right:3,width:16,height:16,borderRadius:'50%',
                      background:'linear-gradient(135deg, #ef4444, #dc2626)',color:'white',fontSize:'0.5rem',fontWeight:800,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      boxShadow:'0 0 10px rgba(239,68,68,0.5), 0 0 20px rgba(239,68,68,0.15)',border:'2px solid rgba(6,11,20,0.9)',
                      animation:'nvBadgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                    }}>{notifCount > 9 ? '9+' : notifCount}</span>
                  )}
                </button>
                {notifOpen && (
                  <div style={{
                    position:'absolute',top:'calc(100% + 8px)',right:-8,width:320,
                    background:'rgba(12,18,32,0.98)',border:'1px solid rgba(0,230,118,0.1)',
                    borderRadius:14,overflow:'hidden',
                    boxShadow:'0 16px 50px rgba(0,0,0,0.55), 0 0 40px rgba(0,230,118,0.04)',
                    backdropFilter:'blur(20px)',animation:'nvFadeUp 0.25s cubic-bezier(0.22,1,0.36,1) both',
                  }}>
                    <div style={{ padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'linear-gradient(180deg, rgba(0,230,118,0.03) 0%, transparent 100%)' }}>
                      <span style={{ fontSize:'0.78rem',fontWeight:700,color:'#e2e8f0' }}>Prediction Results</span>
                      {predNotifs.length > 0 && (
                        <span style={{ fontSize:'0.56rem',fontWeight:700,color:'#00e676',background:'rgba(0,230,118,0.1)',padding:'2px 8px',borderRadius:20,boxShadow:'0 0 8px rgba(0,230,118,0.08)' }}>{predNotifs.length} results</span>
                      )}
                    </div>
                    {predNotifs.length === 0 ? (
                      <div style={{ padding:'28px 20px',textAlign:'center' }}>
                        <Target size={28} style={{ color:'#4a5568',marginBottom:10,opacity:0.5 }} />
                        <div style={{ fontSize:'0.78rem',fontWeight:600,color:'#6b7280',marginBottom:4 }}>No results yet</div>
                        <div style={{ fontSize:'0.68rem',color:'#4a5568' }}>Make predictions and check back after matches end</div>
                      </div>
                    ) : (
                      <div style={{ maxHeight:320,overflowY:'auto' }}>
                        {predNotifs.slice(0, 8).map((n, i) => renderNotifItem(n, i))}
                      </div>
                    )}
                    {predNotifs.length > 0 && (
                      <Link to="/predictions" onClick={() => setNotifOpen(false)} style={{
                        display:'block',textAlign:'center',padding:'10px',fontSize:'0.75rem',fontWeight:600,color:'#00e676',
                        textDecoration:'none',background:'rgba(0,230,118,0.03)',transition:'background 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background='rgba(0,230,118,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background='rgba(0,230,118,0.03)'; }}
                      >View all predictions</Link>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Points badge — real data */}
            {isLoggedIn && userStats.resolved > 0 && (
              <div className="nv-dk" onMouseEnter={() => setPointsHover(true)} onMouseLeave={() => setPointsHover(false)} style={{
                display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:20,
                background:pointsHover?'rgba(251,191,36,0.08)':'rgba(251,191,36,0.04)',
                border:`1px solid ${pointsHover?'rgba(251,191,36,0.18)':'rgba(251,191,36,0.08)'}`,
                cursor:'default',transition:'all 0.25s cubic-bezier(0.22,1,0.36,1)',
                boxShadow:pointsHover?'0 0 16px rgba(251,191,36,0.1)':'none',
                animation:`nvFadeUp 0.4s cubic-bezier(0.22,1,0.36,1) 120ms both`,
              }}>
                <span style={{ fontSize:'0.85rem',animation:'nvStreakFire 2s ease-in-out infinite',filter:'drop-shadow(0 0 4px rgba(251,146,60,0.4))' }}>⚡</span>
                <span style={{ fontWeight:800,fontSize:'0.78rem',color:'#fbbf24',fontFamily:'ui-monospace, monospace',letterSpacing:'0.02em',textShadow:'0 0 10px rgba(251,191,36,0.25)' }}>{userStats.points.toLocaleString()}</span>
                <span className="nv-pts-label" style={{ fontSize:'0.52rem',fontWeight:600,color:'#92400e',background:'rgba(251,191,36,0.1)',padding:'1px 6px',borderRadius:4,opacity:0.7 }}>PTS</span>
                {streak > 0 && (
                  <span style={{ fontSize:'0.54rem',fontWeight:700,color:'#f97316',display:'flex',alignItems:'center',gap:2,marginLeft:2,opacity:pointsHover?1:0.6,transition:'opacity 0.2s',textShadow:'0 0 6px rgba(249,115,22,0.3)' }}>🔥{streak}</span>
                )}
              </div>
            )}

            {/* Desktop nav links — Home is first in group */}
            <div ref={linksRef} className="nv-dk" style={{ position:'relative',display:'flex',alignItems:'center',height:'100%' }}>
              {LINKS.map((link, i) => {
                const active = isActive(link.to);
                return (
                  <Link key={link.to} to={link.to} data-act={active?'1':'0'} style={{
                    position:'relative',display:'flex',alignItems:'center',height:'100%',padding:'0 12px',
                    fontSize:'0.78rem',fontWeight:active?600:500,color:active?'#00e676':'#6b7280',
                    background:'none',border:'none',cursor:'pointer',textDecoration:'none',
                    transition:'all 0.25s cubic-bezier(0.22,1,0.36,1)',whiteSpace:'nowrap',gap:4,
                    textShadow:active?'0 0 16px rgba(0,230,118,0.4)':'none',
                    animation:`nvFadeUp 0.4s cubic-bezier(0.22,1,0.36,1) ${i*35+160}ms both`,
                  }}
                  onMouseEnter={e => { if(!active){e.currentTarget.style.color='#e2e8f0';e.currentTarget.style.textShadow='0 0 8px rgba(255,255,255,0.06)';} }}
                  onMouseLeave={e => { if(!active){e.currentTarget.style.color='#6b7280';e.currentTarget.style.textShadow='none';} }}
                  >
                    <span style={{ fontSize:'0.7rem',opacity:0.7 }}>{link.icon}</span>
                    {link.label}
                    {link.isLive && <span style={{ width:5,height:5,borderRadius:'50%',background:'#ef4444',boxShadow:'0 0 8px rgba(239,68,68,0.6)',animation:'nvLiveDot 1.5s ease-in-out infinite' }} />}
                    {link.badge && <span style={{ fontSize:'0.42rem',fontWeight:800,color:'#0a0f1e',background:'linear-gradient(135deg, #00e676, #00c853)',padding:'1px 5px',borderRadius:4,letterSpacing:'0.06em',boxShadow:'0 0 8px rgba(0,230,118,0.3)',lineHeight:'1.4' }}>{link.badge}</span>}
                  </Link>
                );
              })}
              <div style={{
                position:'absolute',bottom:0,height:2.5,
                background:'linear-gradient(90deg, transparent, #00e676, transparent)',
                borderRadius:'2px 2px 0 0',pointerEvents:'none',
                transition:'left 0.45s cubic-bezier(0.22,1,0.36,1), width 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease',
                left:indicator.left,width:indicator.width,opacity:indicator.opacity,
                boxShadow:'0 0 12px rgba(0,230,118,0.7), 0 0 30px rgba(0,230,118,0.25), 0 -3px 10px rgba(0,230,118,0.15)',
              }} />
            </div>

            {/* Auth icons — desktop */}
            {isLoggedIn ? (
              <div className="nv-dk" style={{ display:'flex',alignItems:'center',gap:2 }}>
                {userProfile?.role === 'admin' && (
                  <Link to={ADMIN_PATH} style={{
                    width:35,height:35,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',
                    background:isActive(ADMIN_PATH)?'rgba(0,230,118,0.08)':'transparent',
                    color:isActive(ADMIN_PATH)?'#00e676':'#6b7280',
                    border:`1.5px solid ${isActive(ADMIN_PATH)?'rgba(0,230,118,0.18)':'transparent'}`,
                    cursor:'pointer',textDecoration:'none',transition:'all 0.2s cubic-bezier(0.22,1,0.36,1)',
                    animation:`nvFadeUp 0.4s cubic-bezier(0.22,1,0.36,1) ${LINKS.length*35+170}ms both`,
                    boxShadow:isActive(ADMIN_PATH)?'0 0 14px rgba(0,230,118,0.12)':'none',
                  }}
                  onMouseEnter={e => { if(!isActive(ADMIN_PATH)){e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.color='#e2e8f0';e.currentTarget.style.borderColor='rgba(255,255,255,0.1)';} }}
                  onMouseLeave={e => { if(!isActive(ADMIN_PATH)){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#6b7280';e.currentTarget.style.borderColor='transparent';} }}
                  title="Admin"><Shield size={15} /></Link>
                )}
                <Link to="/profile" style={{
                  width:35,height:35,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',
                  background:isActive('/profile')?'rgba(0,230,118,0.08)':'transparent',
                  color:isActive('/profile')?'#00e676':'#6b7280',
                  border:`1.5px solid ${isActive('/profile')?'rgba(0,230,118,0.18)':'transparent'}`,
                  cursor:'pointer',textDecoration:'none',transition:'all 0.2s cubic-bezier(0.22,1,0.36,1)',
                  animation:`nvFadeUp 0.4s cubic-bezier(0.22,1,0.36,1) ${LINKS.length*35+190}ms both`,
                  boxShadow:isActive('/profile')?'0 0 14px rgba(0,230,118,0.12)':'none',
                }}
                onMouseEnter={e => { if(!isActive('/profile')){e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.color='#e2e8f0';e.currentTarget.style.borderColor='rgba(255,255,255,0.1)';} }}
                onMouseLeave={e => { if(!isActive('/profile')){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#6b7280';e.currentTarget.style.borderColor='transparent';} }}
                title="Profile"><User size={15} /></Link>
              </div>
            ) : (
              <Link to="/login" className="nv-dk" style={{
                display:'flex',alignItems:'center',gap:7,padding:'8px 20px',borderRadius:9,
                background:'linear-gradient(135deg, #00e676 0%, #00c853 100%)',color:'#0a0f1e',
                fontWeight:700,fontSize:'0.8rem',textDecoration:'none',letterSpacing:'0.01em',
                transition:'all 0.25s cubic-bezier(0.22,1,0.36,1)',
                boxShadow:'0 2px 16px rgba(0,230,118,0.28), 0 0 28px rgba(0,230,118,0.1), inset 0 1px 0 rgba(255,255,255,0.25)',
                animation:`nvFadeUp 0.4s cubic-bezier(0.22,1,0.36,1) 350ms both`,
              }}
              onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px) scale(1.02)';e.currentTarget.style.boxShadow='0 6px 28px rgba(0,230,118,0.4), 0 0 50px rgba(0,230,118,0.15), inset 0 1px 0 rgba(255,255,255,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0) scale(1)';e.currentTarget.style.boxShadow='0 2px 16px rgba(0,230,118,0.28), 0 0 28px rgba(0,230,118,0.1), inset 0 1px 0 rgba(255,255,255,0.25)'; }}
              >
                <Zap size={13} strokeWidth={2.5} /> Sign In
              </Link>
            )}

            {/* ── Mobile: admin badge + points + hamburger ── */}
            {isLoggedIn && userProfile?.role === 'admin' && (
              <Link to={ADMIN_PATH} className="nv-tg" style={{
                width:36,height:36,alignItems:'center',justifyContent:'center',borderRadius:9,
                border:'1px solid rgba(251,191,36,0.18)',background:'rgba(251,191,36,0.06)',
                cursor:'pointer',textDecoration:'none',transition:'all 0.15s ease',
                display:'flex',position:'relative',
                boxShadow:'0 0 10px rgba(251,191,36,0.06)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(251,191,36,0.14)';e.currentTarget.style.borderColor='rgba(251,191,36,0.3)';e.currentTarget.style.boxShadow='0 0 18px rgba(251,191,36,0.14)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(251,191,36,0.06)';e.currentTarget.style.borderColor='rgba(251,191,36,0.18)';e.currentTarget.style.boxShadow='0 0 10px rgba(251,191,36,0.06)'; }}
              title="Admin"
              >
                <Shield size={15} style={{ color:'#fbbf24' }} />
              </Link>
            )}

            {isLoggedIn && userStats.resolved > 0 && (
              <div className="nv-tg" style={{
                display:'flex',alignItems:'center',gap:3,padding:'4px 10px',borderRadius:16,
                background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.12)',
              }}>
                <span style={{ fontSize:'0.72rem' }}>⚡</span>
                <span style={{ fontWeight:800,fontSize:'0.72rem',color:'#fbbf24',fontFamily:'ui-monospace, monospace' }}>{userStats.points.toLocaleString()}</span>
              </div>
            )}

            <button
              className="nv-tg"
              onClick={() => setMobileOpen(p => !p)}
              style={{
                width:36,height:36,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',
                background:mobileOpen?'rgba(0,230,118,0.08)':'rgba(255,255,255,0.04)',
                border:`1.5px solid ${mobileOpen?'rgba(0,230,118,0.18)':'rgba(255,255,255,0.08)'}`,
                color:mobileOpen?'#00e676':'#e2e8f0',cursor:'pointer',
                transition:'all 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              aria-label="Menu"
            >
              {mobileOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </div>
      </nav>

      {/* ╔═══════════════════════════════════════════════════════╗
          ║              MOBILE DRAWER                           ║
          ╚═══════════════════════════════════════════════════════╝ */}
      {mobileOpen && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position:'fixed',inset:0,zIndex:998,background:'rgba(0,0,0,0.6)',
              backdropFilter:'blur(4px)',animation:'nvOverlayIn 0.25s ease both',
            }}
          />

          {/* Panel */}
          <div style={{
            position:'fixed',top:0,right:0,bottom:0,zIndex:999,width:'min(320px, 85vw)',
            background:'rgba(8,13,24,0.98)',borderLeft:'1px solid rgba(0,230,118,0.08)',
            boxShadow:'-8px 0 40px rgba(0,0,0,0.5), -0 0 60px rgba(0,230,118,0.03)',
            backdropFilter:'blur(30px)',overflowY:'auto',
            animation:'nvMobSlide 0.35s cubic-bezier(0.22,1,0.36,1) both',
          }}>
            {/* Mobile header */}
            <div style={{ padding:'20px 20px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                <div style={{
                  width:30,height:30,borderRadius:8,overflow:'hidden',flexShrink:0,
                  background:'linear-gradient(145deg, #00e676, #059669)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  boxShadow:'0 0 14px rgba(0,230,118,0.25)',
                }}>
                  <FootballIcon size={18} />
                </div>
                <span style={{ fontWeight:800,fontSize:'0.95rem',color:'#e2e8f0' }}>ZOKA<span style={{ color:'#00e676' }}>SCORE</span></span>
              </div>
              <button onClick={() => setMobileOpen(false)} style={{
                width:32,height:32,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',
                background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
                color:'#6b7280',cursor:'pointer',
              }}>
                <X size={16} />
              </button>
            </div>

            {/* User info (if logged in) */}
            {isLoggedIn && userProfile && (
              <div style={{ padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.05)',background:'rgba(0,230,118,0.02)' }}>
                <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:10 }}>
                  <div style={{
                    width:38,height:38,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',
                    background:'linear-gradient(135deg, rgba(0,230,118,0.15), rgba(0,230,118,0.05))',
                    border:'1px solid rgba(0,230,118,0.15)',color:'#00e676',fontWeight:800,fontSize:'0.9rem',
                  }}>
                    {(userProfile.displayName || 'U')[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:'0.84rem',fontWeight:700,color:'#e2e8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                      {userProfile.displayName || 'User'}
                    </div>
                    <div style={{ fontSize:'0.68rem',color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                      {userProfile.email || ''}
                    </div>
                  </div>
                  {userRank && (
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:'0.7rem',fontWeight:900,color:'#fbbf24',fontFamily:'ui-monospace, monospace' }}>#{userRank}</div>
                      <div style={{ fontSize:'0.48rem',color:'#6b7280',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em' }}>Rank</div>
                    </div>
                  )}
                </div>
                {userStats.resolved > 0 && (
                  <div style={{ display:'flex',gap:8 }}>
                    {[
                      { label: 'Points', val: userStats.points, color: '#fbbf24' },
                      { label: 'Exact', val: userStats.exact, color: '#00e676' },
                      { label: 'Result', val: userStats.result, color: '#38bdf8' },
                    ].map(s => (
                      <div key={s.label} style={{ flex:1,textAlign:'center',padding:'8px 4px',borderRadius:8,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ fontSize:'0.88rem',fontWeight:900,color:s.color,fontFamily:'ui-monospace, monospace' }}>{s.val}</div>
                        <div style={{ fontSize:'0.52rem',color:'#6b7280',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginTop:2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Nav links — includes Home */}
            <div style={{ padding:'8px 12px' }}>
              {LINKS.map((link, i) => {
                const active = isActive(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    style={{
                      display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:10,
                      textDecoration:'none',cursor:'pointer',marginBottom:2,
                      background:active?'rgba(0,230,118,0.08)':'transparent',
                      border:`1px solid ${active?'rgba(0,230,118,0.12)':'transparent'}`,
                      transition:'all 0.15s ease',
                      animation:`nvMobItemIn 0.3s cubic-bezier(0.22,1,0.36,1) ${i*40+50}ms both`,
                    }}
                    onMouseEnter={e => { if(!active){e.currentTarget.style.background='rgba(255,255,255,0.03)';e.currentTarget.style.borderColor='rgba(255,255,255,0.06)';} }}
                    onMouseLeave={e => { if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='transparent';} }}
                  >
                    <span style={{ fontSize:'1.1rem',width:24,textAlign:'center',flexShrink:0 }}>{link.icon}</span>
                    <span style={{ flex:1,fontSize:'0.84rem',fontWeight:active?700:500,color:active?'#00e676':'#e2e8f0' }}>{link.label}</span>
                    {link.isLive && <span style={{ width:6,height:6,borderRadius:'50%',background:'#ef4444',boxShadow:'0 0 8px rgba(239,68,68,0.6)',animation:'nvLiveDot 1.5s ease-in-out infinite' }} />}
                    {link.badge && <span style={{ fontSize:'0.5rem',fontWeight:800,color:'#0a0f1e',background:'linear-gradient(135deg, #00e676, #00c853)',padding:'2px 6px',borderRadius:4,letterSpacing:'0.06em' }}>{link.badge}</span>}
                    {active && <ChevronRight size={14} style={{ color:'#00e676',opacity:0.6 }} />}
                  </Link>
                );
              })}

              {/* Auth links in mobile */}
              <div style={{ height:1,background:'rgba(255,255,255,0.05)',margin:'12px 14px' }} />

              {isLoggedIn ? (
                <>
                  <Link to="/profile" onClick={() => setMobileOpen(false)} style={{
                    display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:10,
                    textDecoration:'none',cursor:'pointer',marginBottom:2,
                    background:isActive('/profile')?'rgba(0,230,118,0.08)':'transparent',
                    border:`1px solid ${isActive('/profile')?'rgba(0,230,118,0.12)':'transparent'}`,
                    transition:'all 0.15s ease',
                  }}
                  onMouseEnter={e => { if(!isActive('/profile')){e.currentTarget.style.background='rgba(255,255,255,0.03)';} }}
                  onMouseLeave={e => { if(!isActive('/profile')){e.currentTarget.style.background='transparent';} }}
                  >
                    <User size={18} style={{ color:isActive('/profile')?'#00e676':'#6b7280',width:24,textAlign:'center' }} />
                    <span style={{ flex:1,fontSize:'0.84rem',fontWeight:isActive('/profile')?700:500,color:isActive('/profile')?'#00e676':'#e2e8f0' }}>Profile</span>
                    {isActive('/profile') && <ChevronRight size={14} style={{ color:'#00e676',opacity:0.6 }} />}
                  </Link>

                  {userProfile?.role === 'admin' && (
                    <Link to={ADMIN_PATH} onClick={() => setMobileOpen(false)} style={{
                      display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:10,
                      textDecoration:'none',cursor:'pointer',marginBottom:2,
                      background:isActive(ADMIN_PATH)?'rgba(251,191,36,0.08)':'transparent',
                      border:`1px solid ${isActive(ADMIN_PATH)?'rgba(251,191,36,0.15)':'transparent'}`,
                      transition:'all 0.15s ease',
                    }}
                    onMouseEnter={e => { if(!isActive(ADMIN_PATH)){e.currentTarget.style.background='rgba(255,255,255,0.03)';} }}
                    onMouseLeave={e => { if(!isActive(ADMIN_PATH)){e.currentTarget.style.background='transparent';} }}
                    >
                      <Shield size={18} style={{ color:isActive(ADMIN_PATH)?'#fbbf24':'#6b7280',width:24,textAlign:'center' }} />
                      <span style={{ flex:1,fontSize:'0.84rem',fontWeight:isActive(ADMIN_PATH)?700:500,color:isActive(ADMIN_PATH)?'#fbbf24':'#e2e8f0' }}>Admin Panel</span>
                      {isActive(ADMIN_PATH) && <ChevronRight size={14} style={{ color:'#fbbf24',opacity:0.6 }} />}
                    </Link>
                  )}

                  <button
                    onClick={handleLogout}
                    style={{
                      display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:10,
                      background:'transparent',border:'1px solid transparent',cursor:'pointer',
                      width:'100%',textAlign:'left',transition:'all 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.06)';e.currentTarget.style.borderColor='rgba(239,68,68,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='transparent'; }}
                  >
                    <LogOut size={18} style={{ color:'#ef4444',width:24,textAlign:'center' }} />
                    <span style={{ flex:1,fontSize:'0.84rem',fontWeight:500,color:'#ef4444' }}>Sign Out</span>
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={() => setMobileOpen(false)} style={{
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                  padding:'12px 20px',borderRadius:10,marginTop:4,
                  background:'linear-gradient(135deg, #00e676, #00c853)',color:'#0a0f1e',
                  fontWeight:700,fontSize:'0.84rem',textDecoration:'none',
                  boxShadow:'0 2px 16px rgba(0,230,118,0.25)',
                }}>
                  <Zap size={14} strokeWidth={2.5} /> Sign In
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}