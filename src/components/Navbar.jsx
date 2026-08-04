import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogOut, User, Shield, Zap, Home, Search, Bell,
  Target, ChevronRight, ChevronDown, ChevronUp, MoreHorizontal, Command, 
  Activity, Trophy, Newspaper, Tv, Gamepad2, Building, LifeBuoy, Scale, Info
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useLiveMatches } from '../hooks/useFixtures';
import { useActivePredictions, useUserPredictions, useDailyLeaderboard } from '../hooks/useUserData';
import { calcPoints } from '../utils/constants';
import { todayStr } from '../utils/dates';
import { db } from '../utils/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { buildMatchRoute } from '../utils/routes';
import { applySmartMinute } from '../engine/matchEngine';
import ThemeSwitcher from './ThemeSwitcher';

const ADMIN_PATH = '/zks-admin-8f9x2-control-panel';
const APP_LOGO = '/icons/icon-192.png';

const dropdownBase = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  right: 0,
  zIndex: 'var(--z-dropdown)',
};

function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - (ts?.toMillis?.() || ts);
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

const LINKS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/fixtures', label: 'Fixtures', icon: Activity },
  { to: '/predictions', label: 'Predictions', icon: Target, badge: 'NEW' },
  { to: '/leaderboard', label: 'Ranks', icon: Trophy },
  { to: '/highlights', label: 'News', icon: Newspaper },
  { to: '/livestream', label: 'Stream', icon: Tv, isLive: true },
  { to: '/basketball', label: 'Hoops', icon: Gamepad2 },
];

const MOBILE_NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/fixtures', label: 'Live', icon: Activity },
  { to: '/predictions', label: 'Predict', icon: Target },
  { to: '/leaderboard', label: 'Compete', icon: Trophy },
  { to: '/profile', label: 'Profile', icon: User },
];

const SYSTEM_LINKS = [
  { 
    title: 'Company', 
    icon: Building,
    links: [['About', '/about'], ['Contact', '/contact'], ['Careers', '/careers'], ['Partners', '/partners'], ['Advertise', '/advertise'], ['Team', '/team']] 
  },
  { 
    title: 'Support', 
    icon: LifeBuoy,
    links: [['Help Center', '/help-center'], ['FAQ', '/faq']] 
  },
  { 
    title: 'Legal', 
    icon: Scale,
    links: [['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']] 
  },
];

