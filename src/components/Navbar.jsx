import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, User, Shield, Zap, Home, Search, Bell, Target, ChevronRight, ChevronDown, ChevronUp, MoreHorizontal, Command, Activity, Trophy, Newspaper, Tv, Gamepad2, Building, LifeBuoy, Scale, Info, Sparkles } from 'lucide-react';
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

function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(id); }, [interval]);
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
  { to: '/studio', label: 'Studio', icon: Sparkles },
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
  { title: 'Creator', icon: Sparkles, links: [['Studio', '/studio'], ['Master Games', '/mastergames']] },
  { title: 'Company', icon: Building, links: [['About', '/about'], ['Contact', '/contact'], ['Careers', '/careers'], ['Partners', '/partners'], ['Advertise', '/advertise'], ['Team', '/team']] },
  { title: 'Support', icon: LifeBuoy, links: [['Help Center', '/help-center'], ['FAQ', '/faq']] },
  { title: 'Legal', icon: Scale, links: [['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']] },
];

const CommandPalette = React.memo(({ open, onClose, links, liveMatches, navigate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); else setSearchQuery(''); }, [open]);
  const filteredLinks = useMemo(() => !searchQuery ? links : links.filter((l) => l.label.toLowerCase().includes(searchQuery.toLowerCase())), [searchQuery, links]);
  const filteredMatches = useMemo(() => !searchQuery ? [] : liveMatches.filter((m) => m.homeName?.toLowerCase().includes(searchQuery.toLowerCase()) || m.awayName?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5), [searchQuery, liveMatches]);
  if (!open) return null;
  const handleNav = (to) => { navigate(to); onClose(); };
  return (
    <div className="cmd-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-wrap"><Search size={18} className="text-muted" /><input ref={inputRef} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search matches, teams, or navigate..." className="cmd-input" /><button className="btn btn-ghost btn-sm" onClick={onClose}>ESC</button></div>
        <div className="cmd-results">
          {filteredMatches.length > 0 && <div className="mb-16"><div className="cmd-group-title">Matches</div><ul>{filteredMatches.map((m) => <li key={m.id}><button className="cmd-item" onClick={() => handleNav(buildMatchRoute(m.id, m.homeName, m.awayName))}><Activity size={14} />{m.homeName} vs {m.awayName}{m.isLive && <span className="badge badge-danger">LIVE</span>}</button></li>)}</ul></div>}
          <div><div className="cmd-group-title">Navigation</div>{filteredLinks.length === 0 ? <div className="text-muted text-center p-24">No matches for "{searchQuery}"</div> : <ul>{filteredLinks.map((l) => <li key={l.to}><button className="cmd-item" onClick={() => handleNav(l.to)}><l.icon size={14} />{l.label}</button></li>)}</ul>}</div>
        </div>
      </div>
    </div>
  );
});

