// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Home.jsx
// ★ FIXED: True Local Time support, single fetch call, clean live merge.
// ★ FIXED: ID lookup mismatch causing user predictions to not show up in UI.
// ═════════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Trophy, Flame, ChevronDown, WifiOff, LogIn, Star, CheckCircle, CheckCircle2,
  Lock, Crown, Activity, XCircle, ArrowUpRight, Sun, Moon, CloudSun, Radar,
  ChevronRight, Newspaper, Target
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useFootballData } from '../context/FootballDataContext';
import { fetchFixtures, subscribeToTodayFixtures } from '../utils/api';
import { getLocalDateFromUtc, formatTime, todayStr } from '../utils/dates';
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';
import { db } from '../utils/firebase';
import { collection, query, limit, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import SEO from '../components/SEO';

const MatchStatus = Object.freeze({
  LIVE: 'LIVE', FT: 'FT', HT: 'HT', STARTED: 'STARTED',
  IN_PLAY: 'IN_PLAY', PAUSED: 'PAUSED', AET: 'AET', PEN: 'PEN',
  HALF_TIME: 'HALF_TIME', FINISHED: 'FINISHED'
});

const LIVE_STATUSES_SET = new Set([
  MatchStatus.IN_PLAY, MatchStatus.PAUSED, MatchStatus.LIVE, '1H', '2H', 'ET', 'BT'
]);

function extractMatchDate(m) {
  if (!m) return '';
  const rawDate = m.utcDate || m.date || (m.timestamp ? new Date(m.timestamp).toISOString() : null);
  if (rawDate) return getLocalDateFromUtc(rawDate);
  return '';
}

function normalizeMatch(raw, isPrimary) {
  if (!raw) return null;
  const id = String(raw.id || raw.matchId);
  let status = raw.status || '';

  let dateStr = extractMatchDate(raw);
  let kickoff = 'TBD';
  let timestamp = 0;

  const rawDate = raw.utcDate || raw.date;
  if (rawDate) {
    try {
      const dt = new Date(rawDate);
      kickoff = formatTime(rawDate);
      timestamp = dt.getTime();
    } catch (e) { /* ignore */ }
  } else if (raw.kickoff) {
    kickoff = raw.kickoff;
  }

  let isLive = isPrimary ? !!raw.isLive : LIVE_STATUSES_SET.has(status);
  let isHT = status === MatchStatus.HT || status === 'BT' || status === MatchStatus.HALF_TIME;
  let isFinished = isPrimary ? !!raw.isFinished : (status === MatchStatus.FINISHED || status === MatchStatus.FT || status === MatchStatus.AET || status === MatchStatus.PEN);

  if (isLive && timestamp > 0) {
    if (Date.now() > timestamp + (2.5 * 60 * 60 * 1000)) {
      isLive = false; isHT = false; isFinished = true; status = 'FT';
    }
  }

  let isStarted = false;
  if (!isLive && !isFinished && timestamp > 0 && Date.now() > timestamp) {
    const todayDateStr = todayStr(); 
    const matchDateStr = dateStr || getLocalDateFromUtc(rawDate);
    if (matchDateStr === todayDateStr && (Date.now() - timestamp) < (3 * 60 * 60 * 1000)) {
      isStarted = true;
    }
  }

  const homeScore = isPrimary
    ? (raw.homeScore ?? raw.score?.fullTime?.home ?? raw.score?.halfTime?.home ?? null)
    : (raw.score?.fullTime?.home ?? raw.score?.halfTime?.home ?? null);
  const awayScore = isPrimary
    ? (raw.awayScore ?? raw.score?.fullTime?.away ?? raw.score?.halfTime?.away ?? null)
    : (raw.score?.fullTime?.away ?? raw.score?.halfTime?.away ?? null);

  return {
    id, dateStr, kickoff, timestamp,
    status, isLive, isHT, isFinished, minute: raw.minute || raw.elapsed || null,
    isStarted,
    homeName: isPrimary ? (raw.homeTeam?.name || 'TBD') : (raw.homeTeam?.shortName || raw.homeTeam?.name || 'TBD'),
    awayName: isPrimary ? (raw.awayTeam?.name || 'TBD') : (raw.awayTeam?.shortName || raw.awayTeam?.name || 'TBD'),
    homeLogo: isPrimary ? raw.homeLogo : raw.homeTeam?.crest,
    awayLogo: isPrimary ? raw.awayLogo : raw.awayTeam?.crest,
    homeTeamId: isPrimary ? raw.homeTeam?.id : raw.homeTeam?.id,
    awayTeamId: isPrimary ? raw.awayTeam?.id : raw.awayTeam?.id,
    homeScore, awayScore,
    leagueName: isPrimary ? (raw.league?.name || 'Other') : (raw.competition?.name || raw.league?.name || 'Other'),
    leagueLogo: isPrimary ? (raw.league?.emblem || raw.league?.logo) : (raw.competition?.emblem || raw.league?.logo),
    score: raw.score,
    stats: raw.stats || raw.matchStats || [],
  };
}

function mapTransformedToNormalized(t) {
  if (!t) return null;
  return {
    id: String(t.id), dateStr: getLocalDateFromUtc(t.date), kickoff: t.kickoff, timestamp: t.timestamp,
    status: t.status || '', isLive: t.isLive || false, isFinished: t.isFinished || false, isStarted: false,
    isHT: (t.status === 'HT' || t.status === 'BT'),
    homeName: t.homeTeam?.name || 'TBD', awayName: t.awayTeam?.name || 'TBD',
    homeLogo: t.homeTeam?.logo || null, awayLogo: t.awayTeam?.logo || null,
    homeScore: t.homeScore, awayScore: t.awayScore,
    leagueName: t.league?.name || 'Other', leagueLogo: t.league?.emblem || null,
    score: t.score, stats: t.stats || [],
  };
}

const STORAGE_KEY_PRIMARY_CACHE_HOME = "zoka_home_primary_cache_v1";
const LIVE_REFRESH = 45000;

function useHomeFixtures() {
  const [primaryFixtures, setPrimaryFixtures] = useState(() => {
    try {
      const c = localStorage.getItem(STORAGE_KEY_PRIMARY_CACHE_HOME);
      return c ? JSON.parse(c) : [];
    } catch (e) { return []; }
  });
  const [loading, setLoading] = useState(true);
  const { fixtures: backupRaw, loadDateFixtures } = useFootballData();
  const todayDateStr = todayStr(); 

  const fetchPrimary = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchFixtures(todayDateStr);
      const tMatches = Array.isArray(res) ? res : (res && res.matches) || [];
      const normalized = tMatches.map(m => normalizeMatch(m, true)).filter(Boolean);
      
      setPrimaryFixtures(prev => {
        if (prev.length === normalized.length && prev[0]?.id === normalized[0]?.id) {
          return prev;
        }
        return normalized;
      });
      
      try { localStorage.setItem(STORAGE_KEY_PRIMARY_CACHE_HOME, JSON.stringify(normalized)); } catch (e) { /* ignore */ }
    } catch (e) { /* keep cached on error */ } 
    finally { if (!silent) setLoading(false); }
  }, [todayDateStr]);

  useEffect(() => {
    fetchPrimary(false);
    const interval = setInterval(() => fetchPrimary(true), LIVE_REFRESH);
    return () => clearInterval(interval);
  }, [fetchPrimary]);

  useEffect(() => { loadDateFixtures(todayDateStr); }, [loadDateFixtures, todayDateStr]);

  useEffect(() => {
    const unsub = subscribeToTodayFixtures(({ matches: lm, live, finished }) => {
      if (!lm || (lm.length === 0 && !live?.length && !finished?.length)) return;
      
      const finishedMap = new Map((finished || []).map(m => [String(m.id), m]));
      const liveMap = new Map((live || []).map(m => [String(m.id), m]));
      const allMap = new Map(lm.map(m => [String(m.id), m]));
      
      setPrimaryFixtures(prev => {
        let changed = false;
        const next = prev.map(f => {
          const freshFinished = finishedMap.get(String(f.id));
          if (freshFinished) {
            if (f.isFinished) return f;
            const ns = mapTransformedToNormalized(freshFinished);
            changed = true;
            if (ns && ns.isFinished) return { ...f, ...ns, isLive: false, isFinished: true, isStarted: false, status: ns.status || MatchStatus.FT };
            return { ...f, ...ns };
          }
          
          const freshLive = liveMap.get(String(f.id));
          if (freshLive) {
            if (f.isFinished) return f;
            const normFresh = normalizeMatch(freshLive, true);
            if (normFresh.isFinished) {
              changed = true;
              return { ...f, ...normFresh, isLive: false, isFinished: true, status: MatchStatus.FT };
            }
            if (f.homeScore !== normFresh.homeScore || f.awayScore !== normFresh.awayScore || f.isLive !== normFresh.isLive || f.minute !== normFresh.minute || f.status !== normFresh.status) {
              changed = true;
              return { ...f, ...normFresh, isLive: true };
            }
            return f;
          }
          
          const freshAll = allMap.get(String(f.id));
          if (freshAll) {
            if (f.isFinished) return f;
            if (freshAll.isFinished) {
              const ns = mapTransformedToNormalized(freshAll);
              changed = true;
              return { ...f, ...ns, isLive: false, isFinished: true, isStarted: false, status: freshAll.status || MatchStatus.FT };
            }
          }
          
          if (!f.isLive && !f.isFinished) {
            if (f.dateStr && f.dateStr < todayDateStr) {
              changed = true;
              return { ...f, isLive: false, isFinished: true, isStarted: false, isHT: false, status: MatchStatus.FT };
            }
            const ko = f.timestamp ? new Date(f.timestamp).getTime() : 0;
            if (f.dateStr === todayDateStr && ko > 0 && !f.isStarted) {
              const elapsed = Date.now() - ko;
              const hasScores = (f.homeScore != null && f.homeScore > 0) || (f.awayScore != null && f.awayScore > 0);
              if (elapsed > (3 * 60 * 60 * 1000) && !hasScores) {
                changed = true;
                return { ...f, isLive: false, isFinished: true, isStarted: false, status: MatchStatus.FT };
              }
            }
          }
          
          const ko = f.timestamp ? new Date(f.timestamp).getTime() : 0;
          if (!f.isLive && !f.isStarted && ko > 0 && Date.now() > ko && !f.isFinished) {
            if (f.dateStr === todayDateStr && (Date.now() - ko) < (3 * 60 * 60 * 1000)) {
              changed = true;
              return { ...f, isStarted: true, status: MatchStatus.STARTED };
            }
          }
          return f;
        });
        
        return changed ? next : prev;
      });
    });
    return () => unsub();
  }, [todayDateStr]);

  const fixtures = useMemo(() => {
    const todayPrimary = primaryFixtures.filter(m => m.dateStr === todayDateStr);
    if (todayPrimary.length > 0) {
      const uniqueIds = new Set();
      return todayPrimary.filter(m => {
        const idStr = String(m.id);
        if (uniqueIds.has(idStr)) return false;
        uniqueIds.add(idStr);
        return true;
      });
    }
    const backup = (backupRaw || []).map(m => normalizeMatch(m, false)).filter(m => m.dateStr === todayDateStr);
    const uniqueIds = new Set();
    return backup.filter(m => {
      const idStr = String(m.id);
      if (uniqueIds.has(idStr)) return false;
      uniqueIds.add(idStr);
      return true;
    });
  }, [primaryFixtures, backupRaw, todayDateStr]);

  return { fixtures, loading };
}

