import React, { useState, useEffect } from 'react';

// ⚠️ PASTE YOUR CLOUDFLARE TUNNEL URL HERE ⚠️
const TUNNEL_URL = "https://chorus-oct-rolled-encourage.trycloudflare.com";
const STATIC_BASE = `${TUNNEL_URL}/api/v1/data`;

export default function TestFixtures() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];
        
        // 1. Fetch static fixtures and live matches simultaneously
        const [fixRes, liveRes] = await Promise.all([
          fetch(`${STATIC_BASE}/fixtures/${today}.json`),
          fetch(`${STATIC_BASE}/live.json`)
        ]);

        if (!fixRes.ok) throw new Error(`Fixtures HTTP ${fixRes.status}`);
        
        const fixJson = await fixRes.json();
        let liveJson = { data: [] };
        if (liveRes.ok) liveJson = await liveRes.json();

        const fixtures = fixJson.data || [];
        const liveMatches = liveJson.data || [];

        // 2. Merge: Live matches overwrite scheduled matches
        const map = new Map();
        fixtures.forEach(m => map.set(String(m.id), m));
        liveMatches.forEach(m => map.set(String(m.id), m)); // Live data wins

        // 3. Convert to array and sort by kickoff timestamp
        const merged = Array.from(map.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        setMatches(merged);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>Loading matches from backend...</div>;
  if (error) return <div style={{ padding: 40, color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#05070a', color: '#fff', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: 10, color: '#10b981' }}>
          Backend Data Inspector
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: 24 }}>
          Displaying {matches.length} matches from backend. Refreshes every 30s.
        </p>
        
        {matches.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', background: '#151b26', borderRadius: 12, border: '1px solid #2d3748' }}>
            No matches returned from backend.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {matches.map((m) => {
              // Safely read the smart display object
              const kickoff = m.time?.kickoffLocal || 'TBD';
              const status = m.display?.status || 'NS';
              const score = m.display?.score?.display || 'VS';
              const isLive = m.display?.isLive;
              const isFinished = m.display?.isFinished;
              const minute = m.display?.minute;
              
              let statusColor = '#64748b'; // Gray for scheduled
              if (isLive) statusColor = '#ef4444'; // Red for live
              if (isFinished) statusColor = '#10b981'; // Green for finished

              return (
                <div key={m.id} style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '60px 1fr 80px 1fr 80px', 
                  gap: '12px',
                  alignItems: 'center', 
                  padding: '12px 16px', 
                  background: '#151b26', 
                  borderRadius: '8px',
                  border: '1px solid #2d3748',
                  fontSize: '0.9rem'
                }}>
                  {/* Kickoff Time */}
                  <div style={{ fontWeight: 700, color: '#94a3b8', fontFamily: 'monospace' }}>
                    {kickoff}
                  </div>
                  
                  {/* Home Team */}
                  <div style={{ fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.homeTeamName}
                  </div>
                  
                  {/* Score / VS */}
                  <div style={{ 
                    fontWeight: 900, 
                    fontFamily: 'monospace', 
                    textAlign: 'center',
                    color: isLive ? '#ef4444' : '#fff',
                    background: isLive ? 'rgba(239,68,68,0.1)' : 'transparent',
                    padding: '4px 0',
                    borderRadius: '6px'
                  }}>
                    {score}
                  </div>
                  
                  {/* Away Team */}
                  <div style={{ fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.awayTeamName}
                  </div>

                  {/* Status / Minute */}
                  <div style={{ 
                    textAlign: 'right',
                    fontWeight: 800, 
                    fontSize: '0.8rem',
                    color: statusColor,
                    whiteSpace: 'nowrap'
                  }}>
                    {isLive && minute ? `${minute}'` : status}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}