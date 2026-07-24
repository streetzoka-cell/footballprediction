import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import SEO from '../components/SEO';
import { fetchTeamFixtures } from '../utils/api';
import { formatTime } from '../utils/dates';

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);

export default function TeamPage() {
  const { teamId, slug } = useParams();
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const matches = await fetchTeamFixtures(teamId);
      setFixtures(matches || []);
      setLoading(false);
    };
    load();
  }, [teamId]);

  const teamName = slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Team';

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    "name": teamName,
    "sport": "Soccer",
    "url": `https://zokascore.xyz/team/${teamId}/${slug}`
  };

  return (
    <div className="md-page">
      <SEO 
        title={`${teamName} Fixtures, Live Scores & Form | ZOKASCORE`}
        description={`Latest ${teamName} matches, live scores, fixtures, and predictions on ZOKASCORE.`}
        path={`/team/${teamId}/${slug}`}
        structuredData={structuredData}
      />
      
      <div className="md-container">
        <Link to="/fixtures" className="md-back-btn">
          <ArrowLeft size={16} /> Back to Fixtures
        </Link>

        <div className="md-header">
          <h1 className="md-team-name">{teamName}</h1>
          <p className="md-league">Fixtures & Live Scores</p>
        </div>

        <div className="md-info-card">
          <h2 className="md-info-title">Upcoming & Recent Matches</h2>
          
          {loading ? (
            <p className="md-info-text">Loading fixtures...</p>
          ) : fixtures.length === 0 ? (
            <p className="md-info-text">No matches found for this team.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
              {fixtures.map(m => {
                const matchSlug = `${slugify(m.homeTeam?.name)}-vs-${slugify(m.awayTeam?.name)}`;
                return (
                  <Link 
                    to={`/match/${m.id}/${matchSlug}`} 
                    key={m.id} 
                    className="zoka-seo-link"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#0a0f1a', borderRadius: '8px', textDecoration: 'none', color: '#f8fafc' }}
                  >
                    <span>{m.homeTeam?.name} vs {m.awayTeam?.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '.8rem' }}>
                      <Calendar size={12} /> 
                      {m.date ? new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBD'} 
                      <span style={{ marginLeft: '5px' }}>{m.kickoff || formatTime(m.date)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}