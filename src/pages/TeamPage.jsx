import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import SEO from '../components/SEO';
import { useEngineGlobalMatches } from '../zokascore_engine/hooks';
import { buildMatchRoute } from '../utils/routes';

export default function TeamPage() {
  const { teamId, slug } = useParams();
  const { data: allMatches = [] } = useEngineGlobalMatches();

  const fixtures = allMatches.filter(m => {
    return String(m.homeTeamId) === String(teamId) || String(m.awayTeamId) === String(teamId);
  }).sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));

  const teamName = slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Team';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: '#fff' }}>
      <SEO title={`${teamName} | ZOKASCORE`} />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 80px' }}>
        <Link to="/fixtures" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.85rem', marginBottom: 20, background: 'var(--bg-card)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={24} style={{ color: 'var(--accent)' }} /> {teamName}
        </h1>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          {fixtures.length === 0 ? (
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
                    <span style={{ marginLeft: '5px', color: 'var(--accent)', fontWeight: 600 }}>{m.time?.kickoffLocal || ''}</span>
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