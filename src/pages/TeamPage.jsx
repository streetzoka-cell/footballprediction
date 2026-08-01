import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import SEO from '../components/SEO';
import { formatTime } from '../utils/dates';
import { useFixtures, useLiveMatches } from '../hooks/useFixtures';
import { footballApi } from '../services/footballApi';
import { useQuery } from '@tanstack/react-query';
import { buildMatchRoute } from '../utils/routes';
import { todayStr, getLocalDateStr } from '../utils/dates';

export default function TeamPage() {
  const { teamId, slug } = useParams();
  
  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => (await footballApi.getTeam(teamId))?.data || null,
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });

  const { data: todayFx = [] } = useFixtures(todayStr());
  const { data: yestFx = [] } = useFixtures(getLocalDateStr(-1));
  const { data: tomFx = [] } = useFixtures(getLocalDateStr(1));
  const { data: liveFx = [] } = useLiveMatches();

  const fixtures = [...todayFx, ...yestFx, ...tomFx, ...liveFx].filter(m => {
    return String(m.homeTeamId) === String(teamId) || String(m.awayTeamId) === String(teamId);
  }).sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));

  const teamName = teamData?.name || (slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Team');

  return (
    <div className="zoka-page">
      <SEO
        title={`${teamName} Fixtures, Live Scores & Results`}
        description={`Follow ${teamName}'s latest fixtures, live scores, results, standings, squad information, and match statistics on ZOKASCORE.`}
        keywords={`${teamName}, ${teamName} fixtures, ${teamName} live scores, ${teamName} results, ${teamName} standings, football team, ZOKASCORE`}
        robots="index,follow"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: teamName, path: `/team/${teamId}/${teamName.toLowerCase().replace(/\s+/g, "-")}` },
        ]}
      />

      <div className="zoka-wrap">
        <Link to="/fixtures" className="btn btn-ghost btn-sm mb-20">
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <div className="flex-center gap-16 mb-24">
          {teamData?.logo && <img src={teamData.logo} alt={teamName} width="64" height="64" onError={(e) => e.target.style.display='none'} />}
          <div>
            <h1 className="text-primary font-extrabold">{teamName}</h1>
            {teamData?.country && <p className="text-muted text-sm">{teamData.country}</p>}
            {teamData?.venue && <p className="text-muted text-sm">Stadium: {teamData.venue}</p>}
          </div>
        </div>

        <h2 className="text-primary font-bold mb-12">Upcoming & Recent Matches</h2>
        <div className="glass-card p-20">
          {teamLoading ? (
            <p className="text-muted text-center">Loading team...</p>
          ) : fixtures.length === 0 ? (
            <p className="text-muted text-center">No matches found for this team in the next 3 days.</p>
          ) : (
            <div className="flex-col gap-8">
              {fixtures.map(m => (
                <Link to={buildMatchRoute(m.id, m.homeName, m.awayName)} key={m.id} className="flex-between items-center p-12 bg-surface rounded-md border">
                  <div className="flex-center gap-8 font-bold text-sm text-primary">
                    <span>{m.homeName}</span>
                    <span className="text-muted text-xs">vs</span>
                    <span>{m.awayName}</span>
                  </div>
                  <span className="flex-center gap-4 text-muted text-xs">
                    <Calendar size={12} /> {m.date ? new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBD'} 
                    <span className="text-primary font-bold">{m.kickoff || ''}</span>
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