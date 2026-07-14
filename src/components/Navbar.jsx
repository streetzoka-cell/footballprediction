// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// FILE: src/components/Navbar.jsx
// v13.1 — Full animated pro navbar, single-scroll mobile, collapsible info, remember admin
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogOut, User, Shield, Zap, Home, Search, Bell, Trophy,
  Clock, Target, ChevronRight, ChevronDown, Star, Crown, Zap as ZapIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { db } from '../utils/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */
const ADMIN_PATH = '/zks-admin-8f9x2-control-panel';
const ADMIN_REMEMBER_KEY = 'nv-admin-remembered';

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   INJECT BASE STYLES
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
const injectBase = () => {
  if (document.getElementById('nv-base-v13')) return;
  const s = document.createElement('style');
  s.id = 'nv-base-v13';
  s.textContent = `
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
    @keyframes proFadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes proCardPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}50%{box-shadow:0 0 0 8px rgba(239,68,68,.15)}}
    @keyframes proLiveShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes proLiveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.6)}}
    @keyframes proSlideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvInfoExpand{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvLinkHover{0%{background-position:0 0}100%{background-position:200% 0}}
    @keyframes nvLogoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}
    @keyframes nvTickerPulse{0%,100%{opacity:.92}50%{opacity:1}}
    @keyframes nvSearchGlow{0%,100%{border-color:rgba(0,230,118,.12)}50%{border-color:rgba(0,230,118,.25)}}
    @keyframes nvNotifHeaderGlow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes nvPointsCount{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
    @keyframes nvMobileHeaderShine{0%{left:-60%}100%{left:120%}}
    @keyframes nvInfoChevronBounce{0%,100%{transform:rotate(180deg)}50%{transform:rotate(185deg)}}

    @media(max-width:900px){
      .nv-dk{display:none!important}
      .nv-tg{display:flex!important}
    }
    @media(min-width:901px){
      .nv-tg{display:none!important}
    }
    @media(max-width:640px){
      .nv-pro-wrap{padding:0 12px!important}
      .nv-pro-match .pro-teams{flex-direction:column;gap:4px!important}
      .nv-pro-match .pro-score-bar{padding:0 10px!important}
      .nv-pro-match .pro-time{display:none!important}
      .nv-pro-match .pro-vs{display:none!important}
    }

    .nv-mob-scroll::-webkit-scrollbar{width:3px}
    .nv-mob-scroll::-webkit-scrollbar-track{background:transparent}
    .nv-mob-scroll::-webkit-scrollbar-thumb{background:rgba(0,230,118,0.15);border-radius:10px}
    .nv-mob-scroll::-webkit-scrollbar-thumb:hover{background:rgba(0,230,118,0.3)}

    .nv-link-shimmer{position:relative;overflow:hidden}
    .nv-link-shimmer::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(0,230,118,0.04) 50%,transparent 100%);background-size:200% 100%;animation:nvLinkHover 0.6s ease both;pointer-events:none}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   SVG COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
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
    <span style={{ width: size, height: size, borderRadius: '50%', background: '#00e676', boxShadow: '0 0 8px rgba(0,230,118,0.8), 0 0 16px rgba(0,230,118,0.3)', animation: 'nvLiveDot 1.2s ease-in-out infinite', display: 'inline-block', flexShrink: 0 }} />
  );
  if (status === 'ft') return <span style={{ fontSize: '0.58rem', fontWeight: 900, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>FT</span>;
  return <Clock size={8} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />;
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   NAV LINKS
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
const LINKS = [
  { to: '/', label: 'Home', icon: Home, emoji: '🏠', pro: true },
  { to: '/fixtures', label: 'Fixtures', icon: null, emoji: '⚽' },
  { to: '/mastergames', label: 'Master Games', icon: null, emoji: '🎮' },
  { to: '/predictions', label: 'Predictions', icon: Target, emoji: '🎯', badge: 'NEW' },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy, emoji: '🏆' },
  { to: '/highlights', label: 'Highlights', icon: null, emoji: '🎬' },
  { to: '/livestream', label: 'Live Stream', icon: null, emoji: '📡', isLive: true },
];

const infoSections = [
  {
    title: "Company",
    links: [
      ["ℹ️ About", "/about"],
      ["📧 Contact", "/contact"],
      ["💼 Careers", "/careers"],
      ["🤝 Partners", "/partners"],
      ["📢 Advertise", "/advertise"],
      ["👥 Team", "/team"],
    ],
  },
  {
    title: "Support",
    links: [
      ["❓ Help Center", "/help"],
      ["❓ FAQ", "/faq"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["🔒 Privacy Policy", "/privacy"],
      ["📋 Terms of Service", "/terms"],
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   PRO HEADER COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
function ProHeader({ matches, liveMatches, nav }) {
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
  const homeLogo = m.homeTeam?.logo || m.homeTeam?.crest;
  const awayLogo = m.awayTeam?.logo || m.awayTeam?.crest;
  const homeName = m.homeTeam?.shortName || m.homeTeam?.name || 'TBD';
  const awayName = m.awayTeam?.shortName || m.awayTeam?.name || 'TBD';
  const ko = m.kickoff || '';
  const koTime = ko.includes('T') ? ko.split('T')[1]?.split(':').slice(0, 2).join(':') || '' : ko.split(':').slice(0, 2).join(':') || '';
  const minute = m.minute;

  return (
    <div
      className="nv-pro-wrap"
      onClick={() => nav(m.matchId ? `/predictions?match=${m.matchId}` : '/predictions')}
      style={{ cursor: 'pointer', textDecoration: 'none', display: 'block' }}
    >
      <div className="nv-pro-inner" style={{
        border: `1.5px solid ${featured.isLive ? 'rgba(239,68,68,.2)' : 'rgba(255,255,255,0.06)'}`,
        animation: 'proFadeIn .4s cubic-bezier(.22,1,.36,1) both',
      }}>
        <div className="nv-pro-tag">
          {featured.isLive && <span className="nv-pro-live-dot" />}
          <span className="nv-pro-league">{m.league?.name || 'Featured'}</span>
        </div>
        <div className="nv-pro-teams">
          <div className="nv-pro-team">
            {homeLogo ? <img src={homeLogo} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} /> : null}
            <span>{homeName}</span>
          </div>
          <div className="nv-pro-score-bar">
            {featured.isLive && m.homeScore != null ? (
              <>
                <span className="nv-pro-score nv-pro-score-live">{m.homeScore}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '.75rem', fontWeight: 700 }}>–</span>
                <span className="nv-pro-score nv-pro-score-live">{m.awayScore}</span>
              </>
            ) : m.kickoff ? (
              <span className="nv-pro-time"><Clock size={10} /> {koTime}</span>
            ) : (
              <span className="nv-pro-vs">VS</span>
            )}
          </div>
          <div className="nv-pro-team nv-pro-team-aw">
            {awayLogo ? <img src={awayLogo} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} /> : null}
            <span>{awayName}</span>
          </div>
        </div>
        {featured.isLive && minute != null && (
          <div className="nv-pro-minute">
            <span className="nv-pro-live-dot" style={{ width: 5, height: 5 }} />
            <span>{minute}'</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
export default function Navbar() {
  injectBase();

  const { currentUser, userProfile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const uid = currentUser?.uid;
  const isLoggedIn = !!uid;

  const [mobileOpen, setMobileOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [pointsHover, setPointsHover] = useState(false);
  const [seenNotifIds, setSeenNotifIds] = useState(new Set());
  const [linkHoverIdx, setLinkHoverIdx] = useState(-1);

  /* ═══ REMEMBER ADMIN LOGIC ═══
     Persists admin status in localStorage so the admin link shows
     instantly on reload without waiting for the Firestore profile to load.
     Cleared on explicit logout or if profile loads with non-admin role. */
  const [rememberedAdmin, setRememberedAdmin] = useState(() => {
    try { return localStorage.getItem(ADMIN_REMEMBER_KEY) === 'true'; } catch { return false; }
  });

  // Sync: profile loads → update remembered state
  useEffect(() => {
    if (!isLoggedIn) {
      // Logged out → clear remembered admin
      try { localStorage.removeItem(ADMIN_REMEMBER_KEY); } catch {}
      setRememberedAdmin(false);
      return;
    }
    if (userProfile) {
      if (userProfile.role === 'admin') {
        try { localStorage.setItem(ADMIN_REMEMBER_KEY, 'true'); } catch {}
        setRememberedAdmin(true);
      } else {
        // Profile explicitly says NOT admin → clear
        try { localStorage.removeItem(ADMIN_REMEMBER_KEY); } catch {}
        setRememberedAdmin(false);
      }
    }
    // If profile hasn't loaded yet but rememberedAdmin is true, keep showing the link
  }, [isLoggedIn, userProfile]);

  // Combined admin check: use profile if loaded, otherwise fall back to remembered
  const isAdmin = userProfile ? userProfile.role === 'admin' : rememberedAdmin;

  const [bannerMatches, setBannerMatches] = useState([]);
  const [activePreds, setActivePreds] = useState([]);
  const [allPreds, setAllPreds] = useState([]);

  const linksRef = useRef(null);
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const rafRef = useRef(false);

  const isHome = location.pathname === '/';
  const isActive = useCallback((p) => location.pathname === p, [location.pathname]);

  const liveMatches = useMemo(() => bannerMatches.filter(m => m.isLive), [bannerMatches]);

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

  /* ═══ EFFECTS ═══ */
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
    const unsub = subscribeToLiveFixtures(({ matches: lm }) => {
      if (lm.length === 0) return;
      const liveMap = new Map(lm.map(m => [String(m.id), m]));
      setBannerMatches(prev => {
        if (prev.length === 0) return lm;
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
      if (!rafRef.current) { rafRef.current = true; requestAnimationFrame(() => { setScrolled(window.scrollY > 10); rafRef.current = false; }); }
    };
    window.addEventListener('scroll', fn, { passive: true });
    setScrolled(window.scrollY > 10);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => { setMobileOpen(false); setSearchOpen(false); setNotifOpen(false); setInfoOpen(false); }, [location.pathname]);
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

  /* ═══ HANDLERS ═══ */
  const handleLogout = useCallback(async () => {
    setMobileOpen(false);
    // Clear remembered admin on explicit logout
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

  const handleMobileNav = useCallback((to) => { setMobileOpen(false); navigate(to); }, [navigate]);

  /* ═══ TICKER ═══ */
  const renderTickerItem = (m, i) => {
    const status = m.isLive ? 'live' : m.isFinished ? 'ft' : 'upcoming';
    return (
      <span key={`t-${m.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
        <StatusDot status={status} size={7} />
        <span style={{ fontWeight: 800, fontSize: '.82rem', color: m.isLive ? '#fff' : 'rgba(255,255,255,0.88)' }}>
          {m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}
        </span>
        <span style={{
          background: m.isLive ? 'rgba(0,230,118,0.22)' : m.isFinished ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
          borderRadius: 6, padding: '2px 10px', fontWeight: 900, fontSize: '.78rem', letterSpacing: '0.05em',
          fontFamily: 'ui-monospace, monospace',
          color: m.isLive ? '#00e676' : m.isFinished ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
          boxShadow: m.isLive ? '0 0 12px rgba(0,230,118,0.2)' : 'none',
        }}>
          {m.homeScore ?? '?'}–{m.awayScore ?? '?'}
        </span>
        <span style={{ fontWeight: 800, fontSize: '.82rem', color: m.isLive ? '#fff' : 'rgba(255,255,255,0.88)' }}>
          {m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}
        </span>
        {m.isLive && m.minute != null && (
          <span style={{ fontSize: '.7rem', fontWeight: 800, color: '#00e676', fontFamily: 'ui-monospace, monospace', minWidth: 28, textAlign: 'center' }}>{m.minute}'</span>
        )}
      </span>
    );
  };

  const tickerContent = tickerMatches.length > 0 ? tickerMatches.map((m, i) => renderTickerItem(m, i)) : null;
  const hasLive = tickerMatches.some(m => m.isLive);

  /* ═══ NOTIFICATION ITEM ═══ */
  const renderNotifItem = (n) => {
    const isExact = n.type === 'exact';
    const isResult = n.type === 'result';
    const bgColor = isExact ? 'rgba(0,230,118,0.06)' : isResult ? 'rgba(251,191,36,0.06)' : 'rgba(239,68,68,0.06)';
    const borderColor = isExact ? 'rgba(0,230,118,0.15)' : isResult ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)';
    const icon = isExact ? '🎯' : isResult ? '👍' : '😔';
    const label = isExact ? 'EXACT' : isResult ? 'CORRECT' : 'MISS';
    const labelColor = isExact ? '#00e676' : isResult ? '#fbbf24' : '#ef4444';

    return (
      <div key={n.id} style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: bgColor, borderLeft: `3px solid ${borderColor}`,
        animation: 'nvNotifSlide 0.3s ease both',
        transition: 'background 0.2s ease',
      }}>
        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>
            {n.homeTeam} vs {n.awayTeam}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Predicted: <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{n.predScore}</span></span>
            <span>Actual: <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{n.actualScore}</span></span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.5rem', fontWeight: 900, color: labelColor, letterSpacing: '0.1em', marginBottom: 2, textTransform: 'uppercase' }}>{label}</div>
          {n.points > 0 && (
            <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'ui-monospace, monospace', animation: 'nvPointsCount 0.4s ease both' }}>+{n.points}</div>
          )}
          <div style={{ fontSize: '0.56rem', color: '#4a5568', marginTop: 2 }}>{timeAgo(n.time)}</div>
        </div>
      </div>
    );
  };

  /* ═══ MOBILE MENU ═══ */
  const renderMobileMenu = () => {
    if (!mobileOpen) return null;
    return (
      <>
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            animation: 'nvOverlayIn 0.3s ease both',
          }}
        />
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(380px, 85vw)', zIndex: 2001,
          background: 'rgba(8,12,22,0.98)', borderLeft: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'nvMobSlide 0.4s cubic-bezier(0.22,1,0.36,1) both',
        }}>
          <div className="nv-mob-scroll" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

            {/* Sticky header */}
            <div style={{
              padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              position: 'sticky', top: 0, zIndex: 3,
              background: 'rgba(8,12,22,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(145deg, #00e676, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'nvLogoFloat 3s ease-in-out infinite' }}>
                  <FootballIcon size={18} />
                </div>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#e2e8f0' }}>ZOKA<span style={{ color: '#00e676' }}>SCORE</span></span>
                <div style={{ position: 'absolute', top: 0, left: '-60%', width: '40%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(0,230,118,0.08), transparent)', animation: 'nvMobileHeaderShine 5s ease-in-out 1s infinite', pointerEvents: 'none' }} />
              </div>
              <button onClick={() => setMobileOpen(false)} style={{
                width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', cursor: 'pointer',
                transition: 'all 0.2s ease',
              }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}>
                <X size={18} />
              </button>
            </div>

            {/* User card */}
            {isLoggedIn && userProfile && (
              <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', animation: 'nvMobUserIn 0.45s ease 0.08s both' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 13, flexShrink: 0,
                    background: 'linear-gradient(135deg, #00e676 0%, #00c853 40%, #059669 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.15rem', fontWeight: 900, color: '#0a0f1e',
                    boxShadow: '0 4px 16px rgba(0,230,118,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {(userProfile.displayName || userProfile.username || 'U')[0].toUpperCase()}
                    <div style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'nvShine 4s ease-in-out 1s infinite' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userProfile.displayName || userProfile.username || 'User'}</div>
                    <div style={{ fontSize: '0.7rem', color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{userProfile.email || ''}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { label: 'Points', value: userStats.points, color: '#fbbf24', icon: '⚡' },
                    { label: 'Exact', value: userStats.exact, color: '#00e676', icon: '🎯' },
                    { label: 'Rank', value: userRank ? `#${userRank}` : '—', color: '#a855f7', icon: '🏆' },
                    { label: 'Streak', value: streak > 0 ? `${streak}🔥` : '—', color: '#f97316', icon: '🔥' },
                  ].map((s, i) => (
                    <div key={s.label} style={{
                      textAlign: 'center', padding: '10px 2px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)',
                      animation: `nvMobStatPop 0.4s cubic-bezier(0.34,1.56,0.64,1) ${0.15 + i * 0.07}s both`,
                      transition: 'border-color 0.2s ease',
                    }} onMouseEnter={e => { e.currentTarget.style.borderColor = `${s.color}22`; e.currentTarget.style.background = `${s.color}08`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}>
                      <div style={{ fontSize: '0.9rem', marginBottom: 3 }}>{s.icon}</div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 900, color: s.color, fontFamily: 'ui-monospace, monospace', lineHeight: 1.2 }}>{s.value}</div>
                      <div style={{ fontSize: '0.48rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Main nav links */}
            <div style={{ padding: '6px 12px' }}>
              {LINKS.map((link, i) => {
                const active = isActive(link.to);
                return (
                  <button
                    key={link.to}
                    onClick={() => handleMobileNav(link.to)}
                    className="nv-link-shimmer"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
                      borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: active ? 'rgba(0,230,118,0.08)' : 'transparent',
                      color: active ? '#00e676' : '#9ca3af',
                      fontSize: '0.88rem', fontWeight: active ? 700 : 500,
                      borderLeft: active ? '3px solid #00e676' : '3px solid transparent',
                      transition: 'all 0.2s ease',
                      animation: `nvMobItemIn 0.35s ease ${0.04 + i * 0.04}s both`,
                      position: 'relative', overflow: 'hidden',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.paddingLeft = '20px'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.paddingLeft = '16px'; } }}
                  >
                    <span style={{ fontSize: '1rem', width: 24, textAlign: 'center', flexShrink: 0 }}>{link.emoji}</span>
                    <span style={{ flex: 1 }}>{link.label}</span>
                    {link.isLive && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.55rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'nvLiveDot 1.5s ease-in-out infinite', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
                        LIVE
                      </span>
                    )}
                    {link.badge && (
                      <span style={{ fontSize: '0.45rem', fontWeight: 900, color: '#0a0f1e', background: 'linear-gradient(135deg, #00e676, #00c853)', padding: '2px 7px', borderRadius: 4, letterSpacing: '0.06em', boxShadow: '0 2px 8px rgba(0,230,118,0.3)' }}>{link.badge}</span>
                    )}
                    <ChevronRight size={14} style={{ opacity: 0.25, transition: 'transform 0.2s ease, opacity 0.2s ease' }} />
                  </button>
                );
              })}

              {/* Auth section */}
              {isLoggedIn ? (
                <>
                  <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)', margin: '10px 16px' }} />
                  {/* ═══ Uses isAdmin (remembers) instead of userProfile?.role === 'admin' ═══ */}
                  {isAdmin && (
                    <button onClick={() => handleMobileNav(ADMIN_PATH)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
                      borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: 'transparent', color: '#fbbf24', fontSize: '0.88rem', fontWeight: 500,
                      transition: 'all 0.2s ease',
                    }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <Shield size={18} /> <span style={{ flex: 1 }}>Admin Panel</span> <ChevronRight size={14} style={{ opacity: 0.25 }} />
                    </button>
                  )}
                  <button onClick={() => handleMobileNav('/profile')} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
                    borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: 'transparent', color: '#9ca3af', fontSize: '0.88rem', fontWeight: 500,
                    transition: 'all 0.2s ease',
                  }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#e2e8f0'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}>
                    <User size={18} /> <span style={{ flex: 1 }}>Profile</span> <ChevronRight size={14} style={{ opacity: 0.25 }} />
                  </button>
                  <button onClick={handleLogout} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
                    borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(239,68,68,0.05)', color: '#ef4444', fontSize: '0.88rem', fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.05)'; }}>
                    <LogOut size={18} /> <span style={{ flex: 1 }}>Sign Out</span>
                  </button>
                </>
              ) : (
                <>
                  <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)', margin: '10px 16px' }} />
                  <button onClick={() => handleMobileNav('/login')} style={{
                    width: 'calc(100% - 24px)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '14px 20px', margin: '6px 12px', borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #00e676 0%, #00c853 50%, #059669 100%)', color: '#0a0f1e',
                    fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.02em',
                    boxShadow: '0 4px 24px rgba(0,230,118,0.3), inset 0 1px 0 rgba(255,255,255,0.25)',
                    transition: 'all 0.25s ease', position: 'relative', overflow: 'hidden',
                  }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,230,118,0.4), inset 0 1px 0 rgba(255,255,255,0.25)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,230,118,0.3), inset 0 1px 0 rgba(255,255,255,0.25)'; }}>
                    <div style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)', animation: 'nvShine 3s ease-in-out 0.5s infinite', pointerEvents: 'none' }} />
                    <Zap size={16} strokeWidth={2.5} /> Sign In
                  </button>
                </>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,230,118,0.1), transparent)', margin: '14px 16px' }} />

              {/* Info accordion */}
              <button
                onClick={() => setInfoOpen(p => !p)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                  borderRadius: 10, border: `1px solid ${infoOpen ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.04)'}`,
                  cursor: 'pointer', textAlign: 'left',
                  background: infoOpen ? 'rgba(0,230,118,0.04)' : 'rgba(255,255,255,0.015)',
                  color: infoOpen ? '#00e676' : '#6b7280', fontSize: '0.85rem', fontWeight: 600,
                  transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={e => { if (!infoOpen) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; } }}
                onMouseLeave={e => { if (!infoOpen) { e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'; } }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: infoOpen ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.04)',
                  transition: 'all 0.3s ease', fontSize: '0.85rem',
                }}>ℹ️</span>
                <span style={{ flex: 1 }}>About, Help & Legal</span>
                <ChevronDown
                  size={15}
                  style={{
                    opacity: 0.5,
                    transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease',
                    transform: infoOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    animation: infoOpen ? 'nvInfoChevronBounce 0.5s ease 0.1s' : 'none',
                  }}
                />
              </button>

              <div style={{
                maxHeight: infoOpen ? '500px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease, padding 0.35s ease',
                opacity: infoOpen ? 1 : 0,
                paddingLeft: 8, paddingRight: 8,
                paddingTop: infoOpen ? 10 : 0,
                paddingBottom: infoOpen ? 8 : 0,
              }}>
                <div style={{ animation: infoOpen ? 'nvInfoExpand 0.35s ease 0.1s both' : 'none' }}>
                  {infoSections.map((sec, si) => (
                    <div key={sec.title} style={{ marginBottom: si < infoSections.length - 1 ? 14 : 0 }}>
                      <div style={{ fontWeight: 700, color: '#4a5568', marginBottom: 6, fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.14em', paddingLeft: 10 }}>
                        {sec.title}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {sec.links.map(([label, to], li) => (
                          <button
                            key={to}
                            onClick={() => handleMobileNav(to)}
                            style={{
                              background: 'none', border: 'none', color: '#9ca3af',
                              cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500,
                              padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                              transition: 'all 0.2s ease',
                              animation: infoOpen ? `nvInfoExpand 0.3s ease ${0.12 + (si * 0.08) + (li * 0.04)}s both` : 'none',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,230,118,0.06)'; e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.paddingLeft = '18px'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.paddingLeft = '12px'; }}
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

            {/* Footer */}
            <div style={{ padding: '24px 20px 36px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 6 }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(145deg, #00e676, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px rgba(0,230,118,0.2)' }}>
                  <FootballIcon size={12} color="#0a0f1e" />
                </div>
                <span style={{ fontWeight: 800, fontSize: '0.72rem', color: '#4a5568' }}>ZOKA<span style={{ color: '#00e676', opacity: 0.6 }}>SCORE</span></span>
              </div>
              <div style={{ fontSize: '0.6rem', color: '#374151', opacity: 0.6 }}>© {new Date().getFullYear()} ZokaScore. All rights reserved.</div>
            </div>
          </div>
        </div>
      </>
    );
  };

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <SEO
        title="ZokaPredict — Live Football Scores & Predictions"
        description="Live football scores, match predictions, and leaderboard rankings on ZokaPredict."
        keywords="football live scores, predictions, leaderboard, ZokaPredict"
        path="/"
      />

      {/* ═══ PRO HEADER ═══ */}
      <ProHeader matches={bannerMatches} liveMatches={liveMatches} nav={navigate} />

      {/* ═══ TICKER BAR ═══ */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 1001, height: 40, overflow: 'hidden',
        display: 'flex', alignItems: 'center',
        background: hasLive
          ? 'linear-gradient(90deg, #7f1d1d 0%, #dc2626 15%, #b91c1c 30%, #f871c9 48%, #fbbf24 65%, #fef083 82%, #fef3c7 95%, #fbbf24 110%)'
          : 'linear-gradient(90deg, #059669 0%, #0d9488 15%, #0891b2 30%, #0ea5e9 48%, #6366f1 65%, #a855f7 82%, #ec4899 95%, #059669 110%)',
        backgroundSize: '200% 100%',
        animation: 'nvBannerShimmer 10s linear infinite, nvTickerPulse 4s ease-in-out infinite',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        boxShadow: hasLive
          ? '0 2px 24px rgba(239,68,68,0.25), 0 0 50px rgba(239,68,68,0.08)'
          : '0 2px 24px rgba(5,150,105,0.2), 0 0 50px rgba(14,165,233,0.06)',
        transition: 'all 0.6s cubic-bezier(0.22,1,0.36,1)',
        willChange: 'background, box-shadow',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(90deg, rgba(0,0,0,0.5) 0%, transparent 8%, transparent 92%, rgba(0,0,0,0.5) 100%)',
        }} />
        {hasLive && (
          <div style={{
            position: 'absolute', left: 12, zIndex: 2,
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, #dc2626, #ef4444)',
            borderRadius: 8, padding: '3px 12px',
            fontSize: '0.6rem', fontWeight: 900, color: 'white',
            letterSpacing: '0.16em', textTransform: 'uppercase',
            boxShadow: '0 0 20px rgba(239,68,68,0.6), 0 1px 0 rgba(255,255,255,0.15) inset',
            animation: 'nvPulseGreen 2s ease-in-out infinite',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'nvLiveDot 1.2s ease-in-out infinite', boxShadow: '0 0 8px rgba(255,255,255,0.9)' }} />
            LIVE
          </div>
        )}
        {tickerContent ? (
          <div style={{
            flex: 1, overflow: 'hidden', marginLeft: hasLive ? 76 : 16, marginRight: 16,
            maskImage: 'linear-gradient(90deg, transparent, black 4%, black 96%, transparent)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, black 4%, black 96%, transparent)',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 24,
              animation: 'nvMarquee 45s linear infinite', color: 'rgba(255,255,255,0.92)',
            }}>
              {tickerContent}
              <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: '0.55rem' }}>⚽</span>
              {tickerContent}
              <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: '0.55rem' }}>⚽</span>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, textAlign: 'center', fontSize: '.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '.04em' }}>
            ⚽ zokascore.xyz — Live football scores & predictions
          </div>
        )}
      </div>

      {/* ═══ NAV BAR ═══ */}
      <nav style={{
        position: 'sticky', top: 40, zIndex: 1000, height: 60,
        background: scrolled ? 'rgba(6,11,20,0.97)' : 'rgba(6,11,20,0)',
        backdropFilter: scrolled ? 'blur(40px) saturate(190%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(40px) saturate(190%)' : 'none',
        borderBottom: `1px solid ${scrolled ? 'rgba(0,230,118,0.06)' : 'rgba(255,255,255,0)'}`,
        boxShadow: scrolled ? '0 1px 0 rgba(0,230,118,0.04), 0 8px 40px rgba(0,0,0,0.35)' : 'none',
        transition: 'all 0.5s cubic-bezier(0.22,1,0.36,1)',
        willChange: 'background, backdrop-filter, box-shadow',
        animation: scrolled ? 'nvBorderGlow 4s ease-in-out infinite' : 'none',
      }}>
        <div style={{ maxWidth: 'var(--max-width, 1140px)', margin: '0 auto', padding: '0 16px', height: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 8 }}>

          {/* LEFT: Desktop Home */}
          <div className="nv-dk" style={{ display: 'flex', alignItems: 'center' }}>
            <Link to="/" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9,
              fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
              color: isHome ? '#00e676' : '#6b7280',
              background: isHome ? 'rgba(0,230,118,0.08)' : 'rgba(255,255,255,0.02)',
              border: isHome ? '1px solid rgba(0,230,118,0.15)' : '1px solid rgba(255,255,255,0.06)',
              cursor: 'pointer', transition: 'all 0.25s ease',
              boxShadow: isHome ? '0 0 14px rgba(0,230,118,0.08)' : 'none',
            }} onMouseEnter={e => { if (!isHome) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; } }}
            onMouseLeave={e => { if (!isHome) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; } }}
            aria-label="Home">
              <Home size={15} /> Home
            </Link>
          </div>

          {/* CENTER: Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
            <Link to="/" style={{
              display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', cursor: 'pointer',
              transition: 'all 0.2s ease', position: 'relative',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11, position: 'relative', overflow: 'hidden', flexShrink: 0,
                background: 'linear-gradient(145deg, #00e676 0%, #00c853 35%, #059669 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 24px rgba(0,230,118,0.3), 0 2px 12px rgba(0,230,118,0.2), 0 1px 0 rgba(255,255,255,0.2) inset',
                animation: 'nvGlowBreathe 3s ease-in-out infinite, nvLogoFloat 4s ease-in-out infinite',
              }}>
                <FootballIcon size={22} />
                <div style={{ position: 'absolute', top: 0, left: '-100%', width: '50%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', animation: 'nvShine 4s ease-in-out 1.5s infinite' }} />
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%', background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)', borderRadius: '11px 11px 0 0', pointerEvents: 'none' }} />
              </div>
              <div className="nv-dk" style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
                <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '0.02em', color: '#e2e8f0', whiteSpace: 'nowrap' }}>ZOKA</span>
                <span style={{ fontWeight: 900, fontSize: '1.15rem', letterSpacing: '0.03em', color: '#00e676', whiteSpace: 'nowrap', marginLeft: 1, animation: 'nvScoreGlow 3s ease-in-out infinite' }}>SCORE</span>
                <span style={{ color: '#00e676', fontSize: '1.35rem', lineHeight: 1, animation: 'nvDotBlink 2.5s ease-in-out infinite', textShadow: '0 0 12px rgba(0,230,118,0.7)', marginLeft: 0, opacity: 0.35 }}>.</span>
                <span style={{ fontSize: '0.48rem', fontWeight: 700, color: '#4a5568', letterSpacing: '0.12em', textTransform: 'uppercase', marginLeft: 3, opacity: 0.35 }}>xyz</span>
              </div>
            </Link>
          </div>

          {/* RIGHT: Desktop actions */}
          <div className="nv-dk" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, justifyContent: 'flex-end' }}>

            {/* Search */}
            <div ref={searchRef} style={{ position: 'relative' }}>
              <button onClick={() => { setSearchOpen(p => !p); if (searchOpen) setSearchQuery(''); }}
                style={{
                  width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: searchOpen ? 'rgba(0,230,118,0.08)' : 'transparent',
                  color: searchOpen ? '#00e676' : '#6b7280',
                  border: `1.5px solid ${searchOpen ? 'rgba(0,230,118,0.18)' : 'transparent'}`,
                  cursor: 'pointer', transition: 'all 0.25s ease',
                  animation: searchOpen ? 'nvSearchGlow 2s ease-in-out infinite' : 'none',
                }}
                onMouseEnter={e => { if (!searchOpen) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#e2e8f0'; } }}
                onMouseLeave={e => { if (!searchOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; } }}
                aria-label="Search">
                <Search size={15} />
              </button>
              {searchOpen && (
                <form onSubmit={handleSearch} style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 280,
                  background: 'rgba(12,18,32,0.98)', border: '1px solid rgba(0,230,118,0.12)',
                  borderRadius: 12, overflow: 'hidden',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(0,230,118,0.06)',
                  animation: 'nvFadeUp 0.25s ease both',
                  display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', height: 42,
                }}>
                  <Search size={14} style={{ color: '#4a5568', flexShrink: 0 }} />
                  <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search matches, teams..." style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit',
                  }} />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer' }}>✕</button>
                  )}
                </form>
              )}
            </div>

            {/* Notifications */}
            {isLoggedIn && (
              <div ref={notifRef} style={{ position: 'relative' }}>
                <button onClick={() => setNotifOpen(p => !p)} style={{
                  width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: notifOpen ? 'rgba(0,230,118,0.08)' : 'transparent',
                  color: notifOpen ? '#00e676' : '#6b7280',
                  border: `1.5px solid ${notifOpen ? 'rgba(0,230,118,0.18)' : 'transparent'}`,
                  cursor: 'pointer', position: 'relative', transition: 'all 0.25s ease',
                  animation: notifCount > 0 && !notifOpen ? 'nvBellRing 3s ease-in-out infinite' : 'none',
                }}
                  onMouseEnter={e => { if (!notifOpen) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#e2e8f0'; } }}
                  onMouseLeave={e => { if (!notifOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; } }}
                  aria-label="Notifications">
                  <Bell size={15} />
                  {notifCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 1, right: 1, minWidth: 18, height: 18, borderRadius: 9, padding: '0 3px',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white',
                      fontSize: '0.48rem', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px solid #0c1220',
                      boxShadow: '0 0 12px rgba(239,68,68,0.5)',
                      animation: 'nvBadgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                    }}>{notifCount > 9 ? '9+' : notifCount}</span>
                  )}
                </button>
                {notifOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: -8, width: 340,
                    background: 'rgba(12,18,32,0.98)', border: '1px solid rgba(0,230,118,0.1)',
                    borderRadius: 14, overflow: 'hidden',
                    boxShadow: '0 16px 50px rgba(0,0,0,0.55), 0 1px 0 rgba(0,230,118,0.06)',
                    animation: 'nvFadeUp 0.3s cubic-bezier(0.22,1,0.36,1) both',
                  }}>
                    <div style={{
                      padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'linear-gradient(135deg, rgba(0,230,118,0.04) 0%, rgba(0,230,118,0.01) 50%, rgba(168,85,247,0.03) 100%)',
                      backgroundSize: '200% 100%', animation: 'nvNotifHeaderGlow 6s ease infinite',
                    }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Bell size={14} style={{ opacity: 0.5 }} /> Prediction Results
                      </span>
                      {predNotifs.length > 0 && (
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#00e676', background: 'rgba(0,230,118,0.1)', padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(0,230,118,0.15)' }}>{predNotifs.length} results</span>
                      )}
                    </div>
                    {predNotifs.length === 0 ? (
                      <div style={{ padding: '36px 24px', textAlign: 'center' }}>
                        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                          <Target size={24} style={{ color: '#4a5568', opacity: 0.5 }} />
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>No results yet</div>
                        <div style={{ fontSize: '0.75rem', color: '#4a5568', lineHeight: 1.5 }}>Make predictions and check back<br />after matches end</div>
                      </div>
                    ) : (
                      <div style={{ maxHeight: 320, overflowY: 'auto' }} className="nv-mob-scroll">
                        {predNotifs.map(renderNotifItem)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Points badge */}
            {isLoggedIn && userStats.resolved > 0 && (
              <div
                onMouseEnter={e => setPointsHover(true)}
                onMouseLeave={e => setPointsHover(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20,
                  background: pointsHover ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.04)',
                  border: `1px solid ${pointsHover ? 'rgba(251,191,36,0.2)' : 'rgba(251,191,36,0.08)'}`,
                  cursor: 'default', transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)',
                  transform: pointsHover ? 'scale(1.04)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: '0.9rem', animation: 'nvStreakFire 2s ease-in-out infinite' }}>⚡</span>
                <span style={{ fontWeight: 900, fontSize: '0.85rem', color: '#fbbf24', fontFamily: 'ui-monospace, monospace', animation: pointsHover ? 'nvPointsCount 0.4s ease both' : 'none' }}>{userStats.points.toLocaleString()}</span>
                <span style={{ fontSize: '0.52rem', fontWeight: 700, color: '#92400e', background: 'rgba(251,191,36,0.1)', padding: '2px 7px', borderRadius: 4, opacity: 0.7 }}>PTS</span>
                {streak > 0 && (
                  <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#f97316', display: 'flex', alignItems: 'center', gap: 2, marginLeft: 2, opacity: pointsHover ? 1 : 0.5, transition: 'opacity 0.2s ease' }}>🔥{streak}</span>
                )}
              </div>
            )}

            {/* Desktop nav links */}
            <div ref={linksRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%' }}>
              {LINKS.map((link, idx) => {
                const active = isActive(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={linkHoverIdx === idx ? 'nv-link-shimmer' : ''}
                    onMouseEnter={() => setLinkHoverIdx(idx)}
                    onMouseLeave={() => setLinkHoverIdx(-1)}
                    style={{
                      position: 'relative', display: 'flex', alignItems: 'center', height: '100%', padding: '0 13px',
                      fontSize: '0.8rem', fontWeight: active ? 700 : 500, color: active ? '#00e676' : '#6b7280',
                      background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'none',
                      transition: 'all 0.25s ease', whiteSpace: 'nowrap', gap: 5,
                      textShadow: active ? '0 0 16px rgba(0,230,118,0.4)' : 'none',
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ fontSize: '0.72rem', opacity: active ? 1 : 0.7, transition: 'opacity 0.2s ease' }}>{link.emoji}</span>
                    {link.label}
                    {link.isLive && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', animation: 'nvLiveDot 1.5s ease-in-out infinite', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
                        <span style={{ fontSize: '0.45rem', fontWeight: 900, color: '#ef4444', letterSpacing: '0.08em' }}>LIVE</span>
                      </span>
                    )}
                    {link.badge && (
                      <span style={{ fontSize: '0.42rem', fontWeight: 900, color: '#0a0f1e', background: 'linear-gradient(135deg, #00e676, #00c853)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.06em', boxShadow: '0 2px 8px rgba(0,230,118,0.25)' }}>{link.badge}</span>
                    )}
                  </Link>
                );
              })}

              {/* Auth — uses isAdmin (remembers) */}
              {isLoggedIn ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isAdmin && (
                    <Link to={ADMIN_PATH} style={{
                      width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isActive(ADMIN_PATH) ? 'rgba(251,191,36,0.08)' : 'transparent',
                      color: isActive(ADMIN_PATH) ? '#fbbf24' : '#6b7280',
                      border: `1.5px solid ${isActive(ADMIN_PATH) ? 'rgba(251,191,36,0.2)' : 'transparent'}`,
                      cursor: 'pointer', textDecoration: 'none', transition: 'all 0.25s ease',
                    }}
                    onMouseEnter={e => { if (!isActive(ADMIN_PATH)) { e.currentTarget.style.background = 'rgba(251,191,36,0.06)'; e.currentTarget.style.color = '#fbbf24'; } }}
                    onMouseLeave={e => { if (!isActive(ADMIN_PATH)) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; } }}
                    title="Admin"><Shield size={15} /></Link>
                  )}
                  <Link to="/profile" style={{
                    width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive('/profile') ? 'rgba(0,230,118,0.08)' : 'transparent',
                    color: isActive('/profile') ? '#00e676' : '#6b7280',
                    border: `1.5px solid ${isActive('/profile') ? 'rgba(0,230,118,0.18)' : 'transparent'}`,
                    cursor: 'pointer', textDecoration: 'none', transition: 'all 0.25s ease',
                  }}
                  onMouseEnter={e => { if (!isActive('/profile')) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#e2e8f0'; } }}
                  onMouseLeave={e => { if (!isActive('/profile')) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; } }}
                  title="Profile"><User size={15} /></Link>
                </div>
              ) : (
                <Link to="/login" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 22px', borderRadius: 9,
                  background: 'linear-gradient(135deg, #00e676 0%, #00c853 50%, #059669 100%)', color: '#0a0f1e',
                  fontWeight: 900, fontSize: '0.82rem', textDecoration: 'none', letterSpacing: '0.01em',
                  boxShadow: '0 2px 16px rgba(0,230,118,0.28), inset 0 1px 0 rgba(255,255,255,0.25)',
                  transition: 'all 0.25s ease', position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,230,118,0.4), inset 0 1px 0 rgba(255,255,255,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,230,118,0.28), inset 0 1px 0 rgba(255,255,255,0.25)'; }}
                title="Sign In">
                  <div style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)', animation: 'nvShine 3s ease-in-out 0.3s infinite', pointerEvents: 'none' }} />
                  <Zap size={14} strokeWidth={2.5} />
                </Link>
              )}
            </div>
          </div>

          {/* MOBILE RIGHT */}
          <div className="nv-tg" style={{ display: 'none', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <Link to="/" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9,
              fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
              color: isHome ? '#00e676' : '#6b7280',
              background: isHome ? 'rgba(0,230,118,0.08)' : 'rgba(255,255,255,0.02)',
              border: isHome ? '1px solid rgba(0,230,118,0.15)' : '1px solid rgba(255,255,255,0.06)',
              cursor: 'pointer', transition: 'all 0.25s ease',
              boxShadow: isHome ? '0 0 14px rgba(0,230,118,0.08)' : 'none',
            }} onMouseEnter={e => { if (!isHome) { e.currentTarget.style.background = 'rgba(0,230,118,0.1)'; e.currentTarget.style.color = '#e2e8f0'; } }}
              onMouseLeave={e => { if (!isHome) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.color = '#6b7280'; } }}
              aria-label="Home">
              <Home size={14} />
            </Link>
            {/* ═══ Uses isAdmin (remembers) ═══ */}
            {isLoggedIn && isAdmin && (
              <Link to={ADMIN_PATH} style={{
                width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.08)',
                cursor: 'pointer', textDecoration: 'none', display: 'flex', color: '#fbbf24', borderRadius: 10,
                transition: 'all 0.2s ease',
              }}><Shield size={17} /></Link>
            )}
            {isLoggedIn && notifCount > 0 && (
              <div style={{
                width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                position: 'relative', cursor: 'pointer', color: '#ef4444',
                transition: 'all 0.2s ease',
              }} onClick={() => { setMobileOpen(true); }}>
                <Bell size={17} />
                <span style={{
                  position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, padding: '0 3px',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', fontSize: '0.48rem', fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0c1220',
                  boxShadow: '0 0 10px rgba(239,68,68,0.5)',
                  animation: 'nvBadgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                }}>{notifCount > 9 ? '9+' : notifCount}</span>
              </div>
            )}
            <button
              onClick={() => setMobileOpen(true)}
              style={{
                width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0', cursor: 'pointer', transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,230,118,0.08)'; e.currentTarget.style.borderColor = 'rgba(0,230,118,0.15)'; e.currentTarget.style.color = '#00e676'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
              aria-label="Open menu">
              <Menu size={22} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ MOBILE MENU ═══ */}
      {renderMobileMenu()}
    </>
  );
}