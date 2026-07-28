import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Trophy, Flame, ChevronDown, WifiOff, LogIn, Star, CheckCircle, CheckCircle2,
  Lock, Crown, Activity, XCircle, ArrowUpRight, Sun, Moon, CloudSun, Radar,
  ChevronRight, Newspaper, Target, TrendingUp
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useHomeMatches } from '../hooks/useFixtures';
import { useActivePredictions, useUserPredictions, useDailyLeaderboard } from '../hooks/useUserData';

import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';
import { todayStr } from '../utils/dates';
import { calcPoints } from '../utils/constants';

// ★ Using centralized engines and builders
import { slugify } from '../utils/format';
import { buildMatchRoute, buildLeagueRoute, buildTeamRoute, buildHighlightRoute } from '../utils/routes';
import SEO from '../components/SEO';
import { ListSkeleton } from '../components/StateFeedback';
import { normalizeMatch } from '../engine/matchEngine';

const Sunset = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 10V2" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" />
    <path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" /><path d="m16 6-4 4-4-4" /><path d="M16 18a4 4 0 0 0-8 0" />
  </svg>
);

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return { text: 'Burning the midnight oil', icon: <Moon size={16} />, emoji: '🦉' };
  if (h < 12) return { text: 'Good morning', icon: <Sun size={16} />, emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', icon: <CloudSun size={16} />, emoji: '🌤️' };
  if (h < 21) return { text: 'Good evening', icon: <Sunset size={16} />, emoji: '🌆' };
  return { text: 'Good night', icon: <Moon size={16} />, emoji: '🦉' };
};

const AnimNum = React.memo(({ value, duration = 600, delay = 0, suffix = '' }) => {
  const [display, setDisplay] = useState(0);
  const raf = React.useRef(null);
  useEffect(() => {
    const target = value || 0;
    if (target === 0) { setDisplay(0); return; }
    const start = performance.now() + delay;
    const run = (now) => {
      if (now < start) { raf.current = requestAnimationFrame(run); return; }
      const p = Math.min((now - start) / duration, 1);
      setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => { if (raf && raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration, delay]);
  return <span>{display.toLocaleString()}{suffix}</span>;
});

const AccuracyRing = React.memo(({ value, size = 44, stroke = 4, color = '#10b981' }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value)) / 100;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#151b26" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }} />
    </svg>
  );
});

const ZokaBadge = React.memo(({ pick }) => {
  if (!pick || !pick.adminPick || pick.status !== 'finished') return null;
  const home = pick.adminPick.home;
  const away = pick.adminPick.away;
  const ph = pick.homeScore;
  const pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="bdg pn">Pending</span>;
  if (home === ph && away === pa) return <span className="bdg ex"><CheckCircle2 size={8} /> Exact</span>;
  const predOutcome = home > away ? 'H' : home < away ? 'A' : 'D';
  const realOutcome = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  if (predOutcome === realOutcome) return <span className="bdg rs"><TrendingUp size={8} /> Result</span>;
  return <span className="bdg ms"><XCircle size={8} /> Miss</span>;
});

