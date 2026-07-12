// FILE: src/components/Navbar.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogOut, User, Shield, Zap, Home, Search, Bell, Trophy,
  Star, Clock, Target, Flame, ChevronRight, CircleCheck, CircleX, TrendingUp
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
   INJECT BASE STYLES — MOBILE-FIRST
   ═══════════════════════════════════════════════════════════════ */
const injectBase = () => {
  if (document.getElementById('nv-base-v11')) return;
  const s = document.createElement('style');
  s.id = 'nv-base-v11';
  s.textContent = `
    /* ── Keyframes ── */
    @keyframes nvMarquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    @keyframes nvBannerShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes nvFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvDotBlink{0%,100%{opacity:1}50%{opacity:.2}}
    @keyframes nvRingPulse{0%{box-shadow:0 0 0 0 rgba(0,230,118,.3)}70%{box-shadow:0 0 0 6px rgba(0,230,118,0)}100%{box-shadow:0 0 0 0 rgba(0,230,118,0)}}
    @keyframes nvShine{0%{left:-100%}100%{left:200%}}
    @keyframes nvLiveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.6)}}
    @keyframes nvGlowBreathe{0%,100%{box-shadow:0 0 8px rgba(0,230,118,.15)}50%{box-shadow:0 0 22px rgba(0,230,118,.3)}}
    @keyframes nvScoreGlow{0%,100%{text-shadow:0 0 10px rgba(0,230,118,.35)}50%{text-shadow:0 0 20px rgba(0,230,118,.55)}}
    @keyframes nvBellRing{0%,100%{transform:rotate(0)}15%{transform:rotate(14deg)}30%{transform:rotate(-12deg)}45%{transform:rotate(8deg)}60%{transform:rotate(-4deg)}75%{transform:rotate(0)}}
    @keyframes nvBadgePop{0%{transform:scale(0)}60%{transform:scale(1.2)}100%{transform:scale(1)}}
    @keyframes nvStreakFire{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
    @keyframes nvBorderGlow{0%,100%{border-color:rgba(0,230,118,.06)}50%{border-color:rgba(0,230,118,.14)}}
    @keyframes nvNotifSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvOverlayIn{from{opacity:0}to{opacity:1}}
    @keyframes nvMobSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
    @keyframes nvMobItemIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
    @keyframes nvMobUserIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvMobStatPop{0%{transform:scale(.8);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
    @keyframes nvPulseGreen{0%,100%{box-shadow:0 0 0 0 rgba(0,230,118,.4)}50%{box-shadow:0 0 0 8px rgba(0,230,118,0)}}
    @keyframes nvScoreFlash{0%{color:#fff}50%{color:#00e676}100%{color:#fff}}

    /* ── Breakpoints ── */
    @media(max-width:900px){
      .nv-dk{display:none!important}
      .nv-tg{display:flex!important}
    }
    @media(min-width:901px){
      .nv-tg{display:none!important}
    }
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
  </svg>
);

const StatusDot = ({ status, size = 6 }) => {
  if (status === 'live') return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: '#00e676',
      boxShadow: '0 0 8px rgba(0,230,118,0.8), 0 0 16px rgba(0,230,118,0.3)',
      animation: 'nvLiveDot 1.2s ease-in-out infinite', display: 'inline-block', flexShrink: 0
    }} />
  );
  if (status === 'ft') return (
    <span style={{ fontSize: '0.58rem', fontWeight: 900, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>FT</span>
  );
  return <Clock size={8} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />;
};

/* ═══════════════════════════════════════════════════════════════
   NAV LINKS
   ═══════════════════════════════════════════════════════════════ */
const LINKS = [
  { to: '/', label: 'Home', icon: Home, emoji: '🏠' },
  { to: '/fixtures', label: 'Fixtures', icon: null, emoji: '⚽' },
  { to: '/mastergames', label: 'Master Games', icon: null, emoji: '🎮' },
  { to: '/predictions', label: 'Predictions', icon: Target, emoji: '🎯', badge: 'NEW' },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy, emoji: '🏆' },
  { to: '/highlights', label: 'Highlights', icon: null, emoji: '🎬' },
  { to: '/livestream', label: 'Live Stream', icon: null, emoji: '📡', isLive: true },
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

  const isHome = location.pathname === '/';
  const isActive = useCallback((p) => location.pathname === p, [location.pathname]);

  /* ═══════════════════════════════════════════════════════════
     COMPUTED
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
    const resolved = my.filter(p => scoreMap.get(String(p.matchId))).map(p => {
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

  const predNotifs = useMemo(() => {
    if (!uid) return [];
    const notifs = [];
    Object.values(userPredMap).forEach(p => {
      const actual = scoreMap.get(String(p.matchId));
      if (!actual) return;
      const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
      if (r.type === 'pending') return;
      notifs.push({
        id: p.predId, type: r.type, points: r.points,
        homeTeam: p.homeTeam || 'Home', awayTeam: p.awayTeam || 'Away',
        predScore: `${p.homeScore}-${p.awayScore}`, actualScore: `${actual.h}-${actual.a}`,
        time: p.updatedAt?.toMillis?.() || p.createdAt?.toMillis?.() || 0,
      });
    });
    return notifs.sort((a, b) => b.time - a.time);
  }, [userPredMap, scoreMap, uid]);

  const notifCount = useMemo(() => predNotifs.filter(n => !seenNotifIds.has(n.id)).length, [predNotifs, seenNotifIds]);

  const tickerMatches = useMemo(() => {
    if (bannerMatches.length === 0) return [];
    const live = bannerMatches.filter(m => m.isLive);
    const finished = bannerMatches.filter(m => m.isFinished && !m.isLive).slice(0, 5);
    const upcoming = bannerMatches.filter(m => !m.isLive && !m.isFinished).slice(0, 5);
    return [...live, ...finished, ...upcoming];
  }, [bannerMatches]);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchFixtures(todayStr());
        if (!cancelled && res?.matches?.length > 0) setBannerMatches(res.matches);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const unsub = subscribeToLiveFixtures(({ matches: liveMatches }) => {
      if (liveMatches.length === 0) return;
      const liveMap = new Map(liveMatches.map(m => [String(m.id), m]));
      setBannerMatches(prev => {
        if (prev.length === 0) return liveMatches;
        return prev.map(f => {
          const live = liveMap.get(String(f.id));
          if (!live) return f;
          return { ...f, homeScore: live.homeScore ?? f.homeScore, awayScore: live.awayScore ?? f.awayScore, isLive: true, isFinished: false, status: live.status || f.status, minute: live.minute ?? f.minute };
        });
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'active_predictions'), where('matchDate', '==', todayStr()));
    const unsub = onSnapshot(q, snap => setActivePreds(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'user_predictions'), where('matchDate', '==', todayStr()));
    const unsub = onSnapshot(q, snap => setAllPreds(snap.docs.map(d => d.data())), () => {});
    return () => unsub();
  }, []);

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

  useEffect(() => { setMobileOpen(false); setSearchOpen(false); setNotifOpen(false); }, [location.pathname]);

  useEffect(() => { document.body.style.overflow = mobileOpen ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [mobileOpen]);

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') { if (mobileOpen) setMobileOpen(false); if (searchOpen) { setSearchOpen(false); setSearchQuery(''); } if (notifOpen) setNotifOpen(false); }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [mobileOpen, searchOpen, notifOpen]);

  useEffect(() => {
    const fn = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => {
    if (notifOpen && predNotifs.length > 0) setSeenNotifIds(new Set(predNotifs.map(n => n.id)));
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
      setSearchOpen(false); setSearchQuery('');
    }
  }, [searchQuery, navigate]);

  const handleMobileNav = useCallback((to) => {
    setMobileOpen(false);
    navigate(to);
  }, [navigate]);

  /* ═══════════════════════════════════════════════════════════
     TICKER RENDERER
     ═══════════════════════════════════════════════════════════ */
  const renderTickerItem = (m, i) => {
    const status = m.isLive ? 'live' : m.isFinished ? 'ft' : 'upcoming';
    return (
      <span key={`t-${m.id}-${i}`} style={{ display:'inline-flex', alignItems:'center', gap:7, whiteSpace:'nowrap' }}>
        <StatusDot status={status} size={7} />
        <span style={{ fontWeight:800, fontSize:'0.82rem', color: m.isLive ? '#fff' : 'rgba(255,255,255,0.88)' }}>
          {m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}
        </span>
        <span style={{
          background: m.isLive ? 'rgba(0,230,118,0.22)' : m.isFinished ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
          borderRadius: 6, padding: '2px 10px',
          fontWeight: 900, fontSize: '0.78rem', letterSpacing: '0.05em',
          fontFamily: 'ui-monospace, monospace',
          color: m.isLive ? '#00e676' : m.isFinished ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
          boxShadow: m.isLive ? '0 0 12px rgba(0,230,118,0.2)' : 'none',
        }}>
          {m.homeScore ?? '?'}–{m.awayScore ?? '?'}
        </span>
        <span style={{ fontWeight:800, fontSize:'0.82rem', color: m.isLive ? '#fff' : 'rgba(255,255,255,0.88)' }}>
          {m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}
        </span>
        {m.isLive && m.minute != null && (
          <span style={{ fontSize:'0.7rem', fontWeight:800, color:'#00e676', fontFamily:'ui-monospace, monospace', minWidth:28, textAlign:'center' }}>
            {m.minute}'
          </span>
        )}
      </span>
    );
  };

  const tickerContent = tickerMatches.length > 0 ? tickerMatches.map((m, i) => renderTickerItem(m, i)) : null;
  const hasLive = tickerMatches.some(m => m.isLive);

  /* ═══════════════════════════════════════════════════════════
     NOTIFICATION ITEM RENDERER
     ═══════════════════════════════════════════════════════════ */
  const renderNotifItem = (n, i) => {
    const cfg = {
      exact:  { icon:'🏆', title:'Exact Score!', pts:'+10 pts', color:'#00e676', bg:'rgba(0,230,118,0.06)', border:'rgba(0,230,118,0.12)' },
      result: { icon:'📈', title:'Correct Result!', pts:'+3 pts', color:'#fbbf24', bg:'rgba(251,191,36,0.05)', border:'rgba(251,191,36,0.12)' },
      miss:   { icon:'❌', title:'Missed', pts:'+0 pts', color:'#ef4444', bg:'rgba(239,68,68,0.04)', border:'rgba(239,68,68,0.1)' },
    }[n.type];
    if (!cfg) return null;
    return (
      <div key={n.id} style={{
        padding:'14px 16px', display:'flex', gap:12, alignItems:'center',
        borderBottom:'1px solid rgba(255,255,255,0.04)', background:cfg.bg, cursor:'pointer',
        transition:'background 0.15s ease',
        animation:`nvNotifSlide 0.3s cubic-bezier(0.22,1,0.36,1) ${i * 50}ms both`,
      }}
      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background=cfg.bg; }}
      onClick={() => { navigate('/predictions'); setNotifOpen(false); }}
      >
        <span style={{ fontSize:'1.4rem', lineHeight:1, flexShrink:0 }}>{cfg.icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.85rem', fontWeight:800, color:cfg.color, marginBottom:3 }}>{cfg.title}</div>
          <div style={{ fontSize:'0.8rem', color:'#e2e8f0', fontWeight:600 }}>{n.homeTeam} {n.actualScore} {n.awayTeam}</div>
          <div style={{ fontSize:'0.72rem', color:'#6b7280', marginTop:2, fontWeight:500 }}>Your pick: {n.predScore}</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
          <span style={{ fontSize:'0.72rem', fontWeight:900, color:cfg.color, background:`${cfg.bg}`, padding:'3px 10px', borderRadius:6, border:`1px solid ${cfg.border}` }}>{cfg.pts}</span>
          <span style={{ fontSize:'0.62rem', color:'#4a5568', fontWeight:500 }}>{timeAgo(n.time)}</span>
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     MOBILE MENU — FULL PANEL
     ═══════════════════════════════════════════════════════════ */
  const renderMobileMenu = () => {
    if (!mobileOpen) return null;
    return (
      <>
        {/* Overlay */}
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position:'fixed', inset:0, zIndex:2000,
            background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)',
            animation:'nvOverlayIn 0.3s ease both',
          }}
        />

        {/* Panel */}
        <div style={{
          position:'fixed', top:0, right:0, bottom:0, width:'min(360px, 88vw)', zIndex:2001,
          background:'linear-gradient(180deg, #0c1220 0%, #080e1a 100%)',
          borderLeft:'1px solid rgba(0,230,118,0.08)',
          boxShadow:'-8px 0 40px rgba(0,0,0,0.5), -2px 0 0 rgba(0,230,118,0.06)',
          overflowY:'auto', WebkitOverflowScrolling:'touch',
          animation:'nvMobSlide 0.35s cubic-bezier(0.22,1,0.36,1) both',
          display:'flex', flexDirection:'column',
        }}>

          {/* ── Close button ── */}
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'16px 16px 0', flexShrink:0 }}>
            <button
              onClick={() => setMobileOpen(false)}
              style={{
                width:44, height:44, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center',
                background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)',
                color:'#9ca3af', cursor:'pointer',
              }}
            >
              <X size={22} strokeWidth={2.5} />
            </button>
          </div>

          {/* ── User card (if logged in) ── */}
          {isLoggedIn && (
            <div style={{
              margin:'16px 16px 0', padding:'20px', borderRadius:16,
              background:'linear-gradient(135deg, rgba(0,230,118,0.08) 0%, rgba(0,230,118,0.02) 100%)',
              border:'1px solid rgba(0,230,118,0.12)',
              animation:'nvMobUserIn 0.4s cubic-bezier(0.22,1,0.36,1) 0.1s both',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
                <div style={{
                  width:48, height:48, borderRadius:14,
                  background:'linear-gradient(135deg, #00e676, #00c853)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'1.2rem', fontWeight:900, color:'#0a0f1e',
                  boxShadow:'0 4px 16px rgba(0,230,118,0.25)',
                }}>
                  {(userProfile?.displayName?.[0] || 'U').toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'1.05rem', fontWeight:800, color:'#f1f5f9', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {userProfile?.displayName || 'User'}
                  </div>
                  <div style={{ fontSize:'0.78rem', fontWeight:600, color:'#6b7280', marginTop:2 }}>
                    {userProfile?.email || ''}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
                {[
                  { label: 'POINTS', value: userStats.points, color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.15)', icon: '⚡' },
                  { label: 'RANK', value: userRank != null ? `#${userRank}` : '—', color: '#00e676', bg: 'rgba(0,230,118,0.08)', border: 'rgba(0,230,118,0.15)', icon: '🏆' },
                  { label: 'STREAK', value: streak > 0 ? `${streak}🔥` : '—', color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.15)', icon: '🔥' },
                ].map((s, i) => (
                  <div key={i} style={{
                    textAlign:'center', padding:'12px 6px', borderRadius:12,
                    background: s.bg, border:`1px solid ${s.border}`,
                    animation:`nvMobStatPop 0.4s cubic-bezier(0.22,1,0.36,1) ${0.15 + i * 0.08}s both`,
                  }}>
                    <div style={{ fontSize:'0.62rem', fontWeight:700, color:s.color, letterSpacing:'0.1em', marginBottom:4, opacity:0.8 }}>{s.label}</div>
                    <div style={{ fontSize:'1.1rem', fontWeight:900, color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Prediction accuracy bar */}
              {userStats.resolved > 0 && (
                <div style={{ marginTop:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:'0.72rem', fontWeight:700, color:'#94a3b8' }}>Accuracy</span>
                    <span style={{ fontSize:'0.72rem', fontWeight:800, color:'#00e676' }}>
                      {Math.round(((userStats.exact + userStats.result) / userStats.resolved) * 100)}%
                    </span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.06)', overflow:'hidden', display:'flex' }}>
                    {userStats.exact > 0 && (
                      <div style={{ width:`${(userStats.exact / userStats.resolved) * 100}%`, background:'#00e676', borderRadius:3, transition:'width 0.5s ease' }} />
                    )}
                    {userStats.result > 0 && (
                      <div style={{ width:`${(userStats.result / userStats.resolved) * 100}%`, background:'#fbbf24', transition:'width 0.5s ease' }} />
                    )}
                  </div>
                  <div style={{ display:'flex', gap:16, marginTop:6 }}>
                    <span style={{ fontSize:'0.62rem', fontWeight:600, color:'#6b7280' }}>🎯 {userStats.exact} exact</span>
                    <span style={{ fontSize:'0.62rem', fontWeight:600, color:'#6b7280' }}>📈 {userStats.result} result</span>
                    <span style={{ fontSize:'0.62rem', fontWeight:600, color:'#6b7280' }}>❌ {userStats.miss} miss</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Search bar (mobile) ── */}
          <form
            onSubmit={(e) => { e.preventDefault(); if(searchQuery.trim()){ navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`); setMobileOpen(false); setSearchQuery(''); } }}
            style={{ margin:'16px 16px 0', position:'relative' }}
          >
            <div style={{
              display:'flex', alignItems:'center', gap:10, padding:'0 16px', height:50, borderRadius:14,
              background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
            }}>
              <Search size={18} style={{ color:'#6b7280', flexShrink:0 }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search matches, teams..."
                style={{
                  flex:1, background:'none', border:'none', outline:'none',
                  color:'#e2e8f0', fontSize:'0.95rem', fontWeight:500, fontFamily:'inherit',
                }}
              />
            </div>
          </form>

          {/* ── Nav links ── */}
          <div style={{ margin:'16px 16px 0', display:'flex', flexDirection:'column', gap:4 }}>
            {LINKS.map((link, i) => {
              const active = isActive(link.to);
              return (
                <button
                  key={link.to}
                  onClick={() => handleMobileNav(link.to)}
                  style={{
                    display:'flex', alignItems:'center', gap:14,
                    padding:'16px 18px', borderRadius:14,
                    background: active ? 'rgba(0,230,118,0.1)' : 'transparent',
                    border: active ? '1px solid rgba(0,230,118,0.2)' : '1px solid transparent',
                    color: active ? '#00e676' : '#d1d5db',
                    cursor:'pointer', textAlign:'left',
                    transition:'all 0.2s ease',
                    animation:`nvMobItemIn 0.35s cubic-bezier(0.22,1,0.36,1) ${0.12 + i * 0.05}s both`,
                  }}
                >
                  <span style={{
                    width:44, height:44, borderRadius:12,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background: active ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.04)',
                    fontSize:'1.2rem', flexShrink:0,
                    border: active ? '1px solid rgba(0,230,118,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {link.emoji}
                  </span>
                  <span style={{ flex:1, fontSize:'1rem', fontWeight: active ? 800 : 600, letterSpacing:'0.01em' }}>
                    {link.label}
                  </span>
                  {link.isLive && (
                    <span style={{
                      display:'flex', alignItems:'center', gap:5,
                      fontSize:'0.7rem', fontWeight:800, color:'#ef4444',
                      background:'rgba(239,68,68,0.1)', padding:'4px 10px', borderRadius:8,
                      border:'1px solid rgba(239,68,68,0.2)',
                    }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:'#ef4444', animation:'nvLiveDot 1.2s ease-in-out infinite', boxShadow:'0 0 8px rgba(239,68,68,0.6)' }} />
                      LIVE
                    </span>
                  )}
                  {link.badge && (
                    <span style={{
                      fontSize:'0.6rem', fontWeight:900, color:'#0a0f1e',
                      background:'linear-gradient(135deg, #00e676, #00c853)',
                      padding:'3px 10px', borderRadius:6, letterSpacing:'0.08em',
                    }}>
                      {link.badge}
                    </span>
                  )}
                  {!active && <ChevronRight size={18} style={{ color:'#4b5563', flexShrink:0 }} />}
                </button>
              );
            })}
          </div>

          {/* ── Prediction results preview (mobile) ── */}
          {isLoggedIn && predNotifs.length > 0 && (
            <div style={{ margin:'16px 16px 0' }}>
              <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#6b7280', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10, paddingLeft:4 }}>
                Recent Results
              </div>
              <div style={{ borderRadius:14, overflow:'hidden', border:'1px solid rgba(255,255,255,0.05)' }}>
                {predNotifs.slice(0, 3).map((n, i) => renderNotifItem(n, i))}
              </div>
              {predNotifs.length > 3 && (
                <button
                  onClick={() => { handleMobileNav('/predictions'); }}
                  style={{
                    width:'100%', marginTop:8, padding:'14px', borderRadius:12,
                    background:'rgba(0,230,118,0.05)', border:'1px solid rgba(0,230,118,0.1)',
                    color:'#00e676', fontSize:'0.9rem', fontWeight:700, cursor:'pointer',
                  }}
                >
                  View All {predNotifs.length} Results
                </button>
              )}
            </div>
          )}

          {/* ── Bottom actions ── */}
          <div style={{ marginTop:'auto', padding:'16px', flexShrink:0 }}>
            {isLoggedIn ? (
              <>
                {userProfile?.role === 'admin' && (
                  <button
                    onClick={() => handleMobileNav(ADMIN_PATH)}
                    style={{
                      width:'100%', display:'flex', alignItems:'center', gap:12,
                      padding:'14px 18px', borderRadius:14, marginBottom:8,
                      background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.12)',
                      color:'#fbbf24', fontSize:'0.95rem', fontWeight:700, cursor:'pointer',
                    }}
                  >
                    <Shield size={20} />
                    Admin Panel
                    <ChevronRight size={18} style={{ marginLeft:'auto', opacity:0.6 }} />
                  </button>
                )}
                <button
                  onClick={() => handleMobileNav('/profile')}
                  style={{
                    width:'100%', display:'flex', alignItems:'center', gap:12,
                    padding:'14px 18px', borderRadius:14, marginBottom:8,
                    background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
                    color:'#d1d5db', fontSize:'0.95rem', fontWeight:700, cursor:'pointer',
                  }}
                >
                  <User size={20} />
                  My Profile
                  <ChevronRight size={18} style={{ marginLeft:'auto', opacity:0.6 }} />
                </button>
                <button
                  onClick={handleLogout}
                  style={{
                    width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                    padding:'16px 18px', borderRadius:14,
                    background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.12)',
                    color:'#ef4444', fontSize:'0.95rem', fontWeight:800, cursor:'pointer',
                  }}
                >
                  <LogOut size={18} />
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => handleMobileNav('/login')}
                style={{
                  width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                  padding:'18px', borderRadius:14,
                  background:'linear-gradient(135deg, #00e676 0%, #00c853 100%)',
                  color:'#0a0f1e', fontSize:'1.05rem', fontWeight:900, cursor:'pointer', border:'none',
                  boxShadow:'0 4px 20px rgba(0,230,118,0.3)',
                  letterSpacing:'0.02em',
                }}
              >
                <Zap size={20} strokeWidth={2.5} />
                Sign In to Predict
              </button>
            )}

            {/* Branding footer */}
            <div style={{ textAlign:'center', marginTop:16, paddingTop:16, borderTop:'1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:6 }}>
                <div style={{
                  width:24, height:24, borderRadius:7,
                  background:'linear-gradient(145deg, #00e676, #00c853)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <FootballIcon size={14} />
                </div>
                <span style={{ fontWeight:900, fontSize:'0.85rem', color:'#e2e8f0' }}>ZOKA<span style={{ color:'#00e676' }}>SCORE</span></span>
              </div>
              <div style={{ fontSize:'0.68rem', fontWeight:500, color:'#4b5563' }}>zokascore.xyz</div>
            </div>
          </div>
        </div>
      </>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ╔═══════════════════════════════════════════════════════╗
          ║           COLOURED TOP BANNER / TICKER               ║
          ╚═══════════════════════════════════════════════════════╝ */}
      <div style={{
        position:'sticky', top:0, zIndex:1001, height:40, overflow:'hidden',
        display:'flex', alignItems:'center',
        background:'linear-gradient(90deg, #059669 0%, #0d9488 15%, #0891b2 30%, #0ea5e9 48%, #6366f1 65%, #a855f7 82%, #ec4899 95%, #059669 110%)',
        backgroundSize:'200% 100%',
        animation:'nvBannerShimmer 10s linear infinite',
        borderBottom:'1px solid rgba(255,255,255,0.1)',
        boxShadow:'0 2px 20px rgba(5,150,105,0.2), 0 0 40px rgba(14,165,233,0.08)',
      }}>
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'linear-gradient(90deg, rgba(0,0,0,0.45) 0%, transparent 8%, transparent 92%, rgba(0,0,0,0.45) 100%)' }} />
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)', backgroundSize:'200% 100%', animation:'nvBannerShimmer 3.5s ease-in-out infinite' }} />

        {hasLive && (
          <div style={{
            position:'absolute', left:12, zIndex:2,
            display:'flex', alignItems:'center', gap:6,
            background:'linear-gradient(135deg, #dc2626, #ef4444)',
            borderRadius:8, padding:'3px 12px',
            fontSize:'0.62rem', fontWeight:900,
            color:'white', letterSpacing:'0.14em', textTransform:'uppercase',
            boxShadow:'0 0 16px rgba(239,68,68,0.6), 0 1px 0 rgba(255,255,255,0.15) inset',
          }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'white', animation:'nvLiveDot 1.2s ease-in-out infinite', boxShadow:'0 0 6px rgba(255,255,255,0.8)' }} />
            LIVE
          </div>
        )}

        {tickerContent ? (
          <div style={{
            flex:1, overflow:'hidden',
            marginLeft: hasLive ? 76 : 16,
            marginRight:16,
            maskImage:'linear-gradient(90deg, transparent, black 4%, black 96%, transparent)',
            WebkitMaskImage:'linear-gradient(90deg, transparent, black 4%, black 96%, transparent)',
          }}>
            <div style={{
              display:'inline-flex', alignItems:'center', gap:22,
              animation:'nvMarquee 40s linear infinite',
              color:'rgba(255,255,255,0.92)',
            }}>
              {tickerContent}
              <span style={{ color:'rgba(255,255,255,0.15)', fontSize:'0.6rem' }}>⚽</span>
              {tickerContent}
              <span style={{ color:'rgba(255,255,255,0.15)', fontSize:'0.6rem' }}>⚽</span>
            </div>
          </div>
        ) : (
          <div style={{ flex:1, textAlign:'center', fontSize:'0.82rem', fontWeight:700, color:'rgba(255,255,255,0.55)', letterSpacing:'0.04em' }}>
            ⚽ zokascore.xyz — Live football scores & predictions
          </div>
        )}
      </div>

      {/* ╔═══════════════════════════════════════════════════════╗
          ║                    NAVBAR BAR                        ║
          ╚═══════════════════════════════════════════════════════╝ */}
      <nav style={{
        position:'sticky', top:40, zIndex:1000, height:60,
        background: scrolled ? 'rgba(6,11,20,0.97)' : 'rgba(6,11,20,0)',
        backdropFilter: scrolled ? 'blur(40px) saturate(190%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(40px) saturate(190%)' : 'none',
        borderBottom: `1px solid ${scrolled ? 'rgba(0,230,118,0.06)' : 'rgba(255,255,255,0)'}`,
        boxShadow: scrolled ? '0 1px 0 rgba(0,230,118,0.04), 0 8px 40px rgba(0,0,0,0.3)' : 'none',
        transition: 'all 0.5s cubic-bezier(0.22,1,0.36,1)',
        willChange: 'background, backdrop-filter, box-shadow',
        animation: scrolled ? 'nvBorderGlow 4s ease-in-out infinite' : 'none',
      }}>
        <div style={{ maxWidth:'var(--max-width, 1140px)', margin:'0 auto', padding:'0 16px', height:'100%', display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:8 }}>

          {/* ── LEFT: Home button ── */}
          <div className="nv-dk" style={{ display:'flex', alignItems:'center' }}>
            <Link to="/" style={{
              display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:9,
              fontSize:'0.8rem', fontWeight:700, textDecoration:'none', whiteSpace:'nowrap',
              color: isHome ? '#00e676' : '#6b7280',
              background: isHome ? 'rgba(0,230,118,0.08)' : 'rgba(255,255,255,0.02)',
              border: isHome ? '1px solid rgba(0,230,118,0.15)' : '1px solid rgba(255,255,255,0.06)',
              cursor:'pointer', transition:'all 0.25s ease',
              boxShadow: isHome ? '0 0 14px rgba(0,230,118,0.08)' : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(0,230,118,0.1)'; e.currentTarget.style.color='#00e676'; }}
            onMouseLeave={e => { e.currentTarget.style.background=isHome?'rgba(0,230,118,0.08)':'rgba(255,255,255,0.02)'; e.currentTarget.style.color=isHome?'#00e676':'#6b7280'; }}
            aria-label="Home"
            >
              <Home size={15} /> Home
            </Link>
          </div>

          {/* ── CENTER: Logo ── */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minWidth:0 }}>
            <Link to="/" style={{
              display:'flex', alignItems:'center', gap:10, textDecoration:'none', cursor:'pointer',
              transition:'all 0.2s ease', position:'relative',
            }}>
              <div style={{
                width:38, height:38, borderRadius:11, position:'relative', overflow:'hidden', flexShrink:0,
                background:'linear-gradient(145deg, #00e676 0%, #00c853 35%, #059669 100%)',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 0 22px rgba(0,230,118,0.3), 0 2px 10px rgba(0,230,118,0.2), 0 1px 0 rgba(255,255,255,0.2) inset',
                animation:'nvGlowBreathe 3s ease-in-out infinite',
              }}>
                <FootballIcon size={22} />
                <div style={{ position:'absolute', top:0, left:'-100%', width:'50%', height:'100%', background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', animation:'nvShine 4s ease-in-out 1.5s infinite' }} />
                <div style={{ position:'absolute', top:0, left:0, right:0, height:'45%', background:'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)', borderRadius:'11px 11px 0 0', pointerEvents:'none' }} />
              </div>
              <div className="nv-dk" style={{ display:'flex', alignItems:'baseline', gap:0 }}>
                <span style={{ fontWeight:800, fontSize:'1.15rem', letterSpacing:'0.02em', color:'#e2e8f0', whiteSpace:'nowrap' }}>ZOKA</span>
                <span style={{ fontWeight:900, fontSize:'1.15rem', letterSpacing:'0.03em', color:'#00e676', whiteSpace:'nowrap', marginLeft:1, animation:'nvScoreGlow 3s ease-in-out infinite' }}>SCORE</span>
                <span style={{ color:'#00e676', fontSize:'1.35rem', lineHeight:1, animation:'nvDotBlink 2.5s ease-in-out infinite', textShadow:'0 0 12px rgba(0,230,118,0.7)', marginLeft:0 }}>.</span>
                <span style={{ fontSize:'0.48rem', fontWeight:700, color:'#4a5568', letterSpacing:'0.12em', textTransform:'uppercase', marginLeft:3, opacity:0.35 }}>xyz</span>
              </div>
            </Link>
          </div>

          {/* ── RIGHT: Desktop actions ── */}
          <div className="nv-dk" style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0, justifyContent:'flex-end' }}>

            {/* Search */}
            <div ref={searchRef} style={{ position:'relative' }}>
              <button onClick={() => { setSearchOpen(p => !p); if(searchOpen) setSearchQuery(''); }} style={{
                width:36, height:36, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                background: searchOpen ? 'rgba(0,230,118,0.08)' : 'transparent',
                color: searchOpen ? '#00e676' : '#6b7280',
                border: `1.5px solid ${searchOpen ? 'rgba(0,230,118,0.18)' : 'transparent'}`,
                cursor:'pointer', transition:'all 0.2s ease',
              }}
              onMouseEnter={e => { if(!searchOpen){e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#e2e8f0';} }}
              onMouseLeave={e => { if(!searchOpen){e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#6b7280';} }}
              aria-label="Search"
              >
                <Search size={15} />
              </button>
              {searchOpen && (
                <form onSubmit={handleSearch} style={{
                  position:'absolute', top:'calc(100% + 8px)', right:0, width:280,
                  background:'rgba(12,18,32,0.98)', border:'1px solid rgba(0,230,118,0.12)',
                  borderRadius:12, padding:'6px', display:'flex', alignItems:'center', gap:8,
                  boxShadow:'0 12px 40px rgba(0,0,0,0.5)', backdropFilter:'blur(20px)',
                  animation:'nvFadeUp 0.25s ease both',
                }}>
                  <Search size={14} style={{ color:'#4a5568', flexShrink:0, marginLeft:8 }} />
                  <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search matches, teams..." style={{
                    flex:1, background:'none', border:'none', outline:'none', color:'#e2e8f0', fontSize:'0.85rem', fontWeight:500, fontFamily:'inherit',
                  }} />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} style={{ background:'rgba(255,255,255,0.06)', border:'none', borderRadius:6, width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', cursor:'pointer' }}>✕</button>
                  )}
                </form>
              )}
            </div>

            {/* Notifications */}
            {isLoggedIn && (
              <div ref={notifRef} style={{ position:'relative' }}>
                <button onClick={() => setNotifOpen(p => !p)} style={{
                  width:36, height:36, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                  background: notifOpen ? 'rgba(0,230,118,0.08)' : 'transparent',
                  color: notifOpen ? '#00e676' : '#6b7280',
                  border: `1.5px solid ${notifOpen ? 'rgba(0,230,118,0.18)' : 'transparent'}`,
                  cursor:'pointer', position:'relative', transition:'all 0.2s ease',
                }}
                onMouseEnter={e => { if(!notifOpen){e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#e2e8f0';} }}
                onMouseLeave={e => { if(!notifOpen){e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#6b7280';} }}
                aria-label="Notifications"
                >
                  <Bell size={15} />
                  {notifCount > 0 && (
                    <span style={{
                      position:'absolute', top:2, right:2, minWidth:18, height:18, borderRadius:9, padding:'0 4px',
                      background:'linear-gradient(135deg, #ef4444, #dc2626)', color:'white', fontSize:'0.55rem', fontWeight:900,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      boxShadow:'0 0 10px rgba(239,68,68,0.5)', border:'2px solid rgba(6,11,20,0.9)',
                      animation:'nvBadgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                    }}>{notifCount > 9 ? '9+' : notifCount}</span>
                  )}
                </button>
                {notifOpen && (
                  <div style={{
                    position:'absolute', top:'calc(100% + 8px)', right:-8, width:340,
                    background:'rgba(12,18,32,0.98)', border:'1px solid rgba(0,230,118,0.1)',
                    borderRadius:14, overflow:'hidden',
                    boxShadow:'0 16px 50px rgba(0,0,0,0.55)', backdropFilter:'blur(20px)',
                    animation:'nvFadeUp 0.25s ease both',
                  }}>
                    <div style={{ padding:'14px 18px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(180deg, rgba(0,230,118,0.03) 0%, transparent 100%)' }}>
                      <span style={{ fontSize:'0.85rem', fontWeight:800, color:'#e2e8f0' }}>Prediction Results</span>
                      {predNotifs.length > 0 && (
                        <span style={{ fontSize:'0.62rem', fontWeight:800, color:'#00e676', background:'rgba(0,230,118,0.1)', padding:'3px 10px', borderRadius:20 }}>{predNotifs.length} results</span>
                      )}
                    </div>
                    {predNotifs.length === 0 ? (
                      <div style={{ padding:'32px 24px', textAlign:'center' }}>
                        <Target size={30} style={{ color:'#4a5568', marginBottom:12, opacity:0.5 }} />
                        <div style={{ fontSize:'0.85rem', fontWeight:700, color:'#6b7280', marginBottom:4 }}>No results yet</div>
                        <div style={{ fontSize:'0.78rem', color:'#4a5568' }}>Make predictions and check back after matches end</div>
                      </div>
                    ) : (
                      <div style={{ maxHeight:340, overflowY:'auto' }}>
                        {predNotifs.slice(0, 8).map((n, i) => renderNotifItem(n, i))}
                      </div>
                    )}
                    {predNotifs.length > 0 && (
                      <Link to="/predictions" onClick={() => setNotifOpen(false)} style={{
                        display:'block', textAlign:'center', padding:'12px', fontSize:'0.82rem', fontWeight:700, color:'#00e676',
                        textDecoration:'none', background:'rgba(0,230,118,0.03)', transition:'background 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background='rgba(0,230,118,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background='rgba(0,230,118,0.03)'; }}
                      >View all predictions</Link>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Points badge */}
            {isLoggedIn && userStats.resolved > 0 && (
              <div onMouseEnter={() => setPointsHover(true)} onMouseLeave={() => setPointsHover(false)} style={{
                display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:20,
                background: pointsHover ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.04)',
                border: `1px solid ${pointsHover ? 'rgba(251,191,36,0.18)' : 'rgba(251,191,36,0.08)'}`,
                cursor:'default', transition:'all 0.25s ease',
              }}>
                <span style={{ fontSize:'0.9rem', animation:'nvStreakFire 2s ease-in-out infinite' }}>⚡</span>
                <span style={{ fontWeight:900, fontSize:'0.85rem', color:'#fbbf24', fontFamily:'ui-monospace, monospace' }}>{userStats.points.toLocaleString()}</span>
                <span style={{ fontSize:'0.55rem', fontWeight:700, color:'#92400e', background:'rgba(251,191,36,0.1)', padding:'2px 7px', borderRadius:4, opacity:0.7 }}>PTS</span>
                {streak > 0 && (
                  <span style={{ fontSize:'0.6rem', fontWeight:800, color:'#f97316', display:'flex', alignItems:'center', gap:2, marginLeft:2, opacity: pointsHover ? 1 : 0.6 }}>🔥{streak}</span>
                )}
              </div>
            )}

            {/* Desktop nav links */}
            <div ref={linksRef} style={{ position:'relative', display:'flex', alignItems:'center', height:'100%' }}>
              {LINKS.map((link, i) => {
                const active = isActive(link.to);
                return (
                  <Link key={link.to} to={link.to} data-act={active?'1':'0'} style={{
                    position:'relative', display:'flex', alignItems:'center', height:'100%', padding:'0 13px',
                    fontSize:'0.8rem', fontWeight: active ? 700 : 500, color: active ? '#00e676' : '#6b7280',
                    background:'none', border:'none', cursor:'pointer', textDecoration:'none',
                    transition:'all 0.25s ease', whiteSpace:'nowrap', gap:5,
                    textShadow: active ? '0 0 16px rgba(0,230,118,0.4)' : 'none',
                  }}
                  onMouseEnter={e => { if(!active){e.currentTarget.style.color='#e2e8f0';} }}
                  onMouseLeave={e => { if(!active){e.currentTarget.style.color='#6b7280';} }}
                  >
                    <span style={{ fontSize:'0.72rem', opacity:0.7 }}>{link.emoji}</span>
                    {link.label}
                    {link.isLive && <span style={{ width:5, height:5, borderRadius:'50%', background:'#ef4444', boxShadow:'0 0 8px rgba(239,68,68,0.6)', animation:'nvLiveDot 1.5s ease-in-out infinite' }} />}
                    {link.badge && <span style={{ fontSize:'0.45rem', fontWeight:900, color:'#0a0f1e', background:'linear-gradient(135deg, #00e676, #00c853)', padding:'2px 6px', borderRadius:4, letterSpacing:'0.06em' }}>{link.badge}</span>}
                  </Link>
                );
              })}
              <div style={{
                position:'absolute', bottom:0, height:2.5,
                background:'linear-gradient(90deg, transparent, #00e676, transparent)',
                borderRadius:'2px 2px 0 0', pointerEvents:'none',
                transition:'left 0.45s cubic-bezier(0.22,1,0.36,1), width 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease',
                left:indicator.left, width:indicator.width, opacity:indicator.opacity,
                boxShadow:'0 0 12px rgba(0,230,118,0.7), 0 0 30px rgba(0,230,118,0.25)',
              }} />
            </div>

            {/* Auth icons — desktop */}
            {isLoggedIn ? (
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                {userProfile?.role === 'admin' && (
                  <Link to={ADMIN_PATH} style={{
                    width:36, height:36, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                    background: isActive(ADMIN_PATH) ? 'rgba(0,230,118,0.08)' : 'transparent',
                    color: isActive(ADMIN_PATH) ? '#00e676' : '#6b7280',
                    border: `1.5px solid ${isActive(ADMIN_PATH) ? 'rgba(0,230,118,0.18)' : 'transparent'}`,
                    cursor:'pointer', textDecoration:'none', transition:'all 0.2s ease',
                  }}
                  onMouseEnter={e => { if(!isActive(ADMIN_PATH)){e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#e2e8f0';} }}
                  onMouseLeave={e => { if(!isActive(ADMIN_PATH)){e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#6b7280';} }}
                  title="Admin"><Shield size={15} /></Link>
                )}
                <Link to="/profile" style={{
                  width:36, height:36, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                  background: isActive('/profile') ? 'rgba(0,230,118,0.08)' : 'transparent',
                  color: isActive('/profile') ? '#00e676' : '#6b7280',
                  border: `1.5px solid ${isActive('/profile') ? 'rgba(0,230,118,0.18)' : 'transparent'}`,
                  cursor:'pointer', textDecoration:'none', transition:'all 0.2s ease',
                }}
                onMouseEnter={e => { if(!isActive('/profile')){e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#e2e8f0';} }}
                onMouseLeave={e => { if(!isActive('/profile')){e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#6b7280';} }}
                title="Profile"><User size={15} /></Link>
              </div>
            ) : (
              <Link to="/login" style={{
                display:'flex', alignItems:'center', gap:7, padding:'8px 22px', borderRadius:9,
                background:'linear-gradient(135deg, #00e676 0%, #00c853 100%)', color:'#0a0f1e',
                fontWeight:800, fontSize:'0.82rem', textDecoration:'none', letterSpacing:'0.01em',
                transition:'all 0.25s ease',
                boxShadow:'0 2px 16px rgba(0,230,118,0.28), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px) scale(1.02)'; e.currentTarget.style.boxShadow='0 6px 28px rgba(0,230,118,0.4), inset 0 1px 0 rgba(255,255,255,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0) scale(1)'; e.currentTarget.style.boxShadow='0 2px 16px rgba(0,230,118,0.28), inset 0 1px 0 rgba(255,255,255,0.25)'; }}
              >
                <Zap size={14} strokeWidth={2.5} /> Sign In
              </Link>
            )}
          </div>

          {/* ── MOBILE RIGHT: Points + Admin + Hamburger ── */}
          <div className="nv-tg" style={{ display:'none', alignItems:'center', gap:6, justifyContent:'flex-end' }}>

            {/* Mobile points pill */}
            {isLoggedIn && userStats.resolved > 0 && (
              <div style={{
                display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:20,
                background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.15)',
              }}>
                <span style={{ fontSize:'0.85rem' }}>⚡</span>
                <span style={{ fontWeight:900, fontSize:'0.82rem', color:'#fbbf24', fontFamily:'ui-monospace, monospace' }}>{userStats.points.toLocaleString()}</span>
                {streak > 0 && <span style={{ fontSize:'0.7rem' }}>🔥</span>}
              </div>
            )}

            {/* Mobile admin */}
            {isLoggedIn && userProfile?.role === 'admin' && (
              <Link to={ADMIN_PATH} style={{
                width:38, height:38, alignItems:'center', justifyContent:'center', borderRadius:10,
                border:'1px solid rgba(251,191,36,0.2)', background:'rgba(251,191,36,0.08)',
                cursor:'pointer', textDecoration:'none', display:'flex', color:'#fbbf24',
              }}><Shield size={17} /></Link>
            )}

            {/* Mobile notifications bell */}
            {isLoggedIn && notifCount > 0 && (
              <div style={{
                width:38, height:38, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center',
                background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)',
                position:'relative', cursor:'pointer', color:'#ef4444',
              }} onClick={() => { setMobileOpen(true); }}>
                <Bell size={17} />
                <span style={{
                  position:'absolute', top:4, right:4, minWidth:16, height:16, borderRadius:8, padding:'0 3px',
                  background:'#ef4444', color:'white', fontSize:'0.5rem', fontWeight:900,
                  display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #0c1220',
                }}>{notifCount > 9 ? '9+' : notifCount}</span>
              </div>
            )}

            {/* Hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              style={{
                width:44, height:44, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center',
                background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)',
                color:'#e2e8f0', cursor:'pointer', transition:'all 0.15s ease',
              }}
              aria-label="Open menu"
            >
              <Menu size={22} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </nav>

      {/* ╔═══════════════════════════════════════════════════════╗
          ║                MOBILE MENU PANEL                     ║
          ╚═══════════════════════════════════════════════════════╝ */}
      {renderMobileMenu()}
    </>
  );
}