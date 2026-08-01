import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, startTransition, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Trophy, TrendingUp, Target, BarChart3,
  X, Crown, Flame, Users, Calendar, Award, ChevronDown, 
  RotateCcw, ChevronRight, ArrowLeft, ArrowUp, ArrowDown, Swords
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useDailyLeaderboard, useWeeklyLeaderboard, useMonthlyLeaderboard, useGoatLeaderboard } from '../hooks/useUserData';
import { PERIOD } from '../utils/constants';
import { todayStr } from '../utils/dates';
import SEO from '../components/SEO';
import EmptyState from '../components/EmptyState';

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const AVATAR_COLORS = [
  'var(--danger)', 'var(--gold)', 'var(--bronze)', 'var(--primary)', 'var(--accent)',
  'var(--accent)', 'var(--text-muted)', 'var(--text-muted)', 'var(--text-muted)', 'var(--text-muted)',
];

const PODIUM_CFG = [
  { h: 130, border: 'var(--gold)', bg: 'linear-gradient(180deg,rgba(var(--gold-rgb),.15) 0%,rgba(var(--gold-rgb),.02) 100%)', text: 'var(--gold)', avatar: 72, font: '1.25rem', shadow: '0 0 24px rgba(var(--gold-rgb),.2)', order: 2, medal: '🥇' },
  { h: 95, border: 'var(--text-muted)', bg: 'linear-gradient(180deg,rgba(var(--text-muted-rgb),.1) 0%,rgba(var(--text-muted-rgb),.01) 100%)', text: 'var(--text-muted)', avatar: 58, font: '1rem', shadow: '0 0 16px rgba(var(--text-muted-rgb),.1)', order: 1, medal: '🥈' },
  { h: 75, border: 'var(--bronze)', bg: 'linear-gradient(180deg,rgba(var(--bronze-rgb),.1) 0%,rgba(var(--bronze-rgb),.01) 100%)', text: 'var(--bronze)', avatar: 50, font: '.85rem', shadow: '0 0 12px rgba(var(--bronze-rgb),.1)', order: 3, medal: '🥉' },
];

const TABS = [
  { key: PERIOD.DAILY, label: 'Today', Icon: Calendar },
  { key: PERIOD.WEEKLY, label: 'Week', Icon: TrendingUp },
  { key: PERIOD.MONTHLY, label: 'Month', Icon: BarChart3 },
  { key: PERIOD.GOAT, label: 'G.O.A.T', Icon: Crown, isGoat: true },
];

const getBadges = (user) => {
  const badges = [];
  if ((user.exact || 0) >= 5) badges.push({ text: '🎯 Sniper', cls: 'sniper' });
  if ((user.streak || 0) >= 3) badges.push({ text: `🔥 ${user.streak}`, cls: 'streak' });
  if ((user.points || 0) >= 500) badges.push({ text: '⭐ Veteran', cls: 'vet' });
  return badges;
};

const AccuracyRing = memo(function AccuracyRing({ value, size = 32, stroke = 3, color = 'var(--primary)' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value)) / 100;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
        {value}%
      </span>
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
    <div className="lb-pod-u" style={{ order: c.order, animation: `zk-pop .4s ${SPRING} ${(delay || 0) + 150}ms both` }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6, position: 'relative' }}>
        {position === 0 && (
          <div style={{ color: 'var(--gold)', marginBottom: -2, filter: 'drop-shadow(0 0 5px rgba(var(--gold-rgb),.4))', animation: 'zk-bounce 3s ease-in-out infinite' }}>
            <Crown size={24} />
          </div>
        )}
        <div className="lb-pod-avatar" style={{ width: c.avatar, height: c.avatar, background: `linear-gradient(135deg,${c.border}25,${c.border}08)`, border: `3px solid ${c.border}`, fontSize: c.font, color: c.text, boxShadow: c.shadow }}>
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="lb-pod-medal" style={{ fontSize: '1.2rem', marginTop: -8 }}>{c.medal}</div>
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
      <div className="lb-tab-ind" style={{ left: ind.left, width: ind.width, background: isGoat ? 'rgba(0,0,0,.15)' : 'var(--gold)', boxShadow: isGoat ? 'none' : '0 0 8px rgba(var(--gold-rgb),.3)' }} />
    </div>
  );
});

