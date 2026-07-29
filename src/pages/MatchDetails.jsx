import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Loader } from 'lucide-react';
import SEO from '../components/SEO';
import { useEngineGlobalMatches, useEngineStandings } from '../zokascore_engine/hooks';
import { formatTime } from '../utils/dates';

export default function MatchDetails() {
  const { matchId } = useParams();
  const { data: allMatches = [], isLoading } = useEngineGlobalMatches();

  const match = allMatches.find(m => String(m.id) === String(matchId));

  if (isLoading) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Loader size={32} className="animate-spin" style={{ color: '#fff' }} /></div>;
  }

  if (!match) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <SEO title="Match Not Found | ZOKASCORE" />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: 12 }}>Match Not Found</h1>
        <Link to="/fixtures" style={{ color: '#10b981', textDecoration: 'none', fontWeight: 700 }}>Back to Fixtures</Link>
      </div>
    );
  }

  const { homeName, awayName, homeLogo, awayLogo, leagueName, leagueLogo, date, display, leagueId } = match;
  const { isLive, isFinished, isHalfTime, minute, score, status } = display;

  // Fetch standings for this league
  const { data: standingsData } = useEngineStandings(leagueId);
  const standingsTable = standingsData?.standings?.[0] || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: '#fff' }}>
      <SEO title={`${homeName} vs ${awayName} | ZOKASCORE`} />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 80px' }}>
        <Link to="/fixtures" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '.85rem', marginBottom: 20, background: 'var(--bg-card)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            {leagueLogo && <img src={leagueLogo} alt="" width="20" height="20" style={{objectFit:'contain'}} onError={(e) => e.target.style.display='none'} />}
            <span style={{ color: 'var(--text-muted)', fontSize: '.8rem', fontWeight: 700, textTransform: 'uppercase' }}>{leagueName}</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {homeLogo && <img src={homeLogo} alt={homeName} width="48" height="48" style={{objectFit:'contain'}} onError={(e) => e.target.style.display='none'} />}
              <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{homeName}</h1>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: isLive ? '#ef4444' : isFinished ? '#10b981' : '#fff' }}>
                {score?.display || 'VS'}
              </div>
              {isLive && !isHalfTime && (
                <div style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                  <span style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%', animation: 'pulse 1.5s infinite' }}></span> 
                  LIVE {minute}'
                </div>
              )}
              {isHalfTime && <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>HALF TIME</div>}
              {isFinished && <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700 }}>FULL TIME</div>}
              {!isLive && !isFinished && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{status}</div>}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {awayLogo && <img src={awayLogo} alt={awayName} width="48" height="48" style={{objectFit:'contain'}} onError={(e) => e.target.style.display='none'} />}
              <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{awayName}</h1>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 20, fontSize: '.8rem', color: 'var(--text-muted)' }}>
          {date && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {formatTime(date)}</span>}
        </div>

        {standingsTable.length > 0 && (
          <div className="md-info-card" style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <h2 className="md-info-title" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={18} style={{ color: '#fbbf24' }} /> League Standings
            </h2>
            <div className="standings-mini">
              {standingsTable.slice(0, 5).map((team, i) => (
                <div key={team.team?.id || team.rank} className="standing-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 700, width: 24 }}>{team.rank || i + 1}.</span>
                  <span style={{ flex: 1, marginLeft: 10, color: 'var(--text-primary)', fontWeight: 600, fontSize: '.9rem' }}>
                    {team.team?.name || 'TBD'}
                  </span>
                  <span style={{ color: '#10b981', fontWeight: 800, fontSize: '.9rem' }}>{team.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}