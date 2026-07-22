// ═══════════════════════════════════════════════════════════════════════════════════════
// FILE: src/components/Navbar.jsx
// ZOKA PRO — Smart Context Sync, Direct Fast Fetch, No Stale Data, Zero Render Jank
// ═══════════════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogOut, User, Shield, Zap, Home, Search, Bell,
  Clock, Target, ChevronRight, ChevronDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { isLiveStatus, isFinishedStatus, SPORT, calcPoints } from '../utils/constants';
import { todayStr } from '../utils/dates';
import { db } from '../utils/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import SEO from '../components/SEO';

const ADMIN_PATH = '/zks-admin-8f9x2-control-panel';
const ADMIN_REMEMBER_KEY = 'nv-admin-remembered';
const APP_LOGO = '/icons/icon-192.png';

/* ═══════════════════════════════════════════════════
   HELPERS & SVG
   ═══════════════════════════════════════════════════ */
function normalizeMatch(raw) {
  if (!raw) return null;
  const id = String(raw.id || raw.matchId);
  const status = raw.status || '';
  const isLive = raw.isLive || isLiveStatus(status, SPORT.FOOTBALL);
  const isFinished = raw.isFinished || isFinishedStatus(status, SPORT.FOOTBALL);
  
  const homeScore = raw.homeScore ?? raw.score?.fullTime?.home ?? null;
  const awayScore = raw.awayScore ?? raw.score?.fullTime?.away ?? null;

  return {
    id, status, isLive, isFinished,
    homeTeam: { name: raw.homeTeam?.name || 'TBD', shortName: raw.homeTeam?.shortName || raw.homeTeam?.name || 'TBD', logo: raw.homeTeam?.logo || raw.homeTeam?.crest },
    awayTeam: { name: raw.awayTeam?.name || 'TBD', shortName: raw.awayTeam?.shortName || raw.awayTeam?.name || 'TBD', logo: raw.awayTeam?.logo || raw.awayTeam?.crest },
    homeScore, awayScore,
    league: { name: raw.league?.name || raw.competition?.name || 'Other' },
    minute: raw.minute || raw.elapsed || null,
    kickoff: raw.kickoff || (raw.date ? new Date(raw.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'TBD')
  };
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - (ts?.toMillis?.() || ts);
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const StatusDot = React.memo(({ status, size = 6 }) => {
  if (status === 'live') return <span style={{ width: size, height: size, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.8)', animation: 'nvLiveDot 1.2s ease-in-out infinite', display: 'inline-block', flexShrink: 0 }} />;
  if (status === 'ft') return <span style={{ fontSize: '0.58rem', fontWeight: 900, color: 'rgba(255,255,255,0.35)' }}>FT</span>;
  return <Clock size={8} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />;
});

const LINKS = [
  { to: '/', label: 'Home', emoji: '🏠' },
  { to: '/fixtures', label: 'Fixtures', emoji: '⚽' },
  { to: '/highlights', label: 'Highlights & NEWS', emoji: '🎬' },
  { to: '/predictions', label: 'Predictions', emoji: '🎯', badge: 'NEW' },
  { to: '/basketball', label: 'Hoops', emoji: '🏀' },
  { to: '/leaderboard', label: 'Ranks', emoji: '🏆' },
  { to: '/mastergames', label: 'other Games', emoji: '🎮' },
  { to: '/studio', label: 'Studio', emoji: '🎨', badge: 'NEW' },
  { to: '/livestream', label: 'Stream', emoji: '📡', isLive: true },
];

const infoSections = [
  { title: "Company", links: [["ℹ️ About", "/about"], ["📧 Contact", "/contact"], ["💼 Careers", "/careers"], ["🤝 Partners", "/partners"], ["📢 Advertise", "/advertise"], ["👥 Team", "/team"]] },
  { title: "Support", links: [["❓ Help Center", "/help"], ["❓ FAQ", "/faq"]] },
  { title: "Legal", links: [["🔒 Privacy Policy", "/privacy"], ["📋 Terms of Service", "/terms"]] },
];

/* ═══════════════════════════════════════════════════
   PRO HEADER COMPONENT
   ═══════════════════════════════════════════════════ */
const ProHeader = React.memo(({ matches, liveMatches, nav }) => {
  const featured = useMemo(() => {
    const liveWithScore = liveMatches.find(m => m.isLive && m.homeScore != null && m.awayScore != null);
    if (liveWithScore) return { match: liveWithScore, isLive: true };
    const anyLive = liveMatches[0];
    if (anyLive) return { match: anyLive, isLive: true };
    const upcoming = matches.find(m => !m.isLive && !m.isFinished && m.homeTeam && m.awayTeam);
    if (upcoming) return { match: upcoming, isLive: false };
    return null;
  }, [matches, liveMatches]);

  if (!featured) return null;

  const m = featured.match;
  const homeLogo = m.homeTeam?.logo;
  const awayLogo = m.awayTeam?.logo;
  const homeName = m.homeTeam?.shortName || m.homeTeam?.name || 'TBD';
  const awayName = m.awayTeam?.shortName || m.awayTeam?.name || 'TBD';
  const koTime = m.kickoff?.includes('T') ? m.kickoff.split('T')[1]?.split(':').slice(0, 2).join(':') || '' : m.kickoff || '';

  return (
    <div className="nv-pro-wrap" onClick={() => nav(m.id ? `/predictions?match=${m.id}` : '/predictions')} style={{ cursor: 'pointer', textDecoration: 'none', display: 'block' }}>
      <div className="nv-pro-inner">
        <div className="nv-pro-tag">
          {featured.isLive && <span className="nv-pro-live-dot" />}
          <span>{m.league?.name || 'Featured Match'}</span>
        </div>
        <div className="nv-pro-teams">
          <div className="nv-pro-team">
            {homeLogo ? <img src={homeLogo} alt="" className="nv-pro-team-logo" onError={e => { e.target.style.display = 'none'; }} /> : null}
            <span>{homeName}</span>
          </div>
          <div className="nv-pro-score-bar">
            {featured.isLive && m.homeScore != null ? (
              <>
                <span className="nv-pro-score nv-pro-score-live">{m.homeScore}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '1rem', fontWeight: 700 }}>:</span>
                <span className="nv-pro-score nv-pro-score-live">{m.awayScore}</span>
              </>
            ) : m.kickoff ? (
              <span className="nv-pro-time"><Clock size={12} /> {koTime}</span>
            ) : (
              <span className="nv-pro-vs">VS</span>
            )}
          </div>
          <div className="nv-pro-team nv-pro-team-aw">
            {awayLogo ? <img src={awayLogo} alt="" className="nv-pro-team-logo" onError={e => { e.target.style.display = 'none'; }} /> : null}
            <span>{awayName}</span>
          </div>
        </div>
        {featured.isLive && m.minute != null && (
          <div className="nv-pro-minute">
            <span className="nv-pro-live-dot" style={{ width: 6, height: 6 }} />
            <span>{m.minute}'</span>
          </div>
        )}
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   MEMOIZED TICKER ITEM (Prevents re-rendering entire marquee on every score tick)
   ═══════════════════════════════════════════════════ */
const TickerItem = React.memo(({ m }) => {
  const status = m.isLive ? 'live' : m.isFinished ? 'ft' : 'upcoming';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
      <StatusDot status={status} size={7} />
      <span style={{ fontWeight: 800, fontSize: '.85rem', color: m.isLive ? '#fff' : 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>
        {m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}
      </span>
      <span style={{
        background: m.isLive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
        borderRadius: 6, padding: '3px 12px', fontWeight: 900, fontSize: '.8rem', letterSpacing: '0.05em',
        fontFamily: 'ui-monospace, monospace',
        color: m.isLive ? '#10b981' : 'rgba(255,255,255,0.6)',
        boxShadow: m.isLive ? '0 0 10px rgba(16,185,129,0.1)' : 'none',
        border: '1px solid rgba(255,255,255,0.05)'
      }}>
        {m.homeScore ?? '?'} - {m.awayScore ?? '?'}
      </span>
      <span style={{ fontWeight: 800, fontSize: '.85rem', color: m.isLive ? '#fff' : 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>
        {m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}
      </span>
      {m.isLive && m.minute != null && (
        <span style={{ fontSize: '.7rem', fontWeight: 800, color: '#10b981', fontFamily: 'ui-monospace, monospace', minWidth: 28, textAlign: 'center' }}>{m.minute}'</span>
      )}
    </span>
  );
});

/* ═══════════════════════════════════════════════════
   MEMOIZED NOTIFICATION ITEM
   ═══════════════════════════════════════════════════ */
const NotifItem = React.memo(({ n }) => {
  if (n.type === 'admin') {
    return (
      <div style={{
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(59,130,246,0.05)', borderLeft: '3px solid rgba(59,130,246,0.5)',
        animation: 'nvNotifSlide 0.3s ease both',
      }}>
        <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>📣</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', marginBottom: 3 }}>{n.title}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>{n.body}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{timeAgo(n.time)}</div>
        </div>
      </div>
    );
  }

  const isExact = n.type === 'exact';
  const isResult = n.type === 'result';
  const bgColor = isExact ? 'rgba(16,185,129,0.05)' : isResult ? 'rgba(251,191,36,0.05)' : 'rgba(239,68,68,0.05)';
  const borderColor = isExact ? 'rgba(16,185,129,0.3)' : isResult ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)';
  const icon = isExact ? '🎯' : isResult ? '👍' : '😔';
  const label = isExact ? 'EXACT' : isResult ? 'CORRECT' : 'MISS';
  const labelColor = isExact ? '#10b981' : isResult ? '#fbbf24' : '#ef4444';

  return (
    <div key={n.id} style={{
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: bgColor, borderLeft: `3px solid ${borderColor}`,
      animation: 'nvNotifSlide 0.3s ease both',
    }}>
      <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: 4, textTransform: 'uppercase' }}>
          {n.homeTeam} vs {n.awayTeam}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>Pred: <span style={{ color: '#fff', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{n.predScore}</span></span>
          <span>Act: <span style={{ color: '#fff', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{n.actualScore}</span></span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.55rem', fontWeight: 900, color: labelColor, letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
        {n.points > 0 && (
          <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'ui-monospace, monospace', animation: 'nvPointsCount 0.4s ease both' }}>+{n.points}</div>
        )}
        <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{timeAgo(n.time)}</div>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function Navbar() {
  const { currentUser, userProfile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const uid = currentUser?.uid;
  const isLoggedIn = !!uid;

  const appData = useAppData();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [pointsHover, setPointsHover] = useState(false);
  const [seenNotifIds, setSeenNotifIds] = useState(new Set());
  
  const [rememberedAdmin, setRememberedAdmin] = useState(() => {
    try { return localStorage.getItem(ADMIN_REMEMBER_KEY) === 'true'; } catch { return false; }
  });
  const [adminNotifs, setAdminNotifs] = useState([]);

  // Direct fast state for matches to bypass FootballDataContext stale cache
  const [bannerMatches, setBannerMatches] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);

  useEffect(() => {
    if (!isLoggedIn) {
      try { localStorage.removeItem(ADMIN_REMEMBER_KEY); } catch {}
      setRememberedAdmin(false);
      return;
    }
    if (userProfile) {
      if (userProfile.role === 'admin') {
        try { localStorage.setItem(ADMIN_REMEMBER_KEY, 'true'); } catch {}
        setRememberedAdmin(true);
      } else {
        try { localStorage.removeItem(ADMIN_REMEMBER_KEY); } catch {}
        setRememberedAdmin(false);
      }
    }
  }, [isLoggedIn, userProfile]);

  const isAdmin = userProfile ? userProfile.role === 'admin' : rememberedAdmin;

  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const mobNotifRef = useRef(null);
  const rafRef = useRef(false);

  const isHome = location.pathname === '/';
  const isActive = useCallback((p) => location.pathname === p, [location.pathname]);

  const activePreds = appData.activePredictions || [];
  const allPreds = useMemo(() => Object.values(appData.userPredictions || {}), [appData.userPredictions]);
  const dailyEntries = appData.dailyLeaderboard?.entries || [];

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
  }, [userPredMap, scoreMap, activePreds.length]);

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
    return dailyEntries.find(u => u.uid === uid)?.rank || null;
  }, [dailyEntries, uid]);

  const predNotifs = useMemo(() => {
    const combined = [];
    adminNotifs.forEach(n => {
      combined.push({ id: n.id, type: 'admin', title: n.title, body: n.body, time: n.createdAt?.toMillis?.() || 0 });
    });
    if (uid) {
      Object.values(userPredMap).forEach(p => {
        const actual = scoreMap.get(String(p.matchId));
        if (!actual) return;
        const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
        if (r.type === 'pending') return;
        combined.push({
          id: `pred-${p.predId}`, type: r.type, points: r.points,
          homeTeam: p.homeTeam || 'Home', awayTeam: p.awayTeam || 'Away',
          predScore: `${p.homeScore}-${p.awayScore}`, actualScore: `${actual.h}-${actual.a}`,
          time: p.updatedAt?.toMillis?.() || p.createdAt?.toMillis?.() || 0,
        });
      });
    }
    return combined.sort((a, b) => b.time - a.time);
  }, [adminNotifs, userPredMap, scoreMap, uid]);

  const notifCount = useMemo(() => predNotifs.filter(n => !seenNotifIds.has(n.id)).length, [predNotifs, seenNotifIds]);

  const tickerMatches = useMemo(() => {
    if (bannerMatches.length === 0) return [];
    const live = bannerMatches.filter(m => m.isLive);
    const finished = bannerMatches.filter(m => m.isFinished && !m.isLive).slice(0, 5);
    const upcoming = bannerMatches.filter(m => !m.isLive && !m.isFinished).slice(0, 5);
    return [...live, ...finished, ...upcoming];
  }, [bannerMatches]);

  /* ═══ EFFECTS ═══ */
  // Direct fetch and subscribe to live fixtures
  useEffect(() => {
    let mnt = true;
    (async () => {
      try {
        const res = await fetchFixtures(todayStr());
        if (mnt && res) {
          const l = Array.isArray(res) ? res : res?.matches || [];
          setBannerMatches(l.map(m => normalizeMatch(m)).filter(Boolean));
        }
      } catch { /* silent */ }
    })();

    const unsub = subscribeToLiveFixtures(({ matches: lm }) => {
      if (!mnt || !lm) return;
      setLiveMatches(lm);
      
      // ★ FIX: Strict change detection to prevent UI Jank (Marquee re-render stutter)
      setBannerMatches(prev => {
        let changed = false;
        const next = prev.map(f => {
          if (f.isFinished) return f; // Sticky FT Shield

          const live = lm.find(m => String(m.id) === String(f.id));
          if (!live) return f;

          const liveNorm = normalizeMatch(live);
          
          if (liveNorm.isFinished) {
            changed = true;
            return { ...f, homeScore: liveNorm.homeScore, awayScore: liveNorm.awayScore, isLive: false, isFinished: true, status: liveNorm.status };
          }

          // Only trigger update if score, minute, or status actually changed
          if (f.homeScore !== live.homeScore || f.awayScore !== live.awayScore || f.isLive !== true || f.minute !== live.minute || f.status !== live.status) {
            changed = true;
            return { ...f, homeScore: live.homeScore ?? f.homeScore, awayScore: live.awayScore ?? f.awayScore, isLive: true, isFinished: false, status: live.status || f.status, minute: live.minute ?? f.minute };
          }
          
          return f;
        });
        return changed ? next : prev; // BAIL OUT IF NOTHING CHANGED
      });
    });

    return () => { mnt = false; if (unsub) unsub(); };
  }, []);

  // Only fetch Admin Notifications directly
  useEffect(() => {
    if (!db) { setAdminNotifs([]); return; }
    const q = query(collection(db, 'notifications'), where('targetUid', 'in', [null, uid || '__guest__']));
    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      notifs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      
      setAdminNotifs(prev => {
        // Prevent re-render if notification bodies/ids are identical
        if (prev.length !== notifs.length) return notifs;
        if (prev[0]?.id !== notifs[0]?.id || prev[0]?.body !== notifs[0]?.body) return notifs;
        return prev;
      });
    }, () => {});
    return () => unsub();
  }, [db, uid]);

  // Scroll listener with strict bail-out
  useEffect(() => {
    const fn = () => {
      if (!rafRef.current) { 
        rafRef.current = true; 
        requestAnimationFrame(() => { 
          const isScrolled = window.scrollY > 10;
          setScrolled(prev => prev === isScrolled ? prev : isScrolled); 
          rafRef.current = false; 
        }); 
      }
    };
    window.addEventListener('scroll', fn, { passive: true });
    setScrolled(window.scrollY > 10);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => { setMobileOpen(false); setSearchOpen(false); setNotifOpen(false); setInfoOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [mobileOpen]);

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') { setMobileOpen(false); setSearchOpen(false); setNotifOpen(false); }
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target) && mobNotifRef.current && !mobNotifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('keydown', fn);
    document.addEventListener('mousedown', fn);
    return () => {
      document.removeEventListener('keydown', fn);
      document.removeEventListener('mousedown', fn);
    };
  }, []);

  useEffect(() => {
    if (notifOpen && predNotifs.length > 0) {
      setSeenNotifIds(prev => {
        const newSet = new Set(predNotifs.map(n => n.id));
        // Prevent infinite loop
        if (prev.size === newSet.size && [...newSet].every(id => prev.has(id))) return prev;
        return newSet;
      });
    }
  }, [notifOpen, predNotifs]);

  /* ═══ HANDLERS ═══ */
  const handleLogout = useCallback(async () => {
    setMobileOpen(false);
    try { localStorage.removeItem(ADMIN_REMEMBER_KEY); } catch {}
    setRememberedAdmin(false);
    try { await signOut(); } catch { /* */ }
    navigate('/');
  }, [signOut, navigate]);

  const handleSearch = useCallback((e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false); setSearchQuery('');
    }
  }, [searchQuery, navigate]);

  const handleMobileNav = useCallback((to) => { 
    setMobileOpen(false); 
    setTimeout(() => navigate(to), 250);
  }, [navigate]);

  /* ═══ DERIVED MEMOS FOR RENDER ═══ */
  const tickerContent = useMemo(() => {
    return tickerMatches.length > 0 ? tickerMatches.map((m) => <TickerItem key={`t-${m.id}`} m={m} />) : null;
  }, [tickerMatches]);

  const hasLive = useMemo(() => tickerMatches.some(m => m.isLive), [tickerMatches]);

  const renderNotifDropdown = useCallback(() => (
    <div style={{
      position: 'absolute', top: 'calc(100% + 12px)', right: 0, width: 'min(360px, 90vw)',
      background: 'rgba(10,15,25,0.95)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      animation: 'nvFadeUp 0.3s cubic-bezier(0.22,1,0.36,1) both',
      backdropFilter: 'blur(20px)'
    }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(168,85,247,0.03) 100%)',
      }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <Bell size={16} style={{ color: '#10b981' }} /> Notifications
        </span>
        {predNotifs.length > 0 && (
          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(16,185,129,0.2)' }}>{predNotifs.length} New</span>
        )}
      </div>
      {predNotifs.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Target size={28} style={{ color: '#4a5568', opacity: 0.5 }} />
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>No results yet</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5}}>Make predictions and check back<br />after matches end</div>
        </div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: 'auto' }} className="nv-mob-scroll">
          {predNotifs.map(n => <NotifItem key={n.id} n={n} />)}
        </div>
      )}
    </div>
  ), [predNotifs]);

  return (
    <>
      <SEO
        title="ZokaPredict — Live Football Scores & Predictions"
        description="Live football scores, match predictions, and leaderboard rankings on ZokaPredict."
        keywords="football live scores, predictions, leaderboard, ZokaPredict"
        path="/"
      />

      <ProHeader matches={bannerMatches} liveMatches={liveMatches} nav={navigate} />

      <div style={{
        position: 'sticky', top: 0, zIndex: 1001, height: 42, overflow: 'hidden',
        display: 'flex', alignItems: 'center',
        background: 'linear-gradient(180deg, #000000 0%, #05070a 100%)',
        borderBottom: '1px solid rgba(16,185,129,0.1)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(0,0,0,0.8) 0%, transparent 10%, transparent 90%, rgba(0,0,0,0.8) 100%)' }} />
        {hasLive && (
          <div style={{
            position: 'absolute', left: 12, zIndex: 2, display: 'flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, #dc2626, #ef4444)', borderRadius: 8, padding: '4px 14px',
            fontSize: '0.65rem', fontWeight: 900, color: 'white', letterSpacing: '0.15em', textTransform: 'uppercase',
            boxShadow: '0 0 20px rgba(239,68,68,0.6)', animation: 'nvPulseGreen 2s ease-in-out infinite',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'nvLiveDot 1.2s ease-in-out infinite', boxShadow: '0 0 8px rgba(255,255,255,0.9)' }} />
            LIVE
          </div>
        )}
        {tickerContent ? (
          <div style={{
            flex: 1, overflow: 'hidden', marginLeft: hasLive ? 90 : 16, marginRight: 16,
            maskImage: 'linear-gradient(90deg, transparent, black 5%, black 95%, transparent)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, black 5%, black 95%, transparent)',
          }}>
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 30, 
              animation: 'nvMarquee 240s linear infinite', 
              color: 'rgba(255,255,255,0.92)',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              WebkitFontSmoothing: 'antialiased'
            }}>
              {tickerContent}
              <span style={{ color: 'rgba(16,185,129,0.3)', fontSize: '0.6rem' }}>⚽</span>
              {tickerContent}
              <span style={{ color: 'rgba(16,185,129,0.3)', fontSize: '0.6rem' }}>⚽</span>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, textAlign: 'center', fontSize: '.85rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
            ⚽ zokascore.xyz — Live football scores & predictions
          </div>
        )}
      </div>

      <nav className="nv-main-nav" style={{
        position: 'sticky', top: 42, zIndex: 1000, height: 68,
        background: scrolled ? 'rgba(5,7,10,0.85)' : 'rgba(5,7,10,0)',
        backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
        borderBottom: `1px solid ${scrolled ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0)'}`,
        boxShadow: scrolled ? '0 8px 32px rgba(0,0,0,0.3)' : 'none',
        transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)',
        willChange: 'background, backdrop-filter, box-shadow',
      }}>
        <div style={{ maxWidth: 'var(--max-width, 1140px)', margin: '0 auto', padding: '0 20px', height: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 12 }}>
          
          <div className="nv-dk" style={{ display: 'flex', alignItems: 'center' }}>
            <Link to="/" className={`nv-nav-link ${isHome ? 'active' : ''}`} style={{ padding: '8px 16px', borderRadius: 8 }} aria-label="Home">
              <Home size={16} strokeWidth={2.5} /> Home
            </Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }} className="nv-logo-link">
              <img src={APP_LOGO} alt="ZokaScore Logo" style={{ width: 42, height: 42, borderRadius: 12, objectFit: 'cover', boxShadow: '0 0 20px rgba(16,185,129,0.3), 0 4px 12px rgba(0,0,0,0.3)', animation: 'nvLogoFloat 4s ease-in-out infinite' }} />
              <div className="nv-dk" style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
                <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '0.02em', color: '#ffffff', whiteSpace: 'nowrap' }}>ZOKA</span>
                <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '0.03em', color: '#10b981', whiteSpace: 'nowrap', marginLeft: 2, animation: 'nvScoreGlow 3s ease-in-out infinite' }}>SCORE</span>
                <span style={{ color: '#10b981', fontSize: '1.5rem', lineHeight: 1, animation: 'nvDotBlink 2.5s ease-in-out infinite', textShadow: '0 0 12px rgba(16,185,129,0.7)', marginLeft: 0, opacity: 0.5 }}>.</span>
                <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.15em', textTransform: 'uppercase', marginLeft: 4, opacity: 0.8 }}>xyz</span>
              </div>
            </Link>
          </div>

          <div className="nv-dk" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, justifyContent: 'flex-end' }}>
            
            <div ref={searchRef} style={{ position: 'relative' }}>
              <button onClick={() => { setSearchOpen(p => !p); if (searchOpen) setSearchQuery(''); }} className={`nv-action-btn ${searchOpen ? 'active' : ''}`} aria-label="Search">
                <Search size={18} strokeWidth={2.5} />
              </button>
              {searchOpen && (
                <form onSubmit={handleSearch} style={{
                  position: 'absolute', top: 'calc(100% + 12px)', right: 0, width: 300,
                  background: 'rgba(10,15,25,0.95)', border: '1px solid rgba(16,185,129,0.15)',
                  borderRadius: 12, overflow: 'hidden',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                  animation: 'nvFadeUp 0.2s ease both',
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 46,
                  backdropFilter: 'blur(20px)'
                }}>
                  <Search size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                  <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search matches, teams..." style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    color: '#fff', fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit', minWidth: 0,
                  }} />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                  )}
                </form>
              )}
            </div>

            {isLoggedIn && (
              <div ref={notifRef} style={{ position: 'relative' }}>
                <button onClick={() => setNotifOpen(p => !p)} className={`nv-action-btn ${notifOpen ? 'active' : ''}`} style={{ animation: notifCount > 0 && !notifOpen ? 'nvBellRing 3s ease-in-out infinite' : 'none' }} aria-label="Notifications">
                  <Bell size={18} strokeWidth={2.5} />
                  {notifCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, padding: '0 4px',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white',
                      fontSize: '0.55rem', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px solid #05070a',
                      boxShadow: '0 0 12px rgba(239,68,68,0.6)',
                      animation: 'nvBadgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                    }}>{notifCount > 9 ? '9+' : notifCount}</span>
                  )}
                </button>
                {notifOpen && renderNotifDropdown()}
              </div>
            )}

            {isLoggedIn && userStats.resolved > 0 && (
              <div className="nv-points-badge" onMouseEnter={() => setPointsHover(true)} onMouseLeave={() => setPointsHover(false)}>
                <span style={{ fontSize: '1rem', animation: 'nvStreakFire 2s ease-in-out infinite' }}>⚡</span>
                <span style={{ fontWeight: 900, fontSize: '0.9rem', color: '#fbbf24', fontFamily: 'ui-monospace, monospace', animation: pointsHover ? 'nvPointsCount 0.4s ease both' : 'none' }}>{userStats.points.toLocaleString()}</span>
                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', padding: '3px 8px', borderRadius: 4, opacity: 0.8, letterSpacing: '0.05em' }}>PTS</span>
                {streak > 0 && (
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f97316', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4, opacity: pointsHover ? 1 : 0.7, transition: 'opacity 0.2s ease' }}>🔥{streak}</span>
                )}
              </div>
            )}

            <div className="nv-dk-links-container">
              {LINKS.map((link) => {
                const active = isActive(link.to);
                return (
                  <Link key={link.to} to={link.to} className={`nv-nav-link ${active ? 'active' : ''}`}>
                    <span style={{ fontSize: '0.8rem', opacity: active ? 1 : 0.7, transition: 'opacity 0.2s ease' }}>{link.emoji}</span>
                    {link.label}
                    {link.isLive && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'nvLiveDot 1.5s ease-in-out infinite', boxShadow: '0 0 8px rgba(239,68,68,0.8)' }} />
                        <span style={{ fontSize: '0.5rem', fontWeight: 900, color: '#ef4444', letterSpacing: '0.1em' }}>LIVE</span>
                      </span>
                    )}
                    {link.badge && (
                      <span style={{ fontSize: '0.45rem', fontWeight: 900, color: '#05070a', background: 'linear-gradient(135deg, #10b981, #059669)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.08em', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}>{link.badge}</span>
                    )}
                  </Link>
                );
              })}

              {isLoggedIn ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                  {isAdmin && (
                    <Link to={ADMIN_PATH} className={`nv-action-btn ${isActive(ADMIN_PATH) ? 'active' : ''}`} style={{ color: isActive(ADMIN_PATH) ? '#fbbf24' : '#64748b', borderColor: isActive(ADMIN_PATH) ? 'rgba(251,191,36,0.2)' : 'transparent', background: isActive(ADMIN_PATH) ? 'rgba(251,191,36,0.1)' : 'transparent' }} title="Admin">
                      <Shield size={18} strokeWidth={2.5} />
                    </Link>
                  )}
                  <Link to="/profile" className={`nv-action-btn ${isActive('/profile') ? 'active' : ''}`} title="Profile">
                    <User size={18} strokeWidth={2.5} />
                  </Link>
                </div>
              ) : (
                <Link to="/login" className="nv-auth-btn" title="Sign In" style={{ marginLeft: 10 }}>
                  <Zap size={16} strokeWidth={2.5} /> Sign In
                </Link>
              )}
            </div>
          </div>

          <div className="nv-tg" style={{ display: 'none', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <Link to="/" className={`nv-action-btn ${isHome ? 'active' : ''}`} aria-label="Home">
              <Home size={18} strokeWidth={2.5} />
            </Link>
            {isLoggedIn && isAdmin && (
              <Link to={ADMIN_PATH} className="nv-action-btn" style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.1)' }}>
                <Shield size={18} strokeWidth={2.5} />
              </Link>
            )}
            {isLoggedIn && (
              <div ref={mobNotifRef} style={{ position: 'relative' }}>
                <button onClick={() => setNotifOpen(p => !p)} className={`nv-action-btn ${notifOpen ? 'active' : ''}`} style={{ color: notifCount > 0 ? '#ef4444' : '#64748b', borderColor: notifCount > 0 ? 'rgba(239,68,68,0.2)' : 'transparent', background: notifCount > 0 ? 'rgba(239,68,68,0.1)' : 'transparent', animation: notifCount > 0 && !notifOpen ? 'nvBellRing 3s ease-in-out infinite' : 'none' }} aria-label="Notifications">
                  <Bell size={18} strokeWidth={2.5} />
                  {notifCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, padding: '0 3px',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', fontSize: '0.55rem', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #05070a',
                      boxShadow: '0 0 10px rgba(239,68,68,0.6)',
                      animation: 'nvBadgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                    }}>{notifCount > 9 ? '9+' : notifCount}</span>
                  )}
                </button>
                {notifOpen && renderNotifDropdown()}
              </div>
            )}
            <button onClick={() => setMobileOpen(true)} className="nv-action-btn" aria-label="Open menu">
              <Menu size={24} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </nav>

      <div className={`nv-mob-overlay ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />
      <div className={`nv-mob-drawer ${mobileOpen ? 'open' : ''}`}>
        
        <div className="nv-mob-header" style={{
          padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(16,185,129,0.1)', position: 'sticky', top: 0, zIndex: 3,
          background: 'rgba(5,7,10,0.9)', backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', overflow: 'hidden' }}>
            <img src={APP_LOGO} alt="ZokaScore" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', boxShadow: '0 0 15px rgba(16,185,129,0.3)', animation: 'nvLogoFloat 3s ease-in-out infinite' }} />
            <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#fff', letterSpacing: '0.02em' }}>ZOKA<span style={{ color: '#10b981' }}>SCORE</span></span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="nv-action-btn" style={{ width: '36px', height: '36px' }}>
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="nv-mob-scroll">
          {isLoggedIn && userProfile && (
            <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(180deg, rgba(16,185,129,0.05) 0%, transparent 100%)', animation: 'nvMobUserIn 0.45s ease 0.08s both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 40%, #047857 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.3rem', fontWeight: 900, color: '#05070a',
                  boxShadow: '0 4px 20px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {(userProfile.displayName || userProfile.username || 'U')[0].toUpperCase()}
                  <div style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', animation: 'nvShine 4s ease-in-out 1s infinite' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userProfile.displayName || userProfile.username || 'User'}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{userProfile.email || ''}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'Points', value: userStats.points, color: '#fbbf24', icon: '⚡' },
                  { label: 'Exact', value: userStats.exact, color: '#10b981', icon: '🎯' },
                  { label: 'Rank', value: userRank ? `#${userRank}` : '—', color: '#a855f7', icon: '🏆' },
                  { label: 'Streak', value: streak > 0 ? `${streak}🔥` : '—', color: '#f97316', icon: '🔥' },
                ].map((s, i) => (
                  <div key={s.label} style={{
                    textAlign: 'center', padding: '12px 4px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                    animation: `nvMobStatPop 0.4s cubic-bezier(0.34,1.56,0.64,1) ${0.15 + i * 0.07}s both`,
                    transition: 'all 0.2s ease',
                  }}>
                    <div style={{ fontSize: '1.1rem', marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 900, color: s.color, fontFamily: 'ui-monospace, monospace', lineHeight: 1.2 }}>{s.value}</div>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '12px 16px' }}>
            {LINKS.map((link, i) => {
              const active = isActive(link.to);
              return (
                <button
                  key={link.to}
                  onClick={() => handleMobileNav(link.to)}
                  className={`nv-mob-link ${active ? 'active' : ''}`}
                  style={{ animation: `nvMobItemIn 0.35s ease ${0.04 + i * 0.04}s both`, marginBottom: '4px' }}
                >
                  <span style={{ fontSize: '1.1rem', width: 28, textAlign: 'center', flexShrink: 0 }}>{link.emoji}</span>
                  <span style={{ flex: 1 }}>{link.label}</span>
                  {link.isLive && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.6rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'nvLiveDot 1.5s ease-in-out infinite', boxShadow: '0 0 8px rgba(239,68,68,0.8)' }} />
                      LIVE
                    </span>
                  )}
                  {link.badge && (
                    <span style={{ fontSize: '0.5rem', fontWeight: 900, color: '#05070a', background: 'linear-gradient(135deg, #10b981, #059669)', padding: '3px 8px', borderRadius: 4, letterSpacing: '0.08em', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}>{link.badge}</span>
                  )}
                  <ChevronRight size={16} style={{ opacity: 0.3 }} />
                </button>
              );
            })}

            {isLoggedIn ? (
              <>
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)', margin: '14px 0' }} />
                {isAdmin && (
                  <button onClick={() => handleMobileNav(ADMIN_PATH)} className="nv-mob-link" style={{ color: '#fbbf24' }}>
                    <Shield size={20} /> <span style={{ flex: 1 }}>Admin Panel</span> <ChevronRight size={16} style={{ opacity: 0.3 }} />
                  </button>
                )}
                <button onClick={() => handleMobileNav('/profile')} className="nv-mob-link">
                  <User size={20} /> <span style={{ flex: 1 }}>Profile</span> <ChevronRight size={16} style={{ opacity: 0.3 }} />
                </button>
                <button onClick={handleLogout} className="nv-mob-link" style={{ background: 'rgba(239,68,68,0.05)', color: '#ef4444', fontWeight: 700 }}>
                  <LogOut size={20} /> <span style={{ flex: 1 }}>Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)', margin: '14px 0' }} />
                <button onClick={() => handleMobileNav('/login')} className="nv-auth-btn" style={{ width: '100%', padding: '16px', fontSize: '0.9rem' }}>
                  <Zap size={18} strokeWidth={2.5} /> Sign In Now
                </button>
              </>
            )}

            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.1), transparent)', margin: '18px 0' }} />

            <button
              onClick={() => setInfoOpen(p => !p)}
              className="nv-mob-link"
              style={{
                border: `1px solid ${infoOpen ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)'}`,
                background: infoOpen ? 'rgba(16,185,129,0.05)' : 'transparent',
                color: infoOpen ? '#10b981' : '#64748b',
              }}
            >
              <span style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: infoOpen ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)', fontSize: '0.95rem' }}>ℹ️</span>
              <span style={{ flex: 1 }}>About, Help & Legal</span>
              <ChevronDown size={18} style={{ opacity: 0.5, transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)', transform: infoOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            <div style={{
              maxHeight: infoOpen ? '500px' : '0', overflow: 'hidden',
              transition: 'max-height 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease, padding 0.35s ease',
              opacity: infoOpen ? 1 : 0, paddingLeft: 8, paddingRight: 8,
              paddingTop: infoOpen ? 12 : 0, paddingBottom: infoOpen ? 8 : 0,
            }}>
              <div style={{ animation: infoOpen ? 'nvInfoExpand 0.35s ease 0.1s both' : 'none' }}>
                {infoSections.map((sec, si) => (
                  <div key={sec.title} style={{ marginBottom: si < infoSections.length - 1 ? 16 : 0 }}>
                    <div style={{ fontWeight: 800, color: '#64748b', marginBottom: 8, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', paddingLeft: 12 }}>
                      {sec.title}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {sec.links.map(([label, to], li) => (
                        <button
                          key={to}
                          onClick={() => handleMobileNav(to)}
                          className="nv-mob-link"
                          style={{ fontSize: '0.9rem', padding: '10px 14px' }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}