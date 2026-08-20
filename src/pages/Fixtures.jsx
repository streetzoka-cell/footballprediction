// frontend/src/pages/Fixtures.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, X, Star, Volume2, VolumeX, Trophy, Users,
  ChevronRight, ChevronDown, ChevronUp, RefreshCw, Calendar, Activity, 
  Pin, Flame, Loader, Brain, TrendingUp, Check, Zap
} from 'lucide-react';

import { useFixtures, useStandings, useTeams } from '../hooks/useFixtures';
import { useQueryClient } from '@tanstack/react-query';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { getLocalDateStr, formatDateShort, todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';
import { buildMatchRoute } from '../utils/routes'; 
import { Sound } from '../utils/soundEngine';
import { applySmartMinute } from '../engine/matchEngine'; 
import MatchCard from '../components/MatchCard';
import AdSlot from '../components/AdSlot'; 
import SEO from '../components/SEO';
import { ListSkeleton, ErrorState } from '../components/StateFeedback';
import EmptyState from '../components/EmptyState';

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);

const CMT = {
  goal: ["GOOOAL! Pure strike!", "Back of the net!", "Zoka magic!"],
  ft: ["Full Time!", "Final Whistle!"],
  ht: ["Half Time!", "HT Break."],
  kickoff: ["Kick Off!", "We're underway!"],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

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
  if (!toasts.length) return null;
  return (
    <div className="zoka-toast-wrap" style={{
      position: 'fixed', top: '80px', right: '20px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '12px',
      maxWidth: '400px', pointerEvents: 'none'
    }}>
      {toasts.map(t => {
        if (t.type === 'multi-goal') {
          return (
            <div key={t.id} className="zoka-toast multi-goal" style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
              borderRadius: 'var(--r-12)', padding: '16px', boxShadow: 'var(--shadow-xl)',
              pointerEvents: 'auto', animation: 'slideInRight 0.3s ease-out'
            }}>
              <div className="flex-center gap-12">
                <span style={{ fontSize: '28px' }}>⚽</span>
                <div className="flex-1">
                  <div style={{ fontWeight: '800', color: 'var(--accent)', fontSize: '14px', marginBottom: '4px' }}>{t.count} New Match Events!</div>
                  {t.events.slice(0, 3).map((e, i) => (
                    <div key={i} className="flex-center gap-8" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {e.homeLogo && <img src={e.homeLogo} alt="" width="14" height="14" style={{borderRadius: '50%'}} />}
                      <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{e.homeName}</span> 
                      <span style={{ fontWeight: '800', color: 'var(--accent)' }}>{e.score}</span> 
                      <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{e.awayName}</span>
                      {e.awayLogo && <img src={e.awayLogo} alt="" width="14" height="14" style={{borderRadius: '50%'}} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        }
        return (
          <div key={t.id} className="zoka-toast goal-toast" onClick={() => window.location.href = buildMatchRoute(t.matchId, t.homeName, t.awayName)} style={{
            background: 'linear-gradient(135deg, var(--primary-dim) 0%, var(--primary) 100%)',
            borderRadius: 'var(--r-12)', padding: '16px', boxShadow: 'var(--shadow-primary)',
            cursor: 'pointer', pointerEvents: 'auto', animation: 'slideInRight 0.3s ease-out',
            border: '1px solid rgba(var(--primary-rgb), 0.4)'
          }}>
            <div className="flex-center gap-12">
              <span style={{ fontSize: '28px' }}>⚽</span>
              <div className="flex-1">
                <div style={{ fontWeight: '800', color: 'var(--text-inverse)', fontSize: '15px', marginBottom: '2px' }}>GOAL!</div>
                <div className="flex-center gap-8" style={{ color: 'var(--text-inverse)', fontSize: '13px' }}>
                  {t.homeLogo && <img src={t.homeLogo} alt="" width="16" height="16" style={{borderRadius: '50%'}} />}
                  <span style={{ fontWeight: '600' }}>{t.homeName}</span> 
                  <span style={{ fontWeight: '800', fontSize: '15px' }}>{t.score}</span> 
                  <span style={{ fontWeight: '600' }}>{t.awayName}</span>
                  {t.awayLogo && <img src={t.awayLogo} alt="" width="16" height="16" style={{borderRadius: '50%'}} />}
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
  if (!matches || matches.length === 0) return null;
  return (
    <div className="zoka-live-ticker">
      {matches.map(m => (
        <Link key={m.id} to={buildMatchRoute(m.id, m.homeName, m.awayName)} className="zoka-ticker-item">
          <div className="zoka-ticker-live" />
          <span className="text-muted" style={{fontSize: '10px', fontWeight: 700, minWidth: '28px'}}>{m.displayMinute}'</span>
          <span className="font-bold truncate" style={{maxWidth: '70px'}}>{m.homeName}</span>
          <span className="text-primary font-extrabold" style={{minWidth: '45px', textAlign: 'center'}}>{m.homeScore ?? 0} - {m.awayScore ?? 0}</span>
          <span className="font-bold truncate" style={{maxWidth: '70px'}}>{m.awayName}</span>
        </Link>
      ))}
    </div>
  );
});

const MatchOfTheDayCard = memo(({ match, mlPredictions }) => {
  const [isExpanded, setIsExpanded] = useState(true); // Default expanded to show AI pick
  const [userVote, setUserVote] = useState(() => localStorage.getItem(`zoka_vote_${match?.id}`));
  const [isVoting, setIsVoting] = useState(false);
  const [voteData, setVoteData] = useState(null);
  const [isLoadingVotes, setIsLoadingVotes] = useState(true);

  useEffect(() => {
    if (isExpanded && match?.id) fetchRealVotes(match.id);
  }, [isExpanded, match?.id]);

  const fetchRealVotes = async (matchId) => {
    try {
      setIsLoadingVotes(true);
      const BACKEND_URL = "https://api.zokascore.xyz";
      const res = await fetch(`${BACKEND_URL}/api/v1/predictions/${matchId}`);
      const data = await res.json();
      if (data.success) setVoteData(data);
    } catch (err) {
      console.error("Failed to fetch votes:", err);
    } finally {
      setIsLoadingVotes(false);
    }
  };

  if (!match) return null;

  const handleVote = async (choice) => {
    if (userVote || isVoting) return;
    setIsVoting(true);
    setUserVote(choice);
    localStorage.setItem(`zoka_vote_${match.id}`, choice);

    try {
      const BACKEND_URL = "https://api.zokascore.xyz"; 
      const res = await fetch(`${BACKEND_URL}/api/v1/predictions/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: String(match.id), choice: choice })
      });
      if (!res.ok) throw new Error(`Failed to submit vote`);
      await fetchRealVotes(match.id);
      if (navigator.vibrate) navigator.vibrate(15);
    } catch (err) {
      console.error("Failed to save vote:", err);
      setUserVote(null);
      localStorage.removeItem(`zoka_vote_${match.id}`);
    } finally {
      setIsVoting(false);
    }
  };

  const percentages = voteData?.percentages || { home: 0, draw: 0, away: 0 };
  const totalVotes = voteData?.totalVotes || 0;

  // ★ NEW: Extract AI Pick
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
          <div className="p-8 rounded-8" style={{ background: 'rgba(var(--gold-rgb), 0.12)', color: 'var(--gold)' }}>
            <Brain size={18} />
          </div>
          <span className="font-bold text-md" style={{ color: 'var(--text-primary)' }}>Match of the Day</span>
          {match.leagueName && (
            <span className="text-xs font-semibold px-8 py-4 rounded-4" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
              {match.leagueName}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
      </button>

      {isExpanded && (
        <div className="zoka-intel-animate flex-col gap-16 pt-16">
          <div className="flex-center justify-between gap-12 py-8">
            <div className="flex-col items-center gap-8 flex-1 min-w-0">
              {match.homeLogo ? (
                <img src={match.homeLogo} alt={match.homeName} className="object-contain drop-shadow-md" style={{ width: 56, height: 56 }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
              ) : null}
              <div className="w-14 h-14 rounded-full flex-center text-muted text-xs font-bold" style={{ background: 'var(--bg-elevated)', display: match.homeLogo ? 'none' : 'flex' }}>
                {match.homeName?.charAt(0) || 'H'}
              </div>
              <span className="font-bold text-sm text-center leading-tight truncate max-w-full" style={{ color: 'var(--text-primary)' }}>{match.homeName}</span>
            </div>
            
            <div className="flex-col items-center gap-4 flex-shrink-0 px-8">
              <div className="text-2xl font-black font-display tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {match.homeScore ?? '-'} <span className="text-muted text-lg">:</span> {match.awayScore ?? '-'}
              </div>
              <div className="zoka-status time-s" style={{ fontSize: '11px', padding: '4px 10px' }}>
                {match.isLive ? <><span className="zoka-ticker-live" style={{ marginRight: 6 }} />{match.displayMinute}'</> : match.displayMinute}
              </div>
            </div>

            <div className="flex-col items-center gap-8 flex-1 min-w-0">
              {match.awayLogo ? (
                <img src={match.awayLogo} alt={match.awayName} className="object-contain drop-shadow-md" style={{ width: 56, height: 56 }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
              ) : null}
              <div className="w-14 h-14 rounded-full flex-center text-muted text-xs font-bold" style={{ background: 'var(--bg-elevated)', display: match.awayLogo ? 'none' : 'flex' }}>
                {match.awayName?.charAt(0) || 'A'}
              </div>
              <span className="font-bold text-sm text-center leading-tight truncate max-w-full" style={{ color: 'var(--text-primary)' }}>{match.awayName}</span>
            </div>
          </div>

          {/* ★ NEW: Zoka AI Smart Pick Badge */}
          {aiPick && (
            <div className="flex-center justify-between gap-8" style={{ background: 'rgba(var(--accent-rgb), 0.05)', border: '1px solid rgba(var(--accent-rgb), 0.2)', padding: '8px 12px', borderRadius: '8px' }}>
              <div className="flex-center gap-4 text-xs font-bold uppercase" style={{ color: 'var(--accent)' }}>
                <Zap size={12} fill="currentColor" /> Zoka AI Pick
              </div>
              <div className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {formatPick(aiPick)} ({aiProb}%)
              </div>
            </div>
          )}

          <div className="flex-col gap-8">
            <div className="text-muted text-xs font-bold uppercase flex-center gap-6">
              <TrendingUp size={14} /> Community Prediction ({totalVotes} votes)
            </div>
            
            {isLoadingVotes ? (
              <div className="flex h-8 rounded-8 overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                <div className="w-full skeleton" />
              </div>
            ) : (
              <>
                <div className="flex h-8 rounded-8 overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                  <div style={{ width: `${percentages.home}%`, background: 'var(--primary)', transition: 'width 1s ease' }} />
                  <div style={{ width: `${percentages.draw}%`, background: 'var(--text-muted)', transition: 'width 1s ease' }} />
                  <div style={{ width: `${percentages.away}%`, background: 'var(--danger)', transition: 'width 1s ease' }} />
                </div>
                <div className="flex justify-between text-xs font-bold mt-4">
                  <span style={{ color: 'var(--primary)' }}>{percentages.home}% Home</span>
                  <span className="text-muted">{percentages.draw}% Draw</span>
                  <span style={{ color: 'var(--danger)' }}>{percentages.away}% Away</span>
                </div>
              </>
            )}
          </div>

          <div className="flex-col gap-12 pt-12" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-center text-xs font-bold uppercase text-muted">Cast Your Prediction</div>
            <div className="flex gap-8">
              {['home', 'draw', 'away'].map(choice => {
                const isSelected = userVote === choice;
                return (
                  <button key={choice} disabled={!!userVote || isVoting} onClick={() => handleVote(choice)} className={`zoka-vote-btn ${isSelected ? 'selected' : ''}`}>
                    <span className="capitalize">{choice}</span>
                    {isSelected && <Check size={16} />}
                  </button>
                );
              })}
            </div>
            {userVote && (
              <div className="text-center text-xs text-primary font-semibold anim-fade-in">Vote recorded successfully!</div>
            )}
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
    const updateIndicator = () => {
      if (tabsRef.current) {
        const activeBtn = tabsRef.current.querySelector(`[data-tab="${activeTab}"]`);
        if (activeBtn) {
          setIndicatorStyle({
            width: activeBtn.offsetWidth,
            transform: `translateX(${activeBtn.offsetLeft}px)`,
            left: 0,
            top: '4px'
          });
        }
      }
    };
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
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

const TOP_TEAMS_LIST = ['manchester united', 'manchester city', 'liverpool', 'chelsea', 'arsenal', 'tottenham hotspur', 'tottenham', 'real madrid', 'barcelona', 'atletico madrid', 'athletic bilbao', 'sevilla', 'valencia', 'bayern munich', 'borussia dortmund', 'rb leipzig', 'bayer leverkusen', 'paris saint germain', 'psg', 'marseille', 'lyon', 'juventus', 'inter', 'ac milan', 'napoli', 'roma', 'lazio', 'atalanta', 'benfica', 'porto', 'sporting cp', 'ajax', 'psv eindhoven', 'feyenoord', 'celtic', 'rangers', 'flamengo', 'palmeiras', 'corinthios', 'sao paulo', 'boca juniors', 'river plate'];
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
  const now = useNow(10000);

  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || todayStr());
  const { data: rawFixtures = [], isLoading: fixturesLoading, error: fixturesError } = useFixtures(selectedDate);
  const queryClient = useQueryClient();
  const { toasts, addGoal } = useToasts();
  
  const { soundEnabled = false, favorites = [], pinnedMatches = [], toggleSound = () => {}, toggleFavorite = () => {}, togglePinMatch = () => {} } = usePreferencesStore();
  const [soundType, setSoundType] = useState(localStorage.getItem('zoka_sound_type') || 'whistle');

  const isFav = useCallback(id => favorites.includes(String(id)), [favorites]);
  const isPinned = useCallback(id => pinnedMatches.includes(String(id)), [pinnedMatches]);

  const [pinnedLeagues, setPinnedLeagues] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("zoka_pinned_leagues") || '[]')); } 
    catch { return new Set(); }
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
  const [ui, setUI] = useState({ moreDatesOpen: false, leagueFilterOpen: false, showLiveOnly: false, showAllTopMatches: false, showAllLiveMatches: false });
  const toggleUI = useCallback((key) => setUI(prev => ({ ...prev, [key]: !prev[key] })), []);

  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const { data: standingsData = null, isLoading: standingsLoading } = useStandings(selectedLeagueId);
  const { data: teamsData = [], isLoading: teamsLoading } = useTeams(selectedLeagueId);

  const [expandedLeagues, setExpandedLeagues] = useState(new Set());
  const moreRef = useRef(null);
  const dateDropdownRef = useRef(null);

  const allFixtures = useMemo(() => rawFixtures.map(m => applySmartMinute(m, now)).filter(m => !m.isHidden), [rawFixtures, now]);
  const liveMatches = useMemo(() => allFixtures.filter(m => m.isLive), [allFixtures]);
  
  // Extract all matches that have ML Predictions
  const predictedMatches = useMemo(() => {
    return allFixtures.filter(m => m.mlPredictions && m.mlPredictions["1x2"]);
  }, [allFixtures]);

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
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        addGoal({ matchId: m.id, homeName: m.homeName, awayName: m.awayName, score: `${m.homeScore}-${m.awayScore}`, homeLogo: m.homeLogo, awayLogo: m.awayLogo, league: m.leagueName });

        if (Notification.permission === 'granted') {
          const body = `${m.homeName} ${m.homeScore}-${m.awayScore} ${m.awayName}\n${m.leagueName}`;
          const notif = new Notification('⚽ GOAL!', { body, icon: scoringTeamLogo, badge: m.leagueLogo, tag: m.id, data: { url: `/match/${m.id}` } });
          notif.onclick = (e) => { e.preventDefault(); window.focus(); window.location.href = `/match/${m.id}`; };
        }
      }
      prevScores.current.set(id, { h: m.homeScore, a: m.awayScore });
    });
  }, [liveMatches, addGoal]);

  useEffect(() => { 
    Sound.on = soundEnabled; 
    Sound.type = soundType;
    localStorage.setItem('zoka_sound_type', soundType);
    Sound.unlock(); 
  }, [soundEnabled, soundType]);

  useEffect(() => {
    const handler = (e) => { 
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target)) {
        setUI(prev => ({ ...prev, moreDatesOpen: false }));
      }
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setUI(prev => ({ ...prev, leagueFilterOpen: false }));
      }
    };
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

  const itemListSchema = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Today's Football Fixtures & Live Scores",
    "itemListElement": displayFixtures.slice(0, 50).map((m, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": `${window.location.origin}${buildMatchRoute(m.id, m.homeName, m.awayName)}`
    }))
  }), [displayFixtures]);

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
      const pA = pinnedLeagues.has(a.name) ? 0 : 1; const pB = pinnedLeagues.has(b.name) ? 0 : 1;
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

  const liveCount = useMemo(() => allFixtures.filter(m => m.isLive).length, [allFixtures]);
  const favMatches = useMemo(() => displayFixtures.filter(m => favorites.includes(String(m.id))), [displayFixtures, favorites]);
  const visibleLiveMatches = ui.showAllLiveMatches ? liveMatches : liveMatches.slice(0, 5);
  const hiddenLiveCount = liveMatches.length - 5;

  const handleRefresh = useCallback(async () => { 
    queryClient.invalidateQueries(['fixtures', selectedDate]);
  }, [queryClient, selectedDate]);

  useEffect(() => {
    if ((tab === 'standings' || tab === 'teams') && !selectedLeagueId) setSelectedLeagueId('39');
  }, [tab, selectedLeagueId]);

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
          <button className="zoka-icon-btn" style={{ opacity: isLeaguePinned ? 1 : 0.5, color: isLeaguePinned ? 'var(--primary)' : 'var(--text-muted)' }} onClick={() => togglePinnedLeague(group.name)} title="Pin League">
            <Pin size={12} fill={isLeaguePinned ? 'var(--primary)' : 'none'} />
          </button>
        </div>
        {visibleMatches.map((m, i) => (
          <MatchCard key={`${m.id}-${i}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />
        ))}
        {hiddenCount > 0 && (
          <button className="zoka-show-more" onClick={() => toggleLeagueExpand(group.name)}>
            {isExpanded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            {isExpanded ? 'Show less' : `Show ${hiddenCount} more matches`}
          </button>
        )}
      </div>
    );
  };

  if (fixturesError && allFixtures.length === 0) {
    return (
      <div className="zoka-page">
        <SEO title="Football Fixtures, Live Scores & League Tables" description="Explore today's football fixtures..." keywords="football fixtures, live scores..." robots="index,follow" />
        <div className="zoka-wrap" style={{ paddingTop: '20px' }}>
          <ErrorState error={fixturesError} onRetry={handleRefresh} />
        </div>
      </div>
    );
  }

  return (
    <div className="zoka-page">
      <SEO 
        title="Football Fixtures, Live Scores & AI Predictions" 
        description="Explore today's football fixtures, live scores, and AI predictions from top leagues worldwide." 
        keywords="football fixtures, live scores, predictions, premier league, champions league" 
        robots="index,follow" 
        structuredData={itemListSchema}
      />
      <ToastContainer toasts={toasts} />
      
      <div className="zoka-wrap">
        <div className="zoka-hdr">
          <div className="zoka-hdr-title">
            <h1 className="flex-center gap-8"><Activity size={18} style={{ color: 'var(--primary)' }} /> Zoka <span style={{ color: 'var(--primary)' }}>Live</span></h1>
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
          <div className="glass-card flex-center gap-8 mb-16" style={{ background: 'rgba(var(--primary-rgb), 0.08)', border: '1px solid rgba(var(--primary-rgb), 0.2)', color: 'var(--primary)', padding: '8px 12px', borderRadius: '10px', fontSize: '0.75em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Loader size={14} className="anim-spin" /> Syncing Main Fixtures...
          </div>
        )}
        
        <div className="zoka-stats">
          <div className="zoka-schip"><div className="val" style={{ color: 'var(--danger)' }}>{liveCount}</div><div className="lbl">Live</div></div>
          <div className="zoka-schip"><div className="val">{displayFixtures.length}</div><div className="lbl">Matches</div></div>
          <div className="zoka-schip"><div className="val">{favorites.length}</div><div className="lbl">Favourites</div></div>
        </div>

        <div className="zoka-datenav" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 100 }}>
          <button className={`zoka-nav-btn ${selectedDate === yesterdayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(yesterdayStr())}>Yesterday</button>
          <button className={`zoka-nav-btn ${selectedDate === todayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(todayStr())}>Today</button>
          <button className={`zoka-nav-btn ${selectedDate === tomorrowStr() ? 'active' : ''}`} onClick={() => setSelectedDate(tomorrowStr())}>Tomorrow</button>
          
          <div className="zoka-more-wrap" ref={dateDropdownRef} style={{ position: 'relative' }}>
            <button className={`zoka-more-btn ${ui.moreDatesOpen ? 'open' : ''}`} onClick={() => setUI(prev => ({ ...prev, moreDatesOpen: !prev.moreDatesOpen }))}>
              <Calendar size={16} /> 
              <span>More</span>
              <ChevronDown size={16} style={{ transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', transform: ui.moreDatesOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>
            <div className="zoka-more-dropdown" style={{ maxHeight: ui.moreDatesOpen ? '450px' : '0', opacity: ui.moreDatesOpen ? '1' : '0', visibility: ui.moreDatesOpen ? 'visible' : 'hidden', padding: ui.moreDatesOpen ? 'var(--sp-8)' : '0 var(--sp-8)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              <div className="zoka-more-label">Past Dates</div>
              {dates.past.map(d => (
                <button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>
              ))}
              <div className="zoka-more-label" style={{ marginTop: '12px' }}>Future Dates</div>
              {dates.future.map(d => (
                <button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>
              ))}
            </div>
          </div>
        </div>

        <TabBar tabs={['fixtures', 'predictions', 'favourites', 'standings', 'teams']} activeTab={tab} onTabChange={setTab} />

        <div className="zoka-search-static">
          <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input type="text" placeholder="Search teams or leagues..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
          {searchQ && <button className="zoka-search-clear" onClick={() => setSearchQ('')}><X size={18} /></button>}
        </div>

        {tab === 'fixtures' && (
          <>
            <div className="zoka-pill-scroll" style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
              {[{ key: 'all', label: 'All Matches' }, { key: 'live', label: 'Live (Real-time)' }, { key: 'finished', label: 'Finished Results' }].map(tf => (
                <button key={tf.key} className={`zoka-pill ${timeFilter === tf.key ? 'active' : ''}`} onClick={() => setTimeFilter(tf.key)}>{tf.label}</button>
              ))}
            </div>

            {fixturesLoading ? (
              <div className="zoka-skel-featured" />
            ) : (
              <MatchOfTheDayCard match={featuredMatch} mlPredictions={featuredMatch?.mlPredictions} />
            )}

            {/* Snippet for AI Predictions on main fixtures tab */}
            {!searchQ && timeFilter === 'all' && predictedMatches.length > 0 && (
              <div className="zoka-section zoka-ai-section">
                <div className="zoka-league-hd">
                  <Brain size={18} style={{ color: 'var(--accent)' }} />
                  <span className="zoka-league-name">Zoka AI Predictions</span>
                </div>
                {predictedMatches.slice(0, 3).map((m, i) => (
                  <Link to={buildMatchRoute(m.id, m.homeName, m.awayName)} key={`ai-${m.id}`} className="zoka-card zoka-ai-card" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="zoka-ai-top">
                      <span className="zoka-ai-comp">{m.leagueName}</span>
                      <span className="zoka-ai-time">{m.kickoff || m.statusLabel}</span>
                    </div>
                    <div className="zoka-ai-teams">
                      <span className="zoka-ai-team">{m.homeName}</span>
                      <span className="zoka-ai-vs">VS</span>
                      <span className="zoka-ai-team">{m.awayName}</span>
                    </div>
                    <div className="zoka-ai-probbar">
                      <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.HOME_WIN || 33}%`, background: 'var(--primary)' }} />
                      <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.DRAW || 33}%`, background: 'var(--text-muted)' }} />
                      <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.AWAY_WIN || 33}%`, background: 'var(--danger)' }} />
                    </div>
                    <div className="zoka-ai-labels">
                      <span>{m.mlPredictions["1x2"]?.probabilities.HOME_WIN ? m.mlPredictions["1x2"].probabilities.HOME_WIN.toFixed(0) : 33}%</span>
                      <span>{m.mlPredictions["1x2"]?.probabilities.DRAW ? m.mlPredictions["1x2"].probabilities.DRAW.toFixed(0) : 33}%</span>
                      <span>{m.mlPredictions["1x2"]?.probabilities.AWAY_WIN ? m.mlPredictions["1x2"].probabilities.AWAY_WIN.toFixed(0) : 33}%</span>
                    </div>
                  </Link>
                ))}
                <button className="zoka-show-more" onClick={() => setTab('predictions')}>
                  <Brain size={16} /> View All Predictions ({predictedMatches.length})
                </button>
              </div>
            )}

            {topMatches.length > 0 && !searchQ && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <Flame size={18} style={{ color: 'var(--gold)' }} />
                  <span className="zoka-league-name">Top Matches</span>
                </div>
                {visibleTopMatches.map((m, i) => (
                  <MatchCard key={`top-${m.id}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />
                ))}
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
                  <span className="live-pulse-dot" style={{ marginRight: 6 }}></span>
                  <span className="zoka-league-name">Live Matches</span>
                </div>
                {visibleLiveMatches.map((m, i) => (
                  <MatchCard key={`live-${m.id}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />
                ))}
                {hiddenLiveCount > 0 && (
                  <button className="zoka-show-more" onClick={() => toggleUI('showAllLiveMatches')}>
                    {ui.showAllLiveMatches ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {ui.showAllLiveMatches ? 'Show less' : `Show ${hiddenLiveCount} more live matches`}
                  </button>
                )}
              </div>
            )}
            
            <AdSlot id="fixt-ad-1" mobile={true} desktop={true} />

            {fixturesLoading && isPrimaryDate ? (
              <ListSkeleton count={5} />
            ) : displayFixtures.length === 0 ? (
              <div className="zoka-empty-anim" style={{padding: '40px 0'}}>
                <EmptyState icon={Calendar} title="No fixtures scheduled for this date." hint="Try another date or clear your search." action={searchQ ? <button className="zoka-pill" onClick={() => setSearchQ('')} style={{marginTop: 8}}>Clear Search</button> : null} />
              </div>
            ) : (
              <>
                {favMatches.length > 0 && (
                  <div className="zoka-section">
                    <div className="zoka-league-hd"><Star size={18} style={{ color: 'var(--gold)' }} /><span className="zoka-league-name">Favourites</span></div>
                    {favMatches.map((m, i) => (
                      <MatchCard key={`fav-${m.id}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />
                    ))}
                  </div>
                )}

                {topLeagues.map(group => renderLeagueSection(group))}

                {otherLeagues.length > 0 && !ui.leagueFilterOpen && (
                  <button className="zoka-show-more" onClick={() => toggleUI('leagueFilterOpen')} style={{ marginTop: '8px' }}>
                    <ChevronDown size={16} /> Show {otherLeagues.length} more leagues
                  </button>
                )}

                {(ui.leagueFilterOpen || compFilter !== 'ALL') && otherLeagues.map(group => renderLeagueSection(group))}

                <nav className="zoka-seo-links glass-card p-24 mt-24" aria-label="Match and league directory">
                  <h3 className="text-primary font-bold mb-12 text-lg">Today's Match Directory</h3>
                  <ul className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
                    {displayFixtures.slice(0, 60).map(m => (
                      <li key={m.id}>
                        <Link to={buildMatchRoute(m.id, m.homeName, m.awayName)} className="zoka-seo-link text-sm hover:text-primary transition-colors" rel="bookmark">{m.homeName} vs {m.awayName}</Link>
                      </li>
                    ))}
                  </ul>
                  <h3 className="text-primary font-bold mt-24 mb-12 text-lg">Explore Leagues</h3>
                  <ul className="flex flex-wrap gap-8">
                    {MAJOR_LEAGUES.map(c => (
                      <li key={c.id}><Link to={`/league/${c.id}/${slugify(c.name)}`} className="zoka-seo-link badge text-xs">{c.name}</Link></li>
                    ))}
                  </ul>
                </nav>
              </>
            )}
          </>
        )}

        {/* ★ NEW: DEDICATED PREDICTIONS TAB ★ */}
        {tab === 'predictions' && (
          <div className="zoka-section">
            <div className="zoka-league-hd">
              <Brain size={18} style={{ color: 'var(--accent)' }} />
              <span className="zoka-league-name">Zoka AI Predictions</span>
              <span className="zoka-league-count">{predictedMatches.length}</span>
            </div>
            {predictedMatches.length > 0 ? (
              predictedMatches.map((m, i) => (
                <Link to={buildMatchRoute(m.id, m.homeName, m.awayName)} key={`pred-${m.id}`} className="zoka-card zoka-ai-card" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="zoka-ai-top">
                    <span className="zoka-ai-comp">{m.leagueName}</span>
                    <span className="zoka-ai-time">{m.kickoff || m.statusLabel}</span>
                  </div>
                  <div className="zoka-ai-teams">
                    <span className="zoka-ai-team">{m.homeName}</span>
                    <span className="zoka-ai-vs">VS</span>
                    <span className="zoka-ai-team">{m.awayName}</span>
                  </div>
                  {/* 1X2 Probabilities */}
                  <div className="zoka-ai-probbar">
                    <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.HOME_WIN || 33}%`, background: 'var(--primary)' }} />
                    <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.DRAW || 33}%`, background: 'var(--text-muted)' }} />
                    <div style={{ width: `${m.mlPredictions["1x2"]?.probabilities.AWAY_WIN || 33}%`, background: 'var(--danger)' }} />
                  </div>
                  <div className="zoka-ai-labels">
                    <span>{m.mlPredictions["1x2"]?.probabilities.HOME_WIN ? m.mlPredictions["1x2"].probabilities.HOME_WIN.toFixed(0) : 33}%</span>
                    <span>{m.mlPredictions["1x2"]?.probabilities.DRAW ? m.mlPredictions["1x2"].probabilities.DRAW.toFixed(0) : 33}%</span>
                    <span>{m.mlPredictions["1x2"]?.probabilities.AWAY_WIN ? m.mlPredictions["1x2"].probabilities.AWAY_WIN.toFixed(0) : 33}%</span>
                  </div>
                  
                  {/* O/U & BTTS Quick Stats */}
                  <div className="zoka-ai-extras">
                    <div className="zoka-ai-stat">
                      <span className="lbl">O/U 2.5</span>
                      <span className="val">{m.mlPredictions["ou_2_5"]?.pick || '-'}</span>
                      <span className="prob">{m.mlPredictions["ou_2_5"]?.pick_probability ? m.mlPredictions["ou_2_5"].pick_probability.toFixed(0) : 0}%</span>
                    </div>
                    <div className="zoka-ai-stat">
                      <span className="lbl">BTTS</span>
                      <span className="val">{m.mlPredictions["btts"]?.pick || '-'}</span>
                      <span className="prob">{m.mlPredictions["btts"]?.pick_probability ? m.mlPredictions["btts"].pick_probability.toFixed(0) : 0}%</span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="zoka-empty-anim" style={{padding: '40px 0'}}>
                <EmptyState icon={Brain} title="No AI Predictions Available" hint="The ZOKASCORE V2 ML Engine has not generated predictions for this date yet." />
              </div>
            )}
          </div>
        )}

        {tab === 'favourites' && (
          <div className="zoka-section">
            <div className="zoka-league-hd"><Star size={18} style={{ color: 'var(--gold)' }} /><span className="zoka-league-name">Favourites</span></div>
            {favMatches.length > 0 ? (
              favMatches.map((m, i) => (
                <MatchCard key={`favtab-${m.id}`} m={m} i={i} isFav={isFav(m.id)} isPinned={isPinned(m.id)} togglePinMatch={togglePinMatch} toggleFavorite={toggleFavorite} handleReactNow={handleReactNow} />
              ))
            ) : (
              <div className="zoka-empty-anim" style={{padding: '40px 0'}}>
                <EmptyState icon={Star} title="No favourite matches for this date." hint="Tap the star icon on any match to add it here." />
              </div>
            )}
          </div>
        )}

        {tab === 'standings' && (
          <>
            <div className="zoka-pill-scroll" style={{ marginBottom: '10px' }}>
              {MAJOR_LEAGUES.map(l => (
                <button key={l.id} className={`zoka-pill ${selectedLeagueId === l.id ? 'active' : ''}`} onClick={() => setSelectedLeagueId(l.id)}>
                  {l.emblem && <img src={l.emblem} alt={l.name} width="24" height="24" loading="lazy" />}{l.name}
                </button>
              ))}
            </div>
            {standingsLoading ? (
              <ListSkeleton count={8} />
            ) : standingsTable.length > 0 ? (
              <div className="zoka-tbl-wrap">
                <table className="zoka-tbl">
                  <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead>
                  <tbody>
                    {standingsTable.map(row => (
                      <tr key={row.team?.id || row.rank}>
                        <td>{row.rank}</td>
                        <td className="flex-center gap-8">{row.team?.logo && <img src={row.team?.logo} alt="" width="20" height="20" loading="lazy" />}{row.team?.name || 'TBD'}</td>
                        <td>{row.all?.played}</td><td>{row.all?.win}</td><td>{row.all?.draw}</td><td>{row.all?.lose}</td>
                        <td>{row.all?.goals?.for}</td><td>{row.all?.goals?.against}</td>
                        <td>{row.goalsDiff > 0 ? '+' : ''}{row.goalsDiff}</td>
                        <td style={{ fontWeight: 700 }}>{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : ( <EmptyState icon={Trophy} title="Select a competition to view standings." /> ) }
          </>
        )}

        {tab === 'teams' && (
          <>
            <div className="zoka-pill-scroll" style={{ marginBottom: '10px' }}>
              {MAJOR_LEAGUES.map(l => (
                <button key={l.id} className={`zoka-pill ${selectedLeagueId === l.id ? 'active' : ''}`} onClick={() => setSelectedLeagueId(l.id)}>
                  {l.emblem && <img src={l.emblem} alt={l.name} width="24" height="24" loading="lazy" />}{l.name}
                </button>
              ))}
            </div>
            {teamsLoading ? (
              <ListSkeleton count={8} />
            ) : teamsData.length > 0 ? (
              <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {teamsData.map(t => (
                  <Link to={`/team/${t.id}/${slugify(t.name)}`} key={t.id} className="zoka-team-card flex-center gap-8" style={{textDecoration: 'none', color: 'inherit'}}>
                    {t.logo && <img src={t.logo} alt={t.name} width="32" height="32" loading="lazy" style={{objectFit:'contain', margin: 0}} />}
                    <div className="text-primary font-bold text-sm">{t.name}</div>
                  </Link>
                ))}
              </div>
            ) : ( <EmptyState icon={Users} title="Select a competition to view teams." /> ) }
          </>
        )}
      </div>
    </div>
  );
}