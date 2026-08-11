import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, Calendar, Zap, TrendingUp, Camera, Clock, Trophy, 
  Tv, BarChart3, MapPin, Shield, Users, Target, Activity, Brain, HelpCircle 
} from 'lucide-react';

import SEO from '../components/SEO';
import AdSlot from '../components/AdSlot'; 
import MatchIntelligence from '../components/MatchIntelligence';
import { useFixtures, useStandings } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr, formatTime } from '../utils/dates';
import { buildMatchRoute, buildTeamRoute, buildLeagueRoute } from '../utils/routes';
import { applySmartMinute, normalizeMatch } from '../engine/matchEngine'; 
import { seoGenerators, buildSEO, howToSchema } from '../utils/seoBuilder';
import { footballApi } from '../services/footballApi';

function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

const LEAGUE_BROADCASTERS = {
  '39': [{ name: 'Peacock', color: '#000000', url: 'https://www.peacocktv.com' }, { name: 'Sky Sports', color: '#0072c6', url: 'https://www.skysports.com' }],
  '140': [{ name: 'ESPN+', color: '#d00d1e', url: 'https://www.espn.com' }, { name: 'beIN SPORTS', color: '#fa9000', url: 'https://www.beinsports.com' }],
};
const FALLBACK_BROADCASTERS = [{ name: 'FIFA+', color: '#dd2848', url: 'https://www.plus.fifa.com' }, { name: 'UEFA.tv', color: '#00349e', url: 'https://www.uefa.tv' }];

const useCountdown = (targetDate) => {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    if (!targetDate) return;
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) return setTimeLeft('Starting soon...');
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return timeLeft;
};

const StatBar = ({ label, home, away, isPercentage = false }) => {
  if (home == null && away == null) return null;
  const h = Number(home) || 0;
  const a = Number(away) || 0;
  const total = h + a || 1;
  const hPct = (h / total) * 100;
  const aPct = (a / total) * 100;

  return (
    <div className="flex-col gap-4 mb-16">
      <div className="flex-between text-primary font-bold text-sm">
        <span style={{ width: '40px', textAlign: 'left' }}>{isPercentage ? `${h}%` : h}</span>
        <span className="text-muted text-xs uppercase tracking-wider">{label}</span>
        <span style={{ width: '40px', textAlign: 'right' }}>{isPercentage ? `${a}%` : a}</span>
      </div>
      <div className="flex h-6 rounded-md overflow-hidden bg-elevated">
        <div style={{ width: `${hPct}%`, background: 'var(--primary)', transition: 'width 1s ease' }}></div>
        <div style={{ width: `${aPct}%`, background: 'var(--danger)', transition: 'width 1s ease' }}></div>
      </div>
    </div>
  );
};