function useNews() {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'news_posts'), orderBy('createdAt', 'desc'), limit(8));
    const unsub = onSnapshot(q, (snap) => {
      const newPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPosts(prev => {
        if (prev.length !== newPosts.length) return newPosts;
        if (prev[0]?.id !== newPosts[0]?.id) return newPosts;
        if (prev[0]?.updatedAt?.seconds !== newPosts[0]?.updatedAt?.seconds) return newPosts;
        return prev;
      });
    }, (err) => console.error("News fetch error:", err));
    return () => unsub();
  }, [db]);
  return posts;
}

function useTotalUsers() {
  const [count, setCount] = useState(null);
  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), limit(1)))
      .then(s => {
        if (!s.empty) {
          const data = s.docs[0].data();
          if (data && data.totalUsers != null) setCount(data.totalUsers);
        }
      })
      .catch(() => {});
  }, [db]);
  return count;
}

const Sunset = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 10V2" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" />
    <path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" /><path d="m16 6-4 4-4-4" /><path d="M16 18a4 4 0 0 0-8 0" />
  </svg>
);

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return { text: 'Burning the midnight oil', icon: <Moon size={16} />, emoji: '\uD83E\uDD89' };
  if (h < 12) return { text: 'Good morning', icon: <Sun size={16} />, emoji: '\u2600\uFE0F' };
  if (h < 17) return { text: 'Good afternoon', icon: <CloudSun size={16} />, emoji: '\uD83C\uDF24\uFE0F' };
  if (h < 21) return { text: 'Good evening', icon: <Sunset size={16} />, emoji: '\uD83C\uDF05' };
  return { text: 'Good night', icon: <Moon size={16} />, emoji: '\uD83E\uDD89' };
};

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);

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
  const min = match.minute;
  const isLive = match.isLive;
  const hasScore = match.homeScore != null && match.awayScore != null;

  return (
    <div className="z-livemini" style={{ animationDelay: index * 50 + 'ms', borderColor: isLive ? 'rgba(239,68,68,.2)' : '#151b26' }}>
      <div className="z-lm-top">
        <span className="z-lm-league">{match.leagueName}</span>
        {isLive && min ? (
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
    </div>
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

  return (
    <div className={cls} style={{ borderLeft: '3px solid ' + border }}>
      <div className="z-mh">
        <div className="z-ml">
          {pred.league && pred.league.emblem && <img src={pred.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.league && pred.league.name ? pred.league.name : 'Featured'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {isLive && <span className="z-ldot" />}
          <span className="z-st" style={{ color: sColor, background: sBg }}>{sLabel}</span>
        </div>
      </div>
      <div className="z-tm">
        <div className="z-te">
          {pred.homeLogo && <img src={pred.homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.homeTeam && (pred.homeTeam.shortName || pred.homeTeam.name) ? (pred.homeTeam.shortName || pred.homeTeam.name) : 'Home'}</span>
        </div>
        <div className={sbCls}>{scoreContent}</div>
        <div className="z-te aw">
          {pred.awayLogo && <img src={pred.awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.awayTeam && (pred.awayTeam.shortName || pred.awayTeam.name) ? (pred.awayTeam.shortName || pred.awayTeam.name) : 'Away'}</span>
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

  return (
    <div className="z-mc zoka">
      <div className="z-mh">
        <div className="z-ml">
          {pick.league && pick.league.emblem && <img src={pick.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.league && pick.league.name ? pick.league.name : 'Zoka'}</span>
        </div>
        <span className="z-st" style={{ color: isFin ? '#10b981' : '#64748b', background: isFin ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.03)' }}>{isFin ? 'FT' : ko}</span>
      </div>
      <div className="z-tm">
        <div className="z-te">
          {pick.homeLogo && <img src={pick.homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.homeTeam && (pick.homeTeam.shortName || pick.homeTeam.name) ? (pick.homeTeam.shortName || pick.homeTeam.name) : '?'}</span>
        </div>
        <div className={sbCls}>{scoreContent}</div>
        <div className="z-te aw">
          {pick.awayLogo && <img src={pick.awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.awayTeam && (pick.awayTeam.shortName || pick.awayTeam.name) ? (pick.awayTeam.shortName || pick.awayTeam.name) : '?'}</span>
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

  const appData = useAppData();
  const activePredictions = appData.activePredictions;
  const zokaPicks = appData.zokaPicks;
  const dailyEntries = appData.dailyEntries;
  const dailyStats = appData.dailyStats;
  const userPredictions = appData.userPredictions;
  const predictionResults = appData.predictionResults;
  const userStats = appData.userStats;
  const ctxLoading = appData.loading;
  const ensureUserData = appData.ensureUserData;

  const { fixtures: allFixtures, loading: fxLoading } = useHomeFixtures();

  const [offline, setOffline] = useState(!navigator.onLine);
  const [ui, setUI] = useState({ showFeat: false, showZoka: false, showLB: false });

  const toggleUI = useCallback((key) => {
    setUI(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const totalUsers = useTotalUsers();
  const newsPosts = useNews();

  useEffect(() => {
    if (uid) ensureUserData(uid);
  }, [uid, ensureUserData]);

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

  const dedupedFixtures = useMemo(() => {
    const uniqueIds = new Set();
    return allFixtures.filter(m => {
      const idStr = String(m.id);
      if (uniqueIds.has(idStr)) return false;
      uniqueIds.add(idStr);
      return true;
    });
  }, [allFixtures]);

  const liveMatches = useMemo(() => dedupedFixtures.filter(f => f.isLive), [dedupedFixtures]);
  const stripMatches = liveMatches.length > 0 ? liveMatches : dedupedFixtures.slice(0, 10);

  const todayDateStr = todayStr(); 

  const zokaFlat = useMemo(() => {
    if (!zokaPicks || !zokaPicks.matches) return [];
    return zokaPicks.matches.map(m => ({ ...m, _d: todayDateStr }));
  }, [zokaPicks, todayDateStr]);
  
  const zokaVis = ui.showZoka ? zokaFlat : zokaFlat.slice(0, 4);
  const zokaHidden = Math.max(0, zokaFlat.length - 4);

  const featFlat = useMemo(() => {
    if (!activePredictions) return [];
    return activePredictions.map(m => ({ ...m, _d: todayDateStr }));
  }, [activePredictions, todayDateStr]);
  
  const featVis = ui.showFeat ? featFlat : featFlat.slice(0, 5);
  const featHidden = Math.max(0, featFlat.length - 5);

  const lbVis = ui.showLB ? (dailyEntries || []) : (dailyEntries || []).slice(0, 5);
  const lbHidden = Math.max(0, (dailyEntries || []).length - 5);

  // ★ FIX: Map predictions and results strictly by String(matchId)
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

  const resultMap = useMemo(() => {
    const m = {};
    if (predictionResults && predictionResults.results) {
      predictionResults.results.forEach(r => { m[String(r.matchId)] = r; });
    }
    return m;
  }, [predictionResults]);

  const myPredicted = useMemo(() => {
    if (!activePredictions) return 0;
    return activePredictions.filter(p => userPredMap[String(p.matchId)]).length;
  }, [activePredictions, userPredMap]);

  const displayName = userProfile && userProfile.displayName ? userProfile.displayName.split(' ')[0] : '';

  return (
    <div className="zoka-home">
      <SEO title="Football Predictions, Fixtures and Live Scores - ZOKA" description="Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world." keywords="football predictions, live scores, fixtures, ZOKA" path="/" />

      {offline && (
        <div className="z-offline"><WifiOff size={14} /> You are offline - showing cached data</div>
      )}

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
            {fxLoading && dedupedFixtures.length === 0 ? (
              <React.Fragment>
                <LiveStripLoader /><LiveStripLoader /><LiveStripLoader />
              </React.Fragment>
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
                <Link to={'/highlights/' + slugify(post.title) + '-' + post.id} key={post.id + '-' + i} className="z-newsmini">
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt={post.title} className="z-news-img" />
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
            <div className="val"><AnimNum value={totalUsers || (dailyStats && dailyStats.players) || 0} delay={200} /></div>
            <div className="lbl">Users</div>
            <div className="bar"><div className="bar-fill" style={{ width: Math.min(100, ((dailyStats && dailyStats.players) || 0 || totalUsers || 0) / 5) + '%', background: '#60a5fa' }} /></div>
          </div>
          <div className="z-chip">
            <div className="val"><AnimNum value={(dailyStats && dailyStats.preds) || 0} delay={280} /></div>
            <div className="lbl">Predictions</div>
            <div className="bar"><div className="bar-fill" style={{ width: Math.min(100, ((dailyStats && dailyStats.preds) || 0) / 10) + '%', background: '#10b981' }} /></div>
          </div>
          <div className="z-chip" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', right: 8, top: 8 }}>
              <AccuracyRing
                value={dailyStats && dailyStats.avg ? parseFloat(dailyStats.avg) : 0}
                size={36}
                stroke={3}
                color={(dailyStats && dailyStats.avg ? parseFloat(dailyStats.avg) : 0) >= 50 ? '#10b981' : (dailyStats && dailyStats.avg ? parseFloat(dailyStats.avg) : 0) >= 25 ? '#fbbf24' : '#ef4444'}
              />
            </div>
            <div className="val" style={{ fontSize: '.95rem' }}><AnimNum value={dailyStats && dailyStats.avg ? Math.round(parseFloat(dailyStats.avg)) : 0} delay={360} suffix="%" /></div>
            <div className="lbl">Accuracy</div>
          </div>
          <div className="z-chip">
            <div className="val" style={{ color: isLoggedIn ? '#10b981' : '#64748b' }}>
              {isLoggedIn ? <AnimNum value={(userStats && userStats.todayPoints) || 0} delay={440} /> : '-'}
            </div>
            <div className="lbl">My Points</div>
            {isLoggedIn && <div className="bar"><div className="bar-fill" style={{ width: Math.min(100, ((userStats && userStats.todayPoints) || 0) / 5) + '%', background: '#10b981' }} /></div>}
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
            <React.Fragment>
              {[0, 1, 2, 3].map(i => <div key={i} className="z-skel" style={{ height: 90, marginBottom: 8 }} />)}
            </React.Fragment>
          ) : featVis.length > 0 ? (
            featVis.map((p, i) => (
              <FeaturedRow
                key={p.id || String(p.matchId) || i}
                pred={p}
                // ★ FIX: Lookup strictly by String(p.matchId)
                userPred={userPredMap[String(p.matchId)]}
                userResult={resultMap[String(p.matchId)]}
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
            <React.Fragment>
              {[0, 1, 2, 3, 4].map(i => <div key={i} className="z-skel" style={{ height: 48, marginBottom: 6 }} />)}
            </React.Fragment>
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
          <div style={{ marginTop: 4, opacity: 0.5 }}>Data refreshes every {LIVE_REFRESH / 1000}s - Scores protected by FT Shield</div>
        </div>
      </div>
    </div>
  );
}