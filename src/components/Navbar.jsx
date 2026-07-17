// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// FILE: src/components/Navbar.jsx
// v14.4 — App Logo Integration, Mobile Notif Dropdown, ProHeader Fix
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogOut, User, Shield, Zap, Home, Search, Bell, Trophy,
  Clock, Target, ChevronRight, ChevronDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { db } from '../utils/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════ */
const ADMIN_PATH = '/zks-admin-8f9x2-control-panel';
const ADMIN_REMEMBER_KEY = 'nv-admin-remembered';
const APP_LOGO = '/icons/icon-192.png';

let stylesInjected = false;
const injectBase = () => {
  if (stylesInjected || document.getElementById('nv-base-v15')) return;
  const s = document.createElement('style');
  s.id = 'nv-base-v15';
  s.textContent = `
    @keyframes nvMarquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    @keyframes nvFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvDotBlink{0%,100%{opacity:1}50%{opacity:.2}}
    @keyframes nvShine{0%{left:-100%}100%{left:200%}}
    @keyframes nvLiveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.6)}}
    @keyframes nvGlowBreathe{0%,100%{box-shadow:0 0 12px rgba(0,230,118,.2)}50%{box-shadow:0 0 28px rgba(0,230,118,.4)}}
    @keyframes nvScoreGlow{0%,100%{text-shadow:0 0 8px rgba(0,230,118,.4)}50%{text-shadow:0 0 18px rgba(0,230,118,.7)}}
    @keyframes nvBellRing{0%,100%{transform:rotate(0)}15%{transform:rotate(14deg)}30%{transform:rotate(-12deg)}45%{transform:rotate(8deg)}60%{transform:rotate(-4deg)}75%{transform:rotate(0)}}
    @keyframes nvBadgePop{0%{transform:scale(0)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
    @keyframes nvStreakFire{0%,100%{opacity:.7;transform:scale(1) rotate(-2deg)}50%{opacity:1;transform:scale(1.2) rotate(2deg)}}
    @keyframes nvNotifSlide{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
    @keyframes nvMobItemIn{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
    @keyframes nvMobUserIn{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvMobStatPop{0%{transform:scale(.8);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
    @keyframes nvPulseGreen{0%,100%{box-shadow:0 0 0 0 rgba(0,230,118,.4)}50%{box-shadow:0 0 0 8px rgba(0,230,118,0)}}
    @keyframes nvPointsCount{0%{transform:scale(1)}50%{transform:scale(1.15) rotate(5deg)}100%{transform:scale(1)}}
    @keyframes nvLogoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
    @keyframes nvNotifHeaderGlow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes nvInfoExpand{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nvBtnShine{0%{transform:translateX(-100%) rotate(10deg)}100%{transform:translateX(200%) rotate(10deg)}}

    /* Typography & Base Fixes */
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    
    /* Pro Header (Featured Match) */
    .nv-pro-wrap { padding: 14px 16px 0; max-width: 1140px; margin: 0 auto; box-sizing: border-box; }
    .nv-pro-inner { 
      background: linear-gradient(145deg, rgba(20,25,40,0.8), rgba(10,12,20,0.9)); 
      border-radius: 14px; padding: 12px 18px; display: flex; flex-direction: column; gap: 8px; 
      position: relative; overflow: hidden; transition: all 0.3s ease; 
      border: 1px solid rgba(255,255,255,0.05);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      box-sizing: border-box;
    }
    .nv-pro-inner:hover { border-color: rgba(0,230,118,0.3); transform: translateY(-2px); box-shadow: 0 15px 40px rgba(0,0,0,0.4); }
    .nv-pro-tag { display: flex; align-items: center; gap: 6px; font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; min-width: 0; overflow: hidden; }
    .nv-pro-tag span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .nv-pro-teams { display: flex; align-items: center; gap: 12px; min-width: 0; }

    .nv-pro-team { 
      flex: 1 1 0; 
      min-width: 0; 
      display: flex; 
      align-items: center; 
      gap: 10px; 
      font-size: 0.95rem; 
      font-weight: 800; 
      color: #f8fafc; 
      overflow: hidden; 
      text-transform: uppercase; 
      letter-spacing: -0.01em; 
    }
    .nv-pro-team span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .nv-pro-team-aw { justify-content: flex-end; }

    .nv-pro-score-bar { 
      flex-shrink: 0; 
      display: flex; 
      align-items: center; 
      gap: 10px; 
      padding: 6px 16px; 
      background: rgba(0,0,0,0.4); 
      border-radius: 10px; 
      border: 1px solid rgba(255,255,255,0.05); 
    }
    .nv-pro-score { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 900; font-size: 1.4rem; color: #fff; line-height: 1; }
    .nv-pro-score-live { color: #00e676; text-shadow: 0 0 12px rgba(0,230,118,0.5); }
    .nv-pro-time { font-size: 0.8rem; font-weight: 700; color: #94a3b8; display: flex; align-items: center; gap: 5px; font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
    .nv-pro-vs { font-size: 0.8rem; font-weight: 900; color: #64748b; }
    .nv-pro-minute { position: absolute; top: 12px; right: 18px; display: flex; align-items: center; gap: 5px; font-size: 0.75rem; font-weight: 900; color: #ef4444; font-family: 'JetBrains Mono', monospace; z-index: 2; }
    .nv-pro-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: nvLiveDot 1.2s infinite; box-shadow: 0 0 10px rgba(239,68,68,0.8); flex-shrink: 0; }

    .nv-pro-team-logo { width: 28px; height: 28px; object-fit: contain; flex-shrink: 0; }

    @media (max-width: 520px) {
      .nv-pro-wrap { padding: 10px 10px 0; }
      .nv-pro-inner { padding: 10px 12px; gap: 6px; border-radius: 12px; }
      .nv-pro-teams { gap: 8px; }
      .nv-pro-team { gap: 6px; font-size: 0.78rem; }
      .nv-pro-team-logo { width: 22px; height: 22px; }
      .nv-pro-score-bar { padding: 4px 10px; gap: 6px; }
      .nv-pro-score { font-size: 1.05rem; }
      .nv-pro-time { font-size: 0.7rem; }
      .nv-pro-vs { font-size: 0.7rem; }
      .nv-pro-tag { font-size: 0.58rem; }
      .nv-pro-minute { top: 8px; right: 10px; font-size: 0.65rem; }
    }

    @media (max-width: 360px) {
      .nv-pro-team { font-size: 0.7rem; gap: 4px; }
      .nv-pro-team-logo { width: 18px; height: 18px; }
      .nv-pro-score { font-size: 0.95rem; }
      .nv-pro-score-bar { padding: 3px 8px; }
      .nv-pro-teams { gap: 6px; }
    }

    /* Desktop Nav Links */
    .nv-nav-link {
      position: relative; display: flex; align-items: center; height: 100%; padding: 8px 12px;
      font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;
      cursor: pointer; text-decoration: none; transition: all 0.3s ease; white-space: nowrap; gap: 5px;
      border-radius: 8px; margin: 0 2px;
    }
    .nv-nav-link:hover { color: #fff; background: rgba(255,255,255,0.04); }
    .nv-nav-link.active {
      color: #00e676; background: rgba(0,230,118,0.08);
      box-shadow: inset 0 0 0 1px rgba(0,230,118,0.15), 0 4px 12px rgba(0,0,0,0.2);
      text-shadow: 0 0 10px rgba(0,230,118,0.4);
    }
    .nv-nav-link.active::after {
      content: ''; position: absolute; bottom: -12px; left: 50%; transform: translateX(-50%);
      width: 4px; height: 4px; border-radius: 50%; background: #00e676; box-shadow: 0 0 8px #00e676;
    }
    .nv-dk-links-container { display: flex; align-items: center; height: 100%; margin-left: 10px; overflow-x: auto; scrollbar-width: none; }
    .nv-dk-links-container::-webkit-scrollbar { display: none; }

    /* Action Buttons (Icons) */
    .nv-action-btn {
      width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
      background: transparent; color: #64748b; border: 1px solid transparent; cursor: pointer; transition: all 0.3s ease;
      position: relative;
    }
    .nv-action-btn:hover { background: rgba(255,255,255,0.05); color: #fff; border-color: rgba(255,255,255,0.1); }
    .nv-action-btn.active { background: rgba(0,230,118,0.1); color: #00e676; border-color: rgba(0,230,118,0.2); box-shadow: 0 0 12px rgba(0,230,118,0.1); }

    /* Auth / Sign In Button */
    .nv-auth-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 24px; border-radius: 10px;
      background: linear-gradient(135deg, #00e676 0%, #00c853 100%); color: #001b07;
      font-weight: 900; font-size: 0.8rem; text-decoration: none; text-transform: uppercase; letter-spacing: 0.05em;
      box-shadow: 0 4px 20px rgba(0,230,118,0.3); transition: all 0.3s ease; position: relative; overflow: hidden;
      border: none; cursor: pointer;
    }
    .nv-auth-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,230,118,0.5); }
    .nv-auth-btn::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); transform: translateX(-100%) rotate(10deg); }
    .nv-auth-btn:hover::before { animation: nvBtnShine 1s ease forwards; }

    /* Points Badge */
    .nv-points-badge {
      display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 12px;
      background: linear-gradient(135deg, rgba(251,191,36,0.1), rgba(251,191,36,0.02));
      border: 1px solid rgba(251,191,36,0.2); cursor: default; transition: all 0.3s ease;
    }
    .nv-points-badge:hover { transform: scale(1.05); border-color: rgba(251,191,36,0.4); box-shadow: 0 0 15px rgba(251,191,36,0.2); }

    /* Mobile Optimizations */
    @media (max-width: 900px) {
      .nv-dk { display: none !important; }
      .nv-tg { display: flex !important; }
      .nv-main-nav { background: rgba(6,11,20,0.98) !important; backdrop-filter: none !important; }
      .nv-mob-header { background: rgba(8,12,22,0.98) !important; backdrop-filter: none !important; }
    }
    @media (min-width: 901px) { .nv-tg { display: none !important; } }

    /* Mobile Drawer */
    .nv-mob-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
    .nv-mob-overlay.open { opacity: 1; pointer-events: auto; }
    .nv-mob-drawer {
      position: fixed; top: 0; right: 0; bottom: 0; width: min(400px, 90vw); z-index: 2001;
      background: linear-gradient(180deg, #0a0f1e 0%, #050709 100%); border-left: 1px solid rgba(0,230,118,0.1);
      box-shadow: -20px 0 60px rgba(0,0,0,0.5); display: flex; flex-direction: column; overflow: hidden;
      transform: translateX(100%); transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .nv-mob-drawer.open { transform: translateX(0); }
    .nv-mob-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
    .nv-mob-scroll::-webkit-scrollbar { width: 4px; }
    .nv-mob-scroll::-webkit-scrollbar-thumb { background: rgba(0,230,118,0.2); border-radius: 10px; }
    
    /* Mobile Links */
    .nv-mob-link { 
      width: 100%; display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 12px; 
      border: none; cursor: pointer; text-align: left; background: transparent; color: #94a3af; 
      font-size: 0.95rem; font-weight: 700; transition: all 0.2s ease; text-transform: uppercase; letter-spacing: 0.02em;
    }
    .nv-mob-link:hover { background: rgba(255,255,255,0.03); color: #fff; padding-left: 22px; }
    .nv-mob-link.active { background: linear-gradient(90deg, rgba(0,230,118,0.15), transparent); color: #00e676; font-weight: 800; border-left: 4px solid #00e676; padding-left: 14px; }
  `;
  document.head.appendChild(s);
  stylesInjected = true;
};