const MiniPodium = React.memo(({ entries }) => {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;
  const order = [1, 0, 2];
  const cfg = [
    { h: 84, border: '#fbbf24', bg: 'rgba(251,191,36,.06)', color: '#fbbf24', sz: 50, fs: '.9rem', glitter: true },
    { h: 60, border: '#94a3b8', bg: 'rgba(148,163,184,.04)', color: '#94a3b8', sz: 40, fs: '.75rem', glitter: false },
    { h: 48, border: '#b45309', bg: 'rgba(180,83,9,.04)', color: '#d97706', sz: 34, fs: '.68rem', glitter: false },
  ];
  return (
    <div className="z-podium">
      {order.map((pos) => {
        const u = top3[pos];
        if (!u) return <div key={pos} style={{ flex: 1, maxWidth: 120 }} />;
        const c = cfg[pos];
        return (
          <div key={u.uid} className="z-pod-u">
            <div className="z-pod-info">
              {pos === 0 && <Crown size={16} style={{ color: '#fbbf24', marginBottom: -2 }} />}
              <div className="z-pod-avatar" style={{ width: c.sz, height: c.sz, background: c.border + '15', border: '2px solid ' + c.border, fontSize: c.fs, color: c.color }}>
                {(u.displayName || '??').slice(0, 2).toUpperCase()}
              </div>
              <div className="z-pod-name">{u.displayName}</div>
              <div className={'z-pod-pts' + (c.glitter ? ' gold-text' : '')} style={{ color: c.color }}>{u.points} pts</div>
            </div>
            <div className="z-pod-bar" style={{ height: c.h, background: c.bg, border: '1px solid ' + c.border + '22' }}>
              <span className={'z-pod-num' + (c.glitter ? ' gold-text' : '')} style={{ color: c.color }}>#{pos + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const LiveStripLoader = React.memo(() => (
  <div className="z-live-loader">
    <div className="z-loader-radar" />
    <div className="z-loader-text"><Radar size={12} /> Scanning Pitches...</div>
  </div>
));

const LiveMini = React.memo(({ match, index }) => {
  // ★ Ensure we are reading the flat normalized properties
  const min = match.displayMinute; 
  const isLive = match.isLive;
  const hasScore = match.homeScore != null && match.awayScore != null;
  const matchLink = buildMatchRoute(match.id, match.homeName, match.awayName);
  
  return (
    <Link to={matchLink} className="z-livemini" style={{ animationDelay: index * 50 + 'ms', borderColor: isLive ? 'rgba(239,68,68,.2)' : '#151b26', textDecoration: 'none', color: 'inherit', display: 'block' }} title={`${match.homeName} vs ${match.awayName}`}>
      <div className="z-lm-top">
        <span className="z-lm-league">{match.leagueName}</span>
        {isLive && min != null ? (
          <div className="z-lm-status">
            <span className="z-ldot" style={{ width: 4, height: 4 }} />
            <span style={{ fontSize: '.62rem', fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-display,system-ui)' }}>{min}&apos;</span>
          </div>
        ) : (
          <div style={{ fontSize: '.62rem', fontWeight: 700, color: '#64748b' }}>{match.kickoff || 'VS'}</div>
        )}
      </div>
      <div className="z-lm-row">
        <span className="z-lm-name">{match.homeName}</span>
        <span className="z-lm-score" style={{ color: isLive ? '#ef4444' : '#f8fafc' }}>{hasScore ? match.homeScore : '-'}</span>
      </div>
      <div className="z-lm-row">
        <span className="z-lm-name">{match.awayName}</span>
        <span className="z-lm-score" style={{ color: isLive ? '#ef4444' : '#f8fafc' }}>{hasScore ? match.awayScore : '-'}</span>
      </div>
    </Link>
  );
});


const FeaturedRow = React.memo(({ pred, userPred, userResult, isLoggedIn }) => {
  const isFin = isFinishedStatus(pred.status, SPORT.FOOTBALL) || !!pred.isFinished;
  const isLive = isLiveStatus(pred.status, SPORT.FOOTBALL) || !!pred.isLive;
  const isHT = pred.status === 'ht' || pred.status === 'HT';
  const hasScore = pred.homeScore != null && pred.awayScore != null;
  const isPredicted = !!userPred;
  const isResolved = !!userResult && userResult.resultType && userResult.resultType !== 'pending';
  const isExact = isResolved && userResult.resultType === 'exact';
  const isHit = isResolved && userResult.resultType === 'result';

  let border = '#151b26';
  if (isExact) border = '#10b981';
  else if (isHit) border = '#fbbf24';
  else if (isResolved && !isExact && !isHit) border = '#ef4444';
  else if (isLive || isHT) border = '#ef4444';
  else if (isFin) border = 'rgba(16,185,129,.2)';
  else if (isPredicted) border = '#10b981';

  let sLabel = pred.kickoff || 'VS';
  let sColor = '#64748b';
  let sBg = 'rgba(255,255,255,.03)';
  if (isLive) { sLabel = pred.minute != null ? pred.minute + "'" : 'LIVE'; sColor = '#ef4444'; sBg = 'rgba(239,68,68,.1)'; }
  else if (isHT) { sLabel = 'HT'; sColor = '#fbbf24'; sBg = 'rgba(251,191,36,.1)'; }
  else if (isFin) { sLabel = 'FT'; sColor = '#10b981'; sBg = 'rgba(16,185,129,.08)'; }

  let cls = 'z-mc';
  if (isLive) cls += ' live';
  if (isFin) cls += ' ft';
  if (isFin && !isResolved && !isPredicted) cls += ' dim';

  const mid = pred.id || pred.matchId;

  let actionContent = null;
  if (isResolved) {
    let badgeCls = 'bdg ms';
    let badgeText = '';
    if (isExact) { badgeCls = 'bdg ex'; badgeText = 'Exact +10'; }
    else if (isHit) { badgeCls = 'bdg rs'; badgeText = 'Result +3'; }
    else { badgeCls = 'bdg ms'; badgeText = 'Miss'; }
    actionContent = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span className={badgeCls}>{badgeText}</span>
        {isPredicted && <span style={{ fontSize: '.62rem', fontWeight: 600, color: '#64748b' }}>You: {userPred.homeScore}-{userPred.awayScore}</span>}
      </div>
    );
  } else if (isPredicted) {
    actionContent = (
      <Link to="/predictions" className="z-btn z-btn-ol on" style={{ minHeight: 32, fontSize: '.66rem', padding: '4px 10px' }}>
        <CheckCircle size={10} /> Locked
      </Link>
    );
  } else if (isLoggedIn) {
    actionContent = (
      <Link to={'/predictions?match=' + mid} className="z-btn z-btn-p" style={{ minHeight: 32, fontSize: '.66rem', padding: '4px 10px' }}>
        <Target size={10} /> Predict
      </Link>
    );
  } else {
    actionContent = (
      <Link to="/login" className="z-btn z-btn-gh" style={{ minHeight: 32, fontSize: '.66rem', padding: '4px 10px' }}>
        <Lock size={10} /> Login
      </Link>
    );
  }

  let scoreContent = null;
  if (hasScore) {
    scoreContent = (
      <span>
        <span className={'z-sn' + (isLive ? ' r' : ' g')}>{pred.homeScore}</span>
        <span className="z-sep">-</span>
        <span className={'z-sn' + (isLive ? ' r' : ' g')}>{pred.awayScore}</span>
      </span>
    );
  } else {
    scoreContent = <span className="z-vs">VS</span>;
  }

  let sbCls = 'z-sb';
  if (isLive) sbCls += ' lv';
  if (isFin) sbCls += ' ft';

  const homeName = pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home';
  const awayName = pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away';
  const leagueName = pred.league?.name || 'Featured';

  return (
    <div className={cls} style={{ borderLeft: '3px solid ' + border }}>
      <div className="z-mh">
        <div className="z-ml">
          {pred.league && pred.league.emblem && <img src={pred.league.emblem} alt={`${leagueName} logo`} width="14" height="14" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildLeagueRoute(pred.league?.id, leagueName)} style={{ textDecoration: 'none', color: 'inherit' }}>{leagueName}</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {isLive && <span className="z-ldot" />}
          <span className="z-st" style={{ color: sColor, background: sBg }}>{sLabel}</span>
        </div>
      </div>
      <div className="z-tm">
        <div className="z-te">
          {pred.homeLogo && <img src={pred.homeLogo} alt={`${homeName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(pred.homeTeam?.id, homeName)} style={{ textDecoration: 'none', color: 'inherit' }}>{homeName}</Link>
        </div>
        <div className={sbCls}>{scoreContent}</div>
        <div className="z-te aw">
          {pred.awayLogo && <img src={pred.awayLogo} alt={`${awayName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(pred.awayTeam?.id, awayName)} style={{ textDecoration: 'none', color: 'inherit' }}>{awayName}</Link>
        </div>
      </div>
      <div className="z-ma">{actionContent}</div>
    </div>
  );
});

const ZokaRow = React.memo(({ pick }) => {
  const isFin = isFinishedStatus(pick.status, SPORT.FOOTBALL);
  const koRaw = pick.kickoff || '';
  const todayDateStr = todayStr(); 
  let ko = 'TBD';
  if (koRaw) {
    try {
      const dateStr = koRaw.includes('T') ? koRaw : (pick.matchDate || todayDateStr) + 'T' + koRaw + ':00';
      ko = new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { ko = 'TBD'; }
  }
  const predH = pick.adminPick ? pick.adminPick.home : null;
  const predA = pick.adminPick ? pick.adminPick.away : null;

  let scoreContent = null;
  if (isFin && pick.homeScore != null) {
    scoreContent = (
      <span>
        <span className="z-sn g">{pick.homeScore}</span>
        <span className="z-sep">-</span>
        <span className="z-sn g">{pick.awayScore}</span>
      </span>
    );
  } else {
    scoreContent = <span className="z-sn gd">{predH != null ? predH : '?'}-{predA != null ? predA : '?'}</span>;
  }

  let sbCls = 'z-sb';
  if (isFin) sbCls += ' ft';
  else sbCls += ' zk';

  const homeName = pick.homeTeam?.shortName || pick.homeTeam?.name || '?';
  const awayName = pick.awayTeam?.shortName || pick.awayTeam?.name || '?';
  const leagueName = pick.league?.name || 'Zoka';

  return (
    <div className="z-mc zoka">
      <div className="z-mh">
        <div className="z-ml">
          {pick.league && pick.league.emblem && <img src={pick.league.emblem} alt={`${leagueName} logo`} width="14" height="14" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildLeagueRoute(pick.league?.id, leagueName)} style={{ textDecoration: 'none', color: 'inherit' }}>{leagueName}</Link>
        </div>
        <span className="z-st" style={{ color: isFin ? '#10b981' : '#64748b', background: isFin ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.03)' }}>{isFin ? 'FT' : ko}</span>
      </div>
      <div className="z-tm">
        <div className="z-te">
          {pick.homeLogo && <img src={pick.homeLogo} alt={`${homeName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(pick.homeTeam?.id, homeName)} style={{ textDecoration: 'none', color: 'inherit' }}>{homeName}</Link>
        </div>
        <div className={sbCls}>{scoreContent}</div>
        <div className="z-te aw">
          {pick.awayLogo && <img src={pick.awayLogo} alt={`${awayName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(pick.awayTeam?.id, awayName)}>{awayName}</Link>
        </div>
      </div>
      <div className="z-ma">
        {isFin ? <ZokaBadge pick={pick} /> : <span className="bdg gd"><Star size={8} fill="currentColor" /> Prediction</span>}
      </div>
    </div>
  );
});

const LB_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

const LbRow = React.memo(({ u, index, isLoggedIn, uid }) => {
  const isMe = isLoggedIn && u.uid === uid;
  const rank = u.rank || (index + 4);
  const color = LB_COLORS[(rank - 1) % LB_COLORS.length];
  return (
    <div className={'z-lbrow' + (isMe ? ' me' : '')}>
      <span className="z-lb-rank" style={{ color: rank <= 10 ? '#10b981' : '#64748b' }}>#{rank}</span>
      <div className="z-lb-avatar" style={{ background: color }}>{(u.displayName || '??').slice(0, 2).toUpperCase()}</div>
      <div className="z-lb-info">
        <div className="z-lb-name">{u.displayName}</div>
        <div className="z-lb-sub">{u.exact || 0} exact - {u.result || 0} results</div>
      </div>
      <span className="z-lb-pts">{u.points || 0}</span>
    </div>
  );
});

export default function Home() {
  const { currentUser, userProfile } = useAuth();
  const isLoggedIn = !!currentUser;
  const uid = currentUser ? currentUser.uid : null;
  const greeting = useMemo(() => getGreeting(), []);

  // ★ Clean data fetching via hooks. No more manual normalizeMatch mapping in the UI!
  const { data: homeData = { live: [], featured: [], upcoming: [] }, isLoading: homeLoading } = useHomeMatches();
  const { data: activePredictions = [] } = useActivePredictions(todayStr());
  const { data: userPredictions = {} } = useUserPredictions(uid, todayStr());
  const { data: dailyLB = null } = useDailyLeaderboard(todayStr());

  const [offline, setOffline] = useState(!navigator.onLine);
  const [ui, setUI] = useState({ showFeat: false, showZoka: false, showLB: false });
  const [newsPosts, setNewsPosts] = useState([]);
  
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const toggleUI = useCallback((key) => setUI(prev => ({ ...prev, [key]: !prev[key] })), []);

  useEffect(() => {
    const onLine = () => setOffline(false);
    const offLine = () => setOffline(true);
    window.addEventListener('online', onLine);
    window.addEventListener('offline', offLine);
    return () => {
      window.removeEventListener('online', onLine);
      window.removeEventListener('offline', offLine);
    };
  }, []);

  useEffect(() => {
    // Note: You can abstract this into a useNewsPosts hook later
    import('../utils/firebase').then(({ db }) => {
      if (!db) return;
      import('firebase/firestore').then(({ collection, query, limit, getDocs, orderBy }) => {
        const q = query(collection(db, 'news_posts'), orderBy('createdAt', 'desc'), limit(8));
        getDocs(q).then(snap => {
          setNewsPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }).catch(err => console.error("News fetch error:", err));
      });
    });
  }, []);

   // ★ Added `now` to dependency arrays so live minutes tick up and statuses update to FT dynamically
  const liveMatches = useMemo(() => (homeData.live || []).map(m => normalizeMatch(m, true, now)).filter(Boolean), [homeData.live, now]);
  const featuredMatches = useMemo(() => (homeData.featured || []).map(m => normalizeMatch(m, true, now)).filter(Boolean), [homeData.featured, now]);
  const upcomingMatches = useMemo(() => (homeData.upcoming || []).map(m => normalizeMatch(m, true, now)).filter(Boolean), [homeData.upcoming, now]);



  const stripMatches = liveMatches.length > 0 ? liveMatches : (featuredMatches.length > 0 ? featuredMatches : upcomingMatches);


  
  const dailyEntries = dailyLB?.entries || [];
  const dailyStats = dailyLB?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 };
  const zokaPicks = dailyLB?.zokaPicks || { matches: [] }; 
  const userStats = dailyLB?.userStats || { points: 0, exact: 0, result: 0, predicted: 0 };
  const ctxLoading = homeLoading;

  const totalPredictors = (dailyStats && dailyStats.players) || (dailyEntries && dailyEntries.length) || 0;
  const totalPredictionsMade = dailyStats.preds || 0;
  const avgAccuracy = dailyStats.avg ? parseFloat(dailyStats.avg) : 0;
  const myPoints = userStats.points || 0;

  const zokaFlat = zokaPicks?.matches || [];
  const zokaVis = ui.showZoka ? zokaFlat : zokaFlat.slice(0, 4);
  const zokaHidden = Math.max(0, zokaFlat.length - 4);

  const featFlat = activePredictions || [];
  const featVis = ui.showFeat ? featFlat : featFlat.slice(0, 5);
  const featHidden = Math.max(0, featFlat.length - 5);

  const lbVis = ui.showLB ? (dailyEntries || []) : (dailyEntries || []).slice(0, 5);
  const lbHidden = Math.max(0, (dailyEntries || []).length - 5);

  const userPredMap = useMemo(() => {
    const m = {};
    if (userPredictions) {
      Object.values(userPredictions).forEach(p => { 
        if (p.predId) m[p.predId] = p;
        if (p.matchId) m[String(p.matchId)] = p;
      });
    }
    return m;
  }, [userPredictions]);

  const myPredicted = useMemo(() => {
    if (!activePredictions) return 0;
    return activePredictions.filter(p => userPredMap[String(p.matchId)]).length;
  }, [activePredictions, userPredMap]);

  const displayName = userProfile && userProfile.displayName ? userProfile.displayName.split(' ')[0] : '';

  return (
    <div className="zoka-home">
      <SEO 
        title="Football Predictions, Fixtures and Live Scores" 
        description="Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world." 
        keywords="football predictions, live scores, fixtures, ZOKA" 
      />

      {offline && (<div className="z-offline"><WifiOff size={14} /> You are offline - showing cached data</div>)}

      <div className="zoka-home-wrap">
        <section className="z-hero">
          <h1 className="z-title">ZOKA<span>SCORE</span></h1>
          <p className="z-sub">{greeting.emoji} {greeting.text}{displayName ? ', ' + displayName : ''}! {greeting.icon}</p>
          <div className="z-title-line" />
        </section>

        <div style={{ margin: '16px 0 0' }}>
          <div className="z-strip-header">
            {liveMatches.length > 0 ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="z-ldot" />
                <span className="z-strip-title" style={{ color: '#ef4444' }}>{liveMatches.length} LIVE</span>
              </span>
            ) : (
              <span className="z-strip-title" style={{ color: '#64748b' }}>TODAY&apos;S MATCHES</span>
            )}
            <div className="z-sech-line" />
            <Link to="/fixtures" className="z-strip-link">View all <ChevronRight size={11} /></Link>
          </div>
          <div className="z-livestrip">
            {ctxLoading && stripMatches.length === 0 ? (
              <React.Fragment><LiveStripLoader /><LiveStripLoader /><LiveStripLoader /></React.Fragment>
            ) : stripMatches.length > 0 ? (
              stripMatches.map((m, i) => <LiveMini key={m.id || i} match={m} index={i} />)
            ) : (
              <div className="z-live-loader" style={{ width: '100%', maxWidth: 'none', height: '80px' }}>
                <div className="z-loader-text" style={{ color: '#64748b' }}>No matches scheduled today</div>
              </div>
            )}
          </div>
        </div>

        {newsPosts.length > 0 && (
          <div className="z-news-marquee-wrap">
            <div className="z-strip-header">
              <Newspaper size={14} style={{ color: '#10b981' }} />
              <span className="z-strip-title">LATEST NEWS</span>
              <div className="z-sech-line" />
              <Link to="/highlights" className="z-strip-link">Hub <ChevronRight size={11} /></Link>
            </div>
            <div className="z-news-marquee">
              {newsPosts.concat(newsPosts).map((post, i) => (
                <Link to={buildHighlightRoute(post.id, post.title)} key={post.id + '-' + i} className="z-newsmini">
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt={post.title} width="80" height="80" className="z-news-img" style={{objectFit:'cover'}} loading="lazy" />
                  ) : (
                    <div className="z-news-img-ph"><Newspaper size={18} /></div>
                  )}
                  <div className="z-news-body">
                    <span className="z-news-cat">{post.category}</span>
                    <h4 className="z-news-title">{post.title}</h4>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="z-stats">
          <div className="z-chip">
            <div className="val"><AnimNum value={totalPredictors} delay={200} /></div>
            <div className="lbl">Users</div>
            <div className="bar"><div className="bar-fill" style={{ width: Math.min(100, (totalPredictors || 0) / 5) + '%', background: '#60a5fa' }} /></div>
          </div>
          <div className="z-chip">
            <div className="val"><AnimNum value={totalPredictionsMade} delay={280} /></div>
            <div className="lbl">Predictions</div>
            <div className="bar"><div className="bar-fill" style={{ width: Math.min(100, totalPredictionsMade / 10) + '%', background: '#10b981' }} /></div>
          </div>
          <div className="z-chip" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', right: 8, top: 8 }}>
              <AccuracyRing
                value={avgAccuracy}
                size={36}
                stroke={3}
                color={avgAccuracy >= 50 ? '#10b981' : avgAccuracy >= 25 ? '#fbbf24' : '#ef4444'}
              />
            </div>
            <div className="val" style={{ fontSize: '.95rem' }}><AnimNum value={Math.round(avgAccuracy)} delay={360} suffix="%" /></div>
            <div className="lbl">Accuracy</div>
          </div>
          <div className="z-chip">
            <div className="val" style={{ color: isLoggedIn ? '#10b981' : '#64748b' }}>
              {isLoggedIn ? <AnimNum value={myPoints} delay={440} /> : '-'}
            </div>
            <div className="lbl">My Points</div>
            {isLoggedIn && <div className="bar"><div className="bar-fill" style={{ width: Math.min(100, myPoints / 5) + '%', background: '#10b981' }} /></div>}
          </div>
        </div>

        {!ctxLoading && zokaFlat.length > 0 && (
          <div className="z-sec">
            <div className="z-sech">
              <Star size={14} style={{ color: '#fbbf24' }} />
              <h2 className="gold-text">Zoka Picks</h2>
              <span className="z-sech-badge" style={{ background: 'rgba(251,191,36,.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,.25)' }}>{zokaFlat.length}</span>
              <div className="z-sech-line" />
            </div>
            <div className="z-zoka-wrap">
              {zokaVis.map((p, i) => <ZokaRow key={p.matchId || i} pick={p} />)}
            </div>
            {zokaHidden > 0 && (
              <button className={'z-toggle' + (ui.showZoka ? ' open' : '')} onClick={() => toggleUI('showZoka')}>
                {ui.showZoka ? 'Show less' : 'Show ' + zokaHidden + ' more'} <ChevronDown size={13} />
              </button>
            )}
          </div>
        )}

        <div className="z-sec">
          <div className="z-sech">
            <Target size={14} style={{ color: '#10b981' }} />
            <h2>Featured - Compete</h2>
            <span className="z-sech-badge" style={{ background: 'rgba(16,185,129,.08)', color: '#10b981', border: '1px solid rgba(16,185,129,.25)' }}>{featFlat.length}</span>
            {isLoggedIn && <span style={{ fontSize: '.62rem', fontWeight: 700, color: '#64748b' }}>{myPredicted}/{featFlat.length} predicted</span>}
            <div className="z-sech-line" />
          </div>
          {ctxLoading ? (
            <ListSkeleton count={4} />
          ) : featVis.length > 0 ? (
            featVis.map((p, i) => (
              <FeaturedRow
                key={p.id || String(p.matchId) || i}
                pred={p}
                userPred={userPredMap[String(p.matchId)]}
                userResult={null}
                isLoggedIn={isLoggedIn}
              />
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: 32, color: '#64748b', fontSize: '.8rem', fontWeight: 600 }}>
              No featured matches right now
              <div style={{ fontSize: '.68rem', opacity: 0.5, marginTop: 4 }}>Check back later or go to Predictions</div>
            </div>
          )}
          {featHidden > 0 && (
            <button className={'z-toggle' + (ui.showFeat ? ' open' : '')} onClick={() => toggleUI('showFeat')}>
              {ui.showFeat ? 'Show less' : 'Show ' + featHidden + ' more'} <ChevronDown size={13} />
            </button>
          )}
        </div>

        <div className="z-sec">
          <div className="z-sech">
            <Trophy size={14} style={{ color: '#10b981' }} />
            <h2>Daily Leaderboard</h2>
            <div className="z-sech-line" />
            <Link to="/leaderboard" className="z-strip-link">Full <ArrowUpRight size={11} /></Link>
          </div>
          {ctxLoading ? (
            <ListSkeleton count={5} />
          ) : dailyEntries && dailyEntries.length > 0 ? (
            <div>
              <MiniPodium entries={dailyEntries} />
              <div style={{ marginTop: 12 }}>
                {lbVis.slice(3).map((u, i) => (
                  <LbRow key={u.uid} u={u} index={i} isLoggedIn={isLoggedIn} uid={uid} />
                ))}
              </div>
              {lbHidden > 0 && (
                <button className={'z-toggle' + (ui.showLB ? ' open' : '')} onClick={() => toggleUI('showLB')}>
                  {ui.showLB ? 'Show less' : 'Show ' + lbHidden + ' more'} <ChevronDown size={13} />
                </button>
              )}
            </div>
          ) : (
            <div className="z-skel" style={{ height: 48 }} />
          )}
        </div>

        <div className="z-sec">
          <div className="z-sech">
            <Zap size={14} style={{ color: '#10b981' }} />
            <h2>Explore</h2>
            <div className="z-sech-line" />
          </div>
          <div className="z-explore">
            <Link to="/fixtures" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#10b981' }} />
              <Activity size={20} style={{ color: '#10b981' }} />
              <div className="z-ecard-title">Fixtures and Live</div>
              <div className="z-ecard-sub">Real-time scores, all leagues</div>
            </Link>
            <Link to="/predictions" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#fbbf24' }} />
              <Target size={20} style={{ color: '#fbbf24' }} />
              <div className="z-ecard-title">Predict and Win</div>
              <div className="z-ecard-sub">Score predictions, earn points</div>
            </Link>
            <Link to="/leaderboard" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#f59e0b' }} />
              <Trophy size={20} style={{ color: '#f59e0b' }} />
              <div className="z-ecard-title">Leaderboard</div>
              <div className="z-ecard-sub">Daily and weekly rankings</div>
            </Link>
            <Link to="/highlights" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#3b82f6' }} />
              <Newspaper size={20} style={{ color: '#3b82f6' }} />
              <div className="z-ecard-title">News and Highlights</div>
              <div className="z-ecard-sub">Latest football stories</div>
            </Link>
          </div>
        </div>

        {!isLoggedIn && (
          <div style={{ marginTop: '8px', marginBottom: '32px' }}>
            <Link to="/login" className="z-cta">
              <LogIn size={18} /> Join ZOKA - Predict and Compete
            </Link>
          </div>
        )}

        <div style={{ textAlign: 'center', padding: '24px 0 32px', color: '#334155', fontSize: '.65rem', fontWeight: 600, letterSpacing: '.02em' }}>
          ZOKA SCORE - FOOTBALL INTELLIGENCE
          <div style={{ marginTop: 4, opacity: 0.5 }}>Data refreshes automatically - Scores protected by FT Shield</div>
        </div>
      </div>
    </div>
  );
}