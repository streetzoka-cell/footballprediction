import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Users, Trophy } from 'lucide-react';
import SEO from '../components/SEO';
import { fetchFixtures, fetchYesterdayFixtures, fetchTomorrowFixtures, fetchLeagueStandings, subscribeToLiveFixtures } from "../utils/api";
import { todayStr as getTodayStr } from "../utils/dates";
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);

/* ═══════════════════════════════════════════════════════════════
   ISOLATED LIVE TIMELINE COMPONENT
   ═══════════════════════════════════════════════════════════════ */
const LiveTimeline = ({ match, isLive, isFin }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isLive]);

  const { phase, displayMinute, timelineProgress } = useMemo(() => {
    // ★ FIX: Added optional chaining to prevent crash if match is undefined
    const kickoffTime = match?.date ? new Date(match.date).getTime() : 0;
    const elapsedMs = currentTime - kickoffTime;
    const elapsedMins = Math.floor(elapsedMs / 60000);

    let p = 'Scheduled';
    let dM = match?.minute || 0;
    let tP = 0;

    if (isLive) {
      if (match?.status === '1H') {
        p = 'First Half';
        dM = match.minute || Math.min(elapsedMins, 45);
        tP = (dM / 90) * 100;
      } else if (match?.status === 'HT') {
        p = 'Half Time';
        dM = 45;
        tP = 50;
      } else if (match?.status === '2H' || match?.status === 'ET' || match?.status === 'P') {
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

const LiveStatusText = ({ match, isLive, isFin }) => {
  // ★ FIX: Added optional chaining
  const kickoffTime = match?.date ? new Date(match.date).getTime() : 0;
  const currentTime = Date.now();
  
  let phase = 'Scheduled';
  if (isLive) {
    if (match?.status === '1H') phase = 'First Half';
    else if (match?.status === 'HT') phase = 'Half Time';
    else if (match?.status === '2H') phase = 'Second Half';
    else if (match?.status === 'ET') phase = 'Extra Time';
    else if (match?.status === 'P') phase = 'Penalties';
  } else if (isFin) {
    phase = 'Full Time';
  } else if (kickoffTime > currentTime) {
    const diffMins = Math.floor((kickoffTime - currentTime) / 60000);
    if (diffMins < 60) phase = `Starts in ${diffMins}m`;
    else phase = `Starts in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
  }

  return <>{isLive ? `${phase} ${match?.minute ? `(${match.minute}')` : ''}` : phase}</>;
};

/* ═══════════════════════════════════════════════════════════════
   MAIN MATCH DETAILS COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function MatchDetails() {
  const { matchId, slug } = useParams();
  const [match, setMatch] = useState(null);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let unsubscribe;

    const getMatch = async () => {
      try {
        const [yRes, tRes, tmRes] = await Promise.all([
          fetchYesterdayFixtures(),
          fetchFixtures(getTodayStr()),
          fetchTomorrowFixtures()
        ]);
        
        if (!mounted) return;
        
        let foundMatch = null;
        const arrays = [yRes?.matches, tRes?.matches, tmRes?.matches];
        for (const arr of arrays) {
          if (!Array.isArray(arr)) continue;
          foundMatch = arr.find(m => String(m.id) === String(matchId));
          if (foundMatch) break;
        }
        
        if (mounted) {
          setMatch(foundMatch);
          
          // Fetch Standings for thick content
          if (foundMatch?.league?.id) {
            const stand = await fetchLeagueStandings(foundMatch.league.id);
            if (mounted) setStandings(stand || []);
          }

          // Subscribe to live updates if match is not finished
          if (foundMatch && !isFinishedStatus(foundMatch.status, SPORT.FOOTBALL)) {
            unsubscribe = subscribeToLiveFixtures(getTodayStr(), ({ live, finished }) => {
              const liveMatch = live?.find(m => String(m.id) === String(matchId));
              const finMatch = finished?.find(m => String(m.id) === String(matchId));
              if (liveMatch) setMatch(prev => ({ ...prev, ...liveMatch, isLive: true }));
              if (finMatch) setMatch(prev => ({ ...prev, ...finMatch, isFinished: true, isLive: false }));
            });
          }
        }
      } catch (e) {
        console.error("Match fetch error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    setLoading(true);
    getMatch();
    
    return () => { 
      if (unsubscribe) unsubscribe(); 
      mounted = false; 
    };
  }, [matchId]);

  const matchData = useMemo(() => {
    if (!match) return null;

    const isLive = isLiveStatus(match.status, SPORT.FOOTBALL);
    const isFin = isFinishedStatus(match.status, SPORT.FOOTBALL);

    const safeHomeScore = match.homeScore ?? match.score?.fullTime?.home ?? 0;
    const safeAwayScore = match.awayScore ?? match.score?.fullTime?.away ?? 0;

    const homeName = match.homeTeam?.name || 'Home Team';
    const awayName = match.awayTeam?.name || 'Away Team';
    const homeId = match.homeTeam?.id || match.homeId;
    const awayId = match.awayTeam?.id || match.awayId;
    const leagueName = match.league?.name || 'Football';
    const leagueId = match.league?.id || match.leagueKey;

    let statusClass = 'md-status-sched';
    if (isLive) statusClass = 'md-status-live';
    else if (isFin) statusClass = 'md-status-fin';

    return {
      isLive, isFin, safeHomeScore, safeAwayScore, 
      homeName, awayName, homeId, awayId, 
      leagueName, leagueId, statusClass
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

  const { 
    isLive, isFin, safeHomeScore, safeAwayScore, 
    homeName, awayName, homeId, awayId, 
    leagueName, leagueId, statusClass 
  } = matchData;
  
  // SEO Optimized Title & Description
  const title = `${homeName} vs ${awayName} Prediction, Live Score, H2H & Lineups | ZOKASCORE`;
  const description = `${homeName} vs ${awayName} live score, prediction, lineups, head-to-head statistics, league standings, kickoff time and match analysis on ZOKASCORE.`;

  // SportsEvent Schema
  const sportsSchema = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": `${homeName} vs ${awayName}`,
    "sport": "Football",
    "startDate": match.utcDate || match.date,
    "endDate": new Date(new Date(match.utcDate || match.date).getTime() + 7200000).toISOString(),
    "eventStatus": isLive ? "https://schema.org/EventScheduled" : isFin ? "https://schema.org/EventCompleted" : "https://schema.org/EventScheduled",
    "homeTeam": { "@type": "SportsTeam", "name": homeName },
    "awayTeam": { "@type": "SportsTeam", "name": awayName },
    "location": { "@type": "Place", "name": match.venue?.name || leagueName },
    ...(isFin && { 
      "result": { 
        "@type": "SportsResult", 
        "homeTeamScore": safeHomeScore, 
        "awayTeamScore": safeAwayScore 
      } 
    })
  };

  // Breadcrumb Schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://zokascore.xyz/" },
      { "@type": "ListItem", "position": 2, "name": "Fixtures", "item": "https://zokascore.xyz/fixtures" },
      { "@type": "ListItem", "position": 3, "name": leagueName, "item": `https://zokascore.xyz/league/${leagueId}/${slugify(leagueName)}` },
      { "@type": "ListItem", "position": 4, "name": `${homeName} vs ${awayName}` }
    ]
  };

  return (
    <div className="md-page">
      <SEO 
        title={title}
        description={description}
        keywords={`${homeName} vs ${awayName}, ${homeName} live score, ${awayName} live score, ${leagueName} predictions`}
        structuredData={[sportsSchema, breadcrumbSchema]} 
      />
      
      <div className="md-container">
        <Link to="/fixtures" className="md-back-btn">
          <ArrowLeft size={16} /> Back to Fixtures
        </Link>

        {/* HEADER WITH INTERNAL LINKS */}
        <div className="md-header">
          <p className="md-league">
            <Link to={`/league/${leagueId}/${slugify(leagueName)}`}>{leagueName}</Link>
          </p>
          <div className="md-teams">
            <div className="md-team-home">
              <Link to={`/team/${homeId}/${slugify(homeName)}`}>
                <h1 className="md-team-name">{homeName}</h1>
              </Link>
            </div>
            <div className="md-score-box">
              <div className="md-score" style={{ color: isLive ? '#ef4444' : isFin ? '#10b981' : '#fff' }}>
                {safeHomeScore} - {safeAwayScore}
              </div>
            </div>
            <div className="md-team-away">
              <Link to={`/team/${awayId}/${slugify(awayName)}`}>
                <h1 className="md-team-name">{awayName}</h1>
              </Link>
            </div>
          </div>
          
          <div className={`md-status-badge ${statusClass}`}>
            {isLive && <span className="md-live-dot"></span>}
            <LiveStatusText match={match} isLive={isLive} isFin={isFin} />
          </div>
        </div>

        <LiveTimeline match={match} isLive={isLive} isFin={isFin} />

        {/* MATCH INFO BAR */}
        <div className="md-info-bar">
          {match.date && (
            <span className="md-info-item">
              <Calendar size={12} /> {new Date(match.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {match.venue?.name && (
            <span className="md-info-item">
              <MapPin size={12} /> {match.venue.name}
            </span>
          )}
          {match.referee && (
            <span className="md-info-item">
              <Users size={12} /> {match.referee}
            </span>
          )}
        </div>

        {/* THICK CONTENT SECTION: LEAGUE STANDINGS */}
        {standings.length > 0 && (
          <div className="md-info-card">
            <Trophy size={28} className="md-info-icon" />
            <h2 className="md-info-title">League Standings</h2>
            <div className="standings-mini">
              {standings.slice(0, 5).map((team, i) => (
                <div key={team.team.id} className="standing-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #151b26' }}>
                  <span style={{ color: '#64748b' }}>{i + 1}.</span>
                  <Link to={`/team/${team.team.id}/${slugify(team.team.name)}`} style={{ flex: 1, marginLeft: 10, color: '#f8fafc' }}>
                    {team.team.name}
                  </Link>
                  <span style={{ color: '#10b981', fontWeight: 700 }}>{team.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* THICK CONTENT SECTION: H2H & FORM PLACEHOLDER */}
        <div className="md-info-card">
          <h2 className="md-info-title">Head to Head & Recent Form</h2>
          <p className="md-info-text">
            Detailed head-to-head history and recent form for {homeName} vs {awayName} will be displayed here. 
            Check back soon for updates!
          </p>
        </div>

        {/* INTERNAL LINKING: RELATED MATCHES */}
        <div className="md-info-card">
          <h2 className="md-info-title">Related Matches</h2>
          <Link to="/fixtures" className="md-cta">
            View All Today's Fixtures
          </Link>
        </div>

      </div>
    </div>
  );
}