export default function MatchDetails() {
  const { matchId } = useParams();
  const now = useNow(10000);
  
  const { data: todayFx = [] } = useFixtures(todayStr());
  const { data: yestFx = [] } = useFixtures(getLocalDateStr(-1));
  const { data: tomFx = [] } = useFixtures(getLocalDateStr(1));

  // ★ FIX: Fallback to fetching directly from API if match is older than 1 day
  const { data: fallbackMatchData } = useQuery({
    queryKey: ['match-details-fallback', matchId],
    queryFn: () => footballApi.getMatchDetails(matchId).then(res => res?.data || null),
    enabled: !!matchId,
    staleTime: 1000 * 60 * 60,
  });

  const match = useMemo(() => {
    const all = [...todayFx, ...tomFx, ...yestFx];
    const found = all.find(m => String(m.id) === String(matchId));
    
    if (found) return applySmartMinute(found, now);
    if (fallbackMatchData) return normalizeMatch(fallbackMatchData, true, now); 
    
    return null;
  }, [todayFx, yestFx, tomFx, matchId, now, fallbackMatchData]);

  const standingsLeagueId = match?.leagueId;
  const { data: standingsData } = useStandings(standingsLeagueId);
  const standingsTable = standingsData?.standings?.[0] || [];

  const homeTeamId = match?.homeTeamId || match?.homeTeam?.id;
  const awayTeamId = match?.awayTeamId || match?.awayTeam?.id;



  const { data: homeResults = [] } = useQuery({
    queryKey: ['team-results', homeTeamId],
    queryFn: () => footballApi.getResults({ teamId: homeTeamId, limit: 6 }).then(res => res.data || []),
    enabled: !!homeTeamId,
    staleTime: 1000 * 60 * 60,
  });

  const { data: awayResults = [] } = useQuery({
    queryKey: ['team-results', awayTeamId],
    queryFn: () => footballApi.getResults({ teamId: awayTeamId, limit: 6 }).then(res => res.data || []),
    enabled: !!awayTeamId,
    staleTime: 1000 * 60 * 60,
  });

  // ★ NEW: Fetch Deep Match Intelligence
  const { data: intelData } = useQuery({
    queryKey: ['match-intel', match?.homeName, match?.awayName],
    queryFn: () => footballApi.getMatchIntelligence(match.homeName, match.awayName).then(res => res?.data || null),
    enabled: !!match?.homeName && !!match?.awayName,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  const [goalFlash, setGoalFlash] = useState(false);
  const prevScore = useRef({ home: match?.homeScore, away: match?.awayScore });

  useEffect(() => {
    if (match && match.homeScore != null && match.awayScore != null) {
      if (match.homeScore !== prevScore.current.home || match.awayScore !== prevScore.current.away) {
        setGoalFlash(true);
        const timer = setTimeout(() => setGoalFlash(false), 2000);
        prevScore.current = { home: match.homeScore, away: match.awayScore };
        return () => clearTimeout(timer);
      }
    } else if (match) {
      prevScore.current = { home: match.homeScore, away: match.awayScore };
    }
  }, [match]);

  const matchLink = match ? buildMatchRoute(match.id, match.homeName, match.awayName) : `/match/${matchId}`;
  const countdown = useCountdown(match?.isScheduled ? match.utcDate : null);

  const seo = useMemo(() => {
    if (!match) {
      return buildSEO({ title: "Match Details", description: "Loading match details...", path: `/match/${matchId}` });
    }
    
    const howTo = howToSchema({
      title: `How to Predict & Analyze ${match.homeName} vs ${match.awayName}`,
      description: `Step-by-step guide to analyzing the ${match.leagueName} match between ${match.homeName} and ${match.awayName}.`,
      image: match.homeLogo || match.awayLogo,
      steps: [
        { name: "Check Head-to-Head", text: `Review the historical results and recent form of ${match.homeName} and ${match.awayName}.` },
        { name: "Analyze Tactics", text: "Use the Zoka AI button to generate a tactical breakdown of team formations and key player matchups." },
        { name: "Monitor Live Stats", text: "Once the match starts, track possession, shots on target, and momentum shifts in real-time." },
        { name: "Lock Your Prediction", text: "Head to the Predictions hub to submit your exact score prediction and earn leaderboard points." }
      ]
    });

    const baseSeo = seoGenerators.matchPage({
      homeName: match.homeName, awayName: match.awayName, leagueName: match.leagueName,
      date: match.date, venue: match.venue, isLive: match.isLive, isFinished: match.isFinished,
      homeScore: match.homeScore, awayScore: match.awayScore, path: matchLink,
      homeLogo: match.homeLogo, awayLogo: match.awayLogo, leagueLogo: match.leagueLogo, referee: match.referee,
      homeId: homeTeamId, awayId: awayTeamId, leagueId: match.leagueId,
    });

    baseSeo.structuredData = [...(baseSeo.structuredData || []), howTo];
    return baseSeo;

  }, [match, matchId, matchLink, homeTeamId, awayTeamId]);

  return (
    <div className="md-page">
      <SEO {...seo} />
      
      {match && (
        <h1 style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
          {match.homeName} vs {match.awayName} - {match.leagueName} Live Score & Statistics
        </h1>
      )}

      {match?.isHidden ? (
        <div className="zoka-page flex-center p-32">
          <div className="glass-card flex-col items-center text-center p-32 gap-12">
            <Clock size={32} className="text-gold" />
            <h2 className="text-primary">Match Temporarily Unavailable</h2>
            <p className="text-muted">We are waiting for the final confirmation from the data provider.</p>
            <Link to="/fixtures" className="btn btn-ghost"><ArrowLeft size={14} /> Back to Fixtures</Link>
          </div>
        </div>
      ) : !match ? (
        <div className="zoka-page flex-center p-32">
          <div className="flex-col gap-16 w-full max-w-800">
            <div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 24 }} />
            <div className="skeleton" style={{ width: '100%', height: 100, borderRadius: 16 }} />
          </div>
        </div>
      ) : (
        <div className="md-container">
          <Link to="/fixtures" className="btn btn-ghost btn-sm mb-16">
            <ArrowLeft size={14} /> Back to Fixtures
          </Link>

          <div className={`md-header-card ${goalFlash ? 'goal-flash' : ''}`}>
            {goalFlash && (
              <div className="absolute inset-0 flex-center pointer-events-none">
                <span className="text-5xl" style={{ animation: 'zk-confetti 1.5s ease-out forwards' }}>🎉</span>
              </div>
            )}
            
            <div className="flex-center gap-8 mb-24">
              {match.leagueLogo && <img src={match.leagueLogo} alt="" width="20" height="20" />}
              <Link to={buildLeagueRoute(match.leagueId, match.leagueName)} className="text-muted font-bold text-sm hover:text-primary">{match.leagueName}</Link>
              {match.category === 'FEATURED' && <span className="badge badge-gold">★ TOP MATCH</span>}
            </div>
            
            <div className="md-teams">
              <Link to={buildTeamRoute(homeTeamId, match.homeName)} className="md-team">
                {match.homeLogo && <img src={match.homeLogo} alt={match.homeName} />}
                <h2 className="md-team-name">{match.homeName}</h2>
              </Link>
              
              <div className="md-score-block">
                <div className={`md-score ${match.isLive ? 'live' : ''} ${goalFlash ? 'pop' : ''}`}>
                  {(match.isLive || match.isHT || match.isFinished) ? `${match.homeScore ?? '-'} : ${match.awayScore ?? '-'}` : 'VS'}
                </div>
                <div className={`status-badge ${match.statusClass || 'status-upcoming'}`}>
                  {match.isLive && !match.isHT && <span className="zk-live-pulse-dot mr-2" />}
                  {match.isScheduled ? countdown : match.statusLabel}
                </div>
              </div>

              <Link to={buildTeamRoute(awayTeamId, match.awayName)} className="md-team">
                {match.awayLogo && <img src={match.awayLogo} alt={match.awayName} />}
                <h2 className="md-team-name">{match.awayName}</h2>
              </Link>
            </div>

            {(match.isLive || match.isFinished) && (
              <div className="md-timeline">
                <div className="md-timeline-fill" style={{ width: `${match.timelineProgress}%` }}>
                  {match.isLive && <div className="md-timeline-dot" style={{ left: '100%' }} />}
                </div>
                <div className="flex-between text-muted text-xs mt-8">
                  <span>0'</span><span>45'</span><span>90'</span>
                </div>
              </div>
            )}
          </div>

          {match.aiPreview && (
            <div className="glass-card p-24 mb-24" style={{ borderLeft: '4px solid var(--accent)' }}>
              <h2 className="text-primary font-bold flex-center gap-8 mb-12" style={{ justifyContent: 'flex-start' }}>
                <Brain size={18} className="text-accent" /> Zoka AI Tactical Preview
              </h2>
              <p className="text-muted text-sm leading-relaxed" style={{ whiteSpace: 'pre-line' }}>
                {match.aiPreview}
              </p>
            </div>
          )}

          <div className="md-pro-grid">
            <div className="glass-card p-20 flex-col gap-12">
              <h3 className="text-muted text-xs font-bold uppercase flex-center gap-4 mb-8"><MapPin size={12} /> Match Context</h3>
              <div className="flex-col gap-12">
                {match.date && (
                  <div className="flex-between text-sm">
                    <span className="text-muted flex-center gap-6"><Calendar size={14} /> Kickoff</span>
                    <span className="text-primary font-bold">{new Date(match.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {formatTime(match.date)}</span>
                  </div>
                )}
                {match.venue?.name && (
                  <div className="flex-between text-sm">
                    <span className="text-muted flex-center gap-6"><MapPin size={14} /> Venue</span>
                    <span className="text-primary font-bold text-right">{match.venue.name}</span>
                  </div>
                )}
                {match.referee && (
                  <div className="flex-between text-sm">
                    <span className="text-muted flex-center gap-6"><Shield size={14} /> Referee</span>
                    <span className="text-primary font-bold text-right">{match.referee}</span>
                  </div>
                )}
                {!match.date && !match.venue?.name && !match.referee && (
                  <div className="text-muted text-sm text-center py-8">Match details will be updated shortly.</div>
                )}
              </div>
            </div>
            
            <div className="glass-card p-20 flex-col gap-12">
              <h3 className="text-muted text-xs font-bold uppercase flex-center gap-4 mb-8"><Users size={12} /> League Standing</h3>
              {standingsTable.length > 0 ? (
                <div className="flex-col gap-4">
                  {standingsTable.slice(0, 5).map((team, i) => (
                    <Link key={team.team?.id || i} to={buildTeamRoute(team.team?.id, team.team?.name)} className="flex-between items-center p-8 hover:bg-card-hover rounded-md transition-colors" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <span className="text-muted font-bold w-6 text-center">{team.rank || i + 1}</span>
                      <div className="flex-center gap-8 flex-1 min-w-0">
                        {team.team?.logo && <img src={team.team?.logo} alt="" width="18" height="18" />}
                        <span className="text-primary font-bold text-sm truncate">{team.team?.name || 'TBD'}</span>
                      </div>
                      <span className="text-primary font-extrabold text-sm">{team.points} <small className="text-muted font-normal">pts</small></span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-muted text-sm text-center py-8">Standings data loading...</div>
              )}
            </div>
          </div>

          {match.hasRealStats ? (
            <div className="glass-card p-24 mb-24 mt-24">
              <h2 className="text-primary font-bold flex-center gap-8 mb-24"><BarChart3 size={18} /> Match Statistics</h2>
              {match.stats?.possession && <StatBar label="Possession" home={match.stats.possession.home} away={match.stats.possession.away} isPercentage />}
              {match.stats?.shotsOnTarget && <StatBar label="Shots on Target" home={match.stats.shotsOnTarget.home} away={match.stats.shotsOnTarget.away} />}
              {match.stats?.shots && <StatBar label="Total Shots" home={match.stats.shots.home} away={match.stats.shots.away} />}
              {match.stats?.corners && <StatBar label="Corners" home={match.stats.corners.home} away={match.stats.corners.away} />}
              {match.stats?.fouls && <StatBar label="Fouls" home={match.stats.fouls.home} away={match.stats.fouls.away} />}
              {match.stats?.yellowCards && <StatBar label="Yellow Cards" home={match.stats.yellowCards.home} away={match.stats.yellowCards.away} />}
              {match.stats?.redCards && <StatBar label="Red Cards" home={match.stats.redCards.home} away={match.stats.redCards.away} />}
            </div>
          ) : (
            <div className="glass-card p-24 mb-24 mt-24 flex-col items-center text-center gap-12" style={{ border: '1px solid rgba(var(--primary-rgb), 0.2)', background: 'linear-gradient(180deg, rgba(var(--primary-rgb), 0.03) 0%, var(--bg-card) 100%)' }}>
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                <div style={{ position: 'absolute', inset: '-8px', background: 'rgba(var(--primary-rgb), 0.15)', borderRadius: '50%', filter: 'blur(12px)' }}></div>
                <div style={{ position: 'relative', width: '56px', height: '56px', background: 'rgba(var(--primary-rgb), 0.1)', border: '1px solid rgba(var(--primary-rgb), 0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity size={24} className="text-primary" />
                </div>
              </div>
              <h3 className="text-primary font-extrabold text-lg">Tactical Insight Pending</h3>
              <p className="text-muted text-sm max-w-400">
                {match.isLive ? 'Live stats are being tracked. While we wait, ask our AI for tactical insights on this match!' :
                 match.isFinished ? 'Stats data for this match is still syncing. Ask Zoka AI for a full breakdown!' :
                 'Stats will appear here once the match begins. Ask Zoka AI for pre-match analysis!'}
              </p>
              <button 
                onClick={() => window.dispatchEvent(new CustomEvent('openZokaAI', { detail: { message: `Give me a tactical breakdown and prediction for ${match.homeName} vs ${match.awayName} in the ${match.leagueName}.` } }))} 
                className="btn btn-primary mt-8 flex-center gap-8"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))' }}
              >
                <Zap size={16} fill="currentColor" /> Ask Zoka AI
              </button>
            </div>
          )}

          {/* ★ NEW: ZOKA MATCH INTELLIGENCE (Elo, Form, Goal Patterns, H2H History) */}
          <MatchIntelligence data={intelData} homeName={match.homeName} awayName={match.awayName} />

          {/* ★ NEW: DEDICATED ODDS SECTION (With Fallbacks) */}
          <div className="glass-card p-24 mb-24 mt-24">
            <h2 className="text-primary font-bold flex-center gap-8 mb-16" style={{justifyContent: 'flex-start'}}>
              <Shield size={18} /> Betting Odds & Markets
            </h2>
            
            {match.odds && (match.odds.home || match.odds.away) ? (
              <div className="grid gap-12" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="text-center p-12 rounded-md" style={{ background: 'rgba(var(--primary-rgb), 0.05)', border: '1px solid rgba(var(--primary-rgb), 0.1)' }}>
                  <div className="text-muted text-xs font-bold uppercase mb-4">Home Win</div>
                  <div className="text-primary font-extrabold text-lg">{match.odds.home || '-'}</div>
                </div>
                <div className="text-center p-12 rounded-md" style={{ background: 'rgba(var(--gold-rgb), 0.05)', border: '1px solid rgba(var(--gold-rgb), 0.1)' }}>
                  <div className="text-muted text-xs font-bold uppercase mb-4">Draw</div>
                  <div className="text-gold font-extrabold text-lg">{match.odds.draw || '-'}</div>
                </div>
                <div className="text-center p-12 rounded-md" style={{ background: 'rgba(var(--danger-rgb), 0.05)', border: '1px solid rgba(var(--danger-rgb), 0.1)' }}>
                  <div className="text-muted text-xs font-bold uppercase mb-4">Away Win</div>
                  <div className="text-danger font-extrabold text-lg">{match.odds.away || '-'}</div>
                </div>
                
                {/* Over/Under Fallbacks */}
                <div className="text-center p-8 col-span-3 mt-8 border-t border-border pt-12 flex justify-around text-sm text-muted">
                  <span>Over 2.5: <strong className="text-secondary">{match.odds.over25 || 'N/A'}</strong></span>
                  <span>Under 2.5: <strong className="text-secondary">{match.odds.under25 || 'N/A'}</strong></span>
                </div>
              </div>
            ) : (
              <div className="text-muted text-sm text-center py-12 flex-col gap-8 flex-center">
                <Shield size={20} className="text-muted opacity-50" />
                <span>Odds data is currently unavailable for this match.</span>
              </div>
            )}
          </div>

          <AdSlot id="match-details-ad-1" mobile={true} desktop={true} />

          <div className="glass-card p-24 mb-24 mt-24">
            <h2 className="text-primary font-bold flex-center gap-8 mb-16" style={{justifyContent: 'flex-start'}}>
              <HelpCircle size={18} /> How to Predict & Analyze This Match
            </h2>
            <ol className="flex-col gap-12 text-secondary text-sm pl-16" style={{listStyle: 'decimal'}}>
              <li><strong className="text-primary">Check Head-to-Head:</strong> Review the historical results and recent form of {match.homeName} and {match.awayName} below.</li>
              <li><strong className="text-primary">Analyze Tactics:</strong> Use the Zoka AI button to generate a tactical breakdown of team formations and key player matchups.</li>
              <li><strong className="text-primary">Monitor Live Stats:</strong> Once the match starts, track possession, shots on target, and momentum shifts in real-time.</li>
              <li><strong className="text-primary">Lock Your Prediction:</strong> Head to the Predictions hub to submit your exact score prediction and earn leaderboard points.</li>
            </ol>
          </div>

          <div className="glass-card p-24 mb-24 mt-24">
            <h2 className="text-primary font-bold flex-center gap-8 mb-16" style={{justifyContent: 'flex-start'}}>
              <TrendingUp size={18} /> Head-to-Head & Recent Form
            </h2>
            
            <div className="grid gap-24" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'}}>
              <div>
                <h3 className="text-muted text-xs font-bold uppercase mb-12 flex-center gap-4">
                  {match.homeLogo && <img src={match.homeLogo} alt="" width="14" height="14" />}
                  {match.homeName} - Last 5 Matches
                </h3>
                <ul className="flex-col gap-8" style={{listStyle: 'none', padding: 0, margin: 0}}>
                  {homeResults.length > 0 ? homeResults.map(m => (
                    <li key={m.id}>
                      <Link to={buildMatchRoute(m.id, m.homeName || m.homeTeam?.name, m.awayName || m.awayTeam?.name)} className="flex-between items-center p-8 bg-surface rounded-md border hover:border-primary transition-colors text-sm" style={{textDecoration: 'none', color: 'inherit'}}>
                        <span className="truncate pr-8">
                          <span className="font-bold">{m.homeName || m.homeTeam?.name}</span>
                          <span className="text-muted mx-4">vs</span>
                          <span className="font-bold">{m.awayName || m.awayTeam?.name}</span>
                        </span>
                        <span className="text-primary font-extrabold whitespace-nowrap">{m.homeScore} - {m.awayScore}</span>
                      </Link>
                    </li>
                  )) : <li className="text-muted text-sm">No recent results found.</li>}
                </ul>
              </div>

              <div>
                <h3 className="text-muted text-xs font-bold uppercase mb-12 flex-center gap-4">
                  {match.awayLogo && <img src={match.awayLogo} alt="" width="14" height="14" />}
                  {match.awayName} - Last 5 Matches
                </h3>
                <ul className="flex-col gap-8" style={{listStyle: 'none', padding: 0, margin: 0}}>
                  {awayResults.length > 0 ? awayResults.map(m => (
                    <li key={m.id}>
                      <Link to={buildMatchRoute(m.id, m.homeName || m.homeTeam?.name, m.awayName || m.awayTeam?.name)} className="flex-between items-center p-8 bg-surface rounded-md border hover:border-primary transition-colors text-sm" style={{textDecoration: 'none', color: 'inherit'}}>
                        <span className="truncate pr-8">
                          <span className="font-bold">{m.homeName || m.homeTeam?.name}</span>
                          <span className="text-muted mx-4">vs</span>
                          <span className="font-bold">{m.awayName || m.awayTeam?.name}</span>
                        </span>
                        <span className="text-primary font-extrabold whitespace-nowrap">{m.homeScore} - {m.awayScore}</span>
                      </Link>
                    </li>
                  )) : <li className="text-muted text-sm">No recent results found.</li>}
                </ul>
              </div>
            </div>
          </div>

          <div className="grid gap-16 mb-24" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="glass-card p-20 flex-col gap-12">
              <h3 className="text-primary font-bold flex-center gap-8 mb-8"><Tv size={16} /> Where to Watch</h3>
              <div className="flex gap-8 flex-wrap">
                {(LEAGUE_BROADCASTERS[String(match.leagueId)] || FALLBACK_BROADCASTERS).map(p => (
                  <a key={p.name} href={p.url} target="_blank" rel="noreferrer" className="badge flex-center gap-4" style={{ borderColor: `${p.color}40`, background: `${p.color}10`, color: p.color, padding: '8px 12px', textDecoration: 'none' }}>
                    {p.name} <ArrowLeft size={12} style={{ transform: 'rotate(180deg)' }} />
                  </a>
                ))}
              </div>
            </div>
            <div className="glass-card p-20 flex-col gap-12 justify-center">
              <Link to="/studio/reactor" state={{ fixtureId: match.id, homeTeam: match.homeName, awayTeam: match.awayName }} className="btn btn-primary w-full flex-center gap-8 mb-8">
                <Camera size={16} /> React in Studio
              </Link>
              <Link to="/predictions" className="btn btn-ghost w-full flex-center gap-8">
                <Target size={16} /> View Predictions
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}