const NotifItem = React.memo(({ n }) => {
  const isExact = n.type === 'exact';
  const bg = isExact ? 'rgba(var(--primary-rgb), 0.05)' : n.type === 'result' ? 'rgba(var(--gold-rgb), 0.05)' : 'rgba(var(--danger-rgb), 0.05)';
  const border = isExact ? 'var(--primary)' : n.type === 'result' ? 'var(--gold)' : 'var(--danger)';
  const icon = isExact ? '🎯' : n.type === 'result' ? '👍' : '😔';
  return <li className="nv-notif-item" style={{ background: bg, borderLeft: `3px solid ${border}` }}><span className="text-lg">{icon}</span><div className="flex-1"><div className="font-bold text-sm">{n.homeTeam} vs {n.awayTeam}</div><div className="flex gap-8 text-xs text-muted">Pred: <span className="font-bold primary">{n.predScore}</span> Act: <span className="font-bold primary">{n.actualScore}</span></div></div><div className="text-right">{n.points > 0 && <div className="gold font-bold">+{n.points}</div>}<div className="text-xs text-muted">{timeAgo(n.time)}</div></div></li>;
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
  });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isAdmin = userProfile?.isAdmin || userProfile?.role === 'admin';
  const liveMatches = useMemo(() => rawLive.map((m) => applySmartMinute(m, now)).filter((m) => !m.isHidden), [rawLive, now]);
  const allPreds = useMemo(() => Object.values(userPredsObj), [userPredsObj]);
  const notifRef = useRef(null);
  const moreRef = useRef(null);
  const isActive = useCallback((p) => location.pathname === p, [location.pathname]);

  const scoreMap = useMemo(() => { const m = new Map(); activePreds.forEach((p) => { if (p.status === 'finished' && p.homeScore != null) m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore }); }); return m; }, [activePreds]);
  const userPredMap = useMemo(() => { if (!uid) return {}; const m = {}; allPreds.filter((p) => p.userId === uid).forEach((p) => { m[p.predId] = p; }); return m; }, [allPreds, uid]);
  const predNotifs = useMemo(() => {
    const combined = [];
    adminNotifs.forEach((n) => combined.push({ id: n.id, type: 'admin', title: n.title, body: n.body, time: n.createdAt?.toMillis?.() || 0 }));
    if (uid) {
      Object.values(userPredMap).forEach((p) => {
        const actual = scoreMap.get(String(p.matchId));
        if (!actual) return;
        const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
        if (r.type === 'pending') return;
        combined.push({ id: `pred-${p.predId}`, type: r.type, points: r.points, homeTeam: p.homeTeam || 'Home', awayTeam: p.awayTeam || 'Away', predScore: `${p.homeScore}-${p.awayScore}`, actualScore: `${actual.h}-${actual.a}`, time: p.updatedAt?.toMillis?.() || 0 });
      });
    }
    return combined.sort((a, b) => b.time - a.time);
  }, [adminNotifs, userPredMap, scoreMap, uid]);

  const notifCount = predNotifs.length;

  useEffect(() => { const fn = () => setScrolled(window.scrollY > 10); window.addEventListener('scroll', fn, { passive: true }); return () => window.removeEventListener('scroll', fn); }, []);
  useEffect(() => { setMobileOpen(false); setNotifOpen(false); setMoreOpen(false); setCmdOpen(false); setSystemOpen(false); }, [location.pathname]);
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
    return () => { document.removeEventListener('keydown', handler); document.removeEventListener('mousedown', handler); };
  }, []);

  return (
    <>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} links={LINKS} liveMatches={liveMatches} navigate={navigate} />
      <div className={`nv-mob-overlay ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />
      <aside className={`nv-mob-drawer ${mobileOpen ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="flex-between p-16 border-b"><span className="font-bold flex-center gap-8"><img src={APP_LOGO} alt="" width="22" height="22" className="rounded-8" /> Menu</span><button onClick={() => setMobileOpen(false)} className="btn-icon-sm"><X size={18} /></button></div>
        <nav className="p-12 flex-col gap-4">
          <ul className="flex-col gap-4">
            {LINKS.map((link, i) => (
              <li key={link.to}><Link to={link.to} onClick={() => setMobileOpen(false)} className={`btn btn-ghost w-full flex-between ${isActive(link.to) ? 'active' : ''}`} style={{ animationDelay: `${i * 40}ms` }}><span className="flex-center gap-8"><link.icon size={16} />{link.label}{link.isLive && <span className="zk-live-pulse-dot" />}</span>{link.badge && <span className="badge badge-primary">{link.badge}</span>}</Link></li>
            ))}
            {isAdmin && <li><Link to={ADMIN_PATH} onClick={() => setMobileOpen(false)} className={`btn btn-ghost w-full flex-between gold ${isActive(ADMIN_PATH) ? 'active' : ''}`}><span className="flex-center gap-8"><Shield size={16} /> Admin Panel</span></Link></li>}
          </ul>
          <div className="divider my-12" />
          <div className="nav-auth-section">{isLoggedIn ? <button onClick={() => { signOut(); setMobileOpen(false); }} className="btn btn-ghost w-full flex-between danger"><span className="flex-center gap-8"><LogOut size={16} /> Sign Out</span><span className="text-xs muted">{userProfile?.displayName || 'User'}</span></button> : <Link to="/login" onClick={() => setMobileOpen(false)} className="btn btn-primary w-full flex-center gap-8"><Zap size={16} /> Sign In</Link>}</div>
          <div className="divider my-12" />
          <button className="btn btn-ghost w-full flex-between" onClick={() => setSystemOpen(!systemOpen)} aria-expanded={systemOpen}><span className="flex-center gap-8"><Info size={16} /> System & Info</span>{systemOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
          <ul className={`nav-accordion ${systemOpen ? 'open' : ''}`}>{SYSTEM_LINKS.map((sec) => <li key={sec.title} className="nav-accordion-section"><div className="accordion-title"><sec.icon size={12} className="primary" /> {sec.title}</div><ul className="flex-col gap-4">{sec.links.map(([label, to]) => <li key={to}><Link to={to} onClick={() => { setSystemOpen(false); setMobileOpen(false); }} className="btn btn-ghost btn-sm w-full flex-between">{label} <ChevronRight size={14} /></Link></li>)}</ul></li>)}</ul>
        </nav>
      </aside>

      <header className={`nav-top-bar ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-top-grid">
          <div className="nav-top-left"><Link to="/" className="flex-center gap-8" aria-label="ZOKASCORE Home"><img src={APP_LOGO} alt="ZokaScore" width="32" height="32" className="rounded-8" /><span className="font-extrabold hide-mobile">ZOKASCORE</span></Link></div>
          <nav className="nav-top-center hide-mobile" aria-label="Main Navigation"><ul className="flex-center gap-4">
            {LINKS.map((link) => <li key={link.to}><Link to={link.to} className={`nav-link ${isActive(link.to) ? 'active' : ''}`}><link.icon size={14} className="mr-6" />{link.label}{link.isLive && <span className="zk-live-pulse-dot ml-4" />}{link.badge && <span className="badge badge-primary ml-4">{link.badge}</span>}</Link></li>)}
            <li ref={moreRef} className="relative"><button onClick={() => setMoreOpen((p) => !p)} className={`nav-link ${moreOpen ? 'active' : ''}`} aria-expanded={moreOpen}><MoreHorizontal size={14} className="mr-6" /> More</button>
              {moreOpen && <div className="nav-more-dropdown glass-card anim-pop"><div className="nav-more-grid">{SYSTEM_LINKS.map((sec) => <div key={sec.title} className="nav-more-col"><div className="nav-more-title"><sec.icon size={14} className="primary" /> {sec.title}</div><ul className="flex-col gap-4">{sec.links.map(([label, to]) => <li key={to}><Link to={to} onClick={() => setMoreOpen(false)} className="nav-more-link">{label} <ChevronRight size={12} /></Link></li>)}</ul></div>)}</div></div>}
            </li>
          </ul></nav>
          <div className="nav-top-right">
            <button onClick={() => setCmdOpen(true)} className="btn-icon-sm" aria-label="Search"><Command size={18} /></button>
            <ThemeSwitcher />
            {isLoggedIn && <div ref={notifRef} className="relative"><button onClick={() => setNotifOpen((p) => !p)} className={`btn-icon-sm ${notifOpen ? 'active' : ''}`} aria-label="Notifications" style={{ position: 'relative' }}><Bell size={18} />{notifCount > 0 && <span className="nv-badge-count">{notifCount > 9 ? '9+' : notifCount}</span>}</button>
              {notifOpen && <div className="nv-notif-dropdown"><div className="flex-between p-16 border-b"><span className="font-bold flex-center gap-8"><Bell size={16} /> Notifications</span>{predNotifs.length > 0 && <span className="badge badge-primary">{predNotifs.length} New</span>}</div>{predNotifs.length === 0 ? <div className="flex-col p-32 text-center items-center"><Target size={32} className="muted mb-12" /><div className="font-bold">No results yet</div></div> : <ul>{predNotifs.map((n) => <NotifItem key={n.id} n={n} />)}</ul>}</div>}
            </div>}
            {isAdmin && <Link to={ADMIN_PATH} className={`btn-icon-sm gold ${isActive(ADMIN_PATH) ? 'active' : ''}`} title="Admin"><Shield size={18} /></Link>}
            {isLoggedIn ? <Link to="/profile" className={`nav-profile-block ${isActive('/profile') ? 'is-active-profile' : ''}`}><div className="nav-avatar">{userProfile?.displayName?.[0]?.toUpperCase() || 'U'}</div><span className="font-bold hide-mobile text-sm">{userProfile?.displayName?.split(' ')[0] || 'User'}</span></Link> : <Link to="/login" className="btn btn-primary btn-sm hide-mobile"><Zap size={16} /> Sign In</Link>}
            <button onClick={() => setMobileOpen((p) => !p)} className="btn-icon-sm hide-desktop" aria-label="Menu">{mobileOpen ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
      </header>

      <nav className="nav-bottom hide-desktop" aria-label="Mobile Bottom Navigation"><ul className="flex-around h-full w-full">{MOBILE_NAV.map((link) => <li key={link.to}><Link to={link.to} className={`nav-link-bottom ${isActive(link.to) ? 'active' : ''}`}><link.icon size={20} />{link.label}</Link></li>)}</ul></nav>
    </>
  );
}