// footballprediction/src/pages/Basketball.jsx

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, RefreshCw, WifiOff, Database,
  ChevronDown, ChevronRight,
  Lock, LogIn, CheckCircle2, Sparkles, Flame,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useFixtures, useLiveMatches } from '../hooks/useFixtures';
import { useQueryClient } from '@tanstack/react-query';
import { getDateRange, todayStr as getTodayStr, getLocalDateStr, formatTime } from '../utils/dates';

import { db } from '../utils/firebase';
import { PATHS, getBasketballLeaguePriority, getLeagueColor, isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';
import { eventBus, EVENT } from '../utils/eventBus';
import { doc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { safeWrite } from '../services/safeWrite'; // â˜… IMPORTED safeWrite
import SEO from '../components/SEO';

function normalizeBasketballGame(raw) {
  if (!raw) return null;
  const status = raw.status || '';
  const isLive = isLiveStatus(status, SPORT.BASKETBALL);
  const isFinished = isFinishedStatus(status, SPORT.BASKETBALL);
  
  return {
    id: String(raw.id),
    status,
    isLive,
    isFinished,
    isScheduled: !isLive && !isFinished,
    date: raw.date,
    kickoff: raw.date ? formatTime(raw.date) : '',
    league: { 
      name: raw.leagueName || 'Other', 
      emblem: raw.leagueLogo, 
      color: getLeagueColor(raw.leagueId),
      country: raw.leagueCountry 
    },
    leagueKey: String(raw.leagueId),
    homeTeam: { name: raw.homeTeamName, logo: raw.homeTeamLogo },
    awayTeam: { name: raw.awayTeamName, logo: raw.awayTeamLogo },
    homeLogo: raw.homeTeamLogo,
    awayLogo: raw.awayTeamLogo,
    homeScore: raw.pointsHome ?? raw.homeScore,
    awayScore: raw.pointsAway ?? raw.awayScore,
    minute: raw.elapsed,
    score: {
      q1: { home: raw.q1Home, away: raw.q1Away },
      q2: { home: raw.q2Home, away: raw.q2Away },
      q3: { home: raw.q3Home, away: raw.q3Away },
      q4: { home: raw.q4Home, away: raw.q4Away },
      ot: { home: raw.otHome, away: raw.otAway },
    }
  };
}

function gamePriorityScore(g) {
  const base = getBasketballLeaguePriority(g.leagueKey) || 0;
  const liveBoost = g.isLive ? 50 : 0;
  const scheduledBoost = g.isScheduled ? 10 : 0;
  return base + liveBoost + scheduledBoost;
}

function getTopPredictGames(gamesList, count = 10) {
  if (!gamesList || !gamesList.length) return [];
  const eligible = gamesList.filter(g => g.isScheduled);
  const scored = eligible.map(g => ({ ...g, _priority: gamePriorityScore(g) }));
  scored.sort((a, b) => b._priority - a._priority);
  return scored.slice(0, count);
}

const SkeletonCard = memo(({ delay = 0 }) => (
  <div className="glass-card p-16 mb-8" style={{ animation: `zk-fade-up .35s ease ${delay}ms both` }}>
    <div className="flex-center gap-10 p-4">
      <div className="skeleton" style={{ width: 30, height: 30, borderRadius: 8 }} />
      <div className="skeleton" style={{ width: '55%', height: 14, flex: 1 }} />
      <div className="skeleton" style={{ width: 28, height: 20 }} />
    </div>
    <div className="flex-center gap-10 p-4 mt-6">
      <div className="skeleton" style={{ width: 30, height: 30, borderRadius: 8 }} />
      <div className="skeleton" style={{ width: '45%', height: 14, flex: 1 }} />
      <div className="skeleton" style={{ width: 28, height: 20 }} />
    </div>
  </div>
));

const SkeletonGroup = memo(() => (
  <div>
    <div className="flex-center gap-10 p-8">
      <div className="skeleton" style={{ width: 22, height: 22, borderRadius: 5 }} />
      <div className="skeleton" style={{ width: 140, height: 14, flex: 1 }} />
    </div>
    {[0, 1, 2].map(i => <SkeletonCard key={i} delay={i * 80} />)}
  </div>
));

const ErrorScreen = memo(function ErrorScreen({ error, onRetry }) {
  const cfg = {
    NETWORK: { icon: <WifiOff size={24} />, bg: 'rgba(var(--danger-rgb),.1)', color: 'var(--danger)', t: 'Connection error', d: 'Could not reach Firestore. Check your internet connection.' },
    NO_DB: { icon: <Database size={24} />, bg: 'rgba(var(--gold-rgb),.1)', color: 'var(--gold)', t: 'No database', d: 'Firebase is not configured.' },
  };
  const c = cfg[error] || cfg.NETWORK;
  return (
    <div className="glass-card flex-col items-center gap-12 p-32 text-center">
      <div className="flex-center" style={{ width: 52, height: 52, borderRadius: '50%', background: c.bg, color: c.color }}>{c.icon}</div>
      <div className="text-primary font-bold">{c.t}</div>
      <div className="text-muted text-sm" style={{ maxWidth: 360 }}>{c.d}</div>
      <button className="btn btn-primary" onClick={onRetry}>
        <RefreshCw size={14} /> Retry
      </button>
    </div>
  );
});

const TeamLogo = memo(({ src, name }) => {
  if (!src) return (
    <div className="flex-center bg-elevated text-muted font-bold" style={{ width: 30, height: 30, borderRadius: 8, fontSize: 13 }}>
      {(name || '?')[0]}
    </div>
  );
  return <img src={src} alt={name} style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'contain', background: 'rgba(255,255,255,.03)', padding: 3 }} loading="lazy" />;
});

