import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { fetchFixtures } from "../utils/api";
import { todayStr as getTodayStr } from "../utils/dates";
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';

export default function MatchDetails() {
  const { matchId, slug } = useParams();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getMatch = async () => {
      try {
        const res = await fetchFixtures(getTodayStr());
        const list = Array.isArray(res) ? res : res?.matches || [];
        const found = list.find(m => String(m.id) === String(matchId));
        setMatch(found);
      } catch (e) {
        console.error("Match not found");
      } finally {
        setLoading(false);
      }
    };
    getMatch();
  }, [matchId]);

  if (loading) return <div className="p-4 text-center text-white">Loading match...</div>;
  if (!match) return <div className="p-4 text-center text-white">Match not found.</div>;

  const homeName = match.homeTeam?.name || 'Home Team';
  const awayName = match.awayTeam?.name || 'Away Team';
  const leagueName = match.league?.name || 'Football';
  const title = `${homeName} vs ${awayName} - Live Score & Predictions | ZOKASCORE`;
  const description = `Watch ${homeName} vs ${awayName} live. Get real-time scores, match stats, and expert predictions for this ${leagueName} match on ZokaScore.`;

  // JSON-LD Structured Data for Google Search Console
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
    <div className="v21-wrap" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <SEO 
        title={title}
        description={description}
        keywords={`${homeName} vs ${awayName}, ${homeName} live score, ${awayName} live score, ${leagueName} predictions`}
        path={`/match/${matchId}/${slug}`}
        structuredData={structuredData}
      />
      
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>
          {homeName} <span style={{ color: 'var(--text-muted)' }}>vs</span> {awayName}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{leagueName}</p>
      </div>

      <div className="v21-mc" style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: isLive ? '#ef4444' : isFin ? 'var(--accent)' : 'var(--text-primary)' }}>
          {match.homeScore ?? 0} - {match.awayScore ?? 0}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', marginTop: '8px' }}>
          Status: {isLive ? 'LIVE' : isFin ? 'Finished' : 'Scheduled'}
        </p>
        
        <Link to="/predictions" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 24px', background: 'var(--accent)', color: '#fff', borderRadius: '8px', fontWeight: 800, textDecoration: 'none' }}>
          Make Predictions
        </Link>
      </div>
    </div>
  );
}