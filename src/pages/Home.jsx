import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Zap, Trophy, Flame, ChevronDown, WifiOff, LogIn, Star, CheckCircle2,
  Lock, Crown, XCircle, ArrowUpRight, Sun, Moon, CloudSun, Radar, Timer,
  ChevronRight, Newspaper, Target, TrendingUp, Activity as LiveIcon, Sparkles, Gamepad2
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useFixtures } from '../hooks/useFixtures';
import { useActivePredictions, useUserPredictions, useDailyLeaderboard, useZokaPicks } from '../hooks/useUserData';

import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';
import { todayStr } from '../utils/dates';

import { buildMatchRoute, buildLeagueRoute, buildTeamRoute, buildHighlightRoute } from '../utils/routes';
import SEO from '../components/SEO';
import { ListSkeleton } from '../components/StateFeedback';
import { applySmartMinute } from '../engine/matchEngine';

import { useGlobalStats } from '../hooks/useGlobalStats';

function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

const Sunset = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 10V2" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" />
    <path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" /><path d="m16 6-4 4-4-4" /><path d="M16 18a4 4 0 0 0-8 0" />
  </svg>
);

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return { text: 'Burning the midnight oil', emoji: '🦉' };
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  if (h < 21) return { text: 'Good evening', emoji: '🌆' };
  return { text: 'Good night', emoji: '🦉' };
};

const parseKickoff = (m) => {
  if (!m.date) return null;
  const d = new Date(m.date);
  if (isNaN(d.getTime())) return null;
  if (m.kickoff && /^\d{1,2}:\d{2}/.test(m.kickoff) && d.getHours() === 0 && d.getMinutes() === 0) {
    const [h, mi] = m.kickoff.split(':').map(Number);
    d.setHours(h, mi, 0, 0);
  }
  return d.getTime();
};

const AnimNum = React.memo(({ value, duration = 800, delay = 0, suffix = '' }) => {
  // ★ FIX: Initialize with 0 and enforce Number type to prevent crashes
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  
  const target = Number(value) || 0;

  useEffect(() => {
    if (target === 0) { 
      setDisplay(0); 
      return; 
    }
    const start = performance.now() + delay;
    const run = (now) => {
      if (now < start) { raf.current = requestAnimationFrame(run); return; }
      const p = Math.min((now - start) / duration, 1);
      const currentVal = Math.round((1 - Math.pow(1 - p, 4)) * target);
      setDisplay(currentVal);
      if (p < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration, delay]);
  
  // ★ FIX: Safely call toLocaleString by ensuring it's a Number
  const safeDisplay = Number(display) || 0;
  return <span>{safeDisplay.toLocaleString()}{suffix}</span>;
});


/* Ticking clock — makes the hero feel alive */
const LiveClock = React.memo(() => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="z-clock">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>;
});

/* Scrolling live ticker — the heartbeat of the top section */
const HeroTicker = React.memo(({ matches }) => {
  if (!matches || matches.length === 0) return null;
  const loop = matches.concat(matches);
  return (
    <div className="z-ticker-wrap">
      <div className="z-ticker-track">
        {loop.map((m, i) => (
          <Link key={(m.id || i) + '-' + i} to={buildMatchRoute(m.id, m.homeName, m.awayName)} className="z-tk">
            {m.isLive ? (
              <><span className="z-ldot" /><span className="live">{m.displayMinute != null ? m.displayMinute + "'" : 'LIVE'}</span></>
            ) : (
              <span className="ko">{m.kickoff || 'VS'}</span>
            )}
            <b>{m.homeName}</b>
            <span className="sc">{m.homeScore != null ? m.homeScore + '-' + m.awayScore : 'v'}</span>
            <b>{m.awayName}</b>
          </Link>
        ))}
      </div>
    </div>
  );
});

/* Real-time kickoff countdown */
const KickoffCountdown = React.memo(({ match }) => {
  const target = useMemo(() => (match ? parseKickoff(match) : null), [match]);
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (!target) return;
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target || left == null || left <= 0) return null;
  const s = Math.floor(left / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <Link to={buildMatchRoute(match.id, match.homeName, match.awayName)} className="z-countdown">
      <span className="z-cd-left">
        <Timer size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
        <span className="z-cd-teams">Next kickoff: {match.homeName} <em>vs</em> {match.awayName}</span>
      </span>
      <span className="z-cd-timer">
        <span className="z-cd-seg">{hh}</span>:<span className="z-cd-seg">{mm}</span>:<span className="z-cd-seg">{ss}</span>
      </span>
    </Link>
  );
});

