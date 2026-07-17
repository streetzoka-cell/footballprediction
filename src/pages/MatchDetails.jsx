import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Users, Trophy, Clock } from 'lucide-react';
import SEO from '../components/SEO';
import { fetchFixtures, fetchYesterdayFixtures, fetchTomorrowFixtures } from "../utils/api";
import { todayStr as getTodayStr, formatTime } from "../utils/dates";
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';

export default function MatchDetails() {
  const { matchId, slug } = useParams();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Tick the clock every second for live time estimation
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const getMatch = async () => {
      try {
        const [yRes, tRes, tmRes] = await Promise.all([
          fetchYesterdayFixtures(),
          fetchFixtures(getTodayStr()),
          fetchTomorrowFixtures()
        ]);
        
        const allMatches = [
          ...(yRes?.matches || []),
          ...(tRes?.matches || []),
          ...(tmRes?.matches || [])
        ];
        
        const found = allMatches.find(m => String(m.id) === String(matchId));
        setMatch(found);
      } catch (e) {
        console.error("Match fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    getMatch();
  }, [matchId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading match...
      </div>
    );
  }

  if (!match) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1a', color: '#fff', padding: '24px', textAlign: 'center' }}>
        <div style={{ marginBottom: '20px', fontWeight: 800, fontSize: '1.2rem' }}>Match not found.</div>
        <Link to="/fixtures" style={{ color: '#10b981', fontWeight: 700, textDecoration: 'none' }}>
          ← Back to Fixtures
        </Link>
      </div>
    );
  }

  const homeName = match.homeTeam?.name || 'Home Team';
  const awayName = match.awayTeam?.name || 'Away Team';
  const leagueName = match.league?.name || 'Football';
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

  const isLive = isLiveStatus(match.status, SPORT.FOOTBALL);
  const isFin = isFinishedStatus(match.status, SPORT.FOOTBALL);

  // ── SMART TIME ESTIMATION LOGIC ──
  const kickoffTime = match.date ? new Date(match.date).getTime() : 0;
  const elapsedMs = currentTime - kickoffTime;
  const elapsedMins = Math.floor(elapsedMs / 60000);

  let phase = 'Scheduled';
  let displayMinute = match.minute || 0;
  let timelineProgress = 0; // 0 to 100%

  if (isLive) {
    if (match.status === '1H') {
      phase = 'First Half';
      displayMinute = match.minute || Math.min(elapsedMins, 45);
      timelineProgress = (displayMinute / 90) * 100;
    } else if (match.status === 'HT') {
      phase = 'Half Time';
      displayMinute = 45;
      timelineProgress = 50;
    } else if (match.status === '2H' || match.status === 'ET' || match.status === 'P') {
      phase = match.status === 'ET' ? 'Extra Time' : match.status === 'P' ? 'Penalties' : 'Second Half';
      // 2nd half starts at kickoff + 60 mins (45 min play + 15 min break)
      const secondHalfMins = Math.max(0, elapsedMins - 60);
      displayMinute = match.minute || Math.min(45 + secondHalfMins, 90);
      timelineProgress = Math.min((displayMinute / 90) * 100, 100);
    }
  } else if (isFin) {
    phase = 'Full Time';
    displayMinute = 90;
    timelineProgress = 100;
  } else if (kickoffTime > currentTime) {
    phase = 'Scheduled';
    const diffMins = Math.floor((kickoffTime - currentTime) / 60000);
    if (diffMins < 60) phase = `Starts in ${diffMins}m`;
    else phase = `Starts in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1a', color: '#f8fafc', padding: '24px 16px', paddingBottom: '60px' }}>
      <SEO 
        title={title}
        description={description}
        keywords={`${homeName} vs ${awayName}, ${homeName} live score, ${awayName} live score, ${leagueName} predictions`}
        path={`/match/${matchId}/${slug}`}
        structuredData={structuredData}
      />
      
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <Link 
          to="/fixtures" 
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px', 
            color: '#94a3b8', 
            fontWeight: 700, 
            marginBottom: '24px', 
            textDecoration: 'none',
            background: 'rgba(255,255,255,0.05)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          <ArrowLeft size={16} /> Back to Fixtures
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ color: '#94a3b8', fontSize: '.75rem', marginTop: '0', marginBottom: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {leagueName}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}>{homeName}</h1>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', minWidth: '80px' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: isLive ? '#ef4444' : isFin ? '#10b981' : '#fff' }}>
                {match.homeScore ?? 0} - {match.awayScore ?? 0}
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}>{awayName}</h1>
            </div>
          </div>
          
          {/* Status Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '20px', fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', background: isLive ? 'rgba(239,68,68,0.15)' : isFin ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.06)', color: isLive ? '#ef4444' : isFin ? '#10b981' : '#94a3b8' }}>
            {isLive && <span style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', animation: 'pulse 1.5s infinite' }}></span>}
            {isLive ? `${phase} ${displayMinute ? `(${displayMinute}')` : ''}` : phase}
          </div>
        </div>

        {/* Smart Visual Timeline (Only for Live/Finished) */}
        {(isLive || isFin) && (
          <div style={{ background: 'rgba(30,41,59,0.4)', backdropFilter: 'blur(12px)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '.75rem', fontWeight: 700 }}>Kickoff</span>
              <span style={{ color: '#94a3b8', fontSize: '.75rem', fontWeight: 700 }}>Half Time</span>
              <span style={{ color: '#94a3b8', fontSize: '.75rem', fontWeight: 700 }}>Full Time</span>
            </div>
            
            {/* Timeline Track */}
            <div style={{ position: 'relative', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginBottom: '12px' }}>
              {/* Halftime Marker */}
              <div style={{ position: 'absolute', left: '50%', top: '-4px', width: '2px', height: '16px', background: '#64748b', borderRadius: '1px' }}></div>
              
              {/* Progress Fill */}
              <div style={{ 
                width: `${timelineProgress}%`, 
                height: '100%', 
                background: isLive ? 'linear-gradient(90deg, #10b981, #ef4444)' : '#10b981', 
                borderRadius: '4px',
                transition: 'width 1s linear'
              }}></div>
              
              {/* Live Marker Dot */}
              {isLive && (
                <div style={{ 
                  position: 'absolute', 
                  left: `calc(${timelineProgress}% - 6px)`, 
                  top: '-4px', 
                  width: '16px', 
                  height: '16px', 
                  background: '#ef4444', 
                  border: '2px solid #fff', 
                  borderRadius: '50%',
                  boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
                  transition: 'left 1s linear'
                }}></div>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '.7rem', color: '#64748b' }}>
              <span>0'</span>
              <span>45'</span>
              <span>90'</span>
            </div>
          </div>
        )}

        {/* Match Info Bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px', marginBottom: '24px', fontSize: '.75rem', color: '#64748b' }}>
          {match.date && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> {new Date(match.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
          {match.venue?.name && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {match.venue.name}</span>}
          {match.referee && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={12} /> {match.referee}</span>}
        </div>

        {/* Info Card */}
        <div style={{ background: 'rgba(30,41,59,0.4)', backdropFilter: 'blur(12px)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
          <Trophy size={28} style={{ color: '#10b981', margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Match Center</h2>
          <p style={{ fontSize: '.8rem', color: '#94a3b8', margin: '0', lineHeight: 1.5 }}>
            Scores update in real-time here when the match goes live. 
            <br/>Check the fixtures page for live updates across all matches!
          </p>
        </div>

        {/* Prediction CTA */}
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <Link 
            to="/predictions" 
            style={{ 
              display: 'inline-block', 
              padding: '12px 32px', 
              background: '#10b981', 
              color: '#fff', 
              borderRadius: '10px', 
              fontWeight: 800, 
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
            }}
          >
            Make Predictions
          </Link>
        </div>
      </div>
    </div>
  );
}