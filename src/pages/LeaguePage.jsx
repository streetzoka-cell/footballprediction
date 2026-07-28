import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Trophy, Loader } from 'lucide-react';
import SEO from '../components/SEO';
import { useStandings } from '../hooks/useFixtures';

// ★ Centralized imports
import { seoGenerators } from '../utils/seoBuilder';
import { buildTeamRoute } from '../utils/routes';
import { ListSkeleton } from '../components/StateFeedback';
import EmptyState from '../components/EmptyState';
import { slugify } from '../utils/format';

export default function LeaguePage() {
  const { leagueId, slug } = useParams();

  // Use the smart React Query hook
  const { data: standingsData, isLoading } = useStandings(leagueId);
  
  const leagueName = slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'League';
  
  // Extract the table array correctly
  const standingsTable = standingsData?.[0]?.standings?.[0] || [];
  const path = `/league/${leagueId}/${slug}`;

  // ★ Centralized SEO generation
  const seoProps = seoGenerators.leaguePage({ leagueName, path });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)' }}>
      <SEO {...seoProps} />
      
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
            <ListSkeleton count={8} />
          ) : standingsTable.length === 0 ? (
            <EmptyState icon={Trophy} title="No standings found for this league." />
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
                <div 
                  key={team.teamId || team.rank} 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '30px 1fr 40px 40px 40px 40px 50px', 
                    gap: '8px', 
                    alignItems: 'center',
                    padding: '10px 12px', 
                    background: i < 4 ? 'rgba(59,130,246,.05)' : 'transparent', 
                    borderRadius: 8,
                    transition: 'background .2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = i < 4 ? 'rgba(59,130,246,.1)' : 'rgba(255,255,255,.03)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = i < 4 ? 'rgba(59,130,246,.05)' : 'transparent'}
                >
                  <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '.85rem' }}>{team.rank || i + 1}</span>
                  <Link 
                    to={buildTeamRoute(team.teamId, team.teamName)} 
                    style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, fontSize: '.9rem' }}
                  >
                    {team.teamLogo && <img src={team.teamLogo} alt={team.teamName} width="18" height="18" style={{ objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {team.teamName}
                    </span>
                  </Link>
                  <span style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>{team.played}</span>
                  <span style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>{team.win}</span>
                  <span style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>{team.draw}</span>
                  <span style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>{team.lose}</span>
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