import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import SEO from '../components/SEO';
import { useStandings } from '../hooks/useFixtures';
import { buildTeamRoute } from '../utils/routes';
import { seoGenerators } from '../utils/seoBuilder'; // ★ NEW IMPORT

export default function LeaguePage() {
  const { leagueId, slug } = useParams();
  const { data: standingsData, isLoading } = useStandings(leagueId);
  
  const leagueName = slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'League';
  const standingsTable = standingsData?.standings?.[0] || [];

  // ★ NEW: Centralized SEO generation
  const leaguePath = `/league/${leagueId}/${slug || leagueName.toLowerCase().replace(/\s+/g, "-")}`;
  const seo = useMemo(() => (
    seoGenerators.leaguePage({
      leagueName,
      path: leaguePath,
      leagueLogo: standingsData?.league?.logo, 
    })
  ), [leagueName, leaguePath, standingsData]);

  return (
    <div className="zoka-page">
      {/* ★ REPLACED WITH RICH SEO */}
      <SEO {...seo} />
      
      <div className="zoka-wrap">
        <Link to="/fixtures" className="btn btn-ghost btn-sm mb-20">
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <div className="flex-center gap-12 mb-24">
          <Trophy size={24} className="text-gold" />
          <h1 className="text-primary font-extrabold">{leagueName}</h1>
        </div>

        <div className="glass-card p-20">
          {isLoading ? (
            <div className="text-center p-32 text-muted">Loading standings...</div>
          ) : standingsTable.length === 0 ? (
            <div className="text-center p-32 text-muted">No standings found for this league.</div>
          ) : (
            <div className="flex-col gap-8">
              <div className="grid gap-8 pb-8 text-muted text-xs font-bold uppercase border-b" style={{ gridTemplateColumns: '30px 1fr 40px 40px 40px 40px 50px' }}>
                <span>#</span>
                <span>Team</span>
                <span className="text-center">P</span>
                <span className="text-center">W</span>
                <span className="text-center">D</span>
                <span className="text-center">L</span>
                <span className="text-right">Pts</span>
              </div>

              {standingsTable.map((team, i) => (
                <div key={team.team?.id || team.rank} className="grid gap-8 items-center p-8 hover:bg-card-hover rounded-md" style={{ gridTemplateColumns: '30px 1fr 40px 40px 40px 40px 50px' }}>
                  <span className="text-muted font-bold text-sm">{team.rank || i + 1}</span>
                  <Link to={buildTeamRoute(team.team?.id, team.team?.name)} className="flex-center gap-8 text-primary font-bold text-sm">
                    {team.team?.logo && <img src={team.team?.logo} alt={team.team?.name} width="18" height="18" onError={(e) => e.target.style.display='none'} />}
                    <span className="truncate">{team.team?.name || 'TBD'}</span>
                  </Link>
                  <span className="text-center text-sm text-secondary">{team.all?.played ?? '-'}</span>
                  <span className="text-center text-sm text-secondary">{team.all?.win ?? '-'}</span>
                  <span className="text-center text-sm text-secondary">{team.all?.draw ?? '-'}</span>
                  <span className="text-center text-sm text-secondary">{team.all?.lose ?? '-'}</span>
                  <span className="text-right text-sm text-primary font-extrabold">{team.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}