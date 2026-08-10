import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trophy, Brain, Calendar } from 'lucide-react';
import SEO from '../components/SEO';
import { useStandings } from '../hooks/useFixtures';
import { buildTeamRoute, buildMatchRoute } from '../utils/routes';
import { seoGenerators } from '../utils/seoBuilder';
import { footballApi } from '../services/footballApi';

export default function LeaguePage() {
  const { leagueId, slug } = useParams();

  const {
    data: standingsData,
    isLoading: standingsLoading,
  } = useStandings(leagueId);

  const leagueName = slug
    ? slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'League';

  const standingsTable = standingsData?.standings?.[0] || [];

  /*
   * Dedicated backend endpoint:
   *
   * GET https://api.zokascore.xyz/api/v1/leagues/:leagueId/fixtures
   *
   * Never use /api/v1/... here because the React application
   * is hosted separately from the backend.
   */
  const {
    data: leagueFixtures = [],
    isLoading: fixturesLoading,
  } = useQuery({
    queryKey: ['league-fixtures', leagueId],
    // ★ FIX: Extract the array from the 'data' property to prevent .slice() crash
    queryFn: async () => {
      const res = await footballApi.getLeagueFixtures(leagueId);
      return res?.data || [];
    },
    enabled: !!leagueId,
    staleTime: 1000 * 60 * 10,
  });

  const {
    data: recentResultsResponse,
    isLoading: resultsLoading,
  } = useQuery({
    queryKey: ['league-results', leagueId],
    queryFn: () =>
      footballApi.getResults({
        leagueId,
        limit: 10,
      }),
    enabled: !!leagueId,
    staleTime: 1000 * 60 * 30,
  });

  /*
   * Backend historical-results response may be either:
   *
   * { data: [...] }
   * or
   * [...]
   *
   * Normalize both safely.
   */
  const recentResults = Array.isArray(recentResultsResponse)
    ? recentResultsResponse
    : recentResultsResponse?.data || [];

  const leaguePath = `/league/${
    leagueId
  }/${
    slug ||
    leagueName.toLowerCase().replace(/\s+/g, '-')
  }`;

  const seo = useMemo(
    () =>
      seoGenerators.leaguePage({
        leagueName,
        path: leaguePath,
        leagueLogo: standingsData?.league?.logo,
      }),
    [leagueName, leaguePath, standingsData]
  );

  const aiPrompt = `Provide a comprehensive overview of the ${leagueName} current season. Discuss the title race, relegation battle, top scorers, and tactical trends defining the league this year.`;

  return (
    <div className="zoka-page">
      <SEO {...seo} />

      <div className="zoka-wrap">
        <Link
          to="/fixtures"
          className="btn btn-ghost btn-sm mb-20"
        >
          <ArrowLeft size={14} />
          Back to Fixtures
        </Link>

        <div className="glass-card p-24 mb-24">
          <div className="flex-center gap-12 mb-16">
            <Trophy size={24} className="text-gold" />

            <h1 className="text-primary font-extrabold text-2xl">
              {leagueName}
            </h1>
          </div>

          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('openZokaAI', {
                  detail: {
                    message: aiPrompt,
                  },
                })
              )
            }
            className="btn btn-primary w-full flex-center gap-8"
            style={{
              background:
                'linear-gradient(135deg, var(--primary), var(--primary-dim))',
            }}
          >
            <Brain size={18} />
            Generate AI {leagueName} Season Report
          </button>
        </div>

        <h2
          className="text-primary font-bold mb-12 flex-center gap-8"
          style={{ justifyContent: 'flex-start' }}
        >
          <Calendar size={18} />
          Upcoming {leagueName} Fixtures
        </h2>

        <div className="glass-card p-20 mb-24">
          {fixturesLoading ? (
            <div className="text-center p-20 text-muted">
              Loading fixtures...
            </div>
          ) : leagueFixtures.length === 0 ? (
            <div className="text-center p-20 text-muted">
              No upcoming fixtures found.
            </div>
          ) : (
            <div className="flex-col gap-8">
              {leagueFixtures.slice(0, 5).map((match) => {
                const homeName =
                  match.homeName ||
                  match.homeTeam?.name ||
                  'Home';

                const awayName =
                  match.awayName ||
                  match.awayTeam?.name ||
                  'Away';

                return (
                  <Link
                    to={buildMatchRoute(
                      match.id,
                      homeName,
                      awayName
                    )}
                    key={match.id}
                    className="flex-between items-center p-12 bg-surface rounded-md border hover:border-primary transition-colors"
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div className="flex-center gap-8 font-bold text-sm text-primary">
                      <span>{homeName}</span>

                      <span className="text-muted text-xs">
                        vs
                      </span>

                      <span>{awayName}</span>
                    </div>

                    <span className="text-muted text-xs">
                      {match.date
                        ? new Date(
                            match.date
                          ).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })
                        : 'TBD'}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <h2
          className="text-primary font-bold mb-12 flex-center gap-8"
          style={{ justifyContent: 'flex-start' }}
        >
          <Trophy size={18} />
          Current Standings
        </h2>

        <div className="glass-card p-20 mb-24">
          {standingsLoading ? (
            <div className="text-center p-32 text-muted">
              Loading standings...
            </div>
          ) : standingsTable.length === 0 ? (
            <div className="text-center p-32 text-muted">
              No standings found for this league.
            </div>
          ) : (
            <div className="flex-col gap-8">
              <div
                className="grid gap-8 pb-8 text-muted text-xs font-bold uppercase border-b"
                style={{
                  gridTemplateColumns:
                    '30px 1fr 40px 40px 40px 40px 50px',
                }}
              >
                <span>#</span>
                <span>Team</span>
                <span className="text-center">P</span>
                <span className="text-center">W</span>
                <span className="text-center">D</span>
                <span className="text-center">L</span>
                <span className="text-right">Pts</span>
              </div>

              {standingsTable.map((team, index) => (
                <div
                  key={
                    team.team?.id ||
                    team.rank ||
                    index
                  }
                  className="grid gap-8 items-center p-8 hover:bg-card-hover rounded-md"
                  style={{
                    gridTemplateColumns:
                      '30px 1fr 40px 40px 40px 40px 50px',
                  }}
                >
                  <span className="text-muted font-bold text-sm">
                    {team.rank || index + 1}
                  </span>

                  <Link
                    to={buildTeamRoute(
                      team.team?.id,
                      team.team?.name
                    )}
                    className="flex-center gap-8 text-primary font-bold text-sm hover:underline"
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    {team.team?.logo && (
                      <img
                        src={team.team.logo}
                        alt={
                          team.team.name ||
                          'Team'
                        }
                        width="18"
                        height="18"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display =
                            'none';
                        }}
                      />
                    )}

                    <span className="truncate">
                      {team.team?.name || 'TBD'}
                    </span>
                  </Link>

                  <span className="text-center text-sm text-secondary">
                    {team.all?.played ?? '-'}
                  </span>

                  <span className="text-center text-sm text-secondary">
                    {team.all?.win ?? '-'}
                  </span>

                  <span className="text-center text-sm text-secondary">
                    {team.all?.draw ?? '-'}
                  </span>

                  <span className="text-center text-sm text-secondary">
                    {team.all?.lose ?? '-'}
                  </span>

                  <span className="text-right text-sm text-primary font-extrabold">
                    {team.points ?? '-'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <h2
          className="text-primary font-bold mb-12 mt-24 flex-center gap-8"
          style={{ justifyContent: 'flex-start' }}
        >
          <Calendar size={18} />
          Recent {leagueName} Results
        </h2>

        <div className="glass-card p-20 mb-24">
          {resultsLoading ? (
            <div className="text-center p-20 text-muted">
              Loading recent results...
            </div>
          ) : recentResults.length === 0 ? (
            <div className="text-muted text-center p-20">
              No recent results found for this league.
            </div>
          ) : (
            <div className="flex-col gap-8">
              {recentResults
                .slice(0, 10)
                .map((match) => {
                  const homeName =
                    match.homeName ||
                    match.homeTeam?.name ||
                    'Home';

                  const awayName =
                    match.awayName ||
                    match.awayTeam?.name ||
                    'Away';

                  return (
                    <Link
                      to={buildMatchRoute(
                        match.id,
                        homeName,
                        awayName
                      )}
                      key={match.id}
                      className="flex-between items-center p-12 bg-surface rounded-md border hover:border-primary transition-colors"
                      style={{
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <div className="flex-center gap-8 font-bold text-sm text-primary">
                        <span>{homeName}</span>

                        <span className="text-primary font-extrabold mx-4">
                          {match.homeScore ?? '-'} -{' '}
                          {match.awayScore ?? '-'}
                        </span>

                        <span>{awayName}</span>
                      </div>

                      <span className="text-muted text-xs">
                        {match.date
                          ? new Date(
                              match.date
                            ).toLocaleDateString(
                              'en-GB',
                              {
                                day: 'numeric',
                                month: 'short',
                              }
                            )
                          : 'FT'}
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