import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Loader, Zap, TrendingUp, Camera } from 'lucide-react';
import SEO from '../components/SEO';
import { useFixtures, useStandings } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr, formatTime } from '../utils/dates';
import { buildMatchRoute, buildTeamRoute, buildLeagueRoute } from '../utils/routes';
import { useState, useEffect, useRef, useMemo } from 'react';

export default function MatchDetails() {
  const { matchId } = useParams();
  
  // ★ FIX: useFixtures now merges live and finished matches internally!
  const { data: todayFx = [] } = useFixtures(todayStr());
  const { data: yestFx = [] } = useFixtures(getLocalDateStr(-1));
  const { data: tomFx = [] } = useFixtures(getLocalDateStr(1));

  const match = useMemo(() => {
    // Check today, then tomorrow, then yesterday
    const all = [...todayFx, ...tomFx, ...yestFx];
    return all.find(m => String(m.id) === String(matchId));
  }, [todayFx, yestFx, tomFx, matchId]);

  const standingsLeagueId = match?.leagueId;
  const { data: standingsData } = useStandings(standingsLeagueId);
  const standingsTable = standingsData?.standings?.[0] || [];

  // Goal Flash Animation
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

  if (!match) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader size={32} className="animate-spin" style={{ color: '#fff' }} />
      </div>
    );
  }

  // Destructure flat properties mapped by the passthrough matchEngine
  const { homeName, awayName, homeLogo, awayLogo, leagueName, leagueLogo, date, leagueId, category, kickoff, status, isLive, isFinished, isHT, isStarted, minute, displayMinute, homeScore, awayScore } = match;
  
  const matchLink = buildMatchRoute(match.id, homeName, awayName);
  const timelineProgress = isFinished ? 100 : isHT ? 50 : displayMinute ? Math.min((displayMinute / 90) * 100, 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: '#fff' }} className="zoka-page">
      <SEO title={`${homeName} vs ${awayName} | ZOKASCORE`} />
      <div className="zoka-wrap" style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 80px' }}>
        <Link to="/fixtures" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.85rem', marginBottom: 20, background: 'var(--bg-card)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        {/* Header Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          {goalFlash && (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(255,255,255,0.1))', animation: 'flashBg 2s ease-out', pointerEvents: 'none' }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16, position: 'relative' }}>
            {leagueLogo && <img src={leagueLogo} alt="" width="20" height="20" style={{objectFit:'contain'}} />}
            <Link to={buildLeagueRoute(leagueId, leagueName)} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.8rem', fontWeight: 700, textTransform: 'uppercase' }}>{leagueName}</Link>
            {category === 'FEATURED' && <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '3px 8px', borderRadius: 6 }}>★ TOP MATCH</span>}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
            <Link to={buildTeamRoute(match.homeTeamId, homeName)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#fff' }}>
              {homeLogo && <img src={homeLogo} alt={homeName} width="48" height="48" style={{objectFit:'contain'}} />}
              <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{homeName}</h1>
            </Link>
            
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: isLive ? '#ef4444' : isFinished ? '#10b981' : '#fff' }}>
                {(isLive || isHT || isFinished) ? `${homeScore ?? '-'} - ${awayScore ?? '-'}` : 'VS'}
              </div>
              {isLive && !isHT && (
                <div style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                  <span style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%', animation: 'pulse 1.5s infinite' }}></span> 
                  LIVE {displayMinute || minute || 0}'
                </div>
              )}
              {isHT && <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>HALF TIME</div>}
              {isFinished && <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700 }}>FULL TIME</div>}
              {!isLive && !isFinished && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{kickoff}</div>}
            </div>

            <Link to={buildTeamRoute(match.awayTeamId, awayName)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#fff' }}>
              {awayLogo && <img src={awayLogo} alt={awayName} width="48" height="48" style={{objectFit:'contain'}} />}
              <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{awayName}</h1>
            </Link>
          </div>

          {/* Live Timeline Progress Bar */}
          {(isLive || isFinished) && (
            <div style={{ marginTop: 24, position: 'relative' }}>
              <div style={{ height: 4, background: '#151b26', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${timelineProgress}%`, background: isLive ? '#ef4444' : '#10b981', transition: 'width 1s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: '0.6rem', color: '#64748b' }}>0'</span>
                <span style={{ fontSize: '0.6rem', color: '#64748b' }}>45'</span>
                <span style={{ fontSize: '0.6rem', color: '#64748b' }}>90'</span>
              </div>
            </div>
          )}
        </div>

        {/* Match Info Bar */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 20, fontSize: '.8rem', color: 'var(--text-muted)' }}>
          {date && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {formatTime(date)}</span>}
        </div>

        {/* React Now Button (Studio) */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Link to="/studio/reactor" state={{ fixtureId: match.id, homeTeam: homeName, awayTeam: awayName, homeLogo, awayLogo, score: { home: homeScore, away: awayScore }, minute: displayMinute || minute }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', padding: '10px 20px', borderRadius: 12, textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}>
            <Camera size={16} /> React Now
          </Link>
        </div>

        {/* Standings Mini */}
        {standingsTable.length > 0 && (
          <div className="md-info-card" style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <h2 className="md-info-title" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} style={{ color: '#fbbf24' }} /> League Standings
            </h2>
            <div className="standings-mini">
              {standingsTable.slice(0, 5).map((team, i) => (
                <div key={team.team?.id || team.rank} className="standing-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 700, width: 24 }}>{team.rank || i + 1}.</span>
                  <Link to={buildTeamRoute(team.team?.id, team.team?.name)} style={{ flex: 1, marginLeft: 10, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, fontSize: '.9rem' }}>
                    {team.team?.name || 'TBD'}
                  </Link>
                  <span style={{ color: '#10b981', fontWeight: 800, fontSize: '.9rem' }}>{team.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}