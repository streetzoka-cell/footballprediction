import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Loader, Zap, TrendingUp, Camera, Clock, Trophy, ShieldCheck, Target } from 'lucide-react';
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
        <Link to="/fixtures" className="md-back-btn">
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="md-loading-screen">
        <Loader size={32} className="animate-spin" style={{ color: '#10b981' }} />
      </div>
    );
  }

  const { homeName, awayName, homeLogo, awayLogo, leagueName, leagueLogo, date, leagueId, category, kickoff, status, isLive, isFinished, isHT, isStarted, minute, displayMinute, homeScore, awayScore } = match;
  
  const matchLink = buildMatchRoute(match.id, homeName, awayName);
  const timelineProgress = isFinished ? 100 : isHT ? 50 : displayMinute ? Math.min((displayMinute / 90) * 100, 100) : 0;
  
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

        <div className="md-info-bar">
          {date && <span><Calendar size={14} /> {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {formatTime(date)}</span>}
        </div>

        {!isSpecialStatus && (
          <div className="md-cta-wrap">
            <Link to="/studio/reactor" state={{ fixtureId: match.id, homeTeam: homeName, awayTeam: awayName, homeLogo, awayLogo, score: { home: homeScore, away: awayScore }, minute: displayMinute || minute }} className="md-react-btn">
              <Camera size={16} /> React Now in Studio
            </Link>
          </div>
        )}

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

        {/* Premium Intelligence Section */}
        <div className="md-intel-grid">
          <div className="md-intel-card main">
            <div className="md-intel-icon"><Zap size={24} /></div>
            <h2>ZOKASCORE Intelligence</h2>
            <p>Not every football match deserves your attention. We highlight the most exciting fixtures based on match quality, current form, league importance, team momentum, and overall football interest.</p>
          </div>
          
          <div className="md-intel-card">
            <div className="md-intel-icon small"><ShieldCheck size={18} /></div>
            <h3>Quality Focus</h3>
            <p>Helping you discover the games that matter most, filtering out the noise.</p>
          </div>
          
          <div className="md-intel-card">
            <div className="md-intel-icon small"><Target size={18} /></div>
            <h3>Never Miss Out</h3>
            <p>From title races to hidden gems across leagues around the world.</p>
          </div>
        </div>

      </div>
    </div>
  );
}