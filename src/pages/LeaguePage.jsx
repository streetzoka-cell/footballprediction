import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import SEO from '../components/SEO';
import { fetchLeagueStandings } from '../utils/api';

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);

export default function LeaguePage() {
  const { leagueId, slug } = useParams();
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const stand = await fetchLeagueStandings(leagueId);
      setStandings(stand || []);
      setLoading(false);
    };
    load();
  }, [leagueId]);

  const leagueName = slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'League';

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": `${leagueName} Standings`,
    "sport": "Soccer",
    "url": `https://zokascore.xyz/league/${leagueId}/${slug}`
  };

  return (
    <div className="md-page">
      <SEO 
        title={`${leagueName} Table, Standings & Fixtures | ZOKASCORE`}
        description={`Live ${leagueName} standings, table, fixtures, and scores on ZOKASCORE.`}
        path={`/league/${leagueId}/${slug}`}
        structuredData={structuredData}
      />
      
      <div className="md-container">
        <Link to="/fixtures" className="md-back-btn">
          <ArrowLeft size={16} /> Back to Fixtures
        </Link>

        <div className="md-header">
          <h1 className="md-team-name">{leagueName}</h1>
          <p className="md-league">League Standings</p>
        </div>

        <div className="md-info-card">
          <Trophy size={28} className="md-info-icon" />
          <h2 className="md-info-title">Current Table</h2>
          
          {loading ? (
            <p className="md-info-text">Loading standings...</p>
          ) : standings.length === 0 ? (
            <p className="md-info-text">No standings found for this league.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px' }}>
              {standings.map((team, i) => (
                <div 
                  key={team.team.id} 
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#0a0f1a', borderRadius: '8px' }}
                >
                  <span style={{ color: '#64748b', width: '25px' }}>{i + 1}.</span>
                  <Link 
                    to={`/team/${team.team.id}/${slugify(team.team.name)}`} 
                    style={{ flex: 1, marginLeft: 10, color: '#f8fafc', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {team.team.name}
                  </Link>
                  <div style={{ display: 'flex', gap: '15px', fontSize: '.8rem', color: '#94a3b8' }}>
                    <span>PL: {team.playedGames}</span>
                    <span>W: {team.won}</span>
                    <span>D: {team.draw}</span>
                    <span>L: {team.lost}</span>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>PTS: {team.points}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}