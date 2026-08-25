import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, X, Star, Volume2, VolumeX, Trophy, Users,
  ChevronRight, ChevronDown, ChevronUp, RefreshCw, Calendar, Activity,
  Pin, Flame, Loader, Brain, TrendingUp, Check, Zap
} from 'lucide-react';

import { useFixtures, useStandings, useTeams } from '../hooks/useFixtures';
import { useQueryClient } from '@tanstack/react-query';
import { usePreferencesStore } from "../store/usePreferencesStore";
import { getLocalDateStr, formatDateShort, todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';
import { buildMatchRoute } from '../utils/routes';
import { slugify } from '../utils/seoBuilder';
import { SITE } from '../utils/seoBuilder';
import { Sound } from '../utils/soundEngine';
import MatchCard from '../components/MatchCard';
import SEO from '../components/SEO';
import { ListSkeleton, ErrorState } from '../components/StateFeedback';
import EmptyState from '../components/EmptyState';

// SEO helpers
const CMT = {
  goal: ["GOOOAL! Pure strike!", "Back of the net!", "Zoka magic!"],
  ft: ["Full Time!", "Final Whistle!"],
  ht: ["Half Time!", "HT Break."],
  kickoff: ["Kick Off!", "We're underway!"],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Debounce hook for search
function useDebounced(v, delay = 250) {
  const [deb, setDeb] = useState(v);
  useEffect(() => { const id = setTimeout(() => setDeb(v), delay); return () => clearTimeout(id); }, [v, delay]);
  return deb;
}

// Toasts — uses core zoka-toast classes, no inline layout
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const [pendingGoals, setPendingGoals] = useState([]);
  const idRef = useRef(0);
  const flushTimer = useRef(null);

  const flushGoals = useCallback(() => {
    setPendingGoals(prevPending => {
      if (prevPending.length === 0) return [];
      const id = ++idRef.current;
      if (prevPending.length === 1) {
        const g = prevPending[0];
        setToasts(p => [...p.slice(-2), { id, type: 'goal', msg: pick(CMT.goal), homeName: g.homeName, awayName: g.awayName, score: g.score, homeLogo: g.homeLogo, awayLogo: g.awayLogo, matchId: g.matchId, dur: 3500 }]);
      } else {
        setToasts(p => [...p.slice(-2), { id, type: 'multi-goal', count: prevPending.length, events: prevPending, dur: 4500 }]);
      }
      setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 4500);
      return [];
    });
  }, []);

  const addGoal = useCallback((goalData) => {
    setPendingGoals(prev => [...prev, goalData]);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushGoals, 1200);
  }, [flushGoals]);

  return { toasts, addGoal };
}

