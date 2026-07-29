import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import SEO from '../components/SEO';
import { formatTime } from '../utils/dates';
import { useFixtures, useLiveMatches } from '../hooks/useFixtures';
import { footballApi } from '../services/footballApi'; // ★ FIXED IMPORT
import { useQuery } from '@tanstack/react-query';
import { buildMatchRoute } from '../utils/routes';
import { todayStr, getLocalDateStr } from '../utils/dates';

export default function TeamPage() {
  const { teamId, slug } = useParams();
  
  // Fetch team details from TheSportsDB (via Gateway)
  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => (await footballApi.getTeam(teamId))?.data || null,
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Fetch matches to find ones involving this team
  const { data: todayFx = [] } = useFixtures(todayStr());
  const { data: yestFx = [] } = useFixtures(getLocalDateStr(-1));
  const { data: tomFx = [] } = useFixtures(getLocalDateStr(1));
  const { data: liveFx = [] } = useLiveMatches();

  const fixtures = [...todayFx, ...yestFx, ...tomFx, ...liveFx].filter(m => {
    return String(m.homeTeamId) === String(teamId) || String(m.awayTeamId) === String(teamId);
  }).sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));

  const teamName = teamData?.name || (slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Team');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: '#fff' }}>
      <SEO title={`${teamName} | ZOKASCORE`} />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 80px' }}>
        <Link to="/fixtures" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.85rem', marginBottom: 20, background: 'var(--bg-card)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          {teamData?.logo && <img src={teamData.logo} alt={teamName} width="64" height="64" style={{objectFit:'contain'}} onError={(e) => e.target.style.display='none'} />}
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0 }}>{teamName}</h1>
            {teamData?.country && <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '.9rem' }}>{teamData.country}</p>}
            {teamData?.venue && <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '.9rem' }}>Stadium: {teamData.venue}</p>}
          </div>
        </div>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 12 }}>Upcoming & Recent Matches</h2>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          {teamLoading ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Loading team...</p>
          ) : fixtures.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No matches found for this team in the next 3 days.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {fixtures.map(m => (
                <Link to={buildMatchRoute(m.id, m.homeName, m.awayName)} key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 10, textDecoration: 'none', color: '#fff', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '.85rem' }}>{m.homeName}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>vs</span>
                    <span style={{ fontWeight: 700, fontSize: '.85rem' }}>{m.awayName}</span>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '.8rem' }}>
                    <Calendar size={12} /> {m.date ? new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBD'} 
                    <span style={{ marginLeft: '5px', color: 'var(--accent)', fontWeight: 600 }}>{m.kickoff || ''}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}