const StatusBadge = memo(({ game }) => {
  const s = game.status;
  let bg = 'var(--bg-elevated)', color = 'var(--text-muted)', label = s;

  if (game.isLive) { bg = 'rgba(var(--danger-rgb),.15)'; color = 'var(--danger)'; label = game.minute || s; }
  else if (game.isFinished) { bg = 'rgba(var(--primary-rgb),.1)'; color = 'var(--primary)'; label = s === 'AOT' ? 'OT' : 'FT'; }
  else if (s === 'SUSP') { bg = 'rgba(var(--gold-rgb),.1)'; color = 'var(--gold)'; label = 'SUSP'; }
  else if (s === 'POST') { bg = 'rgba(var(--gold-rgb),.1)'; color = 'var(--gold)'; label = 'POSTP'; }
  else if (s === 'CANC') { bg = 'rgba(var(--danger-rgb),.1)'; color = 'var(--danger)'; label = 'CANC'; }

  return <span className="badge" style={{ background: bg, color, border: 'none', animation: 'zk-pop .35s ease' }}>{label}</span>;
});

const ScoreDisplay = memo(({ score, isLive }) => {
  const baseStyle = { fontSize: 18, fontWeight: 800, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums', transition: 'color .3s' };
  if (!isLive) return <span style={{ ...baseStyle, color: 'var(--text-primary)' }}>{score ?? '-'}</span>;
  return (
    <span key={score} style={{ ...baseStyle, color: 'var(--danger)', textShadow: '0 0 12px rgba(var(--danger-rgb),.4)', display: 'inline-block', animation: 'zk-score-pop .5s ease' }}>
      {score ?? '-'}
    </span>
  );
});

const GameCard = memo(function GameCard({ game, index = 0 }) {
  const hasQuarters = game.score?.q1?.home !== null && game.score?.q1?.home !== undefined;
  const showQuarters = hasQuarters && (game.isLive || game.isFinished);
  const homeWin = game.isFinished && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWin = game.isFinished && (game.awayScore ?? 0) < (game.homeScore ?? 0);

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const qKeys = ['q1', 'q2', 'q3', 'q4'];
  if (game.score?.ot?.home !== null && game.score?.ot?.home !== undefined) {
    quarters.push('OT');
    qKeys.push('ot');
  }
  const qCount = quarters.length;

  const teamNameStyle = (isWinner) => {
    if (isWinner === true) return { flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    if (isWinner === false) return { flex: 1, fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    return { flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  };

  return (
    <div className="glass-card p-16 mb-8" style={{
      border: game.isLive ? '1px solid rgba(var(--danger-rgb),.2)' : '1px solid var(--border)',
      animation: `zk-fade-up .35s ease ${index * 50}ms both${game.isLive ? ', zk-live-glow 2.5s ease-in-out infinite' : ''}`,
    }}>
      {game.isLive && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: 'linear-gradient(180deg, var(--danger), var(--danger-dim))', borderRadius: '0 2px 2px 0' }} />
      )}

      <div className="flex-center gap-10 p-4" style={{ paddingLeft: game.isLive ? 10 : 0 }}>
        <TeamLogo src={game.homeLogo} name={game.homeTeam?.name} />
        <span style={teamNameStyle(game.isFinished ? homeWin : undefined)}>{game.homeTeam?.name || 'TBD'}</span>
        {game.isScheduled
          ? <span className="text-secondary font-bold text-sm">{game.kickoff}</span>
          : <ScoreDisplay score={game.homeScore} isLive={game.isLive} />
        }
      </div>

      <div className="flex-center gap-10 p-4" style={{ paddingLeft: game.isLive ? 10 : 0 }}>
        <TeamLogo src={game.awayLogo} name={game.awayTeam?.name} />
        <span style={teamNameStyle(game.isFinished ? awayWin : undefined)}>{game.awayTeam?.name || 'TBD'}</span>
        {game.isScheduled
          ? <StatusBadge game={game} />
          : <ScoreDisplay score={game.awayScore} isLive={game.isLive} />
        }
      </div>

      {!game.isScheduled && (
        <div className="flex justify-end mt-4 pr-2">
          <StatusBadge game={game} />
        </div>
      )}

      {showQuarters && (
        <div className="grid gap-0 mt-10 pt-8 border-t" style={{ gridTemplateColumns: `repeat(${qCount + 1}, 1fr)`, animation: `zk-fade-up .3s ease ${index * 50 + 150}ms both` }}>
          {quarters.map(q => <span key={q} className="text-muted text-center font-bold p-2" style={{ fontSize: 9 }}>{q}</span>)}
          <span className="text-muted text-center font-bold p-2" style={{ fontSize: 9 }}>TOT</span>
          {qKeys.map((key) => (
            <span key={`h_${key}`} className="text-muted text-center p-2" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              {game.score?.[key]?.home ?? '-'}
            </span>
          ))}
          <span className="text-secondary text-center p-2 font-bold" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{game.homeScore ?? '-'}</span>
          {qKeys.map((key) => (
            <span key={`a_${key}`} className="text-muted text-center p-2" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              {game.score?.[key]?.away ?? '-'}
            </span>
          ))}
          <span className="text-secondary text-center p-2 font-bold" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{game.awayScore ?? '-'}</span>
        </div>
      )}
    </div>
  );
});

const LeagueSection = memo(function LeagueSection({ league, games, sectionIndex = 0 }) {
  return (
    <div style={{ animation: `zk-slide-in .4s ease ${sectionIndex * 80}ms both` }}>
      <div className="flex-center gap-10 py-8 px-8 border-b mb-6 relative">
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: league.color, borderRadius: '0 2px 2px 0' }} />
        {league.emblem && <img src={league.emblem} alt="" style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'contain' }} loading="lazy" />}
        {!league.emblem && <div style={{ width: 22, height: 22, borderRadius: 5, background: league.color }} />}
        <span className="text-secondary font-bold flex-1" style={{ fontSize: 13 }}>{league.name}</span>
        {league.country && <span className="text-muted text-xs">{league.country}</span>}
      </div>
      {games.map((g, i) => <GameCard key={g.id} game={g} index={i} />)}
    </div>
  );
});

