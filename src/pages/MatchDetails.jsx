import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Users, Trophy } from 'lucide-react';
import SEO from '../components/SEO';
import { fetchFixtures, fetchYesterdayFixtures, fetchTomorrowFixtures } from "../utils/api";
import { todayStr as getTodayStr } from "../utils/dates";
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';

/* ═══════════════════════════════════════════════════════════════
   ISOLATED LIVE TIMELINE COMPONENT
   Moves the 1-second interval here so the parent doesn't re-render
   ═══════════════════════════════════════════════════════════════ */
const LiveTimeline = ({ match, isLive, isFin }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (!isLive) return; // Only tick if actually live
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isLive]);

  const { phase, displayMinute, timelineProgress } = useMemo(() => {
    const kickoffTime = match.date ? new Date(match.date).getTime() : 0;
    const elapsedMs = currentTime - kickoffTime;
    const elapsedMins = Math.floor(elapsedMs / 60000);

    let p = 'Scheduled';
    let dM = match.minute || 0;
    let tP = 0;

    if (isLive) {
      if (match.status === '1H') {
        p = 'First Half';
        dM = match.minute || Math.min(elapsedMins, 45);
        tP = (dM / 90) * 100;
      } else if (match.status === 'HT') {
        p = 'Half Time';
        dM = 45;
        tP = 50;
      } else if (match.status === '2H' || match.status === 'ET' || match.status === 'P') {
        p = match.status === 'ET' ? 'Extra Time' : match.status === 'P' ? 'Penalties' : 'Second Half';
        const secondHalfMins = Math.max(0, elapsedMins - 60);
        dM = match.minute || Math.min(45 + secondHalfMins, 90);
        tP = Math.min((dM / 90) * 100, 100);
      }
    } else if (isFin) {
      p = 'Full Time';
      dM = 90;
      tP = 100;
    } else if (kickoffTime > currentTime) {
      p = 'Scheduled';
      const diffMins = Math.floor((kickoffTime - currentTime) / 60000);
      if (diffMins < 60) p = `Starts in ${diffMins}m`;
      else p = `Starts in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
    }

    return { phase: p, displayMinute: dM, timelineProgress: tP };
  }, [match, isLive, isFin, currentTime]);

  if (!isLive && !isFin) return null;

  return (
    <div className="md-timeline-card">
      <div className="md-timeline-labels">
        <span className="md-timeline-label">Kickoff</span>
        <span className="md-timeline-label">Half Time</span>
        <span className="md-timeline-label">Full Time</span>
      </div>
      
      <div className="md-timeline-track">
        <div className="md-timeline-marker"></div>
        <div 
          className={`md-timeline-fill ${isLive ? 'md-timeline-fill-live' : 'md-timeline-fill-fin'}`} 
          style={{ width: `${timelineProgress}%` }}
        ></div>
        
        {isLive && (
          <div 
            className="md-timeline-dot" 
            style={{ left: `calc(${timelineProgress}% - 6px)` }}
          ></div>
        )}
      </div>
      
      <div className="md-timeline-mins">
        <span>0'</span>
        <span>45'</span>
        <span>90'</span>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   MAIN MATCH DETAILS COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function MatchDetails() {
  const { matchId, slug } = useParams();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const getMatch = async () => {
      try {
        const [yRes, tRes, tmRes] = await Promise.all([
          fetchYesterdayFixtures(),
          fetchFixtures(getTodayStr()),
          fetchTomorrowFixtures()
        ]);
        
        if (!mounted) return;
        
        // Find match quickly across all arrays
        let foundMatch = null;
        const arrays = [yRes?.matches, tRes?.matches, tmRes?.matches];
        for (const arr of arrays) {
          if (!arr) continue;
          foundMatch = arr.find(m => String(m.id) === String(matchId));
          if (foundMatch) break;
        }
        
        if (mounted) setMatch(foundMatch);
      } catch (e) {
        console.error("Match fetch error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    setLoading(true);
    getMatch();
    
    return () => { mounted = false; };
  }, [matchId]);

  const matchData = useMemo(() => {
    if (!match) return null;

    const isLive = isLiveStatus(match.status, SPORT.FOOTBALL);
    const isFin = isFinishedStatus(match.status, SPORT.FOOTBALL);

    const safeHomeScore = match.homeScore ?? match.score?.fullTime?.home ?? 0;
    const safeAwayScore = match.awayScore ?? match.score?.fullTime?.away ?? 0;

    const homeName = match.homeTeam?.name || 'Home Team';
    const awayName = match.awayTeam?.name || 'Away Team';
    const leagueName = match.league?.name || 'Football';

    let statusClass = 'md-status-sched';
    if (isLive) statusClass = 'md-status-live';
    else if (isFin) statusClass = 'md-status-fin';

    return {
      isLive, isFin, safeHomeScore, safeAwayScore, homeName, awayName, leagueName, statusClass
    };
  }, [match]);

  if (loading) {
    return <div className="md-loader">Loading match...</div>;
  }

  if (!match || !matchData) {
    return (
      <div className="md-error">
        <div className="md-error-msg">Match not found.</div>
        <Link to="/fixtures" className="md-back-btn">
          <ArrowLeft size={16} /> Back to Fixtures
        </Link>
      </div>
    );
  }

  const { isLive, isFin, safeHomeScore, safeAwayScore, homeName, awayName, leagueName, statusClass } = matchData;
  
  const title = `${homeName} vs ${awayName} - Live Score | ZOKASCORE`;
  const description = `Follow ${homeName} vs ${awayName} live. Get real-time scores and expert predictions for this ${leagueName} match on ZokaScore.`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": `${homeName} vs ${awayName}`,
    "sport": "Football",
    "startDate": match.utcDate || match.date,
    "location": { "@type": "Place", "name": match.venue?.name || leagueName },
    "homeTeam": { "@type": "SportsTeam", "name": homeName },
    "awayTeam": { "@type": "SportsTeam", "name": awayName }
  };

  return (
    <div className="md-page">
      <SEO 
        title={title}
        description={description}
        keywords={`${homeName} vs ${awayName}, ${homeName} live score, ${awayName} live score, ${leagueName} predictions`}
        path={`/match/${matchId}/${slug}`}
        structuredData={structuredData}
      />
      
      <div className="md-container">
        <Link to="/fixtures" className="md-back-btn">
          <ArrowLeft size={16} /> Back to Fixtures
        </Link>

        <div className="md-header">
          <p className="md-league">{leagueName}</p>
          <div className="md-teams">
            <div className="md-team-home">
              <h1 className="md-team-name">{homeName}</h1>
            </div>
            <div className="md-score-box">
              <div className="md-score" style={{ color: isLive ? '#ef4444' : isFin ? '#10b981' : '#fff' }}>
                {safeHomeScore} - {safeAwayScore}
              </div>
            </div>
            <div className="md-team-away">
              <h1 className="md-team-name">{awayName}</h1>
            </div>
          </div>
          
          <div className={`md-status-badge ${statusClass}`}>
            {isLive && <span className="md-live-dot"></span>}
            <LiveStatusText match={match} isLive={isLive} isFin={isFin} />
          </div>
        </div>

        <LiveTimeline match={match} isLive={isLive} isFin={isFin} />

        <div className="md-info-bar">
          {match.date && <span className="md-info-item"><Calendar size={12} /> {new Date(match.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
          {match.venue?.name && <span className="md-info-item"><MapPin size={12} /> {match.venue.name}</span>}
          {match.referee && <span className="md-info-item"><Users size={12} /> {match.referee}</span>}
        </div>

        <div className="md-info-card">
          <Trophy size={28} className="md-info-icon" />
          <h2 className="md-info-title">Match Center</h2>
          <p className="md-info-text">
            Scores update in real-time here when the match goes live. 
            <br/>Check the fixtures page for live updates across all matches!
          </p>
        </div>

        <div className="md-cta-wrap">
          <Link to="/predictions" className="md-cta">
            Make Predictions
          </Link>
        </div>
      </div>
    </div>
  );
}

// Extracted to prevent parent re-renders if we ever bring back the 1s interval globally
const LiveStatusText = ({ match, isLive, isFin }) => {
  const kickoffTime = match.date ? new Date(match.date).getTime() : 0;
  const currentTime = Date.now();
  
  let phase = 'Scheduled';
  if (isLive) {
    if (match.status === '1H') phase = 'First Half';
    else if (match.status === 'HT') phase = 'Half Time';
    else if (match.status === '2H') phase = 'Second Half';
    else if (match.status === 'ET') phase = 'Extra Time';
    else if (match.status === 'P') phase = 'Penalties';
  } else if (isFin) {
    phase = 'Full Time';
  } else if (kickoffTime > currentTime) {
    const diffMins = Math.floor((kickoffTime - currentTime) / 60000);
    if (diffMins < 60) phase = `Starts in ${diffMins}m`;
    else phase = `Starts in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
  }

  return <>{isLive ? `${phase} ${match.minute ? `(${match.minute}')` : ''}` : phase}</>;
};