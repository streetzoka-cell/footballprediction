// ═══════════════════════════════════════════════════════════════
// FILE: src/pages/Leaderboard.jsx
// v20.6 — Instant Local Rank Calculation, Zero-Jank Live Merge, Memoized
// ★ CLEANED: Airtight listener bailouts to prevent redundant recalculations.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef, useMemo, useCallback, useEffect, useDeferredValue, startTransition, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Trophy, TrendingUp, Target, BarChart3,
  X, Crown, Flame, AlertCircle, ShieldAlert, Users,
  Calendar, Award, ChevronDown, RotateCcw, ChevronRight, ArrowLeft
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { PERIOD, PERIOD_LABEL, calcPoints, SPORT, isFinishedStatus } from '../utils/constants';
import { todayStr } from '../utils/dates';
import { db } from '../utils/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { subscribeToLiveFixtures } from '../utils/api';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════ */
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SMOOTH = 'cubic-bezier(0.22, 1, 0.36, 1)';

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#78716c',
];

const PODIUM_CFG = [
  { h: 130, border: 'var(--gold)', bg: 'linear-gradient(180deg,rgba(245,197,66,.12) 0%,rgba(245,197,66,.02) 100%)', text: 'var(--gold)', avatar: 72, font: '1.25rem', shadow: '0 0 24px rgba(245,197,66,.15)', order: 2 },
  { h: 95, border: '#94a3b8', bg: 'linear-gradient(180deg,rgba(148,163,184,.07) 0%,rgba(148,163,184,.01) 100%)', text: '#94a3b8', avatar: 58, font: '1rem', shadow: '0 0 16px rgba(148,163,184,.08)', order: 1 },
  { h: 75, border: '#b45309', bg: 'linear-gradient(180deg,rgba(180,83,9,.07) 0%,rgba(180,83,9,.01) 100%)', text: '#d97706', avatar: 50, font: '.85rem', shadow: '0 0 12px rgba(180,83,9,.08)', order: 3 },
];

const TABS = [
  { key: PERIOD.DAILY, label: 'Today', Icon: Calendar },
  { key: PERIOD.WEEKLY, label: 'Week', Icon: TrendingUp },
  { key: PERIOD.MONTHLY, label: 'Month', Icon: BarChart3 },
  { key: PERIOD.GOAT, label: 'G.O.A.T', Icon: Crown, isGoat: true },
];

/* ═══════════════════════════════════════
   MEMOIZED SMALL COMPONENTS
   ═══════════════════════════════════════ */
const AccBar = memo(function AccBar({ value, delay }) {
  const fill = value >= 70 ? 'var(--accent)' : value >= 45 ? 'var(--gold)' : '#ef4444';
  return (
    <div className="lb-acc">
      <div className="lb-acc-bar">
        <div className="lb-acc-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: `linear-gradient(90deg,${fill},${fill}88)`, animationDelay: `${delay || 0}ms` }} />
      </div>
      <span className="lb-acc-val" style={{ color: fill }}>{value}%</span>
    </div>
  );
});

const StatCard = memo(function StatCard({ icon, label, value, color, bg, delay }) {
  return (
    <div className="lb-stat" style={{ animationDelay: `${delay || 0}ms` }}>
      <div className="lb-stat-icon" style={{ background: bg, color }}>{icon}</div>
      <div>
        <div className="lb-stat-val" style={{ animationDelay: `${(delay || 0) + 60}ms` }}>{value}</div>
        <div className="lb-stat-lbl">{label}</div>
      </div>
    </div>
  );
});

const PodiumUser = memo(function PodiumUser({ user, position, delay }) {
  const c = PODIUM_CFG[position];
  if (!c) return null;
  return (
    <div className="lb-pod-u" style={{ order: c.order, animation: `lb-pop .4s ${SPRING} ${(delay || 0) + 150}ms both` }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6, position: 'relative' }}>
        {position === 0 && (
          <div style={{ color: 'var(--gold)', marginBottom: -2, filter: 'drop-shadow(0 0 5px rgba(245,197,66,.3))', animation: 'lb-crown 3s ease-in-out infinite' }}>
            <Crown size={20} />
          </div>
        )}
        <div className="lb-pod-avatar" style={{ width: c.avatar, height: c.avatar, background: `linear-gradient(135deg,${c.border}25,${c.border}08)`, border: `3px solid ${c.border}`, fontSize: c.font, color: c.text, boxShadow: c.shadow }}>
          {(user.displayName || '??').slice(0, 2).toUpperCase()}
        </div>
        <div className="lb-pod-name">{user.displayName}</div>
        <div className="lb-pod-sub">{user.points} pts · {user.accuracy}%</div>
      </div>
      <div className="lb-pod-bar" style={{ height: c.h, background: c.bg, animationDelay: `${(delay || 0) + 300}ms` }}>
        <div className="lb-pod-num" style={{ color: c.text }}>#{position + 1}</div>
      </div>
    </div>
  );
});