const PredictCard = memo(function PredictCard({ game, prediction, onPredict, onRemove, loggedIn, index }) {
  const isLive = game.isLive;
  const isFinished = game.isFinished;
  const currentPick = prediction?.pick || null;
  const kickOff = game.kickoff || '';

  const pickLabels = { home: game.homeTeam?.name || 'Home', away: game.awayTeam?.name || 'Away' };
  const pickColors = {
    home: { bg: currentPick === 'home' ? 'rgba(var(--accent-rgb),.18)' : 'var(--bg-elevated)', border: currentPick === 'home' ? 'var(--accent)' : 'var(--border)', color: currentPick === 'home' ? 'var(--accent)' : 'var(--text-secondary)' },
    away: { bg: currentPick === 'away' ? 'rgba(var(--danger-rgb),.12)' : 'var(--bg-elevated)', border: currentPick === 'away' ? 'var(--danger)' : 'var(--border)', color: currentPick === 'away' ? 'var(--danger)' : 'var(--text-secondary)' },
  };

  const handlePick = useCallback((pick) => {
    if (!loggedIn) { onPredict(null, true); return; }
    if (currentPick === pick) { onRemove(String(game.id)); } else { onPredict(String(game.id), false, pick); }
  }, [loggedIn, onPredict, currentPick, onRemove, game.id]);

  return (
    <div className="glass-card p-16 mb-8" style={{ border: `1px solid ${isLive ? 'rgba(var(--danger-rgb),.25)' : 'var(--border)'}`, animation: `zk-pop .35s ease ${index * 60}ms both` }}>
      {isLive && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--danger), var(--warning))', animation: 'zk-live-glow 2s ease-in-out infinite' }} />}
      <div className="flex-center gap-6 mb-10">
        {game.league?.emblem && <img src={game.league.emblem} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />}
        <span className="text-muted font-bold flex-1" style={{ fontSize: '.66rem' }}>{game.league?.name || ''}</span>
        <span className="text-muted font-bold flex-center gap-4" style={{ fontSize: '.64rem', color: isLive ? 'var(--danger)' : 'var(--text-muted)' }}>
          {isLive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', animation: 'zk-pulse 1.5s ease-in-out infinite' }} />}
          {isLive ? 'LIVE' : kickOff}
        </span>
      </div>
      <div className="flex-between gap-10 mb-12">
        <div className="flex-center gap-8 flex-1 min-w-0">
          <TeamLogo src={game.homeLogo} name={game.homeTeam?.name} />
          <span className="text-primary font-bold truncate" style={{ fontSize: '.82rem' }}>{game.homeTeam?.name}</span>
        </div>
        {game.isScheduled ? (
          <div className="badge badge-muted">VS</div>
        ) : (
          <div className="flex-center gap-5 px-14 py-4 rounded-md font-extrabold text-primary" style={{ background: isLive ? 'rgba(var(--danger-rgb),.08)' : 'var(--bg-elevated)', fontSize: '1.1rem', letterSpacing: 2 }}>
            {game.homeScore ?? '-'} <span className="text-muted font-normal">-</span> {game.awayScore ?? '-'}
          </div>
        )}
        <div className="flex-center gap-8 flex-1 min-w-0 justify-end">
          <span className="text-primary font-bold truncate text-right" style={{ fontSize: '.82rem' }}>{game.awayTeam?.name}</span>
          <TeamLogo src={game.awayLogo} name={game.awayTeam?.name} />
        </div>
      </div>
      {!isFinished && (
        <div className="flex gap-8">
          {['home', 'away'].map((pick) => (
            <button key={pick} className="btn flex-1" onClick={() => handlePick(pick)}
              style={{ background: pickColors[pick].bg, border: `1.5px solid ${pickColors[pick].border}`, color: pickColors[pick].color, fontWeight: 800, fontSize: '.72rem' }}>
              {pickLabels[pick]}
              {currentPick === pick && <CheckCircle2 size={13} className="ml-3" />}
              {!loggedIn && <Lock size={10} style={{ position: 'absolute', top: 4, right: 5, opacity: .4 }} />}
            </button>
          ))}
        </div>
      )}
      {isFinished && currentPick && (
        <div className="flex-center justify-center gap-6 py-6 text-muted font-bold" style={{ fontSize: '.72rem' }}>
          <span>Your pick:</span>
          <span style={{ color: pickColors[currentPick]?.color || 'var(--accent)' }}>{pickLabels[currentPick]}</span>
        </div>
      )}
    </div>
  );
});

