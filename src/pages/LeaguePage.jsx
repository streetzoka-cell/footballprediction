import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import SEO from '../components/SEO';
import { useStandings } from '../hooks/useFixtures';
import { buildTeamRoute } from '../utils/routes';

export default function LeaguePage() {
  const { leagueId, slug } = useParams();
  const { data: standingsData, isLoading } = useStandings(leagueId);
  
  const leagueName = slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'League';
  const standingsTable = standingsData?.standings?.[0] || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)' }}>
      <SEO title={`${leagueName} Standings | ZOKASCORE`} />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 80px' }}>
        <Link to="/fixtures" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.85rem', marginBottom: 20, background: 'var(--bg-card)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trophy size={24} style={{ color: 'var(--gold)' }} /> {leagueName}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '.9rem' }}>League Standings & Table</p>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading standings...</div>
          ) : standingsTable.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No standings found for this league.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 40px 40px 40px 40px 50px', gap: '8px', padding: '0 12px 8px', fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                <span>#</span>
                <span>Team</span>
                <span style={{ textAlign: 'center' }}>P</span>
                <span style={{ textAlign: 'center' }}>W</span>
                <span style={{ textAlign: 'center' }}>D</span>
                <span style={{ textAlign: 'center' }}>L</span>
                <span style={{ textAlign: 'right' }}>Pts</span>
              </div>

              {standingsTable.map((team, i) => (
                <div key={team.team?.id || team.rank} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 40px 40px 40px 40px 50px', gap: '8px', alignItems: 'center', padding: '10px 12px', borderRadius: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '.85rem' }}>{team.rank || i + 1}</span>
                  <Link to={buildTeamRoute(team.team?.id, team.team?.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, fontSize: '.9rem' }}>
                    {team.team?.logo && <img src={team.team?.logo} alt={team.team?.name} width="18" height="18" style={{ objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.team?.name || 'TBD'}</span>
                  </Link>
                  <span style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>{team.all?.played ?? '-'}</span>
                  <span style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>{team.all?.win ?? '-'}</span>
                  <span style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>{team.all?.draw ?? '-'}</span>
                  <span style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>{team.all?.lose ?? '-'}</span>
                  <span style={{ textAlign: 'right', fontSize: '.9rem', color: 'var(--accent)', fontWeight: 800 }}>{team.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}