const ErrorState = memo(function ErrorState({ error, onRetry }) {
  return (
    <div className="lb-error">
      <div className="lb-error-icon">{error === 'permissions' ? <ShieldAlert size={20} /> : <AlertCircle size={20} />}</div>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '.95rem' }}>{error === 'permissions' ? 'Permissions Required' : 'Failed to Load'}</div>
      <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5, fontWeight: 600 }}>{String(error)}</div>
      {onRetry && <button className="lb-refresh" onClick={onRetry}><RotateCcw size={12} /> Retry</button>}
    </div>
  );
});

const TabBar = memo(function TabBar({ tabs, active, onChange }) {
  const barRef = useRef(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const isGoat = active === PERIOD.GOAT;

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const btn = bar.querySelector(`[data-tab="${active}"]`);
    if (!btn) return;
    const barRect = bar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setInd({ left: btnRect.left - barRect.left + btnRect.width * 0.18, width: btnRect.width * 0.64 });
  }, [active]);

  return (
    <div className="lb-tabs" ref={barRef}>
      {tabs.map(t => (
        <button key={t.key} data-tab={t.key} className={`lb-tab${active === t.key ? ' on' : ''}${t.isGoat ? ' goat' : ''}`} onClick={() => startTransition(() => onChange(t.key))}>
          <t.Icon size={12} />
          <span className="lbl">{t.label}</span>
        </button>
      ))}
      <div className="lb-tab-ind" style={{ left: ind.left, width: ind.width, background: isGoat ? 'rgba(0,0,0,.15)' : 'var(--gold)', boxShadow: isGoat ? 'none' : '0 0 8px rgba(245,197,66,.3)' }} />
    </div>
  );
});

