import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useFootballData } from '../context/FootballDataContext';
import SEO from '../components/SEO';

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  
  // We use the football data context to search through loaded fixtures
  const { fixtures, loading } = useFootballData();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchParams(query ? { q: query } : {});
  };

  const results = useMemo(() => {
    if (!query.trim() || !fixtures.length) return [];
    const q = query.toLowerCase();
    return fixtures.filter(m => {
      const homeName = m.homeTeam?.name?.toLowerCase() || '';
      const awayName = m.awayTeam?.name?.toLowerCase() || '';
      const leagueName = m.competition?.name?.toLowerCase() || '';
      return homeName.includes(q) || awayName.includes(q) || leagueName.includes(q);
    }).slice(0, 50); // Limit to 50 results for performance
  }, [query, fixtures]);

  return (
    <div className="md-page">
      <SEO 
        title={`Search${query ? `: ${query}` : ''} | ZOKASCORE`} 
        description="Search for football matches, teams, and leagues on ZOKASCORE." 
        // ★ Best practice: Tell Google not to index search result pages, but to follow the links on them
        robots="noindex,follow" 
      />
      
      <div className="md-container">
        <h1 className="md-team-name" style={{ marginBottom: '20px' }}>Search ZOKASCORE</h1>
        
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <SearchIcon size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input 
              type="text" 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="Search team or league..." 
              style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', background: '#0a0f1a', border: '1px solid #151b26', color: '#f8fafc', fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }}
              autoFocus
            />
          </div>
          <button type="submit" style={{ padding: '0 20px', borderRadius: '8px', background: '#10b981', color: '#000', fontWeight: '700', border: 'none', cursor: 'pointer' }}>
            Search
          </button>
        </form>

        {loading && <p style={{ color: '#94a3b8' }}>Loading data...</p>}

        {!loading && query && results.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
            <p>No matches found for "{query}".</p>
            <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>Try searching for a team like "Arsenal" or "Real Madrid".</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '10px' }}>{results.length} results found</p>
            {results.map(m => {
              const matchSlug = `${slugify(m.homeTeam?.name)}-vs-${slugify(m.awayTeam?.name)}`;
              return (
                <Link 
                  to={`/match/${m.id}/${matchSlug}`} 
                  key={m.id} 
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#0a0f1a', borderRadius: '8px', textDecoration: 'none', color: '#f8fafc', border: '1px solid #151b26' }}
                >
                  <div>
                    <div style={{ fontWeight: '700' }}>{m.homeTeam?.name} vs {m.awayTeam?.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{m.competition?.name}</div>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {m.utcDate ? new Date(m.utcDate).toLocaleDateString() : ''}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        
        {!loading && !query && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
            <p>Type something in the search bar to find matches.</p>
          </div>
        )}
      </div>
    </div>
  );
}