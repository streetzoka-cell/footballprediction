import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { footballApi } from '../services/footballApi';
import { buildMatchRoute, buildLeagueRoute } from '../utils/routes';
import SEO from '../components/SEO';
import { normalizeMatch } from '../engine/matchEngine';
import { Calendar } from 'lucide-react';
import { ListSkeleton } from '../components/StateFeedback';

export default function Results() {
  const [selectedDate, setSelectedDate] = useState(''); 

  const { data, isLoading } = useQuery({
    queryKey: ['results-archive', selectedDate],
    queryFn: async () => {
      const params = selectedDate ? { date: selectedDate, limit: 50 } : { limit: 50 };
      const res = await footballApi.getResults(params);
      return res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const matches = useMemo(() => (data || []).map(m => normalizeMatch(m, true, Date.now())), [data]);

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
    <div className="res-page">
      <SEO 
        title="Football Results, Final Scores & Match Archives" 
        description="Browse historical football results, final scores, and match archives from leagues worldwide. Find past H2H stats and team performances."
        path="/results"
      />
      
      <h1 className="res-h1">🏆 Football Results Archive</h1>
      
      <div className="res-filter-bar">
        <Calendar size={18} className="text-muted" />
        <input 
          type="date" 
          value={selectedDate} 
          onChange={(e) => setSelectedDate(e.target.value)}
          className="res-input"
        />
        {selectedDate && (
          <button onClick={() => setSelectedDate('')} className="btn btn-ghost btn-sm">Clear</button>
        )}
      </div>

      {isLoading ? (
        <ListSkeleton count={5} />
      ) : matches.length === 0 ? (
        <div className="zk-empty-state glass-card">No results found for this period.</div>
      ) : (
        Object.entries(grouped).map(([leagueName, { id, logo, matches: leagueMatches }]) => (
          <div key={leagueName} className="res-group">
            <div className="res-group-head">
              {logo && <img src={logo} alt={leagueName} />}
              <Link to={buildLeagueRoute(id, leagueName)}>{leagueName}</Link>
            </div>
            
            <div className="res-list">
              {leagueMatches.map(m => (
                <Link 
                  key={m.id} 
                  to={buildMatchRoute(m.id, m.homeName, m.awayName)} 
                  className="res-match-card"
                >
                  <div className="res-match-top">
                    <span>{m.dateStr}</span>
                    <span className="badge badge-primary">FT</span>
                  </div>
                  <div className="res-match-teams">
                    <div className="res-team">
                      {m.homeLogo && <img src={m.homeLogo} alt="" />}
                      <span>{m.homeName}</span>
                    </div>
                    <div className="res-score">
                      {m.homeScore ?? '-'} <span className="res-score-sep">-</span> {m.awayScore ?? '-'}
                    </div>
                    <div className="res-team">
                      <span>{m.awayName}</span>
                      {m.awayLogo && <img src={m.awayLogo} alt="" />}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}