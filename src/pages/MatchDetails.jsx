import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Users, BarChart3, Calendar, MapPin } from 'lucide-react';
import SEO from '../components/SEO';
import { fetchFixtures, fetchYesterdayFixtures, fetchTomorrowFixtures } from "../utils/api";
import { todayStr as getTodayStr, formatTime } from "../utils/dates";
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';

export default function MatchDetails() {
  const { matchId, slug } = useParams();
  const [match, setMatch] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('timeline');

  useEffect(() => {
    const getMatch = async () => {
      try {
        // 1. Fetch basic match info from cache
        const [yRes, tRes, tmRes] = await Promise.all([
          fetchYesterdayFixtures(),
          fetchFixtures(getTodayStr()),
          fetchTomorrowFixtures()
        ]);
        
        const allMatches = [
          ...(yRes?.matches || []),
          ...(tRes?.matches || []),
          ...(tmRes?.matches || [])
        ];
        
        const found = allMatches.find(m => String(m.id) === String(matchId));
        setMatch(found);

        // 2. Fetch detailed info (events, lineups, stats) from backend
        try {
          const res = await fetch(`/api/match/${matchId}`);
          if (res.ok) {
            const data = await res.json();
            setDetails(data);
          }
        } catch (err) {
          console.warn("Could not fetch detailed match info");
        }

      } catch (e) {
        console.error("Match fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    getMatch();
  }, [matchId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading match...
      </div>
    );
  }

  if (!match) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1a', color: '#fff', padding: '24px', textAlign: 'center' }}>
        <div style={{ marginBottom: '20px', fontWeight: 800, fontSize: '1.2rem' }}>Match not found.</div>
        <Link to="/mastergames" style={{ color: '#10b981', fontWeight: 700, textDecoration: 'none' }}>
          ← Back to Fixtures
        </Link>
      </div>
    );
  }

  const homeName = match.homeTeam?.name || 'Home Team';
  const awayName = match.awayTeam?.name || 'Away Team';
  const leagueName = match.league?.name || 'Football';
  const title = `${homeName} vs ${awayName} - Live Score & Predictions | ZOKASCORE`;
  const description = `Watch ${homeName} vs ${awayName} live. Get real-time scores, match stats, and expert predictions for this ${leagueName} match on ZokaScore.`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": `${homeName} vs ${awayName}`,
    "sport": "Football",
    "startDate": match.utcDate || match.date,
    "location": { "@type": "Place", "name": match.venue?.name || leagueName },
    "homeTeam": { "@type": "SportsTeam", "name": homeName },
    "awayTeam": { "@type": "SportsTeam", "name": awayName }
  };

  const isLive = isLiveStatus(match.status, SPORT.FOOTBALL);
  const isFin = isFinishedStatus(match.status, SPORT.FOOTBALL);

  // Parse details
  const events = details?.events || [];
  const lineups = details?.lineups || [];
  const statistics = details?.statistics || [];

  const homeLineup = lineups.find(l => l.team?.id === match.homeId) || lineups[0];
  const awayLineup = lineups.find(l => l.team?.id === match.awayId) || lineups[1];

  const homeStats = statistics.find(s => s.team?.id === match.homeId)?.statistics || [];
  const awayStats = statistics.find(s => s.team?.id === match.awayId)?.statistics || [];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1a', color: '#f8fafc', padding: '24px 16px', paddingBottom: '60px' }}>
      <SEO 
        title={title}
        description={description}
        keywords={`${homeName} vs ${awayName}, ${homeName} live score, ${awayName} live score, ${leagueName} predictions`}
        path={`/match/${matchId}/${slug}`}
        structuredData={structuredData}
      />
      
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <Link 
          to="/mastergames" 
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px', 
            color: '#94a3b8', 
            fontWeight: 700, 
            marginBottom: '24px', 
            textDecoration: 'none',
            background: 'rgba(255,255,255,0.05)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          <ArrowLeft size={16} /> Back to Fixtures
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <p style={{ color: '#94a3b8', fontSize: '.75rem', marginTop: '0', marginBottom: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {leagueName}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}>{homeName}</h1>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: isLive ? '#ef4444' : isFin ? '#10b981' : '#fff' }}>
                {match.homeScore ?? 0} - {match.awayScore ?? 0}
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}>{awayName}</h1>
            </div>
          </div>
          <div style={{ marginTop: '12px', display: 'inline-block', padding: '4px 12px', borderRadius: '6px', fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', background: isLive ? 'rgba(239,68,68,0.15)' : isFin ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.06)', color: isLive ? '#ef4444' : isFin ? '#10b981' : '#94a3b8' }}>
            {isLive ? `LIVE ${match.minute ? `(${match.minute}')` : ''}` : isFin ? 'Finished' : formatTime(match.date)}
          </div>
        </div>

        {/* Match Info Bar */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '24px', fontSize: '.75rem', color: '#64748b' }}>
          {match.date && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> {new Date(match.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
          {match.venue?.name && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {match.venue.name}</span>}
          {match.referee && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={12} /> {match.referee}</span>}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { key: 'timeline', label: 'Timeline', icon: Clock },
            { key: 'lineups', label: 'Lineups', icon: Users },
            { key: 'stats', label: 'Stats', icon: BarChart3 }
          ].map(t => (
            <button 
              key={t.key} 
              onClick={() => setActiveTab(t.key)}
              style={{ 
                flex: 1, 
                padding: '10px', 
                borderRadius: '8px', 
                border: 'none', 
                background: activeTab === t.key ? '#10b981' : 'transparent', 
                color: activeTab === t.key ? '#fff' : '#94a3b8', 
                fontWeight: 700, 
                fontSize: '.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ background: 'rgba(30,41,59,0.4)', backdropFilter: 'blur(12px)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          
          {/* TIMELINE TAB */}
          {activeTab === 'timeline' && (
            <div>
              {events.length > 0 ? (
                events.map((e, i) => {
                  const isHome = e.team?.id === match.homeId;
                  const icon = e.type === 'Goal' ? '⚽' : e.detail?.includes('Red') ? '🟥' : e.detail?.includes('Yellow') ? '🟨' : e.type === 'subst' ? '🔄' : '⚠️';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', flexDirection: isHome ? 'row' : 'row-reverse', textAlign: isHome ? 'left' : 'right' }}>
                      <div style={{ fontWeight: 800, color: '#94a3b8', width: '40px', fontSize: '.85rem' }}>
                        {e.time?.elapsed}'
                      </div>
                      <div style={{ fontSize: '1.2rem' }}>{icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#fff', fontSize: '.9rem' }}>{e.player?.name || 'Unknown'}</div>
                        <div style={{ fontSize: '.75rem', color: '#64748b' }}>{e.detail || e.type}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>No events recorded yet.</div>
              )}
            </div>
          )}

          {/* LINEUPS TAB */}
          {activeTab === 'lineups' && (
            <div>
              {homeLineup && awayLineup ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  {[homeLineup, awayLineup].map((lineup, idx) => (
                    <div key={idx}>
                      <h3 style={{ fontSize: '.9rem', fontWeight: 800, color: '#10b981', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
                        {lineup.team?.name} ({lineup.formation})
                      </h3>
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Starting XI</div>
                        {lineup.startXI?.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '.85rem', color: '#fff' }}>
                            <span style={{ width: '20px', height: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700 }}>{p.player?.number}</span>
                            {p.player?.name}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: '.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Substitutes</div>
                        {lineup.substitutes?.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '.85rem', color: '#94a3b8' }}>
                            <span style={{ width: '20px', height: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700 }}>{p.player?.number}</span>
                            {p.player?.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>Lineups are not available yet.</div>
              )}
            </div>
          )}

          {/* STATS TAB */}
          {activeTab === 'stats' && (
            <div>
              {homeStats.length > 0 ? (
                homeStats.map((stat, i) => {
                  const homeVal = stat.value;
                  const awayVal = awayStats[i]?.value;
                  
                  const parseVal = (v) => {
                    if (!v) return 0;
                    if (v.includes('%')) return parseInt(v);
                    const num = parseInt(v);
                    return isNaN(num) ? 0 : num;
                  };
                  
                  const hNum = parseVal(homeVal);
                  const aNum = parseVal(awayVal);
                  const total = hNum + aNum;
                  const hPct = total > 0 ? (hNum / total) * 100 : 50;
                  const aPct = total > 0 ? (aNum / total) * 100 : 50;

                  return (
                    <div key={i} style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '.8rem', fontWeight: 700, color: '#fff' }}>
                        <span>{homeVal || '-'}</span>
                        <span style={{ color: '#64748b' }}>{stat.type}</span>
                        <span>{awayVal || '-'}</span>
                      </div>
                      <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                        <div style={{ width: `${hPct}%`, background: '#10b981', transition: 'width 0.3s' }}></div>
                        <div style={{ width: `${aPct}%`, background: '#ef4444', transition: 'width 0.3s' }}></div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>Statistics are not available yet.</div>
              )}
            </div>
          )}
        </div>

        {/* Prediction CTA */}
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <Link 
            to="/predictions" 
            style={{ 
              display: 'inline-block', 
              padding: '12px 32px', 
              background: '#10b981', 
              color: '#fff', 
              borderRadius: '10px', 
              fontWeight: 800, 
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
            }}
          >
            Make Predictions
          </Link>
        </div>
      </div>
    </div>
  );
}