const LeaderboardRow = memo(function LeaderboardRow({ user, rank, isMe, delay }) {
  const avColor = AVATAR_COLORS[(rank - 1) % AVATAR_COLORS.length];
  const exactColor = (user.exact || 0) >= 15 ? 'var(--accent)' : (user.exact || 0) >= 10 ? 'var(--gold)' : 'var(--text-primary)';

  return (
    <tr className={`lb-row${isMe ? ' me' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <td className="lb-td" style={{ fontWeight: 800, fontFamily: 'var(--font-display)', color: rank <= 10 ? 'var(--accent)' : 'var(--text-primary)' }}>#{rank}</td>
      <td className="lb-td">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: avColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.68rem', fontWeight: 800, color: '#fff', flexShrink: 0, boxShadow: isMe ? '0 0 0 2px var(--accent)' : 'none' }}>
            {(user.displayName || '??').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.displayName || 'Anonymous'}
              {isMe && <span style={{ marginLeft: 4, fontSize: '.56rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(0,230,118,.07)', padding: '2px 6px', borderRadius: 4 }}>YOU</span>}
            </div>
            <div style={{ fontSize: '.56rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>{user.predictions || 0} predictions</div>
          </div>
        </div>
      </td>
      <td className="lb-td"><AccBar value={user.accuracy || 0} delay={delay + 60} /></td>
      <td className="lb-td r" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: '#a855f7', fontSize: '.88rem' }}>{user.points || 0}</td>
      <td className="lb-td r" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '.78rem' }}>{user.predictions || 0}</td>
      <td className="lb-td r" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: exactColor, fontSize: '.78rem' }}>{user.exact || 0}</td>
    </tr>
  );
});

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function Leaderboard() {
  const { user: currentUser } = useAuth();
  const uid = currentUser?.uid;
  const nav = useNavigate();
  const searchRef = useRef(null);

  const appData = useAppData();
  
  const [tab, setTab] = useState(PERIOD.DAILY);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showCount, setShowCount] = useState(15);

  // Local instant data
  const [allUserPreds, setAllUserPreds] = useState([]);
  const [liveFixtures, setLiveFixtures] = useState([]);

  const deferredSearch = useDeferredValue(search);
  const isDaily = tab === PERIOD.DAILY;

  // 1. Fetch ALL user predictions for today directly from Firestore
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'user_predictions'), where('matchDate', '==', todayStr()));
    const unsub = onSnapshot(q, snap => {
      const preds = snap.docs.map(d => d.data());
      
      // ★ AIRTIGHT BAILOUT: Prevents state update if document contents haven't changed
      setAllUserPreds(prev => {
        if (prev.length !== preds.length) return preds;
        let changed = false;
        for (let i = 0; i < preds.length; i++) {
          if (prev[i]?.predId !== preds[i]?.predId || prev[i]?.homeScore !== preds[i]?.homeScore || prev[i]?.awayScore !== preds[i]?.awayScore) {
            changed = true; break;
          }
        }
        return changed ? preds : prev;
      });
    }, () => {});
    return () => unsub();
  }, []);

  // 2. Subscribe to LIVE FIXTURES globally (Zero-Jank, Visibility Aware)
  useEffect(() => {
    const unsub = subscribeToLiveFixtures(({ matches }) => {
      if (!matches) return;
      setLiveFixtures(prev => {
        if (prev.length !== matches.length) return matches;
        let changed = false;
        for (let i = 0; i < matches.length; i++) {
          if (prev[i].homeScore !== matches[i].homeScore || prev[i].awayScore !== matches[i].awayScore || prev[i].status !== matches[i].status || prev[i].minute !== matches[i].minute) {
            changed = true; break;
          }
        }
        return changed ? matches : prev; 
      });
    });
    return () => unsub();
  }, []);

  // Trigger fetch for historical tabs if not already loaded
  useEffect(() => {
    if (!isDaily && !appData.historicalLeaderboards?.[tab] && appData.loadHistoricalLeaderboard) {
      appData.loadHistoricalLeaderboard(tab);
    }
  }, [tab, isDaily, appData]);

  const historicalData = !isDaily ? (appData.historicalLeaderboards?.[tab] || null) : null;
  const isLoadingHistorical = !isDaily && !historicalData;
  const isStale = !isDaily && historicalData ? (historicalData.stale ?? true) : false;

  // ★ INSTANT DAILY CALCULATION
  const localDailyEntries = useMemo(() => {
    if (allUserPreds.length === 0) return [];
    
    const matchesMap = new Map();
    (appData.activePredictions || []).forEach(p => matchesMap.set(String(p.matchId), p));
    
    liveFixtures.forEach(f => {
      const matchId = String(f.id);
      const existing = matchesMap.get(matchId);
      if (existing) {
        matchesMap.set(matchId, {
          ...existing,
          status: f.status || existing.status,
          homeScore: f.homeScore ?? existing.homeScore,
          awayScore: f.awayScore ?? existing.awayScore,
          isLive: f.isLive || existing.isLive,
          isFinished: f.isFinished || existing.isFinished,
        });
      }
    });
    
    const userMap = new Map();
    allUserPreds.forEach(p => {
      if (!userMap.has(p.userId)) {
        userMap.set(p.userId, {
          uid: p.userId,
          displayName: p.displayName || 'Anonymous',
          points: 0, exact: 0, result: 0, miss: 0, predictions: 0, correctPreds: 0
        });
      }
      const u = userMap.get(p.userId);
      u.predictions++;
      
      const match = matchesMap.get(String(p.matchId));
      if (match && isFinishedStatus(match.status, SPORT.FOOTBALL) && match.homeScore != null) {
        const r = calcPoints(p.homeScore, p.awayScore, match.homeScore, match.awayScore);
        if (r.type !== 'pending') {
          u.points += r.points;
          if (r.type === 'exact') { u.exact++; u.correctPreds++; }
          else if (r.type === 'result') { u.result++; u.correctPreds++; }
          else { u.miss++; }
        }
      }
    });
    
    const entries = Array.from(userMap.values()).map(u => ({
      ...u,
      accuracy: u.predictions > 0 ? Math.round((u.correctPreds / u.predictions) * 100) : 0
    }));
    
    entries.sort((a, b) => b.points - a.points || b.exact - a.exact || b.accuracy - a.accuracy);
    entries.forEach((u, i) => { u.rank = i + 1; });
    
    return entries;
  }, [allUserPreds, appData.activePredictions, liveFixtures]);

  // ★ MERGE LOGIC
  const entries = useMemo(() => {
    if (isDaily) {
      return localDailyEntries.length > 0 ? localDailyEntries : (appData.dailyEntries || []);
    }
    
    const histEntries = historicalData?.entries || [];
    const todayEntries = localDailyEntries;
    
    if (!isStale) return histEntries;
    
    const map = new Map();
    histEntries.forEach(e => map.set(e.uid, { ...e }));
    
    todayEntries.forEach(today => {
      const hist = map.get(today.uid);
      if (hist) {
        const newPreds = (hist.predictions || 0) + (today.predictions || 0);
        const histAccPreds = (hist.accuracy || 0) / 100 * (hist.predictions || 0);
        const todayAccPreds = (today.accuracy || 0) / 100 * (today.predictions || 0);
        const newAcc = newPreds > 0 ? Math.round((histAccPreds + todayAccPreds) / newPreds * 100) : 0;
        
        map.set(today.uid, {
          ...hist,
          points: (hist.points || 0) + (today.points || 0),
          exact: (hist.exact || 0) + (today.exact || 0),
          predictions: newPreds,
          accuracy: newAcc
        });
      } else {
        map.set(today.uid, { ...today });
      }
    });
    
    const merged = Array.from(map.values());
    merged.sort((a, b) => (b.points || 0) - (a.points || 0));
    merged.forEach((u, i) => { u.rank = i + 1; });
    
    return merged;
  }, [isDaily, localDailyEntries, appData.dailyEntries, historicalData, isStale]);

  // ★ MERGE STATS
  const stats = useMemo(() => {
    if (isDaily) {
      const list = localDailyEntries.length > 0 ? localDailyEntries : (appData.dailyEntries || []);
      const players = list.length;
      const preds = list.reduce((sum, e) => sum + (e.predictions || 0), 0);
      const exact = list.reduce((sum, e) => sum + (e.exact || 0), 0);
      const avgAcc = players > 0 ? (list.reduce((sum, e) => sum + (e.accuracy || 0), 0) / players).toFixed(1) : '0.0';
      return { players, preds, exact, avg: avgAcc };
    }
    
    const histStats = historicalData?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 };
    if (!isStale) return histStats;
    
    const todayList = localDailyEntries;
    const todayStats = {
      players: todayList.length,
      preds: todayList.reduce((s, e) => s + (e.predictions || 0), 0),
      exact: todayList.reduce((s, e) => s + (e.exact || 0), 0),
      avg: todayList.length > 0 ? (todayList.reduce((s, e) => s + (e.accuracy || 0), 0) / todayList.length) : 0
    };
    
    const totalPlayers = entries.length; 
    const totalPreds = (histStats.preds || 0) + (todayStats.preds || 0);
    const totalExact = (histStats.exact || 0) + (todayStats.exact || 0);
    const avg = totalPreds > 0 ? (((histStats.avg || 0) * (histStats.preds || 0) + (parseFloat(todayStats.avg) || 0) * (todayStats.preds || 0)) / totalPreds) : 0;
    
    return { players: totalPlayers, preds: totalPreds, exact: totalExact, avg: avg.toFixed(1) };
  }, [isDaily, localDailyEntries, appData.dailyEntries, historicalData, isStale, entries]);

  const loading = isDaily ? appData.loading : isLoadingHistorical;
  const error = isDaily ? null : (historicalData?.error || null);

  const myEntry = useMemo(() => {
    if (!uid) return null;
    return entries.find(u => u.uid === uid) || null;
  }, [entries, uid]);

  const filtered = useMemo(() => {
    if (!deferredSearch.trim()) return entries;
    const q = deferredSearch.toLowerCase();
    return entries.filter(u => (u.displayName || '').toLowerCase().includes(q));
  }, [entries, deferredSearch]);

  const filteredTop3 = useMemo(() => filtered.slice(0, 3), [filtered]);
  const filteredRest = useMemo(() => filtered.slice(3), [filtered]);
  const visibleRest = useMemo(() => filteredRest.slice(0, showCount - 3), [filteredRest, showCount]);
  const hasMore = filteredRest.length > showCount - 3;

  const handleClear = useCallback(() => { setSearch(''); searchRef.current?.focus(); }, []);
  const handleTabChange = useCallback((t) => { 
    startTransition(() => { setTab(t); setShowCount(15); setSearch(''); }); 
  }, []);

  const tabDesc = useMemo(() => {
    const descriptions = {
      daily: "Today's top predictors",
      weekly: 'Monday – Sunday rankings',
      monthly: 'This month\'s top predictors',
      goat: 'Greatest of All Time',
    };
    return descriptions[tab] || '';
  }, [tab]);

  const handleRefresh = useCallback(() => {
    if (appData.refresh) appData.refresh({ invalidateCache: true, includeUserData: true });
    else window.location.reload();
  }, [appData]);

  return (
    <div className="lb-page">
      <SEO
        title="Football Prediction Leaderboard | ZOKASCORE"
        description="Compete with football fans, climb the leaderboard, and view the best prediction rankings on ZOKASCORE."
        keywords="football leaderboard, prediction rankings, ZOKASCORE"
        path="/leaderboard"
        robots="index,follow"
      />

      <div className="lb-hdr">
        <div className="lb-wrap">
          <div className="lb-hdr-inner">
            <button className="lb-hdr-btn" onClick={() => nav('/predictions')}><ArrowLeft size={12} /> Predictions</button>
            <div className="lb-hdr-title"><Trophy size={14} /> Leaderboard{!loading && entries.length > 0 && <span className="lb-live" />}</div>
          </div>
        </div>
      </div>

      <div className="lb-wrap">
        <div className="lb-title">
          <div className="lb-title-icon"><Trophy size={24} style={{ color: 'var(--gold)' }} /></div>
          <h1>Leaderboard</h1>
          <p>{tabDesc}</p>
        </div>

        {myEntry && !loading && (
          <div className={`lb-my${myEntry.rank <= 3 ? ' top' : ''}`}>
            <div className="lb-my-icon" style={{ background: myEntry.rank <= 3 ? 'rgba(245,197,66,.08)' : 'rgba(168,85,247,.06)', border: myEntry.rank <= 3 ? '1.5px solid rgba(245,197,66,.18)' : '1.5px solid rgba(168,85,247,.12)', color: myEntry.rank <= 3 ? 'var(--gold)' : '#a855f7' }}>
              {myEntry.rank <= 3 ? <Crown size={20} /> : <span style={{ fontSize: '1rem', fontWeight: 900, fontFamily: 'var(--font-display)' }}>#{myEntry.rank}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Your {PERIOD_LABEL[tab] || tab} Rank</div>
              <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 1 }}>{myEntry.points} pts · {myEntry.exact || 0} exact · {myEntry.accuracy || 0}%</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}>
              <div className="lb-my-pts">{myEntry.points}</div>
              <div style={{ fontSize: '.54rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.04em' }}>Points</div>
            </div>
          </div>
        )}

        {error && <ErrorState error={error} onRetry={() => setTab(tab)} />}

        {!error && (
          <>
            <TabBar tabs={TABS} active={tab} onChange={handleTabChange} />

            {isStale && !loading && localDailyEntries.length > 0 && (
              <div style={{ textAlign: 'center', marginBottom: 12, fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span className="lb-live" /> Merging live daily results...
              </div>
            )}

            <div className="lb-stats">
              <StatCard icon={<Flame size={16} />} label="Top Score" value={entries[0] ? `${entries[0].points} pts` : '–'} color="var(--gold)" bg="rgba(245,197,66,.05)" delay={0} />
              <StatCard icon={<Users size={16} />} label="Players" value={stats.players || 0} color="#60a5fa" bg="rgba(59,130,246,.05)" delay={50} />
              <StatCard icon={<Target size={16} />} label="Avg Accuracy" value={`${stats.avg || '0.0'}%`} color="var(--accent)" bg="rgba(0,230,118,.04)" delay={100} />
              <StatCard icon={<Award size={16} />} label="Exact Scores" value={stats.exact || 0} color="#f97316" bg="rgba(249,115,22,.05)" delay={150} />
            </div>

            {isDaily && (
              loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 40, padding: '32px 0' }}>
                  {[0, 1, 2].map(i => <div key={i} className="lb-skel" style={{ width: 120, height: 180, borderRadius: 12, animationDelay: `${i * 70}ms` }} />)}
                </div>
              ) : filteredTop3.length >= 1 ? (
                <div className="lb-podium">{filteredTop3.slice(0, 3).map((u, i) => <PodiumUser key={u.uid} user={u} position={i} delay={i * 80} />)}</div>
              ) : (
                <div className="lb-empty" style={{ marginBottom: 40 }}>No predictions yet — be the first!</div>
              )
            )}

            {!isDaily && (
              loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
                  {[0, 1, 2].map(i => <div key={i} className="lb-skel" style={{ width: 50, height: 50, borderRadius: '50%', animationDelay: `${i * 70}ms` }} />)}
                </div>
              ) : filteredTop3.length >= 1 ? (
                <div className="lb-top3">
                  {filteredTop3.slice(0, 3).map((u, i) => {
                    const colors = ['var(--gold)', '#94a3b8', '#d97706'];
                    return (
                      <div key={u.uid} className="lb-top3-item" style={{ animationDelay: `${i * 70}ms` }}>
                        <div style={{ position: 'relative' }}>
                          {i === 0 && <Crown size={16} style={{ color: 'var(--gold)', position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)' }} />}
                          <div className="lb-top3-avatar" style={{ background: `linear-gradient(135deg,${colors[i]}25,${colors[i]}08)`, border: `2px solid ${colors[i]}`, color: colors[i], boxShadow: `0 0 16px ${colors[i]}12` }}>
                            {(u.displayName || '??').slice(0, 2).toUpperCase()}
                          </div>
                        </div>
                        <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName}</span>
                        <span style={{ fontSize: '.68rem', fontWeight: 800, color: colors[i], fontFamily: 'var(--font-display)' }}>{u.points} pts</span>
                      </div>
                    );
                  })}
                </div>
              ) : null
            )}

            <div className="lb-search-wrap">
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: searchFocused ? 'var(--accent)' : 'var(--text-muted)', transition: 'color .15s', pointerEvents: 'none', zIndex: 1 }} />
              <input ref={searchRef} type="text" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} className="lb-search" />
              {search && <button className="lb-search-clear" onClick={handleClear}><X size={11} /></button>}
            </div>
            {search.trim() && <div className="lb-search-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</div>}

            <div className="lb-table-wrap">
              <div className="lb-table-scroll">
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th className="lb-th" style={{ width: 48 }}>Rank</th>
                      <th className="lb-th">Player</th>
                      <th className="lb-th" style={{ minWidth: 95 }}>Accuracy</th>
                      <th className="lb-th r" style={{ width: 60 }}>Points</th>
                      <th className="lb-th r" style={{ width: 56 }}>Preds</th>
                      <th className="lb-th r" style={{ width: 48 }}>Exact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}><td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                            <div className="lb-skel" style={{ width: 24, height: 10, borderRadius: 3, animationDelay: `${i * 40}ms` }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                              <div className="lb-skel" style={{ width: 30, height: 30, borderRadius: 7, animationDelay: `${i * 40 + 25}ms` }} />
                              <div className="lb-skel" style={{ width: 80, height: 10, borderRadius: 3, animationDelay: `${i * 40 + 50}ms` }} />
                            </div>
                            <div className="lb-skel" style={{ width: 60, height: 8, borderRadius: 3, animationDelay: `${i * 40 + 75}ms` }} />
                          </div>
                        </td></tr>
                      ))
                    ) : visibleRest.length === 0 && !search.trim() && filteredTop3.length === 0 ? (
                      <tr><td colSpan={6} className="lb-empty" style={{ borderRadius: 0 }}>{entries.length === 0 ? 'No predictions yet — be the first!' : 'Top players shown above.'}</td></tr>
                    ) : visibleRest.length === 0 && search.trim() ? (
                      <tr><td colSpan={6} className="lb-empty" style={{ borderRadius: 0 }}>No players found matching "{deferredSearch}"</td></tr>
                    ) : (
                      visibleRest.map((user, i) => {
                        const rank = user.rank || (entries.findIndex(e => e.uid === user.uid) + 1);
                        const isMe = uid === user.uid;
                        const delay = Math.min(i * 25, 250);
                        return <LeaderboardRow key={user.uid} user={user} rank={rank} isMe={isMe} delay={delay} />;
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {hasMore && !loading && (
              <button className="lb-more" onClick={() => setShowCount(p => Math.min(p + 15, 200))}>
                <ChevronDown size={12} /> Show more ({filteredRest.length - visibleRest.length} remaining)
              </button>
            )}

            {entries.length === 0 && !loading && !error && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <button className="lb-refresh" onClick={handleRefresh}><RotateCcw size={12} /> Refresh</button>
              </div>
            )}

            {entries.length > 0 && (
              <div style={{ textAlign: 'center', marginTop: 20, padding: '16px 0' }}>
                <button className="lb-cta" onClick={() => nav('/predictions')}><Target size={14} /> Make Predictions <ChevronRight size={13} /></button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}