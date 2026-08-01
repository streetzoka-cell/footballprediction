import { Link } from 'react-router-dom';
import { liteClient } from 'algoliasearch/lite';
import { InstantSearch, SearchBox, Hits, Highlight, Configure } from 'react-instantsearch';
import SEO from '../components/SEO';

const searchClient = liteClient(
  'YOUR_ALGOLIA_APP_ID',
  'YOUR_ALGOLIA_SEARCH_KEY'
);

function MatchHit({ hit }) {
  const matchSlug = `${hit.homeTeamName}-vs-${hit.awayTeamName}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  return (
    <Link
      to={`/match/${hit.objectID}/${matchSlug}`}
      className="glass-card flex-between p-12 mb-8 hover:border-primary"
      style={{ textDecoration: 'none' }}
    >
      <div className="flex-col gap-4">
        <div className="font-bold text-primary text-sm">
          <Highlight attribute="homeTeamName" hit={hit} /> vs{' '}
          <Highlight attribute="awayTeamName" hit={hit} />
        </div>
        <div className="text-muted text-xs">
          <Highlight attribute="leagueName" hit={hit} />
        </div>
      </div>
      <span className="text-muted text-xs">
        {hit.status === 'NS' ? new Date(hit.date).toLocaleString() : hit.status}
      </span>
    </Link>
  );
}

export default function SearchPage() {
  return (
    <div className="zoka-page">
      <SEO
        title="Search Football Matches, Teams & Leagues"
        description="Search football matches, teams, leagues, fixtures, live scores, standings, and predictions instantly across ZOKASCORE."
        keywords="football search, search matches, search teams, search leagues, football fixtures, live scores, ZOKASCORE search"
        robots="noindex,follow"
         />

      <div className="zoka-wrap">
        <h1 className="text-primary font-extrabold mb-20">Search Matches</h1>

        <InstantSearch searchClient={searchClient} indexName="matches">
          <Configure hitsPerPage={20} />

          <div className="mb-24">
            <SearchBox
              placeholder="Search team or league..."
              classNames={{
                root: 'w-full',
                input: 'glass-card w-full p-12 text-primary text-sm outline-none border-none',
                submit: 'hidden',
                reset: 'hidden',
              }}
            />
          </div>

          <Hits hitComponent={MatchHit} />
        </InstantSearch>
      </div>
    </div>
  );
}