const StreakBadge = React.memo(({ streak }) => {
  if (!streak || streak < 2) return null;
  return (
    <div className="z-streak-badge">
      <Flame size={16} fill="var(--danger)" color="var(--danger)" className="z-streak-fire" />
      <span className="z-streak-text">{streak} Day Streak!</span>
    </div>
  );
});

const DailyChallenge = React.memo(({ match, isLoggedIn, onPredict }) => {
  if (!match) return null;
  return (
    <div className="z-daily-challenge">
      <div className="z-dc-glow" />
      <div className="z-dc-header">
        <span className="z-dc-badge"><Sparkles size={12} /> Daily Challenge</span>
        <span className="z-dc-bonus">+50 Bonus PTS</span>
      </div>
      <div className="z-dc-match">
        <div className="z-dc-team">
          <img src={match.homeLogo} alt={match.homeName} width="32" height="32" loading="lazy" />
          <span>{match.homeName}</span>
        </div>
        <div className="z-dc-vs">VS</div>
        <div className="z-dc-team">
          <img src={match.awayLogo} alt={match.awayName} width="32" height="32" loading="lazy" />
          <span>{match.awayName}</span>
        </div>
      </div>
      <button className="z-dc-btn" onClick={onPredict} disabled={!isLoggedIn}>
        {isLoggedIn ? <><Gamepad2 size={14} /> Predict Now</> : <><Lock size={14} /> Login to Play</>}
      </button>
    </div>
  );
});

const ZokaBadge = React.memo(({ pick }) => {
  if (!pick || !pick.adminPick || pick.status !== 'finished') return null;
  const home = pick.adminPick.home;
  const away = pick.adminPick.away;
  const ph = pick.homeScore;
  const pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="badge badge-muted">Pending</span>;
  if (home === ph && away === pa) return <span className="badge badge-primary"><CheckCircle2 size={10} /> Exact</span>;
  const predOutcome = home > away ? 'H' : home < away ? 'A' : 'D';
  const realOutcome = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  if (predOutcome === realOutcome) return <span className="badge badge-gold"><TrendingUp size={10} /> Result</span>;
  return <span className="badge badge-danger"><XCircle size={10} /> Miss</span>;
});

