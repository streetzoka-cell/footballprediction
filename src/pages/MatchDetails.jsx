import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, Calendar, Zap, TrendingUp, Camera, Clock, Trophy, 
  Tv, BarChart3, MapPin, Shield, Users 
} from 'lucide-react';

import SEO from '../components/SEO';
import { useFixtures, useStandings } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr, formatTime } from '../utils/dates';
import { buildMatchRoute, buildTeamRoute, buildLeagueRoute } from '../utils/routes';
import { applySmartMinute } from '../engine/matchEngine'; 
import { seoGenerators, buildSEO } from '../utils/seoBuilder'; // ★ NEW IMPORT

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

export default function MatchDetails() {
  const { matchId } = useParams();
  const now = useNow(10000);
  
  const { data: todayFx = [] } = useFixtures(todayStr());
  const { data: yestFx = [] } = useFixtures(getLocalDateStr(-1));
  const { data: tomFx = [] } = useFixtures(getLocalDateStr(1));

  const match = useMemo(() => {
    const all = [...todayFx, ...tomFx, ...yestFx];
    const found = all.find(m => String(m.id) === String(matchId));
    return found ? applySmartMinute(found, now) : null;
  }, [todayFx, yestFx, tomFx, matchId, now]);

  const standingsLeagueId = match?.leagueId;
  const { data: standingsData } = useStandings(standingsLeagueId);
  const standingsTable = standingsData?.standings?.[0] || [];

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

  // ★ NEW: Generate SEO safely, even if match is null
  const matchLink = match ? buildMatchRoute(match.id, match.homeName, match.awayName) : `/match/${matchId}`;
  const seo = useMemo(() => {
    if (!match) {
      // Fallback SEO while loading
      return buildSEO({
        title: "Match Details",
        description: "Loading match details...",
        path: `/match/${matchId}`,
      });
    }
    return seoGenerators.matchPage({
      homeName: match.homeName,
      awayName: match.awayName,
      leagueName: match.leagueName,
      date: match.date,
      venue: match.venue,
      isLive: match.isLive,
      isFinished: match.isFinished,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      path: matchLink,
      homeLogo: match.homeLogo,
      awayLogo: match.awayLogo,
      leagueLogo: match.leagueLogo,
      referee: match.referee,
    });
  }, [match, matchId, matchLink]);

  return (
    <div className="md-page">
      {/* ★ MOVED TO TOP: Renders instantly even while loading */}
      <SEO {...seo} />
      
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

          {/* Premium Header Card */}
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
              <Link to={buildTeamRoute(match.homeTeamId, match.homeName)} className="md-team">
                {match.homeLogo && <img src={match.homeLogo} alt={match.homeName} />}
                <h1 className="md-team-name">{match.homeName}</h1>
              </Link>
              
              <div className="md-score-block">
                <div className={`md-score ${match.isLive ? 'live' : ''} ${goalFlash ? 'pop' : ''}`}>
                  {(match.isLive || match.isHT || match.isFinished) ? `${match.homeScore ?? '-'} : ${match.awayScore ?? '-'}` : 'VS'}
                </div>
                <div className={`status-badge ${match.statusClass || 'status-upcoming'}`}>
                  {match.isLive && !match.isHT && <span className="zk-live-pulse-dot mr-2" />}
                  {match.statusLabel}
                </div>
              </div>

              <Link to={buildTeamRoute(match.awayTeamId, match.awayName)} className="md-team">
                {match.awayLogo && <img src={match.awayLogo} alt={match.awayName} />}
                <h1 className="md-team-name">{match.awayName}</h1>
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

          {/* ✅ REAL DATA ONLY: Match Context */}
          <div className="md-pro-grid">
            <div className="glass-card p-20 flex-col gap-12">
              <h3 className="text-muted text-xs font-bold uppercase flex-center gap-4"><MapPin size={12} /> Match Context</h3>
              <div className="flex-col gap-8">
                {match.date && (
                  <div className="flex-between text-sm">
                    <span className="text-muted flex-center gap-6"><Calendar size={14} /> Date</span>
                    <span className="text-primary font-bold">{new Date(match.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {formatTime(match.date)}</span>
                  </div>
                )}
                {match.venue?.name && (
                  <div className="flex-between text-sm">
                    <span className="text-muted flex-center gap-6"><MapPin size={14} /> Venue</span>
                    <span className="text-primary font-bold">{match.venue.name}</span>
                  </div>
                )}
                {match.referee && (
                  <div className="flex-between text-sm">
                    <span className="text-muted flex-center gap-6"><Shield size={14} /> Referee</span>
                    <span className="text-primary font-bold">{match.referee}</span>
                  </div>
                )}
                {!match.date && !match.venue?.name && !match.referee && (
                  <div className="text-muted text-sm text-center py-8">Match details will be updated shortly.</div>
                )}
              </div>
            </div>
            
            <div className="glass-card p-20 flex-col gap-12">
              <h3 className="text-muted text-xs font-bold uppercase flex-center gap-4"><Users size={12} /> League Standing</h3>
              {standingsTable.length > 0 ? (
                <div className="flex-col gap-6">
                  {standingsTable.slice(0, 3).map((team, i) => (
                    <Link key={team.team?.id || team.rank} to={buildTeamRoute(team.team?.id, team.team?.name)} className="flex-between items-center p-8 hover:bg-card-hover rounded-md transition-colors" style={{ textDecoration: 'none', color: 'inherit' }}>
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

          {/* Real Stats */}
          {match.hasRealStats ? (
            <div className="glass-card p-24 mb-24">
              <h2 className="text-primary font-bold flex-center gap-8 mb-16"><BarChart3 size={18} /> Match Statistics</h2>
              <div className="flex-col gap-16">
                {match.stats.possession && (
                  <div className="flex-col gap-4">
                    <div className="flex-between text-primary font-bold text-sm">
                      <span>{match.stats.possession.home}%</span>
                      <span className="text-muted text-xs">Possession</span>
                      <span>{match.stats.possession.away}%</span>
                    </div>
                    <div className="flex h-6 rounded-md overflow-hidden bg-elevated">
                      <div style={{ width: `${match.stats.possession.home}%`, background: 'var(--primary)', transition: 'width 1s ease' }}></div>
                      <div style={{ width: `${match.stats.possession.away}%`, background: 'var(--danger)', transition: 'width 1s ease' }}></div>
                    </div>
                  </div>
                )}
                {match.stats.shots && (
                  <div className="flex-between text-primary font-bold text-sm">
                    <span>{match.stats.shots.home}</span>
                    <span className="text-muted text-xs">Total Shots</span>
                    <span>{match.stats.shots.away}</span>
                  </div>
                )}
                {match.stats.corners && (
                  <div className="flex-between text-primary font-bold text-sm">
                    <span>{match.stats.corners.home}</span>
                    <span className="text-muted text-xs">Corners</span>
                    <span>{match.stats.corners.away}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-card p-24 mb-24 flex-col items-center text-center gap-8">
              <BarChart3 size={32} className="text-muted" style={{ opacity: 0.3 }} />
              <h3 className="text-primary font-bold">Advanced Statistics</h3>
              <p className="text-muted text-sm max-w-400">
                {(match.isLive || match.isFinished) ? 'Detailed match statistics are being processed and will appear here shortly.' : 'Live statistics will be available once the match begins.'}
              </p>
            </div>
          )}

          {/* Watch & React */}
          <div className="grid gap-16 mb-24" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="glass-card p-20 flex-col gap-12">
              <h3 className="text-primary font-bold flex-center gap-8"><Tv size={16} /> Where to Watch</h3>
              <div className="flex gap-8 flex-wrap">
                {(LEAGUE_BROADCASTERS[String(match.leagueId)] || FALLBACK_BROADCASTERS).map(p => (
                  <a key={p.name} href={p.url} target="_blank" rel="noreferrer" className="badge flex-center gap-4" style={{ borderColor: `${p.color}40`, background: `${p.color}10`, color: p.color, padding: '8px 12px', textDecoration: 'none' }}>
                    {p.name} <ArrowLeft size={12} style={{ transform: 'rotate(180deg)' }} />
                  </a>
                ))}
              </div>
            </div>
            <div className="glass-card p-20 flex-col gap-12 justify-center">
              <Link to="/studio/reactor" state={{ fixtureId: match.id, homeTeam: match.homeName, awayTeam: match.awayName }} className="btn btn-primary w-full flex-center gap-8">
                <Camera size={16} /> React in Studio
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}