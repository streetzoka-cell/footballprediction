import { Link } from 'react-router-dom';
import { liteClient } from 'algoliasearch/lite';
import { InstantSearch, SearchBox, Hits, Highlight, Configure } from 'react-instantsearch';
import SEO from '../components/SEO';
import { Search as SearchIcon } from 'lucide-react';

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
    <li>
      <Link
        to={`/match/${hit.objectID}/${matchSlug}`}
        className="glass-card flex-between p-12 mb-8 hover:border-primary transition-colors"
        style={{ textDecoration: 'none', display: 'block' }}
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
    </li>
  );
}

export default function SearchPage() {
  const searchSchema = {
    "@context": "https://schema.org",
    "@type": "SearchResultsPage",
    "name": "Search Football Matches, Teams & Leagues",
    "url": "https://zokascore.xyz/search"
  };

  return (
    <div className="zoka-page">
      <SEO
        title="Search Football Matches, Teams & Leagues | ZOKASCORE"
        description="Search football matches, teams, leagues, fixtures, live scores, standings, and predictions instantly across ZOKASCORE."
        keywords="football search, search matches, search teams, search leagues, football fixtures, live scores, ZOKASCORE search"
        robots="noindex,follow"
        structuredData={searchSchema}
      />

      <div className="zoka-wrap">
        <div className="flex-center gap-12 mb-24">
          <div className="flex-center" style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>
            <SearchIcon size={24} />
          </div>
        </div>
        
        <h1 className="text-primary font-extrabold text-2xl text-center mb-8">Search Matches & Teams</h1>
        <p className="text-muted text-sm text-center mb-24 max-w-500 mx-auto">
          Instantly find upcoming fixtures, historical results, team profiles, and league standings across our global football database.
        </p>

        <InstantSearch searchClient={searchClient} indexName="matches">
          <Configure hitsPerPage={20} />

          <div className="mb-24">
            <SearchBox
              placeholder="Search team, league, or match..."
              classNames={{
                root: 'w-full',
                input: 'glass-card w-full p-16 text-primary text-base outline-none border-none focus:border-primary transition-colors',
                submit: 'hidden',
                reset: 'hidden',
              }}
            />
          </div>

          {/* ★ SEO GOLD: Semantic list structure for Googlebot */}
          <ul className="list-none p-0 m-0">
            <Hits hitComponent={MatchHit} />
          </ul>
        </InstantSearch>
      </div>
    </div>
  );
}