const MiniPodium = React.memo(({ entries }) => {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;
  const order = [1, 0, 2];
  const cfg = [
    { h: 90, border: 'var(--gold)', bg: 'rgba(var(--gold-rgb),.08)', color: 'var(--gold)', sz: 52, fs: '.95rem', glitter: true },
    { h: 64, border: 'var(--text-muted)', bg: 'rgba(var(--text-muted),.06)', color: 'var(--text-muted)', sz: 42, fs: '.8rem', glitter: false },
    { h: 52, border: 'var(--bronze)', bg: 'rgba(var(--bronze),.06)', color: 'var(--bronze)', sz: 36, fs: '.72rem', glitter: false },
  ];
  return (
    <div className="z-podium">
      {order.map((pos) => {
        const u = top3[pos];
        if (!u) return <div key={pos} style={{ flex: 1, maxWidth: 120 }} />;
        const c = cfg[pos];
        return (
          <div key={u.uid} className="z-pod-u" style={{ animationDelay: pos * 100 + 'ms' }}>
            <div className="z-pod-info">
              {pos === 0 && <Crown size={18} style={{ color: 'var(--gold)', marginBottom: 2, filter: 'drop-shadow(0 0 4px rgba(var(--gold-rgb),.4))' }} />}
              <div className="z-pod-avatar" style={{ width: c.sz, height: c.sz, background: c.bg, border: `2px solid ${c.border}`, fontSize: c.fs, color: c.color }}>
                {(u.displayName || '??').slice(0, 2).toUpperCase()}
              </div>
              <div className="z-pod-name">{u.displayName}</div>
              <div className={'z-pod-pts' + (c.glitter ? ' gold-text' : '')} style={{ color: c.color }}>{u.points} pts</div>
            </div>
            <div className="z-pod-bar" style={{ height: c.h, background: c.bg, border: `1px solid ${c.border}33`, borderTop: `3px solid ${c.border}` }}>
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
  const min = match.displayMinute;
  const isLive = match.isLive;
  const hasScore = match.homeScore != null && match.awayScore != null;
  const matchLink = buildMatchRoute(match.id, match.homeName, match.awayName);
  return (
    <Link to={matchLink} className="z-livemini" style={{ animationDelay: index * 60 + 'ms', borderColor: isLive ? 'rgba(var(--danger-rgb),.3)' : 'var(--border)' }} title={`${match.homeName} vs ${match.awayName}`}>
      <div className="z-lm-top">
        <span className="z-lm-league">{match.leagueName}</span>
        {isLive && min != null ? (
          <div className="z-lm-status live">
            <span className="z-ldot" />
            <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--danger)' }}>{min}&apos;</span>
          </div>
        ) : (
          <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>{match.kickoff || 'VS'}</div>
        )}
      </div>
      <div className="z-lm-row">
        <span className="z-lm-name">{match.homeName}</span>
        <span className="z-lm-score" style={{ color: isLive ? 'var(--danger)' : 'var(--text-primary)' }}>{hasScore ? match.homeScore : '-'}</span>
      </div>
      <div className="z-lm-row">
        <span className="z-lm-name">{match.awayName}</span>
        <span className="z-lm-score" style={{ color: isLive ? 'var(--danger)' : 'var(--text-primary)' }}>{hasScore ? match.awayScore : '-'}</span>
      </div>
    </Link>
  );
});

const FeaturedRow = React.memo(({ pred, userPred, isLoggedIn }) => {
  const isFin = isFinishedStatus(pred.status, SPORT.FOOTBALL) || !!pred.isFinished;
  const isLive = isLiveStatus(pred.status, SPORT.FOOTBALL) || !!pred.isLive;
  const isHT = pred.status === 'ht' || pred.status === 'HT';
  const hasScore = pred.homeScore != null && pred.awayScore != null;
  const isPredicted = !!userPred;

  let border = 'var(--border)';
  if (isLive || isHT) border = 'var(--danger)';
  else if (isFin) border = 'rgba(var(--primary-rgb),.2)';
  else if (isPredicted) border = 'var(--primary)';

  let sLabel = pred.kickoff || 'VS';
  let sColor = 'var(--text-muted)';
  let sBg = 'var(--bg-card)';
  if (isLive) { sLabel = pred.minute != null ? pred.minute + "'" : 'LIVE'; sColor = 'var(--danger)'; sBg = 'rgba(var(--danger-rgb),.12)'; }
  else if (isHT) { sLabel = 'HT'; sColor = 'var(--gold)'; sBg = 'rgba(var(--gold-rgb),.12)'; }
  else if (isFin) { sLabel = 'FT'; sColor = 'var(--primary)'; sBg = 'rgba(var(--primary-rgb),.1)'; }

  let cls = 'z-mc';
  if (isLive) cls += ' live';
  if (isFin) cls += ' ft';
  if (isFin && !isPredicted) cls += ' dim';

  const mid = pred.id || pred.matchId;

  let actionContent = null;
  if (isPredicted) {
    actionContent = <Link to="/predictions" className="btn btn-outline btn-sm"><CheckCircle2 size={12} /> Locked</Link>;
  } else if (isLoggedIn) {
    actionContent = <Link to={'/predictions?match=' + mid} className="btn btn-primary btn-sm"><Target size={12} /> Predict</Link>;
  } else {
    actionContent = <Link to="/login" className="btn btn-ghost btn-sm"><Lock size={12} /> Login</Link>;
  }

  const scoreContent = hasScore ? (
    <span className="flex-center gap-8">
      <span className={'z-sn ' + (isLive ? 'r' : 'g')}>{pred.homeScore}</span>
      <span className="z-sep">-</span>
      <span className={'z-sn ' + (isLive ? 'r' : 'g')}>{pred.awayScore}</span>
    </span>
  ) : <span className="z-vs">VS</span>;

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
          {pred.league && pred.league.emblem && <img src={pred.league.emblem} alt={`${leagueName} logo`} width="14" height="14" loading="lazy" style={{ objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildLeagueRoute(pred.league?.id, leagueName)} style={{ textDecoration: 'none', color: 'inherit' }}>{leagueName}</Link>
        </div>
        <div className="flex-center gap-4">
          {isLive && <span className="z-ldot" />}
          <span className="z-st" style={{ color: sColor, background: sBg }}>{sLabel}</span>
        </div>
      </div>
      <div className="z-tm">
        <div className="z-te">
          {pred.homeLogo && <img src={pred.homeLogo} alt={`${homeName} logo`} width="24" height="24" loading="lazy" style={{ objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(pred.homeTeam?.id, homeName)} style={{ textDecoration: 'none', color: 'inherit' }}>{homeName}</Link>
        </div>
        <div className={sbCls}>{scoreContent}</div>
        <div className="z-te aw">
          {pred.awayLogo && <img src={pred.awayLogo} alt={`${awayName} logo`} width="24" height="24" loading="lazy" style={{ objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />}
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

  const scoreContent = isFin && pick.homeScore != null ? (
    <span className="flex-center gap-8">
      <span className="z-sn g">{pick.homeScore}</span>
      <span className="z-sep">-</span>
      <span className="z-sn g">{pick.awayScore}</span>
    </span>
  ) : <span className="z-sn gd">{predH != null ? predH : '?'}-{predA != null ? predA : '?'}</span>;

  let sbCls = 'z-sb';
  if (isFin) sbCls += ' ft'; else sbCls += ' zk';

  const homeName = pick.homeTeam?.shortName || pick.homeTeam?.name || '?';
  const awayName = pick.awayTeam?.shortName || pick.awayTeam?.name || '?';
  const leagueName = pick.league?.name || 'Zoka';

  return (
    <div className="z-mc zoka">
      <div className="z-mh">
        <div className="z-ml">
          {pick.league && pick.league.emblem && <img src={pick.league.emblem} alt={`${leagueName} logo`} width="14" height="14" loading="lazy" style={{ objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildLeagueRoute(pick.league?.id, leagueName)} style={{ textDecoration: 'none', color: 'inherit' }}>{leagueName}</Link>
        </div>
        <span className="z-st" style={{ color: isFin ? 'var(--primary)' : 'var(--text-muted)', background: isFin ? 'rgba(var(--primary-rgb),.1)' : 'var(--bg-card)' }}>{isFin ? 'FT' : ko}</span>
      </div>
      <div className="z-tm">
        <div className="z-te">
          {pick.homeLogo && <img src={pick.homeLogo} alt={`${homeName} logo`} width="24" height="24" loading="lazy" style={{ objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(pick.homeTeam?.id, homeName)} style={{ textDecoration: 'none', color: 'inherit' }}>{homeName}</Link>
        </div>
        <div className={sbCls}>{scoreContent}</div>
        <div className="z-te aw">
          {pick.awayLogo && <img src={pick.awayLogo} alt={`${awayName} logo`} width="24" height="24" loading="lazy" style={{ objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(pick.awayTeam?.id, awayName)} style={{ textDecoration: 'none', color: 'inherit' }}>{awayName}</Link>
        </div>
      </div>
      <div className="z-ma">
        {isFin ? <ZokaBadge pick={pick} /> : <span className="badge badge-gold"><Star size={10} fill="currentColor" /> Prediction</span>}
      </div>
    </div>
  );
});

const LB_COLORS = ['var(--danger)', 'var(--gold)', 'var(--bronze)', 'var(--primary)', 'var(--accent)', 'var(--accent)', 'var(--text-muted)', 'var(--text-muted)'];

const LbRow = React.memo(({ u, index, isLoggedIn, uid }) => {
  const isMe = isLoggedIn && u.uid === uid;
  const rank = u.rank || (index + 4);
  const color = LB_COLORS[(rank - 1) % LB_COLORS.length];
  return (
    <div className={'z-lbrow' + (isMe ? ' me' : '')}>
      <span className="z-lb-rank" style={{ color: rank <= 3 ? color : 'var(--text-muted)', fontWeight: rank <= 10 ? 800 : 600 }}>#{rank}</span>
      <div className="z-lb-avatar" style={{ background: color + '20', color: color, border: `1px solid ${color}40` }}>{(u.displayName || '??').slice(0, 2).toUpperCase()}</div>
      <div className="z-lb-info">
        <div className="z-lb-name">{u.displayName} {isMe && <span className="z-me-badge">YOU</span>}</div>
        <div className="z-lb-sub">{u.exact || 0} exact · {u.result || 0} results</div>
      </div>
      <span className="z-lb-pts">{u.points || 0}</span>
    </div>
  );
});

export default function Home() {
  const { activePlayersToday, predictionsToday, totalPlayers, totalPredictions } = useGlobalStats();

  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!currentUser;
  const uid = currentUser ? currentUser.uid : null;
  const greeting = useMemo(() => getGreeting(), []);
  const now = useNow(10000);

  const { data: rawFixtures = [], isLoading: homeLoading } = useFixtures(todayStr());
  const { data: activePredictions = [] } = useActivePredictions(todayStr());
  const { data: userPredictions = {} } = useUserPredictions(uid, todayStr());
  const { data: dailyLB = null } = useDailyLeaderboard(todayStr());
  const { data: zokaPicksData = null } = useZokaPicks(todayStr());

  const [offline, setOffline] = useState(!navigator.onLine);
  const [ui, setUI] = useState({ showFeat: false, showZoka: false, showLB: false });
  const [newsPosts, setNewsPosts] = useState([]);
  const [heroGoalFlash, setHeroGoalFlash] = useState(false);

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

  const allFixtures = useMemo(() => rawFixtures.map(m => applySmartMinute(m, now)).filter(m => !m.isHidden), [rawFixtures, now]);

  const liveMatches = useMemo(() => allFixtures.filter(m => m.isLive), [allFixtures]);
  const featuredMatches = useMemo(() => allFixtures.filter(m => m.category === 'FEATURED' || m.category === 'IMPORTANT').slice(0, 10), [allFixtures]);
  const upcomingMatches = useMemo(() => allFixtures.filter(m => !m.isLive && !m.isFinished && m.display?.isUpcoming).slice(0, 10), [allFixtures]);

  const heroMatch = useMemo(() => {
    if (liveMatches.length > 0) return liveMatches[0];
    if (featuredMatches.length > 0) return featuredMatches[0];
    return null;
  }, [liveMatches, featuredMatches]);

  const nextKickoff = useMemo(() => {
    const cands = upcomingMatches
      .map(m => ({ m, t: parseKickoff(m) }))
      .filter(x => x.t != null && x.t > Date.now())
      .sort((a, b) => a.t - b.t);
    return cands.length > 0 ? cands[0].m : null;
  }, [upcomingMatches, now]);

  const prevHeroScore = useRef({ h: heroMatch?.homeScore, a: heroMatch?.awayScore });
  useEffect(() => {
    if (heroMatch && heroMatch.homeScore != null && heroMatch.awayScore != null) {
      if (heroMatch.homeScore !== prevHeroScore.current.h || heroMatch.awayScore !== prevHeroScore.current.a) {
        if (prevHeroScore.current.h != null) {
          setHeroGoalFlash(true);
          const t = setTimeout(() => setHeroGoalFlash(false), 2500);
          prevHeroScore.current = { h: heroMatch.homeScore, a: heroMatch.awayScore };
          return () => clearTimeout(t);
        }
        prevHeroScore.current = { h: heroMatch.homeScore, a: heroMatch.awayScore };
      }
    }
  }, [heroMatch]);

  const liveStats = useMemo(() => {
    let goals = 0;
    let liveCount = 0;
    allFixtures.forEach(m => {
      if (m.isLive) liveCount++;
      if (m.isLive || m.isFinished) goals += (m.homeScore || 0) + (m.awayScore || 0);
    });
    return { goals, liveCount };
  }, [allFixtures]);

  const uniqueLeaguesCount = useMemo(() => {
    const ids = new Set();
    allFixtures.forEach(m => { if (m.leagueId) ids.add(String(m.leagueId)); });
    return ids.size;
  }, [allFixtures]);

  const stripMatches = liveMatches.length > 0 ? liveMatches : (featuredMatches.length > 0 ? featuredMatches : upcomingMatches);
  const tickerMatches = stripMatches.slice(0, 10);

  const dailyEntries = dailyLB?.entries || [];
  const dailyStats = dailyLB?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 };
  const zokaFlat = zokaPicksData?.matches || [];

  const myEntry = useMemo(() => {
    if (!isLoggedIn || !dailyEntries) return null;
    return dailyEntries.find(u => u.uid === uid) || null;
  }, [dailyEntries, uid, isLoggedIn]);

  const myPoints = myEntry?.points || 0;
  const myRank = myEntry?.rank || null;
  const userStreak = myEntry?.streak || userProfile?.streak || 0;

  const totalPredictors = dailyStats.players || 0;
  const totalPredictionsMade = dailyStats.preds || 0;
  const avgAccuracy = dailyStats.avg ? parseFloat(dailyStats.avg) : 0;
  const ctxLoading = homeLoading;

  const zokaVis = ui.showZoka ? zokaFlat : zokaFlat.slice(0, 4);
  const zokaHidden = Math.max(0, zokaFlat.length - 4);

  const featFlat = activePredictions || [];
  const featVis = ui.showFeat ? featFlat : featFlat.slice(0, 5);
  const featHidden = Math.max(0, featFlat.length - 5);

  const lbVis = ui.showLB ? dailyEntries : dailyEntries.slice(0, 5);
  const lbHidden = Math.max(0, dailyEntries.length - 5);

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

  const heroGradient = heroMatch?.isLive
    ? 'radial-gradient(circle at 50% -20%, rgba(var(--danger-rgb), 0.15) 0%, transparent 60%)'
    : 'radial-gradient(circle at 50% -20%, rgba(var(--primary-rgb), 0.12) 0%, transparent 60%)';

  return (
    <div className={`zoka-home ${heroGoalFlash ? 'goal-flash-active' : ''}`}>
      <SEO
        title="Football Predictions, Fixtures & Live Scores"
        description="Follow today's football fixtures, expert predictions, live scores, league standings, match analysis, and breaking football updates from competitions around the world on ZOKASCORE."
        keywords="football predictions, live scores, football fixtures, match analysis, league standings, football results, ZOKASCORE"
        path="/"
        robots="index,follow"
        includeBreadcrumbs={false}
      />

      {offline && (<div className="z-offline"><WifiOff size={14} /> You are offline - showing cached data</div>)}

      <div className="zoka-home-wrap">
        {/* ══ ALIVE HERO — dense, moving, real ══ */}
        <section className="z-hero-pro compact-hero" style={{ background: heroGradient }}>
          <div className="z-aurora" aria-hidden="true" />

          <div className="z-hero-top-row z-hero-alive">
            <div className="z-hello">
              <span className="z-hello-emoji">{greeting.emoji}</span>
              <div className="z-hello-txt">
                <strong>{greeting.text}, {displayName || 'Manager'}.</strong>
                <span className="z-hello-sub">
                  {new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                  · <LiveClock />
                </span>
              </div>
            </div>
            <StreakBadge streak={userStreak} />
          </div>

          <div className="z-hero-content">
            <h1 className="z-title">ZOKA<span>SCORE</span></h1>
            <p className="z-sub">Live scores, AI predictions & leaderboards — updated in real time.</p>
          </div>

          {/* scrolling live ticker */}
          {tickerMatches.length > 0 && <HeroTicker matches={tickerMatches} />}

          {/* ONE dense pulse bar replaces the 4 old stat blocks */}
          <div className="z-pulse-bar">
            <div className={'z-pb-item' + (liveStats.liveCount > 0 ? ' hot' : '')}>
              <span className="z-pb-val" style={{ color: liveStats.liveCount > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                <AnimNum value={liveStats.liveCount} />
              </span>
              <span className="z-pb-lbl">Live Now</span>
            </div>
            <div className="z-pb-item">
              <span className="z-pb-val"><AnimNum value={liveStats.goals} delay={80} /></span>
              <span className="z-pb-lbl">Goals</span>
            </div>
            <div className="z-pb-item">
              <span className="z-pb-val"><AnimNum value={totalPredictionsMade || predictionsToday} delay={160} /></span>
              <span className="z-pb-lbl">Predictions</span>
            </div>
            <div className="z-pb-item">
              <span className="z-pb-val"><AnimNum value={activePlayersToday || totalPredictors} delay={240} /></span>
              <span className="z-pb-lbl">Players</span>
            </div>
            <div className="z-pb-item">
              <span className="z-pb-val"><AnimNum value={uniqueLeaguesCount} delay={320} /></span>
              <span className="z-pb-lbl">Leagues</span>
            </div>
            <div className="z-pb-item">
              <span className="z-pb-val" style={{ color: 'var(--primary)' }}><AnimNum value={Math.round(avgAccuracy)} delay={400} suffix="%" /></span>
              <span className="z-pb-lbl">Accuracy</span>
            </div>
            {isLoggedIn && (
              <div className="z-pb-item me">
                <span className="z-pb-val" style={{ color: 'var(--primary)' }}><AnimNum value={myPoints} delay={480} /></span>
                <span className="z-pb-lbl">My Pts{myRank ? ' · #' + myRank : ''}</span>
              </div>
            )}
          </div>
        </section>

        {/* ══ MATCH SPOTLIGHT — instantly visible ══ */}
        {heroMatch && (
          <Link to={buildMatchRoute(heroMatch.id, heroMatch.homeName, heroMatch.awayName)} className={`z-hero-match ${heroGoalFlash ? 'goal-flash' : ''} ${heroMatch.isLive ? 'live' : ''}`}>
            <div className="z-hero-top">
              <div className="z-hero-league">
                {heroMatch.leagueLogo && <img src={heroMatch.leagueLogo} alt="League" width="16" height="16" />}
                <span>{heroMatch.leagueName}</span>
              </div>
              {heroMatch.isLive && (
                <div className="z-hero-badge live">
                  <span className="live-pulse-dot"></span>
                  LIVE {heroMatch.displayMinute || 0}&apos;
                </div>
              )}
              {heroMatch.isFinished && <div className="z-hero-badge ft">FULL TIME</div>}
              {!heroMatch.isLive && !heroMatch.isFinished && <div className="z-hero-badge sched">{heroMatch.kickoff}</div>}
            </div>

            <div className="z-hero-teams">
              <div className="z-hero-team">
                {heroMatch.homeLogo && <img src={heroMatch.homeLogo} alt={heroMatch.homeName} />}
                <span>{heroMatch.homeName}</span>
              </div>
              <div className="z-hero-score">
                {(heroMatch.isLive || heroMatch.isFinished) ? (
                  <span className="z-hero-score-num">{heroMatch.homeScore} <span className="sep">-</span> {heroMatch.awayScore}</span>
                ) : (
                  <span className="z-hero-vs">VS</span>
                )}
              </div>
              <div className="z-hero-team">
                {heroMatch.awayLogo && <img src={heroMatch.awayLogo} alt={heroMatch.awayName} />}
                <span>{heroMatch.awayName}</span>
              </div>
            </div>

            {heroMatch.stats && (heroMatch.stats.possession || heroMatch.stats.shots || heroMatch.stats.corners) ? (
              <div className="z-hero-stats-grid">
                {heroMatch.stats.possession && (
                  <div className="z-hs-item"><span className="lbl">POSS</span><span className="val">{heroMatch.stats.possession.home || 0}% - {heroMatch.stats.possession.away || 0}%</span></div>
                )}
                {heroMatch.stats.shots && (
                  <div className="z-hs-item"><span className="lbl">SHOTS</span><span className="val">{heroMatch.stats.shots.home || 0} - {heroMatch.stats.shots.away || 0}</span></div>
                )}
                {heroMatch.stats.corners && (
                  <div className="z-hs-item"><span className="lbl">CORNERS</span><span className="val">{heroMatch.stats.corners.home || 0} - {heroMatch.stats.corners.away || 0}</span></div>
                )}
              </div>
            ) : (
              <div className="glass-card flex-between mt-16" style={{ padding: '10px 14px' }}>
                <span className="text-muted font-bold text-sm">{heroMatch.date ? new Date(heroMatch.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Scheduled'}</span>
                <span className="text-muted font-bold text-sm">{heroMatch.venue?.name || heroMatch.leagueName}</span>
              </div>
            )}

            <div className="z-hero-actions" onClick={(e) => e.preventDefault()}>
              <button className="z-ha-btn primary" onClick={() => navigate(buildMatchRoute(heroMatch.id, heroMatch.homeName, heroMatch.awayName))}>View Match</button>
              <button className="z-ha-btn" onClick={() => navigate('/predictions')}>Predictions</button>
              <button className="z-ha-btn" onClick={() => navigate(buildMatchRoute(heroMatch.id, heroMatch.homeName, heroMatch.awayName))}>Statistics</button>
            </div>
          </Link>
        )}

        {/* ══ Ticking countdown to next kickoff ══ */}
        {!ctxLoading && nextKickoff && <KickoffCountdown match={nextKickoff} />}

        {!ctxLoading && isLoggedIn && upcomingMatches.length > 0 && (
          <DailyChallenge
            match={upcomingMatches[0]}
            isLoggedIn={isLoggedIn}
            onPredict={() => navigate(`/predictions?match=${upcomingMatches[0].id}`)}
          />
        )}

        <div className="mt-16">
          <div className="z-strip-header">
            {liveMatches.length > 0 ? (
              <span className="flex-center gap-4">
                <span className="z-ldot" />
                <span className="z-strip-title" style={{ color: 'var(--danger)' }}>{liveMatches.length} LIVE</span>
              </span>
            ) : (
              <span className="z-strip-title" style={{ color: 'var(--text-muted)' }}>TODAY&apos;S MATCHES</span>
            )}
            <div className="z-sech-line" />
            <Link to="/fixtures" className="z-strip-link">View all <ChevronRight size={12} /></Link>
          </div>
          <div className="z-livestrip">
            {ctxLoading && stripMatches.length === 0 ? (
              <React.Fragment><LiveStripLoader /><LiveStripLoader /><LiveStripLoader /></React.Fragment>
            ) : stripMatches.length > 0 ? (
              stripMatches.map((m, i) => <LiveMini key={m.id || i} match={m} index={i} />)
            ) : (
              <div className="z-live-loader" style={{ width: '100%', maxWidth: 'none', height: '80px' }}>
                <div className="z-loader-text" style={{ color: 'var(--text-muted)' }}>No matches scheduled today</div>
              </div>
            )}
          </div>
        </div>

        {newsPosts.length > 0 && (
          <div className="z-news-marquee-wrap">
            <div className="z-strip-header">
              <Newspaper size={14} style={{ color: 'var(--primary)' }} />
              <span className="z-strip-title">LATEST NEWS</span>
              <div className="z-sech-line" />
              <Link to="/highlights" className="z-strip-link">Hub <ChevronRight size={12} /></Link>
            </div>
            <div className="z-news-marquee">
              {newsPosts.concat(newsPosts).map((post, i) => (
                <Link to={buildHighlightRoute(post.id, post.title)} key={post.id + '-' + i} className="z-newsmini">
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt={post.title} width="80" height="80" className="z-news-img" style={{ objectFit: 'cover' }} loading="lazy" />
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

        {!ctxLoading && zokaFlat.length > 0 && (
          <div className="z-sec">
            <div className="z-sech">
              <Star size={14} style={{ color: 'var(--gold)' }} />
              <h2 className="gold-text">Zoka Picks</h2>
              <span className="z-sech-badge" style={{ background: 'rgba(var(--gold-rgb),.1)', color: 'var(--gold)', border: '1px solid rgba(var(--gold-rgb),.3)' }}>{zokaFlat.length}</span>
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
            <Target size={14} style={{ color: 'var(--primary)' }} />
            <h2>Featured - Compete</h2>
            <span className="z-sech-badge" style={{ background: 'rgba(var(--primary-rgb),.1)', color: 'var(--primary)', border: '1px solid rgba(var(--primary-rgb),.3)' }}>{featFlat.length}</span>
            {isLoggedIn && <span style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>{myPredicted}/{featFlat.length} predicted</span>}
            <div className="z-sech-line" />
          </div>
          {ctxLoading ? (
            <ListSkeleton count={4} />
          ) : featVis.length > 0 ? (
            featVis.map((p, i) => (
              <FeaturedRow key={p.id || String(p.matchId) || i} pred={p} userPred={userPredMap[String(p.matchId)]} isLoggedIn={isLoggedIn} />
            ))
          ) : (
            <div className="glass-card flex-col items-center p-32 gap-8 text-center">
              <div className="text-muted font-bold text-sm">No featured matches right now</div>
              <div className="text-muted text-xs">Check back later or go to Predictions</div>
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
            <Trophy size={14} style={{ color: 'var(--primary)' }} />
            <h2>Daily Leaderboard</h2>
            <div className="z-sech-line" />
            <Link to="/leaderboard" className="z-strip-link">Full <ArrowUpRight size={12} /></Link>
          </div>
          {ctxLoading ? (
            <ListSkeleton count={5} />
          ) : dailyEntries && dailyEntries.length > 0 ? (
            <div>
              <MiniPodium entries={dailyEntries} />
              <div className="mt-12">
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
            <div className="glass-card flex-col items-center p-32 gap-8 text-center">
              <Trophy size={24} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
              <div className="text-muted font-bold text-sm">No predictions yet today</div>
              <div className="text-muted text-xs">Be the first to claim the top spot!</div>
            </div>
          )}
        </div>

        <div className="z-sec">
          <div className="z-sech">
            <Zap size={14} style={{ color: 'var(--primary)' }} />
            <h2>Explore</h2>
            <div className="z-sech-line" />
          </div>
          <div className="z-explore">
            <Link to="/fixtures" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: 'var(--primary)' }} />
              <LiveIcon size={20} style={{ color: 'var(--primary)' }} />
              <div className="z-ecard-title">Fixtures & Live</div>
              <div className="z-ecard-sub">Real-time scores, all leagues</div>
            </Link>
            <Link to="/predictions" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: 'var(--gold)' }} />
              <Target size={20} style={{ color: 'var(--gold)' }} />
              <div className="z-ecard-title">Predict & Win</div>
              <div className="z-ecard-sub">Score predictions, earn points</div>
            </Link>
            <Link to="/leaderboard" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: 'var(--gold)' }} />
              <Trophy size={20} style={{ color: 'var(--gold)' }} />
              <div className="z-ecard-title">Leaderboard</div>
              <div className="z-ecard-sub">Daily & weekly rankings</div>
            </Link>
            <Link to="/highlights" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: 'var(--accent)' }} />
              <Newspaper size={20} style={{ color: 'var(--accent)' }} />
              <div className="z-ecard-title">News & Highlights</div>
              <div className="z-ecard-sub">Latest football stories</div>
            </Link>
          </div>
        </div>

        {!isLoggedIn && (
          <div className="mt-8 mb-32">
            <Link to="/login" className="z-cta">
              <LogIn size={18} /> Join ZOKA - Predict and Compete
            </Link>
          </div>
        )}

        <div className="text-center p-32 text-muted text-xs font-bold">
          ZOKA SCORE - FOOTBALL INTELLIGENCE
          <div className="mt-4" style={{ opacity: 0.5 }}>Data refreshes automatically · Scores protected by FT Shield</div>
        </div>
      </div>
    </div>
  );
}