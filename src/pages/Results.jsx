// src/pages/Results.jsx
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { footballApi } from '../services/footballApi';
import { buildMatchRoute, buildTeamRoute, buildLeagueRoute } from '../utils/routes';
import SEO from '../components/SEO';
import { normalizeMatch } from '../engine/matchEngine';
import { ChevronRight, Calendar, Trophy } from 'lucide-react';
import { ListSkeleton } from '../components/StateFeedback';

export default function Results() {
  const [selectedDate, setSelectedDate] = useState(''); // Empty = last 7 days global

  const { data, isLoading } = useQuery({
    queryKey: ['results-archive', selectedDate],
    queryFn: async () => {
      const params = selectedDate ? { date: selectedDate, limit: 50 } : { limit: 50 };
      const res = await footballApi.getResults(params);
      return res.data?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const matches = useMemo(() => (data || []).map(m => normalizeMatch(m, true, Date.now())), [data]);

  // Group by League for better SEO structure
  const grouped = useMemo(() => {
    const map = {};
    matches.forEach(m => {
      const lName = m.leagueName || 'Other';
      if (!map[lName]) map[lName] = { logo: m.leagueLogo, id: m.leagueId, matches: [] };
      map[lName].matches.push(m);
    });
    return map;
  }, [matches]);

  return (
    <div className="zoka-home">
      <SEO 
        title="Football Results, Final Scores & Match Archives" 
        description="Browse historical football results, final scores, and match archives from leagues worldwide. Find past H2H stats and team performances."
        path="/results"
      />
      
      <div className="zoka-home-wrap" style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 24 }}>🏆 Football Results Archive</h1>
        
        <div style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Calendar size={18} />
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
          />
          {selectedDate && (
            <button onClick={() => setSelectedDate('')} className="btn btn-ghost btn-sm">Clear</button>
          )}
        </div>

        {isLoading ? (
          <ListSkeleton count={5} />
        ) : matches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No results found for this period.</div>
        ) : (
          Object.entries(grouped).map(([leagueName, { id, logo, matches: leagueMatches }]) => (
            <div key={leagueName} style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                {logo && <img src={logo} alt={leagueName} width={20} height={20} style={{ objectFit: 'contain' }} />}
                <Link to={buildLeagueRoute(id, leagueName)} style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  {leagueName}
                </Link>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {leagueMatches.map(m => (
                  <Link 
                    key={m.id} 
                    to={buildMatchRoute(m.id, m.homeName, m.awayName)} 
                    style={{ textDecoration: 'none', display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, transition: 'border 0.2s' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                      <span>{m.dateStr}</span>
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>FT</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {m.homeLogo && <img src={m.homeLogo} width={24} height={24} alt="" />}
                        <span style={{ fontWeight: 600 }}>{m.homeName}</span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', minWidth: 60, textAlign: 'center' }}>
                        {m.homeScore ?? '-'} <span style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>-</span> {m.awayScore ?? '-'}
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <span style={{ fontWeight: 600, textAlign: 'right' }}>{m.awayName}</span>
                        {m.awayLogo && <img src={m.awayLogo} width={24} height={24} alt="" />}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}