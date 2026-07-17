import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';
import { fetchFixtures, fetchYesterdayFixtures, fetchTomorrowFixtures } from "../utils/api";
import { todayStr as getTodayStr } from "../utils/dates";
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';

export default function MatchDetails() {
  const { matchId, slug } = useParams();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getMatch = async () => {
      try {
        // ★ FIX: Fetch all 3 days to ensure we find the match regardless of its schedule
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
        <Link to="/mastergames" style={{ color: '#10b981', fontWeight: 700, textDecoration: 'none' }}>
          ← Back to Fixtures
        </Link>
      </div>
    );
  }

  const homeName = match.homeTeam?.name || 'Home Team';
  const awayName = match.awayTeam?.name || 'Away Team';
  const leagueName = match.league?.name || 'Football';
  const title = `${homeName} vs ${awayName} - Live Score & Predictions | ZOKASCORE`;
  const description = `Watch ${homeName} vs ${awayName} live. Get real-time scores, match stats, and expert predictions for this ${leagueName} match on ZokaScore.`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": `${homeName} vs ${awayName}`,
    "sport": "Football",
    "startDate": match.utcDate || match.date,
    "location": {
      "@type": "Place",
      "name": match.venue?.name || leagueName
    },
    "homeTeam": { "@type": "SportsTeam", "name": homeName },
    "awayTeam": { "@type": "SportsTeam", "name": awayName }
  };

  const isLive = isLiveStatus(match.status, SPORT.FOOTBALL);
  const isFin = isFinishedStatus(match.status, SPORT.FOOTBALL);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1a', color: '#f8fafc', padding: '24px 16px' }}>
      <SEO 
        title={title}
        description={description}
        keywords={`${homeName} vs ${awayName}, ${homeName} live score, ${awayName} live score, ${leagueName} predictions`}
        path={`/match/${matchId}/${slug}`}
        structuredData={structuredData}
      />
      
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* ★ FIX: Smooth Back Button */}
        <Link 
          to="/mastergames" 
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

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', margin: 0 }}>
            {homeName} <span style={{ color: '#64748b', fontSize: '1.2rem' }}>vs</span> {awayName}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '.85rem', marginTop: '8px', fontWeight: 600 }}>{leagueName}</p>
        </div>

        <div style={{ 
          background: 'rgba(30,41,59,0.4)', 
          backdropFilter: 'blur(12px)',
          padding: '32px 20px', 
          borderRadius: '16px', 
          textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          <div style={{ 
            fontSize: '3rem', 
            fontWeight: 900, 
            color: isLive ? '#ef4444' : isFin ? '#10b981' : '#fff',
            fontFamily: 'system-ui, sans-serif'
          }}>
            {match.homeScore ?? 0} - {match.awayScore ?? 0}
          </div>
          
          <div style={{ 
            display: 'inline-block',
            marginTop: '12px',
            padding: '4px 12px',
            borderRadius: '6px',
            fontSize: '.7rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            background: isLive ? 'rgba(239,68,68,0.15)' : isFin ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.06)',
            color: isLive ? '#ef4444' : isFin ? '#10b981' : '#94a3b8'
          }}>
            {isLive ? `LIVE ${match.minute ? `(${match.minute}')` : ''}` : isFin ? 'Finished' : 'Scheduled'}
          </div>
          
          <div style={{ marginTop: '32px' }}>
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
    </div>
  );
}