import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react'; 
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, Brain, Building2, Trophy } from "lucide-react";
import SEO from '../components/SEO';
import { buildMatchRoute, buildLeagueRoute } from '../utils/routes';
import { seoGenerators } from '../utils/seoBuilder'; 

export default function TeamPage() {
  const { teamId, slug } = useParams();
  
  // 1. Fetch Team Meta
  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ['team-meta', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/teams/${teamId}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });

  // ★ SEO FIX: Targeted lightweight fetch instead of 3 global days
  const { data: fixtures = [], isLoading: fixturesLoading } = useQuery({
    queryKey: ['team-fixtures', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/teams/${teamId}/fixtures`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  const teamName = teamData?.name || (slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Team');
  const teamPath = `/team/${teamId}/${slug || teamName.toLowerCase().replace(/\s+/g, "-")}`;
  
  const seo = useMemo(() => (
    seoGenerators.teamPage({
      teamName,
      path: teamPath,
      teamLogo: teamData?.logo,
      country: teamData?.country,
      venue: teamData?.venue,
    })
  ), [teamName, teamPath, teamData]);

  const aiPrompt = `Provide a comprehensive tactical analysis, current form guide, and key player spotlight for ${teamName}. Include their recent head-to-head record and expectations for their next match.`;

  return (
    <div className="zoka-page">
      <SEO {...seo} />

      <div className="zoka-wrap">
        <Link to="/fixtures" className="btn btn-ghost btn-sm mb-20">
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <div className="glass-card p-24 mb-24">
          <div className="flex-center gap-16 mb-16">
            {teamData?.logo && <img src={teamData.logo} alt={teamName} width="64" height="64" onError={(e) => e.target.style.display='none'} />}
            <div>
              <h1 className="text-primary font-extrabold text-2xl">{teamName}</h1>
              <div className="flex gap-12 mt-4 text-muted text-sm">
                {/* ★ FIX: Changed Stadium to Building2 */}
                {teamData?.country && <span className="flex-center gap-4"><Building2 size={14}/> {teamData.country}</span>}
                {teamData?.venue && <span className="flex-center gap-4"><Building2 size={14}/> {teamData.venue}</span>}
              </div>
            </div>
          </div>

          {/* ★ SEO GOLD: AI Tactical Analysis Prompt (Cures Thin Content) */}
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('openZokaAI', { detail: { message: aiPrompt } }))} 
            className="btn btn-primary w-full flex-center gap-8"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))' }}
          >
            <Brain size={18} /> Generate AI Tactical Report for {teamName}
          </button>
        </div>

        <h2 className="text-primary font-bold mb-12 flex-center gap-8" style={{justifyContent: 'flex-start'}}>
          <Calendar size={18} /> Upcoming & Recent Matches
        </h2>
        
        <div className="glass-card p-20 mb-24">
          {fixturesLoading ? (
            <p className="text-muted text-center p-20">Loading schedule...</p>
          ) : fixtures.length === 0 ? (
            <p className="text-muted text-center p-20">No matches found for this team in the current window.</p>
          ) : (
            <div className="flex-col gap-8">
              {fixtures.map(m => (
                <Link to={buildMatchRoute(m.id, m.homeName || m.homeTeam?.name, m.awayName || m.awayTeam?.name)} key={m.id} className="flex-between items-center p-12 bg-surface rounded-md border hover:border-primary transition-colors">
                  <div className="flex-center gap-8 font-bold text-sm text-primary">
                    <span>{m.homeName || m.homeTeam?.name}</span>
                    <span className="text-muted text-xs">vs</span>
                    <span>{m.awayName || m.awayTeam?.name}</span>
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

        {/* ★ SEO INTERNAL LINKING: Keep Googlebot crawling */}
        {teamData?.leagueId && (
          <div className="glass-card p-20">
            <h3 className="text-muted text-xs font-bold uppercase mb-12 flex-center gap-4"><Trophy size={12} /> League Directory</h3>
            <Link 
              to={buildLeagueRoute(teamData.leagueId, teamData.leagueName || 'League')} 
              className="btn btn-ghost w-full flex-center gap-8"
            >
              View {teamData.leagueName} Standings & Fixtures <ArrowLeft size={14} style={{transform: 'rotate(180deg)'}} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}