const ToastContainer = memo(({ toasts }) => {
  const navigate = useNavigate();
  if (!toasts.length) return null;
  
  const handleGoalClick = (t) => {
    navigate(buildMatchRoute(t.matchId, t.homeName, t.awayName));
  };

  return (
    <div className="zoka-toast-wrap">
      {toasts.map(t => {
        if (t.type === 'multi-goal') {
          return (
            <div key={t.id} className="zoka-toast multi-goal">
              <div className="flex-center gap-12">
                <span className="toast-emoji">⚽</span>
                <div className="flex-1">
                  <div className="toast-title accent">{t.count} New Events!</div>
                  {t.events.slice(0, 3).map((e, i) => (
                    <div key={i} className="flex-center gap-8 toast-line">
                      {e.homeLogo && <img src={e.homeLogo} alt="" width="14" height="14" className="toast-logo" />}
                      <span className="font-bold">{e.homeName}</span> 
                      <span className="font-extrabold accent">{e.score}</span> 
                      <span className="font-bold">{e.awayName}</span>
                      {e.awayLogo && <img src={e.awayLogo} alt="" width="14" height="14" className="toast-logo" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        }
        return (
          <div key={t.id} className="zoka-toast goal-toast" onClick={() => handleGoalClick(t)}>
            <div className="flex-center gap-12">
              <span className="toast-emoji">⚽</span>
              <div className="flex-1">
                <div className="toast-title inverse">GOAL!</div>
                <div className="flex-center gap-8 toast-line inverse">
                  {t.homeLogo && <img src={t.homeLogo} alt="" width="16" height="16" className="toast-logo" />}
                  <span className="font-semibold">{t.homeName}</span> 
                  <span className="font-extrabold">{t.score}</span> 
                  <span className="font-semibold">{t.awayName}</span>
                  {t.awayLogo && <img src={t.awayLogo} alt="" width="16" height="16" className="toast-logo" />}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const LiveTicker = memo(({ matches }) => {
  if (!matches?.length) return null;
  return (
    <div className="zoka-live-ticker">
      {matches.map(m => (
        <Link key={m.id} to={buildMatchRoute(m.id, m.homeName, m.awayName)} className="zoka-ticker-item">
          <div className="zoka-ticker-live" />
          <span className="ticker-min">{m.displayMinute}'</span>
          <span className="ticker-team">{m.homeName}</span>
          <span className="ticker-score">{m.homeScore ?? 0} - {m.awayScore ?? 0}</span>
          <span className="ticker-team">{m.awayName}</span>
        </Link>
      ))}
    </div>
  );
});

const MatchOfTheDayCard = memo(({ match, mlPredictions }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [userVote, setUserVote] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(`zoka_vote_${match?.id}`);
  });
  const [isVoting, setIsVoting] = useState(false);
  const [voteData, setVoteData] = useState(null);
  const [isLoadingVotes, setIsLoadingVotes] = useState(true);

  useEffect(() => { if (isExpanded && match?.id) fetchVotes(match.id); }, [isExpanded, match?.id]);

  const fetchVotes = async (matchId) => {
    try {
      setIsLoadingVotes(true);
      const res = await fetch(`https://api.zokascore.xyz/api/v1/predictions/${matchId}`);
      const data = await res.json();
      if (data.success) setVoteData(data);
    } catch {} finally { setIsLoadingVotes(false); }
  };

  if (!match) return null;

  const handleVote = async (choice) => {
    if (userVote || isVoting) return;
    setIsVoting(true);
    setUserVote(choice);
    try { localStorage.setItem(`zoka_vote_${match.id}`, choice); } catch {}
    try {
      const res = await fetch(`https://api.zokascore.xyz/api/v1/predictions/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: String(match.id), choice })
      });
      if (!res.ok) throw new Error();
      await fetchVotes(match.id);
      if (navigator.vibrate) navigator.vibrate(15);
    } catch {
      setUserVote(null);
      try { localStorage.removeItem(`zoka_vote_${match.id}`); } catch {}
    } finally { setIsVoting(false); }
  };

  const percentages = voteData?.percentages || { home: 0, draw: 0, away: 0 };
  const totalVotes = voteData?.totalVotes || 0;
  const aiPick = mlPredictions?.["1x2"]?.pick;
  const aiProb = mlPredictions?.["1x2"]?.pick_probability;
  const formatPick = (p) => {
    if (!p) return null;
    if (p === 'HOME_WIN') return match.homeName?.split(' ')[0] || 'HOME';
    if (p === 'AWAY_WIN') return match.awayName?.split(' ')[0] || 'AWAY';
    return p;
  };

  return (
    <div className={`zoka-motd-card ${isExpanded ? 'expanded' : ''}`}>
      <button className="zoka-motd-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex-center gap-8">
          <div className="motd-icon"><Brain size={18} /></div>
          <span className="font-bold">Match of the Day</span>
          {match.leagueName && <span className="motd-league">{match.leagueName}</span>}
        </div>
        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {isExpanded && (
        <div className="zoka-intel-animate">
          <div className="motd-teams">
            <div className="motd-team">
              {match.homeLogo ? <img src={match.homeLogo} alt={match.homeName} className="motd-logo" /> : <div className="motd-logo-fallback">{match.homeName?.charAt(0)}</div>}
              <span className="motd-team-name">{match.homeName}</span>
            </div>
            <div className="motd-center">
              <div className="motd-score">{match.homeScore ?? '-'} <span>:</span> {match.awayScore ?? '-'}</div>
              <div className="zoka-status time-s">{match.isLive ? <><span className="zoka-ticker-live" />{match.displayMinute}'</> : match.displayMinute}</div>
            </div>
            <div className="motd-team">
              {match.awayLogo ? <img src={match.awayLogo} alt={match.awayName} className="motd-logo" /> : <div className="motd-logo-fallback">{match.awayName?.charAt(0)}</div>}
              <span className="motd-team-name">{match.awayName}</span>
            </div>
          </div>

          {aiPick && (
            <div className="motd-ai-pick">
              <span className="flex-center gap-4"><Zap size={12} fill="currentColor" /> Zoka AI Pick</span>
              <span className="font-extrabold">{formatPick(aiPick)} ({aiProb}%)</span>
            </div>
          )}

          <div className="motd-vote-section">
            <div className="motd-vote-label"><TrendingUp size={14} /> Community Prediction ({totalVotes} votes)</div>
            {isLoadingVotes ? <div className="motd-bar skeleton" /> : (
              <>
                <div className="motd-bar">
                  <div style={{ width: `${percentages.home}%` }} className="motd-bar-home" />
                  <div style={{ width: `${percentages.draw}%` }} className="motd-bar-draw" />
                  <div style={{ width: `${percentages.away}%` }} className="motd-bar-away" />
                </div>
                <div className="motd-bar-labels">
                  <span className="home">{percentages.home}% Home</span>
                  <span>{percentages.draw}% Draw</span>
                  <span className="away">{percentages.away}% Away</span>
                </div>
              </>
            )}
          </div>

          <div className="motd-vote-actions">
            <div className="motd-vote-title">Cast Your Prediction</div>
            <div className="flex gap-8">
              {['home','draw','away'].map(choice => {
                const selected = userVote === choice;
                return (
                  <button key={choice} disabled={!!userVote || isVoting} onClick={() => handleVote(choice)} className={`zoka-vote-btn ${selected ? 'selected' : ''}`}>
                    <span className="capitalize">{choice}</span>
                    {selected && <Check size={16} />}
                  </button>
                );
              })}
            </div>
            {userVote && <div className="motd-vote-success">Vote recorded!</div>}
          </div>
        </div>
      )}
    </div>
  );
});

const TabBar = memo(({ tabs, activeTab, onTabChange }) => {
  const [indicatorStyle, setIndicatorStyle] = useState({});
  const tabsRef = useRef(null);
  useEffect(() => {
    const update = () => {
      const btn = tabsRef.current?.querySelector(`[data-tab="${activeTab}"]`);
      if (btn) setIndicatorStyle({ width: btn.offsetWidth, transform: `translateX(${btn.offsetLeft}px)`, left: 0, top: 4 });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [activeTab]);
  return (
    <div className="zoka-tabs" ref={tabsRef}>
      {tabs.map(t => (
        <button key={t} data-tab={t} className={`zoka-tab ${activeTab === t ? 'active' : ''}`} onClick={() => onTabChange(t)}>
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
      <div className="zoka-tab-indicator" style={indicatorStyle} />
    </div>
  );
});

const TOP_TEAMS_LIST = ['manchester united','manchester city','liverpool','chelsea','arsenal','tottenham hotspur','tottenham','real madrid','barcelona','atletico madrid','athletic bilbao','sevilla','valencia','bayern munich','borussia dortmund','rb leipzig','bayer leverkusen','paris saint germain','psg','marseille','lyon','juventus','inter','ac milan','napoli','roma','lazio','atalanta','benfica','porto','sporting cp','ajax','psv eindhoven','feyenoord','celtic','rangers','flamengo','palmeiras','corinthios','sao paulo','boca juniors','river plate'];
const TOP_TEAMS_SET = new Set(TOP_TEAMS_LIST);

const MAJOR_LEAGUES = [
  { id: '39', name: 'Premier League', emblem: 'https://media.api-sports.io/football/leagues/39.png' },
  { id: '140', name: 'La Liga', emblem: 'https://media.api-sports.io/football/leagues/140.png' },
  { id: '135', name: 'Serie A', emblem: 'https://media.api-sports.io/football/leagues/135.png' },
  { id: '78', name: 'Bundesliga', emblem: 'https://media.api-sports.io/football/leagues/78.png' },
  { id: '61', name: 'Ligue 1', emblem: 'https://media.api-sports.io/football/leagues/61.png' },
  { id: '2', name: 'Champions League', emblem: 'https://media.api-sports.io/football/leagues/2.png' },
  { id: '3', name: 'Europa League', emblem: 'https://media.api-sports.io/football/leagues/3.png' },
  { id: '88', name: 'Eredivisie', emblem: 'https://media.api-sports.io/football/leagues/88.png' },
  { id: '94', name: 'Primeira Liga', emblem: 'https://media.api-sports.io/football/leagues/94.png' },
  { id: '71', name: 'Brasileirão', emblem: 'https://media.api-sports.io/football/leagues/71.png' },
];

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
  const queryClient = useQueryClient();
  const { toasts, addGoal } = useToasts();
  
  const { soundEnabled = false, favorites = [], pinnedMatches = [], toggleSound = () => {}, toggleFavorite = () => {}, togglePinMatch = () => {} } = usePreferencesStore();
  const [soundType, setSoundType] = useState(() => { if(typeof window==='undefined') return 'whistle'; return localStorage.getItem('zoka_sound_type') || 'whistle'; });

  const isFav = useCallback(id => favorites.includes(String(id)), [favorites]);
  const isPinned = useCallback(id => pinnedMatches.includes(String(id)), [pinnedMatches]);

  const [pinnedLeagues, setPinnedLeagues] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("zoka_pinned_leagues") || '[]')); } catch { return new Set(); }
  });
  
  const togglePinnedLeague = useCallback(leagueName => {
    setPinnedLeagues(prev => {
      const n = new Set(prev);
      if (n.has(leagueName)) n.delete(leagueName); else n.add(leagueName);
      try { localStorage.setItem("zoka_pinned_leagues", JSON.stringify([...n])); } catch {}
      return n;
    });
  }, []);

  const [tab, setTab] = useState(searchParams.get('tab') || 'fixtures');
  const [compFilter, setCompFilter] = useState(searchParams.get('league') || 'ALL');
  const [searchQ, setSearchQ] = useState('');
  const debouncedSearch = useDebounced(searchQ);
  const [ui, setUI] = useState({ moreDatesOpen: false, leagueFilterOpen: false, showLiveOnly: false, showAllTopMatches: false, showAllLiveMatches: false, showMotd: false });
  const toggleUI = useCallback((key) => setUI(prev => ({ ...prev, [key]: !prev[key] })), []);

  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const { data: standingsData = null, isLoading: standingsLoading } = useStandings(selectedLeagueId);
  const { data: teamsData = [], isLoading: teamsLoading } = useTeams(selectedLeagueId);

  const [expandedLeagues, setExpandedLeagues] = useState(new Set());
  const moreRef = useRef(null);
  const dateDropdownRef = useRef(null);

  const allFixtures = useMemo(() => rawFixtures.filter(m => !m.isHidden), [rawFixtures]);
  const liveMatches = useMemo(() => allFixtures.filter(m => m.isLive).sort(sortMatches), [allFixtures]);
  const liveMatchIds = useMemo(() => new Set(liveMatches.map(m => String(m.id))), [liveMatches]);

  const topMatches = useMemo(() => {
    return allFixtures.filter(m => {
      if (liveMatchIds.has(String(m.id))) return false;
      const home = norm(m.homeName); const away = norm(m.awayName);
      return [...TOP_TEAMS_SET].some(t => home.includes(t) || away.includes(t));
    }).sort(sortMatches); 
  }, [allFixtures, liveMatchIds]);

  const topMatchIds = useMemo(() => new Set(topMatches.map(m => String(m.id))), [topMatches]);

  const favMatches = useMemo(() => {
    return allFixtures.filter(m => {
      if (liveMatchIds.has(String(m.id)) || topMatchIds.has(String(m.id))) return false;
      return favorites.includes(String(m.id));
    }).sort(sortMatches);
  }, [allFixtures, liveMatchIds, topMatchIds, favorites]);

  const favMatchIds = useMemo(() => new Set(favMatches.map(m => String(m.id))), [favMatches]);

  const predictedMatches = useMemo(() => allFixtures.filter(m => m.mlPredictions && m.mlPredictions["1x2"]), [allFixtures]);

  const featuredMatch = useMemo(() => {
    if (allFixtures.length === 0) return null;
    const liveMajor = liveMatches.find(m => MAJOR_LEAGUES.some(l => l.name === m.leagueName));
    if (liveMajor) return liveMajor;
    if (liveMatches.length > 0) return liveMatches[0];
    const todayMajor = allFixtures.find(m => MAJOR_LEAGUES.some(l => l.name === m.leagueName));
    return todayMajor || allFixtures[0];
  }, [liveMatches, allFixtures]);

  const prevScores = useRef(new Map());
  useEffect(() => {
    liveMatches.forEach(m => {
      const id = String(m.id);
      const prev = prevScores.current.get(id);
      let goalScored = false;
      let scoringTeamLogo = null;
      if (prev) {
        if (m.homeScore != null && prev.h != null && m.homeScore > prev.h) { goalScored = true; scoringTeamLogo = m.homeLogo; }
        if (m.awayScore != null && prev.a != null && m.awayScore > prev.a) { goalScored = true; scoringTeamLogo = m.awayLogo; }
      }
      if (goalScored) {
        Sound.goal();
        addGoal({ matchId: m.id, homeName: m.homeName, awayName: m.awayName, score: `${m.homeScore}-${m.awayScore}`, homeLogo: m.homeLogo, awayLogo: m.awayLogo, league: m.leagueName });
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const notif = new Notification('⚽ GOAL!', { body: `${m.homeName} ${m.homeScore}-${m.awayScore} ${m.awayName}\n${m.leagueName}`, icon: scoringTeamLogo, badge: m.leagueLogo, tag: m.id });
          notif.onclick = (e) => { e.preventDefault(); window.focus(); navigate(buildMatchRoute(m.id, m.homeName, m.awayName)); };
        }
      }
      prevScores.current.set(id, { h: m.homeScore, a: m.awayScore });
    });
  }, [liveMatches, addGoal, navigate]);

  useEffect(() => { 
    Sound.on = soundEnabled; 
    Sound.type = soundType;
    try { localStorage.setItem('zoka_sound_type', soundType); } catch {}
    Sound.unlock(); 
  }, [soundEnabled, soundType]);

  useEffect(() => {
    const handler = (e) => { 
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target)) setUI(prev => ({ ...prev, moreDatesOpen: false }));
      if (moreRef.current && !moreRef.current.contains(e.target)) setUI(prev => ({ ...prev, leagueFilterOpen: false }));
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
    if (debouncedSearch.trim()) { const terms = debouncedSearch.trim().toLowerCase().split(/\s+/).filter(Boolean); if (terms.length) list = list.filter(m => matchQ(m, terms)); }
    return list; 
  }, [allFixtures, compFilter, ui.showLiveOnly, debouncedSearch, timeFilter]);

  const seoTitle = useMemo(() => {
    const dateLabel = selectedDate === todayStr() ? "Today" : selectedDate === yesterdayStr() ? "Yesterday" : selectedDate === tomorrowStr() ? "Tomorrow" : formatDateShort(selectedDate);
    const livePart = liveMatches.length ? `${liveMatches.length} Live Now — ` : "";
    return `${livePart}Football Fixtures ${dateLabel} — ${displayFixtures.length} Matches | Live Scores & AI Predictions`;
  }, [selectedDate, liveMatches.length, displayFixtures.length]);

  const seoDesc = useMemo(() => {
    const live = liveMatches.length ? `${liveMatches.length} live matches now. ` : "";
    return `${live}Free football fixtures today ${selectedDate}, live scores, H2H stats, lineups & AI predictions for Premier League, La Liga, Champions League. Accurate tips on ZOKASCORE.`;
  }, [liveMatches.length, selectedDate]);

  const itemListSchema = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": seoTitle,
    "itemListElement": displayFixtures.slice(0, 50).map((m, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": `${SITE.url}${buildMatchRoute(m.id, m.homeName, m.awayName)}`
    }))
  }), [displayFixtures, seoTitle]);

  const grouped = useMemo(() => {
    const map = new Map();
    displayFixtures.forEach(m => {
      const id = String(m.id);
      if (liveMatchIds.has(id) || topMatchIds.has(id) || favMatchIds.has(id)) return;
      const key = m.leagueName || 'Other';
      if (!map.has(key)) map.set(key, { name: key, logo: m.leagueLogo, id: m.leagueId, matches: [] });
      map.get(key).matches.push(m);
    });
    map.forEach(g => g.matches.sort(sortMatches));
    return [...map.values()].sort((a, b) => {
      const pA = pinnedLeagues.has(a.name) ? 0 : 1; const pB = pinnedLeagues.has(b.name) ? 0 : 1;
      if (pA !== pB) return pA - pB;
      const lA = leaguePriorityMap[a.name] ?? 99; const lB = leaguePriorityMap[b.name] ?? 99;
      if (lA !== lB) return lA - lB;
      return a.name.localeCompare(b.name);
    });
  }, [displayFixtures, liveMatchIds, topMatchIds, favMatchIds, leaguePriorityMap, pinnedLeagues]);

  const { topLeagues, otherLeagues } = useMemo(() => ({ topLeagues: grouped.slice(0, 5).map(g => ({...g, isTop: true})), otherLeagues: grouped.slice(5).map(g => ({...g, isTop: false})) }), [grouped]);

  const toggleLeagueExpand = useCallback((leagueName) => { setExpandedLeagues(prev => { const n = new Set(prev); if (n.has(leagueName)) n.delete(leagueName); else n.add(leagueName); return n; }); }, []);

  const liveCount = useMemo(() => allFixtures.filter(m => m.isLive).length, [allFixtures]);
  const visibleTopMatches = ui.showAllTopMatches ? topMatches : topMatches.slice(0, 2);
  const hiddenTopCount = topMatches.length - 2;
  const visibleLiveMatches = ui.showAllLiveMatches ? liveMatches : liveMatches.slice(0, 5);
  const hiddenLiveCount = liveMatches.length - 5;

  const handleRefresh = useCallback(async () => { queryClient.invalidateQueries(['fixtures', selectedDate]); }, [queryClient, selectedDate]);

  useEffect(() => { if ((tab === 'standings' || tab === 'teams') && !selectedLeagueId) setSelectedLeagueId('39'); }, [tab, selectedLeagueId]);

  const standingsTable = standingsData?.standings?.[0] || [];
  const handleReactNow = useCallback((match) => {
    navigate('/studio/reactor', { state: { fixtureId: match.id, homeTeam: match.homeName, awayTeam: match.awayName, homeLogo: match.homeLogo, awayLogo: match.awayLogo, score: { home: match.homeScore, away: match.awayScore }, minute: match.displayMinute, competition: match.leagueName } });
  }, [navigate]);

  const renderLeagueSection = (group) => {
    const isLeaguePinned = pinnedLeagues.has(group.name);
    const limit = group.isTop || isLeaguePinned ? 5 : 1;
    const isExpanded = expandedLeagues.has(group.name);
    const visibleMatches = isExpanded ? group.matches : group.matches.slice(0, limit);
    const hiddenCount = group.matches.length - limit;
    return (
      <div className="zoka-section" key={group.name}>
        <div className="zoka-league-hd">
          {group.logo && <img src={group.logo} alt={group.name} width="16" height="16" loading="lazy" />}
          <span className="zoka-league-name">{group.name}</span>
          <span className="zoka-league-count">{group.matches.length}</span>
          <button className={`zoka-icon-btn ${isLeaguePinned ? 'pinned' : ''}`} onClick={() => togglePinnedLeague(group.name)} title="Pin League">
            <Pin size={12} fill={isLeaguePinned ? 'var(--primary)' : 'none'} />
          </button>
        </div>
        {visibleMatches.map((m, i) => (
          <MatchCard key={`${m.id}-${i}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />
        ))}
        {hiddenCount > 0 && (
          <button className="zoka-show-more" onClick={() => toggleLeagueExpand(group.name)}>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {isExpanded ? 'Show less' : `Show ${hiddenCount} more matches`}
          </button>
        )}
      </div>
    );
  };

  if (fixturesError && allFixtures.length === 0) {
    return (
      <div className="zoka-page">
        <SEO title={seoTitle} description={seoDesc} />
        <div className="zoka-wrap pt-20">
          <ErrorState error={fixturesError} onRetry={handleRefresh} />
        </div>
      </div>
    );
  }

  const isTodaySelected = selectedDate === todayStr();

  return (
    <div className="zoka-page">
      <SEO 
        title={seoTitle}
        description={seoDesc}
        keywords={`football fixtures ${selectedDate}, live scores today, premier league fixtures, la liga, champions league predictions, ZOKASCORE`}
        structuredData={itemListSchema}
      />
      <ToastContainer toasts={toasts} />
      <div className="zoka-wrap">
        <div className="zoka-hdr">
          <div className="zoka-hdr-title">
            <h1 className="zoka-h1"><Activity size={18} className="primary" /> Zoka <span className="primary">Live</span></h1>
            <div className="zoka-hdr-sub">{liveCount > 0 ? `${liveCount} Live Matches` : 'Live scores · Fixtures · Predictions'}</div>
          </div>
          <div className="zoka-hdr-actions">
            <div className="zoka-sound-wrap">
              <button className={`zoka-hdr-btn ${soundEnabled ? 'active' : ''}`} onClick={toggleSound} title="Sound">
                {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              {soundEnabled && (
                <select className="zoka-sound-select" value={soundType} onChange={(e) => setSoundType(e.target.value)} title="Notification Sound">
                  <option value="whistle">Classic Whistle</option>
                  <option value="cheer">Stadium Cheer</option>
                  <option value="horn">Air Horn</option>
                  <option value="silent">Silent</option>
                </select>
              )}
            </div>
            <button className="zoka-hdr-btn" onClick={handleRefresh} title="Refresh"><RefreshCw size={18} className={fixturesLoading ? 'anim-spin' : ''} /></button>
          </div>
        </div>

        <LiveTicker matches={liveMatches} />

        {fixturesLoading && allFixtures.length === 0 && (
          <div className="zoka-sync-banner"><Loader size={14} className="anim-spin" /> Syncing Fixtures...</div>
        )}
        
        <div className="zoka-stats">
          <div className="zoka-schip"><div className="val danger">{liveCount}</div><div className="lbl">Live</div></div>
          <div className="zoka-schip"><div className="val">{displayFixtures.length}</div><div className="lbl">Matches</div></div>
          <div className="zoka-schip"><div className="val">{favorites.length}</div><div className="lbl">Favourites</div></div>
        </div>

        <div className="zoka-datenav" ref={dateDropdownRef}>
          <button className={`zoka-nav-btn ${selectedDate === yesterdayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(yesterdayStr())}>Yesterday</button>
          <button className={`zoka-nav-btn ${selectedDate === todayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(todayStr())}>Today</button>
          <button className={`zoka-nav-btn ${selectedDate === tomorrowStr() ? 'active' : ''}`} onClick={() => setSelectedDate(tomorrowStr())}>Tomorrow</button>
          <div className="zoka-more-wrap">
            <button className={`zoka-more-btn ${ui.moreDatesOpen ? 'open' : ''}`} onClick={() => toggleUI('moreDatesOpen')}>
              <Calendar size={16} /> <span>More</span><ChevronDown size={16} className={`chevron ${ui.moreDatesOpen ? 'rotated' : ''}`} />
            </button>
            <div className={`zoka-more-dropdown ${ui.moreDatesOpen ? 'open' : ''}`}>
              <div className="zoka-more-label">Past Dates</div>
              {dates.past.map(d => (
                <button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>
              ))}
              <div className="zoka-more-label mt-12">Future Dates</div>
              {dates.future.map(d => (
                <button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>
              ))}
            </div>
          </div>
        </div>

        <TabBar tabs={['fixtures', 'predictions', 'favourites', 'standings', 'teams']} activeTab={tab} onTabChange={setTab} />

        <div className="zoka-search-static">
          <Search size={18} className="search-icon" />
          <input type="text" placeholder="Search teams or leagues..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
          {searchQ && <button className="zoka-search-clear" onClick={() => setSearchQ('')}><X size={18} /></button>}
        </div>

        {tab === 'fixtures' && (
          <>
            <div className="zoka-pill-scroll">
              {[{ key: 'all', label: 'All Matches' }, { key: 'live', label: 'Live (Real-time)' }, { key: 'finished', label: 'Finished Results' }].map(tf => (
                <button key={tf.key} className={`zoka-pill ${timeFilter === tf.key ? 'active' : ''}`} onClick={() => setTimeFilter(tf.key)}>{tf.label}</button>
              ))}
            </div>

            <button className="zoka-show-more motd-toggle" onClick={() => toggleUI('showMotd')}>
              <Brain size={16} /> {ui.showMotd ? 'Hide Match of the Day' : 'Show Match of the Day'}
            </button>
            {ui.showMotd && (fixturesLoading ? <div className="zoka-skel-featured skeleton" /> : <MatchOfTheDayCard match={featuredMatch} mlPredictions={featuredMatch?.mlPredictions} />)}

            {!debouncedSearch && timeFilter === 'all' && predictedMatches.length > 0 && (
              <div className="zoka-section zoka-ai-section">
                <div className="zoka-league-hd"><Brain size={18} className="accent" /><span className="zoka-league-name">Zoka AI Predictions</span></div>
                {predictedMatches.slice(0, 3).map((m, i) => {
                  const bestScore = m.mlPredictions?.correct_scores ? Object.keys(m.mlPredictions.correct_scores)[0] : null;
                  return (
                    <Link to={buildMatchRoute(m.id, m.homeName, m.awayName)} key={`ai-${m.id}`} className="zoka-card zoka-ai-card" style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="zoka-ai-top"><span className="zoka-ai-comp">{m.leagueName}</span><span className="zoka-ai-time">{m.kickoff || m.statusLabel}</span></div>
                      <div className="zoka-ai-teams"><span className="zoka-ai-team">{m.homeName}</span><span className="zoka-ai-vs">VS</span><span className="zoka-ai-team">{m.awayName}</span></div>
                      <div className="zoka-ai-probbar">
                        <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.HOME_WIN || 33}%` }} className="prob-home" />
                        <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.DRAW || 33}%` }} className="prob-draw" />
                        <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.AWAY_WIN || 33}%` }} className="prob-away" />
                      </div>
                      <div className="zoka-ai-labels"><span>{m.mlPredictions["1x2"]?.probabilities.HOME_WIN?.toFixed(0) || 33}%</span><span>{m.mlPredictions["1x2"]?.probabilities.DRAW?.toFixed(0) || 33}%</span><span>{m.mlPredictions["1x2"]?.probabilities.AWAY_WIN?.toFixed(0) || 33}%</span></div>
                      {bestScore && <div className="zoka-ai-extras"><div className="zoka-ai-stat strong"><span className="lbl">Strong Pick</span><span className="val accent">{bestScore}</span></div></div>}
                    </Link>
                  );
                })}
                <button className="zoka-show-more" onClick={() => setTab('predictions')}><Brain size={16} /> View All Predictions ({predictedMatches.length})</button>
              </div>
            )}

            {topMatches.length > 0 && !debouncedSearch && (
              <div className="zoka-section">
                <div className="zoka-league-hd"><Flame size={18} className="gold" /><span className="zoka-league-name">Top Matches</span></div>
                {visibleTopMatches.map((m, i) => (
                  <MatchCard key={`top-${m.id}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />
                ))}
                {hiddenTopCount > 0 && (
                  <button className="zoka-show-more" onClick={() => toggleUI('showAllTopMatches')}>
                    {ui.showAllTopMatches ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{ui.showAllTopMatches ? 'Show less' : `Show ${hiddenTopCount} more top matches`}
                  </button>
                )}
              </div>
            )}

            {liveMatches.length > 0 && !debouncedSearch && (
              <div className="zoka-section">
                <div className="zoka-league-hd"><span className="live-pulse-dot" /><span className="zoka-league-name">Live Matches</span></div>
                {visibleLiveMatches.map((m, i) => (
                  <MatchCard key={`live-${m.id}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />
                ))}
                {hiddenLiveCount > 0 && (
                  <button className="zoka-show-more" onClick={() => toggleUI('showAllLiveMatches')}>
                    {ui.showAllLiveMatches ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{ui.showAllLiveMatches ? 'Show less' : `Show ${hiddenLiveCount} more live matches`}
                  </button>
                )}
              </div>
            )}

            {fixturesLoading && isTodaySelected ? <ListSkeleton count={5} /> : displayFixtures.length === 0 ? (
              <div className="zoka-empty-anim"><EmptyState icon={Calendar} title="No fixtures scheduled for this date." hint="Try another date or clear your search." action={debouncedSearch ? <button className="zoka-pill mt-8" onClick={() => setSearchQ('')}>Clear Search</button> : null} /></div>
            ) : (
              <>
                {favMatches.length > 0 && (
                  <div className="zoka-section">
                    <div className="zoka-league-hd"><Star size={18} className="gold" /><span className="zoka-league-name">Favourites</span></div>
                    {favMatches.map((m, i) => <MatchCard key={`fav-${m.id}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />)}
                  </div>
                )}
                {topLeagues.map(group => (
                  <div className="zoka-section" key={group.name}>
                    <div className="zoka-league-hd">
                      {group.logo && <img src={group.logo} alt={group.name} width="16" height="16" loading="lazy" />}
                      <span className="zoka-league-name">{group.name}</span>
                      <span className="zoka-league-count">{group.matches.length}</span>
                      <button className={`zoka-icon-btn ${pinnedLeagues.has(group.name) ? 'pinned' : ''}`} onClick={() => { const n=new Set(pinnedLeagues); if(n.has(group.name)) n.delete(group.name); else n.add(group.name); setPinnedLeagues(n); try{localStorage.setItem("zoka_pinned_leagues", JSON.stringify([...n]));}catch{}}}><Pin size={12} fill={pinnedLeagues.has(group.name) ? 'var(--primary)' : 'none'} /></button>
                    </div>
                    {(expandedLeagues.has(group.name) ? group.matches : group.matches.slice(0, group.isTop || pinnedLeagues.has(group.name) ? 5 : 1)).map((m,i) => <MatchCard key={`${m.id}-${i}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />)}
                    {group.matches.length > (group.isTop || pinnedLeagues.has(group.name) ? 5 : 1) && (
                      <button className="zoka-show-more" onClick={() => { const n=new Set(expandedLeagues); if(n.has(group.name)) n.delete(group.name); else n.add(group.name); setExpandedLeagues(n); }}>
                        {expandedLeagues.has(group.name) ? <><ChevronUp size={16} /> Show less</> : <><ChevronDown size={16} /> Show {group.matches.length - (group.isTop || pinnedLeagues.has(group.name) ? 5 : 1)} more matches</>}
                      </button>
                    )}
                  </div>
                ))}
                {otherLeagues.length > 0 && !ui.leagueFilterOpen && <button className="zoka-show-more" onClick={() => toggleUI('leagueFilterOpen')}><ChevronDown size={16} /> Show {otherLeagues.length} more leagues</button>}
                {(ui.leagueFilterOpen || compFilter !== 'ALL') && otherLeagues.map(g => {
                  const isPinnedLeague = pinnedLeagues.has(g.name);
                  const limit = g.isTop || isPinnedLeague ? 5 : 1;
                  const expanded = expandedLeagues.has(g.name);
                  return (
                    <div className="zoka-section" key={g.name}>
                      <div className="zoka-league-hd">
                        {g.logo && <img src={g.logo} alt={g.name} width="16" height="16" />}
                        <span className="zoka-league-name">{g.name}</span>
                        <span className="zoka-league-count">{g.matches.length}</span>
                      </div>
                      {(expanded ? g.matches : g.matches.slice(0,limit)).map((m,i)=><MatchCard key={m.id} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />)}
                      {g.matches.length > limit && <button className="zoka-show-more" onClick={() => { const n=new Set(expandedLeagues); if(n.has(g.name)) n.delete(g.name); else n.add(g.name); setExpandedLeagues(n); }}>{expanded ? 'Show less' : `Show ${g.matches.length-limit} more`}</button>}
                    </div>
                  );
                })}
                <nav className="zoka-seo-links glass-card" aria-label="Match directory">
                  <h3 className="seo-links-title">Today's Match Directory — {displayFixtures.length} Fixtures</h3>
                  <ul className="seo-links-grid">
                    {displayFixtures.slice(0, 60).map(m => (
                      <li key={m.id}><Link to={buildMatchRoute(m.id, m.homeName, m.awayName)} className="zoka-seo-link" rel="bookmark">{m.homeName} vs {m.awayName}</Link></li>
                    ))}
                  </ul>
                  <h3 className="seo-links-title mt-24">Explore Leagues</h3>
                  <ul className="flex flex-wrap gap-8">
                    {MAJOR_LEAGUES.map(c => <li key={c.id}><Link to={`/league/${c.id}/${slugify(c.name)}`} className="zoka-seo-link badge">{c.name}</Link></li>)}
                  </ul>
                </nav>
              </>
            )}
          </>
        )}

        {tab === 'predictions' && (
          <div className="zoka-section">
            <div className="zoka-league-hd"><Brain size={18} className="accent" /><span className="zoka-league-name">Zoka AI Predictions</span><span className="zoka-league-count">{predictedMatches.length}</span></div>
            {predictedMatches.length > 0 ? predictedMatches.map((m, i) => {
              const bestScore = m.mlPredictions?.correct_scores ? Object.keys(m.mlPredictions.correct_scores)[0] : null;
              return (
                <Link to={buildMatchRoute(m.id, m.homeName, m.awayName)} key={`pred-${m.id}`} className="zoka-card zoka-ai-card" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="zoka-ai-top"><span className="zoka-ai-comp">{m.leagueName}</span><span className="zoka-ai-time">{m.kickoff || m.statusLabel}</span></div>
                  <div className="zoka-ai-teams"><span className="zoka-ai-team">{m.homeName}</span><span className="zoka-ai-vs">VS</span><span className="zoka-ai-team">{m.awayName}</span></div>
                  <div className="zoka-ai-probbar">
                    <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.HOME_WIN || 33}%` }} className="prob-home" />
                    <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.DRAW || 33}%` }} className="prob-draw" />
                    <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.AWAY_WIN || 33}%` }} className="prob-away" />
                  </div>
                  <div className="zoka-ai-labels"><span>{m.mlPredictions["1x2"]?.probabilities.HOME_WIN?.toFixed(0) || 33}%</span><span>{m.mlPredictions["1x2"]?.probabilities.DRAW?.toFixed(0) || 33}%</span><span>{m.mlPredictions["1x2"]?.probabilities.AWAY_WIN?.toFixed(0) || 33}%</span></div>
                  <div className="zoka-ai-extras">
                    <div className="zoka-ai-stat"><span className="lbl">O/U 2.5</span><span className="val">{m.mlPredictions["ou_2_5"]?.pick || '-'}</span><span className="prob">{m.mlPredictions["ou_2_5"]?.pick_probability?.toFixed(0) || 0}%</span></div>
                    <div className="zoka-ai-stat"><span className="lbl">BTTS</span><span className="val">{m.mlPredictions["btts"]?.pick || '-'}</span><span className="prob">{m.mlPredictions["btts"]?.pick_probability?.toFixed(0) || 0}%</span></div>
                    {bestScore && <div className="zoka-ai-stat strong"><span className="lbl">Score</span><span className="val accent">{bestScore}</span></div>}
                  </div>
                </Link>
              );
            }) : <div className="zoka-empty-anim"><EmptyState icon={Brain} title="No AI Predictions Available" hint="ML Engine has not generated predictions for this date yet." /></div>}
          </div>
        )}

        {tab === 'favourites' && (
          <div className="zoka-section">
            <div className="zoka-league-hd"><Star size={18} className="gold" /><span className="zoka-league-name">Favourites</span></div>
            {favMatches.length > 0 ? favMatches.map((m,i)=><MatchCard key={`favtab-${m.id}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />) : <div className="zoka-empty-anim"><EmptyState icon={Star} title="No favourite matches." hint="Tap star on any match to add here." /></div>}
          </div>
        )}

        {tab === 'standings' && (
          <>
            <div className="zoka-pill-scroll">{MAJOR_LEAGUES.map(l => <button key={l.id} className={`zoka-pill ${selectedLeagueId === l.id ? 'active' : ''}`} onClick={() => setSelectedLeagueId(l.id)}>{l.emblem && <img src={l.emblem} alt={l.name} width="24" height="24" loading="lazy" />}{l.name}</button>)}</div>
            {standingsLoading ? <ListSkeleton count={8} /> : standingsTable.length > 0 ? (
              <div className="zoka-tbl-wrap"><table className="zoka-tbl"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>{standingsTable.map(row => <tr key={row.team?.id || row.rank}><td>{row.rank}</td><td className="flex-center gap-8">{row.team?.logo && <img src={row.team?.logo} alt="" width="20" height="20" loading="lazy" />}{row.team?.name || 'TBD'}</td><td>{row.all?.played}</td><td>{row.all?.win}</td><td>{row.all?.draw}</td><td>{row.all?.lose}</td><td>{row.all?.goals?.for}</td><td>{row.all?.goals?.against}</td><td>{row.goalsDiff > 0 ? '+' : ''}{row.goalsDiff}</td><td className="font-bold">{row.points}</td></tr>)}</tbody></table></div>
            ) : <EmptyState icon={Trophy} title="Select a competition to view standings." />}
          </>
        )}

        {tab === 'teams' && (
          <>
            <div className="zoka-pill-scroll">{MAJOR_LEAGUES.map(l => <button key={l.id} className={`zoka-pill ${selectedLeagueId === l.id ? 'active' : ''}`} onClick={() => setSelectedLeagueId(l.id)}>{l.emblem && <img src={l.emblem} alt={l.name} width="24" height="24" loading="lazy" />}{l.name}</button>)}</div>
            {teamsLoading ? <ListSkeleton count={8} /> : teamsData.length > 0 ? <div className="grid-auto-200">{teamsData.map(t => <Link to={`/team/${t.id}/${slugify(t.name)}`} key={t.id} className="zoka-team-card">{t.logo && <img src={t.logo} alt={t.name} width="32" height="32" loading="lazy" />}{t.name}</Link>)}</div> : <EmptyState icon={Users} title="Select a competition to view teams." />}
          </>
        )}
      </div>
    </div>
  );
}