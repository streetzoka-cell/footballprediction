import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, X, Star, Volume2, VolumeX, Clock, Trophy, Users,
  Pause, Flag, Zap, ChevronRight, ChevronDown,
  RefreshCw, Calendar, Activity, Plus, Minus, Pin, TrendingUp, Flame, Loader, Camera
} from 'lucide-react';

import { useFixtures, useLiveMatches, useStandings, useTeams } from '../hooks/useFixtures';
import { useQueryClient } from '@tanstack/react-query';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { getLocalDateStr, formatDateShort, todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';

import { buildMatchRoute, buildLeagueRoute } from '../utils/routes';
import { Sound } from '../utils/soundEngine';
import SEO from '../components/SEO';
import { ListSkeleton, ErrorState } from '../components/StateFeedback';
import EmptyState from '../components/EmptyState';

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);

// Sound Engine
const CMT = {
  goal:["GOOOAL! Pure strike!","Back of the net!","Zoka magic!"],
  ft:["Full Time!","Final Whistle!"],
  ht:["Half Time!","HT Break."],
  kickoff:["Kick Off!","We're underway!"],
};
const pick = (a) => a[Math.floor(Math.random()*a.length)];

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const add = useCallback(t => {
    const id = ++idRef.current;
    setToasts(p => [...p.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), t.dur || 3500);
    return id;
  }, []);
  return { toasts, add };
}

