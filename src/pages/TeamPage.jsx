import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Loader } from 'lucide-react';
import SEO from '../components/SEO';
import { formatTime, todayStr, getLocalDateStr } from '../utils/dates';
import { useFixtures } from '../hooks/useFixtures';

// ★ Centralized imports
import { seoGenerators } from '../utils/seoBuilder';
import { buildMatchRoute } from '../utils/routes';
import { ListSkeleton } from '../components/StateFeedback';
import EmptyState from '../components/EmptyState';

export default function TeamPage() {
  const { teamId, slug } = useParams();

  // Fetch fixtures for today, yesterday, and tomorrow to find team matches
  const { data: todayFx = [], isLoading: todayLoad } = useFixtures(todayStr());
  const { data: yestFx = [], isLoading: yestLoad } = useFixtures(getLocalDateStr(-1));
  const { data: tomFx = [], isLoading: tomLoad } = useFixtures(getLocalDateStr(1));

  const isLoading = todayLoad || yestLoad || tomLoad;

  const fixtures = [...todayFx, ...yestFx, ...tomFx].filter(m => {
    const homeId = m.homeTeam?.id || m.homeTeamId;
    const awayId = m.awayTeam?.id || m.awayTeamId;
    return String(homeId) === String(teamId) || String(awayId) === String(teamId);
  });

  const teamName = slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Team';
  const path = `/team/${teamId}/${slug}`;

  // ★ Centralized SEO generation
  const seoProps = seoGenerators.teamPage({ teamName, path });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)' }}>
      <SEO {...seoProps} />
      
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 80px' }}>
        <Link to="/fixtures" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.85rem', marginBottom: 20, background: 'var(--bg-card)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Calendar size={24} style={{ color: 'var(--accent)' }} /> {teamName}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '.9rem' }}>Upcoming & Recent Matches</p>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          {isLoading ? (
            <ListSkeleton count={5} />
          ) : fixtures.length === 0 ? (
            <EmptyState icon={Calendar} title="No matches found for this team in the next 3 days." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {fixtures.map(m => {
                const matchLink = buildMatchRoute(m.id, m.homeName, m.awayName);
                return (
                  <Link 
                    to={matchLink} 
                    key={m.id} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '12px 16px', 
                      background: 'var(--bg-surface)', 
                      borderRadius: 10, 
                      textDecoration: 'none', 
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      transition: 'background .2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: '.85rem' }}>{m.homeName}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>vs</span>
                      <span style={{ fontWeight: 700, fontSize: '.85rem' }}>{m.awayName}</span>
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '.8rem' }}>
                      <Calendar size={12} /> 
                      {m.utcDate || m.date ? new Date(m.utcDate || m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBD'} 
                      <span style={{ marginLeft: '5px', color: 'var(--accent)', fontWeight: 600 }}>{formatTime(m.utcDate || m.date)}</span>
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