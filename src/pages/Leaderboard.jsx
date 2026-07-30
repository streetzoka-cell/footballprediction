import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, startTransition, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Trophy, TrendingUp, Target, BarChart3,
  X, Crown, Flame, AlertCircle, ShieldAlert, Users,
  Calendar, Award, ChevronDown, RotateCcw, ChevronRight, ArrowLeft, ArrowUp, ArrowDown
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useDailyLeaderboard, useWeeklyLeaderboard, useMonthlyLeaderboard, useGoatLeaderboard } from '../hooks/useUserData';
import { PERIOD, PERIOD_LABEL } from '../utils/constants';
import { todayStr } from '../utils/dates';
import SEO from '../components/SEO';
import { ListSkeleton, ErrorState } from '../components/StateFeedback';
import EmptyState from '../components/EmptyState';

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
  
  const name = user.displayName || 'Player';
  
  return (
    <div className="lb-pod-u" style={{ order: c.order, animation: `lb-pop .4s ${SPRING} ${(delay || 0) + 150}ms both` }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6, position: 'relative' }}>
        {position === 0 && (
          <div style={{ color: 'var(--gold)', marginBottom: -2, filter: 'drop-shadow(0 0 5px rgba(245,197,66,.3))', animation: 'lb-crown 3s ease-in-out infinite' }}>
            <Crown size={20} />
          </div>
        )}
        <div className="lb-pod-avatar" style={{ width: c.avatar, height: c.avatar, background: `linear-gradient(135deg,${c.border}25,${c.border}08)`, border: `3px solid ${c.border}`, fontSize: c.font, color: c.text, boxShadow: c.shadow }}>
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="lb-pod-name">{name}</div>
        <div className="lb-pod-sub">
          {user.points || 0} pts · {user.accuracy || 0}% {user.streak > 0 && `· 🔥 ${user.streak}`}
        </div>
      </div>
      <div className="lb-pod-bar" style={{ height: c.h, background: c.bg, animationDelay: `${(delay || 0) + 300}ms` }}>
        <div className="lb-pod-num" style={{ color: c.text }}>#{position + 1}</div>
      </div>
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