const ToastContainer = React.memo(({ toasts }) => {
  if (!toasts.length) return null;
  return (
    <div className="zoka-toast-wrap">
      {toasts.map(t => {
        const isGoal = t.type === 'goal';
        let bg = isGoal ? 'linear-gradient(135deg,rgba(239,68,68,.9),rgba(185,28,28,.85))' : 'linear-gradient(135deg,rgba(16,185,129,.9),rgba(5,150,105,.85))';
        let icon = isGoal ? '⚽' : '🏁';
        return (
          <div key={t.id} className="zoka-toast" style={{ background: bg }}>
            <div className="zoka-toast-inner">
              <span className="zoka-toast-icon">{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="zoka-toast-title">{isGoal ? 'GOAL!' : t.st === 'ft' ? 'FULL TIME' : 'LIVE ACTION'}</div>
                {t.msg && <div className="zoka-toast-msg">{t.msg}</div>}
                {t.detail && <div className="zoka-toast-detail">{t.detail}</div>}
              </div>
              {t.score && <div className="zoka-toast-score">{t.score}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
});

const TOP_TEAMS_LIST = [
  'manchester united', 'manchester city', 'liverpool', 'chelsea', 'arsenal', 'tottenham hotspur', 'tottenham',
  'real madrid', 'barcelona', 'atletico madrid', 'athletic bilbao', 'sevilla', 'valencia',
  'bayern munich', 'borussia dortmund', 'rb leipzig', 'bayer leverkusen',
  'paris saint germain', 'psg', 'marseille', 'lyon',
  'juventus', 'inter', 'ac milan', 'napoli', 'roma', 'lazio', 'atalanta',
  'benfica', 'porto', 'sporting cp', 'ajax', 'psv eindhoven', 'feyenoord',
  'celtic', 'rangers', 'flamengo', 'palmeiras', 'corinthios', 'sao paulo',
  'boca juniors', 'river plate'
];
const TOP_TEAMS_SET = new Set(TOP_TEAMS_LIST);

const sortMatches = (a, b) => {
  if (a.isLive && !b.isLive) return -1;
  if (!a.isLive && b.isLive) return 1;
  if (a.isHT && !b.isHT) return -1;
  if (!a.isHT && b.isHT) return 1;
  if (a.isFinished && !b.isFinished) return 1;
  if (!a.isFinished && b.isFinished) return -1;
  return (a.timestamp || 0) - (b.timestamp || 0);
};

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const matchQ = (m, terms) => [m.homeName, m.awayName, m.leagueName].map(norm).some(x => x && terms.every(t => x.includes(t)));

export default function Fixtures() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || todayStr());
  const { data: rawFixtures = [], isLoading: fixturesLoading, error: fixturesError } = useFixtures(selectedDate);
  const { data: rawLive = [] } = useLiveMatches();
  const queryClient = useQueryClient();
  const { toasts, add: addToast } = useToasts();
  
  const { soundEnabled, favorites, pinnedLeagues, toggleSound, toggleFavorite, togglePinnedLeague } = usePreferencesStore();
  const isFav = useCallback(id => favorites.includes(String(id)), [favorites]);
  const isPinned = useCallback(name => pinnedLeagues.includes(name), [pinnedLeagues]);

  const [tab, setTab] = useState(searchParams.get('tab') || 'fixtures');
  const [compFilter, setCompFilter] = useState(searchParams.get('league') || 'ALL');
  const [searchQ, setSearchQ] = useState('');
  const [ui, setUI] = useState({ moreDatesOpen: false, leagueFilterOpen: false, showLiveOnly: false, showAllTopMatches: false, showAllLiveMatches: false });
  const toggleUI = useCallback((key) => setUI(prev => ({ ...prev, [key]: !prev[key] })), []);

  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const { data: standingsData = null, isLoading: standingsLoading } = useStandings(selectedLeagueId);
  const { data: teamsData = [], isLoading: teamsLoading } = useTeams(selectedLeagueId);

  const [expandedLeagues, setExpandedLeagues] = useState(new Set());
  const [fontScale, setFontScale] = useState(1);
  const moreRef = useRef(null);

  const allFixtures = useMemo(() => {
    const map = new Map();
    rawFixtures.forEach(m => { if (m) map.set(String(m.id), m); });
    rawLive.forEach(m => {
      if (!m) return;
      const existing = map.get(String(m.id));
      if (existing) map.set(String(m.id), { ...existing, ...m });
      else if (m.dateStr === selectedDate) map.set(String(m.id), m);
    });
    return Array.from(map.values());
  }, [rawFixtures, rawLive, selectedDate]);

  const liveMatches = useMemo(() => allFixtures.filter(m => m.isLive), [allFixtures]);

  // Goal/Status Notifications
  const prevScores = useRef(new Map());
  useEffect(() => {
    liveMatches.forEach(m => {
      const id = String(m.id);
      const prev = prevScores.current.get(id);
      if (prev) {
        if (m.homeScore != null && prev.h != null && m.homeScore > prev.h) {
          if (Sound.on) Sound.goal();
          addToast({ type: 'goal', msg: pick(CMT.goal), detail: m.homeName, score: `${m.homeScore}–${m.awayScore}`, dur: 3500 });
        }
        if (m.awayScore != null && prev.a != null && m.awayScore > prev.a) {
          if (Sound.on) Sound.goal();
          addToast({ type: 'goal', msg: pick(CMT.goal), detail: m.awayName, score: `${m.homeScore}–${m.awayScore}`, dur: 3500 });
        }
      }
      prevScores.current.set(id, { h: m.homeScore, a: m.awayScore });
    });
  }, [liveMatches, addToast]);

  useEffect(() => { Sound.on = soundEnabled; }, [soundEnabled]);

  useEffect(() => {
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setUI(prev => ({ ...prev, moreDatesOpen: false })); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isPrimaryDate = [yesterdayStr(), todayStr(), tomorrowStr()].includes(selectedDate);

  useEffect(() => {
    const params = {};
    if (tab !== 'fixtures') params.tab = tab;
    if (selectedDate !== todayStr()) params.date = selectedDate;
    if (compFilter !== 'ALL') params.league = compFilter;
    setSearchParams(params, { replace: true });
  }, [tab, selectedDate, compFilter, setSearchParams]);

  const dates = useMemo(() => {
    const past = []; for (let i = 14; i >= 2; i--) { const d = getLocalDateStr(-i); past.push({ str: d, label: formatDateShort(d) }); }
    const future = []; for (let i = 2; i <= 15; i++) { const d = getLocalDateStr(i); future.push({ str: d, label: formatDateShort(d) }); }
    return { past, future };
  }, []);

  const leaguePriorityMap = useMemo(() => ({ 'FIFA World Cup': 1, 'UEFA Champions League': 2, 'UEFA Europa League': 3, 'UEFA Conference League': 4, 'Premier League': 5, 'La Liga': 6, 'Serie A': 7, 'Bundesliga': 8, 'Ligue 1': 9, 'Primeira Liga': 10, 'Eredivisie': 11, 'Süper Lig': 12, 'Championship': 13 }), []);

  const [timeFilter, setTimeFilter] = useState('all');

  const displayFixtures = useMemo(() => {
    let list = allFixtures;
    if (compFilter !== 'ALL') list = list.filter(m => String(m.leagueName) === compFilter);
    if (timeFilter === 'live') list = list.filter(m => m.isLive);
    else if (timeFilter === 'finished') list = list.filter(m => m.isFinished);
    if (ui.showLiveOnly) list = list.filter(m => m.isLive);
    if (searchQ.trim()) { const terms = searchQ.trim().toLowerCase().split(/\s+/).filter(Boolean); if (terms.length) list = list.filter(m => matchQ(m, terms)); }
    return list; 
  }, [allFixtures, compFilter, ui.showLiveOnly, searchQ, timeFilter]);

  const topMatches = useMemo(() => {
    return allFixtures.filter(m => {
      const home = norm(m.homeName); const away = norm(m.awayName);
      const isTopHome = [...TOP_TEAMS_SET].some(t => home.includes(t));
      const isTopAway = [...TOP_TEAMS_SET].some(t => away.includes(t));
      return isTopHome || isTopAway;
    }).sort(sortMatches); 
  }, [allFixtures]);

  const visibleTopMatches = ui.showAllTopMatches ? topMatches : topMatches.slice(0, 2);
  const hiddenTopCount = topMatches.length - 2;
  const topMatchIds = useMemo(() => new Set(topMatches.map(m => String(m.id))), [topMatches]);

  const grouped = useMemo(() => {
    const map = new Map();
    displayFixtures.forEach(m => {
      if (favorites.includes(String(m.id))) return;
      if (topMatchIds.has(String(m.id))) return;
      const key = m.leagueName || 'Other';
      if (!map.has(key)) map.set(key, { name: key, logo: m.leagueLogo, id: m.leagueId, matches: [] });
      map.get(key).matches.push(m);
    });
    map.forEach(g => g.matches.sort(sortMatches));
    return [...map.values()].sort((a, b) => {
      const pA = pinnedLeagues.includes(a.name) ? 0 : 1; const pB = pinnedLeagues.includes(b.name) ? 0 : 1;
      if (pA !== pB) return pA - pB;
      const lA = leaguePriorityMap[a.name] ?? 99; const lB = leaguePriorityMap[b.name] ?? 99;
      if (lA !== lB) return lA - lB;
      return a.name.localeCompare(b.name);
    });
  }, [displayFixtures, favorites, leaguePriorityMap, pinnedLeagues, topMatchIds]);

  const { topLeagues, otherLeagues } = useMemo(() => {
    return { topLeagues: grouped.slice(0, 5).map(g => ({...g, isTop: true})), otherLeagues: grouped.slice(5).map(g => ({...g, isTop: false})) };
  }, [grouped]);

  const toggleLeagueExpand = useCallback((leagueName) => { setExpandedLeagues(prev => { const n = new Set(prev); if (n.has(leagueName)) n.delete(leagueName); else n.add(leagueName); return n; }); }, []);

  const availableLeagues = useMemo(() => {
    const map = new Map();
    allFixtures.forEach(m => {
      if (!map.has(m.leagueId)) {
        map.set(m.leagueId, { id: m.leagueId, name: m.leagueName, emblem: m.leagueLogo });
      }
    });
    return Array.from(map.values()).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [allFixtures]);

  const liveCount = useMemo(() => allFixtures.filter(m => m.isLive).length, [allFixtures]);
  const favMatches = useMemo(() => displayFixtures.filter(m => favorites.includes(String(m.id))), [displayFixtures, favorites]);
  const visibleLiveMatches = ui.showAllLiveMatches ? liveMatches : liveMatches.slice(0, 5);
  const hiddenLiveCount = liveMatches.length - 5;

  const handleRefresh = useCallback(async () => { 
    queryClient.invalidateQueries(['fixtures', selectedDate]);
    queryClient.invalidateQueries(['liveMatches']);
  }, [queryClient, selectedDate]);

  const currentLeagueEmblem = useMemo(() => { if (compFilter === 'ALL') return null; return displayFixtures.find(m => m.leagueName === compFilter)?.leagueLogo || null; }, [compFilter, displayFixtures]);

  useEffect(() => {
    if ((tab === 'standings' || tab === 'teams') && !selectedLeagueId && availableLeagues.length > 0) {
      const pl = availableLeagues.find(l => l.name === 'Premier League');
      setSelectedLeagueId(pl ? pl.id : availableLeagues[0].id);
    }
  }, [tab, selectedLeagueId, availableLeagues]);

  const standingsTable = standingsData?.standings?.[0] || [];

  if (fixturesError && allFixtures.length === 0) {
    return (
      <div className="zoka-page">
        <SEO title="Football Fixtures" />
        <div className="zoka-wrap" style={{ paddingTop: '20px' }}>
          <ErrorState error={fixturesError} onRetry={handleRefresh} />
        </div>
      </div>
    );
  }

  const handleReactNow = useCallback((match) => {
    navigate('/studio/reactor', { state: { fixtureId: match.id, homeTeam: match.homeName, awayTeam: match.awayName, homeLogo: match.homeLogo, awayLogo: match.awayLogo, score: { home: match.homeScore, away: match.awayScore }, minute: match.displayMinute, competition: match.leagueName } });
  }, [navigate]);

  const renderMatchCard = (m, i) => {
    const isLive = m.isLive; 
    const isHT = m.isHT; 
    const isFt = m.isFinished; 
    const isStarted = m.isStarted;
    const isSched = !isLive && !isHT && !isFt && !isStarted;
    
    let cls = 'zoka-card';
    if (isLive) cls += ' live'; 
    else if (isStarted) cls += ' started';
    else if (isFt) cls += ' finished'; 
    else if (isSched) cls += ' scheduled';
    
    const barColor = isLive ? '#ef4444' : isStarted ? '#fbbf24' : isFt ? '#10b981' : 'transparent';
    const matchLink = buildMatchRoute(m.id, m.homeName, m.awayName);

    return (
      <div key={`${m.id}-${i}`} className={cls} style={{ animationDelay: i * 15 + 'ms', paddingLeft: (isLive || isStarted || isFt) ? 18 : 16 }}>
        {(isLive || isStarted || isFt) && <div className="zoka-left-bar" style={{ background: barColor }} />}
        <div className="zoka-card-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {m.category === 'FEATURED' && isSched && (
              <span className="zoka-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.2)' }}>★ TOP</span>
            )}
            {isLive && !isHT && (
              <span className="zoka-status live-s">
                <span className="zoka-dot" style={{ background: '#ef4444' }} /> 
                {m.displayMinute != null ? `${m.displayMinute}'` : 'LIVE'}
              </span>
            )}
            {isHT && <span className="zoka-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)' }}>HT</span>}
            {isStarted && !isLive && !isHT && <span className="zoka-status started-s"><Clock size={10} /> STARTED</span>}
            {isFt && <span className="zoka-status ft-s">FT</span>}
            {isSched && <span className="zoka-status time-s">{m.kickoff}</span>}
          </div>
          <div className="zoka-card-actions">
            <button className={`zoka-icon-btn fav ${isFav(m.id) ? 'active' : ''}`} onClick={() => toggleFavorite(m.id)} title="Favourite" aria-label="Toggle favourite">
              <Star size={16} fill={isFav(m.id) ? '#fbbf24' : 'none'} color={isFav(m.id) ? '#fbbf24' : '#475569'} />
            </button>
          </div>
        </div>
        <Link to={matchLink} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div className="zoka-teams">
            <div className="zoka-team-col home">
              <div className="zoka-team-row">
                {m.homeLogo && <img className="zoka-crest" src={m.homeLogo} alt={m.homeName} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} />}
                <span className="zoka-team-name">{m.homeName}</span>
              </div>
            </div>
            <div className="zoka-score-box">
              {(isLive || isHT || isFt) ? (
                <div className="zoka-scores">
                  <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''}`}>{m.homeScore != null ? m.homeScore : '--'}</span>
                  <span className="zoka-sep">–</span>
                  <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''}`}>{m.awayScore != null ? m.awayScore : '--'}</span>
                </div>
              ) : <span className="zoka-vs">{isStarted ? '--' : 'VS'}</span>}
            </div>
            <div className="zoka-team-col away">
              <div className="zoka-team-row">
                {m.awayLogo && <img className="zoka-crest" src={m.awayLogo} alt={m.awayName} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} />}
                <span className="zoka-team-name">{m.awayName}</span>
              </div>
            </div>
          </div>
          <div className="zoka-comp-row">
            {m.leagueLogo && <img src={m.leagueLogo} alt={m.leagueName} width="14" height="14" loading="lazy" style={{objectFit:'contain'}} />}
            <span>{m.leagueName}</span>
          </div>
        </Link>
        <div style={{ padding: '8px 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => handleReactNow(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
            <Camera size={12} /> React
          </button>
        </div>
      </div>
    );
  };

  const renderLeagueSection = (group) => {
    const isPinned = pinnedLeagues.includes(group.name);
    const limit = group.isTop || isPinned ? 5 : 1;
    const isExpanded = expandedLeagues.has(group.name);
    const visibleMatches = isExpanded ? group.matches : group.matches.slice(0, limit);
    const hiddenCount = group.matches.length - limit;

    return (
      <div className="zoka-section" key={group.name}>
        <div className="zoka-league-hd">
          {group.logo && <img src={group.logo} alt={group.name} width="16" height="16" loading="lazy" style={{objectFit:'contain', borderRadius: '3px'}} />}
          <span className="zoka-league-name">{group.name}</span>
          <span className="zoka-league-count">{group.matches.length}</span>
          <button className="zoka-icon-btn" style={{ opacity: isPinned ? 1 : 0.5, color: isPinned ? '#10b981' : '#475569' }} onClick={() => togglePinnedLeague(group.name)} title="Pin League"><Pin size={12} fill={isPinned ? '#10b981' : 'none'} /></button>
        </div>
        {visibleMatches.map((m, i) => renderMatchCard(m, i))}
        {hiddenCount > 0 && (
          <button className="zoka-show-more" onClick={() => toggleLeagueExpand(group.name)}>
            {isExpanded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            {isExpanded ? 'Show less' : `Show ${hiddenCount} more matches`}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="zoka-page" style={{ fontSize: `${fontScale * 16}px` }}>
      <SEO title="Football Fixtures, Live Scores & Tables" description="Get the latest football fixtures, live scores, league tables, and match predictions on ZOKA." keywords="football fixtures, live scores, ZOKA" robots="index,follow" />
      <ToastContainer toasts={toasts} />
      
      <div className="zoka-wrap">
        <div className="zoka-hdr">
          <div className="zoka-hdr-title">
            <h1><Activity size={18} style={{ color: '#10b981' }} /> Zoka <span>Live</span></h1>
            <div className="zoka-hdr-sub">{liveCount > 0 ? `${liveCount} Live Matches` : 'Live scores · Fixtures · Standings'}</div>
          </div>
          <div className="zoka-hdr-actions">
            <button className="zoka-hdr-btn" onClick={() => setFontScale(p => Math.max(0.8, p - 0.1))} title="Decrease Font Size"><Minus size={16} /></button>
            <button className="zoka-hdr-btn" onClick={() => setFontScale(p => Math.min(1.4, p + 0.1))} title="Increase Font Size"><Plus size={16} /></button>
            <button className={`zoka-hdr-btn ${soundEnabled ? 'active' : ''}`} onClick={toggleSound} title="Sound">{soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
            <button className="zoka-hdr-btn" onClick={handleRefresh} title="Refresh"><RefreshCw size={18} className={fixturesLoading ? 'zoka-spin' : ''} /></button>
          </div>
        </div>

        {fixturesLoading && allFixtures.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', padding: '8px 12px', borderRadius: '10px', fontSize: '0.75em', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Loader size={14} className="zoka-spin" /> Syncing Main Fixtures...
          </div>
        )}
        
        <div className="zoka-stats">
          <div className="zoka-schip"><div className="val live-c">{liveCount}</div><div className="lbl">Live</div></div>
          <div className="zoka-schip"><div className="val total-c">{displayFixtures.length}</div><div className="lbl">Matches</div></div>
          <div className="zoka-schip"><div className="val fav-c">{favorites.length}</div><div className="lbl">Favourites</div></div>
        </div>

        <div className="zoka-datenav">
          <button className={`zoka-nav-btn ${selectedDate === yesterdayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(yesterdayStr())}>Yesterday</button>
          <button className={`zoka-nav-btn ${selectedDate === todayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(todayStr())}>Today</button>
 <button className={`zoka-nav-btn ${selectedDate === tomorrowStr() ? 'active' : ''}`} onClick={() => setSelectedDate(tomorrowStr())}>Tomorrow</button>
          <div className="zoka-more-wrap" ref={moreRef}>
            <button className={`zoka-more-btn ${ui.moreDatesOpen ? 'open' : ''}`} onClick={() => toggleUI('moreDatesOpen')}><Calendar size={16} /> More <ChevronDown size={16} /></button>
            {ui.moreDatesOpen && (
              <div className="zoka-more-dropdown">
                <div className="zoka-more-label">Past Dates</div>
                {dates.past.map(d => (<button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>))}
                <div className="zoka-more-label" style={{ marginTop: '8px' }}>Future Dates</div>
                {dates.future.map(d => (<button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>))}
              </div>
            )}
          </div>
        </div>

        <div className="zoka-tabs">
          {['fixtures', 'favourites', 'standings', 'teams'].map(t => (
            <button key={t} className={`zoka-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="zoka-search-static">
          <Search size={18} style={{ color: '#475569', flexShrink: 0 }} />
          <input type="text" placeholder="Search teams or leagues..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
          {searchQ && <button className="zoka-search-clear" onClick={() => setSearchQ('')}><X size={18} /></button>}
        </div>

        {tab === 'fixtures' && (
          <>
            <div className="zoka-pill-scroll" style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
              {[{ key: 'all', label: 'All Matches' }, { key: 'live', label: 'Live (Real-time)' }, { key: 'finished', label: 'Finished Results' }].map(tf => (
                <button key={tf.key} className={`zoka-pill ${timeFilter === tf.key ? 'active' : ''}`} onClick={() => setTimeFilter(tf.key)} style={{ flexShrink: 0, padding: '8px 16px', borderRadius: '8px', fontSize: '.8rem', fontWeight: 700, background: timeFilter === tf.key ? '#10b981' : 'var(--bg-card)', color: timeFilter === tf.key ? '#05070a' : 'var(--text-muted)', border: `1px solid ${timeFilter === tf.key ? '#10b981' : 'var(--border)'}` }}>
                  {tf.label}
                </button>
              ))}
            </div>

            {topMatches.length > 0 && !searchQ && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <Flame size={18} style={{ color: '#fbbf24' }} />
                  <span className="zoka-league-name">Top Matches</span>
                </div>
                {visibleTopMatches.map((m, i) => renderMatchCard(m, i))}
                {hiddenTopCount > 0 && (
                  <button className="zoka-show-more" onClick={() => toggleUI('showAllTopMatches')}>
                    {ui.showAllTopMatches ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {ui.showAllTopMatches ? 'Show less' : `Show ${hiddenTopCount} more top matches`}
                  </button>
                )}
              </div>
            )}

            {liveMatches.length > 0 && !searchQ && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <TrendingUp size={18} style={{ color: '#ef4444' }} />
                  <span className="zoka-league-name">Live Matches</span>
                </div>
                {visibleLiveMatches.map((m, i) => renderMatchCard(m, i))}
                {hiddenLiveCount > 0 && (
                  <button className="zoka-show-more" onClick={() => toggleUI('showAllLiveMatches')}>
                    {ui.showAllLiveMatches ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {ui.showAllLiveMatches ? 'Show less' : `Show ${hiddenLiveCount} more live matches`}
                  </button>
                )}
              </div>
            )}

            {fixturesLoading && isPrimaryDate ? (
              <ListSkeleton count={5} />
            ) : displayFixtures.length === 0 ? (
              <EmptyState icon={Calendar} title="No fixtures scheduled for this date." hint="Try another date or clear your search." action={searchQ ? <button className="zoka-empty-action" onClick={() => setSearchQ('')}>Clear Search</button> : null} />
            ) : (
              <>
                {favMatches.length > 0 && (
                  <div className="zoka-section">
                    <div className="zoka-league-hd"><Star size={18} className="zoka-fav-icon" /><span className="zoka-league-name">Favourites</span></div>
                    {favMatches.map((m, i) => renderMatchCard(m, i))}
                  </div>
                )}

                {topLeagues.map(group => renderLeagueSection(group))}

                {otherLeagues.length > 0 && !ui.leagueFilterOpen && (
                  <button className="zoka-show-more" onClick={() => toggleUI('leagueFilterOpen')} style={{ marginTop: '8px' }}>
                    <ChevronDown size={16} /> Show {otherLeagues.length} more leagues
                  </button>
                )}

                {(ui.leagueFilterOpen || compFilter !== 'ALL') && otherLeagues.map(group => renderLeagueSection(group))}

                {/* SEO Links Restored */}
                <div className="zoka-seo-links">
                  <h3>Today's Match Links</h3>
                  {displayFixtures.slice(0, 50).map(m => {
                    const slug = `${slugify(m.homeName)}-vs-${slugify(m.awayName)}`;
                    return (
                      <Link key={m.id} to={`/match/${m.id}/${slug}`} className="zoka-seo-link" rel="bookmark">
                        {m.homeName} vs {m.awayName}
                      </Link>
                    );
                  })}
                </div>

                <div className="zoka-seo-links" style={{ marginTop: '20px' }}>
                  <h3>Explore Leagues</h3>
                  {availableLeagues.map(c => (
                    <Link key={c.id || c.name} to={`/league/${c.id}/${slugify(c.name)}`} className="zoka-seo-link">
                      {c.name}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'favourites' && (
          <div className="zoka-section">
            <div className="zoka-league-hd"><Star size={18} className="zoka-fav-icon" /><span className="zoka-league-name">Favourites</span></div>
            {favMatches.length > 0 ? (
              favMatches.map((m, i) => renderMatchCard(m, i))
            ) : (
              <EmptyState icon={Star} title="No favourite matches for this date." hint="Tap the star icon on any match to add it here." />
            )}
          </div>
        )}

        {tab === 'standings' && (
          <>
            <div className="zoka-pill-scroll" style={{ marginBottom: '10px' }}>
              {availableLeagues.slice(0, 8).map(l => (
                <button key={l.id} className={`zoka-pill ${selectedLeagueId === l.id ? 'active' : ''}`} onClick={() => setSelectedLeagueId(l.id)}>
                  {l.emblem && <img src={l.emblem} alt={l.name} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} />}
                  {l.name}
                </button>
              ))}
            </div>
            {standingsLoading ? (
              <ListSkeleton count={8} />
            ) : standingsTable.length > 0 ? (
              <div className="zoka-tbl-wrap">
                <table className="zoka-tbl">
                  <thead>
                    <tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>
                  </thead>
                  <tbody>
                    {standingsTable.map(row => (
                      <tr key={row.team?.id || row.rank}>
                        <td>{row.rank}</td>
                        <td style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {row.team?.logo && <img src={row.team?.logo} alt="" width="20" height="20" loading="lazy" style={{objectFit:'contain'}} />}
                          {row.team?.name || 'TBD'}
                        </td>
                        <td>{row.all?.played}</td><td>{row.all?.win}</td><td>{row.all?.draw}</td><td>{row.all?.lose}</td>
                        <td>{row.all?.goals?.for}</td><td>{row.all?.goals?.against}</td>
                        <td>{row.goalsDiff > 0 ? '+' : ''}{row.goalsDiff}</td>
                        <td style={{ fontWeight: 700 }}>{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Trophy} title="Select a competition to view standings." />
            )}
          </>
        )}

        {tab === 'teams' && (
          <>
            <div className="zoka-pill-scroll" style={{ marginBottom: '10px' }}>
              {availableLeagues.slice(0, 8).map(l => (
                <button key={l.id} className={`zoka-pill ${selectedLeagueId === l.id ? 'active' : ''}`} onClick={() => setSelectedLeagueId(l.id)}>
                  {l.emblem && <img src={l.emblem} alt={l.name} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} />}
                  {l.name}
                </button>
              ))}
            </div>
            {teamsLoading ? (
              <ListSkeleton count={8} />
            ) : teamsData.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                {teamsData.map(t => (
                  <div key={t.id} className="zoka-team-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
                    {t.logo && <img src={t.logo} alt={t.name} width="32" height="32" loading="lazy" style={{objectFit:'contain', margin: 0}} />}
                    <div className="name">{t.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Users} title="Select a competition to view teams." />
            )}
          </>
        )}
      </div>
    </div>
  );
}