/* ═══════════════════════════════════════════════════
   HELPERS & SVG
   ═══════════════════════════════════════════════════ */
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

const StatusDot = ({ status, size = 6 }) => {
  if (status === 'live') return <span style={{ width: size, height: size, borderRadius: '50%', background: '#00e676', boxShadow: '0 0 8px rgba(0,230,118,0.8)', animation: 'nvLiveDot 1.2s ease-in-out infinite', display: 'inline-block', flexShrink: 0 }} />;
  if (status === 'ft') return <span style={{ fontSize: '0.58rem', fontWeight: 900, color: 'rgba(255,255,255,0.35)' }}>FT</span>;
  return <Clock size={8} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />;
};

const LINKS = [
  { to: '/', label: 'Home', emoji: '🏠' },
  { to: '/fixtures', label: 'Fixtures', emoji: '⚽' },
  { to: '/highlights', label: 'Highlights & NEWS', emoji: '🎬' },
  { to: '/predictions', label: 'Predictions', emoji: '🎯', badge: 'NEW' },
  { to: '/basketball', label: 'Hoops', emoji: '🏀' },
  { to: '/leaderboard', label: 'Ranks', emoji: '🏆' },
  { to: '/mastergames', label: 'other Games', emoji: '🎮' },
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
  const koTime = m.kickoff?.includes('T') ? m.kickoff.split('T')[1]?.split(':').slice(0, 2).join(':') || '' : '';

  return (
    <div className="nv-pro-wrap" onClick={() => nav(m.matchId ? `/predictions?match=${m.matchId}` : '/predictions')} style={{ cursor: 'pointer', textDecoration: 'none', display: 'block' }}>
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
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
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
  
  const [rememberedAdmin, setRememberedAdmin] = useState(() => {
    try { return localStorage.getItem(ADMIN_REMEMBER_KEY) === 'true'; } catch { return false; }
  });
  const [adminNotifs, setAdminNotifs] = useState([]);

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

  const [bannerMatches, setBannerMatches] = useState([]);
  const [activePreds, setActivePreds] = useState([]);
  const [allPreds, setAllPreds] = useState([]);

  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const mobNotifRef = useRef(null);
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
      setBannerMatches(prev => prev.map(f => {
        const live = liveMap.get(String(f.id));
        if (!live) return f;
        return { ...f, homeScore: live.homeScore ?? f.homeScore, awayScore: live.awayScore ?? f.awayScore, isLive: true, isFinished: false, status: live.status || f.status, minute: live.minute ?? f.minute };
      }));
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
    if (!db) return setAdminNotifs([]);
    const q = query(collection(db, 'notifications'), where('targetUid', 'in', [null, uid || '__guest__']));
    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAdminNotifs(notifs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
    }, () => {});
    return () => unsub();
  }, [db, uid]);

  useEffect(() => {
    const fn = () => {
      if (!rafRef.current) { 
        rafRef.current = true; 
        requestAnimationFrame(() => { 
          setScrolled(window.scrollY > 10); 
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
    if (notifOpen && predNotifs.length > 0) setSeenNotifIds(new Set(predNotifs.map(n => n.id)));
  }, [notifOpen, predNotifs]);

  useEffect(() => {
    const handleRefocus = async () => {
      try {
        const res = await fetchFixtures(todayStr());
        if (res?.matches?.length > 0) setBannerMatches(res.matches);
      } catch { /* silent */ }
    };
    window.addEventListener('app:refocused', handleRefocus);
    return () => window.removeEventListener('app:refocused', handleRefocus);
  }, []);

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

  /* ═══ TICKER ═══ */
  const renderTickerItem = (m, i) => {
    const status = m.isLive ? 'live' : m.isFinished ? 'ft' : 'upcoming';
    return (
      <span key={`t-${m.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        <StatusDot status={status} size={7} />
        <span style={{ fontWeight: 800, fontSize: '.85rem', color: m.isLive ? '#fff' : 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>
          {m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}
        </span>
        <span style={{
          background: m.isLive ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.05)',
          borderRadius: 6, padding: '3px 12px', fontWeight: 900, fontSize: '.8rem', letterSpacing: '0.05em',
          fontFamily: 'ui-monospace, monospace',
          color: m.isLive ? '#00e676' : 'rgba(255,255,255,0.6)',
          boxShadow: m.isLive ? '0 0 10px rgba(0,230,118,0.1)' : 'none',
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          {m.homeScore ?? '?'} - {m.awayScore ?? '?'}
        </span>
        <span style={{ fontWeight: 800, fontSize: '.85rem', color: m.isLive ? '#fff' : 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>
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
    if (n.type === 'admin') {
      return (
        <div key={n.id} style={{
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
    const bgColor = isExact ? 'rgba(0,230,118,0.05)' : isResult ? 'rgba(251,191,36,0.05)' : 'rgba(239,68,68,0.05)';
    const borderColor = isExact ? 'rgba(0,230,118,0.3)' : isResult ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)';
    const icon = isExact ? '🎯' : isResult ? '👍' : '😔';
    const label = isExact ? 'EXACT' : isResult ? 'CORRECT' : 'MISS';
    const labelColor = isExact ? '#00e676' : isResult ? '#fbbf24' : '#ef4444';

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
  };

  /* ═══ NOTIFICATION DROPDOWN COMPONENT ═══ */
  const renderNotifDropdown = () => (
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
        background: 'linear-gradient(135deg, rgba(0,230,118,0.05) 0%, rgba(168,85,247,0.03) 100%)',
      }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <Bell size={16} style={{ color: '#00e676' }} /> Notifications
        </span>
        {predNotifs.length > 0 && (
          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#00e676', background: 'rgba(0,230,118,0.1)', padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(0,230,118,0.2)' }}>{predNotifs.length} New</span>
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
          {predNotifs.map(renderNotifItem)}
        </div>
      )}
    </div>
  );

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

      <ProHeader matches={bannerMatches} liveMatches={liveMatches} nav={navigate} />

      {/* TICKER BAR */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 1001, height: 42, overflow: 'hidden',
        display: 'flex', alignItems: 'center',
        background: 'linear-gradient(180deg, #000000 0%, #050a13 100%)',
        borderBottom: '1px solid rgba(0,230,118,0.1)',
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
              <span style={{ color: 'rgba(0,230,118,0.3)', fontSize: '0.6rem' }}>⚽</span>
              {tickerContent}
              <span style={{ color: 'rgba(0,230,118,0.3)', fontSize: '0.6rem' }}>⚽</span>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, textAlign: 'center', fontSize: '.85rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
            ⚽ zokascore.xyz — Live football scores & predictions
          </div>
        )}
      </div>

      {/* NAV BAR */}
      <nav className="nv-main-nav" style={{
        position: 'sticky', top: 42, zIndex: 1000, height: 68,
        background: scrolled ? 'rgba(6,11,20,0.85)' : 'rgba(6,11,20,0)',
        backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
        borderBottom: `1px solid ${scrolled ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0)'}`,
        boxShadow: scrolled ? '0 8px 32px rgba(0,0,0,0.3)' : 'none',
        transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)',
        willChange: 'background, backdrop-filter, box-shadow',
      }}>
        <div style={{ maxWidth: 'var(--max-width, 1140px)', margin: '0 auto', padding: '0 20px', height: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 12 }}>
          
          {/* LEFT: Desktop Home */}
          <div className="nv-dk" style={{ display: 'flex', alignItems: 'center' }}>
            <Link to="/" className={`nv-nav-link ${isHome ? 'active' : ''}`} style={{ padding: '8px 16px', borderRadius: 8 }} aria-label="Home">
              <Home size={16} strokeWidth={2.5} /> Home
            </Link>
          </div>

          {/* CENTER: Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }} className="nv-logo-link">
              <img src={APP_LOGO} alt="ZokaScore Logo" style={{ width: 42, height: 42, borderRadius: 12, objectFit: 'cover', boxShadow: '0 0 20px rgba(0,230,118,0.3), 0 4px 12px rgba(0,0,0,0.3)', animation: 'nvLogoFloat 4s ease-in-out infinite' }} />
              <div className="nv-dk" style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
                <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '0.02em', color: '#ffffff', whiteSpace: 'nowrap' }}>ZOKA</span>
                <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '0.03em', color: '#00e676', whiteSpace: 'nowrap', marginLeft: 2, animation: 'nvScoreGlow 3s ease-in-out infinite' }}>SCORE</span>
                <span style={{ color: '#00e676', fontSize: '1.5rem', lineHeight: 1, animation: 'nvDotBlink 2.5s ease-in-out infinite', textShadow: '0 0 12px rgba(0,230,118,0.7)', marginLeft: 0, opacity: 0.5 }}>.</span>
                <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.15em', textTransform: 'uppercase', marginLeft: 4, opacity: 0.8 }}>xyz</span>
              </div>
            </Link>
          </div>

          {/* RIGHT: Desktop actions */}
          <div className="nv-dk" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, justifyContent: 'flex-end' }}>
            
            {/* Search */}
            <div ref={searchRef} style={{ position: 'relative' }}>
              <button onClick={() => { setSearchOpen(p => !p); if (searchOpen) setSearchQuery(''); }} className={`nv-action-btn ${searchOpen ? 'active' : ''}`} aria-label="Search">
                <Search size={18} strokeWidth={2.5} />
              </button>
              {searchOpen && (
                <form onSubmit={handleSearch} style={{
                  position: 'absolute', top: 'calc(100% + 12px)', right: 0, width: 300,
                  background: 'rgba(10,15,25,0.95)', border: '1px solid rgba(0,230,118,0.15)',
                  borderRadius: 12, overflow: 'hidden',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                  animation: 'nvFadeUp 0.2s ease both',
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 46,
                  backdropFilter: 'blur(20px)'
                }}>
                  <Search size={16} style={{ color: '#00e676', flexShrink: 0 }} />
                  <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search matches, teams..." style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    color: '#fff', fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit',
                  }} />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                  )}
                </form>
              )}
            </div>

            {/* Notifications */}
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
                      border: '2px solid #060b14',
                      boxShadow: '0 0 12px rgba(239,68,68,0.6)',
                      animation: 'nvBadgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                    }}>{notifCount > 9 ? '9+' : notifCount}</span>
                  )}
                </button>
                {notifOpen && renderNotifDropdown()}
              </div>
            )}

            {/* Points badge */}
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

            {/* Desktop nav links */}
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
                      <span style={{ fontSize: '0.45rem', fontWeight: 900, color: '#001b07', background: 'linear-gradient(135deg, #00e676, #00c853)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.08em', boxShadow: '0 2px 8px rgba(0,230,118,0.3)' }}>{link.badge}</span>
                    )}
                  </Link>
                );
              })}

              {/* Auth */}
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

          {/* MOBILE RIGHT */}
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
                      display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #060b14',
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

      {/* ═══ MOBILE MENU ═══ */}
      <div className={`nv-mob-overlay ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />
      <div className={`nv-mob-drawer ${mobileOpen ? 'open' : ''}`}>
        
        {/* Sticky header */}
        <div className="nv-mob-header" style={{
          padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0,230,118,0.1)', position: 'sticky', top: 0, zIndex: 3,
          background: 'rgba(6,11,20,0.9)', backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', overflow: 'hidden' }}>
            <img src={APP_LOGO} alt="ZokaScore" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', boxShadow: '0 0 15px rgba(0,230,118,0.3)', animation: 'nvLogoFloat 3s ease-in-out infinite' }} />
            <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#fff', letterSpacing: '0.02em' }}>ZOKA<span style={{ color: '#00e676' }}>SCORE</span></span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="nv-action-btn" style={{ width: '36px', height: '36px' }}>
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="nv-mob-scroll">
          {/* User card */}
          {isLoggedIn && userProfile && (
            <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(180deg, rgba(0,230,118,0.05) 0%, transparent 100%)', animation: 'nvMobUserIn 0.45s ease 0.08s both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  background: 'linear-gradient(135deg, #00e676 0%, #00c853 40%, #059669 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.3rem', fontWeight: 900, color: '#001b07',
                  boxShadow: '0 4px 20px rgba(0,230,118,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
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
                  { label: 'Exact', value: userStats.exact, color: '#00e676', icon: '🎯' },
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

          {/* Main nav links */}
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
                    <span style={{ fontSize: '0.5rem', fontWeight: 900, color: '#001b07', background: 'linear-gradient(135deg, #00e676, #00c853)', padding: '3px 8px', borderRadius: 4, letterSpacing: '0.08em', boxShadow: '0 2px 8px rgba(0,230,118,0.3)' }}>{link.badge}</span>
                  )}
                  <ChevronRight size={16} style={{ opacity: 0.3 }} />
                </button>
              );
            })}

            {/* Auth section */}
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

            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,230,118,0.1), transparent)', margin: '18px 0' }} />

            {/* Info accordion */}
            <button
              onClick={() => setInfoOpen(p => !p)}
              className="nv-mob-link"
              style={{
                border: `1px solid ${infoOpen ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.05)'}`,
                background: infoOpen ? 'rgba(0,230,118,0.05)' : 'transparent',
                color: infoOpen ? '#00e676' : '#64748b',
              }}
            >
              <span style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: infoOpen ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.05)', fontSize: '0.95rem' }}>ℹ️</span>
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

          {/* Footer */}
          <div style={{ padding: '28px 20px 40px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
              <img src={APP_LOGO} alt="ZokaScore Logo" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
              <span style={{ fontWeight: 900, fontSize: '0.8rem', color: '#64748b' }}>ZOKA<span style={{ color: '#00e676', opacity: 0.8 }}>SCORE</span></span>
            </div>
            <div style={{ fontSize: '0.65rem', color: '#4a5568', opacity: 0.7, letterSpacing: '0.05em' }}>© {new Date().getFullYear()} ZokaScore. All rights reserved.</div>
          </div>
        </div>
      </div>
    </>
  );
}