// ★ Smart Leaderboard Row with Streak & Trend
const LeaderboardRow = memo(function LeaderboardRow({ user, rank, isMe, delay, prevRank }) {
  const avColor = AVATAR_COLORS[(rank - 1) % AVATAR_COLORS.length];
  const exactColor = (user.exact || 0) >= 15 ? 'var(--accent)' : (user.exact || 0) >= 10 ? 'var(--gold)' : 'var(--text-primary)';
  
  const trend = prevRank ? prevRank - rank : 0; // Positive means moved up
  const name = user.displayName || 'Anonymous';

  return (
    <tr className={`lb-row${isMe ? ' me' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <td className="lb-td" style={{ fontWeight: 800, fontFamily: 'var(--font-display)', color: rank <= 10 ? 'var(--accent)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        #{rank}
        {trend > 0 && <span style={{ color: 'var(--accent)', fontSize: '0.6rem', display: 'flex', alignItems: 'center' }}><ArrowUp size={10} />{trend}</span>}
        {trend < 0 && <span style={{ color: '#ef4444', fontSize: '0.6rem', display: 'flex', alignItems: 'center' }}><ArrowDown size={10} />{Math.abs(trend)}</span>}
      </td>
      <td className="lb-td">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: avColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.68rem', fontWeight: 800, color: '#fff', flexShrink: 0, boxShadow: isMe ? '0 0 0 2px var(--accent)' : 'none' }}>
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
              {name}
              {isMe && <span style={{ fontSize: '.56rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(0,230,118,.07)', padding: '2px 6px', borderRadius: 4 }}>YOU</span>}
              {user.streak > 2 && <span style={{ fontSize: '.6rem', color: '#ef4444' }}>🔥 {user.streak}</span>}
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

export default function Leaderboard() {
  const auth = useAuth() || {};
  const currentUser = auth.currentUser || auth.user;
  const uid = currentUser?.uid;
  
  const nav = useNavigate();
  const searchRef = useRef(null);

  const { data: dailyLB = null, isLoading: loadingDaily } = useDailyLeaderboard(todayStr());
  const { data: weeklyLB = null, isLoading: loadingWeekly } = useWeeklyLeaderboard();
  const { data: monthlyLB = null, isLoading: loadingMonthly } = useMonthlyLeaderboard();
  const { data: goatLB = null, isLoading: loadingGoat } = useGoatLeaderboard();
  
  const [tab, setTab] = useState(PERIOD.DAILY);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showCount, setShowCount] = useState(15);

  const deferredSearch = useDeferredValue(search);

  const activeLB = useMemo(() => {
    if (tab === PERIOD.WEEKLY) return weeklyLB;
    if (tab === PERIOD.MONTHLY) return monthlyLB;
    if (tab === PERIOD.GOAT) return goatLB;
    return dailyLB;
  }, [tab, weeklyLB, monthlyLB, goatLB, dailyLB]);

  const entries = useMemo(() => activeLB?.entries || [], [activeLB]);
  const stats = useMemo(() => activeLB?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 }, [activeLB]);
  
  const loading = useMemo(() => {
    if (tab === PERIOD.WEEKLY) return loadingWeekly;
    if (tab === PERIOD.MONTHLY) return loadingMonthly;
    if (tab === PERIOD.GOAT) return loadingGoat;
    return loadingDaily;
  }, [tab, loadingWeekly, loadingMonthly, loadingGoat, loadingDaily]);

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
    window.location.reload();
  }, []);

  return (
    <div className="lb-page">
      <SEO
        title="Football Prediction Leaderboard | ZOKASCORE"
        description="Compete with football fans, climb the leaderboard, and view the best prediction rankings on ZOKASCORE."
        keywords="football leaderboard, prediction rankings, ZOKASCORE"
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
              <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 1 }}>
                {myEntry.points} pts · {myEntry.exact || 0} exact · {myEntry.accuracy || 0}% {myEntry.streak > 0 && `· 🔥 ${myEntry.streak}`}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}>
              <div className="lb-my-pts">{myEntry.points}</div>
              <div style={{ fontSize: '.54rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.04em' }}>Points</div>
            </div>
          </div>
        )}

        <>
          <TabBar tabs={TABS} active={tab} onChange={handleTabChange} />

          <div className="lb-stats">
            <StatCard icon={<Flame size={16} />} label="Top Score" value={entries[0] ? `${entries[0].points} pts` : '–'} color="var(--gold)" bg="rgba(245,197,66,.05)" delay={0} />
            <StatCard icon={<Users size={16} />} label="Players" value={stats.players || 0} color="#60a5fa" bg="rgba(59,130,246,.05)" delay={50} />
            <StatCard icon={<Target size={16} />} label="Avg Accuracy" value={`${stats.avg || '0.0'}%`} color="var(--accent)" bg="rgba(0,230,118,.04)" delay={100} />
            <StatCard icon={<Award size={16} />} label="Exact Scores" value={stats.exact || 0} color="#f97316" bg="rgba(249,115,22,.05)" delay={150} />
          </div>

          {loading ? (
             <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 40, padding: '32px 0' }}>
               {[0, 1, 2].map(i => <div key={i} className="lb-skel" style={{ width: 120, height: 180, borderRadius: 12, animationDelay: `${i * 70}ms` }} />)}
             </div>
          ) : filteredTop3.length >= 1 ? (
            <div className="lb-podium">{filteredTop3.slice(0, 3).map((u, i) => <PodiumUser key={u.uid} user={u} position={i} delay={i * 80} />)}</div>
          ) : (
            <EmptyState icon={Trophy} title="No predictions yet — be the first!" />
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
                    <th className="lb-th" style={{ width: 60 }}>Rank</th>
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
                      const prevRank = user.prevRank || 0;
                      return <LeaderboardRow key={user.uid} user={user} rank={rank} isMe={isMe} delay={delay} prevRank={prevRank} />;
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

          {entries.length === 0 && !loading && (
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
      </div>
    </div>
  );
}