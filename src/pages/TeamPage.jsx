import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, Brain, Building2, Trophy } from 'lucide-react';
import SEO from '../components/SEO';
import { buildMatchRoute, buildLeagueRoute } from '../utils/routes';
import { seoGenerators } from '../utils/seoBuilder';
import { footballApi } from '../services/footballApi';

export default function TeamPage() {
  const { teamId, slug } = useParams();

  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ['team-meta', teamId],
    queryFn: () => footballApi.getTeam(teamId).then(r => r?.data || r || null),
    enabled: !!teamId,
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });

  const { data: fixtures = [], isLoading: fixturesLoading } = useQuery({
    queryKey: ['team-fixtures', teamId],
    queryFn: async () => (await footballApi.getTeamFixtures?.(teamId) || await footballApi.getLeagueFixtures?.(teamId) || {data:[]})?.data || [],
    enabled: !!teamId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: historicalResults = [] } = useQuery({
    queryKey: ['team-historical-results', teamId],
    queryFn: () => footballApi.getResults({ teamId, limit: 10 }).then(r => r?.data || r || []),
    enabled: !!teamId,
    staleTime: 30 * 60 * 1000,
  });

  const teamName = useMemo(() => teamData?.name || (slug ? slug.replace(/-/g,' ').replace(/\b\w/g,l=>l.toUpperCase()) : 'Team'), [teamData, slug]);
  const teamPath = `/team/${teamId}/${slug || teamName.toLowerCase().replace(/\s+/g,'-')}`;

  const seo = useMemo(() => seoGenerators.teamPage({
    teamName, path: teamPath, teamLogo: teamData?.logo, country: teamData?.country, venue: teamData?.venue,
  }), [teamName, teamPath, teamData]);

  const aiPrompt = `Provide comprehensive tactical analysis, current form, key players for ${teamName}. Include H2H and next match expectations.`;
  const openAI = () => window.dispatchEvent(new CustomEvent('openZokaAI', { detail: { message: aiPrompt } }));

  return (
    <div className="zoka-page">
      <SEO {...seo} />
      <div className="zoka-wrap">
        <Link to="/fixtures" className="btn btn-ghost btn-sm mb-20"><ArrowLeft size={14}/> Back to Fixtures</Link>

        <div className="glass-card team-hero-card">
          <div className="flex-center gap-16 mb-16">
            {teamData?.logo && <img src={teamData.logo} alt={teamName} width="64" height="64" className="team-crest-lg" onError={e=>e.target.style.display='none'}/>}
            <div><h1 className="team-title">{teamName}</h1><div className="team-meta"><span>{teamData?.country}</span>{teamData?.venue && <span className="flex-center gap-4"><Building2 size={14}/> {teamData.venue}</span>}</div></div>
          </div>
          <button onClick={openAI} className="btn btn-primary w-full flex-center gap-8 ai-gradient"><Brain size={18}/> Generate AI Tactical Report for {teamName}</button>
        </div>

        <h2 className="section-h2"><Calendar size={18}/> Upcoming Matches</h2>
        <div className="glass-card p-20 mb-24">
          {fixturesLoading ? <p className="empty-loading">Loading schedule...</p>
          : fixtures.length===0 ? <p className="empty-loading">No upcoming matches found.</p>
          : <div className="flex-col gap-8">{fixtures.map(m=>{ const home=m.homeName||m.homeTeam?.name||'Home', away=m.awayName||m.awayTeam?.name||'Away'; return <Link to={buildMatchRoute(m.id,home,away)} key={m.id} className="match-row-link"><div className="match-row-teams"><span>{home}</span><span className="vs muted">vs</span><span>{away}</span></div><span className="text-xs muted flex-center gap-4"><Calendar size={12}/>{m.date?new Date(m.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'TBD'} <strong className="primary">{m.kickoff||''}</strong></span></Link>; })}</div>}
        </div>

        <h2 className="section-h2 mt-24"><Calendar size={18}/> Recent Results Archive</h2>
        <div className="glass-card p-20 mb-24">
          {historicalResults.length>0 ? <div className="flex-col gap-8">{historicalResults.slice(0,10).map(m=>{ const home=m.homeName||m.homeTeam?.name||'Home', away=m.awayName||m.awayTeam?.name||'Away'; return <Link to={buildMatchRoute(m.id,home,away)} key={m.id} className="match-row-link"><div className="match-row-teams"><span>{home}</span><span className="primary bold mx-4">{m.homeScore} - {m.awayScore}</span><span>{away}</span></div><span className="text-xs muted">{m.date?new Date(m.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'FT'}</span></Link>; })}</div>
          : <p className="empty-loading">No historical results found.</p>}
        </div>

        {teamData?.leagueId && <div className="glass-card p-20"><h3 className="label-xs mb-12 flex-center gap-4"><Trophy size={12}/> League Directory</h3><Link to={buildLeagueRoute(teamData.leagueId,teamData.leagueName||'League')} className="btn btn-ghost w-full flex-center gap-8">View {teamData.leagueName} Standings & Fixtures <ArrowLeft size={14} className="rotate-180"/></Link></div>}
      </div>
    </div>
  );
}