import { Link } from 'react-router-dom';
import { liteClient } from 'algoliasearch/lite'; // ★ Fixed: named export
import { InstantSearch, SearchBox, Hits, Highlight, Configure } from 'react-instantsearch';
import SEO from '../components/SEO';

// Initialize Algolia client
const searchClient = liteClient(
  'YOUR_ALGOLIA_APP_ID',
  'YOUR_ALGOLIA_SEARCH_KEY'
);

// Component to render a single match result
function MatchHit({ hit }) {
  const matchSlug = `${hit.homeTeamName}-vs-${hit.awayTeamName}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  return (
    <Link
      to={`/match/${hit.objectID}/${matchSlug}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px',
        background: '#0a0f1a',
        borderRadius: '8px',
        textDecoration: 'none',
        color: '#f8fafc',
        border: '1px solid #151b26',
        marginBottom: '8px',
        transition: 'border-color 0.2s',
      }}
      className="hover:border-emerald-500"
    >
      <div>
        <div style={{ fontWeight: '700' }}>
          <Highlight attribute="homeTeamName" hit={hit} /> vs{' '}
          <Highlight attribute="awayTeamName" hit={hit} />
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
          <Highlight attribute="leagueName" hit={hit} />
        </div>
      </div>
      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
        {hit.status === 'NS' ? new Date(hit.date).toLocaleString() : hit.status}
      </span>
    </Link>
  );
}

export default function SearchPage() {
  return (
    <div className="md-page">
      <SEO
        title="Search Football Matches | ZOKASCORE"
        description="Find any football match, team, or league instantly with typo-tolerant search."
        robots="noindex,follow"
      />

      <div className="md-container">
        <h1 className="md-team-name" style={{ marginBottom: '20px' }}>
          Search Matches
        </h1>

        <InstantSearch searchClient={searchClient} indexName="matches">
          <Configure hitsPerPage={20} />

          <div style={{ marginBottom: '24px' }}>
            <SearchBox
              placeholder="Search team or league..."
              classNames={{
                root: 'w-full',
                input:
                  'w-full bg-[#0a0f1a] border border-[#151b26] rounded-lg px-4 py-3 text-white outline-none focus:border-emerald-500',
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