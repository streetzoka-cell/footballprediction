import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Users, Trophy, Loader } from 'lucide-react';
import SEO from '../components/SEO';
import { todayStr, getLocalDateStr, formatTime } from '../utils/dates';
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';
import { useFixtures, useLiveMatches, useStandings } from '../hooks/useFixtures';
import { footballApi } from '../services/footballApi';
import MatchIntelligence from '../components/MatchIntelligence';

// ★ Centralized imports
import { normalizeMatch } from '../engine/matchEngine';
import { seoGenerators } from '../utils/seoBuilder';
import { buildLeagueRoute, buildTeamRoute } from '../utils/routes';
import { ListSkeleton, ErrorState } from '../components/StateFeedback';

const LiveTimeline = ({ match, isLive, isFin }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isLive]);

  const { phase, displayMinute, addedMinute, timelineProgress } = useMemo(() => {
    const kickoffTime = match?.date ? new Date(match.date).getTime() : 0;
    const elapsedMs = currentTime - kickoffTime;
    const elapsedMins = Math.floor(elapsedMs / 60000);

    let p = 'Scheduled';
    let dM = match?.minute || 0;
    let aM = 0;
    let tP = 0;

    if (isLive) {
      if (match?.status === '1H') {
        p = 'First Half';
        let localMinute = match.minute || Math.min(elapsedMins, 45);
        if (localMinute > 45) {
          aM = localMinute - 45;
          dM = 45;
        } else {
          dM = localMinute;
        }
        tP = (dM / 90) * 100;
      } else if (match?.status === 'HT') {
        p = 'Half Time';
        dM = 45;
        tP = 50;
      } else if (match?.status === '2H' || match?.status === 'ET' || match?.status === 'P') {
        p = match.status === 'ET' ? 'Extra Time' : match.status === 'P' ? 'Penalties' : 'Second Half';
        const secondHalfMins = Math.max(0, elapsedMins - 60);
        let localMinute = match.minute || (45 + secondHalfMins);
        
        if (localMinute > 90) {
          aM = localMinute - 90;
          dM = 90;
        } else {
          dM = localMinute;
        }
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

    return { phase: p, displayMinute: dM, addedMinute: aM, timelineProgress: tP };
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
      {isLive && addedMinute > 0 && (
        <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#ef4444', marginTop: '4px', fontWeight: 700 }}>
          +{addedMinute}'
        </div>
      )}
    </div>
  );
};

const LiveStatusText = ({ match, isLive, isFin }) => {
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

export default function MatchDetails() {
  const { matchId } = useParams();
  
  const { data: todayFixtures = [] } = useFixtures(todayStr());
  const { data: yesterdayFixtures = [] } = useFixtures(getLocalDateStr(-1));
  const { data: tomorrowFixtures = [] } = useFixtures(getLocalDateStr(1));
  const { data: liveMatches = [] } = useLiveMatches();

  const baseMatch = useMemo(() => {
    const liveMatch = liveMatches.find(m => String(m.id) === String(matchId) || String(m.matchId) === String(matchId));
    
    if (liveMatch) {
      const fixtureMatch = [...todayFixtures, ...yesterdayFixtures, ...tomorrowFixtures]
        .find(m => String(m.id) === String(matchId) || String(m.matchId) === String(matchId));
      
      return fixtureMatch ? { ...fixtureMatch, ...liveMatch } : liveMatch;
    }

    const allMatches = [...todayFixtures, ...yesterdayFixtures, ...tomorrowFixtures, ...liveMatches];
    return allMatches.find(m => String(m.id) === String(matchId) || String(m.matchId) === String(matchId));
  }, [todayFixtures, yesterdayFixtures, tomorrowFixtures, liveMatches, matchId]);

  const standingsLeagueId = baseMatch?.league?.id || baseMatch?.leagueId;
  
  const { data: standingsData = [] } = useStandings(standingsLeagueId);
  const standingsTable = standingsData?.[0]?.standings?.[0] || [];

  const [intelligence, setIntelligence] = useState(null);
  const [extraLoading, setExtraLoading] = useState(true);
  
  useEffect(() => {
    if (!baseMatch) return;
    
    let mounted = true;
    setExtraLoading(true);

    const fetchExtras = async () => {
      try {
        const intRes = await footballApi.getMatchDetails(baseMatch.id);
        if (mounted) setIntelligence(intRes?.data?.intelligence || intRes?.intelligence);
      } catch (e) { /* Silently fail */ }

      if (mounted) setExtraLoading(false);
    };

    fetchExtras();
    
    return () => { mounted = false; };
  }, [baseMatch]);

  // ★ REFACTORED: Use the centralized engine instead of duplicating 80 lines of time logic
  const matchData = useMemo(() => {
    if (!baseMatch) return null;
    const normalized = normalizeMatch(baseMatch, true, Date.now());
    
    const homeTeam = baseMatch.homeTeam || { name: baseMatch.homeTeamName || 'Home Team', id: baseMatch.homeTeamId };
    const awayTeam = baseMatch.awayTeam || { name: baseMatch.awayTeamName || 'Away Team', id: baseMatch.awayTeamId };
    const league = baseMatch.league || baseMatch.competition || { name: baseMatch.leagueName || 'Football', id: baseMatch.leagueId };

    return {
      isLive: normalized.isLive,
      isFin: normalized.isFinished,
      safeHomeScore: normalized.homeScore,
      safeAwayScore: normalized.awayScore,
      homeName: normalized.homeName,
      awayName: normalized.awayName,
      homeId: homeTeam.id || baseMatch.homeTeamId,
      awayId: awayTeam.id || baseMatch.awayTeamId,
      leagueName: normalized.leagueName,
      leagueId: normalized.leagueId,
      statusClass: normalized.isLive ? 'md-status-live' : normalized.isFinished ? 'md-status-fin' : 'md-status-sched',
      date: baseMatch.date,
      venue: baseMatch.venue,
      referee: baseMatch.referee,
      minute: normalized.displayMinute,
      addedMinute: normalized.addedMinute,
      status: normalized.status,
      category: baseMatch.category || 'NORMAL'
    };
  }, [baseMatch]);

  if (!baseMatch || !matchData) {
    return (
      <div className="md-error" style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <SEO title="Match Not Found | ZOKASCORE" />
        <div style={{ textAlign: 'center' }}>
          <div className="md-error-msg" style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: 12 }}>Match Not Found</div>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>We couldn't find this match in our active cache.</p>
          <Link to="/fixtures" className="md-back-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.85rem', background: 'var(--bg-card)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <ArrowLeft size={14} /> Back to Fixtures
          </Link>
        </div>
      </div>
    );
  }

  const { 
    isLive, isFin, safeHomeScore, safeAwayScore, 
    homeName, awayName, homeId, awayId, 
    leagueName, leagueId, statusClass, date, venue, referee, minute, addedMinute, status, category
  } = matchData;
  
  // ★ REFACTORED: Use centralized SEO builder
  const seoProps = seoGenerators.matchPage({
    homeName, awayName, leagueName, date, venue, isLive, isFinished: isFin, 
    homeScore: safeHomeScore, awayScore: safeAwayScore, 
    path: `/match/${matchId}/`
  });

  return (
    <div className="md-page" style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)' }}>
      <SEO {...seoProps} />
      
      <div className="md-container" style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 80px' }}>
        <Link to="/fixtures" className="md-back-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.85rem', marginBottom: 20, background: 'var(--bg-card)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <div className="md-header" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <p className="md-league" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Link to={buildLeagueRoute(leagueId, leagueName)} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{leagueName}</Link>
            {category === 'FEATURED' && (
              <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(251,191,36,0.2)' }}>★ TOP MATCH</span>
            )}
          </p>
          <div className="md-teams" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div className="md-team-home" style={{ flex: 1 }}>
              <Link to={buildTeamRoute(homeId, homeName)} style={{ textDecoration: 'none' }}>
                <h1 className="md-team-name" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{homeName}</h1>
              </Link>
            </div>
            <div className="md-score-box">
              <div className="md-score" style={{ fontSize: '2.5rem', fontWeight: 900, fontFamily: 'var(--font-display, system-ui)', color: isLive ? '#ef4444' : isFin ? '#10b981' : '#fff' }}>
                {safeHomeScore ?? '-'} - {safeAwayScore ?? '-'}
              </div>
              {isLive && minute != null && (
                <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700, marginTop: '4px' }}>
                  ⚽ {minute}'{addedMinute > 0 ? `+${addedMinute}` : ''}
                </div>
              )}
            </div>
            <div className="md-team-away" style={{ flex: 1 }}>
              <Link to={buildTeamRoute(awayId, awayName)} style={{ textDecoration: 'none' }}>
                <h1 className="md-team-name" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{awayName}</h1>
              </Link>
            </div>
          </div>
          
          <div className={`md-status-badge ${statusClass}`} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, fontSize: '.75rem', fontWeight: 700, background: isLive ? 'rgba(239,68,68,.1)' : isFin ? 'rgba(16,185,129,.1)' : 'rgba(255,255,255,.03)', color: isLive ? '#ef4444' : isFin ? '#10b981' : 'var(--text-muted)' }}>
            {isLive && <span className="md-live-dot" style={{ width: 8, height: 8, background: '#ef4444', borderRadius: '50%', animation: 'nvLiveDot 1.2s infinite' }}></span>}
            <LiveStatusText match={{ date, minute, status }} isLive={isLive} isFin={isFin} />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <LiveTimeline match={{ date, minute, status }} isLive={isLive} isFin={isFin} />
        </div>

        <div className="md-info-bar" style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 20, fontSize: '.8rem', color: 'var(--text-muted)' }}>
          {date && (
            <span className="md-info-item" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} /> {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {formatTime(date)}
            </span>
          )}
          {venue?.name && (
            <span className="md-info-item" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={14} /> {venue.name}
            </span>
          )}
          {referee && (
            <span className="md-info-item" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} /> {referee}
            </span>
          )}
        </div>

        <div style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', fontWeight: 800 }}>
            <Trophy size={18} style={{ color: '#10b981' }} /> Match Intelligence
          </h3>
          {extraLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <Loader size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : (
            <MatchIntelligence data={intelligence} />
          )}
        </div>

        {standingsTable.length > 0 && (
          <div className="md-info-card" style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <h2 className="md-info-title" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={18} style={{ color: '#fbbf24' }} /> League Standings
            </h2>
            <div className="standings-mini">
              {standingsTable.slice(0, 5).map((team, i) => (
                <div key={team.teamId || team.rank} className="standing-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 700, width: 24 }}>{team.rank || i + 1}.</span>
                  <Link to={buildTeamRoute(team.teamId, team.teamName)} style={{ flex: 1, marginLeft: 10, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, fontSize: '.9rem' }}>
                    {team.teamName}
                  </Link>
                  <span style={{ color: '#10b981', fontWeight: 800, fontSize: '.9rem' }}>{team.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="md-info-card" style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, textAlign: 'center' }}>
          <h2 className="md-info-title" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>Head to Head & Recent Form</h2>
          <p className="md-info-text" style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>
            Detailed head-to-head history and recent form for {homeName} vs {awayName} will be displayed here. 
            Check back soon for updates!
          </p>
          <Link to="/fixtures" className="md-cta" style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', borderRadius: 8, background: 'rgba(16,185,129,.1)', color: '#10b981', textDecoration: 'none', fontWeight: 700, fontSize: '.85rem' }}>
            View All Today's Fixtures
          </Link>
        </div>

      </div>
    </div>
  );
}