import { Link } from 'react-router-dom';
import { liteClient } from 'algoliasearch/lite';
import { InstantSearch, SearchBox, Hits, Highlight, Configure } from 'react-instantsearch';
import SEO from '../components/SEO';
import { Search as SearchIcon, ArrowLeft } from 'lucide-react';

const searchClient = liteClient('YOUR_ALGOLIA_APP_ID', 'YOUR_ALGOLIA_SEARCH_KEY');

function MatchHit({ hit }) {
  const matchSlug = `${hit.homeTeamName}-vs-${hit.awayTeamName}`.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  return (
    <Link to={`/match/${hit.objectID}/${matchSlug}`} className="search-hit">
      <div className="font-bold text-primary text-sm">
        <Highlight attribute="homeTeamName" hit={hit} /> vs <Highlight attribute="awayTeamName" hit={hit} />
      </div>
      <div className="text-muted text-xs mt-4">
        <Highlight attribute="leagueName" hit={hit} />
      </div>
    </Link>
  );
}

export default function SearchPage() {
  return (
    <div className="company-page">
      <SEO title="Search Matches & Teams" robots="noindex,follow" />
      <Link to="/" className="btn btn-ghost btn-sm mb-16"><ArrowLeft size={16} /> Back to Home</Link>
      
      <div className="company-hero-card">
        <div className="company-hero-icon"><SearchIcon size={28} /></div>
        <h1 className="text-primary font-extrabold text-2xl">Search Matches & Teams</h1>
        <p className="text-muted text-sm">Instantly find fixtures, results, and team profiles.</p>
      </div>

      <InstantSearch searchClient={searchClient} indexName="matches">
        <Configure hitsPerPage={20} />
        <SearchBox 
          placeholder="Search team, league, or match..." 
          classNames={{ root: 'search-input-wrap', input: 'ais-input', submit: 'hidden', reset: 'hidden' }} 
        />
        <ul className="list-none p-0 m-0">
          <Hits hitComponent={MatchHit} />
        </ul>
      </InstantSearch>
    </div>
  );
}