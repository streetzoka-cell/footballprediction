import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Loader, Zap, TrendingUp, Camera, Clock, Trophy, Tv, Activity, BarChart3, MapPin } from 'lucide-react';
import SEO from '../components/SEO';
import { useFixtures, useStandings } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr, formatTime } from '../utils/dates';
import { buildMatchRoute, buildTeamRoute, buildLeagueRoute } from '../utils/routes';
import { applySmartMinute } from '../engine/matchEngine'; 
import { useState, useEffect, useRef, useMemo } from 'react';

function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

// ★ REAL Broadcaster Data mapped by League ID
const LEAGUE_BROADCASTERS = {
  '39': [{ name: 'Peacock', color: '#000000', url: 'https://www.peacocktv.com' }, { name: 'Sky Sports', color: '#0072c6', url: 'https://www.skysports.com' }, { name: 'SuperSport', color: '#009a44', url: 'https://www.supersport.com' }],
  '140': [{ name: 'ESPN+', color: '#d00d1e', url: 'https://www.espn.com' }, { name: 'beIN SPORTS', color: '#fa9000', url: 'https://www.beinsports.com' }],
  '2': [{ name: 'Paramount+', color: '#0064ff', url: 'https://www.paramountplus.com' }, { name: 'DAZN', color: '#f8f8f8', url: 'https://www.dazn.com' }],
  '3': [{ name: 'Paramount+', color: '#0064ff', url: 'https://www.paramountplus.com' }, { name: 'beIN SPORTS', color: '#fa9000', url: 'https://www.beinsports.com' }],
  '135': [{ name: 'Paramount+', color: '#0064ff', url: 'https://www.paramountplus.com' }, { name: 'DAZN', color: '#f8f8f8', url: 'https://www.dazn.com' }],
  '78': [{ name: 'ESPN+', color: '#d00d1e', url: 'https://www.espn.com' }, { name: 'Sky Sports', color: '#0072c6', url: 'https://www.skysports.com' }],
  '61': [{ name: 'beIN SPORTS', color: '#fa9000', url: 'https://www.beinsports.com' }, { name: 'DAZN', color: '#f8f8f8', url: 'https://www.dazn.com' }],
};