const LoginPromptModal = memo(function LoginPromptModal({ onClose }) {
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/60 flex-center z-max p-20" style={{ backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} className="glass-card flex-col p-32 text-center max-w-380 w-full">
        <div className="glass-card flex-center mb-16 mx-auto" style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(var(--accent-rgb),.12)', color: 'var(--accent)' }}>
          <Lock size={24} />
        </div>
        <div className="text-primary font-extrabold mb-8">Login to Predict</div>
        <div className="text-muted text-sm leading-relaxed mb-20">Sign in to start making basketball predictions and compete on the leaderboard.</div>
        <button className="btn btn-primary w-full mb-10" onClick={() => window.location.href = '/login'}>
          <LogIn size={16} /> Sign In
        </button>
        <button className="btn btn-ghost w-full" onClick={onClose}>Maybe Later</button>
      </div>
    </div>
  );
});

export default function Basketball() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const dates = useMemo(() => getDateRange(9, -1), []);
  const todayStr = useMemo(() => getTodayStr(), []);
  const yesterdayStr = useMemo(() => getLocalDateStr(-1), []);
  const tomorrowStr = useMemo(() => getLocalDateStr(1), []);

  const windowDates = useMemo(() => [yesterdayStr, todayStr, tomorrowStr], [yesterdayStr, todayStr, tomorrowStr]);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  
  const { data: rawFixtures = [], isLoading: loading } = useFixtures(selectedDate, 'basketball');
  const { data: rawLive = [] } = useLiveMatches('basketball');
  
  const gamesByDate = useMemo(() => ({ [selectedDate]: rawFixtures.map(normalizeBasketballGame) }), [rawFixtures, selectedDate]);
  const liveGames = useMemo(() => rawLive.map(normalizeBasketballGame), [rawLive]);
  
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState('fixtures');
  const [predictions, setPredictions] = useState({});
  const [showLoginModal, setShowLoginModal] = useState(false);
  const loggedIn = !!currentUser;
  const [predictDay, setPredictDay] = useState('today');
  const [upcomingOpen, setUpcomingOpen] = useState(false);

  const dateScrollRef = useRef(null);

  const currentGames = gamesByDate[selectedDate] || [];

  useEffect(() => {
    if (!currentUser) { setPredictions({}); return; }
    const q = query(collection(db, 'user_bb_predictions'), where('userId', '==', currentUser.uid));
    
    const unsub = onSnapshot(q, (snap) => {
      const userPreds = {};
      snap.docs.forEach(d => {
        const data = d.data();
        userPreds[data.gameId] = { pick: data.pick, timestamp: data.timestamp };
      });
      setPredictions(prev => {
        if (Object.keys(prev).length !== Object.keys(userPreds).length) return userPreds;
        for (const k in userPreds) {
          if (prev[k]?.pick !== userPreds[k].pick) return userPreds;
        }
        return prev;
      });
    }, (err) => console.error("Pred fetch error:", err));
    return () => unsub();
  }, [currentUser]);

  const handlePredict = useCallback(async (gameId, needsLogin, pick) => {
    if (needsLogin || !currentUser) { setShowLoginModal(true); return; }
    if (!gameId || !pick) return;
    // â˜… Use safeWrite for offline queue support
    await safeWrite('user_bb_predictions', `${currentUser.uid}_${gameId}`, { userId: currentUser.uid, gameId: String(gameId), pick, timestamp: Date.now() });
    eventBus.emit(EVENT.USER_PREDICTION_SAVED, { uid: currentUser.uid, matchId: gameId, sport: 'basketball' });
  }, [currentUser]);

  const handleRemovePredict = useCallback(async (gameId) => {
    if (!currentUser) return;
    const predRef = doc(db, 'user_bb_predictions', `${currentUser.uid}_${gameId}`);
    await deleteDoc(predRef);
    eventBus.emit(EVENT.USER_PREDICTION_SAVED, { uid: currentUser.uid, matchId: gameId, removed: true, sport: 'basketball' });
  }, [currentUser]);

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    queryClient.invalidateQueries(['fixtures', selectedDate]);
    queryClient.invalidateQueries(['liveMatches']);
    setTimeout(() => setRefreshing(false), 500);
  }, [refreshing, selectedDate, queryClient]);

  const mergedGames = useMemo(() => {
    if (!liveGames.length) return currentGames;
    const liveMap = new Map(liveGames.map(g => [String(g.id), g]));
    let changed = false;
    const next = currentGames.map(g => {
      const live = liveMap.get(String(g.id));
      if (live && (g.homeScore !== live.homeScore || g.awayScore !== live.awayScore || g.status !== live.status || g.minute !== live.minute)) {
        changed = true;
        return { ...g, ...live };
      }
      return g;
    });
    return changed ? next : currentGames;
  }, [currentGames, liveGames]);

  const grouped = useMemo(() => {
    const map = new Map();
    mergedGames.forEach(g => {
      if (!map.has(g.leagueKey)) {
        map.set(g.leagueKey, { key: g.leagueKey, ...g.league, games: [] });
      }
      map.get(g.leagueKey).games.push(g);
    });
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const aLive = a.games.some(g => g.isLive);
      const bLive = b.games.some(g => g.isLive);
      if (aLive && !bLive) return -1;
      if (!aLive && bLive) return 1;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [mergedGames]);

  const liveCount = liveGames.length;
  const totalLiveInDate = mergedGames.filter(g => g.isLive).length;

  const liveLeagues = grouped.filter(l => l.games.some(g => g.isLive));
  const scheduledLeagues = grouped.filter(l => l.games.some(g => g.isScheduled));
  const finishedLeagues = grouped.filter(l => l.games.every(g => g.isFinished));

  const gameCounts = useMemo(() => {
    const counts = {};
    Object.entries(gamesByDate).forEach(([date, games]) => {
      counts[date] = games.length;
    });
    return counts;
  }, [gamesByDate]);

  const todayPredictGames = useMemo(() => getTopPredictGames(gamesByDate[todayStr] || [], 10), [gamesByDate, todayStr]);
  const tomorrowPredictGames = useMemo(() => getTopPredictGames(gamesByDate[tomorrowStr] || [], 10), [gamesByDate, tomorrowStr]);

  const upcomingPredictGames = useMemo(() => {
    if (!upcomingOpen || !predictDay || predictDay === 'today' || predictDay === tomorrowStr) return [];
    return getTopPredictGames(gamesByDate[predictDay] || [], 10);
  }, [gamesByDate, predictDay, upcomingOpen, tomorrowStr]);

  const predictViewDates = useMemo(() => dates.filter(d => d.date > tomorrowStr).slice(0, 7), [dates, tomorrowStr]);

  useEffect(() => {
    if (dateScrollRef.current) {
      const todayEl = dateScrollRef.current.querySelector('[data-date="' + todayStr + '"]');
      if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [todayStr]);

  let sectionIdx = 0;

  return (
    <div className="zoka-page" style={{ animation: 'zk-fade-up .45s ease' }}>
      {showLoginModal && <LoginPromptModal onClose={() => setShowLoginModal(false)} />}

      <SEO
        title="Basketball Fixtures, Live Scores & Predictions"
        description="Follow basketball fixtures, live scores, standings, match insights, and predictions from top competitions around the world on ZOKASCORE."
        keywords="basketball, basketball fixtures, live basketball scores, basketball predictions, NBA, EuroLeague, standings, ZOKASCORE"
        robots="index,follow"
        
      />

      <div className="glass sticky top-0 z-sticky" style={{ borderBottom: '1px solid var(--border)', animation: 'zk-slide-in .4s ease' }}>
        <div className="zoka-wrap flex-between py-12">
          <div className="flex-center gap-10">
            <div className="flex-center font-extrabold text-inverse" style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', fontSize: '.72rem' }}>Z</div>
            <span className="text-primary font-extrabold text-sm">zokascore<span className="text-accent">.xyz</span></span>
            <span style={{ fontSize: 20 }}>ðŸ€</span>
          </div>
          <div className="flex-center gap-4">
            {liveCount > 0 && (
              <div className="badge badge-danger anim-live-pulse">
                <span className="zk-live-pulse-dot mr-2" /> LIVE {liveCount}
              </div>
            )}
            <button className="btn-icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw size={15} className={refreshing ? 'anim-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="zoka-wrap flex-between py-6">
          <div className="flex gap-4">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/fixtures')}>
              <span style={{ fontSize: '1rem' }}>âš½</span> Football <ChevronRight size={13} className="opacity-50" />
            </button>
            <button className="btn btn-primary btn-sm">
              <span style={{ fontSize: '1rem' }}>ðŸ€</span> Basketball
            </button>
          </div>
          <span className="text-muted font-medium flex-center gap-4 text-xs">
            <Database size={10} /> Firestore
          </span>
        </div>

        <div className="zoka-wrap flex gap-4 py-6">
          <button className={`btn flex-1 ${viewMode === 'fixtures' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('fixtures')}>
            <CalendarDays size={14} /> Fixtures
          </button>
          <button className={`btn flex-1 ${viewMode === 'predict' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('predict')}>
            <Sparkles size={14} /> Predict
            {Object.keys(predictions).length > 0 && <span className="badge badge-muted ml-2">{Object.keys(predictions).length}</span>}
          </button>
        </div>

        {viewMode === 'fixtures' && (
          <div ref={dateScrollRef} className="zoka-wrap flex gap-4 py-10 overflow-x-auto">
            {dates.map((d, i) => {
              const isActive = d.date === selectedDate;
              const isToday = d.isToday;
              const inWindow = windowDates.includes(d.date);
              const count = gameCounts[d.date];
              return (
                <button key={d.date} data-date={d.date} className={`btn flex-col min-w-52 ${isActive ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelectedDate(d.date)} style={{ animation: `zk-fade-up .3s ease ${i * 25}ms both`, position: 'relative' }}>
                  <span className="text-xs font-bold opacity-70 uppercase">{d.day}</span>
                  <span className="font-extrabold text-md">{d.num}</span>
                  <span className="text-xs font-semibold opacity-50">{d.month}</span>
                  {inWindow && count > 0 && <span className="absolute -top-3 -right-3 badge badge-primary">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="zoka-wrap py-12 pb-80">
        {viewMode === 'fixtures' && (
          <>
            {error && !loading && <ErrorScreen error={error} onRetry={() => { setError(null); handleRefresh(); }} />}

            {loading && !error ? (
              <div><SkeletonGroup /><div className="mt-16"><SkeletonGroup /></div></div>
            ) : !error && mergedGames.length === 0 ? (
              <div className="glass-card flex-col items-center p-60 text-center gap-16">
                <div style={{ fontSize: 48, animation: 'zk-bounce 4s ease-in-out infinite' }}>ðŸ€</div>
                <div className="text-muted font-medium text-sm">No games scheduled for this date</div>
                <div className="text-muted text-xs">Backend populates yesterday, today, and tomorrow</div>
                {!windowDates.includes(selectedDate) && (
                  <button className="btn btn-secondary mt-16" onClick={() => setSelectedDate(todayStr)}>Go to Today</button>
                )}
              </div>
            ) : !error && (
              <div key={selectedDate}>
                {liveLeagues.length > 0 && (
                  <>
                    <div className="flex-center gap-8 my-24 text-muted text-xs font-bold uppercase" style={{ animation: `zk-fade-up .3s ease ${sectionIdx * 60}ms both` }}>
                      <div className="zk-live-pulse-dot" /> LIVE ({totalLiveInDate})
                    </div>
                    {liveLeagues.map(l => { const idx = sectionIdx++; return <LeagueSection key={`live-${l.key}`} league={l} games={l.games.filter(g => g.isLive)} sectionIndex={idx} />; })}
                  </>
                )}
                {scheduledLeagues.length > 0 && (
                  <>
                    <div className="flex-center gap-8 my-24 text-muted text-xs font-bold uppercase" style={{ animation: `zk-fade-up .3s ease ${sectionIdx * 60}ms both` }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} /> SCHEDULED
                    </div>
                    {scheduledLeagues.map(l => { const idx = sectionIdx++; return <LeagueSection key={`sched-${l.key}`} league={l} games={l.games.filter(g => g.isScheduled)} sectionIndex={idx} />; })}
                  </>
                )}
                {finishedLeagues.length > 0 && (
                  <>
                    <div className="flex-center gap-8 my-24 text-muted text-xs font-bold uppercase" style={{ animation: `zk-fade-up .3s ease ${sectionIdx * 60}ms both` }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} /> FINISHED
                    </div>
                    {finishedLeagues.map(l => { const idx = sectionIdx++; return <LeagueSection key={`fin-${l.key}`} league={l} games={l.games.filter(g => g.isFinished)} sectionIndex={idx} />; })}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {viewMode === 'predict' && (
          <div className="anim-fade-up">
            <div className="flex-center gap-10 mb-16">
              <div className="glass-card flex-center text-accent" style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(var(--accent-rgb),.1)' }}>
                <Flame size={18} />
              </div>
              <div>
                <div className="text-primary font-extrabold">Predict & Win</div>
                <div className="text-muted text-xs">Pick basketball game outcomes</div>
              </div>
              {!loggedIn && <button className="btn btn-secondary btn-sm ml-auto" onClick={() => setShowLoginModal(true)}><Lock size={12} /> Sign in</button>}
              {loggedIn && Object.keys(predictions).length > 0 && <div className="badge badge-accent ml-auto"><CheckCircle2 size={12} /> {Object.keys(predictions).length} Picked</div>}
            </div>

            <div className="mb-24">
              <div className="flex-center gap-8 mb-12 text-primary font-bold text-sm"><CalendarDays size={14} className="text-accent" /> Today's Games</div>
              {todayPredictGames.length > 0 ? todayPredictGames.map((g, i) => <PredictCard key={g.id} game={g} index={i} prediction={predictions[g.id]} onPredict={handlePredict} onRemove={handleRemovePredict} loggedIn={loggedIn} />) : <div className="text-center p-20 text-muted text-sm">No predictions available for today.</div>}
            </div>

            <div className="mb-24">
              <div className="flex-center gap-8 mb-12 text-primary font-bold text-sm"><CalendarDays size={14} className="text-gold" /> Tomorrow's Games</div>
              {tomorrowPredictGames.length > 0 ? tomorrowPredictGames.map((g, i) => <PredictCard key={g.id} game={g} index={i} prediction={predictions[g.id]} onPredict={handlePredict} onRemove={handleRemovePredict} loggedIn={loggedIn} />) : <div className="text-center p-20 text-muted text-sm">No predictions available for tomorrow.</div>}
            </div>

            <div className="mb-24">
              <button className="btn btn-secondary w-full flex-between" onClick={() => setUpcomingOpen(!upcomingOpen)}>
                <span className="flex-center gap-8"><ChevronDown size={14} className="text-muted" /> Upcoming Games</span>
                <ChevronRight size={14} className="text-muted" style={{ transform: upcomingOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
              </button>
              
              {upcomingOpen && (
                <div className="mt-12">
                  <div className="flex gap-8 overflow-x-auto pb-8 mb-12">
                    {predictViewDates.map(d => (
                      <button key={d.date} onClick={() => setPredictDay(d.date)} className={`btn btn-sm ${predictDay === d.date ? 'btn-primary' : 'btn-secondary'}`}>
                        {d.day} {d.num}
                      </button>
                    ))}
                  </div>
                  
                  {upcomingPredictGames.length > 0 ? upcomingPredictGames.map((g, i) => <PredictCard key={g.id} game={g} index={i} prediction={predictions[g.id]} onPredict={handlePredict} onRemove={handleRemovePredict} loggedIn={loggedIn} />) : <div className="text-center p-20 text-muted text-sm">{predictDay ? `No games scheduled for ${predictDay}.` : 'Select a date to view upcoming games.'}</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
