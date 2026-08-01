import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Zap, TrendingUp, Camera, Clock, Trophy, Tv, BarChart3, MapPin } from 'lucide-react';
import SEO from '../components/SEO';
import { useFixtures, useStandings } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr, formatTime } from '../utils/dates';
import { buildMatchRoute, buildTeamRoute, buildLeagueRoute } from '../utils/routes';
import { applySmartMinute } from '../engine/matchEngine'; 
import { useState, useEffect, useRef, useMemo } from 'react';

function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

const LEAGUE_BROADCASTERS = {
  '39': [{ name: 'Peacock', color: '#000000', url: 'https://www.peacocktv.com' }, { name: 'Sky Sports', color: '#0072c6', url: 'https://www.skysports.com' }],
  '140': [{ name: 'ESPN+', color: '#d00d1e', url: 'https://www.espn.com' }, { name: 'beIN SPORTS', color: '#fa9000', url: 'https://www.beinsports.com' }],
};

const FALLBACK_BROADCASTERS = [{ name: 'FIFA+', color: '#dd2848', url: 'https://www.plus.fifa.com' }, { name: 'UEFA.tv', color: '#00349e', url: 'https://www.uefa.tv' }];

export default function MatchDetails() {
  const { matchId } = useParams();
  const now = useNow(10000);
  
  const { data: todayFx = [] } = useFixtures(todayStr());
  const { data: yestFx = [] } = useFixtures(getLocalDateStr(-1));
  const { data: tomFx = [] } = useFixtures(getLocalDateStr(1));

  const match = useMemo(() => {
    const all = [...todayFx, ...tomFx, ...yestFx];
    const found = all.find(m => String(m.id) === String(matchId));
    return found ? applySmartMinute(found, now) : null;
  }, [todayFx, yestFx, tomFx, matchId, now]);

  const standingsLeagueId = match?.leagueId;
  const { data: standingsData } = useStandings(standingsLeagueId);
  const standingsTable = standingsData?.standings?.[0] || [];

  const [goalFlash, setGoalFlash] = useState(false);
  const prevScore = useRef({ home: match?.homeScore, away: match?.awayScore });

  useEffect(() => {
    if (match && match.homeScore != null && match.awayScore != null) {
      if (match.homeScore !== prevScore.current.home || match.awayScore !== prevScore.current.away) {
        setGoalFlash(true);
        const timer = setTimeout(() => setGoalFlash(false), 2000);
        prevScore.current = { home: match.homeScore, away: match.awayScore };
        return () => clearTimeout(timer);
      }
    } else if (match) {
      prevScore.current = { home: match.homeScore, away: match.awayScore };
    }
  }, [match]);

  if (match?.isHidden) {
    return (
      <div className="zoka-page flex-center p-32">
        <div className="glass-card flex-col items-center text-center p-32 gap-12">
          <Clock size={32} className="text-gold" />
          <h2 className="text-primary">Match Temporarily Unavailable</h2>
          <p className="text-muted">We are waiting for the final confirmation from the data provider.</p>
          <Link to="/fixtures" className="btn btn-ghost"><ArrowLeft size={14} /> Back to Fixtures</Link>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="zoka-page flex-center p-32">
        <div className="flex-col gap-16 w-full max-w-800">
          <div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 24 }} />
          <div className="skeleton" style={{ width: '100%', height: 100, borderRadius: 16 }} />
        </div>
      </div>
    );
  }

  const { homeName, awayName, homeLogo, awayLogo, leagueName, leagueLogo, date, leagueId, category, kickoff, status, isLive, isFinished, isHT, minute, displayMinute, homeScore, awayScore, venue, stats } = match;
  
  const matchLink = buildMatchRoute(match.id, homeName, awayName);
  const timelineProgress = isFinished ? 100 : isHT ? 50 : displayMinute ? Math.min((displayMinute / 90) * 100, 100) : 0;
  
  const broadcasters = LEAGUE_BROADCASTERS[String(leagueId)] || FALLBACK_BROADCASTERS;
  const hasRealStats = stats && (stats.possession || stats.shots || stats.corners);

  // Mock Form & Probability for Pro UI
  const homeForm = ['W', 'W', 'D', 'L', 'W'];
  const awayForm = ['L', 'D', 'W', 'W', 'D'];
  const homeProb = 45, drawProb = 30, awayProb = 25;

  const matchStatus = String(status || '').toUpperCase();
  const isPostponed = matchStatus === 'PST' || matchStatus === 'POSTP';
  const isCanceled = matchStatus === 'CANC' || matchStatus === 'ABD';
  const isSpecialStatus = isPostponed || isCanceled;

  let statusLabel = kickoff;
  let statusClass = 'status-upcoming';
  if (isLive && !isHT) { statusLabel = `LIVE ${displayMinute || minute || 0}'`; statusClass = 'status-live'; }
  else if (isHT) { statusLabel = 'HALF TIME'; statusClass = 'status-ht'; }
  else if (isFinished) { statusLabel = 'FULL TIME'; statusClass = 'status-ft'; }
  else if (isPostponed) { statusLabel = 'POSTPONED'; statusClass = 'status-ht'; }

  return (
    <div className="md-page">
      <SEO
        title={`${homeName} vs ${awayName} | Live Scores, Predictions & Stats`}
        description={`Follow ${homeName} vs ${awayName} live on ZOKASCORE. Get real-time scores, match statistics, predictions, and standings updates.`}
        path={matchLink}
        robots="index,follow"
         />
      
      <div className="md-container">
        <Link to="/fixtures" className="btn btn-ghost btn-sm mb-16">
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        {/* Premium Header Card */}
        <div className={`md-header-card ${goalFlash ? 'goal-flash' : ''}`}>
          {goalFlash && (
            <div className="absolute inset-0 flex-center pointer-events-none">
              <span className="text-5xl" style={{ animation: 'zk-confetti 1.5s ease-out forwards' }}>🎉</span>
            </div>
          )}
          
          <div className="flex-center gap-8 mb-24">
            {leagueLogo && <img src={leagueLogo} alt="" width="20" height="20" />}
            <Link to={buildLeagueRoute(leagueId, leagueName)} className="text-muted font-bold text-sm hover:text-primary">{leagueName}</Link>
            {category === 'FEATURED' && <span className="badge badge-gold">★ TOP MATCH</span>}
          </div>
          
          <div className="md-teams">
            <Link to={buildTeamRoute(match.homeTeamId, homeName)} className="md-team">
              {homeLogo && <img src={homeLogo} alt={homeName} />}
              <h1 className="md-team-name">{homeName}</h1>
            </Link>
            
            <div className="md-score-block">
              <div className={`md-score ${isLive ? 'live' : ''} ${goalFlash ? 'pop' : ''}`}>
                {(isLive || isHT || isFinished) ? `${homeScore ?? '-'} : ${awayScore ?? '-'}` : 'VS'}
              </div>
              <div className={`status-badge ${statusClass}`}>
                {isLive && !isHT && !isSpecialStatus && <span className="zk-live-pulse-dot mr-2" />}
                {statusLabel}
              </div>
            </div>

            <Link to={buildTeamRoute(match.awayTeamId, awayName)} className="md-team">
              {awayLogo && <img src={awayLogo} alt={awayName} />}
              <h1 className="md-team-name">{awayName}</h1>
            </Link>
          </div>

          {(isLive || isFinished) && !isSpecialStatus && (
            <div className="md-timeline">
              <div className="md-timeline-fill" style={{ width: `${timelineProgress}%` }}>
                {isLive && <div className="md-timeline-dot" style={{ left: '100%' }} />}
              </div>
              <div className="flex-between text-muted text-xs mt-8">
                <span>0'</span><span>45'</span><span>90'</span>
              </div>
            </div>
          )}
        </div>

        {/* Pro Grid: Form & Probability */}
        <div className="md-pro-grid">
          <div className="glass-card p-20 flex-col gap-12">
            <h3 className="text-muted text-xs font-bold uppercase flex-center gap-4"><TrendingUp size={12} /> Recent Form</h3>
            <div className="flex-center gap-12">
              <div className="flex gap-4">{homeForm.map((f, i) => <div key={i} className={`form-pill form-${f.toLowerCase()}`}>{f}</div>)}</div>
              <span className="text-muted text-xs">vs</span>
              <div className="flex gap-4">{awayForm.map((f, i) => <div key={i} className={`form-pill form-${f.toLowerCase()}`}>{f}</div>)}</div>
            </div>
          </div>
          <div className="glass-card p-20 flex-col gap-8">
            <h3 className="text-muted text-xs font-bold uppercase flex-center gap-4"><Zap size={12} /> Win Probability</h3>
            <div className="flex h-8 rounded-md overflow-hidden bg-elevated">
              <div style={{ width: `${homeProb}%`, background: 'var(--primary)' }} className="flex-center text-xs font-bold text-inverse">{homeProb}%</div>
              <div style={{ width: `${drawProb}%`, background: 'var(--text-muted)' }} className="flex-center text-xs font-bold text-inverse">{drawProb}%</div>
              <div style={{ width: `${awayProb}%`, background: 'var(--danger)' }} className="flex-center text-xs font-bold text-inverse">{awayProb}%</div>
            </div>
          </div>
        </div>

        {/* Stats / Info */}
        {hasRealStats ? (
          <div className="glass-card p-24 mb-24">
            <h2 className="text-primary font-bold flex-center gap-8 mb-16"><BarChart3 size={18} /> Match Statistics</h2>
            <div className="flex-col gap-16">
              {stats.possession && (
                <div className="flex-col gap-4">
                  <div className="flex-between text-primary font-bold text-sm"><span>{stats.possession.home}%</span><span className="text-muted text-xs">Possession</span><span>{stats.possession.away}%</span></div>
                  <div className="flex h-6 rounded-md overflow-hidden bg-elevated">
                    <div style={{ width: `${stats.possession.home}%`, background: 'var(--primary)' }}></div>
                    <div style={{ width: `${stats.possession.away}%`, background: 'var(--danger)' }}></div>
                  </div>
                </div>
              )}
              {stats.shots && <div className="flex-between text-primary font-bold text-sm"><span>{stats.shots.home}</span><span className="text-muted text-xs">Shots</span><span>{stats.shots.away}</span></div>}
            </div>
          </div>
        ) : (
          <div className="glass-card p-16 mb-24 flex-center gap-16 flex-wrap text-muted font-bold text-sm">
            {date && <span className="flex-center gap-4"><Calendar size={14} /> {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {formatTime(date)}</span>}
            {venue?.name && <span className="flex-center gap-4"><MapPin size={14} /> {venue.name}</span>}
          </div>
        )}

        {/* Watch & React */}
        {!isSpecialStatus && (
          <div className="grid gap-16 mb-24" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="glass-card p-20 flex-col gap-12">
              <h3 className="text-primary font-bold flex-center gap-8"><Tv size={16} /> Where to Watch</h3>
              <div className="flex gap-8 flex-wrap">
                {broadcasters.map(p => (
                  <a key={p.name} href={p.url} target="_blank" rel="noreferrer" className="badge" style={{ borderColor: `${p.color}40`, background: `${p.color}10`, color: p.color, padding: '8px 12px' }}>
                    {p.name}
                  </a>
                ))}
              </div>
            </div>
            <div className="glass-card p-20 flex-col gap-12 justify-center">
              <Link to="/studio/reactor" state={{ fixtureId: match.id, homeTeam: homeName, awayTeam: awayName }} className="btn btn-primary w-full">
                <Camera size={16} /> React in Studio
              </Link>
            </div>
          </div>
        )}

        {/* Standings */}
        {standingsTable.length > 0 && (
          <div className="glass-card p-24">
            <h2 className="text-primary font-bold flex-center gap-8 mb-16"><Trophy size={18} /> League Standings</h2>
            <div className="flex-col gap-4">
              {standingsTable.slice(0, 5).map((team, i) => (
                <div key={team.team?.id || team.rank} className="flex-between p-8 hover:bg-card-hover rounded-md">
                  <span className="text-muted font-bold w-8">{team.rank || i + 1}</span>
                  <Link to={buildTeamRoute(team.team?.id, team.team?.name)} className="flex-center gap-8 text-primary font-bold flex-1">
                    {team.team?.logo && <img src={team.team?.logo} alt="" width="18" height="18" />}
                    {team.team?.name || 'TBD'}
                  </Link>
                  <span className="text-primary font-extrabold">{team.points} <small className="text-muted">pts</small></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}