const FALLBACK_BROADCASTERS = [{ name: 'FIFA+', color: '#dd2848', url: 'https://www.plus.fifa.com' }, { name: 'UEFA.tv', color: '#00349e', url: 'https://www.uefa.tv' }, { name: 'ONEFOOTBALL', color: 'var(--accent)', url: 'https://www.onefootball.com' }];

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

  if (match?.isHidden) {
    return (
      <div className="md-error-screen">
        <Clock size={32} style={{ color: '#fbbf24' }} />
        <h2>Match Temporarily Unavailable</h2>
        <p>We are waiting for the final confirmation from the data provider for this match. It will reappear automatically once verified.</p>
        <Link to="/fixtures" className="md-back-btn"><ArrowLeft size={14} /> Back to Fixtures</Link>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="md-loading-screen">
        <Loader size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  const { homeName, awayName, homeLogo, awayLogo, leagueName, leagueLogo, date, leagueId, category, kickoff, status, isLive, isFinished, isHT, isStarted, minute, displayMinute, homeScore, awayScore, venue, stats } = match;
  
  const matchLink = buildMatchRoute(match.id, homeName, awayName);
  const timelineProgress = isFinished ? 100 : isHT ? 50 : displayMinute ? Math.min((displayMinute / 90) * 100, 100) : 0;
  
  // ★ REAL Broadcaster Logic
  const broadcasters = LEAGUE_BROADCASTERS[String(leagueId)] || FALLBACK_BROADCASTERS;
  const hasRealStats = stats && (stats.possession || stats.shots || stats.corners);

  const matchStatus = (status || '').toUpperCase();
  const isPostponed = matchStatus === 'PST' || matchStatus === 'POSTP';
  const isCanceled = matchStatus === 'CANC' || matchStatus === 'ABD';
  const isSuspended = matchStatus === 'SUSP' || matchStatus === 'INT';
  const isSpecialStatus = isPostponed || isCanceled || isSuspended;

  let statusLabel = kickoff;
  let statusClass = 'scheduled';
  
  if (isLive && !isHT) {
    statusLabel = `LIVE ${displayMinute || minute || 0}'`;
    statusClass = 'live';
  } else if (isHT) {
    statusLabel = 'HALF TIME';
    statusClass = 'ht';
  } else if (isFinished) {
    statusLabel = 'FULL TIME';
    statusClass = 'ft';
  } else if (isPostponed) {
    statusLabel = 'POSTPONED';
    statusClass = 'warning';
  } else if (isCanceled) {
    statusLabel = 'CANCELED';
    statusClass = 'danger';
  } else if (isSuspended) {
    statusLabel = 'SUSPENDED';
    statusClass = 'warning';
  }

  return (
    <div className="md-page">
      <SEO
        title={`${homeName} vs ${awayName} | Live Scores, Predictions & Stats`}
        description={`Follow ${homeName} vs ${awayName} live on ZOKASCORE. Get real-time scores, match statistics, predictions, and standings updates.`}
        keywords={`${homeName} vs ${awayName}, live scores, football predictions, match stats, ${leagueName}`}
        path={matchLink}
        robots="index,follow"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Fixtures", path: "/fixtures" },
          { name: `${homeName} vs ${awayName}`, path: matchLink }
        ]}
      />
      
      <div className="md-container">
        <Link to="/fixtures" className="md-back-btn">
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        {/* Premium Glassmorphism Header */}
        <div className={`md-header-card ${goalFlash ? 'goal-flash' : ''}`}>
          {goalFlash && <div className="md-confetti"><span>🎉</span><span>⚽</span><span>🎉</span></div>}
          
          <div className="md-league-row">
            {leagueLogo && <img src={leagueLogo} alt="" width="20" height="20" />}
            <Link to={buildLeagueRoute(leagueId, leagueName)} className="md-league-name">{leagueName}</Link>
            {category === 'FEATURED' && <span className="md-top-badge">★ TOP MATCH</span>}
          </div>
          
          <div className="md-teams-row">
            <Link to={buildTeamRoute(match.homeTeamId, homeName)} className="md-team-col">
              {homeLogo && <img src={homeLogo} alt={homeName} className="md-team-logo" />}
              <h1 className="md-team-name">{homeName}</h1>
            </Link>
            
            <div className="md-score-box">
              <div className={`md-score-text ${isLive ? 'live' : isFinished ? 'ft' : ''} ${goalFlash ? 'pop' : ''}`}>
                {(isLive || isHT || isFinished) ? `${homeScore ?? '-'} : ${awayScore ?? '-'}` : 'VS'}
              </div>
              <div className={`md-status-badge ${statusClass}`}>
                {isLive && !isHT && !isSpecialStatus && <span className="live-pulse-dot" style={{marginRight: 6}}></span>}
                {statusLabel}
              </div>
            </div>

            <Link to={buildTeamRoute(match.awayTeamId, awayName)} className="md-team-col">
              {awayLogo && <img src={awayLogo} alt={awayName} className="md-team-logo" />}
              <h1 className="md-team-name">{awayName}</h1>
            </Link>
          </div>

          {(isLive || isFinished) && !isSpecialStatus && (
            <div className="md-timeline">
              <div className="md-timeline-track">
                <div className={`md-timeline-fill ${isLive ? 'live' : 'ft'}`} style={{ width: `${timelineProgress}%` }}>
                  {isLive && <div className="md-timeline-dot"></div>}
                </div>
              </div>
              <div className="md-timeline-labels">
                <span>0'</span>
                <span>45'</span>
                <span>90'</span>
              </div>
            </div>
          )}
        </div>

        {/* Real Match Stats Grid */}
        {hasRealStats ? (
          <div className="md-stats-card">
            <h2 className="md-card-title"><BarChart3 size={18} /> Match Statistics</h2>
            <div className="md-stats-grid">
              {stats.possession && (
                <div className="md-stat-row">
                  <span className="md-stat-val">{stats.possession.home}%</span>
                  <div className="md-stat-bar"><div style={{ width: `${stats.possession.home}%`, background: '#60a5fa' }}></div></div>
                  <span className="md-stat-label">Possession</span>
                  <div className="md-stat-bar"><div style={{ width: `${stats.possession.away}%`, background: '#f5c542' }}></div></div>
                  <span className="md-stat-val">{stats.possession.away}%</span>
                </div>
              )}
              {stats.shots && (
                <div className="md-stat-row">
                  <span className="md-stat-val">{stats.shots.home}</span>
                  <span className="md-stat-label">Shots</span>
                  <span className="md-stat-val">{stats.shots.away}</span>
                </div>
              )}
              {stats.corners && (
                <div className="md-stat-row">
                  <span className="md-stat-val">{stats.corners.home}</span>
                  <span className="md-stat-label">Corners</span>
                  <span className="md-stat-val">{stats.corners.away}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="md-info-bar">
            {date && <span><Calendar size={14} /> {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {formatTime(date)}</span>}
            {venue?.name && <span><MapPin size={14} /> {venue.name}</span>}
          </div>
        )}

        {/* Where to Watch Widget (Real Broadcasters) */}
        {!isSpecialStatus && (
          <div className="md-watch-card">
            <h2 className="md-card-title"><Tv size={18} /> Where to Watch</h2>
            <p className="md-watch-sub">Official broadcasters for {leagueName}</p>
            <div className="md-watch-grid">
              {broadcasters.map(p => (
                <a key={p.name} href={p.url} target="_blank" rel="noreferrer" className="md-provider-chip" style={{ borderColor: `${p.color}40`, background: `${p.color}10` }}>
                  <span className="md-provider-logo" style={{ background: p.color, color: p.color === '#f8f8f8' || p.color === '#000000' ? '#000' : '#fff' }}>
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="md-provider-name">{p.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* React in Studio CTA */}
        {!isSpecialStatus && (
          <div className="md-cta-wrap">
            <Link to="/studio/reactor" state={{ fixtureId: match.id, homeTeam: homeName, awayTeam: awayName, homeLogo, awayLogo, score: { home: homeScore, away: awayScore }, minute: displayMinute || minute }} className="md-react-btn">
              <Camera size={16} /> React Now in Studio
            </Link>
          </div>
        )}

        {/* Standings Widget */}
        {standingsTable.length > 0 && (
          <div className="md-card">
            <h2 className="md-card-title"><TrendingUp size={18} /> League Standings</h2>
            <div className="md-standings-list">
              {standingsTable.slice(0, 5).map((team, i) => (
                <div key={team.team?.id || team.rank} className="md-standing-row">
                  <span className="md-rank">{team.rank || i + 1}</span>
                  <Link to={buildTeamRoute(team.team?.id, team.team?.name)} className="md-team-link">
                    {team.team?.logo && <img src={team.team?.logo} alt="" width="18" height="18" />}
                    {team.team?.name || 'TBD'}
                  </Link>
                  <span className="md-pts">{team.points} <small>pts</small></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ZOKASCORE Intelligence Section */}
        <div className="md-intel-grid">
          <div className="md-intel-card main">
            <div className="md-intel-icon"><Zap size={24} /></div>
            <h2>ZOKASCORE Intelligence</h2>
            <p>Not every football match deserves your attention. We highlight the most exciting fixtures based on match quality, current form, league importance, team momentum, and overall football interest.</p>
          </div>
          
          <div className="md-intel-card">
            <div className="md-intel-icon small"><Trophy size={18} /></div>
            <h3>Quality Focus</h3>
            <p>Helping you discover the games that matter most, filtering out the noise.</p>
          </div>
          
          <div className="md-intel-card">
            <div className="md-intel-icon small"><Activity size={18} /></div>
            <h3>Never Miss Out</h3>
            <p>From title races to hidden gems across leagues around the world.</p>
          </div>
        </div>

      </div>
    </div>
  );
}