import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trophy, Brain, Calendar } from 'lucide-react';
import SEO from '../components/SEO';
import { useStandings } from '../hooks/useFixtures';
import { buildTeamRoute, buildMatchRoute } from '../utils/routes';
import { seoGenerators } from '../utils/seoBuilder'; 

export default function LeaguePage() {
  const { leagueId, slug } = useParams();
  const { data: standingsData, isLoading } = useStandings(leagueId);
  
  const leagueName = slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'League';
  const standingsTable = standingsData?.standings?.[0] || [];

  // Fetch upcoming fixtures for this specific league
  const { data: leagueFixtures = [] } = useQuery({
    queryKey: ['league-fixtures', leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/leagues/${leagueId}/fixtures`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  const leaguePath = `/league/${leagueId}/${slug || leagueName.toLowerCase().replace(/\s+/g, "-")}`;
  const seo = useMemo(() => (
    seoGenerators.leaguePage({
      leagueName,
      path: leaguePath,
      leagueLogo: standingsData?.league?.logo, 
    })
  ), [leagueName, leaguePath, standingsData]);

  const aiPrompt = `Provide a comprehensive overview of the ${leagueName} current season. Discuss the title race, relegation battle, top scorers, and tactical trends defining the league this year.`;

  return (
    <div className="zoka-page">
      <SEO {...seo} />
      
      <div className="zoka-wrap">
        <Link to="/fixtures" className="btn btn-ghost btn-sm mb-20">
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <div className="glass-card p-24 mb-24">
          <div className="flex-center gap-12 mb-16">
            <Trophy size={24} className="text-gold" />
            <h1 className="text-primary font-extrabold text-2xl">{leagueName}</h1>
          </div>
          
          {/* ★ SEO GOLD: AI League Insights */}
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('openZokaAI', { detail: { message: aiPrompt } }))} 
            className="btn btn-primary w-full flex-center gap-8"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))' }}
          >
            <Brain size={18} /> Generate AI {leagueName} Season Report
          </button>
        </div>

        {/* ★ SEO INTERNAL LINKING: Upcoming League Fixtures */}
        {leagueFixtures.length > 0 && (
          <>
            <h2 className="text-primary font-bold mb-12 flex-center gap-8" style={{justifyContent: 'flex-start'}}>
              <Calendar size={18} /> Upcoming {leagueName} Fixtures
            </h2>
            <div className="glass-card p-20 mb-24">
              <div className="flex-col gap-8">
                {leagueFixtures.slice(0, 5).map(m => (
                  <Link to={buildMatchRoute(m.id, m.homeName || m.homeTeam?.name, m.awayName || m.awayTeam?.name)} key={m.id} className="flex-between items-center p-12 bg-surface rounded-md border hover:border-primary transition-colors">
                    <div className="flex-center gap-8 font-bold text-sm text-primary">
                      <span>{m.homeName || m.homeTeam?.name}</span>
                      <span className="text-muted text-xs">vs</span>
                      <span>{m.awayName || m.awayTeam?.name}</span>
                    </div>
                    <span className="text-muted text-xs">
                      {m.date ? new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBD'} 
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}

        <h2 className="text-primary font-bold mb-12 flex-center gap-8" style={{justifyContent: 'flex-start'}}>
          <Trophy size={18} /> Current Standings
        </h2>

        <div className="glass-card p-20 mb-24">
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
                  <Link to={buildTeamRoute(team.team?.id, team.team?.name)} className="flex-center gap-8 text-primary font-bold text-sm hover:underline">
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