const LeaderboardRow = memo(function LeaderboardRow({ user, rank, isMe, delay, prevRank }) {
  const avColor = AVATAR_COLORS[(rank - 1) % AVATAR_COLORS.length];
  const trend = prevRank ? prevRank - rank : 0;
  const name = user.displayName || 'Anonymous';
  const badges = getBadges(user);

  let rowCls = 'lb-row';
  if (isMe) rowCls += ' me';
  if (trend > 0) rowCls += ' moved-up';
  if (trend < 0) rowCls += ' moved-down';

  return (
    <div className={rowCls} style={{ animationDelay: `${delay}ms` }}>
      <div className="lb-row-rank" style={{ color: rank <= 10 ? 'var(--primary)' : 'var(--text-primary)' }}>
        #{rank}
        {trend > 0 && <span className="trend-up"><ArrowUp size={10} />{trend}</span>}
        {trend < 0 && <span className="trend-down"><ArrowDown size={10} />{Math.abs(trend)}</span>}
      </div>
      
      <div className="lb-row-user">
        <div className="lb-row-avatar" style={{ background: avColor, boxShadow: isMe ? '0 0 0 2px var(--primary)' : 'none' }}>
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="lb-row-info">
          <div className="lb-row-name">
            {name} 
            {isMe && <span className="lb-you-badge">YOU</span>}
          </div>
          <div className="lb-row-badges">
            {badges.map((b, i) => <span key={i} className={`lb-badge ${b.cls}`}>{b.text}</span>)}
            <span className="lb-row-preds">{user.predictions || 0} preds</span>
          </div>
        </div>
      </div>

      <div className="lb-row-acc">
        <AccuracyRing value={user.accuracy || 0} size={32} stroke={3} color={(user.accuracy || 0) >= 70 ? 'var(--primary)' : (user.accuracy || 0) >= 40 ? 'var(--gold)' : 'var(--danger)'} />
      </div>

      <div className="lb-row-pts">
        <span className="val">{user.points || 0}</span>
        <span className="lbl">Points</span>
      </div>
    </div>
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

  const rivalEntry = useMemo(() => {
    if (!myEntry || myEntry.rank === 1) return null;
    return entries.find(u => u.rank === myEntry.rank - 1) || null;
  }, [entries, myEntry]);

  const pointsBehind = rivalEntry ? (rivalEntry.points - myEntry.points) : 0;

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
        title="Prediction Leaderboard & Player Rankings"
        description="Track the top prediction rankings, compare your performance, climb the leaderboard, and compete with football fans worldwide on ZOKASCORE."
        keywords="prediction leaderboard, football leaderboard, football rankings, prediction rankings, top predictors, ZOKASCORE leaderboard"
        robots="index,follow"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Leaderboard", path: "/leaderboard" }]}
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
          <div className="lb-personal-card">
            <div className="lb-pc-main">
              <div className="lb-pc-rank">
                <span className="lbl">Your Rank</span>
                <span className="val">#{myEntry.rank}</span>
              </div>
              <div className="lb-pc-stats">
                <div className="lb-pc-stat">
                  <span className="val">{myEntry.points || 0}</span>
                  <span className="lbl">Points</span>
                </div>
                <div className="lb-pc-stat">
                  <span className="val">{myEntry.exact || 0}</span>
                  <span className="lbl">Exact</span>
                </div>
                <div className="lb-pc-stat">
                  <AccuracyRing value={myEntry.accuracy || 0} size={36} stroke={3} color="var(--primary)" />
                </div>
              </div>
            </div>
            
            {rivalEntry && (
              <div className="lb-pc-rival">
                <Swords size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <span className="text">
                  <strong>{pointsBehind} pts</strong> behind <strong>{rivalEntry.displayName}</strong> (#{rivalEntry.rank})
                </span>
                <span className="cta">Catch up →</span>
              </div>
            )}
            
            {myEntry.rank === 1 && (
              <div className="lb-pc-rival champion">
                <Crown size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                <span className="text">You are the Champion! 👑</span>
              </div>
            )}
          </div>
        )}

        <>
          <TabBar tabs={TABS} active={tab} onChange={handleTabChange} />

          <div className="lb-stats">
            <StatCard icon={<Flame size={16} />} label="Top Score" value={entries[0] ? `${entries[0].points} pts` : '–'} color="var(--gold)" bg="rgba(var(--gold-rgb),.05)" delay={0} />
            <StatCard icon={<Users size={16} />} label="Players" value={stats.players || 0} color="var(--accent)" bg="rgba(var(--accent-rgb),.05)" delay={50} />
            <StatCard icon={<Target size={16} />} label="Avg Accuracy" value={`${stats.avg || '0.0'}%`} color="var(--primary)" bg="rgba(var(--primary-rgb),.04)" delay={100} />
            <StatCard icon={<Award size={16} />} label="Exact Scores" value={stats.exact || 0} color="var(--gold)" bg="rgba(var(--gold-rgb),.05)" delay={150} />
          </div>

          {loading ? (
             <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 40, padding: '32px 0' }}>
               {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ width: 120, height: 180, borderRadius: 12, animationDelay: `${i * 70}ms` }} />)}
             </div>
          ) : filteredTop3.length >= 1 ? (
            <div className="lb-podium">{filteredTop3.slice(0, 3).map((u, i) => <PodiumUser key={u.uid} user={u} position={i} delay={i * 80} />)}</div>
          ) : (
            <EmptyState icon={Trophy} title="No predictions yet — be the first!" />
          )}

          <div className="lb-search-wrap">
            <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: searchFocused ? 'var(--primary)' : 'var(--text-muted)', transition: 'color .15s', pointerEvents: 'none', zIndex: 1 }} />
            <input ref={searchRef} type="text" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} className="lb-search" />
            {search && <button className="lb-search-clear" onClick={handleClear}><X size={11} /></button>}
          </div>
          {search.trim() && <div className="lb-search-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</div>}

          <div className="lb-list">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ width: '100%', height: 60, borderRadius: 12, animationDelay: `${i * 40}ms` }} />
              ))
            ) : visibleRest.length === 0 && !search.trim() && filteredTop3.length === 0 ? (
              <div className="lb-empty">{entries.length === 0 ? 'No predictions yet — be the first!' : 'Top players shown above.'}</div>
            ) : visibleRest.length === 0 && search.trim() ? (
              <div className="lb-empty">No players found matching "{deferredSearch}"</div>
            ) : (
              visibleRest.map((user, i) => {
                const rank = user.rank || (entries.findIndex(e => e.uid === user.uid) + 1);
                const isMe = uid === user.uid;
                const delay = Math.min(i * 25, 250);
                const prevRank = user.prevRank || 0;
                return <LeaderboardRow key={user.uid} user={user} rank={rank} isMe={isMe} delay={delay} prevRank={prevRank} />;
              })
            )}
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