const CommandPalette = React.memo(({ open, onClose, links, liveMatches, navigate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearchQuery('');
  }, [open]);

  const filteredLinks = useMemo(() => {
    if (!searchQuery) return links;
    return links.filter((l) => l.label.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, links]);

  const filteredMatches = useMemo(() => {
    if (!searchQuery) return [];
    return liveMatches
      .filter(
        (m) =>
          m.homeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.awayName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 5);
  }, [searchQuery, liveMatches]);

  if (!open) return null;

  const handleNav = (to) => {
    navigate(to);
    onClose();
  };

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-wrap">
          <Search size={18} className="text-muted" />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search matches, teams, or navigate..."
            className="cmd-input"
          />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>ESC</button>
        </div>
        <div className="cmd-results">
          {filteredMatches.length > 0 && (
            <div className="mb-16">
              <div className="text-muted font-bold p-8" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Matches
              </div>
              {filteredMatches.map((m) => (
                <button key={m.id} className="cmd-item" onClick={() => handleNav(buildMatchRoute(m.id, m.homeName, m.awayName))}>
                  <Activity size={14} className="text-primary" />
                  <span className="flex-1" style={{ textAlign: 'left' }}>{m.homeName} vs {m.awayName}</span>
                  {m.isLive && <span className="badge badge-danger">LIVE</span>}
                </button>
              ))}
            </div>
          )}
          <div>
            <div className="text-muted font-bold p-8" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Navigation
            </div>
            {filteredLinks.length === 0 ? (
              <div className="text-muted text-center p-24" style={{ fontSize: 'var(--fs-sm)' }}>No matches for "{searchQuery}"</div>
            ) : (
              filteredLinks.map((l) => (
                <button key={l.to} className="cmd-item" onClick={() => handleNav(l.to)}>
                  <l.icon size={14} className="text-muted" />
                  <span>{l.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const NotifItem = React.memo(({ n }) => {
  const isExact = n.type === 'exact';
  const bgColor = isExact ? 'rgba(var(--primary-rgb), 0.05)' : n.type === 'result' ? 'rgba(var(--gold-rgb), 0.05)' : 'rgba(var(--danger-rgb), 0.05)';
  const borderColor = isExact ? 'var(--primary)' : n.type === 'result' ? 'var(--gold)' : 'var(--danger)';
  const icon = isExact ? '🎯' : n.type === 'result' ? '👍' : '😔';

  return (
    <div
      className="nv-notif-item anim-slide-in"
      style={{ background: bgColor, borderLeft: `3px solid ${borderColor}` }}
    >
      <span style={{ fontSize: 'var(--fs-lg)' }}>{icon}</span>
      <div className="flex-col flex-1">
        <div className="text-primary font-bold" style={{ fontSize: 'var(--fs-sm)' }}>{n.homeTeam} vs {n.awayTeam}</div>
        <div className="flex gap-8 text-muted" style={{ alignItems: 'center', fontSize: 'var(--fs-xs)' }}>
          <span>Pred: <span className="text-primary font-bold">{n.predScore}</span></span>
          <span>Act: <span className="text-primary font-bold">{n.actualScore}</span></span>
        </div>
      </div>
      <div className="flex-col" style={{ alignItems: 'flex-end' }}>
        {n.points > 0 && <div className="text-gold font-bold" style={{ fontSize: 'var(--fs-md)' }}>+{n.points}</div>}
        <div className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>{timeAgo(n.time)}</div>
      </div>
    </div>
  );
});

export default function Navbar() {
  const { currentUser, userProfile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const uid = currentUser?.uid;
  const isLoggedIn = !!uid;
  const now = useNow(10000);

  const { data: rawLive = [] } = useLiveMatches();
  const { data: activePreds = [] } = useActivePredictions(todayStr());
  const { data: userPredsObj = {} } = useUserPredictions(uid, todayStr());
  const { data: dailyLB = null } = useDailyLeaderboard(todayStr());

  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const isAdmin = userProfile?.isAdmin || userProfile?.role === 'admin' || userProfile?.role === 'staff';

  const { data: adminNotifs = [] } = useQuery({
    queryKey: ['notifications', uid],
    queryFn: async () => {
      if (!db) return [];
      const q = query(collection(db, 'notifications'), where('targetUid', 'in', [null, uid || '__guest__']), orderBy('createdAt', 'desc'), limit(20));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    enabled: !!uid,
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const liveMatches = useMemo(() => rawLive.map((m) => applySmartMinute(m, now)).filter((m) => !m.isHidden), [rawLive, now]);
  const allPreds = useMemo(() => Object.values(userPredsObj), [userPredsObj]);

  const notifRef = useRef(null);
  const moreRef = useRef(null);

  const isActive = useCallback((p) => location.pathname === p, [location.pathname]);

  const scoreMap = useMemo(() => {
    const m = new Map();
    activePreds.forEach((p) => {
      if (p.status === 'finished' && p.homeScore != null) m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
    });
    return m;
  }, [activePreds]);

  const userPredMap = useMemo(() => {
    if (!uid) return {};
    const m = {};
    allPreds.filter((p) => p.userId === uid).forEach((p) => { m[p.predId] = p; });
    return m;
  }, [allPreds, uid]);

  const predNotifs = useMemo(() => {
    const combined = [];
    adminNotifs.forEach((n) => combined.push({ id: n.id, type: 'admin', title: n.title, body: n.body, time: n.createdAt?.toMillis?.() || 0 }));
    if (uid) {
      Object.values(userPredMap).forEach((p) => {
        const actual = scoreMap.get(String(p.matchId));
        if (!actual) return;
        const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
        if (r.type === 'pending') return;
        combined.push({
          id: `pred-${p.predId}`,
          type: r.type,
          points: r.points,
          homeTeam: p.homeTeam || 'Home',
          awayTeam: p.awayTeam || 'Away',
          predScore: `${p.homeScore}-${p.awayScore}`,
          actualScore: `${actual.h}-${actual.a}`,
          time: p.updatedAt?.toMillis?.() || 0,
        });
      });
    }
    return combined.sort((a, b) => b.time - a.time);
  }, [adminNotifs, userPredMap, scoreMap, uid]);

  const notifCount = predNotifs.length;

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    setMoreOpen(false);
    setCmdOpen(false);
    setSystemOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen((p) => !p); }
      if (e.key === 'Escape') { setCmdOpen(false); setNotifOpen(false); setMoreOpen(false); setMobileOpen(false); setSystemOpen(false); }
      if (e.type === 'mousedown') {
        if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
        if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('mousedown', handler);
    };
  }, []);

  const renderNotifDropdown = useCallback(
    () => (
      <div className="nv-notif-dropdown flex-col">
        <div className="flex-between p-16" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-primary font-bold flex" style={{ alignItems: 'center', gap: 'var(--sp-8)' }}>
            <Bell size={16} /> Notifications
          </span>
          {predNotifs.length > 0 && <span className="badge badge-primary">{predNotifs.length} New</span>}
        </div>
        {predNotifs.length === 0 ? (
          <div className="flex-col p-32 text-center" style={{ alignItems: 'center' }}>
            <Target size={32} className="text-muted mb-12" />
            <div className="text-secondary font-bold">No results yet</div>
          </div>
        ) : (
          predNotifs.map((n) => <NotifItem key={n.id} n={n} />)
        )}
      </div>
    ),
    [predNotifs]
  );

  const tickerMatches = useMemo(() => {
    if (liveMatches.length === 0) return [];
    return [...liveMatches.filter((m) => m.isLive), ...liveMatches.filter((m) => !m.isLive).slice(0, 5)];
  }, [liveMatches]);

  return (
    <>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} links={LINKS} liveMatches={liveMatches} navigate={navigate} />

      {/* Mobile Drawer Overlay */}
      <div className={`nv-mob-overlay ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />

      {/* Mobile Drawer (Pro Sidebar) */}
      <aside className={`nv-mob-drawer ${mobileOpen ? 'open' : ''}`}>
        <div className="flex-between p-16" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="font-bold text-primary flex" style={{ alignItems: 'center', gap: 'var(--sp-8)' }}>
            <img src={APP_LOGO} alt="" width="22" height="22" style={{ borderRadius: 'var(--r-8)' }} />
            Menu
          </span>
          <button onClick={() => setMobileOpen(false)} className="btn-icon-sm" aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <div className="p-12 flex-col gap-4">
          {LINKS.map((link, i) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`btn btn-ghost w-full flex-between anim-slide-in ${isActive(link.to) ? 'active' : ''}`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="flex" style={{ alignItems: 'center', gap: 'var(--sp-8)' }}>
                <link.icon size={16} />
                <span className="link-text-anim">
                  {link.label}
                </span>
                {link.isLive && <span className="zk-live-pulse-dot" />}
              </span>
              {link.badge && <span className="badge badge-primary">{link.badge}</span>}
            </Link>
          ))}

          {isAdmin && (
            <Link
              to={ADMIN_PATH}
              onClick={() => setMobileOpen(false)}
              className={`btn btn-ghost w-full flex-between text-gold anim-slide-in ${isActive(ADMIN_PATH) ? 'active' : ''}`}
              style={{ animationDelay: `${(LINKS.length + 1) * 40}ms` }}
            >
              <span className="flex" style={{ alignItems: 'center', gap: 'var(--sp-8)' }}><Shield size={16} /> Admin Panel</span>
            </Link>
          )}

          <div className="mt-12 mb-12" style={{ height: 1, background: 'var(--border)' }} />

          {/* PRO: Auth Section - Sign In/Out Button */}
          <div className="nav-auth-section anim-slide-in" style={{ animationDelay: `${(LINKS.length + 2) * 40}ms` }}>
            {isLoggedIn ? (
              <button 
                onClick={() => { signOut(); setMobileOpen(false); }} 
                className="btn btn-ghost w-full flex-between text-danger"
              >
                <span className="flex" style={{ alignItems: 'center', gap: 'var(--sp-8)' }}>
                  <LogOut size={16} /> Sign Out
                </span>
                <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>{userProfile?.displayName || 'User'}</span>
              </button>
            ) : (
              <Link 
                to="/login" 
                onClick={() => setMobileOpen(false)}
                className="btn btn-primary w-full flex-center"
                style={{ gap: 'var(--sp-8)' }}
              >
                <Zap size={16} /> Sign In
              </Link>
            )}
          </div>

          {/* PRO: Admin Detection Badge */}
          {isAdmin && (
            <div className="nav-admin-badge anim-slide-in" style={{ animationDelay: `${(LINKS.length + 3) * 40}ms` }}>
              <div className="flex-center gap-8" style={{ padding: 'var(--sp-12)', background: 'rgba(var(--gold-rgb), 0.1)', borderRadius: 'var(--r-12)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}>
                <Shield size={16} className="text-gold" />
                <span className="text-gold font-bold" style={{ fontSize: 'var(--fs-xs)' }}>Admin Access Detected</span>
              </div>
            </div>
          )}

          <div className="mt-12 mb-12" style={{ height: 1, background: 'var(--border)' }} />

          {/* PRO: System & Info Accordion Button */}
          <button 
            className="btn btn-ghost w-full flex-between anim-slide-in" 
            style={{ animationDelay: `${(LINKS.length + 4) * 40}ms` }}
            onClick={() => setSystemOpen(!systemOpen)}
          >
            <span className="flex" style={{ alignItems: 'center', gap: 'var(--sp-8)' }}>
              <Info size={16} /> System & Info
            </span>
            {systemOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {/* PRO: Animated Accordion Content */}
          <div className={`nav-accordion ${systemOpen ? 'open' : ''}`}>
            {SYSTEM_LINKS.map((sec, i) => (
              <div key={sec.title} className="nav-accordion-section anim-slide-in" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="text-muted font-bold mb-8 flex" style={{ alignItems: 'center', gap: 'var(--sp-8)', fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <sec.icon size={12} className="text-primary" /> {sec.title}
                </div>
                <div className="flex-col gap-4">
                  {sec.links.map(([label, to]) => (
                    <Link 
                      key={to} 
                      to={to} 
                      onClick={() => { setSystemOpen(false); setMobileOpen(false); }} 
                      className="btn btn-ghost btn-sm w-full flex-between"
                    >
                      {label} <ChevronRight size={14} style={{ opacity: 0.5 }} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Global Top Bar */}
      <header className={`nav-top-bar anim-fade-in ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-top-grid">
          {/* Left: Logo */}
          <div className="nav-top-left">
            <Link to="/" className="flex" style={{ alignItems: 'center', gap: 'var(--sp-8)' }}>
              <img src={APP_LOGO} alt="ZokaScore Logo" width="32" height="32" style={{ borderRadius: 'var(--r-8)' }} />
              <span className="font-extrabold text-primary hide-mobile" style={{ fontSize: 'var(--fs-md)', letterSpacing: '-0.02em' }}>
                ZOKASCORE
              </span>
            </Link>
          </div>

          {/* Center: Desktop Links */}
          <nav className="nav-top-center hide-mobile">
            {LINKS.map((link) => {
              const active = isActive(link.to);
              return (
                <Link key={link.to} to={link.to} className={`nav-link ${active ? 'active' : ''}`}>
                  <link.icon size={14} style={{ marginRight: '6px' }} />
                  <span className="link-text-anim">
                    {link.label}
                  </span>
                  {link.isLive && <span className="zk-live-pulse-dot" style={{ marginLeft: 'var(--sp-4)' }} />}
                  {link.badge && <span className="badge badge-primary" style={{ marginLeft: 'var(--sp-4)' }}>{link.badge}</span>}
                </Link>
              );
            })}

            {/* PRO: More Dropdown (Desktop) */}
            <div ref={moreRef} style={{ position: 'relative' }}>
              <button onClick={() => setMoreOpen((p) => !p)} className={`nav-link ${moreOpen ? 'active' : ''}`}>
                <MoreHorizontal size={14} style={{ marginRight: '6px' }} /> More
              </button>
              {moreOpen && (
                <div className="nav-more-dropdown glass-card anim-pop" style={dropdownBase}>
                  <div className="nav-more-grid">
                    {SYSTEM_LINKS.map((sec) => (
                      <div key={sec.title} className="nav-more-col">
                        <div className="text-muted font-bold mb-12 flex" style={{ alignItems: 'center', gap: 'var(--sp-8)', fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          <sec.icon size={14} className="text-primary" /> {sec.title}
                        </div>
                        <div className="flex-col gap-4">
                          {sec.links.map(([label, to]) => (
                            <Link
                              key={to}
                              to={to}
                              onClick={() => setMoreOpen(false)}
                              className="nav-more-link"
                            >
                              {label} <ChevronRight size={12} style={{ opacity: 0.4 }} />
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Right: Actions */}
          <div className="nav-top-right">
            <button onClick={() => setCmdOpen(true)} className="btn-icon-sm anim-bounce-glow" aria-label="Search">
              <Command size={18} />
            </button>

            <ThemeSwitcher />

            {isLoggedIn && (
              <div ref={notifRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setNotifOpen((p) => !p)}
                  className={`btn-icon-sm anim-bounce-glow ${notifOpen ? 'active' : ''}`}
                  aria-label="Notifications"
                  style={{ position: 'relative' }}
                >
                  <Bell size={18} />
                  {notifCount > 0 && (
                    <span className="nv-badge-count">
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </button>
                {notifOpen && renderNotifDropdown()}
              </div>
            )}

            {isAdmin && (
              <Link to={ADMIN_PATH} className={`btn-icon-sm ${isActive(ADMIN_PATH) ? 'active' : ''} text-gold`} title="Admin Panel">
                <Shield size={18} />
              </Link>
            )}

            {/* Profile */}
            {isLoggedIn ? (
              <Link
                to="/profile"
                className="nav-profile-block"
                style={isActive('/profile') ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 3px rgba(var(--primary-rgb), 0.12)' } : undefined}
              >
                <div className="nav-avatar">{userProfile?.displayName?.[0]?.toUpperCase() || 'U'}</div>
                <span className="text-primary font-bold hide-mobile" style={{ fontSize: 'var(--fs-sm)' }}>
                  {userProfile?.displayName?.split(' ')[0] || 'User'}
                </span>
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm hide-mobile" title="Sign In">
                <Zap size={16} /> Sign In
              </Link>
            )}

            {/* Hamburger */}
            <button onClick={() => setMobileOpen((p) => !p)} className="btn-icon-sm anim-bounce-glow hide-desktop" aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>
              <span key={mobileOpen ? 'x' : 'menu'} className="anim-pop" style={{ display: 'inline-flex' }}>
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Nav */}
      <nav className="nav-bottom hide-desktop">
        <div className="flex-around" style={{ height: '100%', width: '100%' }}>
          {MOBILE_NAV.map((link) => {
            const active = isActive(link.to);
            return (
              <Link key={link.to} to={link.to} className={`nav-link-bottom ${active ? 'active' : ''}`}>
                <span className="nav-icon-wrap">
                  <link.icon size={20} />
                </span>
                <span className="link-text-anim">
                  {link.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}